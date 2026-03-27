const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../../lib/prisma')
const { checkAndPromoteTrust } = require('../../lib/trustGate')
const {
  VERIFICATION_PURPOSE,
  consumeChallenge,
  findChallengeByToken,
  sendOrRefreshLoginChallenge,
  verifyChallengeCode,
} = require('../../lib/verification/verificationChallenges')
const { loginLimiter, verificationLimiter } = require('./auth.constants')
const {
  AppError,
  normalizeEmail,
  sendVerificationCodeEmail,
  issueAuthenticatedSession,
  loginVerificationResponse,
  handleAuthError,
} = require('./auth.service')

const router = express.Router()

router.post('/login', loginLimiter, async (req, res) => {
  const body = req.body || {}
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!username || !password) {
    return res.status(400).json({ error: 'Please fill in both fields.' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return res.status(401).json({ error: 'Incorrect username or password.', showForgot: false })
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000)
      return res.status(429).json({
        error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
        locked: true,
        minutesLeft,
        showForgot: true,
      })
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)
    if (!isValidPassword) {
      const newFailedAttempts = user.failedAttempts + 1
      const shouldLock = newFailedAttempts >= 5
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: newFailedAttempts,
          lockedUntil: shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      })

      if (shouldLock) {
        return res.status(429).json({
          error: 'Too many failed attempts. Account locked for 15 minutes.',
          locked: true,
          minutesLeft: 15,
          showForgot: true,
        })
      }

      const attemptsLeft = 5 - newFailedAttempts
      return res.status(401).json({
        error: `Incorrect username or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
        showForgot: newFailedAttempts >= 1,
      })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    })

    /* Email verification gate removed in v1.5.0 — Google handles its own
     * verification, and local accounts no longer require verified email to log in.
     * The old verification challenge flow is preserved in the /login/verification/*
     * endpoints for backwards compatibility but is no longer triggered. */

    const authenticatedUser = await issueAuthenticatedSession(res, user.id)
    void checkAndPromoteTrust(user.id)
    return res.json({
      message: 'Login successful!',
      user: authenticatedUser,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

router.post('/login/verification/send', verificationLimiter, async (req, res) => {
  const body = req.body || {}
  const providedEmail = typeof body.email === 'string' ? body.email : ''

  try {
    const challenge = await findChallengeByToken(
      body.verificationToken,
      VERIFICATION_PURPOSE.LOGIN_EMAIL,
    )

    const nextEmail = providedEmail ? normalizeEmail(providedEmail) : challenge.email
    if (!nextEmail) {
      throw new AppError(400, 'Enter your email address before requesting a verification code.')
    }

    const conflictingUser = await prisma.user.findFirst({
      where: {
        email: nextEmail,
        id: { not: challenge.userId || undefined },
      },
      select: { id: true },
    })
    if (conflictingUser) {
      return res.status(409).json({ error: 'That email is already in use by another account.' })
    }

    const refreshed = await sendOrRefreshLoginChallenge(
      body.verificationToken,
      nextEmail,
    )

    const refreshedChallenge = refreshed.challenge
    const user = refreshedChallenge.userId
      ? await prisma.user.findUnique({
          where: { id: refreshedChallenge.userId },
          select: { username: true },
        })
      : null

    await sendVerificationCodeEmail(
      refreshedChallenge.email,
      user?.username || refreshedChallenge.username || 'student',
      refreshed.code,
      {
        route: req.originalUrl,
        method: req.method,
        purpose: VERIFICATION_PURPOSE.LOGIN_EMAIL,
      },
    )

    res.json(loginVerificationResponse(refreshedChallenge, { codeSent: true }))
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

router.post('/login/verification/verify', verificationLimiter, async (req, res) => {
  const body = req.body || {}

  try {
    const challenge = await verifyChallengeCode(
      body.verificationToken,
      VERIFICATION_PURPOSE.LOGIN_EMAIL,
      body.code,
    )

    if (!challenge.userId) {
      throw new AppError(400, 'Verification session is invalid or has expired.')
    }
    if (!challenge.email) {
      throw new AppError(400, 'Enter your email address before verifying your code.')
    }

    const conflictingUser = await prisma.user.findFirst({
      where: {
        email: challenge.email,
        id: { not: challenge.userId },
      },
      select: { id: true },
    })
    if (conflictingUser) {
      return res.status(409).json({ error: 'That email is already in use by another account.' })
    }

    const updatedUser = await prisma.user.update({
      where: { id: challenge.userId },
      data: {
        email: challenge.email,
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
    })

    await consumeChallenge(challenge.id)

    const authenticatedUser = await issueAuthenticatedSession(res, updatedUser.id)
    res.json({
      message: 'Email verified successfully.',
      user: authenticatedUser,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

module.exports = router
