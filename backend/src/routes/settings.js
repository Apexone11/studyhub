const express = require('express')
const bcrypt = require('bcryptjs')
const rateLimit = require('express-rate-limit')
const { PrismaClient } = require('@prisma/client')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const { setAuthCookie, signAuthToken } = require('../lib/authTokens')

const twoFaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const router = express.Router()
const prisma = new PrismaClient()

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function sendError(req, res, error) {
  if (error.code === 'P2002') return res.status(409).json({ error: 'That username or email is already taken.' })
  captureError(error, { route: req.originalUrl, method: req.method })
  console.error(error)
  return res.status(500).json({ error: 'Server error. Please try again.' })
}

// All settings endpoints require authentication
router.use(requireAuth)

// ── GET /api/settings/me ──────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        emailVerified: true,
        twoFaEnabled: true,
        createdAt: true,
        _count: { select: { studySheets: true, enrollments: true } }
      }
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })
    return res.json(user)
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── PATCH /api/settings/password ────────────────────────────
router.patch('/password', twoFaLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' })
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' })
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from current password.' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' })

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

    return res.json({ message: 'Password updated successfully.' })
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── PATCH /api/settings/username ─────────────────────────────
router.patch('/username', async (req, res) => {
  const { newUsername, password } = req.body || {}

  if (!newUsername || !password) {
    return res.status(400).json({ error: 'New username and password confirmation are required.' })
  }

  const trimmed = newUsername.trim()
  if (!USERNAME_REGEX.test(trimmed)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters (letters, numbers, underscores only).' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    if (trimmed === user.username) {
      return res.status(400).json({ error: 'New username must be different from current username.' })
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { username: trimmed }
    })

    // Re-issue token with new username
    const token = signAuthToken(updated)
    setAuthCookie(res, token)
    return res.json({
      message: 'Username updated successfully.',
      user: { id: updated.id, username: updated.username, role: updated.role, email: updated.email, emailVerified: updated.emailVerified }
    })
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── PATCH /api/settings/email ────────────────────────────────
router.patch('/email', async (req, res) => {
  const { email, password } = req.body || {}

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password confirmation are required.' })
  }

  const trimmedEmail = email.trim().toLowerCase()
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    if (trimmedEmail === user.email) {
      return res.status(400).json({ error: 'New email must be different from current email.' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { email: trimmedEmail, emailVerified: false }
    })

    return res.json({ message: 'Email updated successfully.' })
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── PATCH /api/settings/2fa/enable ───────────────────────────
router.patch('/2fa/enable', twoFaLimiter, async (req, res) => {
  const { password } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Password is required.' })

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })
    if (!user.email) return res.status(400).json({ error: 'You must add an email address before enabling 2FA.' })
    if (user.twoFaEnabled) return res.status(400).json({ error: '2FA is already enabled.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    await prisma.user.update({ where: { id: user.id }, data: { twoFaEnabled: true } })
    return res.json({ twoFaEnabled: true, message: '2-step verification enabled.' })
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── PATCH /api/settings/2fa/disable ──────────────────────────
router.patch('/2fa/disable', twoFaLimiter, async (req, res) => {
  const { password } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Password is required.' })

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFaEnabled: false, twoFaCode: null, twoFaExpiry: null }
    })
    return res.json({ twoFaEnabled: false, message: '2-step verification disabled.' })
  } catch (error) {
    return sendError(req, res, error)
  }
})

// ── DELETE /api/settings/account ─────────────────────────────
router.delete('/account', twoFaLimiter, async (req, res) => {
  const { password, reason, details } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Password is required to delete your account.' })
  if (!reason)   return res.status(400).json({ error: 'Please select a reason for leaving.' })

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    // Save deletion reason before deleting user
    await prisma.deletionReason.create({
      data: {
        username: user.username,
        reason: String(reason).slice(0, 100),
        details: details ? String(details).slice(0, 300) : null,
      }
    })

    // Delete user — cascade handles sheets, notes, comments, reactions, etc.
    await prisma.user.delete({ where: { id: user.id } })

    return res.json({ message: 'Account deleted.' })
  } catch (error) {
    return sendError(req, res, error)
  }
})

module.exports = router
