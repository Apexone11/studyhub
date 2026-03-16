const express = require('express')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const prisma = require('../lib/prisma')

const router = express.Router()

// All notification routes require auth
router.use(requireAuth)

// ── GET /api/notifications ─────────────────────────────────────
router.get('/', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || '20'), 50)
  const offset = parseInt(req.query.offset || '0')
  try {
    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.userId },
        include: { actor: { select: { id: true, username: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where: { userId: req.user.userId } }),
      prisma.notification.count({ where: { userId: req.user.userId, read: false } }),
    ])
    res.json({ notifications, total, unreadCount, limit, offset })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/notifications/read-all ─────────────────────────
router.patch('/read-all', async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.userId, read: false },
      data: { read: true },
    })
    res.json({ updated: result.count })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/notifications/:id/read ─────────────────────────
router.patch('/:id/read', async (req, res) => {
  const notifId = parseInt(req.params.id)
  try {
    const notif = await prisma.notification.findUnique({ where: { id: notifId } })
    if (!notif) return res.status(404).json({ error: 'Notification not found.' })
    if (notif.userId !== req.user.userId) return res.status(403).json({ error: 'Not your notification.' })

    const updated = await prisma.notification.update({
      where: { id: notifId },
      data: { read: true },
    })
    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/notifications/:id ─────────────────────────────
router.delete('/:id', async (req, res) => {
  const notifId = parseInt(req.params.id)
  try {
    const notif = await prisma.notification.findUnique({ where: { id: notifId } })
    if (!notif) return res.status(404).json({ error: 'Notification not found.' })
    if (notif.userId !== req.user.userId) return res.status(403).json({ error: 'Not your notification.' })

    await prisma.notification.delete({ where: { id: notifId } })
    res.json({ message: 'Notification deleted.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
