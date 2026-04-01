const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../../lib/prisma')
const { checkAndPromoteTrust } = require('../../lib/trustGate')
const { loginLimiter } = require('./auth.constants')
const {
  issueAuthenticatedSession,
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

    /* Login verification flow removed in v1.5.0. Email verification is no longer
     * required to log in. See docs/beta-v1.7.0-release-log.md for details. */

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

module.exports = router
