const express = require('express')
const rateLimit = require('express-rate-limit')
const { PrismaClient } = require('@prisma/client')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const { createNotification } = require('../lib/notify')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../lib/authTokens')

const router = express.Router()
const prisma = new PrismaClient()

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
        createdAt: true,
        _count: {
          select: {
            studySheets: true,
            followers: true,
            following: true,
          }
        },
        enrollments: {
          include: { course: { include: { school: true } } },
        },
        studySheets: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            course: { include: { school: true } },
          },
        },
      },
    })

    if (!user) return res.status(404).json({ error: 'User not found.' })

    let isFollowing = false
    if (req.user && req.user.userId !== user.id) {
      const follow = await prisma.userFollow.findUnique({
        where: { followerId_followingId: { followerId: req.user.userId, followingId: user.id } }
      })
      isFollowing = !!follow
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarUrl || null,
      createdAt: user.createdAt,
      sheetCount: user._count.studySheets,
      followerCount: user._count.followers,
      followingCount: user._count.following,
      isFollowing,
      recentSheets: user.studySheets,
      enrollments: user.enrollments,
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
    })

    const followerCount = await prisma.userFollow.count({ where: { followingId: target.id } })
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

module.exports = router
