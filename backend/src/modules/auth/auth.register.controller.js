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
} = require('../../lib/verificationChallenges')
const { registerLimiter, verificationLimiter } = require('./auth.constants')
const {
  AppError,
  parseOptionalInteger,
  parseCourseIds,
  parseCustomCourses,
  resolveCourseIds,
  validateCourses,
  validateRegistrationInput,
  sendVerificationCodeEmail,
  issueAuthenticatedSession,
  handleAuthError,
} = require('./auth.service')

const router = express.Router()

/* ── Direct registration (no email verification) ────────────────────────
 * Creates account in a single step: validate fields -> create user -> issue session.
 * Email is stored but not verified at signup time. Google handles its own
 * verification, and local users can verify later via settings.
 *
 * Flow:
 * 1. POST /api/auth/register { username, email, password, confirmPassword, termsAccepted }
 *    -> 201 { user, message: 'Account created!' }
 *
 * 2. Frontend then shows course selection step, which calls:
 *    PATCH /api/settings/courses { schoolId, courseIds, customCourses }
 *    (using the auth token from step 1)
 * ─────────────────────────────────────────────────────────────────────── */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, email, password } = validateRegistrationInput(req.body || {})

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
    const { username, email, password } = validateRegistrationInput(req.body || {})

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
    const { challenge, code } = await createSignupChallenge({ username, email, passwordHash })

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
      nextStep: 'courses',
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
      throw new AppError(400, 'Verify your email before choosing courses and completing registration.')
    }

    const parsedSchoolId = parseOptionalInteger(body.schoolId, 'schoolId')
    const parsedCourseIds = parseCourseIds(body.courseIds)
    const parsedCustomCourses = parseCustomCourses(body.customCourses)

    if (parsedCustomCourses.length > 0 && parsedSchoolId === null) {
      throw new AppError(400, 'Please select a school before adding custom courses.')
    }

    await validateCourses(parsedCourseIds, parsedSchoolId)

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
          emailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpiry: null,
        },
        select: { id: true },
      })

      const resolvedCourseIds = await resolveCourseIds(
        tx,
        parsedCourseIds,
        parsedCustomCourses,
        parsedSchoolId,
      )

      if (resolvedCourseIds.length > 0) {
        await tx.enrollment.createMany({
          data: resolvedCourseIds.map((courseId) => ({
            userId: createdUser.id,
            courseId,
          })),
          skipDuplicates: true,
        })
      }

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
