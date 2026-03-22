const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const { deleteUserAccount } = require('../../lib/deleteUserAccount')
const prisma = require('../../lib/prisma')
const { PAGE_SIZE, parsePage } = require('./admin.constants')

const router = express.Router()

// ── GET /api/admin/stats ──────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [
      totalUsers, usersThisWeek,
      totalSheets, publishedSheets, draftSheets,
      totalComments, flaggedRequests, starAgg,
      totalNotes, totalFollows, totalReactions,
      totalFeedPosts,
      pendingCases, activeStrikes, pendingAppeals,
      recentModerationActions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: oneWeekAgo } } }),
      prisma.studySheet.count(),
      prisma.studySheet.count({ where: { status: 'published' } }),
      prisma.studySheet.count({ where: { status: 'draft' } }),
      prisma.comment.count(),
      prisma.requestedCourse.count({ where: { flagged: true } }),
      prisma.studySheet.aggregate({ _sum: { stars: true } }),
      prisma.note.count(),
      prisma.userFollow.count(),
      prisma.reaction.count(),
      prisma.feedPost.count(),
      prisma.moderationCase.count({ where: { status: 'pending' } }).catch(() => 0),
      prisma.strike.count({ where: { decayedAt: null, expiresAt: { gt: new Date() } } }).catch(() => 0),
      prisma.appeal.count({ where: { status: 'pending' } }).catch(() => 0),
      prisma.moderationCase.findMany({
        where: { status: { not: 'pending' } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: {
          user: { select: { id: true, username: true } },
          reviewer: { select: { id: true, username: true } },
        },
      }).catch(() => []),
    ])

    res.json({
      totalUsers,
      totalSheets,
      totalComments,
      flaggedRequests,
      totalStars: starAgg._sum.stars || 0,
      totalNotes,
      totalFollows,
      totalReactions,
      users: { total: totalUsers, thisWeek: usersThisWeek },
      sheets: { total: totalSheets, published: publishedSheets, draft: draftSheets },
      moderation: { pendingCases, activeStrikes, pendingAppeals },
      feedPosts: { total: totalFeedPosts },
      recentModerationActions,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/users?page=1 ───────────────────────────────
router.get('/users', async (req, res) => {
  const page = parsePage(req.query.page)
  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          email: true,
          createdAt: true,
          _count: { select: { studySheets: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.user.count(),
    ])
    res.json({ users, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/users/:id/role ──────────────────────────
router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body || {}
  if (!['admin', 'student'].includes(role)) {
    return res.status(400).json({ error: 'Role must be "admin" or "student".' })
  }
  // Prevent removing your own admin role
  if (parseInt(req.params.id) === req.user.userId) {
    return res.status(400).json({ error: 'You cannot change your own role.' })
  }
  try {
    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data: { role },
      select: { id: true, username: true, role: true }
    })
    res.json(user)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/admin/users/:id ──────────────────────────────
router.delete('/users/:id', async (req, res) => {
  const targetId = parseInt(req.params.id)
  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ error: 'User id must be an integer.' })
  }
  if (targetId === req.user.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account through this endpoint.' })
  }
  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, username: true },
    })
    if (!targetUser) return res.status(404).json({ error: 'User not found.' })

    await deleteUserAccount(prisma, {
      userId: targetUser.id,
      username: targetUser.username,
    })

    res.json({ message: 'User deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found.' })
    if (err.code === 'P2003') return res.status(409).json({ error: 'Cannot delete user: dependent records still exist. Contact support.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Deletion failed. Please try again or contact support.' })
  }
})

// ── GET /api/admin/deletion-reasons?page=1 ───────────────────
router.get('/deletion-reasons', async (req, res) => {
  const page = parsePage(req.query.page)
  try {
    const [reasons, total] = await Promise.all([
      prisma.deletionReason.findMany({
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.deletionReason.count(),
    ])
    res.json({ reasons, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
