/**
 * Admin Analytics Controller — provides analytics data for the admin dashboard charts.
 *
 * GET /analytics/users — User growth data grouped by day
 *   Query param: period (7d, 30d, 90d, 1y) defaults to 30d
 *
 * GET /analytics/content — Content creation stats
 *   Query param: period (7d, 30d, 90d, 1y) defaults to 30d
 *
 * GET /analytics/ai — AI usage trends
 *   Query param: period (7d, 30d, 90d, 1y) defaults to 30d
 *
 * GET /analytics/moderation — Moderation case funnel
 *
 * GET /analytics/overview — Summary metrics for charts
 */
const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')

const router = express.Router()

/**
 * Calculate start date from period query param.
 * Defaults to 30d if invalid period provided.
 */
function periodStartDate(period = '30d') {
  const map = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }
  const days = map[period] || 30
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/**
 * Format date to YYYY-MM-DD string for consistency.
 */
function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// ── GET /api/admin/analytics/users ───────────────────────────
// User growth data grouped by day
router.get('/analytics/users', async (req, res) => {
  const period = req.query.period || '30d'
  const startDate = periodStartDate(period)

  try {
    // Get total user count and active users (with createdAt >= startDate)
    const [totalUsers, activeUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: startDate } } }),
    ])

    // Get daily new user signups using raw query for date grouping
    const dailyData = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('day', "createdAt")::date as date,
        COUNT(*) as count
      FROM "User"
      WHERE "createdAt" >= ${startDate}
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY date ASC
    `

    // Transform to expected format
    const formattedData = dailyData.map(row => ({
      date: formatDate(row.date),
      count: parseInt(row.count, 10),
    }))

    res.json({
      data: formattedData,
      totalUsers,
      activeUsers,
      period,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/analytics/content ─────────────────────────
// Content creation stats (sheets, notes, feed posts)
router.get('/analytics/content', async (req, res) => {
  const period = req.query.period || '30d'
  const startDate = periodStartDate(period)

  try {
    // Get daily counts for each content type using raw queries
    const [sheetData, noteData, feedPostData] = await Promise.all([
      prisma.$queryRaw`
        SELECT
          DATE_TRUNC('day', "createdAt")::date as date,
          COUNT(*) as count
        FROM "StudySheet"
        WHERE "createdAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date ASC
      `,
      prisma.$queryRaw`
        SELECT
          DATE_TRUNC('day', "createdAt")::date as date,
          COUNT(*) as count
        FROM "Note"
        WHERE "createdAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date ASC
      `,
      prisma.$queryRaw`
        SELECT
          DATE_TRUNC('day', "createdAt")::date as date,
          COUNT(*) as count
        FROM "FeedPost"
        WHERE "createdAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date ASC
      `,
    ])

    // Transform to expected format
    const formatDataArray = (arr) =>
      arr.map(row => ({
        date: formatDate(row.date),
        count: parseInt(row.count, 10),
      }))

    res.json({
      sheets: formatDataArray(sheetData),
      notes: formatDataArray(noteData),
      feedPosts: formatDataArray(feedPostData),
      period,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/analytics/ai ──────────────────────────────
// AI usage trends
router.get('/analytics/ai', async (req, res) => {
  const period = req.query.period || '30d'
  const startDate = periodStartDate(period)

  try {
    // Get daily AI usage from AiUsageLog
    const aiData = await prisma.$queryRaw`
      SELECT
        date,
        SUM("messageCount") as total_messages,
        COUNT(DISTINCT "userId") as unique_users
      FROM "AiUsageLog"
      WHERE date >= ${startDate}
      GROUP BY date
      ORDER BY date ASC
    `

    // Transform to expected format
    const formattedData = aiData.map(row => ({
      date: formatDate(row.date),
      messageCount: parseInt(row.total_messages || 0, 10),
      uniqueUsers: parseInt(row.unique_users || 0, 10),
    }))

    res.json({
      data: formattedData,
      period,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/analytics/moderation ──────────────────────
// Moderation case funnel
router.get('/analytics/moderation', async (req, res) => {
  try {
    // Get counts by status with graceful degradation
    const getCaseCounts = async () => {
      const statuses = ['pending', 'reviewing', 'resolved', 'appealed', 'dismissed']
      const counts = {}

      await Promise.all(
        statuses.map(async (status) => {
          counts[status] = await prisma.moderationCase
            .count({ where: { status } })
            .catch(() => 0)
        })
      )

      return counts
    }

    const caseCounts = await getCaseCounts()

    res.json(caseCounts)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/analytics/overview ────────────────────────
// Summary metrics for charts
router.get('/analytics/overview', async (req, res) => {
  try {
    // Get total counts for content overview with graceful degradation
    const [
      sheetsCount,
      notesCount,
      feedPostsCount,
      messagesCount,
      aiMessagesCount,
    ] = await Promise.all([
      prisma.studySheet.count().catch(() => 0),
      prisma.note.count().catch(() => 0),
      prisma.feedPost.count().catch(() => 0),
      prisma.message.count().catch(() => 0),
      prisma.aiMessage.count().catch(() => 0),
    ])

    res.json({
      sheets: sheetsCount,
      notes: notesCount,
      feedPosts: feedPostsCount,
      messages: messagesCount,
      aiMessages: aiMessagesCount,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
