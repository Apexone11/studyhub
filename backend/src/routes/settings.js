const express = require('express')
const bcrypt = require('bcryptjs')
const rateLimit = require('express-rate-limit')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const { signAuthToken, setAuthCookie } = require('../lib/authTokens')
const { sendEmailVerification } = require('../lib/email')
const { deleteUserAccount } = require('../lib/deleteUserAccount')
const {
  VERIFICATION_PURPOSE,
  VerificationError,
  consumeChallenge,
  createSettingsEmailChallenge,
  getUserActiveChallenge,
  mapChallengeForClient,
  resendSettingsEmailChallenge,
  verifyChallengeCode,
} = require('../lib/verificationChallenges')
const { isValidEmailAddress } = require('../lib/emailValidation')
const {
  verifyGoogleIdToken,
  findUserByGoogleId,
  linkGoogleToUser,
  unlinkGoogleFromUser,
  isGoogleOAuthEnabled,
} = require('../lib/googleAuth')
const prisma = require('../lib/prisma')

const router = express.Router()

const twoFaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const COURSE_CODE_REGEX = /^[A-Z0-9-]{2,20}$/

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

async function validateCourseIds(courseIds, schoolId) {
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

function normalizeEmail(value) {
  const normalizedEmail = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!normalizedEmail) throw new AppError(400, 'Email and password confirmation are required.')
  if (!isValidEmailAddress(normalizedEmail)) {
    throw new AppError(400, 'Please enter a valid email address.')
  }
  return normalizedEmail
}

function serializePendingEmailVerification(challenge) {
  if (!challenge) return null
  const mapped = mapChallengeForClient(challenge)
  return {
    email: mapped.email,
    deliveryHint: mapped.deliveryHint,
    expiresAt: mapped.expiresAt,
    resendAvailableAt: mapped.resendAvailableAt,
    verificationToken: mapped.verificationToken,
  }
}

async function sendSettingsVerificationEmail(email, username, code, metadata = {}) {
  try {
    await sendEmailVerification(email, username, code)
  } catch (error) {
    captureError(error, {
      source: 'sendEmailVerification',
      ...metadata,
    })
    throw new AppError(503, 'We could not send a verification code to that email address. Please try again later.')
  }
}

async function getSettingsUser(userId) {
  const [user, pendingChallenge] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        emailVerified: true,
        avatarUrl: true,
        authProvider: true,
        googleId: true,
        createdAt: true,
        enrollments: {
          include: { course: { include: { school: true } } },
        },
        _count: { select: { studySheets: true, enrollments: true } },
      },
    }),
    getUserActiveChallenge(userId, VERIFICATION_PURPOSE.SETTINGS_EMAIL),
  ])

  if (!user) return null

  return {
    ...user,
    pendingEmailVerification: serializePendingEmailVerification(pendingChallenge),
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

router.use(requireAuth)

router.get('/me', async (req, res) => {
  try {
    const user = await getSettingsUser(req.user.userId)
    if (!user) return res.status(404).json({ error: 'User not found.' })
    return res.json(user)
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.patch('/password', twoFaLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' })
  }
  if (!/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return res.status(400).json({ error: 'New password must include at least one capital letter and one number.' })
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from current password.' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' })

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

    return res.json({ message: 'Password updated successfully.' })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.patch('/username', async (req, res) => {
  const { newUsername, password } = req.body || {}

  if (!newUsername || !password) {
    return res.status(400).json({ error: 'New username and password confirmation are required.' })
  }

  const trimmed = newUsername.trim()
  if (!USERNAME_REGEX.test(trimmed)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters (letters, numbers, underscores only).' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })
    if (trimmed === user.username) {
      return res.status(400).json({ error: 'New username must be different from current username.' })
    }

    const updatedTokenUser = await prisma.user.update({
      where: { id: user.id },
      data: { username: trimmed },
    })
    const updated = await getSettingsUser(user.id)

    const token = signAuthToken(updatedTokenUser)
    setAuthCookie(res, token)
    return res.json({
      message: 'Username updated successfully.',
      user: updated,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.patch('/email', twoFaLimiter, async (req, res) => {
  const { email, password } = req.body || {}

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password confirmation are required.' })
  }

  try {
    const trimmedEmail = normalizeEmail(email)
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })
    if (trimmedEmail === user.email) {
      return res.status(400).json({ error: 'New email must be different from current email.' })
    }

    const conflictingUser = await prisma.user.findFirst({
      where: {
        email: trimmedEmail,
        id: { not: user.id },
      },
      select: { id: true },
    })
    if (conflictingUser) {
      return res.status(409).json({ error: 'That email is already in use.' })
    }

    const { challenge, code } = await createSettingsEmailChallenge({
      user,
      email: trimmedEmail,
    })

    try {
      await sendSettingsVerificationEmail(trimmedEmail, user.username, code, {
        route: req.originalUrl,
        method: req.method,
        purpose: VERIFICATION_PURPOSE.SETTINGS_EMAIL,
      })
    } catch (error) {
      await consumeChallenge(challenge.id)
      throw error
    }

    const updated = await getSettingsUser(user.id)

    return res.json({
      message: 'Email update started. Enter the verification code sent to your inbox to finish setup.',
      verificationRequired: true,
      user: updated,
      pendingEmailVerification: updated?.pendingEmailVerification || null,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.post('/email/verify', twoFaLimiter, async (req, res) => {
  const body = req.body || {}
  const code = typeof body.code === 'string' ? body.code.trim() : ''

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit verification code.' })
  }

  try {
    const activeChallenge = await getUserActiveChallenge(req.user.userId, VERIFICATION_PURPOSE.SETTINGS_EMAIL)
    if (!activeChallenge) {
      return res.status(400).json({ error: 'No email verification is currently in progress.' })
    }

    const conflictingUser = await prisma.user.findFirst({
      where: {
        email: activeChallenge.email,
        id: { not: req.user.userId },
      },
      select: { id: true },
    })
    if (conflictingUser) {
      return res.status(409).json({ error: 'That email is already in use.' })
    }

    const verifiedChallenge = await verifyChallengeCode(
      activeChallenge.token,
      VERIFICATION_PURPOSE.SETTINGS_EMAIL,
      code,
    )

    await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        email: verifiedChallenge.email,
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
      },
    })

    await consumeChallenge(verifiedChallenge.id)
    const updated = await getSettingsUser(req.user.userId)

    return res.json({
      message: 'Email verified successfully.',
      user: updated,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.post('/email/resend-verification', twoFaLimiter, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, username: true, email: true, emailVerified: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    let challenge = await getUserActiveChallenge(user.id, VERIFICATION_PURPOSE.SETTINGS_EMAIL)
    let code

    if (challenge) {
      const refreshed = await resendSettingsEmailChallenge(user.id)
      challenge = refreshed.challenge
      code = refreshed.code
    } else {
      if (!user.email) {
        return res.status(400).json({ error: 'Add an email address before requesting a verification code.' })
      }
      if (user.emailVerified) {
        return res.status(400).json({ error: 'Your email is already verified.' })
      }

      const created = await createSettingsEmailChallenge({ user, email: user.email })
      challenge = created.challenge
      code = created.code
    }

    try {
      await sendSettingsVerificationEmail(challenge.email, user.username, code, {
        route: req.originalUrl,
        method: req.method,
        purpose: VERIFICATION_PURPOSE.SETTINGS_EMAIL,
      })
    } catch (error) {
      if (!challenge.verifiedAt && challenge.sendCount === 1) {
        await consumeChallenge(challenge.id)
      }
      throw error
    }

    const updated = await getSettingsUser(user.id)
    return res.json({
      message: 'A new verification code has been sent to your email.',
      pendingEmailVerification: updated?.pendingEmailVerification || serializePendingEmailVerification(challenge),
      user: updated,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── User Preferences ──────────────────────────────────────────────────

const PREF_BOOLEAN_KEYS = [
  'emailDigest', 'emailMentions', 'emailContributions', 'inAppNotifications',
  'defaultDownloads', 'defaultContributions',
]
const PREF_ENUM_KEYS = {
  profileVisibility: ['public', 'enrolled', 'private'],
  theme: ['system', 'light', 'dark'],
  fontSize: ['small', 'medium', 'large'],
}

router.get('/preferences', async (req, res) => {
  try {
    const { userId } = req.user
    let prefs = await prisma.userPreferences.findUnique({ where: { userId } })
    if (!prefs) {
      prefs = await prisma.userPreferences.create({ data: { userId } })
    }
    const { id: _id, userId: _uid, ...payload } = prefs
    return res.json(payload)
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.patch('/preferences', async (req, res) => {
  try {
    const { userId } = req.user
    const updates = Object.create(null)

    for (const key of PREF_BOOLEAN_KEYS) {
      if (Object.hasOwn(req.body, key) && typeof req.body[key] === 'boolean') {
        updates[key] = req.body[key]
      }
    }
    for (const [key, allowed] of Object.entries(PREF_ENUM_KEYS)) {
      if (Object.hasOwn(req.body, key) && typeof req.body[key] === 'string' && allowed.includes(req.body[key])) {
        updates[key] = req.body[key]
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid preference fields provided.' })
    }

    const prefs = await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, ...updates },
      update: updates,
    })
    const { id: _id, userId: _uid, ...payload } = prefs
    return res.json({ message: 'Preferences saved.', preferences: payload })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.patch('/courses', async (req, res) => {
  const { schoolId, courseIds, customCourses } = req.body || {}

  try {
    const parsedSchoolId = parseOptionalInteger(schoolId, 'schoolId')
    const parsedCourseIds = parseCourseIds(courseIds)
    const parsedCustomCourses = parseCustomCourses(customCourses)

    if ((parsedCourseIds.length > 0 || parsedCustomCourses.length > 0) && parsedSchoolId === null) {
      throw new AppError(400, 'Please select a school before saving your courses.')
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    await validateCourseIds(parsedCourseIds, parsedSchoolId)

    await prisma.$transaction(async (tx) => {
      const resolvedCourseIds = await resolveCourseIds(tx, parsedCourseIds, parsedCustomCourses, parsedSchoolId)
      await tx.enrollment.deleteMany({ where: { userId: user.id } })
      if (resolvedCourseIds.length > 0) {
        await tx.enrollment.createMany({
          data: resolvedCourseIds.map((courseId) => ({ userId: user.id, courseId })),
          skipDuplicates: true,
        })
      }
    })

    const updated = await getSettingsUser(user.id)
    return res.json({
      message: updated?._count?.enrollments ? 'Courses updated successfully.' : 'Courses cleared successfully.',
      user: updated,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.post('/google/link', twoFaLimiter, async (req, res) => {
  const { credential } = req.body || {}

  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required.' })
  }
  if (!isGoogleOAuthEnabled()) {
    return res.status(503).json({ error: 'Google sign-in is not available right now.' })
  }

  try {
    const googlePayload = await verifyGoogleIdToken(credential)

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })
    if (user.googleId) {
      return res.status(400).json({ error: 'A Google account is already linked.' })
    }

    const existingGoogleUser = await findUserByGoogleId(googlePayload.googleId)
    if (existingGoogleUser) {
      return res.status(409).json({ error: 'That Google account is already linked to another user.' })
    }

    await linkGoogleToUser(user.id, googlePayload.googleId)
    const updated = await getSettingsUser(user.id)

    return res.json({
      message: 'Google account linked successfully.',
      user: updated,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.patch('/google/unlink', twoFaLimiter, async (req, res) => {
  const { password } = req.body || {}

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })
    if (!user.googleId) {
      return res.status(400).json({ error: 'No Google account is linked.' })
    }

    if (user.authProvider === 'google') {
      return res.status(400).json({
        error: 'Set a password before unlinking Google. Your account was created with Google and has no password.',
      })
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required to unlink Google.' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    await unlinkGoogleFromUser(user.id)
    const updated = await getSettingsUser(user.id)

    return res.json({
      message: 'Google account unlinked.',
      user: updated,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

router.delete('/account', twoFaLimiter, async (req, res) => {
  const { password, reason, details } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Password is required to delete your account.' })
  if (!reason) return res.status(400).json({ error: 'Please select a reason for leaving.' })

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    await deleteUserAccount(prisma, {
      userId: user.id,
      username: user.username,
      reason,
      details,
    })

    return res.json({ message: 'Account deleted.' })
  } catch (error) {
    return sendError(req, res, error)
  }
})

module.exports = router
