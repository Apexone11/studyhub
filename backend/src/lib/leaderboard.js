/**
 * leaderboard.js — Campus-wide activity leaderboard
 *
 * Aggregates user activity across different time periods and calculates rankings.
 */
const { captureError } = require('../monitoring/sentry')

/**
 * Score calculation: weighted by activity type
 * - commits: 2 points
 * - sheets: 5 points
 * - reviews: 3 points
 * - comments: 1 point
 */
const ACTIVITY_WEIGHTS = {
  commits: 2,
  sheets: 5,
  reviews: 3,
  comments: 1,
}

const SUPPORTED_PERIODS = new Set(['weekly', 'monthly', 'alltime'])
const DEFAULT_PERIOD = 'weekly'

// 'alltime' is capped to a rolling window so a public, unauthenticated request
// never aggregates the entire UserDailyActivity history.
const ALLTIME_WINDOW_DAYS = 365

/**
 * Calculate score for an activity record
 * @param {Object} activity - {commits, sheets, reviews, comments}
 * @returns {number}
 */
function calculateActivityScore(activity) {
  return (
    (activity.commits || 0) * ACTIVITY_WEIGHTS.commits +
    (activity.sheets || 0) * ACTIVITY_WEIGHTS.sheets +
    (activity.reviews || 0) * ACTIVITY_WEIGHTS.reviews +
    (activity.comments || 0) * ACTIVITY_WEIGHTS.comments
  )
}

/**
 * Get the date range for a given period
 * @param {'weekly'|'monthly'|'alltime'} period
 * @returns {{start: Date|null, end: Date}}
 */
function getDateRange(period) {
  const normalizedPeriod = SUPPORTED_PERIODS.has(period) ? period : DEFAULT_PERIOD
  const end = new Date()
  const start = new Date()

  if (normalizedPeriod === 'weekly') {
    start.setDate(end.getDate() - 7)
  } else if (normalizedPeriod === 'monthly') {
    start.setMonth(end.getMonth() - 1)
  } else {
    // 'alltime' is bounded to a rolling 365-day window so a public request
    // never scans the full activity history.
    start.setDate(end.getDate() - ALLTIME_WINDOW_DAYS)
  }

  return { start, end }
}

/**
 * Get campus-wide leaderboard aggregated by activity period
 *
 * @param {PrismaClient} prisma
 * @param {'weekly'|'monthly'|'alltime'} period
 * @param {number} limit - Max users to return, default 20
 * @returns {Promise<Array>} Array of {userId, username, avatarUrl, score, rank, breakdown: {commits, sheets, reviews, comments}}
 */
async function getLeaderboard(prisma, period = 'weekly', limit = 20) {
  try {
    const { start, end } = getDateRange(period)

    // Always date-bounded now (weekly/monthly relative, 'alltime' = rolling 365d).
    const dateWhere = { date: { gte: start, lt: end } }

    // Aggregate activity by userId
    const aggregated = await prisma.userDailyActivity.groupBy({
      by: ['userId'],
      where: dateWhere,
      _sum: {
        commits: true,
        sheets: true,
        reviews: true,
        comments: true,
      },
    })

    // Score + rank from the aggregate alone (no user data needed yet), then
    // slice to the top-N BEFORE hydrating users. Hydrating every aggregated
    // userId first was O(all-users) on a public request; only the N rows that
    // survive the slice ever need a user lookup.
    const ranked = aggregated
      .map((row) => {
        const breakdown = {
          commits: row._sum.commits || 0,
          sheets: row._sum.sheets || 0,
          reviews: row._sum.reviews || 0,
          comments: row._sum.comments || 0,
        }
        return {
          userId: row.userId,
          score: calculateActivityScore(breakdown),
          breakdown,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    // Fetch user details for only the top-N aggregated users.
    const userIds = ranked.map((row) => row.userId)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, avatarUrl: true },
    })

    // Create a map for quick lookup
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

    // Build leaderboard, dropping any rows whose user no longer exists, and
    // assign ranks over the surviving order.
    const leaderboard = ranked
      .map((row) => {
        const user = userMap[row.userId]
        if (!user) return null

        return {
          userId: row.userId,
          username: user.username,
          avatarUrl: user.avatarUrl || null,
          score: row.score,
          breakdown: row.breakdown,
        }
      })
      .filter(Boolean)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }))

    return leaderboard
  } catch (error) {
    captureError(error, { source: 'getLeaderboard', period })
    return []
  }
}

module.exports = { getLeaderboard, calculateActivityScore, ACTIVITY_WEIGHTS }
