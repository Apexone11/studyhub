const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const {
  verifyGoogleIdToken,
  findUserByGoogleId,
  findUserByEmail,
  isGoogleOAuthEnabled,
} = require('../../lib/googleAuth')
const prisma = require('../../lib/prisma')
const { googleLimiter } = require('./auth.constants')
const {
  AppError,
  parseOptionalInteger,
  parseCourseIds,
  parseCustomCourses,
  resolveCourseIds,
  validateCourses,
  issueAuthenticatedSession,
  handleAuthError,
} = require('./auth.service')

const router = express.Router()

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
        googleName: googlePayload.name || 'Google user',
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
    return handleAuthError(req, res, error)
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
    return handleAuthError(req, res, error)
  }
})

module.exports = router
