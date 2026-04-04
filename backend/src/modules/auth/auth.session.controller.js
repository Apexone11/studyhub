const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const { clearAuthCookie } = require('../../lib/authTokens')
const requireAuth = require('../../middleware/auth')
const { logoutLimiter } = require('./auth.constants')
const { getAuthenticatedUser, buildAuthenticatedUserPayload } = require('./auth.service')

const router = express.Router()

router.post('/logout', logoutLimiter, (req, res) => {
  clearAuthCookie(res)
  return res.json({ message: 'Logged out.' })
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req.user.userId)
    if (!user) return res.status(404).json({ error: 'User not found.' })

    // Enrich with subscription/donor badge data
    const { enrichUserWithBadges } = require('../../lib/userBadges')
    const badges = await enrichUserWithBadges(user)
    return res.json(buildAuthenticatedUserPayload(user, {
      plan: badges.plan || 'free',
      isDonor: badges.isDonor || false,
      donorLevel: badges.donorLevel || null,
    }))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
