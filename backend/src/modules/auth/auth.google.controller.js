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

const router = express.Router()

/**
 * POST /api/auth/google
 * Google OAuth: sign in existing user OR create a new account immediately.
 * School/course selection is no longer part of registration — users
 * personalize later via /my-courses.
 */
router.post('/google', googleLimiter, async (req, res) => {
  const { credential } = req.body || {}

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

    // Existing user by email → reject (security: no auto-link)
    const existingByEmail = await findUserByEmail(googlePayload.email)
    if (existingByEmail) {
      const msg = existingByEmail.authProvider === 'google'
        ? 'An account with this email already exists. Try signing in with your original Google account.'
        : 'An account with this email already exists. Log in with your password, then link Google from Settings > Security.'
      return res.status(409).json({ error: msg })
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

    const createdUser = await prisma.user.create({
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
