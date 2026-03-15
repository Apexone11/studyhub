const express = require('express')
const { PrismaClient } = require('@prisma/client')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')

const router = express.Router()
const prisma = new PrismaClient()

// All admin routes require auth + admin role
router.use(requireAuth)
router.use((req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' })
  next()
})

const PAGE_SIZE = 20

// ── GET /api/admin/stats ──────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, totalSheets, totalComments, flaggedRequests, starAgg, totalNotes, totalFollows, totalReactions] = await Promise.all([
      prisma.user.count(),
      prisma.studySheet.count(),
      prisma.comment.count(),
      prisma.requestedCourse.count({ where: { flagged: true } }),
      prisma.studySheet.aggregate({ _sum: { stars: true } }),
      prisma.note.count(),
      prisma.userFollow.count(),
      prisma.reaction.count(),
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
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/users?page=1 ───────────────────────────────
router.get('/users', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1'))
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

// ── GET /api/admin/sheets?page=1 ─────────────────────────────
router.get('/sheets', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1'))
  try {
    const [sheets, total] = await Promise.all([
      prisma.studySheet.findMany({
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.studySheet.count(),
    ])
    res.json({ sheets, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/users/:id/role ──────────────────────────
router.patch('/users/:id/role', async (req, res) => {
  const role = req.body.role
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

// ── DELETE /api/admin/sheets/:id ─────────────────────────────
router.delete('/sheets/:id', async (req, res) => {
  try {
    await prisma.studySheet.delete({ where: { id: parseInt(req.params.id) } })
    res.json({ message: 'Sheet deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Sheet not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/admin/users/:id ──────────────────────────────
router.delete('/users/:id', async (req, res) => {
  const targetId = parseInt(req.params.id)
  if (targetId === req.user.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account through this endpoint.' })
  }
  try {
    await prisma.user.delete({ where: { id: targetId } })
    res.json({ message: 'User deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/deletion-reasons?page=1 ───────────────────
router.get('/deletion-reasons', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1'))
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

// ── GET /api/admin/announcements ─────────────────────────────
router.get('/announcements', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1'))
  try {
    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        include: { author: { select: { id: true, username: true } } },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.announcement.count(),
    ])
    res.json({ announcements, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/admin/announcements ────────────────────────────
router.post('/announcements', async (req, res) => {
  const { title, body, pinned } = req.body || {}
  if (!title?.trim() || !body?.trim()) return res.status(400).json({ error: 'Title and body are required.' })
  try {
    const announcement = await prisma.announcement.create({
      data: {
        title: title.trim().slice(0, 200),
        body: body.trim().slice(0, 2000),
        authorId: req.user.userId,
        pinned: Boolean(pinned),
      },
      include: { author: { select: { id: true, username: true } } },
    })
    res.status(201).json(announcement)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/announcements/:id/pin ───────────────────
router.patch('/announcements/:id/pin', async (req, res) => {
  try {
    const current = await prisma.announcement.findUnique({ where: { id: parseInt(req.params.id) } })
    if (!current) return res.status(404).json({ error: 'Announcement not found.' })
    const updated = await prisma.announcement.update({
      where: { id: current.id },
      data: { pinned: !current.pinned },
      include: { author: { select: { id: true, username: true } } },
    })
    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/admin/announcements/:id ──────────────────────
router.delete('/announcements/:id', async (req, res) => {
  try {
    await prisma.announcement.delete({ where: { id: parseInt(req.params.id) } })
    res.json({ message: 'Announcement deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Announcement not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
