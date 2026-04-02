const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const { createNotification } = require('../../lib/notify')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../../lib/authTokens')
const { getProfileAccessDecision, PROFILE_VISIBILITY } = require('../../lib/profileVisibility')
const prisma = require('../../lib/prisma')
const { checkAndAwardBadges } = require('../../lib/badges')
const { getUserStreak, getWeeklyActivity } = require('../../lib/streaks')
const { readLimiter, usersFollowLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

// Apply read limiter to all GET requests on user routes
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return readLimiter(req, res, next)
  next()
})

const followLimiter = usersFollowLimiter

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
        where: { userId: user.id, private: false, moderationStatus: 'clean' },
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

// ── GET /api/users/me/streak ────────────────────────────────────
router.get('/me/streak', requireAuth, async (req, res) => {
  try {
    const streakData = await getUserStreak(prisma, req.user.userId)
    res.json(streakData)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/me/weekly-activity ───────────────────────────
router.get('/me/weekly-activity', requireAuth, async (req, res) => {
  try {
    const weeklyData = await getWeeklyActivity(prisma, req.user.userId)
    res.json(weeklyData)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/me ─────────────────────────────────────────────
// Returns the authenticated user's profile data. Used by gamification
// widgets and any component that needs the current user's info.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        avatarUrl: true,
        role: true,
        verified: true,
        bio: true,
        createdAt: true,
        schoolId: true,
        school: { select: { id: true, name: true } },
        _count: {
          select: {
            studySheets: true,
            followers: true,
            following: true,
            notes: true,
          },
        },
      },
    })

    if (!user) return res.status(404).json({ error: 'User not found.' })
    res.json(user)
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/me/follow-suggestions ──────────────────────────
// Returns up to 8 users the authenticated user may want to follow,
// prioritizing users at the same school and users with popular content.
router.get('/me/follow-suggestions', requireAuth, async (req, res) => {
  try {
    // Get IDs the user already follows
    const following = await prisma.follow.findMany({
      where: { followerId: req.user.userId },
      select: { followingId: true },
    })
    const followingIds = following.map((f) => f.followingId)

    // Get blocked user IDs (graceful degradation)
    let blockedIds = []
    try {
      const { getBlockedUserIds } = require('../../lib/social/blockFilter')
      blockedIds = await getBlockedUserIds(prisma, req.user.userId)
    } catch {
      blockedIds = []
    }

    const excludeIds = [...followingIds, ...blockedIds, req.user.userId]

    // Get current user for school-based suggestions
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { schoolId: true },
    })

    // Prefer users from the same school, then by sheet count
    const suggestions = await prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
        verified: true,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        schoolId: true,
        _count: { select: { studySheets: true, followers: true } },
      },
      orderBy: [
        { followers: { _count: 'desc' } },
      ],
      take: 20,
    })

    // Sort: same school first, then by follower count
    const sorted = suggestions.sort((a, b) => {
      const aSchool = currentUser?.schoolId && a.schoolId === currentUser.schoolId ? 1 : 0
      const bSchool = currentUser?.schoolId && b.schoolId === currentUser.schoolId ? 1 : 0
      if (bSchool !== aSchool) return bSchool - aSchool
      return (b._count?.followers || 0) - (a._count?.followers || 0)
    })

    res.json(sorted.slice(0, 8))
  } catch (err) {
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/me/blocked ─────────────────────────────────────
// Returns the list of user IDs the authenticated user has blocked.
router.get('/me/blocked', requireAuth, async (req, res) => {
  try {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: req.user.userId },
      select: {
        blocked: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(blocks.map((b) => ({ ...b.blocked, blockedAt: b.createdAt })))
  } catch (err) {
    // Graceful degradation if UserBlock table doesn't exist yet
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return res.json([])
    }
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/users/me/muted ──────────────────────────────────────
// Returns the list of user IDs the authenticated user has muted.
router.get('/me/muted', requireAuth, async (req, res) => {
  try {
    const mutes = await prisma.userMute.findMany({
      where: { muterId: req.user.userId },
      select: {
        muted: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(mutes.map((m) => ({ ...m.muted, mutedAt: m.createdAt })))
  } catch (err) {
    // Graceful degradation if UserMute table doesn't exist yet
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      return res.json([])
    }
    captureError(err, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
