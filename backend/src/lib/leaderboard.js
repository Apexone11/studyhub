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
 * @returns {{start: Date, end: Date}}
 */
function getDateRange(period) {
  const end = new Date()
  const start = new Date()

  if (period === 'weekly') {
    start.setDate(end.getDate() - 7)
  } else if (period === 'monthly') {
    start.setMonth(end.getMonth() - 1)
  }
  // For 'alltime', start remains undefined (no date filter)

  return { start: period === 'alltime' ? null : start, end }
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

    // Build where clause for date range
    const dateWhere = {}
    if (start) {
      dateWhere.date = { gte: start, lt: end }
    }

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

    // Fetch user details for all aggregated users
    const userIds = aggregated.map((row) => row.userId)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, avatarUrl: true },
    })

    // Create a map for quick lookup
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

    // Calculate scores and build leaderboard
    const leaderboard = aggregated
      .map((row) => {
        const user = userMap[row.userId]
        if (!user) return null

        const breakdown = {
          commits: row._sum.commits || 0,
          sheets: row._sum.sheets || 0,
          reviews: row._sum.reviews || 0,
          comments: row._sum.comments || 0,
        }

        const score = calculateActivityScore(breakdown)

        return {
          userId: row.userId,
          username: user.username,
          avatarUrl: user.avatarUrl || null,
          score,
          breakdown,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
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
