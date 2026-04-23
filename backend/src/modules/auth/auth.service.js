const { captureError } = require('../../monitoring/sentry')
const { sendEmailVerification } = require('../../lib/email/email')
const { setAuthCookie, signAuthToken, signCsrfToken } = require('../../lib/authTokens')
const { maskEmailAddress } = require('../../lib/verification/verificationCodes')
const {
  VerificationError,
  mapChallengeForClient,
} = require('../../lib/verification/verificationChallenges')
const { isValidEmailAddress } = require('../../lib/email/emailValidation')
const prisma = require('../../lib/prisma')
const { enrichUserWithBadges } = require('../../lib/userBadges')
const { USERNAME_REGEX, PASSWORD_MIN_LENGTH, COURSE_CODE_REGEX } = require('./auth.constants')
const { getSessionLegalAcceptanceState } = require('../legal/legal.service')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')

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

    if (!code || !name)
      throw new AppError(400, 'Each custom course must include both code and name.')
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

function validateRegistrationInput({
  username,
  email,
  password,
  confirmPassword,
  termsAccepted,
  accountType,
}) {
  const normalizedUsername = typeof username === 'string' ? username.trim() : ''
  if (!normalizedUsername) throw new AppError(400, 'Username is required.')
  if (!USERNAME_REGEX.test(normalizedUsername)) {
    throw new AppError(
      400,
      'Username must be 3-20 characters using only letters, numbers, and underscores.',
    )
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

  const normalizedAccountType =
    typeof accountType === 'string' &&
    VALID_ACCOUNT_TYPES.includes(accountType.trim().toLowerCase())
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

async function buildSessionUserPayload(user) {
  const [badges, legalAcceptance] = await Promise.all([
    enrichUserWithBadges(user),
    getSessionLegalAcceptanceState(user.id),
  ])

  return buildAuthenticatedUserPayload(user, {
    plan: badges.plan || 'free',
    isDonor: badges.isDonor || false,
    donorLevel: badges.donorLevel || null,
    legalAcceptance,
  })
}

async function sendVerificationCodeEmail(email, username, code, metadata = {}) {
  try {
    await sendEmailVerification(email, username, code)
  } catch (error) {
    captureError(error, {
      source: 'sendEmailVerification',
      ...metadata,
    })
    throw new AppError(
      503,
      'We could not send your verification code right now. Please try again later.',
    )
  }
}

/**
 * True when the request originated from the Capacitor native mobile shell.
 * The mobile client sends `X-Client: mobile` on every auth and authenticated
 * request. WebView cookies can be unreliable across the Railway origin, so
 * mobile uses bearer tokens (`Authorization: Bearer <jwt>`) instead. For web
 * clients this header is absent and behavior is unchanged.
 *
 * Security: the `X-Client` header alone is attacker-controllable from a web
 * browser (any fetch can set it). Trusting it alone means a web-context
 * attacker (XSS, rogue extension) could cause the server to emit the raw JWT
 * in the response body, bypassing the httpOnly cookie protection. To prevent
 * that, also require the `Origin` header to match a Capacitor native scheme
 * — browsers set `Origin` themselves and cross-origin attackers cannot
 * override it, so this is a non-forgeable second signal.
 *
 * Capacitor origins we accept:
 *   - `http://localhost` — Android when `server.androidScheme: 'http'`
 *     (our current capacitor.config.json — chosen for dev so the WebView
 *     can fetch the http dev backend without a mixed-content block)
 *   - `https://localhost` — Android alt scheme (kept for future prod builds)
 *   - `capacitor://localhost` — iOS default scheme
 */
const CAPACITOR_NATIVE_ORIGINS = new Set([
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
])

function isMobileClient(req) {
  if (!req || !req.headers) return false
  const clientHeader = req.headers['x-client']
  if (typeof clientHeader !== 'string') return false
  if (clientHeader.trim().toLowerCase() !== 'mobile') return false
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.toLowerCase() : ''
  return CAPACITOR_NATIVE_ORIGINS.has(origin)
}

/**
 * Resolve device identity + geo + risk for a login attempt.
 * The login controller calls this BEFORE issuing a session so it can route
 * to a step-up challenge for high-risk attempts. Other callers (register,
 * Google OAuth, password reset) skip this path and go straight to
 * issueAuthenticatedSession, which will do a best-effort computation of
 * its own if no pre-computed risk is passed.
 */
async function evaluateLoginRisk(userId, req, res) {
  const userAgent = req?.headers?.['user-agent'] || null
  const ipAddress = req?.ip || null

  let trustedDeviceId = null
  let deviceId = null
  let deviceKnown = false
  try {
    const { getOrSetDeviceId } = require('../../lib/deviceCookie')
    const { findOrCreateDevice } = require('./trustedDevice.service')
    const { parseDeviceLabel } = require('./session.service')
    const prisma = require('../../lib/prisma')
    if (res && req) {
      deviceId = getOrSetDeviceId(req, res)
      const existing = await prisma.trustedDevice.findUnique({
        where: { userId_deviceId: { userId, deviceId } },
      })
      deviceKnown = !!(existing && !existing.revokedAt)
      const device = await findOrCreateDevice({
        userId,
        deviceId,
        label: parseDeviceLabel(userAgent),
        ip: ipAddress,
      })
      trustedDeviceId = device?.id || null
    }
  } catch {
    trustedDeviceId = null
    deviceId = null
    deviceKnown = false
  }

  let geo = null
  let riskResult = { score: 0, band: 'normal', signals: [] }
  try {
    const { lookup } = require('../../lib/geoip.service')
    geo = await lookup(ipAddress)
    const { scoreLogin } = require('./riskScoring.service')
    const prisma = require('../../lib/prisma')
    const recent = await prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { country: true, region: true, createdAt: true },
    })
    riskResult = scoreLogin({
      deviceKnown,
      geo,
      recentSessions: recent,
      uaFamilyChanged: false,
      anonymousIp: !!geo?.isAnonymous,
      failedAttempts15m: 0,
    })
  } catch {
    riskResult = { score: 0, band: 'normal', signals: [] }
    geo = null
  }

  return { deviceId, deviceKnown, trustedDeviceId, geo, riskResult, userAgent, ipAddress }
}

/**
 * Issue an authenticated session.
 *
 * @param res          Express response
 * @param userId       numeric User.id
 * @param req          Express request
 * @param preComputed  optional output of evaluateLoginRisk() — when provided,
 *                     we skip internal risk evaluation and reuse the caller's.
 */
async function issueAuthenticatedSession(res, userId, req, preComputed = null) {
  const user = await getAuthenticatedUser(userId)
  if (!user) throw new AppError(404, 'User not found.')

  const ctx = preComputed || (await evaluateLoginRisk(userId, req, res))
  const { trustedDeviceId, deviceKnown, geo, riskResult, userAgent, ipAddress } = ctx

  let jti
  let sessionId
  try {
    const { createSession } = require('./session.service')
    const sessionResult = await createSession({
      userId,
      userAgent,
      ipAddress,
      trustedDeviceId,
      country: geo?.country || null,
      region: geo?.region || null,
      city: geo?.city || null,
      riskScore: riskResult.score,
    })
    jti = sessionResult.jti
    sessionId = sessionResult.sessionId
  } catch (sessionErr) {
    const isTableMissing =
      sessionErr?.code === 'P2021' ||
      (sessionErr?.message && sessionErr.message.includes('does not exist'))
    if (!isTableMissing) {
      throw sessionErr
    }
    jti = undefined
    sessionId = undefined
  }

  // Enriched login event — best-effort.
  try {
    const prisma = require('../../lib/prisma')
    const { deriveDeviceKind, parseDeviceLabel } = require('./session.service')
    await prisma.securityEvent.create({
      data: {
        userId,
        eventType: 'login.success',
        ipAddress: ipAddress ? String(ipAddress).slice(0, 45) : null,
        userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
        metadata: {
          country: geo?.country || null,
          region: geo?.region || null,
          city: geo?.city || null,
          deviceKind: deriveDeviceKind(userAgent),
          deviceLabel: parseDeviceLabel(userAgent),
          deviceKnown,
          riskScore: riskResult.score,
          band: riskResult.band,
          signals: riskResult.signals,
          sessionId: sessionId || null,
        },
      },
    })
  } catch {
    // intentionally silent
  }

  const token = signAuthToken(user, { jti })
  setAuthCookie(res, token)

  const payload = await buildSessionUserPayload(user)
  if (sessionId) payload.sessionId = sessionId

  // Mobile clients cannot rely on the Set-Cookie header because the Capacitor
  // WebView origin differs from the Railway backend origin. Return the raw JWT
  // in the response body so the app can store it and send as
  // `Authorization: Bearer <token>` on subsequent requests. Web clients never
  // receive this field (the cookie above is authoritative for them).
  if (isMobileClient(req)) {
    payload.authToken = token
  }
  return payload
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
    const code =
      error.statusCode === 401
        ? ERROR_CODES.UNAUTHORIZED
        : error.statusCode === 403
          ? ERROR_CODES.FORBIDDEN
          : error.statusCode === 404
            ? ERROR_CODES.NOT_FOUND
            : error.statusCode === 409
              ? ERROR_CODES.CONFLICT
              : error.statusCode === 429
                ? ERROR_CODES.RATE_LIMITED
                : error.statusCode >= 500
                  ? ERROR_CODES.INTERNAL
                  : ERROR_CODES.BAD_REQUEST
    return sendError(res, error.statusCode, error.message, code)
  }
  if (error && error.code === 'P2002') {
    return sendError(res, 409, 'That username or email is already taken.', ERROR_CODES.CONFLICT)
  }
  captureError(error, { route: req.originalUrl, method: req.method })
  console.error(error)
  return sendError(res, 500, 'Server error. Please try again.', ERROR_CODES.INTERNAL)
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
  buildSessionUserPayload,
  sendVerificationCodeEmail,
  isMobileClient,
  issueAuthenticatedSession,
  evaluateLoginRisk,
  loginVerificationResponse,
  handleAuthError,
}
