const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../../lib/prisma')
const {
  verifyGoogleIdToken,
  findUserByGoogleId,
  linkGoogleToUser,
  unlinkGoogleFromUser,
  isGoogleOAuthEnabled,
} = require('../../lib/googleAuth')
const { twoFaLimiter } = require('./settings.constants')
const { getSettingsUser, handleSettingsError } = require('./settings.service')

const router = express.Router()

router.post('/google/link', twoFaLimiter, async (req, res) => {
  const { credential } = req.body || {}

  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required.' })
  }
  if (!isGoogleOAuthEnabled()) {
    return res.status(503).json({ error: 'Google sign-in is not available right now.' })
  }

  try {
    const googlePayload = await verifyGoogleIdToken(credential)

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })
    if (user.googleId) {
      return res.status(400).json({ error: 'A Google account is already linked.' })
    }

    const existingGoogleUser = await findUserByGoogleId(googlePayload.googleId)
    if (existingGoogleUser) {
      return res.status(409).json({ error: 'That Google account is already linked to another user.' })
    }

    await linkGoogleToUser(user.id, googlePayload.googleId)
    const updated = await getSettingsUser(user.id)

    return res.json({
      message: 'Google account linked successfully.',
      user: updated,
    })
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

router.patch('/google/unlink', twoFaLimiter, async (req, res) => {
  const { password } = req.body || {}

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })
    if (!user.googleId) {
      return res.status(400).json({ error: 'No Google account is linked.' })
    }

    if (user.authProvider === 'google') {
      return res.status(400).json({
        error: 'Set a password before unlinking Google. Your account was created with Google and has no password.',
      })
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required to unlink Google.' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    await unlinkGoogleFromUser(user.id)
    const updated = await getSettingsUser(user.id)

    return res.json({
      message: 'Google account unlinked.',
      user: updated,
    })
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

module.exports = router
