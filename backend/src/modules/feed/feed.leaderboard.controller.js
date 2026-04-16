const express = require('express')
const { leaderboardLimiter } = require('./feed.constants')
const { captureError } = require('../../monitoring/sentry')
const { getLeaderboard } = require('../../lib/leaderboard')
const prisma = require('../../lib/prisma')

const router = express.Router()

router.get('/leaderboard', leaderboardLimiter, async (req, res) => {
  try {
    const period = req.query.period || 'weekly'
    const limit = Math.min(Number(req.query.limit) || 20, 100)

    // Validate period
    if (!['weekly', 'monthly', 'alltime'].includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Use weekly, monthly, or alltime.' })
    }

    const leaderboard = await getLeaderboard(prisma, period, limit)
    res.json(leaderboard)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
