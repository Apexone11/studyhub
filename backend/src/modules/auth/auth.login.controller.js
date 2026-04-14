const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../../lib/prisma')
const { checkAndPromoteTrust } = require('../../lib/trustGate')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { loginLimiter } = require('./auth.constants')
const { issueAuthenticatedSession, handleAuthError } = require('./auth.service')
const { MAX_FAILED_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_MS } = require('../../lib/constants')

const router = express.Router()

router.post('/login', loginLimiter, async (req, res) => {
  const body = req.body || {}
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!username || !password) {
    return sendError(res, 400, 'Please fill in both fields.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return sendError(res, 401, 'Incorrect username or password.', ERROR_CODES.UNAUTHORIZED, {
        showForgot: false,
      })
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000)
      return sendError(
        res,
        429,
        `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
        ERROR_CODES.RATE_LIMITED,
        {
          locked: true,
          minutesLeft,
          showForgot: true,
        },
      )
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)
    if (!isValidPassword) {
      const newFailedAttempts = user.failedAttempts + 1
      const shouldLock = newFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
      const failedAt = new Date()
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: newFailedAttempts,
          lastFailedLoginAt: failedAt,
          lockedUntil: shouldLock ? new Date(Date.now() + LOGIN_LOCKOUT_MS) : null,
        },
      })

      if (shouldLock) {
        return sendError(
          res,
          429,
          'Too many failed attempts. Account locked for 15 minutes.',
          ERROR_CODES.RATE_LIMITED,
          {
            locked: true,
            minutesLeft: 15,
            showForgot: true,
          },
        )
      }

      const attemptsLeft = MAX_FAILED_LOGIN_ATTEMPTS - newFailedAttempts
      return sendError(
        res,
        401,
        `Incorrect username or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
        ERROR_CODES.UNAUTHORIZED,
        {
          showForgot: newFailedAttempts >= 1,
        },
      )
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastFailedLoginAt: null },
    })

    /* Login verification flow removed in v1.5.0. Email verification is no longer
     * required to log in. See docs/beta-v1.7.0-release-log.md for details. */

    const authenticatedUser = await issueAuthenticatedSession(res, user.id, req)
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
