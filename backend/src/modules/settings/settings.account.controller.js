const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../../lib/prisma')
const { clearAuthCookie, signAuthToken, setAuthCookie } = require('../../lib/authTokens')
const { deleteUserAccount } = require('../../lib/deleteUserAccount')
const { getUserPII, setUserPII } = require('../../lib/piiVault')
const {
  sanitizeAge,
  sanitizeBio,
  sanitizeDisplayName,
  sanitizeLocation,
  sanitizeProfileFieldVisibility,
  sanitizeProfileLinks,
} = require('../../lib/profileMetadata')
const { twoFaLimiter, USERNAME_REGEX } = require('./settings.constants')
const { AppError, getSettingsUser, handleSettingsError } = require('./settings.service')

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

router.patch('/profile', async (req, res) => {
  const body = req.body || {}

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const userUpdates = {}

    if (Object.hasOwn(body, 'displayName')) {
      userUpdates.displayName = sanitizeDisplayName(body.displayName)
    }
    if (Object.hasOwn(body, 'bio')) {
      userUpdates.bio = sanitizeBio(body.bio)
    }
    if (Object.hasOwn(body, 'profileLinks')) {
      userUpdates.profileLinks = sanitizeProfileLinks(body.profileLinks)
    }

    const hasVisibilityUpdate = Object.hasOwn(body, 'profileFieldVisibility')
    const profileFieldVisibility = hasVisibilityUpdate
      ? sanitizeProfileFieldVisibility(body.profileFieldVisibility)
      : null

    const hasAgeUpdate = Object.hasOwn(body, 'age')
    const hasLocationUpdate = Object.hasOwn(body, 'location')
    const hasSensitiveProfileUpdate = hasAgeUpdate || hasLocationUpdate

    if (!hasVisibilityUpdate && !hasSensitiveProfileUpdate && Object.keys(userUpdates).length === 0) {
      throw new AppError(400, 'No valid profile fields were provided.')
    }

    if (hasSensitiveProfileUpdate) {
      const keyArn = process.env.KMS_KEY_ARN || ''
      if (!keyArn.startsWith('arn:aws:kms:')) {
        throw new AppError(
          503,
          'Sensitive profile fields are unavailable until AWS KMS is configured.',
        )
      }

      const existingPii = (await getUserPII(user.id, {
        id: req.user.userId,
        role: req.user.role,
        route: req.originalUrl,
        method: req.method,
      }).catch(() => null)) || {}

      const nextPii = { ...existingPii }
      if (hasAgeUpdate) nextPii.age = sanitizeAge(body.age)
      if (hasLocationUpdate) nextPii.location = sanitizeLocation(body.location)

      await setUserPII(user.id, nextPii, {
        id: req.user.userId,
        role: req.user.role,
        route: req.originalUrl,
        method: req.method,
      }).catch(() => {
        throw new AppError(
          503,
          'Sensitive profile fields could not be saved securely right now. Please try again later.',
        )
      })
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(userUpdates).length > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: userUpdates,
        })
      }

      if (hasVisibilityUpdate) {
        await tx.userPreferences.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            profileFieldVisibility,
          },
          update: {
            profileFieldVisibility,
          },
        })
      }
    })

    const updated = await getSettingsUser(user.id)
    return res.json({
      message: 'Profile updated successfully.',
      user: updated,
    })
  } catch (error) {
    if (!(error instanceof AppError) && error?.message) {
      return handleSettingsError(req, res, new AppError(400, error.message))
    }
    return handleSettingsError(req, res, error)
  }
})

const VALID_ACCOUNT_TYPES = ['student', 'teacher', 'other']

router.patch('/account-type', async (req, res) => {
  const { accountType } = req.body || {}

  if (!accountType || !VALID_ACCOUNT_TYPES.includes(accountType)) {
    return res.status(400).json({ error: 'Account type must be student, teacher, or other.' })
  }

  try {
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { accountType },
    })
    const user = await getSettingsUser(req.user.userId)
    return res.json({ message: 'Account type updated.', user })
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

    clearAuthCookie(res)
    return res.json({ message: 'Account deleted.' })
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

module.exports = router
