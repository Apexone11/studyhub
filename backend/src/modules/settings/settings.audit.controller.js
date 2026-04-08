/**
 * Settings Audit Controller — user self-service activity log download.
 *
 * GET /my-audit-log — returns the authenticated user's own audit log (sanitized).
 *   No IP addresses, no internal IDs beyond the user's own.
 *   Returns action descriptions and timestamps only.
 */
const express = require('express')
const prisma = require('../../lib/prisma')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')

const router = express.Router()

/**
 * Human-readable labels for audit event types.
 */
const EVENT_LABELS = {
  'auth.login': 'Logged in',
  'auth.logout': 'Logged out',
  'auth.password_change': 'Changed password',
  'auth.role_change': 'Role changed',
  'auth.account_delete': 'Account deleted',
  'sheet.create': 'Created a study sheet',
  'sheet.update': 'Updated a study sheet',
  'sheet.delete': 'Deleted a study sheet',
  'sheet.publish': 'Published a study sheet',
  'sheet.unpublish': 'Unpublished a study sheet',
  'sheet.fork': 'Forked a study sheet',
  'sheet.format_change': 'Changed sheet format',
  'comment.create': 'Posted a comment',
  'comment.delete': 'Deleted a comment',
  'upload.content_image': 'Uploaded a content image',
  'upload.avatar': 'Changed avatar',
  'upload.attachment': 'Uploaded an attachment',
  'contribution.create': 'Submitted a contribution',
  'contribution.accept': 'Accepted a contribution',
  'contribution.reject': 'Rejected a contribution',
  'settings.profile_update': 'Updated profile settings',
  'settings.password_change': 'Changed password',
  'settings.email_change': 'Changed email',
  'settings.privacy_change': 'Updated privacy settings',
}

function friendlyLabel(event) {
  return EVENT_LABELS[event] || event.replace(/[._]/g, ' ')
}

// ── GET /my-audit-log ──────────────────────────────────────────
router.get('/my-audit-log', async (req, res) => {
  const userId = req.user?.userId
  if (!userId) {
    return sendError(res, 401, 'Authentication required.', ERROR_CODES.UNAUTHORIZED)
  }

  try {
    const entries = await prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: {
        event: true,
        resource: true,
        resourceId: true,
        createdAt: true,
      },
    })

    // Sanitize for user consumption: no IPs, no internal IDs, human-readable labels
    const sanitized = entries.map((entry) => ({
      action: friendlyLabel(entry.event),
      category: entry.event.split('.')[0] || 'other',
      resource: entry.resource || null,
      timestamp: entry.createdAt,
    }))

    const dateStr = new Date().toISOString().slice(0, 10)

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="my-activity-log-${dateStr}.json"`)

    res.json({
      exportedAt: new Date().toISOString(),
      totalEntries: sanitized.length,
      entries: sanitized,
    })
  } catch (err) {
    console.error('[settings] Audit log export failed:', err.message)
    return sendError(res, 500, 'Could not export your activity log.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
