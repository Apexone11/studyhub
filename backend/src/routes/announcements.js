const express = require('express')
const { sendForbidden } = require('../lib/accessControl')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const prisma = require('../lib/prisma')

const router = express.Router()

// ── GET /api/announcements — public ──────────────────────────
router.get('/', async (req, res) => {
  try {
    const announcements = await prisma.announcement.findMany({
      include: { author: { select: { id: true, username: true } } },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    })
    res.json(announcements)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/announcements — admin only ──────────────────────
router.post('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendForbidden(res, 'Admin access required.')
  }

  const title  = typeof req.body.title === 'string' ? req.body.title.trim() : ''
  const body   = typeof req.body.body  === 'string' ? req.body.body.trim()  : ''
  const pinned = !!req.body.pinned

  if (!title) return res.status(400).json({ error: 'Title is required.' })
  if (!body)  return res.status(400).json({ error: 'Body is required.' })
  if (title.length > 200) return res.status(400).json({ error: 'Title must be 200 characters or fewer.' })

  try {
    const announcement = await prisma.announcement.create({
      data: { title, body, pinned, authorId: req.user.userId },
      include: { author: { select: { id: true, username: true } } }
    })
    res.status(201).json(announcement)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/announcements/:id — admin only ───────────────
router.delete('/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendForbidden(res, 'Admin access required.')
  }

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
