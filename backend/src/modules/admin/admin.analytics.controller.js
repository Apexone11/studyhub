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
    const formattedData = dailyData.map((row) => ({
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
      arr.map((row) => ({
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
    const formattedData = aiData.map((row) => ({
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
          counts[status] = await prisma.moderationCase.count({ where: { status } }).catch(() => 0)
        }),
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
    const [sheetsCount, notesCount, feedPostsCount, messagesCount, aiMessagesCount] =
      await Promise.all([
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

// ── GET /api/admin/analytics/active-users ──────────────────────
// DAU / WAU / MAU computed from UserDailyActivity table
router.get('/analytics/active-users', async (req, res) => {
  try {
    const now = new Date()
    const dayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Count distinct users who had any activity in each window
    const [dauResult, wauResult, mauResult, totalUsers] = await Promise.all([
      prisma.$queryRaw`
        SELECT COUNT(DISTINCT "userId")::int as count
        FROM "UserDailyActivity"
        WHERE date >= ${dayAgo}
      `.catch(() => [{ count: 0 }]),
      prisma.$queryRaw`
        SELECT COUNT(DISTINCT "userId")::int as count
        FROM "UserDailyActivity"
        WHERE date >= ${weekAgo}
      `.catch(() => [{ count: 0 }]),
      prisma.$queryRaw`
        SELECT COUNT(DISTINCT "userId")::int as count
        FROM "UserDailyActivity"
        WHERE date >= ${monthAgo}
      `.catch(() => [{ count: 0 }]),
      prisma.user.count().catch(() => 0),
    ])

    const dau = dauResult[0]?.count ?? 0
    const wau = wauResult[0]?.count ?? 0
    const mau = mauResult[0]?.count ?? 0

    // DAU trend over the past 14 days
    const dauTrend = await prisma.$queryRaw`
      SELECT
        date::date as date,
        COUNT(DISTINCT "userId")::int as count
      FROM "UserDailyActivity"
      WHERE date >= ${new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)}
      GROUP BY date
      ORDER BY date ASC
    `.catch(() => [])

    res.json({
      dau,
      wau,
      mau,
      totalUsers,
      dauTrend: dauTrend.map((row) => ({
        date: formatDate(row.date),
        count: Number(row.count),
      })),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/analytics/engagement ────────────────────────
// Engagement rate metrics over a period (posts, comments, stars, reactions per day)
router.get('/analytics/engagement', async (req, res) => {
  const period = req.query.period || '30d'
  const startDate = periodStartDate(period)

  try {
    const [postData, commentData, starData, reactionData] = await Promise.all([
      prisma.$queryRaw`
        SELECT DATE_TRUNC('day', "createdAt")::date as date, COUNT(*) as count
        FROM "FeedPost"
        WHERE "createdAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date ASC
      `.catch(() => []),
      prisma.$queryRaw`
        SELECT DATE_TRUNC('day', "createdAt")::date as date, COUNT(*) as count
        FROM "Comment"
        WHERE "createdAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date ASC
      `.catch(() => []),
      prisma.$queryRaw`
        SELECT DATE_TRUNC('day', "createdAt")::date as date, COUNT(*) as count
        FROM "StarredSheet"
        WHERE "createdAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date ASC
      `.catch(() => []),
      prisma.$queryRaw`
        SELECT DATE_TRUNC('day', "createdAt")::date as date, COUNT(*) as count
        FROM "Reaction"
        WHERE "createdAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date ASC
      `.catch(() => []),
    ])

    const fmt = (arr) => arr.map((r) => ({ date: formatDate(r.date), count: Number(r.count) }))

    res.json({
      posts: fmt(postData),
      comments: fmt(commentData),
      stars: fmt(starData),
      reactions: fmt(reactionData),
      period,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/analytics/top-content ───────────────────────
// Top 10 sheets by stars, top 10 posts by reactions, top 10 contributors
router.get('/analytics/top-content', async (req, res) => {
  try {
    const [topSheets, topContributors] = await Promise.all([
      prisma.studySheet.findMany({
        where: { status: 'published' },
        select: {
          id: true,
          title: true,
          stars: true,
          forks: true,
          downloads: true,
          createdAt: true,
          author: { select: { id: true, username: true, avatarUrl: true } },
          course: { select: { id: true, code: true } },
        },
        orderBy: { stars: 'desc' },
        take: 10,
      }),
      prisma.$queryRaw`
        SELECT
          u.id,
          u.username,
          u."avatarUrl",
          COUNT(DISTINCT s.id)::int as sheet_count,
          COALESCE(SUM(s.stars), 0)::int as total_stars,
          COALESCE(SUM(s.forks), 0)::int as total_forks
        FROM "User" u
        JOIN "StudySheet" s ON s."userId" = u.id AND s.status = 'published'
        GROUP BY u.id, u.username, u."avatarUrl"
        ORDER BY sheet_count DESC
        LIMIT 10
      `.catch(() => []),
    ])

    // Top posts by total reactions (likes + dislikes)
    const topPostReactions = await prisma.$queryRaw`
      SELECT
        fp.id,
        fp.content,
        fp."createdAt",
        u.id as author_id,
        u.username as author_username,
        COUNT(r.id)::int as reaction_count
      FROM "FeedPost" fp
      LEFT JOIN "FeedPostReaction" r ON r."postId" = fp.id
      LEFT JOIN "User" u ON u.id = fp."userId"
      GROUP BY fp.id, fp.content, fp."createdAt", u.id, u.username
      ORDER BY reaction_count DESC
      LIMIT 10
    `.catch(() => [])

    res.json({
      topSheets: topSheets.map((s) => ({
        id: s.id,
        title: s.title,
        stars: s.stars,
        forks: s.forks,
        downloads: s.downloads,
        createdAt: s.createdAt,
        author: s.author,
        course: s.course,
      })),
      topPosts: topPostReactions.map((p) => ({
        id: p.id,
        preview: String(p.content || '').slice(0, 120),
        createdAt: p.createdAt,
        reactionCount: p.reaction_count,
        author: { id: p.author_id, username: p.author_username },
      })),
      topContributors: topContributors.map((c) => ({
        id: c.id,
        username: c.username,
        avatarUrl: c.avatarUrl,
        sheetCount: c.sheet_count,
        totalStars: c.total_stars,
        totalForks: c.total_forks,
      })),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/active-users ─────────────────────────────────
// Currently online users (lastActiveAt within 15 minutes)
router.get('/active-users', async (req, res) => {
  try {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000)

    const users = await prisma.user.findMany({
      where: { lastActiveAt: { gte: fifteenMinAgo } },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        role: true,
        lastActiveAt: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    })

    res.json({ count: users.length, users })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /analytics/user-roles ── user count by role
router.get('/analytics/user-roles', async (req, res) => {
  try {
    const groups = await prisma.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    })
    const roles = groups.map((group) => ({
      role: group.role,
      count: typeof group._count === 'number' ? group._count : group._count?._all || 0,
    }))
    res.json({ roles })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to fetch user roles.' })
  }
})

// ── GET /analytics/engagement-totals ── aggregate engagement counts for pie chart
router.get('/analytics/engagement-totals', async (req, res) => {
  try {
    const start = periodStartDate(req.query.period)

    const [likes, comments, stars, follows] = await Promise.all([
      // Sheet reactions currently do not store timestamps, so this remains a lifetime total.
      prisma.reaction.count(),
      prisma.feedPostComment.count({ where: { createdAt: { gte: start } } }),
      prisma.starredSheet.count({ where: { createdAt: { gte: start } } }),
      prisma.userFollow.count({ where: { createdAt: { gte: start }, status: 'active' } }),
    ])

    res.json({ totals: { likes, comments, stars, follows } })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to fetch engagement totals.' })
  }
})

module.exports = router
