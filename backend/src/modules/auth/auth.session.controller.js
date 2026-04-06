const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const { clearAuthCookie } = require('../../lib/authTokens')
const requireAuth = require('../../middleware/auth')
const { logoutLimiter } = require('./auth.constants')
const { getAuthenticatedUser, buildSessionUserPayload } = require('./auth.service')

const router = express.Router()

router.post('/logout', logoutLimiter, (req, res) => {
  clearAuthCookie(res)
  return res.json({ message: 'Logged out.' })
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req.user.userId)
    if (!user) return res.status(404).json({ error: 'User not found.' })

    return res.json(await buildSessionUserPayload(user))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
