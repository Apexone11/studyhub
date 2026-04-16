const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const {
  verifyGoogleIdToken,
  findUserByGoogleId,
  findUserByEmail,
  isGoogleOAuthEnabled,
} = require('../../lib/googleAuth')
const prisma = require('../../lib/prisma')
const { googleLimiter } = require('./auth.constants')
const { googleCompleteLimiter } = require('../../lib/rateLimiters')
const { AppError, issueAuthenticatedSession, handleAuthError } = require('./auth.service')
const {
  CURRENT_LEGAL_VERSION,
  LEGAL_ACCEPTANCE_SOURCES,
  recordCurrentRequiredLegalAcceptancesTx,
} = require('../legal/legal.service')

const VALID_ACCOUNT_TYPES = ['student', 'teacher', 'other']
const TEMP_TOKEN_EXPIRES_IN = '15m'
const TEMP_TOKEN_TYPE = 'google_pending'

function getJwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured.')
  return process.env.JWT_SECRET
}

function signGoogleTempToken(googlePayload) {
  return jwt.sign(
    {
      typ: TEMP_TOKEN_TYPE,
      email: googlePayload.email,
      name: googlePayload.name || null,
      picture: googlePayload.picture || null,
      googleId: googlePayload.googleId,
      emailVerified: Boolean(googlePayload.emailVerified),
    },
    getJwtSecret(),
    { expiresIn: TEMP_TOKEN_EXPIRES_IN },
  )
}

function verifyGoogleTempToken(token) {
  const payload = jwt.verify(token, getJwtSecret())
  if (payload?.typ !== TEMP_TOKEN_TYPE) {
    throw new Error('Invalid temp token type.')
  }
  return payload
}

function nextRouteForAccountType(accountType) {
  if (accountType === 'teacher') return '/onboarding?track=teacher'
  if (accountType === 'other') return '/onboarding?track=self-learner'
  return '/onboarding'
}

const router = express.Router()
const MAX_USERNAME_LENGTH = 20
const MAX_GOOGLE_USERNAME_ATTEMPTS = 1000

function buildGoogleUsernameBase(googlePayload) {
  const baseUsername = (googlePayload.name || googlePayload.email.split('@')[0] || 'user')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, MAX_USERNAME_LENGTH)

  return baseUsername || 'user'
}

function buildGoogleUsernameCandidate(baseUsername, attempt) {
  if (attempt === 0) return baseUsername

  const suffix = String(attempt)
  const maxBaseLength = Math.max(1, MAX_USERNAME_LENGTH - suffix.length)
  return `${baseUsername.slice(0, maxBaseLength)}${suffix}`
}

function getP2002Targets(error) {
  const targets = Array.isArray(error?.meta?.target)
    ? error.meta.target
    : [error?.meta?.target].filter(Boolean)

  return targets.map((target) => String(target))
}

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
      const authenticatedUser = await issueAuthenticatedSession(res, existingByGoogleId.id, req)
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
      const msg =
        existingByEmail.authProvider === 'google'
          ? 'An account with this email already exists. Try signing in with your original Google account.'
          : 'An account with this email already exists. Log in with your password, then link Google from Settings > Security.'
      return res.status(409).json({ error: msg })
    }

    // New user → do NOT create the row yet. Return a tempToken + profile
    // so the frontend can prompt for a role (see roles-and-permissions-plan.md §4).
    const tempToken = signGoogleTempToken(googlePayload)
    return res.json({
      status: 'needs_role',
      tempToken,
      email: googlePayload.email,
      name: googlePayload.name || null,
      avatarUrl: googlePayload.picture || null,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

/**
 * POST /api/auth/google/complete
 * Accepts { tempToken, accountType, legalAccepted, legalVersion }, verifies
 * the pending Google profile, creates the user with the chosen accountType,
 * issues a session cookie, and returns the authenticated user + next route.
 */
router.post('/google/complete', googleCompleteLimiter, async (req, res) => {
  const { tempToken, accountType, legalAccepted, legalVersion } = req.body || {}

  if (!tempToken) {
    return res.status(400).json({ error: 'Signup session missing. Start Google sign-in again.' })
  }
  if (!accountType || !VALID_ACCOUNT_TYPES.includes(accountType)) {
    return res.status(400).json({
      error: `accountType must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`,
    })
  }
  if (!legalAccepted || legalVersion !== CURRENT_LEGAL_VERSION) {
    return res.status(400).json({
      error: 'Please review and accept the latest StudyHub legal documents before continuing.',
    })
  }
  if (!isGoogleOAuthEnabled()) {
    return res.status(503).json({ error: 'Google sign-in is not available right now.' })
  }

  let pending
  try {
    pending = verifyGoogleTempToken(tempToken)
  } catch {
    return res.status(400).json({
      error: 'Signup session expired. Start Google sign-in again.',
    })
  }

  try {
    // Re-check for collisions in case an account was created meanwhile.
    const existingByGoogleId = await findUserByGoogleId(pending.googleId)
    if (existingByGoogleId) {
      const authenticatedUser = await issueAuthenticatedSession(res, existingByGoogleId.id, req)
      return res.json({
        status: 'signed_in',
        user: authenticatedUser,
        nextRoute: '/',
      })
    }

    const existingByEmail = await findUserByEmail(pending.email)
    if (existingByEmail) {
      return res.status(409).json({
        error:
          'An account with this email already exists. Log in with your password, then link Google from Settings > Security.',
      })
    }

    const randomPassword = crypto.randomBytes(32).toString('hex')
    const passwordHash = await bcrypt.hash(randomPassword, 12)
    const acceptedAt = new Date()

    const baseUsername = buildGoogleUsernameBase({
      name: pending.name,
      email: pending.email,
    })
    let createdUser = null

    for (let attempt = 0; attempt < MAX_GOOGLE_USERNAME_ATTEMPTS; attempt += 1) {
      const username = buildGoogleUsernameCandidate(baseUsername, attempt)

      try {
        createdUser = await prisma.$transaction(async (tx) => {
          const createdUserRecord = await tx.user.create({
            data: {
              username,
              passwordHash,
              email: pending.email,
              emailVerified: Boolean(pending.emailVerified),
              googleId: pending.googleId,
              authProvider: 'google',
              avatarUrl: pending.picture || null,
              accountType,
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

        break
      } catch (error) {
        if (error?.code !== 'P2002') throw error

        const targets = getP2002Targets(error)
        if (targets.includes('username')) continue
        if (targets.includes('email')) {
          return res.status(409).json({
            error:
              'An account with this email already exists. Try signing in with your original Google account.',
          })
        }
        if (targets.includes('googleId')) {
          return res.status(409).json({
            error: 'This Google account is already linked to another user.',
          })
        }
        throw error
      }
    }

    if (!createdUser) {
      throw new AppError(500, 'Unable to generate a unique username. Please try again.')
    }

    const authenticatedUser = await issueAuthenticatedSession(res, createdUser.id, req)
    return res.status(201).json({
      status: 'signed_in',
      user: authenticatedUser,
      nextRoute: nextRouteForAccountType(accountType),
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

/**
 * POST /api/auth/google/code
 * Redirect-flow fallback: the frontend navigated the user to Google's OAuth
 * consent page directly (bypassing the GIS iframe/popup). Google redirected
 * back with an authorization code. We exchange it for an ID token and proceed
 * exactly like POST /google.
 *
 * Body: { code: string, redirectUri: string }
 * redirectUri must match what the frontend used in the redirect.
 */
router.post('/google/code', googleLimiter, async (req, res) => {
  const { code, redirectUri } = req.body || {}

  if (!code || !redirectUri) {
    return res.status(400).json({ error: 'Authorization code and redirectUri are required.' })
  }
  if (!isGoogleOAuthEnabled()) {
    return res.status(503).json({ error: 'Google sign-in is not available right now.' })
  }

  try {
    // Exchange authorization code for tokens via Google's token endpoint.
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const err = await tokenResponse.json().catch(() => ({}))
      throw new AppError(401, err.error_description || 'Failed to exchange Google code.')
    }

    const tokens = await tokenResponse.json()
    if (!tokens.id_token) {
      throw new AppError(401, 'Google did not return an identity token.')
    }

    // Verify the ID token the same way POST /google does.
    let googlePayload
    try {
      googlePayload = await verifyGoogleIdToken(tokens.id_token)
    } catch {
      throw new AppError(401, 'Google sign-in failed. Please try again.')
    }

    // From here, identical logic to POST /google.
    const existingByGoogleId = await findUserByGoogleId(googlePayload.googleId)
    if (existingByGoogleId) {
      const authenticatedUser = await issueAuthenticatedSession(res, existingByGoogleId.id, req)
      return res.json({ message: 'Login successful!', user: authenticatedUser })
    }

    if (!googlePayload.emailVerified) {
      throw new AppError(403, 'Google account email must be verified before you can sign in.')
    }

    const existingByEmail = await findUserByEmail(googlePayload.email)
    if (existingByEmail) {
      const msg =
        existingByEmail.authProvider === 'google'
          ? 'An account with this email already exists. Try signing in with your original Google account.'
          : 'An account with this email already exists. Log in with your password, then link Google from Settings > Security.'
      return res.status(409).json({ error: msg })
    }

    const tempToken = signGoogleTempToken(googlePayload)
    return res.json({
      status: 'needs_role',
      tempToken,
      email: googlePayload.email,
      name: googlePayload.name || null,
      avatarUrl: googlePayload.picture || null,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

module.exports = router
