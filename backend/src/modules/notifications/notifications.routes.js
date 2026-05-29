const express = require('express')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { cacheControl } = require('../../lib/cacheControl')
const prisma = require('../../lib/prisma')

const router = express.Router()

// CLAUDE.md A11 — CSRF defense in depth on writes. `originAllowlist` short-
// circuits GET/HEAD/OPTIONS so applying it at the router level is safe even
// though the bell's inbox read uses GET; only the mark-read / delete writes
// pay the trusted-origin check.
router.use(originAllowlist())

// Strip the trailing `[dedup:...]` marker that notify.js embeds into the
// persisted message so the in-app dedup query can match repeat events.
// Users should never see the marker in the inbox.
function stripDedupMarker(message) {
  if (typeof message !== 'string') return message
  return message.replace(/\s*\[dedup:[^\]]*\]\s*$/, '')
}

function serializeNotification(notif) {
  if (!notif) return notif
  return { ...notif, message: stripDedupMarker(notif.message) }
}

// Notification types that benefit from actor bundling (loop-A5, 2026-05-12).
// Same set as `lib/notify.js#FAN_OUT_DEDUP_TYPES` — low-signal social events
// where "Alice and 4 others starred your sheet" reads better than five
// separate rows. Critical/essential types (mention, reply, contribution,
// moderation, sheet_review, payment_failed) are NEVER grouped — each one
// carries unique context the recipient must see verbatim.
const GROUPABLE_TYPES = new Set(['star', 'fork', 'follow', 'follow_request'])

// Window over which distinct actors are bundled into a single row. Matches
// the 24h horizon called out in the F7 finding. Older notifications of the
// same type/target render as separate groups so the inbox doesn't merge a
// star from last month with one from today.
const GROUP_WINDOW_MS = 24 * 60 * 60 * 1000

// Max distinct actors surfaced in the `actors` array. The remaining count
// is exposed via `actorCount - actors.length` so the frontend can render
// "+ N more" without re-fetching.
const MAX_ACTORS_IN_GROUP = 3

// Hard cap on rows we pull from the DB before grouping. Most inboxes are
// well under this; for power users with a viral sheet the cap keeps the
// query bounded and the in-memory group pass cheap. The grouped result is
// always paginated AFTER grouping so the visible page is consistent
// regardless of how many raw rows fed it.
const MAX_RAW_ROWS_FOR_GROUPING = 300

// Derive a stable target key for grouping. `sheetId` covers the common
// star/fork case; `linkPath` covers everything else (note, post, group).
// We deliberately do NOT include `actorId` here — the whole point is to
// bundle distinct actors.
function groupKeyFor(notif) {
  if (!GROUPABLE_TYPES.has(notif.type)) return null
  const target =
    typeof notif.sheetId === 'number' && notif.sheetId > 0
      ? `s:${notif.sheetId}`
      : typeof notif.linkPath === 'string' && notif.linkPath.length > 0
        ? `p:${notif.linkPath}`
        : null
  if (!target) return null
  return `${notif.type}|${target}`
}

// Group a list of notifications (already ordered `createdAt desc`) into
// rolled-up rows. Consecutive entries with the same `groupKey` within
// GROUP_WINDOW_MS are folded into the most recent record, which carries an
// `actors` array of up to MAX_ACTORS_IN_GROUP distinct contributors plus a
// total `actorCount`. Ungroupable types (mention, reply, comment, …) pass
// through untouched. The underlying DB rows are NOT mutated — the
// `groupedIds` array on the representative row lets the client target the
// whole bundle for read/delete operations.
function groupNotifications(notifications) {
  if (!Array.isArray(notifications) || notifications.length === 0) return []
  const out = []
  // Track the latest open group per groupKey so a non-groupable row in
  // between two groupable rows doesn't accidentally close the group.
  const openGroups = new Map()
  for (const raw of notifications) {
    const notif = serializeNotification(raw)
    const key = groupKeyFor(notif)
    if (!key) {
      out.push({
        ...notif,
        actors: notif.actor ? [notif.actor] : [],
        actorCount: notif.actor ? 1 : 0,
        grouped: false,
        groupedIds: [notif.id],
      })
      continue
    }
    const openIdx = openGroups.get(key)
    if (openIdx != null) {
      const head = out[openIdx]
      const headTime = new Date(head.createdAt).getTime()
      const thisTime = new Date(notif.createdAt).getTime()
      if (
        Number.isFinite(headTime) &&
        Number.isFinite(thisTime) &&
        headTime - thisTime <= GROUP_WINDOW_MS
      ) {
        if (notif.actor && notif.actor.id != null) {
          const already = head.actors.some((a) => a && a.id === notif.actor.id)
          if (!already) {
            head.actorCount += 1
            if (head.actors.length < MAX_ACTORS_IN_GROUP) head.actors.push(notif.actor)
          }
        }
        head.groupedIds.push(notif.id)
        if (!notif.read) head.read = false
        head.grouped = true
        continue
      }
      // Window closed — drop the open marker so the next match starts a
      // fresh group instead of folding into a stale head.
      openGroups.delete(key)
    }
    out.push({
      ...notif,
      actors: notif.actor ? [notif.actor] : [],
      actorCount: notif.actor ? 1 : 0,
      grouped: false,
      groupedIds: [notif.id],
    })
    openGroups.set(key, out.length - 1)
  }
  return out
}

// Count distinct unread groups for the bell badge. Pulls the unread set
// (capped at MAX_RAW_ROWS_FOR_GROUPING so a runaway inbox can't DoS the
// endpoint) and counts the rolled-up groups.
async function computeUnreadGroupCount(userId) {
  const unread = await prisma.notification.findMany({
    where: { userId, read: false },
    include: { actor: { select: { id: true, username: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: MAX_RAW_ROWS_FOR_GROUPING,
  })
  const groups = groupNotifications(unread)
  return { unreadGroupCount: groups.length, unreadRawCount: unread.length }
}

// All notification routes require auth. Reads use the generous read limiter;
// every mutation hits the stricter write limiter so a compromised session
// can't burn through 200 mark-all-read calls per minute.
router.use(requireAuth)

// Filter categories exposed to the inbox dropdown (research-loop-4 F12).
// Maps a short query-param value → the underlying `Notification.type`
// strings the backend persists. Anything not listed here is rejected so
// the dropdown's tab strip can't be coerced into an arbitrary `where`
// clause. Categories mirror NotificationsTab preference groups in the
// frontend settings page so the user model is consistent.
const TYPE_FILTERS = {
  mention: ['mention', 'comment_mention', 'note_mention'],
  reply: ['reply', 'comment_reply', 'thread_reply'],
  social: ['star', 'fork', 'follow', 'follow_request', 'badge_unlocked'],
  study_group: [
    'group_invite',
    'group_join_request',
    'group_member_added',
    'group_session_scheduled',
    'group_session_starting',
    'group_session_canceled',
    'group_discussion_reply',
  ],
  moderation: [
    'moderation_takedown',
    'moderation_warning',
    'moderation_appeal',
    'sheet_review',
    'sheet_rejected',
    'group_report',
  ],
}
const TYPE_FILTER_KEYS = new Set(Object.keys(TYPE_FILTERS))

// ── GET /api/notifications ─────────────────────────────────────
// 15s private cache + 30s SWR absorbs the sidebar bell's natural double-
// mount on SPA route changes without serving stale read receipts. The
// list is per-user; `cacheControl` adds `Vary: Cookie, Authorization` so
// a cached response can never leak to a different session. Research-loop
// -3 P2 #14.
router.get('/', readLimiter, cacheControl(15, { staleWhileRevalidate: 30 }), async (req, res) => {
  // Clamp limit to [1, 50] and offset to >=0 per CLAUDE.md A12. Without
  // this a negative offset reached Prisma's skip clause and threw, and a
  // NaN limit silently degraded to undefined.
  const rawLimit = Number.parseInt(req.query.limit, 10)
  const rawOffset = Number.parseInt(req.query.offset, 10)
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 20
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0

  // F12 inbox filters. `type` restricts to one of the curated buckets
  // (mention / reply / social / study_group / moderation). `onlyUnread`
  // skips the read rows so power users with 200 unread notifications can
  // surface the 3 mentions without paging the whole inbox. Both are
  // additive — a filter that yields zero rows is a legal empty list,
  // never a 400.
  const typeFilterRaw = typeof req.query.type === 'string' ? req.query.type.toLowerCase() : null
  const typeFilter = typeFilterRaw && TYPE_FILTER_KEYS.has(typeFilterRaw) ? typeFilterRaw : null
  const onlyUnread = req.query.onlyUnread === 'true' || req.query.onlyUnread === '1'

  try {
    // Over-fetch raw rows so grouping collapse doesn't leave the visible
    // page short. The cap (MAX_RAW_ROWS_FOR_GROUPING) bounds the worst
    // case — a viral sheet with 500 stars in 24h still returns one row.
    const rawTake = Math.min(MAX_RAW_ROWS_FOR_GROUPING, (offset + limit) * 5)
    const where = { userId: req.user.userId }
    if (typeFilter) where.type = { in: TYPE_FILTERS[typeFilter] }
    if (onlyUnread) where.read = false
    const [rawNotifications, unreadStats] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { actor: { select: { id: true, username: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take: rawTake,
      }),
      computeUnreadGroupCount(req.user.userId),
    ])
    const grouped = groupNotifications(rawNotifications)
    const pageItems = grouped.slice(offset, offset + limit)
    res.json({
      notifications: pageItems,
      // `total` now reports grouped-row count over the fetched window. For
      // the dropdown's "View all" link this is what the user perceives.
      // Raw counts are exposed alongside for parity with older clients.
      total: grouped.length,
      totalRaw: rawNotifications.length,
      // unreadCount/unreadRawCount remain the global counts so the bell
      // badge stays consistent regardless of which tab is active. The
      // grouped page total above already reflects the active filter.
      unreadCount: unreadStats.unreadGroupCount,
      unreadRawCount: unreadStats.unreadRawCount,
      limit,
      offset,
      filter: typeFilter,
      onlyUnread,
    })
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

// Parse + validate the optional `?groupedIds=1,2,3` query param so a single
// read / delete request can sweep an entire bundle. Returns a deduped list
// of positive integers (≠ the route's own id) capped at 100. Anything else
// (negative, NaN, the route's own id) is silently dropped — failures here
// must not 4xx because the client may pass an empty / stale list.
function parseGroupedIds(rawGroupedIds, primaryId) {
  if (typeof rawGroupedIds !== 'string' || rawGroupedIds.length === 0) return []
  const seen = new Set()
  const out = []
  for (const part of rawGroupedIds.split(',')) {
    const n = Number.parseInt(part, 10)
    if (!Number.isInteger(n) || n <= 0 || n === primaryId) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
    if (out.length >= 100) break
  }
  return out
}

// ── PATCH /api/notifications/:id/read ─────────────────────────
// Marks a single notification — OR a whole group — read. If the request
// passes `?groupedIds=...` we mark every underlying row in the bundle.
// Defense in depth: every sweep verifies `userId = req.user.userId`, so a
// crafted groupedIds list cannot mark another user's notifications read.
router.patch('/:id/read', writeLimiter, async (req, res) => {
  const notifId = Number.parseInt(req.params.id, 10)
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

    const groupedIds = parseGroupedIds(req.query.groupedIds, notifId)
    if (groupedIds.length > 0) {
      // Sweep the bundle — but ONLY rows that belong to the same user.
      // Without the userId filter a forged groupedIds list could mark
      // somebody else's notifications read.
      await prisma.notification.updateMany({
        where: { id: { in: [notifId, ...groupedIds] }, userId: req.user.userId },
        data: { read: true },
      })
      return res.json({ id: notifId, read: true, groupedIds })
    }

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
// Deletes a single notification — OR a whole group — for the current user.
// Same groupedIds query param as the read endpoint; same owner-check guard.
router.delete('/:id', writeLimiter, async (req, res) => {
  const notifId = Number.parseInt(req.params.id, 10)
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

    const groupedIds = parseGroupedIds(req.query.groupedIds, notifId)
    if (groupedIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: [notifId, ...groupedIds] }, userId: req.user.userId },
      })
      return res.json({ message: 'Notifications deleted.', groupedIds })
    }

    await prisma.notification.delete({ where: { id: notifId } })
    res.json({ message: 'Notification deleted.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
// Exported helpers for the unit-test surface. Express ignores extra
// properties on a Router function so this does not affect mounting.
module.exports.__internal = {
  groupNotifications,
  groupKeyFor,
  parseGroupedIds,
  GROUPABLE_TYPES,
  GROUP_WINDOW_MS,
  MAX_ACTORS_IN_GROUP,
  TYPE_FILTERS,
  TYPE_FILTER_KEYS,
}
