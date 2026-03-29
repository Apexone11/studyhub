/**
 * Admin Audit Log Controller — read-only access to the audit trail.
 *
 * GET /audit-log — paginated audit log with optional filters.
 *   Query params: page, event, actorId, targetUserId, since, until
 */
const express = require('express')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { PAGE_SIZE, parsePage } = require('./admin.constants')

const router = express.Router()

router.get('/audit-log', async (req, res) => {
  const page = parsePage(req.query.page)
  const skip = (page - 1) * PAGE_SIZE

  try {
    const where = {}

    // Optional event prefix filter (e.g. "auth", "admin", "moderation")
    if (req.query.event) {
      where.event = { startsWith: req.query.event }
    }

    // Optional actor filter
    if (req.query.actorId) {
      const actorId = Number.parseInt(req.query.actorId, 10)
      if (Number.isFinite(actorId)) where.actorId = actorId
    }

    // Optional target user filter
    if (req.query.targetUserId) {
      const targetUserId = Number.parseInt(req.query.targetUserId, 10)
      if (Number.isFinite(targetUserId)) where.targetUserId = targetUserId
    }

    // Optional date range
    if (req.query.since || req.query.until) {
      where.createdAt = {}
      if (req.query.since) {
        const since = new Date(req.query.since)
        if (!isNaN(since)) where.createdAt.gte = since
      }
      if (req.query.until) {
        const until = new Date(req.query.until)
        if (!isNaN(until)) where.createdAt.lte = until
      }
      if (Object.keys(where.createdAt).length === 0) delete where.createdAt
    }

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      prisma.auditLog.count({ where }),
    ])

    // Resolve actor usernames for display
    const actorIds = [...new Set(entries.map((e) => e.actorId).filter(Boolean))]
    const targetIds = [...new Set(entries.map((e) => e.targetUserId).filter(Boolean))]
    const allUserIds = [...new Set([...actorIds, ...targetIds])]

    const users = allUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: allUserIds } },
          select: { id: true, username: true },
        })
      : []
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.username]))

    const enriched = entries.map((entry) => ({
      ...entry,
      actorUsername: entry.actorId ? userMap[entry.actorId] || null : null,
      targetUsername: entry.targetUserId ? userMap[entry.targetUserId] || null : null,
    }))

    res.json({
      entries: enriched,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE) || 1,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
