/**
 * Discovery Controller — trending sheets, recommended content, course-based discovery.
 *
 * Track B3: Discovery Engine — Cycle B: Social & Discovery.
 *
 * Endpoints:
 *   GET /trending — Trending sheets (weighted score: stars + views + comments + recency)
 *   GET /recommended — Personalized recommendations based on enrolled courses (auth required)
 *   GET /for-you — Unified "For You" feed (auth required) combining sheets, groups, people, trending
 *   GET /recommended-groups — Study groups matching user's enrolled courses (auth required)
 *   GET /courses/:courseId/discover — Course-specific discovery (top sheets for a course)
 */
const express = require('express')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const optionalAuth = require('../../core/auth/optionalAuth')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { cacheControl } = require('../../lib/cacheControl')
const { feedDiscoveryLimiter } = require('../../lib/rateLimiters')
const { getBoostedIdsForUser } = require('../../lib/rolePersonalization')
const {
  DURATION_24H_MS,
  DURATION_7D_MS,
  DURATION_30D_MS,
  DISCOVERY_FETCH_MULTIPLIER,
  DISCOVERY_RECENCY_DECAY_HOURS,
} = require('../../lib/constants')

const router = express.Router()

const discoveryLimiter = feedDiscoveryLimiter

function isMissingTableError(error) {
  return (
    error?.code === 'P2021' ||
    (typeof error?.message === 'string' && error.message.includes('does not exist'))
  )
}

/**
 * GET /api/feed/trending — Trending sheets.
 *
 * Scoring: Weighted combination of stars, comment count, and recency.
 * Sheets published in the last 7 days get a boost.
 * Returns up to 20 results.
 * Uses HTTP cacheControl (120s max-age + 300s stale-while-revalidate).
 */
router.get(
  '/trending',
  discoveryLimiter,
  optionalAuth,
  cacheControl(120, { public: true, staleWhileRevalidate: 300 }),
  async (req, res) => {
    try {
      const limit = Math.min(Number.parseInt(req.query.limit, 10) || 20, 50)
      const period = req.query.period || '7d'

      // Determine date range
      let since
      switch (period) {
        case '24h':
          since = new Date(Date.now() - DURATION_24H_MS)
          break
        case '7d':
          since = new Date(Date.now() - DURATION_7D_MS)
          break
        case '30d':
          since = new Date(Date.now() - DURATION_30D_MS)
          break
        default:
          since = new Date(Date.now() - DURATION_7D_MS)
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
          course: {
            select: { id: true, code: true, name: true, school: { select: { short: true } } },
          },
          _count: { select: { comments: true, forkChildren: true } },
        },
        orderBy: [{ stars: 'desc' }, { createdAt: 'desc' }],
        take: limit * DISCOVERY_FETCH_MULTIPLIER, // fetch extra for scoring
      })

      // Score and rank
      const now = Date.now()
      const scored = sheets.map((sheet) => {
        const ageHours = (now - new Date(sheet.createdAt).getTime()) / (1000 * 60 * 60)
        const recencyBoost = Math.max(0, 1 - ageHours / DISCOVERY_RECENCY_DECAY_HOURS) // decays over 30 days
        const score =
          (sheet.stars || 0) * 3 +
          (sheet._count.comments || 0) * 2 +
          (sheet._count.forkChildren || 0) * 5 +
          recencyBoost * 10
        return { ...sheet, _score: score }
      })

      scored.sort((a, b) => b._score - a._score)

      const result = scored.slice(0, limit).map(({ _score, ...sheet }) => ({
        ...sheet,
        commentCount: sheet._count?.comments || 0,
        forkCount: sheet._count?.forkChildren || 0,
      }))

      res.json(result)
    } catch (err) {
      captureError(err, { route: req.originalUrl })
      res.status(500).json({ error: 'Server error.' })
    }
  },
)

/**
 * GET /api/feed/recommended — Personalized recommendations.
 *
 * Algorithm: Fetch top-performing sheets in user's enrolled courses
 * that the user hasn't authored or already starred.
 * Not cached due to per-user personalization.
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
        _count: { select: { comments: true, forkChildren: true } },
      },
      orderBy: [{ stars: 'desc' }, { createdAt: 'desc' }],
      take: limit * DISCOVERY_FETCH_MULTIPLIER,
    })

    // Filter out already-starred, then take top N
    const results = candidates
      .filter((s) => !starredSet.has(s.id))
      .slice(0, limit)
      .map((sheet) => ({
        ...sheet,
        commentCount: sheet._count?.comments || 0,
        forkCount: sheet._count?.forkChildren || 0,
      }))

    res.json(results)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /api/feed/for-you — Unified "For You" personalized feed.
 *
 * Returns a curated combination of:
 *   - Recommended sheets (max 6) from enrolled courses
 *   - Recommended study groups (max 4) from enrolled courses
 *   - Recommended people (max 4) to follow
 *   - Trending sheets this week (max 4)
 *
 * Uses optional auth: unauthenticated callers receive an empty payload
 * (same shape as the authenticated response). No server-side caching.
 */
router.get('/for-you', discoveryLimiter, optionalAuth, async (req, res) => {
  try {
    // Return empty personalized feed for unauthenticated users
    if (!req.user?.userId) {
      return res.json({
        sheets: [],
        groups: [],
        people: [],
        trending: [],
      })
    }

    const userId = req.user.userId
    // Resolve the per-role boost set: enrolled course IDs for students/teachers,
    // followed hashtag IDs for Self-learners. See docs/internal/roles-and-permissions-plan.md §6.5.
    const requester = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, accountType: true },
    })
    const boost = await getBoostedIdsForUser(requester)
    const isHashtagBoost = boost.kind === 'hashtag'

    // Self-learners have no enrolled courses by definition; downstream
    // queries that scope by courseId stay correct because the array is empty.
    const enrollments = isHashtagBoost
      ? []
      : await prisma.enrollment.findMany({
          where: { userId },
          select: { courseId: true },
        })
    const courseIds = isHashtagBoost ? [] : enrollments.map((e) => e.courseId)

    // Get blocked user IDs (wrapped in try-catch for graceful degradation)
    let blockedIds = []
    try {
      blockedIds = await getBlockedUserIds(prisma, userId)
    } catch {
      blockedIds = []
    }
    const excludeUserIds = new Set(
      [userId, ...blockedIds].filter((id) => id != null && id !== undefined),
    )

    // Get followed user IDs
    let followedUserIds = []
    try {
      const follows = await prisma.userFollow.findMany({
        where: { followerId: userId, status: 'active' },
        select: { followingId: true },
      })
      followedUserIds = follows.map((f) => f.followingId)
    } catch (err) {
      if (!isMissingTableError(err)) {
        captureError(err, {
          route: req.originalUrl,
          method: req.method,
          source: 'for-you.userFollow',
        })
        throw err
      }
    }

    // Get starred sheets
    const starredIds = await prisma.starredSheet.findMany({
      where: { userId },
      select: { sheetId: true },
    })
    const starredSet = new Set(starredIds.map((s) => s.sheetId))

    // Get joined group IDs (graceful if study group tables not yet migrated)
    let joinedGroupIds = new Set()
    try {
      const joinedGroups = await prisma.studyGroupMember.findMany({
        where: { userId, status: 'active' },
        select: { groupId: true },
      })
      joinedGroupIds = new Set(joinedGroups.map((g) => g.groupId))
    } catch (err) {
      if (!isMissingTableError(err)) {
        captureError(err, {
          route: req.originalUrl,
          method: req.method,
          source: 'for-you.studyGroupMember',
        })
        throw err
      }
    }

    const results = {
      sheets: [],
      groups: [],
      people: [],
      trending: [],
    }

    // Build sheet filter: content from enrolled courses OR from followed users
    const sheetOrConditions = []
    if (courseIds.length > 0) {
      sheetOrConditions.push({ courseId: { in: courseIds } })
    }
    if (followedUserIds.length > 0) {
      sheetOrConditions.push({ userId: { in: followedUserIds } })
    }

    const sheetWhereClause = {
      status: 'published',
      userId: { not: userId },
      ...(sheetOrConditions.length > 0 ? { OR: sheetOrConditions } : {}),
    }

    // Parallel fetch all recommendations
    const [sheetCandidates, trendingSheets, classmateRows, groupCandidates] = await Promise.all([
      // Recommended sheets: top performers in enrolled courses + followed users' sheets
      prisma.studySheet.findMany({
        where: sheetWhereClause,
        select: {
          id: true,
          title: true,
          description: true,
          stars: true,
          contentFormat: true,
          createdAt: true,
          author: { select: { id: true, username: true, avatarUrl: true } },
          course: { select: { id: true, code: true, name: true } },
          _count: { select: { comments: true, forkChildren: true } },
        },
        orderBy: [{ stars: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),

      // Trending this week: high-scoring recent sheets
      prisma.studySheet.findMany({
        where: {
          status: 'published',
          createdAt: { gte: new Date(Date.now() - DURATION_7D_MS) },
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
          _count: { select: { comments: true, forkChildren: true } },
        },
        orderBy: [{ stars: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),

      // Recommended people: classmates in shared courses
      courseIds.length > 0
        ? prisma.enrollment.findMany({
            where: {
              courseId: { in: courseIds },
              userId: { notIn: [...excludeUserIds].filter((id) => id != null) },
            },
            select: {
              userId: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  avatarUrl: true,
                  role: true,
                  _count: {
                    select: {
                      studySheets: { where: { status: 'published' } },
                      followers: true,
                    },
                  },
                },
              },
            },
            take: 100,
          })
        : Promise.resolve([]),

      // Recommended groups: public groups in enrolled courses, not yet joined
      // Wrapped in catch for graceful degradation if tables not yet migrated
      courseIds.length > 0
        ? prisma.studyGroup
            .findMany({
              where: {
                courseId: { in: courseIds },
                privacy: 'public',
                id: { notIn: [...joinedGroupIds] },
              },
              select: {
                id: true,
                name: true,
                description: true,
                avatarUrl: true,
                courseId: true,
                privacy: true,
                createdBy: { select: { id: true, username: true, avatarUrl: true } },
                _count: { select: { members: { where: { status: 'active' } } } },
              },
              orderBy: [{ updatedAt: 'desc' }],
              take: 50,
            })
            .catch((err) => {
              if (!isMissingTableError(err)) {
                captureError(err, {
                  route: req.originalUrl,
                  method: req.method,
                  source: 'for-you.studyGroup',
                })
                throw err
              }
              return []
            })
        : Promise.resolve([]),
    ])

    // Score and rank sheets by weighted metrics: stars*3 + forks*5 + recencyBoost*10
    // Content from enrolled courses receives a 2x score multiplier.
    // Content from followed users receives a 1.5x score multiplier (stacks with course boost).
    const now = Date.now()
    const enrolledCourseSet = new Set(courseIds)
    const followedUserSet = new Set(followedUserIds)
    const scoredSheets = sheetCandidates
      .filter((s) => !starredSet.has(s.id))
      .map((sheet) => {
        const ageHours = (now - new Date(sheet.createdAt).getTime()) / (1000 * 60 * 60)
        const recencyBoost = Math.max(0, 1 - ageHours / DISCOVERY_RECENCY_DECAY_HOURS)
        const baseScore =
          (sheet.stars || 0) * 3 + (sheet._count.forkChildren || 0) * 5 + recencyBoost * 10
        const isEnrolledCourse = sheet.course?.id != null && enrolledCourseSet.has(sheet.course.id)
        const isFollowedAuthor = sheet.author?.id != null && followedUserSet.has(sheet.author.id)
        let score = baseScore
        if (isEnrolledCourse) score *= 2
        if (isFollowedAuthor) score *= 1.5
        return { ...sheet, _score: score }
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 6)
      .map(({ _score, ...sheet }) => ({
        ...sheet,
        commentCount: sheet._count?.comments || 0,
        forkCount: sheet._count?.forkChildren || 0,
      }))

    // Score trending sheets
    const scoredTrending = trendingSheets
      .map((sheet) => {
        const ageHours = (now - new Date(sheet.createdAt).getTime()) / (1000 * 60 * 60)
        const recencyBoost = Math.max(0, 1 - ageHours / (24 * 7))
        const score =
          (sheet.stars || 0) * 3 +
          (sheet._count.comments || 0) * 2 +
          (sheet._count.forkChildren || 0) * 5 +
          recencyBoost * 10
        return { ...sheet, _score: score }
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 4)
      .map(({ _score, ...sheet }) => ({
        ...sheet,
        commentCount: sheet._count?.comments || 0,
        forkCount: sheet._count?.forkChildren || 0,
      }))

    // Deduplicate and rank classmates by shared courses
    const userCounts = new Map()
    for (const row of classmateRows) {
      const existing = userCounts.get(row.userId)
      if (existing) {
        existing.sharedCourses++
      } else {
        userCounts.set(row.userId, {
          id: row.user.id,
          username: row.user.username,
          avatarUrl: row.user.avatarUrl,
          role: row.user.role,
          sheetCount: row.user._count?.studySheets || 0,
          followerCount: row.user._count?.followers || 0,
          sharedCourses: 1,
        })
      }
    }
    const classmatesRanked = [...userCounts.values()]
      .sort((a, b) => b.sharedCourses - a.sharedCourses || b.followerCount - a.followerCount)
      .slice(0, 4)

    // Rank groups by member count
    const rankedGroups = groupCandidates
      .map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        avatarUrl: g.avatarUrl,
        courseId: g.courseId,
        privacy: g.privacy,
        createdBy: g.createdBy,
        memberCount: g._count?.members || 0,
      }))
      .sort((a, b) => b.memberCount - a.memberCount)
      .slice(0, 4)

    results.sheets = scoredSheets
    results.groups = rankedGroups
    results.people = classmatesRanked
    results.trending = scoredTrending

    res.json(results)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Could not load personalized content. Please try again.' })
  }
})

/**
 * GET /api/feed/recommended-groups — Recommended study groups.
 *
 * Returns public study groups linked to user's enrolled courses
 * that the user hasn't joined yet, ordered by member count descending.
 * Auth required. Limit 10.
 */
router.get('/recommended-groups', discoveryLimiter, optionalAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' })
    }

    const userId = req.user.userId

    // Get user's enrolled courses
    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })
    const courseIds = enrollments.map((e) => e.courseId)

    if (courseIds.length === 0) {
      return res.json([])
    }

    // Get joined group IDs (graceful if study group tables not yet migrated)
    let joinedGroupIds = new Set()
    try {
      const joinedGroups = await prisma.studyGroupMember.findMany({
        where: { userId, status: 'active' },
        select: { groupId: true },
      })
      joinedGroupIds = new Set(joinedGroups.map((g) => g.groupId))
    } catch (err) {
      if (!isMissingTableError(err)) {
        captureError(err, {
          route: req.originalUrl,
          method: req.method,
          source: 'recommended-groups.studyGroupMember',
        })
        throw err
      }
    }

    // Fetch public groups in user's courses that user hasn't joined
    // Wrapped in try-catch for graceful degradation if StudyGroup table not yet migrated
    let groups = []
    try {
      groups = await prisma.studyGroup.findMany({
        where: {
          courseId: { in: courseIds },
          privacy: 'public',
          id: { notIn: [...joinedGroupIds] },
        },
        select: {
          id: true,
          name: true,
          description: true,
          avatarUrl: true,
          courseId: true,
          privacy: true,
          createdBy: { select: { id: true, username: true, avatarUrl: true } },
          course: { select: { id: true, code: true, name: true } },
          _count: { select: { members: { where: { status: 'active' } } } },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 10,
      })
    } catch (err) {
      if (!isMissingTableError(err)) {
        captureError(err, {
          route: req.originalUrl,
          method: req.method,
          source: 'recommended-groups.studyGroup',
        })
        throw err
      }
    }

    const result = groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        avatarUrl: g.avatarUrl,
        courseId: g.courseId,
        course: g.course,
        privacy: g.privacy,
        createdBy: g.createdBy,
        memberCount: g._count?.members || 0,
      }))
      .sort((a, b) => b.memberCount - a.memberCount)

    res.json(result)
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
router.get(
  '/courses/:courseId/discover',
  discoveryLimiter,
  optionalAuth,
  cacheControl(300, { public: true, staleWhileRevalidate: 600 }),
  async (req, res) => {
    const courseId = Number.parseInt(req.params.courseId, 10)
    if (!Number.isFinite(courseId)) return res.status(400).json({ error: 'Invalid course ID.' })

    try {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          code: true,
          name: true,
          school: { select: { id: true, name: true, short: true } },
        },
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
            _count: { select: { comments: true, forkChildren: true } },
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
      const contributors =
        contributorIds.length > 0
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
          forkCount: s._count?.forkChildren || 0,
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
  },
)

module.exports = router
