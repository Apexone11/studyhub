/**
 * Sheet analytics controller — provides sheet-level engagement metrics
 * for the owner's analytics dashboard in SheetLab.
 *
 * GET /api/sheets/:id/analytics
 *   - Requires authentication
 *   - Must be sheet owner or admin
 *   - Returns aggregate stats + time-series engagement data
 */
const express = require('express')
const rateLimit = require('express-rate-limit')
const requireAuth = require('../../middleware/auth')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')

const router = express.Router()

const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many analytics requests. Please wait.' },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * GET /:id/analytics
 *
 * Returns:
 * {
 *   sheet: { id, title, status, contentFormat, createdAt, updatedAt },
 *   metrics: { stars, downloads, forks, comments, contributions, commits },
 *   engagement: {
 *     starHistory: [{ date, count }],
 *     commentHistory: [{ date, count }],
 *     downloadTrend: 'up' | 'down' | 'flat',
 *   },
 *   topReferrers: [{ username, contributions }],
 *   recentActivity: [{ type, date, actor }],
 * }
 */
router.get('/:id/analytics', requireAuth, analyticsLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(sheetId) || sheetId < 1) {
    return res.status(400).json({ error: 'Invalid sheet ID.' })
  }

  try {
    // Fetch sheet with ownership check
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        title: true,
        status: true,
        contentFormat: true,
        stars: true,
        downloads: true,
        forks: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })

    // Authorization: owner or admin only
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: sheet.userId,
      message: 'Analytics are only available to the sheet owner.',
      targetType: 'sheet',
      targetId: sheetId,
    })) return

    // Parallel data fetches for performance
    const [
      commentCount,
      contributionCount,
      commitCount,
      recentStars,
      recentComments,
      topContributors,
      forkSheets,
      recentActivity,
    ] = await Promise.all([
      // Total comments on this sheet
      prisma.comment.count({ where: { sheetId } }),

      // Total contributions (incoming)
      prisma.sheetContribution.count({ where: { targetSheetId: sheetId } }),

      // Total commits
      prisma.sheetCommit.count({ where: { sheetId } }),

      // Stars over last 30 days (grouped by date)
      prisma.starredSheet.findMany({
        where: {
          sheetId,
          createdAt: { gte: daysAgo(30) },
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),

      // Comments over last 30 days
      prisma.comment.findMany({
        where: {
          sheetId,
          createdAt: { gte: daysAgo(30) },
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),

      // Top contributors by contribution count
      prisma.sheetContribution.groupBy({
        by: ['userId'],
        where: { targetSheetId: sheetId },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),

      // Fork children for fork tree metrics
      prisma.studySheet.findMany({
        where: { forkOf: sheetId },
        select: {
          id: true,
          title: true,
          stars: true,
          author: { select: { id: true, username: true, displayName: true } },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Recent activity stream (last 20 items across types)
      buildRecentActivity(sheetId),
    ])

    // Group stars by date for histogram
    const starHistory = groupByDate(recentStars.map((s) => s.createdAt))
    const commentHistory = groupByDate(recentComments.map((c) => c.createdAt))

    // Resolve top contributor usernames
    const contributorIds = topContributors.map((c) => c.userId)
    const contributorUsers = contributorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: contributorIds } },
          select: { id: true, username: true, displayName: true },
        })
      : []
    const userMap = new Map(contributorUsers.map((u) => [u.id, u]))
    const topReferrers = topContributors.map((c) => ({
      username: userMap.get(c.userId)?.username || 'unknown',
      displayName: userMap.get(c.userId)?.displayName || null,
      contributions: c._count.id,
    }))

    res.json({
      sheet: {
        id: sheet.id,
        title: sheet.title,
        status: sheet.status,
        contentFormat: sheet.contentFormat,
        createdAt: sheet.createdAt,
        updatedAt: sheet.updatedAt,
      },
      metrics: {
        stars: sheet.stars,
        downloads: sheet.downloads,
        forks: sheet.forks,
        comments: commentCount,
        contributions: contributionCount,
        commits: commitCount,
      },
      engagement: {
        starHistory,
        commentHistory,
      },
      topContributors: topReferrers,
      forkChildren: forkSheets,
      recentActivity,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to load analytics.' })
  }
})

/* ── Helpers ──────────────────────────────────────────────── */

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Group an array of Date objects into { date: 'YYYY-MM-DD', count: N } buckets.
 */
function groupByDate(dates) {
  const counts = {}
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10)
    counts[key] = (counts[key] || 0) + 1
  }
  return Object.entries(counts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Build a unified recent activity feed from comments, contributions, and commits.
 * Returns the 20 most recent items sorted by date.
 */
async function buildRecentActivity(sheetId) {
  const [comments, contributions, commits] = await Promise.all([
    prisma.comment.findMany({
      where: { sheetId },
      select: {
        id: true,
        createdAt: true,
        user: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.sheetContribution.findMany({
      where: { targetSheetId: sheetId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        user: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.sheetCommit.findMany({
      where: { sheetId },
      select: {
        id: true,
        message: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  const items = [
    ...comments.map((c) => ({
      type: 'comment',
      date: c.createdAt,
      actor: c.user?.username || 'unknown',
      detail: null,
    })),
    ...contributions.map((c) => ({
      type: `contribution_${c.status}`,
      date: c.createdAt,
      actor: c.user?.username || 'unknown',
      detail: null,
    })),
    ...commits.map((c) => ({
      type: 'commit',
      date: c.createdAt,
      actor: null,
      detail: c.message || null,
    })),
  ]

  items.sort((a, b) => new Date(b.date) - new Date(a.date))
  return items.slice(0, 20)
}

module.exports = router
