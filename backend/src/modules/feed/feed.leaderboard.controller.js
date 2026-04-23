const express = require('express')
const { leaderboardLimiter } = require('./feed.constants')
const { captureError } = require('../../monitoring/sentry')
const { getLeaderboard } = require('../../lib/leaderboard')
const prisma = require('../../lib/prisma')

const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const router = express.Router()

router.get('/leaderboard', leaderboardLimiter, async (req, res) => {
  try {
    const period = req.query.period || 'weekly'
    const limit = Math.min(Number(req.query.limit) || 20, 100)

    // Validate period
    if (!['weekly', 'monthly', 'alltime'].includes(period)) {
      return sendError(
        res,
        400,
        'Invalid period. Use weekly, monthly, or alltime.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    const leaderboard = await getLeaderboard(prisma, period, limit)
    res.json(leaderboard)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
