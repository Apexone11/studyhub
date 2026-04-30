const express = require('express')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const prisma = require('../../lib/prisma')

const router = express.Router()

// All notification routes require auth. Reads use the generous read limiter;
// every mutation hits the stricter write limiter so a compromised session
// can't burn through 200 mark-all-read calls per minute.
router.use(requireAuth)

// ── GET /api/notifications ─────────────────────────────────────
router.get('/', readLimiter, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 50)
  const offset = parseInt(req.query.offset || '0', 10) || 0
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
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── PATCH /api/notifications/read-all ─────────────────────────
router.patch('/read-all', writeLimiter, async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.userId, read: false },
      data: { read: true },
    })
    res.json({ updated: result.count })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── PATCH /api/notifications/:id/read ─────────────────────────
router.patch('/:id/read', writeLimiter, async (req, res) => {
  const notifId = parseInt(req.params.id, 10)
  if (!Number.isInteger(notifId) || notifId <= 0) {
    return sendError(res, 400, 'Invalid notification id.', ERROR_CODES.BAD_REQUEST)
  }
  try {
    const notif = await prisma.notification.findUnique({ where: { id: notifId } })
    if (!notif) return sendError(res, 404, 'Notification not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: notif.userId,
        message: 'Not your notification.',
        targetType: 'notification',
        targetId: notifId,
      })
    )
      return

    const updated = await prisma.notification.update({
      where: { id: notifId },
      data: { read: true },
    })
    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── DELETE /api/notifications/read ────────────────────────────
// Deletes all read notifications for the current user (clear inbox).
router.delete('/read', writeLimiter, async (req, res) => {
  try {
    const result = await prisma.notification.deleteMany({
      where: { userId: req.user.userId, read: true },
    })
    res.json({ deleted: result.count })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── DELETE /api/notifications/:id ─────────────────────────────
router.delete('/:id', writeLimiter, async (req, res) => {
  const notifId = parseInt(req.params.id, 10)
  if (!Number.isInteger(notifId) || notifId <= 0) {
    return sendError(res, 400, 'Invalid notification id.', ERROR_CODES.BAD_REQUEST)
  }
  try {
    const notif = await prisma.notification.findUnique({ where: { id: notifId } })
    if (!notif) return sendError(res, 404, 'Notification not found.', ERROR_CODES.NOT_FOUND)
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: notif.userId,
        message: 'Not your notification.',
        targetType: 'notification',
        targetId: notifId,
      })
    )
      return

    await prisma.notification.delete({ where: { id: notifId } })
    res.json({ message: 'Notification deleted.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
