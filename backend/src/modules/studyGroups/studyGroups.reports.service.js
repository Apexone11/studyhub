/**
 * studyGroups.reports.service.js — Phase 5 trust & safety core.
 *
 * Responsibilities:
 *   - Report creation with one-per-user-per-group enforcement at the
 *     service level in addition to the DB unique index.
 *   - Auto-lock escalation: if a group collects 5 unique pending
 *     reports in a 24-hour window, transition it to 'locked' and
 *     stamp the reports as 'escalated' so the admin queue shows why.
 *   - Resolution actions: dismiss, warn (7-day banner), lock
 *     (read-only), delete (30-day soft delete). Each action writes a
 *     GroupAuditLog row + notifies the group creator.
 *   - Reporter-hiding helper: the frontend uses this to filter out
 *     groups the current user has an unresolved report on so they
 *     don't keep seeing the offending group in lists or search.
 *
 * Reporter anonymity is an invariant: the group owner never learns
 * who filed a report. Admins can see reporter identity in the review
 * tab for accountability.
 */
const prisma = require('../../lib/prisma')
const { createNotification, createNotifications } = require('../../lib/notify')
const { captureError } = require('../../monitoring/sentry')

const VALID_REASONS = Object.freeze([
  'spam',
  'harassment',
  'hate',
  'copyright',
  'impersonation',
  'sexual',
  'other',
])

const ACTIVE_REPORT_STATUSES = Object.freeze(['pending', 'escalated', 'warned', 'locked'])
const AUTO_LOCK_THRESHOLD = 5
const AUTO_LOCK_WINDOW_MS = 24 * 60 * 60 * 1000
const WARNING_DURATION_MS = 7 * 24 * 60 * 60 * 1000

function isValidReason(reason) {
  return VALID_REASONS.includes(reason)
}

/**
 * Extract request forensics for the audit log. Proxies + Railway hand
 * us the real IP via X-Forwarded-For; fall back to the socket address.
 * We store the raw value; a retention job can mask or drop old rows.
 */
function captureRequestFingerprint(req) {
  if (!req) return { ipAddress: null, userAgent: null }
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  const ipAddress = forwarded || req.ip || req.socket?.remoteAddress || null
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500) || null
  return { ipAddress, userAgent }
}

/**
 * Write a row to GroupAuditLog. Non-fatal on failure so audit outages
 * never block a mod action — but we always capture to Sentry so a
 * drop in audit throughput gets noticed.
 */
async function writeAuditLog({ groupId, actorId, action, targetType, targetId, context, req }) {
  try {
    const { ipAddress, userAgent } = captureRequestFingerprint(req)
    await prisma.groupAuditLog.create({
      data: {
        groupId,
        actorId,
        action,
        targetType: targetType || null,
        targetId: targetId || null,
        context: context || null,
        ipAddress,
        userAgent,
      },
    })
  } catch (error) {
    captureError(error, { location: 'studyGroups.reports.service/writeAuditLog', groupId, actorId, action })
  }
}

/**
 * Sanitize freeform text before storing. Strip HTML, trim whitespace,
 * cap length. Matches the sanitizeText helper used elsewhere in the
 * module so callers see consistent behavior.
 */
function sanitizeDetails(input, maxLength = 500) {
  if (typeof input !== 'string') return ''
  return input.replace(/<[^>]*>/g, '').trim().slice(0, maxLength)
}

/**
 * Create a report. Throws a shaped error (status, code) on validation
 * failure or duplicate. Route handlers translate into HTTP responses.
 */
async function createReport({ groupId, reporterId, reason, details, attachments, req }) {
  if (!isValidReason(reason)) {
    const err = new Error('Invalid report reason.')
    err.status = 400
    err.code = 'VALIDATION'
    throw err
  }

  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, createdById: true, deletedAt: true },
  })
  if (!group || group.deletedAt) {
    const err = new Error('Group not found.')
    err.status = 404
    err.code = 'NOT_FOUND'
    throw err
  }

  // A group owner cannot report their own group.
  if (group.createdById === reporterId) {
    const err = new Error('You cannot report a group you own.')
    err.status = 400
    err.code = 'SELF_REPORT_FORBIDDEN'
    throw err
  }

  // Enforce one report per (group, reporter). The DB unique index is the
  // last line of defense; this check gives a nicer error message.
  const existing = await prisma.groupReport.findUnique({
    where: { groupId_reporterId: { groupId, reporterId } },
    select: { id: true, status: true },
  })
  if (existing) {
    const err = new Error('You already reported this group.')
    err.status = 409
    err.code = 'DUPLICATE_REPORT'
    throw err
  }

  // Validate attachments shape (reuse the pattern from discussion posts).
  let validatedAttachments = null
  if (attachments != null) {
    if (!Array.isArray(attachments)) {
      const err = new Error('attachments must be an array.')
      err.status = 400
      err.code = 'VALIDATION'
      throw err
    }
    if (attachments.length > 2) {
      const err = new Error('Max 2 evidence attachments per report.')
      err.status = 400
      err.code = 'VALIDATION'
      throw err
    }
    const allowedKinds = new Set(['image', 'video', 'file'])
    validatedAttachments = attachments.map((raw) => {
      if (!raw || typeof raw !== 'object') {
        const err = new Error('Each attachment must be an object.')
        err.status = 400
        err.code = 'VALIDATION'
        throw err
      }
      if (typeof raw.url !== 'string' || !raw.url.startsWith('/uploads/group-media/')) {
        const err = new Error('attachment.url must be an /uploads/group-media/... path.')
        err.status = 400
        err.code = 'VALIDATION'
        throw err
      }
      if (raw.kind && !allowedKinds.has(raw.kind)) {
        const err = new Error('Invalid attachment.kind.')
        err.status = 400
        err.code = 'VALIDATION'
        throw err
      }
      return {
        url: raw.url,
        mime: typeof raw.mime === 'string' ? raw.mime.slice(0, 120) : null,
        bytes: Number.parseInt(raw.bytes, 10) || null,
        kind: raw.kind || 'file',
      }
    })
  }

  const report = await prisma.groupReport.create({
    data: {
      groupId,
      reporterId,
      reason,
      details: sanitizeDetails(details),
      attachments: validatedAttachments,
    },
  })

  // Non-blocking: audit log, group-owner notification, escalation check.
  await writeAuditLog({
    groupId,
    actorId: reporterId,
    action: 'group.report.filed',
    targetType: 'group',
    targetId: groupId,
    context: { reason },
    req,
  })

  // Notify the group creator (and admins/moderators too — the whole
  // mod team should know). Copy is intentionally vague to preserve
  // reporter anonymity.
  try {
    const modTeam = await prisma.studyGroupMember.findMany({
      where: {
        groupId,
        status: 'active',
        OR: [{ role: 'admin' }, { role: 'moderator' }],
      },
      select: { userId: true },
    })
    const recipientIds = new Set([group.createdById])
    for (const row of modTeam) recipientIds.add(row.userId)
    // Do not notify the reporter even if they happen to be an admin.
    recipientIds.delete(reporterId)
    if (recipientIds.size > 0) {
      await createNotifications(prisma, Array.from(recipientIds).map((userId) => ({
        userId,
        type: 'group_reported',
        message: `Your group "${group.name}" has been reported. Our team will review it.`,
        // actorId intentionally NOT set to preserve reporter anonymity
        linkPath: `/study-groups/${groupId}`,
        priority: 'medium',
      })))
    }
  } catch (error) {
    captureError(error, { location: 'studyGroups.reports.service/createReport/notify' })
  }

  // Auto-lock escalation: 5 unique reporters in 24h lock the group.
  await maybeEscalate(groupId, req)

  return report
}

/**
 * Count unique pending reporters in the last AUTO_LOCK_WINDOW_MS and,
 * if the threshold is met, transition the group to 'locked' and mark
 * matching reports as 'escalated'. Idempotent — running twice on an
 * already-locked group is a no-op.
 */
async function maybeEscalate(groupId, req) {
  try {
    const since = new Date(Date.now() - AUTO_LOCK_WINDOW_MS)
    const pendingReports = await prisma.groupReport.findMany({
      where: {
        groupId,
        status: 'pending',
        createdAt: { gte: since },
      },
      select: { id: true, reporterId: true },
    })
    const uniqueReporters = new Set(pendingReports.map((r) => r.reporterId))
    if (uniqueReporters.size < AUTO_LOCK_THRESHOLD) return false

    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
      select: { id: true, moderationStatus: true, createdById: true, name: true },
    })
    if (!group || group.moderationStatus === 'locked' || group.moderationStatus === 'deleted') {
      return false
    }

    await prisma.studyGroup.update({
      where: { id: groupId },
      data: {
        moderationStatus: 'locked',
        lockedAt: new Date(),
      },
    })

    await prisma.groupReport.updateMany({
      where: { id: { in: pendingReports.map((r) => r.id) } },
      data: { status: 'escalated' },
    })

    await writeAuditLog({
      groupId,
      actorId: 0, // system actor
      action: 'group.auto_lock',
      targetType: 'group',
      targetId: groupId,
      context: {
        reason: 'auto_lock_threshold_met',
        threshold: AUTO_LOCK_THRESHOLD,
        uniqueReporters: uniqueReporters.size,
      },
      req,
    })

    // Notify the group creator that an automatic lock happened.
    await createNotification(prisma, {
      userId: group.createdById,
      type: 'group_auto_locked',
      message: `Your group "${group.name}" has been temporarily locked while our team reviews reports. You can appeal from the group page.`,
      linkPath: `/study-groups/${groupId}`,
      priority: 'high',
    })

    return true
  } catch (error) {
    captureError(error, { location: 'studyGroups.reports.service/maybeEscalate', groupId })
    return false
  }
}

/**
 * Apply an admin resolution to a group report. Resolves every open
 * report on that group in one transaction so the queue stays tidy.
 *
 * Actions:
 *   - 'dismiss' → report closed as unfounded, group moderationStatus
 *     restored to 'active' if it was auto-locked by this chain.
 *     Reporter regains visibility of the group.
 *   - 'warn'    → 7-day banner on the group. Owner notified.
 *   - 'lock'    → read-only until appealed. Owner notified.
 *   - 'delete'  → soft delete for 30 days. Owner notified with
 *                  appeal window.
 */
async function resolveReport({
  reportId, actorId, action, resolution = '', req,
}) {
  const allowed = ['dismiss', 'warn', 'lock', 'delete']
  if (!allowed.includes(action)) {
    const err = new Error('Invalid action.')
    err.status = 400
    err.code = 'VALIDATION'
    throw err
  }

  const report = await prisma.groupReport.findUnique({
    where: { id: reportId },
    include: {
      group: { select: { id: true, name: true, createdById: true, moderationStatus: true } },
    },
  })
  if (!report) {
    const err = new Error('Report not found.')
    err.status = 404
    err.code = 'NOT_FOUND'
    throw err
  }

  const now = new Date()
  const groupId = report.groupId

  // Status mapping + group-level side effects.
  let newGroupStatus = report.group.moderationStatus
  const groupUpdates = {}
  let ownerMessage = null
  let reportFinalStatus = action // one of 'dismissed' | 'warned' | 'locked' | 'deleted'

  if (action === 'dismiss') {
    reportFinalStatus = 'dismissed'
    // If the group was auto-locked by reports, restore it to active.
    if (report.group.moderationStatus === 'locked') {
      newGroupStatus = 'active'
      groupUpdates.moderationStatus = 'active'
      groupUpdates.lockedAt = null
    }
  } else if (action === 'warn') {
    reportFinalStatus = 'warned'
    newGroupStatus = 'warned'
    groupUpdates.moderationStatus = 'warned'
    groupUpdates.warnedUntil = new Date(now.getTime() + WARNING_DURATION_MS)
    ownerMessage = `Your group "${report.group.name}" received a warning from our review team. Review the community guidelines to avoid further action.`
  } else if (action === 'lock') {
    reportFinalStatus = 'locked'
    newGroupStatus = 'locked'
    groupUpdates.moderationStatus = 'locked'
    groupUpdates.lockedAt = now
    ownerMessage = `Your group "${report.group.name}" has been locked (read-only) after a report review. You can appeal this decision from the group page.`
  } else if (action === 'delete') {
    reportFinalStatus = 'deleted'
    newGroupStatus = 'deleted'
    groupUpdates.moderationStatus = 'deleted'
    groupUpdates.deletedAt = now
    groupUpdates.deletedById = actorId
    ownerMessage = `Your group "${report.group.name}" has been removed after a report review. You have 30 days to submit an appeal from the group page before content is permanently deleted.`
  }

  // Resolve every open report on this group in a single transaction so
  // the queue doesn't keep showing dups.
  await prisma.$transaction(async (tx) => {
    if (Object.keys(groupUpdates).length > 0) {
      await tx.studyGroup.update({
        where: { id: groupId },
        data: groupUpdates,
      })
    }
    await tx.groupReport.updateMany({
      where: { groupId, status: { in: ACTIVE_REPORT_STATUSES } },
      data: {
        status: reportFinalStatus,
        resolvedAt: now,
        resolvedById: actorId,
        resolution: sanitizeDetails(resolution, 1000),
      },
    })
  })

  await writeAuditLog({
    groupId,
    actorId,
    action: `group.report.${action}`,
    targetType: 'group',
    targetId: groupId,
    context: {
      reportId,
      previousStatus: report.group.moderationStatus,
      nextStatus: newGroupStatus,
    },
    req,
  })

  if (ownerMessage) {
    try {
      await createNotification(prisma, {
        userId: report.group.createdById,
        type: 'group_moderation_action',
        message: ownerMessage,
        linkPath: `/study-groups/${groupId}`,
        priority: 'high',
      })
    } catch (error) {
      captureError(error, { location: 'studyGroups.reports.service/resolveReport/notify' })
    }
  }

  return { groupId, action, newGroupStatus }
}

/**
 * Return the ID set of groups the given user has an active report on.
 * Used by list/search endpoints to hide the offending group from the
 * reporter's view until an admin dismisses the report.
 *
 * Graceful-degradation: on DB error we return an empty set so the
 * user still sees everything — better than a 500 wall.
 */
async function getHiddenGroupIdsForReporter(userId) {
  if (!userId) return new Set()
  try {
    const rows = await prisma.groupReport.findMany({
      where: {
        reporterId: userId,
        status: { in: ACTIVE_REPORT_STATUSES },
      },
      select: { groupId: true },
    })
    return new Set(rows.map((r) => r.groupId))
  } catch (error) {
    captureError(error, { location: 'studyGroups.reports.service/getHiddenGroupIdsForReporter', userId })
    return new Set()
  }
}

/**
 * Admin list view — paginated. Filters by status.
 */
async function listReports({ status = 'pending', limit = 50, offset = 0 }) {
  const whereClause = status === 'all' ? {} : { status }
  const [rows, total] = await Promise.all([
    prisma.groupReport.findMany({
      where: whereClause,
      include: {
        group: {
          select: {
            id: true,
            name: true,
            privacy: true,
            moderationStatus: true,
            createdById: true,
            memberCount: false,
            createdBy: { select: { id: true, username: true } },
          },
        },
        reporter: { select: { id: true, username: true, avatarUrl: true } },
        resolvedBy: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.groupReport.count({ where: whereClause }),
  ])
  return { reports: rows, total, limit, offset }
}

module.exports = {
  VALID_REASONS,
  AUTO_LOCK_THRESHOLD,
  AUTO_LOCK_WINDOW_MS,
  WARNING_DURATION_MS,
  createReport,
  resolveReport,
  maybeEscalate,
  getHiddenGroupIdsForReporter,
  listReports,
  writeAuditLog,
  captureRequestFingerprint,
}
