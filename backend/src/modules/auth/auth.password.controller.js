const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { sendPasswordReset } = require('../../lib/email/email')
const { hashStoredSecret } = require('../../lib/authTokens')
const { isPasswordPwned } = require('../../lib/passwordSafety')
const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const { PASSWORD_MIN_LENGTH } = require('./auth.constants')
const { forgotLimiter } = require('./auth.constants')
const { writeLimiter } = require('../../lib/rateLimiters')
const { handleAuthError } = require('./auth.service')

const requireTrustedOrigin = originAllowlist()

const router = express.Router()

router.post('/forgot-password', requireTrustedOrigin, forgotLimiter, async (req, res) => {
  const body = req.body || {}
  // Accept either { identifier } (new) or { username } (legacy compat)
  const rawIdentifier =
    typeof body.identifier === 'string'
      ? body.identifier.trim()
      : typeof body.username === 'string'
        ? body.username.trim()
        : ''
  const GENERIC_MESSAGE =
    'If an account exists with that username or email, a reset link has been sent.'

  if (!rawIdentifier) {
    return res.json({ message: GENERIC_MESSAGE })
  }

  try {
    // Determine lookup strategy: email (contains @) or username
    const isEmailLookup = rawIdentifier.includes('@')
    const user = isEmailLookup
      ? await prisma.user.findUnique({ where: { email: rawIdentifier.toLowerCase() } })
      : await prisma.user.findUnique({ where: { username: rawIdentifier } })

    if (user && user.email) {
      const token = crypto.randomBytes(32).toString('hex')
      const tokenHash = hashStoredSecret(token)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

      await prisma.passwordResetToken.upsert({
        where: { userId: user.id },
        create: { userId: user.id, token: tokenHash, expiresAt },
        update: { token: tokenHash, expiresAt },
      })

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`
      await sendPasswordReset(user.email, user.username, resetUrl)
    }

    return res.json({ message: GENERIC_MESSAGE })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    log.error(
      { event: 'auth.password_reset_request_failed', err: error?.message || 'unknown error' },
      'Password reset request failed',
    )
    return res.json({ message: GENERIC_MESSAGE })
  }
})

router.post('/reset-password', requireTrustedOrigin, forgotLimiter, async (req, res) => {
  const body = req.body || {}
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!token || !newPassword) {
    return sendError(res, 400, 'Token and new password are required.', ERROR_CODES.BAD_REQUEST)
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return sendError(
      res,
      400,
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      ERROR_CODES.VALIDATION,
    )
  }
  if (!/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return sendError(
      res,
      400,
      'Password must include at least one capital letter and one number.',
      ERROR_CODES.VALIDATION,
    )
  }

  try {
    const tokenHash = hashStoredSecret(token)
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    })

    if (!resetToken || resetToken.expiresAt < new Date()) {
      return sendError(
        res,
        400,
        'Reset link is invalid or has expired. Please request a new one.',
        ERROR_CODES.VALIDATION,
      )
    }

    // NIST 800-63B §5.1.1.2 + OWASP ASVS V2.1.1 — reject same-as-current on
    // reset. If the user is here it's either a forgotten password or a
    // compromised credential; setting the same string defeats the rotation.
    // The user row is already loaded via `include: { user: true }`, so no
    // extra query. We don't check full history (no UserPasswordHistory table
    // yet — separate plan). Google-signup users with no passwordHash skip
    // this (correct — there's no current credential to differ from).
    if (resetToken.user?.passwordHash) {
      const sameAsCurrent = await bcrypt.compare(newPassword, resetToken.user.passwordHash)
      if (sameAsCurrent) {
        return sendError(
          res,
          400,
          'New password must be different from your current password.',
          ERROR_CODES.PASSWORD_UNCHANGED,
        )
      }
    }

    // Check against HIBP before allowing password reset
    try {
      const { checkPasswordBreach } = require('../../lib/passwordSafety')
      const breach = await checkPasswordBreach(newPassword)
      if (breach.breached) {
        return sendError(
          res,
          400,
          `This password has appeared in ${breach.count.toLocaleString()} data breaches. Please choose a different password.`,
          ERROR_CODES.BREACHED_PASSWORD,
          { breachCount: breach.count },
        )
      }
    } catch {
      /* HIBP unreachable — allow reset to proceed */
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        // The user just chose a password they know; flip the flag so
        // they can confirm sensitive ops with it. Especially important
        // for Google-signup users who used forgot-password as the
        // workaround to set a real password (legacy behavior, kept
        // working).
        passwordSetByUser: true,
        failedAttempts: 0,
        lockedUntil: null,
      },
    })
    await prisma.passwordResetToken.delete({ where: { token: tokenHash } })

    return res.json({ message: 'Password updated successfully.' })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

/**
 * POST /api/auth/set-password
 *
 * One-time password setter for users whose `passwordSetByUser` is
 * still false — i.e. Google-signup users who never chose a password.
 * After this call:
 *   - they can confirm sensitive ops (delete account, change email,
 *     change password) by entering the password they just chose
 *   - they can fall back to email/password login if Google is
 *     unavailable
 *
 * Refuses to run for users who already have `passwordSetByUser =
 * true` — those callers must use `PATCH /api/settings/password`
 * (which requires the existing password). This prevents anyone who
 * gains short-lived session access from rotating the password
 * silently to lock the real owner out.
 */
router.post('/set-password', requireAuth, requireTrustedOrigin, writeLimiter, async (req, res) => {
  const { newPassword } = req.body || {}
  if (!newPassword || typeof newPassword !== 'string') {
    return sendError(res, 400, 'Password is required.', ERROR_CODES.BAD_REQUEST)
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return sendError(
      res,
      400,
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      ERROR_CODES.VALIDATION,
    )
  }
  if (!/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return sendError(
      res,
      400,
      'Password must include at least one capital letter and one number.',
      ERROR_CODES.VALIDATION,
    )
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, passwordSetByUser: true },
    })
    if (!user) {
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
    }
    if (user.passwordSetByUser) {
      // Don't let a session-hijack rotate the password silently. The
      // legit "I want a different password" path is the existing
      // `PATCH /api/settings/password`, which requires the current
      // password. This endpoint is one-time-use only.
      return sendError(
        res,
        409,
        'Password already set. Use Settings → Security to change it.',
        ERROR_CODES.CONFLICT,
      )
    }

    // HIBP breach check (NIST 800-63B §5.1.1.2). Fail-OPEN if HIBP
    // is unreachable so users aren't blocked by a network blip.
    try {
      const pwned = await isPasswordPwned(newPassword)
      if (pwned) {
        return sendError(
          res,
          400,
          'This password appears in known breach lists. Please choose another.',
          ERROR_CODES.VALIDATION,
        )
      }
    } catch {
      /* HIBP unreachable — proceed */
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordSetByUser: true },
    })

    return res.json({ message: 'Password set successfully.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return handleAuthError(req, res, error)
  }
})

module.exports = router
