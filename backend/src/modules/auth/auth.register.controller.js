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
const { registerLimiter, verificationLimiter } = require('./auth.constants')
const {
  AppError,
  validateRegistrationInput,
  sendVerificationCodeEmail,
  issueAuthenticatedSession,
  handleAuthError,
} = require('./auth.service')

const router = express.Router()

/* ── Direct registration (no email verification) ────────────────────────
 * Creates account in a single step: validate fields -> create user -> issue session.
 * School/course selection is deferred to /my-courses (post-signup).
 * ─────────────────────────────────────────────────────────────────────── */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, email, password, accountType } = validateRegistrationInput(req.body || {})

    const existingUsername = await prisma.user.findUnique({ where: { username }, select: { id: true } })
    if (existingUsername) {
      return res.status(409).json({ error: 'That username is already taken.' })
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (existingEmail) {
        return res.status(409).json({ error: 'That email is already in use.' })
      }
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const createdUser = await prisma.user.create({
      data: {
        username,
        passwordHash,
        email,
        accountType,
        emailVerified: false,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
      },
      select: { id: true },
    })

    const user = await issueAuthenticatedSession(res, createdUser.id)
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
      return res.status(400).json({ error: 'Email is required for the verified registration flow.' })
    }

    const [existingUsername, existingEmail] = await Promise.all([
      prisma.user.findUnique({ where: { username }, select: { id: true } }),
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ])

    if (existingUsername) {
      return res.status(409).json({ error: 'That username is already taken.' })
    }
    if (existingEmail) {
      return res.status(409).json({ error: 'That email is already in use.' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const { challenge, code } = await createSignupChallenge({ username, email, passwordHash, accountType })

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

      const createdUser = await tx.user.create({
        data: {
          username: challenge.username,
          passwordHash: challenge.passwordHash,
          email: challenge.email,
          accountType: challenge.payload?.accountType || 'student',
          emailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpiry: null,
        },
        select: { id: true },
      })

      await tx.verificationChallenge.deleteMany({
        where: { id: challenge.id },
      })

      return createdUser.id
    })

    const user = await issueAuthenticatedSession(res, createdUserId)
    res.status(201).json({
      message: 'Account created!',
      user,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

module.exports = router
