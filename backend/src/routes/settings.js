const express = require('express')
const bcrypt = require('bcryptjs')
const rateLimit = require('express-rate-limit')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const { hashStoredSecret, setAuthCookie, signAuthToken } = require('../lib/authTokens')
const { sendEmailVerification } = require('../lib/email')
const { deleteUserAccount } = require('../lib/deleteUserAccount')
const { generateSixDigitCode } = require('../lib/verificationCodes')
const prisma = require('../lib/prisma')

const twoFaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const router = express.Router()

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COURSE_CODE_REGEX = /^[A-Z0-9-]{2,20}$/
const EMAIL_VERIFICATION_CODE_REGEX = /^\d{6}$/
const EMAIL_VERIFICATION_TTL_MS = 15 * 60 * 1000

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

async function getSettingsUser(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      email: true,
      emailVerified: true,
      twoFaEnabled: true,
      avatarUrl: true,
      createdAt: true,
      enrollments: {
        include: { course: { include: { school: true } } },
      },
      _count: { select: { studySheets: true, enrollments: true } },
    },
  })
}

function sendError(req, res, error) {
  if (error instanceof AppError) return res.status(error.statusCode).json({ error: error.message })
  if (error.code === 'P2002') return res.status(409).json({ error: 'That username or email is already taken.' })
  captureError(error, { route: req.originalUrl, method: req.method })
  console.error(error)
  return res.status(500).json({ error: 'Server error. Please try again.' })
}

function buildEmailVerificationRecord() {
  const code = generateSixDigitCode()

  return {
    code,
    emailVerificationCode: hashStoredSecret(code),
    emailVerificationExpiry: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  }
}

// All settings endpoints require authentication
router.use(requireAuth)

// ── GET /api/settings/me ──────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const user = await getSettingsUser(req.user.userId)
    if (!user) return res.status(404).json({ error: 'User not found.' })
    return res.json(user)
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── PATCH /api/settings/password ────────────────────────────
router.patch('/password', twoFaLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' })
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' })
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

// ── PATCH /api/settings/username ─────────────────────────────
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
      data: { username: trimmed }
    })
    const updated = await getSettingsUser(user.id)

    // Re-issue token with new username
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

// ── PATCH /api/settings/email ────────────────────────────────
router.patch('/email', twoFaLimiter, async (req, res) => {
  const { email, password } = req.body || {}

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password confirmation are required.' })
  }

  const trimmedEmail = email.trim().toLowerCase()
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    if (trimmedEmail === user.email) {
      return res.status(400).json({ error: 'New email must be different from current email.' })
    }

    const verification = buildEmailVerificationRecord()

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: trimmedEmail,
        emailVerified: false,
        emailVerificationCode: verification.emailVerificationCode,
        emailVerificationExpiry: verification.emailVerificationExpiry,
        twoFaEnabled: false,
        twoFaCode: null,
        twoFaExpiry: null,
      },
    })

    try {
      await sendEmailVerification(trimmedEmail, user.username, verification.code)
    } catch (emailError) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          email: user.email,
          emailVerified: user.emailVerified,
          emailVerificationCode: user.emailVerificationCode,
          emailVerificationExpiry: user.emailVerificationExpiry,
          twoFaEnabled: user.twoFaEnabled,
          twoFaCode: user.twoFaCode,
          twoFaExpiry: user.twoFaExpiry,
        },
      })
      captureError(emailError, {
        route: req.originalUrl,
        method: req.method,
        source: 'sendEmailVerification',
      })
      return res.status(503).json({
        error: 'We could not send a verification code to that email address. Please try again later.',
      })
    }

    const updated = await getSettingsUser(user.id)

    return res.json({
      message: 'Email updated. Enter the verification code sent to your inbox to finish setup.',
      verificationRequired: true,
      user: updated,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── POST /api/settings/email/verify ───────────────────────────
router.post('/email/verify', twoFaLimiter, async (req, res) => {
  const body = req.body || {}
  const code = typeof body.code === 'string' ? body.code.trim() : ''

  if (!EMAIL_VERIFICATION_CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit verification code.' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })
    if (!user.email) return res.status(400).json({ error: 'Add an email address before verifying it.' })
    if (user.emailVerified) return res.status(400).json({ error: 'Your email is already verified.' })
    if (!user.emailVerificationCode || !user.emailVerificationExpiry) {
      return res.status(400).json({ error: 'No verification code is active. Request a new code.' })
    }
    if (user.emailVerificationExpiry < new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerificationCode: null, emailVerificationExpiry: null },
      })
      return res.status(400).json({ error: 'That verification code has expired. Request a new one.' })
    }
    if (user.emailVerificationCode !== hashStoredSecret(code)) {
      return res.status(400).json({ error: 'Incorrect verification code.' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
      },
    })

    const updated = await getSettingsUser(user.id)
    return res.json({
      message: 'Email verified successfully.',
      user: updated,
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── POST /api/settings/email/resend-verification ──────────────
router.post('/email/resend-verification', twoFaLimiter, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })
    if (!user.email) return res.status(400).json({ error: 'Add an email address before requesting a verification code.' })
    if (user.emailVerified) return res.status(400).json({ error: 'Your email is already verified.' })

    const verification = buildEmailVerificationRecord()
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCode: verification.emailVerificationCode,
        emailVerificationExpiry: verification.emailVerificationExpiry,
      },
    })

    try {
      await sendEmailVerification(user.email, user.username, verification.code)
    } catch (emailError) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationCode: user.emailVerificationCode,
          emailVerificationExpiry: user.emailVerificationExpiry,
        },
      })
      captureError(emailError, {
        route: req.originalUrl,
        method: req.method,
        source: 'resendEmailVerification',
      })
      return res.status(503).json({
        error: 'We could not resend your verification code right now. Please try again later.',
      })
    }

    return res.json({ message: 'A new verification code has been sent to your email.' })
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── PATCH /api/settings/courses ──────────────────────────────
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

// ── PATCH /api/settings/2fa/enable ───────────────────────────
router.patch('/2fa/enable', twoFaLimiter, async (req, res) => {
  const { password } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Password is required.' })

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })
    if (!user.email) return res.status(400).json({ error: 'You must add an email address before enabling 2FA.' })
    if (!user.emailVerified) return res.status(400).json({ error: 'Verify your email address before enabling 2-step verification.' })
    if (user.twoFaEnabled) return res.status(400).json({ error: '2FA is already enabled.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    await prisma.user.update({ where: { id: user.id }, data: { twoFaEnabled: true } })
    return res.json({ twoFaEnabled: true, message: '2-step verification enabled.' })
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── PATCH /api/settings/2fa/disable ──────────────────────────
router.patch('/2fa/disable', twoFaLimiter, async (req, res) => {
  const { password } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Password is required.' })

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFaEnabled: false, twoFaCode: null, twoFaExpiry: null }
    })
    return res.json({ twoFaEnabled: false, message: '2-step verification disabled.' })
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── DELETE /api/settings/account ─────────────────────────────
router.delete('/account', twoFaLimiter, async (req, res) => {
  const { password, reason, details } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Password is required to delete your account.' })
  if (!reason)   return res.status(400).json({ error: 'Please select a reason for leaving.' })

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
