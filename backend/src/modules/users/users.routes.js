const express = require('express')
const rateLimit = require('express-rate-limit')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const { createNotification } = require('../../lib/notify')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../../lib/authTokens')
const { getProfileAccessDecision, PROFILE_VISIBILITY } = require('../../lib/profileVisibility')
const prisma = require('../../lib/prisma')
const { checkAndAwardBadges } = require('../../lib/badges')

const router = express.Router()

const followLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Optional auth middleware
function optionalAuth(req, res, next) {
  const token = getAuthTokenFromRequest(req)
  if (!token) return next()
  try {
    req.user = verifyAuthToken(token)
  } catch {
    // Invalid token — proceed as unauthenticated
  }
  next()
}

// ── GET /api/users/:username/activity ─────────────────────────
router.get('/me/activity', requireAuth, async (req, res) => {
  try {
    const weeksParam = Math.min(Number(req.query.weeks) || 12, 52)
    const since = new Date()
    since.setDate(since.getDate() - weeksParam * 7)

    const rows = await prisma.userDailyActivity.findMany({
      where: { userId: req.user.userId, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: { date: true, commits: true, sheets: true, reviews: true, comments: true },
    })

    res.json(rows)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/:username/activity (public) ───────────────
router.get('/:username/activity', optionalAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const weeksParam = Math.min(Number(req.query.weeks) || 12, 52)
    const since = new Date()
    since.setDate(since.getDate() - weeksParam * 7)

    const rows = await prisma.userDailyActivity.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: { date: true, commits: true, sheets: true, reviews: true, comments: true },
    })

    res.json(rows)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/me/badges ─────────────────────────────────
router.get('/me/badges', requireAuth, async (req, res) => {
  try {
    const badges = await prisma.userBadge.findMany({
      where: { userId: req.user.userId },
      orderBy: { unlockedAt: 'desc' },
      select: {
        unlockedAt: true,
        badge: { select: { slug: true, name: true, description: true, category: true, tier: true, iconUrl: true } },
      },
    })
    res.json(badges.map((ub) => ({ ...ub.badge, unlockedAt: ub.unlockedAt })))
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/:username/badges (public) ─────────────────
router.get('/:username/badges', optionalAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      orderBy: { unlockedAt: 'desc' },
      select: {
        unlockedAt: true,
        badge: { select: { slug: true, name: true, description: true, category: true, tier: true, iconUrl: true } },
      },
    })
    res.json(badges.map((ub) => ({ ...ub.badge, unlockedAt: ub.unlockedAt })))
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/me/pinned-sheets ──────────────────────────
router.get('/me/pinned-sheets', requireAuth, async (req, res) => {
  try {
    const pins = await prisma.userPinnedSheet.findMany({
      where: { userId: req.user.userId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        position: true,
        pinnedAt: true,
        sheet: {
          select: {
            id: true,
            title: true,
            stars: true,
            status: true,
            updatedAt: true,
            course: { select: { id: true, code: true, school: { select: { short: true } } } },
          },
        },
      },
    })
    res.json(pins)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/users/me/pinned-sheets ─────────────────────────
router.post('/me/pinned-sheets', requireAuth, async (req, res) => {
  const { sheetId } = req.body || {}
  if (!sheetId || !Number.isInteger(Number(sheetId))) {
    return res.status(400).json({ error: 'sheetId is required.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: Number(sheetId) },
      select: { id: true, userId: true, status: true },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.userId !== req.user.userId) {
      return res.status(403).json({ error: 'You can only pin your own sheets.' })
    }

    const existing = await prisma.userPinnedSheet.count({ where: { userId: req.user.userId } })
    if (existing >= 6) {
      return res.status(400).json({ error: 'You can pin up to 6 sheets.' })
    }

    const pin = await prisma.userPinnedSheet.upsert({
      where: { userId_sheetId: { userId: req.user.userId, sheetId: sheet.id } },
      update: {},
      create: { userId: req.user.userId, sheetId: sheet.id, position: existing },
    })

    res.status(201).json(pin)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/users/me/pinned-sheets/:sheetId ──────────────
router.delete('/me/pinned-sheets/:sheetId', requireAuth, async (req, res) => {
  const sheetId = Number(req.params.sheetId)
  try {
    await prisma.userPinnedSheet.deleteMany({
      where: { userId: req.user.userId, sheetId },
    })
    res.json({ removed: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/users/me/pinned-sheets/reorder ────────────────
router.patch('/me/pinned-sheets/reorder', requireAuth, async (req, res) => {
  const { order } = req.body || {}
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'order must be an array of sheetIds.' })
  }

  try {
    await prisma.$transaction(
      order.map((sheetId, index) =>
        prisma.userPinnedSheet.updateMany({
          where: { userId: req.user.userId, sheetId: Number(sheetId) },
          data: { position: index },
        })
      )
    )
    res.json({ reordered: true })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/me/follow-suggestions — People you may want to follow (B2) ──
router.get('/me/follow-suggestions', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId

    // Get user's enrolled course IDs
    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })
    const courseIds = enrollments.map((e) => e.courseId)

    // Get IDs the user already follows
    const following = await prisma.userFollow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    })
    const followingIds = new Set([userId, ...following.map((f) => f.followingId)])

    let suggestions = []

    if (courseIds.length > 0) {
      // Find classmates — users enrolled in the same courses, not already followed
      const classmates = await prisma.enrollment.findMany({
        where: {
          courseId: { in: courseIds },
          userId: { notIn: [...followingIds] },
        },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              role: true,
              _count: { select: { studySheets: { where: { status: 'published' } }, followers: true } },
            },
          },
        },
        take: 50,
      })

      // Deduplicate by userId, count shared courses
      const userCounts = new Map()
      for (const row of classmates) {
        const existing = userCounts.get(row.userId)
        if (existing) {
          existing.sharedCourses++
        } else {
          userCounts.set(row.userId, {
            ...row.user,
            sharedCourses: 1,
            reason: 'classmate',
          })
        }
      }
      suggestions = [...userCounts.values()]
        .sort((a, b) => b.sharedCourses - a.sharedCourses || b._count.followers - a._count.followers)
        .slice(0, 10)
    }

    // If fewer than 10 suggestions, backfill with popular users
    if (suggestions.length < 10) {
      const needed = 10 - suggestions.length
      const existingIds = new Set([...followingIds, ...suggestions.map((s) => s.id)])

      const popular = await prisma.user.findMany({
        where: {
          id: { notIn: [...existingIds] },
          role: { not: 'admin' },
        },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          role: true,
          _count: { select: { studySheets: { where: { status: 'published' } }, followers: true } },
        },
        orderBy: { followers: { _count: 'desc' } },
        take: needed,
      })

      for (const u of popular) {
        suggestions.push({ ...u, sharedCourses: 0, reason: 'popular' })
      }
    }

    res.json(suggestions.map((s) => ({
      id: s.id,
      username: s.username,
      avatarUrl: s.avatarUrl,
      role: s.role,
      sheetCount: s._count?.studySheets || 0,
      followerCount: s._count?.followers || 0,
      sharedCourses: s.sharedCourses || 0,
      reason: s.reason || 'popular',
    })))
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/:username ───────────────────────────────────
router.get('/:username', optionalAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        id: true,
        username: true,
        role: true,
        avatarUrl: true,
        coverImageUrl: true,
        createdAt: true,
        emailVerified: true,
        isStaffVerified: true,
        _count: {
          select: {
            studySheets: { where: { status: 'published' } },
            followers: true,
            following: true,
          }
        },
        enrollments: {
          include: { course: { include: { school: true } } },
        },
        studySheets: {
          where: { status: 'published' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            course: { include: { school: true } },
          },
        },
      },
    })

    if (!user) return res.status(404).json({ error: 'User not found.' })

    const accessDecision = await getProfileAccessDecision(prisma, req.user, user.id)

    if (!accessDecision.allowed) {
      const errorMessage = accessDecision.visibility === PROFILE_VISIBILITY.PRIVATE
        ? 'This profile is private.'
        : 'This profile is only visible to classmates.'

      return res.status(403).json({ error: errorMessage })
    }

    let isFollowing = false
    if (req.user?.userId && req.user.userId !== user.id) {
      const follow = await prisma.userFollow.findUnique({
        where: { followerId_followingId: { followerId: req.user.userId, followingId: user.id } }
      })
      isFollowing = !!follow
    }

    /* Fetch shared (non-private) notes for profile display */
    let sharedNotes = []
    try {
      sharedNotes = await prisma.note.findMany({
        where: { userId: user.id, private: false },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          updatedAt: true,
          course: { select: { id: true, code: true } },
        },
      })
    } catch {
      // Degrade gracefully if notes query fails
    }

    /* Fetch pinned sheets for profile display */
    let pinnedSheets = []
    try {
      const pins = await prisma.userPinnedSheet.findMany({
        where: { userId: user.id },
        orderBy: { position: 'asc' },
        take: 6,
        select: {
          sheet: {
            select: {
              id: true,
              title: true,
              stars: true,
              updatedAt: true,
              status: true,
              course: { select: { id: true, code: true } },
            },
          },
        },
      })
      pinnedSheets = pins.map((p) => p.sheet).filter((s) => s && s.status === 'published')
    } catch {
      // Degrade gracefully
    }

    /* Fetch starred sheets for profile display */
    let starredSheets = []
    try {
      const starredRows = await prisma.starredSheet.findMany({
        where: { userId: user.id },
        orderBy: { sheetId: 'desc' },
        take: 10,
        select: {
          sheet: {
            select: {
              id: true,
              title: true,
              stars: true,
              updatedAt: true,
              status: true,
              author: { select: { id: true, username: true } },
              course: { select: { id: true, code: true } },
            },
          },
        },
      })
      starredSheets = starredRows
        .map((r) => r.sheet)
        .filter((s) => s && s.status === 'published')
    } catch {
      // Degrade gracefully if starred query fails
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarUrl || null,
      coverImageUrl: user.coverImageUrl || null,
      createdAt: user.createdAt,
      sheetCount: user._count.studySheets,
      followerCount: user._count.followers,
      followingCount: user._count.following,
      isFollowing,
      recentSheets: user.studySheets,
      enrollments: user.enrollments,
      pinnedSheets,
      sharedNotes,
      starredSheets,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/users/:username/follow ──────────────────────────
router.post('/:username/follow', requireAuth, followLimiter, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true, username: true, _count: { select: { followers: true } } }
    })
    if (!target) return res.status(404).json({ error: 'User not found.' })
    if (target.id === req.user.userId) return res.status(400).json({ error: 'You cannot follow yourself.' })

    await prisma.userFollow.create({
      data: { followerId: req.user.userId, followingId: target.id }
    })

    await createNotification(prisma, {
      userId: target.id,
      type: 'follow',
      message: `${req.user.username} started following you.`,
      actorId: req.user.userId,
      linkPath: `/users/${req.user.username}`,
    })

    const followerCount = await prisma.userFollow.count({ where: { followingId: target.id } })
    checkAndAwardBadges(prisma, target.id)
    res.json({ following: true, followerCount })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Already following this user.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/users/:username/follow ────────────────────────
router.delete('/:username/follow', requireAuth, followLimiter, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true }
    })
    if (!target) return res.status(404).json({ error: 'User not found.' })

    await prisma.userFollow.delete({
      where: { followerId_followingId: { followerId: req.user.userId, followingId: target.id } }
    })

    const followerCount = await prisma.userFollow.count({ where: { followingId: target.id } })
    res.json({ following: false, followerCount })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not following this user.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/:username/followers ─────────────────────
router.get('/:username/followers', optionalAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const follows = await prisma.userFollow.findMany({
      where: { followingId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        follower: {
          select: { id: true, username: true, role: true, avatarUrl: true },
        },
      },
    })

    res.json(follows.map((f) => f.follower))
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/:username/following ─────────────────────
router.get('/:username/following', optionalAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const follows = await prisma.userFollow.findMany({
      where: { followerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        following: {
          select: { id: true, username: true, role: true, avatarUrl: true },
        },
      },
    })

    res.json(follows.map((f) => f.following))
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/:username/stats — Contribution statistics (B1) ──
router.get('/:username/stats', optionalAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const accessDecision = await getProfileAccessDecision(prisma, req.user, user.id)
    if (!accessDecision.allowed) {
      return res.status(403).json({ error: 'Profile not accessible.' })
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [
      totalSheets,
      totalStarsReceived,
      totalComments,
      totalForks,
      totalContributions,
      sheetsLast30d,
      commentsLast30d,
      topCourses,
    ] = await Promise.all([
      prisma.studySheet.count({ where: { userId: user.id, status: 'published' } }),
      prisma.studySheet.aggregate({ where: { userId: user.id, status: 'published' }, _sum: { stars: true } }),
      prisma.comment.count({ where: { userId: user.id } }),
      prisma.studySheet.count({ where: { forkedFromId: { not: null }, userId: user.id, status: 'published' } }),
      prisma.contribution.count({ where: { userId: user.id } }).catch(() => 0),
      prisma.studySheet.count({ where: { userId: user.id, status: 'published', createdAt: { gte: thirtyDaysAgo } } }),
      prisma.comment.count({ where: { userId: user.id, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.studySheet.groupBy({
        by: ['courseId'],
        where: { userId: user.id, status: 'published', courseId: { not: null } },
        _count: true,
        orderBy: { _count: { courseId: 'desc' } },
        take: 5,
      }),
    ])

    // Resolve course names for top courses
    const courseIds = topCourses.map((c) => c.courseId).filter(Boolean)
    const courses = courseIds.length > 0
      ? await prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, code: true, name: true },
        })
      : []
    const courseMap = Object.fromEntries(courses.map((c) => [c.id, c]))

    res.json({
      totalSheets,
      totalStarsReceived: totalStarsReceived._sum.stars || 0,
      totalComments,
      totalForks,
      totalContributions,
      last30Days: {
        sheets: sheetsLast30d,
        comments: commentsLast30d,
      },
      topCourses: topCourses.map((tc) => ({
        courseId: tc.courseId,
        code: courseMap[tc.courseId]?.code || 'Unknown',
        name: courseMap[tc.courseId]?.name || '',
        sheetCount: tc._count,
      })),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
