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

module.exports = router
