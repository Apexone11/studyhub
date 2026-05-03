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
const { markTokenUsed } = require('../../lib/usedTokenCache')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')

const VALID_ACCOUNT_TYPES = ['student', 'teacher', 'other']
const TEMP_TOKEN_EXPIRES_IN = '15m'
const TEMP_TOKEN_EXPIRES_MS = 15 * 60 * 1000
const TEMP_TOKEN_TYPE = 'google_pending'

function getJwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured.')
  return process.env.JWT_SECRET
}

function signGoogleTempToken(googlePayload) {
  // Include a random jti so each issued tempToken can be marked single-use
  // at the point of consumption. See `lib/usedTokenCache.js` for rationale.
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
    {
      expiresIn: TEMP_TOKEN_EXPIRES_IN,
      jwtid: crypto.randomUUID(),
    },
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
    return sendError(res, 400, 'Google credential is required.', ERROR_CODES.BAD_REQUEST)
  }
  if (!isGoogleOAuthEnabled()) {
    return sendError(res, 503, 'Google sign-in is not available right now.', ERROR_CODES.INTERNAL)
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
      return sendError(res, 409, msg, ERROR_CODES.CONFLICT)
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
  const {
    tempToken,
    accountType,
    legalAccepted,
    legalVersion,
    password: requestedPassword,
    username: requestedUsername,
  } = req.body || {}

  if (!tempToken) {
    return sendError(
      res,
      400,
      'Signup session missing. Start Google sign-in again.',
      ERROR_CODES.BAD_REQUEST,
    )
  }
  if (!accountType || !VALID_ACCOUNT_TYPES.includes(accountType)) {
    return sendError(
      res,
      400,
      `accountType must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`,
      ERROR_CODES.VALIDATION,
    )
  }
  if (!legalAccepted || legalVersion !== CURRENT_LEGAL_VERSION) {
    return sendError(
      res,
      400,
      'Please review and accept the latest StudyHub legal documents before continuing.',
      ERROR_CODES.VALIDATION,
    )
  }
  if (!isGoogleOAuthEnabled()) {
    return sendError(res, 503, 'Google sign-in is not available right now.', ERROR_CODES.INTERNAL)
  }

  // Optional: caller may set a real password during onboarding so the
  // "Confirm with Password" gate (delete account, change email, etc.)
  // works for OAuth users. If absent, we fall back to a 32-byte random
  // hash they can't use — exactly the legacy behavior. If provided, it
  // must match the same strength rule as the local-signup flow.
  let userSuppliedPassword = null
  if (requestedPassword !== undefined && requestedPassword !== null && requestedPassword !== '') {
    if (
      typeof requestedPassword !== 'string' ||
      requestedPassword.length < 8 ||
      !/[A-Z]/.test(requestedPassword) ||
      !/[0-9]/.test(requestedPassword)
    ) {
      return sendError(
        res,
        400,
        'Password must be at least 8 characters with one capital letter and one number.',
        ERROR_CODES.VALIDATION,
      )
    }
    userSuppliedPassword = requestedPassword
  }

  // Optional: caller may set a custom username during onboarding so we
  // don't auto-derive a colliding one from email/name. The shape is
  // checked by the existing USERNAME_REGEX. If absent, fall back to
  // the existing buildGoogleUsernameBase + collision-retry loop.
  let userSuppliedUsername = null
  if (requestedUsername !== undefined && requestedUsername !== null && requestedUsername !== '') {
    if (typeof requestedUsername !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(requestedUsername)) {
      return sendError(
        res,
        400,
        'Username must be 3-20 chars: letters, numbers, or underscore.',
        ERROR_CODES.VALIDATION,
      )
    }
    userSuppliedUsername = requestedUsername
  }

  let pending
  try {
    pending = verifyGoogleTempToken(tempToken)
  } catch {
    return sendError(
      res,
      400,
      'Signup session expired. Start Google sign-in again.',
      ERROR_CODES.BAD_REQUEST,
    )
  }

  // Enforce single-use on the tempToken. Even though the token is signed and
  // expires in 15 minutes, a replay within that window (e.g., an attacker
  // racing the user after observing the token) could otherwise create an
  // account tied to the victim's Google identity. Marking by `jti`
  // guarantees the second call sees TOKEN_ALREADY_USED and is rejected
  // before any Prisma write happens.
  if (!pending.jti) {
    // Legacy tokens issued before this guard was added will not have a jti.
    // Fail closed — the user can restart Google sign-in to get a fresh token.
    return sendError(
      res,
      400,
      'Signup session is missing a required field. Start Google sign-in again.',
      ERROR_CODES.BAD_REQUEST,
    )
  }
  try {
    markTokenUsed(pending.jti, TEMP_TOKEN_EXPIRES_MS)
  } catch (err) {
    if (err?.code === 'TOKEN_ALREADY_USED') {
      return sendError(
        res,
        400,
        'This signup session has already been used. Start Google sign-in again.',
        ERROR_CODES.BAD_REQUEST,
      )
    }
    throw err
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
      return sendError(
        res,
        409,
        'An account with this email already exists. Log in with your password, then link Google from Settings > Security.',
        ERROR_CODES.CONFLICT,
      )
    }

    // Hash the user-supplied password if they set one in onboarding,
    // otherwise burn 32 random bytes so the row has a non-empty hash but
    // nothing the user could ever guess. The point is to ensure
    // password-confirmation gates (delete, email change) can be flipped
    // on later without crashing.
    const passwordToHash = userSuppliedPassword || crypto.randomBytes(32).toString('hex')
    const passwordHash = await bcrypt.hash(passwordToHash, 12)
    const acceptedAt = new Date()

    const baseUsername =
      userSuppliedUsername ||
      buildGoogleUsernameBase({
        name: pending.name,
        email: pending.email,
      })
    let createdUser = null
    // If the user picked a username explicitly, honor it on attempt 0
    // and DON'T fall through to numeric-suffix retry on collision —
    // we'd rather 409 back so the onboarding form can prompt them to
    // pick a different one. Auto-derived usernames keep the legacy
    // retry loop to avoid 100% collision failures on common email
    // prefixes (john@, mike@).
    const maxAttempts = userSuppliedUsername ? 1 : MAX_GOOGLE_USERNAME_ATTEMPTS

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const username = userSuppliedUsername || buildGoogleUsernameCandidate(baseUsername, attempt)

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
        if (targets.includes('username')) {
          // If the user picked the username themselves, surface the
          // collision so they can pick a different one. The /check-username
          // endpoint should have caught this earlier, but it's a TOCTOU
          // window — between check and create another signup could grab
          // the same name.
          if (userSuppliedUsername) {
            return sendError(
              res,
              409,
              'That username is already taken. Pick another and try again.',
              ERROR_CODES.CONFLICT,
            )
          }
          continue
        }
        if (targets.includes('email')) {
          return sendError(
            res,
            409,
            'An account with this email already exists. Try signing in with your original Google account.',
            ERROR_CODES.CONFLICT,
          )
        }
        if (targets.includes('googleId')) {
          return sendError(
            res,
            409,
            'This Google account is already linked to another user.',
            ERROR_CODES.CONFLICT,
          )
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
    return sendError(
      res,
      400,
      'Authorization code and redirectUri are required.',
      ERROR_CODES.BAD_REQUEST,
    )
  }
  if (!isGoogleOAuthEnabled()) {
    return sendError(res, 503, 'Google sign-in is not available right now.', ERROR_CODES.INTERNAL)
  }

  // Defense-in-depth: validate redirect_uri against server-side allowlist.
  // Each entry is safe-parsed so a malformed env var fails closed (400) not 500.
  const allowedRaw = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:4173',
    'capacitor://localhost',
    'https://localhost',
    'http://localhost',
  ].filter(Boolean)
  const allowedOriginSet = new Set()
  for (const raw of allowedRaw) {
    try {
      allowedOriginSet.add(new URL(raw).origin)
    } catch {
      /* skip malformed */
    }
  }
  const uriOrigin = (() => {
    try {
      return new URL(redirectUri).origin
    } catch {
      return null
    }
  })()
  if (!uriOrigin || !allowedOriginSet.has(uriOrigin)) {
    return sendError(res, 400, 'Invalid redirect URI.', ERROR_CODES.VALIDATION)
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
      return sendError(res, 409, msg, ERROR_CODES.CONFLICT)
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
