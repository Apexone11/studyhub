const express = require('express')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const { deleteUserAccount } = require('../lib/deleteUserAccount')
const { validateHtmlForSubmission } = require('../lib/htmlSecurity')
const prisma = require('../lib/prisma')

const router = express.Router()

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

// ── GET /api/admin/sheets/review?status=pending_review&page=1 ───────────────
router.get('/sheets/review', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10))
  const rawStatus = String(req.query.status || 'pending_review').trim().toLowerCase()
  const status = ['pending_review', 'rejected', 'draft', 'published'].includes(rawStatus)
    ? rawStatus
    : 'pending_review'

  try {
    const [sheets, total] = await Promise.all([
      prisma.studySheet.findMany({
        where: { status },
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.studySheet.count({ where: { status } }),
    ])
    res.json({ sheets, total, page, pages: Math.ceil(total / PAGE_SIZE), status })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/sheets/:id/review ─────────────────────────────
router.patch('/sheets/:id/review', async (req, res) => {
  const sheetId = parseInt(req.params.id, 10)
  const action = String(req.body?.action || '').trim().toLowerCase()

  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "approve" or "reject".' })
  }

  try {
    const current = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        status: true,
        contentFormat: true,
        content: true,
      },
    })
    if (!current) return res.status(404).json({ error: 'Sheet not found.' })

    if (current.contentFormat === 'html' && action === 'approve') {
      const validation = validateHtmlForSubmission(current.content)
      if (!validation.ok) {
        return res.status(400).json({
          error: validation.issues[0],
          issues: validation.issues,
        })
      }
    }

    const nextStatus = action === 'approve' ? 'published' : 'rejected'
    const updated = await prisma.studySheet.update({
      where: { id: sheetId },
      data: { status: nextStatus },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
      },
    })

    res.json({
      message: action === 'approve' ? 'Sheet approved and published.' : 'Sheet rejected.',
      sheet: updated,
    })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Sheet not found.' })
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
    res.status(500).json({ error: `Deletion failed: ${err.message}` })
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
