/**
 * Admin Audit Log Controller — read-only access to the audit trail.
 *
 * GET /audit-log — paginated audit log with optional filters.
 *   Query params: page, event, actorId, targetUserId, since, until, resource, search
 * GET /audit-log/user/:userId — all logs for a specific user.
 * GET /audit-log/export — download logs for a user (sanitized JSON).
 */
const express = require('express')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { maskEmail } = require('../../lib/fieldEncryption')
const { PAGE_SIZE, parsePage } = require('./admin.constants')

const router = express.Router()

const EVENT_TYPE_LABELS = {
  auth: 'Auth',
  admin: 'Admin',
  moderation: 'Moderation',
  sheet: 'Sheets',
  comment: 'Comments',
  upload: 'Uploads',
  contribution: 'Contributions',
  settings: 'Settings',
  pii: 'PII access',
}

/**
 * Build where clause from query params (shared between list and export).
 */
function buildWhere(query, { includeEvent = true } = {}) {
  const where = {}

  if (includeEvent && query.event) {
    where.event = { startsWith: query.event }
  }

  if (query.actorId) {
    const actorId = Number.parseInt(query.actorId, 10)
    if (Number.isFinite(actorId)) where.actorId = actorId
  }

  if (query.targetUserId) {
    const targetUserId = Number.parseInt(query.targetUserId, 10)
    if (Number.isFinite(targetUserId)) where.targetUserId = targetUserId
  }

  if (query.resource) {
    where.resource = { startsWith: query.resource }
  }

  if (query.search) {
    const q = query.search.trim()
    if (q.length >= 2) {
      where.OR = [
        { event: { contains: q, mode: 'insensitive' } },
        { route: { contains: q, mode: 'insensitive' } },
        { resource: { contains: q, mode: 'insensitive' } },
      ]
    }
  }

  if (query.since || query.until) {
    where.createdAt = {}
    if (query.since) {
      const since = new Date(query.since)
      if (!isNaN(since)) where.createdAt.gte = since
    }
    if (query.until) {
      const until = new Date(query.until)
      if (!isNaN(until)) where.createdAt.lte = until
    }
    if (Object.keys(where.createdAt).length === 0) delete where.createdAt
  }

  return where
}

function eventPrefix(event) {
  const [prefix] = String(event || '').split('.')
  return prefix || 'other'
}

function eventTypeLabel(prefix) {
  if (EVENT_TYPE_LABELS[prefix]) return EVENT_TYPE_LABELS[prefix]
  return prefix
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Resolve actor and target usernames for a list of audit entries.
 */
async function enrichEntries(entries) {
  const actorIds = [...new Set(entries.map((e) => e.actorId).filter(Boolean))]
  const targetIds = [...new Set(entries.map((e) => e.targetUserId).filter(Boolean))]
  const allUserIds = [...new Set([...actorIds, ...targetIds])]

  const users =
    allUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: allUserIds } },
          select: { id: true, username: true },
        })
      : []
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.username]))

  return entries.map((entry) => ({
    ...entry,
    actorUsername: entry.actorId ? userMap[entry.actorId] || null : null,
    targetUsername: entry.targetUserId ? userMap[entry.targetUserId] || null : null,
  }))
}

// ── GET /audit-log — paginated, filterable ──────────────────────
router.get('/audit-log', async (req, res) => {
  const page = parsePage(req.query.page)
  const skip = (page - 1) * PAGE_SIZE

  try {
    const where = buildWhere(req.query)

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      prisma.auditLog.count({ where }),
    ])

    const enriched = await enrichEntries(entries)

    res.json({
      entries: enriched,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE) || 1,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── GET /audit-log/event-types — prefixes with live counts ───────────────
router.get('/audit-log/event-types', async (req, res) => {
  try {
    const where = buildWhere(req.query, { includeEvent: false })
    const groupedEvents = await prisma.auditLog.groupBy({
      by: ['event'],
      where,
      _count: { _all: true },
    })

    const totalsByPrefix = new Map()

    for (const row of groupedEvents) {
      const prefix = eventPrefix(row.event)
      const count = row._count?._all || 0
      if (!count) continue
      totalsByPrefix.set(prefix, (totalsByPrefix.get(prefix) || 0) + count)
    }

    const eventTypes = [...totalsByPrefix.entries()]
      .map(([value, count]) => ({ value, label: eventTypeLabel(value), count }))
      .sort((left, right) => {
        if (right.count !== left.count) return right.count - left.count
        return left.label.localeCompare(right.label)
      })

    res.json({
      total: eventTypes.reduce((sum, type) => sum + type.count, 0),
      eventTypes,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── GET /audit-log/user/:userId — all logs for a specific user ──
router.get('/audit-log/user/:userId', async (req, res) => {
  const userId = Number.parseInt(req.params.userId, 10)
  if (!Number.isFinite(userId)) {
    return sendError(res, 400, 'Invalid userId.', ERROR_CODES.BAD_REQUEST)
  }

  const page = parsePage(req.query.page)
  const skip = (page - 1) * PAGE_SIZE

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    })
    if (!user) {
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
    }

    const where = { actorId: userId }

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      prisma.auditLog.count({ where }),
    ])

    const enriched = await enrichEntries(entries)

    res.json({
      user: { id: user.id, username: user.username },
      entries: enriched,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE) || 1,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── GET /audit-log/export — download sanitized JSON for a user ──
router.get('/audit-log/export', async (req, res) => {
  const userId = Number.parseInt(req.query.userId, 10)
  if (!Number.isFinite(userId)) {
    return sendError(res, 400, 'userId query parameter is required.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true },
    })
    if (!user) {
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
    }

    const entries = await prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })

    // Sanitize: mask emails in details, remove raw IPs from the export
    const sanitized = entries.map((entry) => {
      const sanitizedDetails = sanitizeDetails(entry.details)
      return {
        id: entry.id,
        event: entry.event,
        resource: entry.resource || null,
        resourceId: entry.resourceId || null,
        details: sanitizedDetails,
        route: entry.route || null,
        method: entry.method || null,
        ipAddress: entry.ipAddress ? maskIpForAdmin(entry.ipAddress) : null,
        createdAt: entry.createdAt,
      }
    })

    const dateStr = new Date().toISOString().slice(0, 10)
    const filename = `audit-log-${user.username}-${dateStr}.json`

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    res.json({
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        username: user.username,
        email: user.email ? maskEmail(user.email) : null,
      },
      totalEntries: sanitized.length,
      entries: sanitized,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Export failed.', ERROR_CODES.INTERNAL)
  }
})

/**
 * Mask IP for admin exports -- show partial IP for accountability.
 * e.g., "192.168.1.45" -> "192.168.x.x"
 */
function maskIpForAdmin(ip) {
  if (!ip) return null
  // IPv4
  const parts = ip.split('.')
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.x.x`
  }
  // IPv6 — show first 4 groups
  const v6parts = ip.split(':')
  if (v6parts.length > 4) {
    return v6parts.slice(0, 4).join(':') + ':x:x:x:x'
  }
  return ip
}

const SENSITIVE_DETAIL_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'secret',
  'apikey',
  'accesstoken',
  'refreshtoken',
])

function maskAuditEmail(value) {
  return typeof value === 'string' ? maskEmail(value) : '[REDACTED]'
}

/**
 * Sanitize details JSON: remove password hashes, tokens, mask emails.
 */
function sanitizeDetails(details, parentKey = '') {
  const normalizedParentKey = String(parentKey || '').toLowerCase()

  if (normalizedParentKey === 'email') {
    return maskAuditEmail(details)
  }

  if (Array.isArray(details)) {
    return details.map((item) => sanitizeDetails(item, parentKey))
  }

  if (!details || typeof details !== 'object') {
    return details
  }

  const sanitized = {}
  for (const [key, value] of Object.entries(details)) {
    const normalizedKey = key.toLowerCase()
    if (SENSITIVE_DETAIL_KEYS.has(normalizedKey)) {
      sanitized[key] = '[REDACTED]'
      continue
    }
    sanitized[key] = sanitizeDetails(value, key)
  }

  return sanitized
}

module.exports = router
