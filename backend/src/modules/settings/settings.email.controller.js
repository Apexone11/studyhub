const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../../lib/prisma')
const {
  VERIFICATION_PURPOSE,
  consumeChallenge,
  createSettingsEmailChallenge,
  getUserActiveChallenge,
  resendSettingsEmailChallenge,
  verifyChallengeCode,
} = require('../../lib/verification/verificationChallenges')
const { twoFaLimiter } = require('./settings.constants')
const {
  normalizeEmail,
  serializePendingEmailVerification,
  sendSettingsVerificationEmail,
  getSettingsUser,
  handleSettingsError,
} = require('./settings.service')

const router = express.Router()

router.patch('/email', twoFaLimiter, async (req, res) => {
  const { email, password } = req.body || {}

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password confirmation are required.' })
  }

  try {
    const trimmedEmail = normalizeEmail(email)
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' })
    if (trimmedEmail === user.email) {
      return res.status(400).json({ error: 'New email must be different from current email.' })
    }

    const conflictingUser = await prisma.user.findFirst({
      where: {
        email: trimmedEmail,
        id: { not: user.id },
      },
      select: { id: true },
    })
    if (conflictingUser) {
      return res.status(409).json({ error: 'That email is already in use.' })
    }

    const { challenge, code } = await createSettingsEmailChallenge({
      user,
      email: trimmedEmail,
    })

    try {
      await sendSettingsVerificationEmail(trimmedEmail, user.username, code, {
        route: req.originalUrl,
        method: req.method,
        purpose: VERIFICATION_PURPOSE.SETTINGS_EMAIL,
      })
    } catch (error) {
      await consumeChallenge(challenge.id)
      throw error
    }

    const updated = await getSettingsUser(user.id)

    return res.json({
      message:
        'Email update started. Enter the verification code sent to your inbox to finish setup.',
      verificationRequired: true,
      user: updated,
      pendingEmailVerification: updated?.pendingEmailVerification || null,
    })
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

router.post('/email/verify', twoFaLimiter, async (req, res) => {
  const body = req.body || {}
  const code = typeof body.code === 'string' ? body.code.trim() : ''

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit verification code.' })
  }

  try {
    const activeChallenge = await getUserActiveChallenge(
      req.user.userId,
      VERIFICATION_PURPOSE.SETTINGS_EMAIL,
    )
    if (!activeChallenge) {
      return res.status(400).json({ error: 'No email verification is currently in progress.' })
    }

    const conflictingUser = await prisma.user.findFirst({
      where: {
        email: activeChallenge.email,
        id: { not: req.user.userId },
      },
      select: { id: true },
    })
    if (conflictingUser) {
      return res.status(409).json({ error: 'That email is already in use.' })
    }

    const verifiedChallenge = await verifyChallengeCode(
      activeChallenge.token,
      VERIFICATION_PURPOSE.SETTINGS_EMAIL,
      code,
    )

    await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        email: verifiedChallenge.email,
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
      },
    })

    await consumeChallenge(verifiedChallenge.id)
    const updated = await getSettingsUser(req.user.userId)

    return res.json({
      message: 'Email verified successfully.',
      user: updated,
    })
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

router.post('/email/resend-verification', twoFaLimiter, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, username: true, email: true, emailVerified: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    let challenge = await getUserActiveChallenge(user.id, VERIFICATION_PURPOSE.SETTINGS_EMAIL)
    let code

    if (challenge) {
      const refreshed = await resendSettingsEmailChallenge(user.id)
      challenge = refreshed.challenge
      code = refreshed.code
    } else {
      if (!user.email) {
        return res
          .status(400)
          .json({ error: 'Add an email address before requesting a verification code.' })
      }
      if (user.emailVerified) {
        return res.status(400).json({ error: 'Your email is already verified.' })
      }

      const created = await createSettingsEmailChallenge({ user, email: user.email })
      challenge = created.challenge
      code = created.code
    }

    try {
      await sendSettingsVerificationEmail(challenge.email, user.username, code, {
        route: req.originalUrl,
        method: req.method,
        purpose: VERIFICATION_PURPOSE.SETTINGS_EMAIL,
      })
    } catch (error) {
      if (!challenge.verifiedAt && challenge.sendCount === 1) {
        await consumeChallenge(challenge.id)
      }
      throw error
    }

    const updated = await getSettingsUser(user.id)
    return res.json({
      message: 'A new verification code has been sent to your email.',
      pendingEmailVerification:
        updated?.pendingEmailVerification || serializePendingEmailVerification(challenge),
      user: updated,
    })
  } catch (error) {
    return handleSettingsError(req, res, error)
  }
})

module.exports = router
