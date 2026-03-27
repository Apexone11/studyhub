const express = require('express')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { captureError } = require('../../monitoring/sentry')
const { sendPasswordReset } = require('../../lib/email/email')
const { hashStoredSecret } = require('../../lib/authTokens')
const prisma = require('../../lib/prisma')
const { PASSWORD_MIN_LENGTH } = require('./auth.constants')
const { forgotLimiter } = require('./auth.constants')
const { handleAuthError } = require('./auth.service')

const router = express.Router()

router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const body = req.body || {}
  // Accept either { identifier } (new) or { username } (legacy compat)
  const rawIdentifier = typeof body.identifier === 'string' ? body.identifier.trim()
    : typeof body.username === 'string' ? body.username.trim()
      : ''
  const GENERIC_MESSAGE = 'If an account exists with that username or email, a reset link has been sent.'

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
    console.error(error)
    return res.json({ message: GENERIC_MESSAGE })
  }
})

router.post('/reset-password', forgotLimiter, async (req, res) => {
  const body = req.body || {}
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required.' })
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` })
  }
  if (!/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return res.status(400).json({ error: 'Password must include at least one capital letter and one number.' })
  }

  try {
    const tokenHash = hashStoredSecret(token)
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    })

    if (!resetToken || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired. Please request a new one.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
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

module.exports = router
