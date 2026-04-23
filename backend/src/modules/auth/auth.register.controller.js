const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../../lib/prisma')
const {
  VERIFICATION_PURPOSE,
  consumeChallenge,
  createSignupChallenge,
  findChallengeByToken,
  mapChallengeForClient,
  resendSignupChallenge,
  verifyChallengeCode,
} = require('../../lib/verification/verificationChallenges')
const { TRUST_LEVELS } = require('../../lib/trustGate')
const { registerLimiter, verificationLimiter } = require('./auth.constants')
const {
  AppError,
  validateRegistrationInput,
  sendVerificationCodeEmail,
  issueAuthenticatedSession,
  handleAuthError,
} = require('./auth.service')
const {
  CURRENT_LEGAL_VERSION,
  LEGAL_ACCEPTANCE_SOURCES,
  recordCurrentRequiredLegalAcceptancesTx,
} = require('../legal/legal.service')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')

const router = express.Router()

/* ── Direct registration (no email verification) ────────────────────────
 * Creates account in a single step: validate fields -> create user -> issue session.
 * School/course selection is deferred to /my-courses (post-signup).
 * ─────────────────────────────────────────────────────────────────────── */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, email, password, accountType } = validateRegistrationInput(req.body || {})

    const existingUsername = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    })
    if (existingUsername) {
      return sendError(res, 409, 'That username is already taken.', ERROR_CODES.CONFLICT)
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (existingEmail) {
        return sendError(res, 409, 'That email is already in use.', ERROR_CODES.CONFLICT)
      }
    }

    // Phase 5: check password against HIBP breached-password database.
    // Non-blocking on API failure (graceful degradation).
    try {
      const { checkPasswordBreach } = require('../../lib/passwordSafety')
      const breach = await checkPasswordBreach(password)
      if (breach.breached) {
        return sendError(
          res,
          400,
          `This password has appeared in ${breach.count.toLocaleString()} data breaches. Please choose a different password.`,
          'BREACHED_PASSWORD',
        )
      }
    } catch {
      // HIBP unreachable — allow registration to proceed
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const acceptedAt = new Date()
    const createdUser = await prisma.$transaction(async (tx) => {
      const createdUserRecord = await tx.user.create({
        data: {
          username,
          passwordHash,
          email,
          accountType,
          emailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpiry: null,
          trustLevel: TRUST_LEVELS.TRUSTED,
          trustedAt: new Date(),
          termsAcceptedVersion: CURRENT_LEGAL_VERSION,
          termsAcceptedAt: acceptedAt,
        },
        select: { id: true },
      })

      await recordCurrentRequiredLegalAcceptancesTx(tx, createdUserRecord.id, {
        acceptedAt,
        source: LEGAL_ACCEPTANCE_SOURCES.REGISTER,
      })

      return createdUserRecord
    })

    // Attach referral if a ref code was provided (best-effort)
    if (req.body.ref) {
      try {
        const { attachReferral } = require('../referrals/referrals.service')
        await attachReferral(req.body.ref, createdUser.id, req.ip)
      } catch {
        // best-effort -- do not break registration
      }
    }

    const user = await issueAuthenticatedSession(res, createdUser.id, req)
    res.status(201).json({
      message: 'Account created!',
      user,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

router.post('/register/start', registerLimiter, async (req, res) => {
  try {
    const { username, email, password, accountType } = validateRegistrationInput(req.body || {})

    if (!email) {
      return sendError(
        res,
        400,
        'Email is required for the verified registration flow.',
        ERROR_CODES.VALIDATION,
      )
    }

    const [existingUsername, existingEmail] = await Promise.all([
      prisma.user.findUnique({ where: { username }, select: { id: true } }),
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ])

    if (existingUsername) {
      return sendError(res, 409, 'That username is already taken.', ERROR_CODES.CONFLICT)
    }
    if (existingEmail) {
      return sendError(res, 409, 'That email is already in use.', ERROR_CODES.CONFLICT)
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const { challenge, code } = await createSignupChallenge({
      username,
      email,
      passwordHash,
      payload: {
        accountType,
        acceptedLegalVersion: CURRENT_LEGAL_VERSION,
      },
    })

    try {
      await sendVerificationCodeEmail(challenge.email, challenge.username, code, {
        route: req.originalUrl,
        method: req.method,
        purpose: VERIFICATION_PURPOSE.SIGNUP,
      })
    } catch (error) {
      await consumeChallenge(challenge.id)
      throw error
    }

    res.status(201).json(mapChallengeForClient(challenge))
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

router.post('/register/verify', verificationLimiter, async (req, res) => {
  const body = req.body || {}
  try {
    const challenge = await verifyChallengeCode(
      body.verificationToken,
      VERIFICATION_PURPOSE.SIGNUP,
      body.code,
    )

    res.json({
      verified: true,
      verificationToken: challenge.token,
      nextStep: 'complete',
      expiresAt: challenge.expiresAt,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

router.post('/register/resend', verificationLimiter, async (req, res) => {
  const body = req.body || {}
  try {
    const { challenge, code } = await resendSignupChallenge(body.verificationToken)
    await sendVerificationCodeEmail(challenge.email, challenge.username, code, {
      route: req.originalUrl,
      method: req.method,
      purpose: VERIFICATION_PURPOSE.SIGNUP,
    })
    res.json(mapChallengeForClient(challenge))
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

router.post('/register/complete', registerLimiter, async (req, res) => {
  const body = req.body || {}

  try {
    const challenge = await findChallengeByToken(
      body.verificationToken,
      VERIFICATION_PURPOSE.SIGNUP,
    )

    if (!challenge.verifiedAt) {
      throw new AppError(400, 'Verify your email before completing registration.')
    }
    if (challenge.payload?.acceptedLegalVersion !== CURRENT_LEGAL_VERSION) {
      throw new AppError(
        409,
        'Our legal documents were updated. Please restart registration and review the latest version.',
      )
    }

    // School/course selection is no longer part of registration.
    // Users can personalize later via /my-courses.
    const createdUserId = await prisma.$transaction(async (tx) => {
      const [existingUsername, existingEmail] = await Promise.all([
        tx.user.findUnique({
          where: { username: challenge.username },
          select: { id: true },
        }),
        tx.user.findUnique({
          where: { email: challenge.email },
          select: { id: true },
        }),
      ])

      if (existingUsername) {
        throw new AppError(409, 'That username is already taken.')
      }
      if (existingEmail) {
        throw new AppError(409, 'That email is already in use.')
      }

      const acceptedAt = new Date()
      const createdUser = await tx.user.create({
        data: {
          username: challenge.username,
          passwordHash: challenge.passwordHash,
          email: challenge.email,
          accountType: challenge.payload?.accountType || 'student',
          emailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpiry: null,
          trustLevel: TRUST_LEVELS.TRUSTED,
          trustedAt: new Date(),
          termsAcceptedVersion: CURRENT_LEGAL_VERSION,
          termsAcceptedAt: acceptedAt,
        },
        select: { id: true },
      })

      await recordCurrentRequiredLegalAcceptancesTx(tx, createdUser.id, {
        acceptedAt,
        source: LEGAL_ACCEPTANCE_SOURCES.REGISTER,
      })

      await tx.verificationChallenge.deleteMany({
        where: { id: challenge.id },
      })

      return createdUser.id
    })

    // Attach referral if a ref code was provided (best-effort)
    if (body.ref) {
      try {
        const { attachReferral } = require('../referrals/referrals.service')
        await attachReferral(body.ref, createdUserId, req.ip)
      } catch {
        // best-effort -- do not break registration
      }
    }

    const user = await issueAuthenticatedSession(res, createdUserId, req)
    res.status(201).json({
      message: 'Account created!',
      user,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

module.exports = router
