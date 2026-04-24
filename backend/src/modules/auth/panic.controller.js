/**
 * POST /api/auth/security/panic
 *
 * "Kill the house lights" button. Revokes every session, revokes every
 * trusted device, rotates the sh_did cookie, fires a password-reset email
 * so the user can pick a new password from scratch.
 *
 * Rate limited to 3/hour per user — this is a crisis action, not
 * something we want spammed.
 */

const express = require('express')
const prisma = require('../../lib/prisma')
const requireAuth = require('../../middleware/auth')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { rotateDeviceId } = require('../../lib/deviceCookie')
const { clearAuthCookie } = require('../../lib/authTokens')
const { panicLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

router.post('/security/panic', requireAuth, panicLimiter, async (req, res) => {
  try {
    const userId = req.user.userId
    const now = new Date()

    // Revoke all sessions for this user
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    })

    // Revoke all trusted devices
    await prisma.trustedDevice
      .updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      })
      .catch(() => {})

    // Rotate the sh_did cookie so the current browser becomes an unknown device
    try {
      rotateDeviceId(res)
    } catch {
      // non-fatal
    }

    // Fire the password reset flow so the user can pick a new password.
    // Inlined rather than importing the /forgot-password route — that endpoint
    // is public and has its own rate limiter; we're already rate-limited here.
    try {
      // FRONTEND_URL must be set explicitly outside dev. Falling back to
      // `localhost:5173` in prod would email a broken reset URL to a user
      // mid-incident — worse than just not sending. We still create the
      // PasswordResetToken row (so a hand-crafted reset link or a separate
      // flow can pick it up) but skip the email send and let Sentry log it.
      const isDevEnv = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging'
      const baseUrl = process.env.FRONTEND_URL || (isDevEnv ? 'http://localhost:5173' : null)

      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (user?.email) {
        const crypto = require('crypto')
        const { sendPasswordReset } = require('../../lib/email/email')
        const { hashStoredSecret } = require('../../lib/authTokens')
        const token = crypto.randomBytes(32).toString('hex')
        const tokenHash = hashStoredSecret(token)
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
        await prisma.passwordResetToken.upsert({
          where: { userId: user.id },
          create: { userId: user.id, token: tokenHash, expiresAt },
          update: { token: tokenHash, expiresAt },
        })
        if (baseUrl) {
          const resetUrl = `${baseUrl}/reset-password?token=${token}`
          void sendPasswordReset(user.email, user.username, resetUrl).catch(() => {})
        } else {
          const { captureError } = require('../../monitoring/sentry')
          captureError(new Error('panic: FRONTEND_URL unset, skipping reset email'), {
            route: 'auth.panic',
            userId,
            reason: 'frontend_url_missing',
          })
        }
      }
    } catch {
      // password reset is best-effort — panic response must succeed anyway
    }

    // Log the event
    await prisma.securityEvent
      .create({
        data: {
          userId,
          eventType: 'security.panic',
          ipAddress: req?.ip ? String(req.ip).slice(0, 45) : null,
          userAgent: req?.headers?.['user-agent']
            ? String(req.headers['user-agent']).slice(0, 512)
            : null,
          metadata: { trigger: 'user' },
        },
      })
      .catch(() => {})

    clearAuthCookie(res)
    // Deliberately conditional phrasing: the password-reset email is
    // best-effort (we swallow failures above so the panic action
    // itself always succeeds). Promising "Check your email" would be
    // a lie when SMTP is down or no email is on file — "If your
    // account has..." keeps the message honest under every branch.
    return res.json({
      message:
        "All sessions revoked. If your account has an email on file, you'll receive a password reset link shortly.",
    })
  } catch {
    return sendError(res, 500, 'Panic action failed. Please try again.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
