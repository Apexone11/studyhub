const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../../lib/prisma')
const { signAuthToken, setAuthCookie } = require('../../lib/authTokens')
const { deleteUserAccount } = require('../../lib/deleteUserAccount')
const { twoFaLimiter, USERNAME_REGEX } = require('./settings.constants')
const { getSettingsUser, handleSettingsError } = require('./settings.service')

const router = express.Router()

router.get('/me', async (req, res) => {
  try {
    const user = await getSettingsUser(req.user.userId)
    if (!user) return res.status(404).json({ error: 'User not found.' })
    return res.json(user)
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

router.patch('/password', twoFaLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' })
  }
  if (!/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return res.status(400).json({ error: 'New password must include at least one capital letter and one number.' })
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
    return handleSettingsError(req, res, error)
  }
})

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

    const updatedTokenUser = await prisma.user.update({
      where: { id: user.id },
      data: { username: trimmed },
    })
    const updated = await getSettingsUser(user.id)

    const token = signAuthToken(updatedTokenUser)
    setAuthCookie(res, token)
    return res.json({
      message: 'Username updated successfully.',
      user: updated,
    })
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

router.delete('/account', twoFaLimiter, async (req, res) => {
  const { password, reason, details } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Password is required to delete your account.' })
  if (!reason) return res.status(400).json({ error: 'Please select a reason for leaving.' })

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })

    await deleteUserAccount(prisma, {
      userId: user.id,
      username: user.username,
      reason,
      details,
    })

    return res.json({ message: 'Account deleted.' })
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

module.exports = router
