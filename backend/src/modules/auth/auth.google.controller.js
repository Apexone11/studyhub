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
  issueAuthenticatedSession,
  handleAuthError,
} = require('./auth.service')
const {
  CURRENT_LEGAL_VERSION,
  LEGAL_ACCEPTANCE_SOURCES,
  recordCurrentRequiredLegalAcceptancesTx,
} = require('../legal/legal.service')

const router = express.Router()

/**
 * POST /api/auth/google
 * Google OAuth: sign in existing user OR create a new account immediately.
 * School/course selection is no longer part of registration — users
 * personalize later via /my-courses.
 */
router.post('/google', googleLimiter, async (req, res) => {
  const { credential, legalAccepted, legalVersion } = req.body || {}

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

    // Existing user by Google ID → sign in
    const existingByGoogleId = await findUserByGoogleId(googlePayload.googleId)
    if (existingByGoogleId) {
      const authenticatedUser = await issueAuthenticatedSession(res, existingByGoogleId.id)
      return res.json({
        message: 'Login successful!',
        user: authenticatedUser,
      })
    }

    const isGoogleEmailVerified = Boolean(googlePayload.emailVerified)
    if (!isGoogleEmailVerified) {
      throw new AppError(403, 'Google account email must be verified before you can sign in.')
    }

    // Existing user by email → reject (security: no auto-link)
    const existingByEmail = await findUserByEmail(googlePayload.email)
    if (existingByEmail) {
      const msg = existingByEmail.authProvider === 'google'
        ? 'An account with this email already exists. Try signing in with your original Google account.'
        : 'An account with this email already exists. Log in with your password, then link Google from Settings > Security.'
      return res.status(409).json({ error: msg })
    }

    if (!legalAccepted || legalVersion !== CURRENT_LEGAL_VERSION) {
      throw new AppError(400, 'Please review and accept the latest StudyHub legal documents before creating your Google account.')
    }

    // New user → create immediately with zero enrollments
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
    const acceptedAt = new Date()

    const createdUser = await prisma.$transaction(async (tx) => {
      const createdUserRecord = await tx.user.create({
        data: {
          username,
          passwordHash,
          email: googlePayload.email,
          emailVerified: isGoogleEmailVerified,
          googleId: googlePayload.googleId,
          authProvider: 'google',
          avatarUrl: googlePayload.picture || null,
          termsAcceptedVersion: CURRENT_LEGAL_VERSION,
          termsAcceptedAt: acceptedAt,
        },
        select: { id: true },
      })

      await recordCurrentRequiredLegalAcceptancesTx(tx, createdUserRecord.id, {
        acceptedAt,
        source: LEGAL_ACCEPTANCE_SOURCES.GOOGLE_SIGNUP,
      })

      return createdUserRecord
    })

    const authenticatedUser = await issueAuthenticatedSession(res, createdUser.id)
    return res.status(201).json({
      message: 'Account created with Google!',
      user: authenticatedUser,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

module.exports = router
