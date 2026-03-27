const { captureError } = require('../../monitoring/sentry')
const { sendEmailVerification } = require('../../lib/email')
const {
  setAuthCookie,
  signAuthToken,
  signCsrfToken,
} = require('../../lib/authTokens')
const { maskEmailAddress } = require('../../lib/verificationCodes')
const {
  VerificationError,
  mapChallengeForClient,
} = require('../../lib/verificationChallenges')
const { isValidEmailAddress } = require('../../lib/emailValidation')
const prisma = require('../../lib/prisma')
const { USERNAME_REGEX, PASSWORD_MIN_LENGTH, COURSE_CODE_REGEX } = require('./auth.constants')

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

const VALID_ACCOUNT_TYPES = ['student', 'teacher', 'other']

function validateRegistrationInput({ username, email, password, confirmPassword, termsAccepted, accountType }) {
  const normalizedUsername = typeof username === 'string' ? username.trim() : ''
  if (!normalizedUsername) throw new AppError(400, 'Username is required.')
  if (!USERNAME_REGEX.test(normalizedUsername)) {
    throw new AppError(400, 'Username must be 3-20 characters using only letters, numbers, and underscores.')
  }

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

  const normalizedAccountType = typeof accountType === 'string' && VALID_ACCOUNT_TYPES.includes(accountType.trim().toLowerCase())
    ? accountType.trim().toLowerCase()
    : 'student'

  return {
    username: normalizedUsername,
    email: normalizedEmail || null,
    password,
    accountType: normalizedAccountType,
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
      coverImageUrl: true,
      authProvider: true,
      accountType: true,
      trustLevel: true,
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
    accountType: user.accountType || 'student',
    trustLevel: user.trustLevel || 'new',
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

function handleAuthError(req, res, error) {
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
  resolveCourseIds,
  validateCourses,
  normalizeEmail,
  validateRegistrationInput,
  getAuthenticatedUser,
  buildAuthenticatedUserPayload,
  sendVerificationCodeEmail,
  issueAuthenticatedSession,
  loginVerificationResponse,
  handleAuthError,
}
