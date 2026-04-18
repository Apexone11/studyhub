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
const rateLimit = require('express-rate-limit')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { rotateDeviceId } = require('../../lib/deviceCookie')
const { clearAuthCookie } = require('../../lib/authTokens')
const { WINDOW_1_HOUR } = require('../../lib/constants')

const router = express.Router()

const panicLimiter = rateLimit({
  windowMs: WINDOW_1_HOUR,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `panic-${req.user?.userId || 'anon'}`,
  message: { error: 'Too many panic requests. Please wait an hour.' },
})

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
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`
        void sendPasswordReset(user.email, user.username, resetUrl).catch(() => {})
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
    return res.json({ message: 'All sessions revoked. Check your email to reset your password.' })
  } catch {
    return sendError(res, 500, 'Panic action failed. Please try again.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
