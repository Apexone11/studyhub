const { captureError } = require('../../monitoring/sentry')
const { sendEmailVerification } = require('../../lib/email')
const { isValidEmailAddress } = require('../../lib/emailValidation')
const {
  VERIFICATION_PURPOSE,
  VerificationError,
  getUserActiveChallenge,
  mapChallengeForClient,
} = require('../../lib/verificationChallenges')
const prisma = require('../../lib/prisma')

const { COURSE_CODE_REGEX } = require('./settings.constants')

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
        coverImageUrl: true,
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

function handleSettingsError(req, res, error) {
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

module.exports = {
  AppError,
  parseOptionalInteger,
  parseCourseIds,
  parseCustomCourses,
  validateCourseIds,
  resolveCourseIds,
  normalizeEmail,
  serializePendingEmailVerification,
  sendSettingsVerificationEmail,
  getSettingsUser,
  handleSettingsError,
}
