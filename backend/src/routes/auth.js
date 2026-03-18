const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const rateLimit = require('express-rate-limit')
const { captureError } = require('../monitoring/sentry')
const {
  sendEmailVerification,
  sendPasswordReset,
} = require('../lib/email')
const {
  clearAuthCookie,
  hashStoredSecret,
  setAuthCookie,
  signAuthToken,
  signCsrfToken,
} = require('../lib/authTokens')
const { generateSixDigitCode, maskEmailAddress } = require('../lib/verificationCodes')
const {
  VERIFICATION_PURPOSE,
  VerificationError,
  consumeChallenge,
  createOrRefreshLoginChallenge,
  createSignupChallenge,
  findChallengeByToken,
  mapChallengeForClient,
  resendSignupChallenge,
  sendOrRefreshLoginChallenge,
  verifyChallengeCode,
} = require('../lib/verificationChallenges')
const { isValidEmailAddress } = require('../lib/emailValidation')
const {
  verifyGoogleIdToken,
  findUserByGoogleId,
  findUserByEmail,
  isGoogleOAuthEnabled,
} = require('../lib/googleAuth')
const prisma = require('../lib/prisma')

const requireAuth = require('../middleware/auth')

const router = express.Router()

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const PASSWORD_MIN_LENGTH = 8
const COURSE_CODE_REGEX = /^[A-Z0-9-]{2,20}$/

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: { error: 'Too many verification attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const logoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})

class AppError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

function parseOptionalInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') return null
  const parsedValue = Number(value)
  if (!Number.isInteger(parsedValue)) throw new AppError(400, `${fieldName} must be an integer.`)
  return parsedValue
}

function parseCourseIds(courseIds) {
  if (courseIds === undefined || courseIds === null) return []
  if (!Array.isArray(courseIds)) throw new AppError(400, 'courseIds must be an array of integers.')
  const parsedCourseIds = courseIds.map((courseId) => Number(courseId))
  if (parsedCourseIds.some((courseId) => !Number.isInteger(courseId))) {
    throw new AppError(400, 'courseIds must contain only integer values.')
  }
  return [...new Set(parsedCourseIds)]
}

function parseCustomCourses(customCourses) {
  if (customCourses === undefined || customCourses === null) return []
  if (!Array.isArray(customCourses)) throw new AppError(400, 'customCourses must be an array.')
  if (customCourses.length > 10) throw new AppError(400, 'You can add up to 10 custom courses.')

  const parsedCourses = customCourses.map((course, index) => {
    if (!course || typeof course !== 'object') {
      throw new AppError(400, `customCourses[${index}] must be an object.`)
    }

    const code = typeof course.code === 'string' ? course.code.trim().toUpperCase() : ''
    const name = typeof course.name === 'string' ? course.name.trim() : ''

    if (!code || !name) throw new AppError(400, 'Each custom course must include both code and name.')
    if (!COURSE_CODE_REGEX.test(code)) {
      throw new AppError(400, 'Custom course code must be 2-20 characters (A-Z, 0-9, or -).')
    }
    if (name.length < 2 || name.length > 120) {
      throw new AppError(400, 'Custom course name must be between 2 and 120 characters.')
    }

    return { code, name }
  })

  const uniqueByCode = new Map()
  parsedCourses.forEach((course) => {
    if (!uniqueByCode.has(course.code)) uniqueByCode.set(course.code, course)
  })
  return Array.from(uniqueByCode.values())
}

async function resolveCourseIds(tx, courseIds, customCourses, schoolId) {
  const resolvedCourseIds = [...courseIds]
  if (customCourses.length === 0) return [...new Set(resolvedCourseIds)]
  if (schoolId === null) throw new AppError(400, 'schoolId is required when adding custom courses.')

  for (const customCourse of customCourses) {
    const existingCourse = await tx.course.findFirst({
      where: { schoolId, code: { equals: customCourse.code, mode: 'insensitive' } },
      select: { id: true },
    })

    if (existingCourse) {
      resolvedCourseIds.push(existingCourse.id)
      continue
    }

    const createdCourse = await tx.course.create({
      data: { schoolId, code: customCourse.code, name: customCourse.name },
      select: { id: true },
    })
    resolvedCourseIds.push(createdCourse.id)
  }

  return [...new Set(resolvedCourseIds)]
}

async function validateCourses(courseIds, schoolId) {
  if (schoolId !== null) {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    })
    if (!school) {
      throw new AppError(400, 'The selected school was not found.')
    }
  }

  if (courseIds.length === 0) return

  const where = { id: { in: courseIds } }
  if (schoolId !== null) where.schoolId = schoolId
  const courses = await prisma.course.findMany({ where, select: { id: true } })
  if (courses.length !== courseIds.length) {
    throw new AppError(400, 'One or more provided courseIds are invalid for the selected school.')
  }
}

function normalizeEmail(value, allowEmpty = false) {
  const normalizedEmail = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!normalizedEmail) {
    if (allowEmpty) return ''
    throw new AppError(400, 'Email is required.')
  }
  if (!isValidEmailAddress(normalizedEmail)) {
    throw new AppError(400, 'Please enter a valid email address.')
  }
  return normalizedEmail
}

function validateRegistrationInput({ username, email, password, confirmPassword, termsAccepted }) {
  const normalizedUsername = typeof username === 'string' ? username.trim() : ''
  if (!normalizedUsername) throw new AppError(400, 'Username is required.')
  if (!USERNAME_REGEX.test(normalizedUsername)) {
    throw new AppError(400, 'Username must be 3-20 characters using only letters, numbers, and underscores.')
  }

  /* Email is optional — users can add one later in Settings for password recovery. */
  const normalizedEmail = normalizeEmail(email, true)
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError(400, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  }
  if (!/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new AppError(400, 'Password must include at least one capital letter and one number.')
  }
  if (typeof confirmPassword === 'string' && password !== confirmPassword) {
    throw new AppError(400, 'Passwords do not match.')
  }
  if (!termsAccepted) {
    throw new AppError(400, 'You must accept the Terms of Use and Community Guidelines.')
  }

  return {
    username: normalizedUsername,
    email: normalizedEmail || null,
    password,
  }
}

async function getAuthenticatedUser(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      email: true,
      emailVerified: true,
      avatarUrl: true,
      authProvider: true,
      createdAt: true,
      enrollments: {
        include: {
          course: {
            include: { school: true },
          },
        },
      },
      _count: {
        select: {
          enrollments: true,
          studySheets: true,
          starredSheets: true,
        },
      },
    },
  })
}

function buildAuthenticatedUserPayload(user, extraFields = {}) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email ?? null,
    emailVerified: Boolean(user.emailVerified),
    avatarUrl: user.avatarUrl || null,
    authProvider: user.authProvider || 'local',
    createdAt: user.createdAt,
    enrollments: user.enrollments || [],
    counts: user._count
      ? {
          courses: user._count.enrollments || 0,
          sheets: user._count.studySheets || 0,
          stars: user._count.starredSheets || 0,
        }
      : undefined,
    ...extraFields,
    csrfToken: signCsrfToken(user),
  }
}

async function sendVerificationCodeEmail(email, username, code, metadata = {}) {
  try {
    await sendEmailVerification(email, username, code)
  } catch (error) {
    captureError(error, {
      source: 'sendEmailVerification',
      ...metadata,
    })
    throw new AppError(503, 'We could not send your verification code right now. Please try again later.')
  }
}

async function issueAuthenticatedSession(res, userId) {
  const user = await getAuthenticatedUser(userId)
  if (!user) throw new AppError(404, 'User not found.')

  const token = signAuthToken(user)
  setAuthCookie(res, token)
  return buildAuthenticatedUserPayload(user)
}

function loginVerificationResponse(challenge, overrides = {}) {
  return {
    requiresEmailVerification: true,
    ...mapChallengeForClient(challenge),
    emailHint: challenge.email ? maskEmailAddress(challenge.email) : '',
    ...overrides,
  }
}

function sendError(req, res, error) {
  if (error instanceof AppError || error instanceof VerificationError) {
    return res.status(error.statusCode).json({ error: error.message })
  }
  if (error && error.code === 'P2002') {
    return res.status(409).json({ error: 'That username or email is already taken.' })
  }
  captureError(error, { route: req.originalUrl, method: req.method })
  console.error(error)
  return res.status(500).json({ error: 'Server error. Please try again.' })
}

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

    /* Check for existing username or email (parallel queries for speed).
     * Skip email check when email is null (optional registration). */
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

    /* Hash password and create user in a single transaction */
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

    /* Issue authenticated session and return user payload */
    const user = await issueAuthenticatedSession(res, createdUser.id)
    res.status(201).json({
      message: 'Account created!',
      user,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.post('/register/start', registerLimiter, async (req, res) => {
  try {
    const { username, email, password } = validateRegistrationInput(req.body || {})

    /* This flow requires email for verification — reject if none provided */
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
    return sendError(req, res, error)
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
    return sendError(req, res, error)
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
    return sendError(req, res, error)
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
    return sendError(req, res, error)
  }
})

router.post('/login', loginLimiter, async (req, res) => {
  const body = req.body || {}
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!username || !password) {
    return res.status(400).json({ error: 'Please fill in both fields.' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return res.status(401).json({ error: 'Incorrect username or password.', showForgot: false })
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000)
      return res.status(429).json({
        error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
        locked: true,
        minutesLeft,
        showForgot: true,
      })
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)
    if (!isValidPassword) {
      const newFailedAttempts = user.failedAttempts + 1
      const shouldLock = newFailedAttempts >= 5
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: newFailedAttempts,
          lockedUntil: shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      })

      if (shouldLock) {
        return res.status(429).json({
          error: 'Too many failed attempts. Account locked for 15 minutes.',
          locked: true,
          minutesLeft: 15,
          showForgot: true,
        })
      }

      const attemptsLeft = 5 - newFailedAttempts
      return res.status(401).json({
        error: `Incorrect username or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
        showForgot: newFailedAttempts >= 1,
      })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    })

    /* Email verification gate removed in v1.5.0 — Google handles its own
     * verification, and local accounts no longer require verified email to log in.
     * The old verification challenge flow is preserved in the /login/verification/*
     * endpoints for backwards compatibility but is no longer triggered. */

    const authenticatedUser = await issueAuthenticatedSession(res, user.id)
    return res.json({
      message: 'Login successful!',
      user: authenticatedUser,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.post('/login/verification/send', verificationLimiter, async (req, res) => {
  const body = req.body || {}
  const providedEmail = typeof body.email === 'string' ? body.email : ''

  try {
    const challenge = await findChallengeByToken(
      body.verificationToken,
      VERIFICATION_PURPOSE.LOGIN_EMAIL,
    )

    const nextEmail = providedEmail ? normalizeEmail(providedEmail) : challenge.email
    if (!nextEmail) {
      throw new AppError(400, 'Enter your email address before requesting a verification code.')
    }

    const conflictingUser = await prisma.user.findFirst({
      where: {
        email: nextEmail,
        id: { not: challenge.userId || undefined },
      },
      select: { id: true },
    })
    if (conflictingUser) {
      return res.status(409).json({ error: 'That email is already in use by another account.' })
    }

    const refreshed = await sendOrRefreshLoginChallenge(
      body.verificationToken,
      nextEmail,
    )

    const refreshedChallenge = refreshed.challenge
    const user = refreshedChallenge.userId
      ? await prisma.user.findUnique({
          where: { id: refreshedChallenge.userId },
          select: { username: true },
        })
      : null

    await sendVerificationCodeEmail(
      refreshedChallenge.email,
      user?.username || refreshedChallenge.username || 'student',
      refreshed.code,
      {
        route: req.originalUrl,
        method: req.method,
        purpose: VERIFICATION_PURPOSE.LOGIN_EMAIL,
      },
    )

    res.json(loginVerificationResponse(refreshedChallenge, { codeSent: true }))
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.post('/login/verification/verify', verificationLimiter, async (req, res) => {
  const body = req.body || {}

  try {
    const challenge = await verifyChallengeCode(
      body.verificationToken,
      VERIFICATION_PURPOSE.LOGIN_EMAIL,
      body.code,
    )

    if (!challenge.userId) {
      throw new AppError(400, 'Verification session is invalid or has expired.')
    }
    if (!challenge.email) {
      throw new AppError(400, 'Enter your email address before verifying your code.')
    }

    const conflictingUser = await prisma.user.findFirst({
      where: {
        email: challenge.email,
        id: { not: challenge.userId },
      },
      select: { id: true },
    })
    if (conflictingUser) {
      return res.status(409).json({ error: 'That email is already in use by another account.' })
    }

    const updatedUser = await prisma.user.update({
      where: { id: challenge.userId },
      data: {
        email: challenge.email,
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
    })

    await consumeChallenge(challenge.id)

    const authenticatedUser = await issueAuthenticatedSession(res, updatedUser.id)
    res.json({
      message: 'Email verified successfully.',
      user: authenticatedUser,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const body = req.body || {}
  const username = typeof body.username === 'string' ? body.username.trim() : ''

  if (!username) {
    return res.json({
      message: 'If we have a verified email on file for that account, a reset link has been sent.',
    })
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } })

    if (user && user.email && user.emailVerified) {
      const token = crypto.randomBytes(32).toString('hex')
      const tokenHash = hashStoredSecret(token)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

      await prisma.passwordResetToken.upsert({
        where: { userId: user.id },
        create: { userId: user.id, token: tokenHash, expiresAt },
        update: { token: tokenHash, expiresAt },
      })

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`
      await sendPasswordReset(user.email, user.username, resetUrl)
    }

    return res.json({
      message: 'If we have a verified email on file for that account, a reset link has been sent.',
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    console.error(error)
    return res.json({
      message: 'If we have a verified email on file for that account, a reset link has been sent.',
    })
  }
})

router.post('/reset-password', forgotLimiter, async (req, res) => {
  const body = req.body || {}
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required.' })
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` })
  }

  try {
    const tokenHash = hashStoredSecret(token)
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    })

    if (!resetToken || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired. Please request a new one.' })
    }
    if (!resetToken.user.emailVerified || !resetToken.user.email) {
      return res.status(400).json({ error: 'Password reset requires a verified email address.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
      },
    })
    await prisma.passwordResetToken.delete({ where: { token: tokenHash } })

    return res.json({ message: 'Password updated successfully.' })
  } catch (error) {
    return sendError(req, res, error)
  }
})

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many Google sign-in attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/google', googleLimiter, async (req, res) => {
  const { credential, courseIds, schoolId, customCourses } = req.body || {}

  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required.' })
  }
  if (!isGoogleOAuthEnabled()) {
    return res.status(503).json({ error: 'Google sign-in is not available right now.' })
  }

  try {
    let googlePayload
    try {
      googlePayload = await verifyGoogleIdToken(credential)
    } catch {
      throw new AppError(401, 'Google sign-in failed. Please try again.')
    }

    const existingByGoogleId = await findUserByGoogleId(googlePayload.googleId)
    if (existingByGoogleId) {
      const authenticatedUser = await issueAuthenticatedSession(res, existingByGoogleId.id)
      return res.json({
        message: 'Login successful!',
        user: authenticatedUser,
      })
    }

    const existingByEmail = await findUserByEmail(googlePayload.email)
    if (existingByEmail) {
      // Security: Do NOT auto-link Google to an existing account.
      // An attacker with a Google account matching the victim's email could
      // take over their StudyHub account. Require explicit linking from Settings.
      const msg = existingByEmail.authProvider === 'google'
        ? 'An account with this email already exists. Try signing in with your original Google account.'
        : 'An account with this email already exists. Log in with your password, then link Google from Settings > Security.'
      return res.status(409).json({ error: msg })
    }

    const parsedSchoolId = parseOptionalInteger(schoolId, 'schoolId')
    const parsedCourseIds = parseCourseIds(courseIds || [])
    const parsedCustomCourses = parseCustomCourses(customCourses || [])

    if (parsedCourseIds.length === 0 && parsedCustomCourses.length === 0 && parsedSchoolId === null) {
      return res.json({
        requiresCourseSelection: true,
        googleEmail: googlePayload.email,
        googleName: googlePayload.name,
        tempCredential: credential,
      })
    }

    if (parsedCustomCourses.length > 0 && parsedSchoolId === null) {
      throw new AppError(400, 'Please select a school before adding custom courses.')
    }

    await validateCourses(parsedCourseIds, parsedSchoolId)

    const baseUsername = (googlePayload.name || googlePayload.email.split('@')[0])
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 16) || 'user'

    let username = baseUsername
    let suffix = 1
    while (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
      if (suffix > 100) throw new AppError(500, 'Unable to generate a unique username. Please try again.')
      username = `${baseUsername.slice(0, 16)}${suffix}`
      suffix += 1
    }

    const randomPassword = crypto.randomBytes(32).toString('hex')
    const passwordHash = await bcrypt.hash(randomPassword, 12)

    const createdUserId = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username,
          passwordHash,
          email: googlePayload.email,
          emailVerified: true,
          googleId: googlePayload.googleId,
          authProvider: 'google',
          avatarUrl: googlePayload.picture || null,
        },
        select: { id: true },
      })

      const resolvedCourseIds = await resolveCourseIds(
        tx, parsedCourseIds, parsedCustomCourses, parsedSchoolId,
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

      return createdUser.id
    })

    const authenticatedUser = await issueAuthenticatedSession(res, createdUserId)
    return res.status(201).json({
      message: 'Account created with Google!',
      user: authenticatedUser,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.post('/google/complete', googleLimiter, async (req, res) => {
  const { credential, schoolId, courseIds, customCourses } = req.body || {}

  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required.' })
  }
  if (!isGoogleOAuthEnabled()) {
    return res.status(503).json({ error: 'Google sign-in is not available right now.' })
  }

  try {
    let googlePayload
    try {
      googlePayload = await verifyGoogleIdToken(credential)
    } catch {
      throw new AppError(401, 'Google sign-in failed. Please try again.')
    }

    const existingUser = await findUserByGoogleId(googlePayload.googleId)
    if (existingUser) {
      const authenticatedUser = await issueAuthenticatedSession(res, existingUser.id)
      return res.json({ message: 'Login successful!', user: authenticatedUser })
    }

    const existingByEmail = await findUserByEmail(googlePayload.email)
    if (existingByEmail) {
      // Security: Do NOT auto-link Google to an existing account.
      // An attacker with a Google account matching the victim's email could
      // take over their StudyHub account. Require explicit linking from Settings.
      const msg = existingByEmail.authProvider === 'google'
        ? 'An account with this email already exists. Try signing in with your original Google account.'
        : 'An account with this email already exists. Log in with your password, then link Google from Settings > Security.'
      return res.status(409).json({ error: msg })
    }

    const parsedSchoolId = parseOptionalInteger(schoolId, 'schoolId')
    const parsedCourseIds = parseCourseIds(courseIds || [])
    const parsedCustomCourses = parseCustomCourses(customCourses || [])

    if (parsedCustomCourses.length > 0 && parsedSchoolId === null) {
      throw new AppError(400, 'Please select a school before adding custom courses.')
    }

    await validateCourses(parsedCourseIds, parsedSchoolId)

    const baseUsername = (googlePayload.name || googlePayload.email.split('@')[0])
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 16) || 'user'

    let username = baseUsername
    let suffix = 1
    while (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
      if (suffix > 100) throw new AppError(500, 'Unable to generate a unique username. Please try again.')
      username = `${baseUsername.slice(0, 16)}${suffix}`
      suffix += 1
    }

    const randomPassword = crypto.randomBytes(32).toString('hex')
    const passwordHash = await bcrypt.hash(randomPassword, 12)

    const createdUserId = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username,
          passwordHash,
          email: googlePayload.email,
          emailVerified: true,
          googleId: googlePayload.googleId,
          authProvider: 'google',
          avatarUrl: googlePayload.picture || null,
        },
        select: { id: true },
      })

      const resolvedCourseIds = await resolveCourseIds(
        tx, parsedCourseIds, parsedCustomCourses, parsedSchoolId,
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

      return createdUser.id
    })

    const authenticatedUser = await issueAuthenticatedSession(res, createdUserId)
    return res.status(201).json({
      message: 'Account created with Google!',
      user: authenticatedUser,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.post('/logout', logoutLimiter, (req, res) => {
  clearAuthCookie(res)
  return res.json({ message: 'Logged out.' })
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req.user.userId)
    if (!user) return res.status(404).json({ error: 'User not found.' })
    return res.json(buildAuthenticatedUserPayload(user))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
