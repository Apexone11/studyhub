/**
 * Discovery Controller — trending sheets, recommended content, course-based discovery.
 *
 * Track B3: Discovery Engine — Cycle B: Social & Discovery.
 *
 * Endpoints:
 *   GET /trending — Trending sheets (weighted score: stars + views + comments + recency)
 *   GET /recommended — Personalized recommendations based on enrolled courses (auth required)
 *   GET /courses/:courseId/discover — Course-specific discovery (top sheets for a course)
 */
const express = require('express')
const rateLimit = require('express-rate-limit')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../../lib/authTokens')

const router = express.Router()

const discoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
})

function optionalAuth(req, _res, next) {
  const token = getAuthTokenFromRequest(req)
  if (!token) return next()
  try { req.user = verifyAuthToken(token) } catch { /* proceed unauthenticated */ }
  next()
}

/**
 * GET /api/feed/trending — Trending sheets.
 *
 * Scoring: Weighted combination of stars, comment count, and recency.
 * Sheets published in the last 7 days get a boost.
 * Returns up to 20 results.
 */
router.get('/trending', discoveryLimiter, optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 20, 50)
    const period = req.query.period || '7d'

    // Determine date range
    let since
    switch (period) {
      case '24h': since = new Date(Date.now() - 24 * 60 * 60 * 1000); break
      case '7d': since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break
      case '30d': since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break
      default: since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    }

    // Fetch candidate sheets with engagement data
    const sheets = await prisma.studySheet.findMany({
      where: {
        status: 'published',
        createdAt: { gte: since },
      },
      select: {
        id: true,
        title: true,
        description: true,
        stars: true,
        contentFormat: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, username: true, avatarUrl: true } },
        course: { select: { id: true, code: true, name: true, school: { select: { short: true } } } },
        _count: { select: { comments: true, forks: true } },
      },
      orderBy: [{ stars: 'desc' }, { createdAt: 'desc' }],
      take: limit * 3, // fetch extra for scoring
    })

    // Score and rank
    const now = Date.now()
    const scored = sheets.map((sheet) => {
      const ageHours = (now - new Date(sheet.createdAt).getTime()) / (1000 * 60 * 60)
      const recencyBoost = Math.max(0, 1 - ageHours / (24 * 30)) // decays over 30 days
      const score =
        (sheet.stars || 0) * 3 +
        (sheet._count.comments || 0) * 2 +
        (sheet._count.forks || 0) * 5 +
        recencyBoost * 10
      return { ...sheet, _score: score }
    })

    scored.sort((a, b) => b._score - a._score)

    res.json(scored.slice(0, limit).map(({ _score, ...sheet }) => ({
      ...sheet,
      commentCount: sheet._count?.comments || 0,
      forkCount: sheet._count?.forks || 0,
    })))
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /api/feed/recommended — Personalized recommendations.
 *
 * Algorithm: Fetch top-performing sheets in user's enrolled courses
 * that the user hasn't authored or already starred.
 */
router.get('/recommended', discoveryLimiter, optionalAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required for recommendations.' })
    }

    const userId = req.user.userId
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 15, 30)

    // Get user's enrolled courses
    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })
    const courseIds = enrollments.map((e) => e.courseId)

    if (courseIds.length === 0) {
      return res.json([])
    }

    // Get sheets the user has already starred
    const starredIds = await prisma.starredSheet.findMany({
      where: { userId },
      select: { sheetId: true },
    })
    const starredSet = new Set(starredIds.map((s) => s.sheetId))

    // Fetch top sheets from enrolled courses, excluding user's own
    const candidates = await prisma.studySheet.findMany({
      where: {
        status: 'published',
        courseId: { in: courseIds },
        userId: { not: userId },
      },
      select: {
        id: true,
        title: true,
        description: true,
        stars: true,
        contentFormat: true,
        createdAt: true,
        author: { select: { id: true, username: true, avatarUrl: true } },
        course: { select: { id: true, code: true, name: true } },
        _count: { select: { comments: true, forks: true } },
      },
      orderBy: [{ stars: 'desc' }, { createdAt: 'desc' }],
      take: limit * 3,
    })

    // Filter out already-starred, then take top N
    const results = candidates
      .filter((s) => !starredSet.has(s.id))
      .slice(0, limit)
      .map((sheet) => ({
        ...sheet,
        commentCount: sheet._count?.comments || 0,
        forkCount: sheet._count?.forks || 0,
      }))

    res.json(results)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /api/feed/courses/:courseId/discover — Course-specific discovery.
 *
 * Returns the top sheets for a specific course, ranked by stars and recency.
 */
router.get('/courses/:courseId/discover', discoveryLimiter, optionalAuth, async (req, res) => {
  const courseId = Number.parseInt(req.params.courseId, 10)
  if (!Number.isFinite(courseId)) return res.status(400).json({ error: 'Invalid course ID.' })

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, code: true, name: true, school: { select: { id: true, name: true, short: true } } },
    })
    if (!course) return res.status(404).json({ error: 'Course not found.' })

    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 20, 50)

    const [sheets, totalSheets, topContributors] = await Promise.all([
      prisma.studySheet.findMany({
        where: { status: 'published', courseId },
        select: {
          id: true,
          title: true,
          description: true,
          stars: true,
          contentFormat: true,
          createdAt: true,
          author: { select: { id: true, username: true, avatarUrl: true } },
          _count: { select: { comments: true, forks: true } },
        },
        orderBy: [{ stars: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      prisma.studySheet.count({ where: { status: 'published', courseId } }),
      prisma.studySheet.groupBy({
        by: ['userId'],
        where: { status: 'published', courseId },
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 5,
      }),
    ])

    // Resolve contributor usernames
    const contributorIds = topContributors.map((c) => c.userId)
    const contributors = contributorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: contributorIds } },
          select: { id: true, username: true, avatarUrl: true },
        })
      : []
    const contribMap = Object.fromEntries(contributors.map((u) => [u.id, u]))

    res.json({
      course,
      totalSheets,
      sheets: sheets.map((s) => ({
        ...s,
        commentCount: s._count?.comments || 0,
        forkCount: s._count?.forks || 0,
      })),
      topContributors: topContributors.map((tc) => ({
        user: contribMap[tc.userId] || { id: tc.userId, username: 'Unknown' },
        sheetCount: tc._count,
      })),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
