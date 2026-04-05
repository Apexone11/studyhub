const prisma = require('./prisma')
const { captureError } = require('../monitoring/sentry')

/**
 * Audit logging for security-relevant operations.
 *
 * Never stores plaintext PII — only metadata about who did what.
 * All writes are fire-and-forget (non-blocking) to avoid slowing
 * the request path, with Sentry capture on failure.
 *
 * Event taxonomy:
 *   pii.*                — PII vault access (read, write, delete)
 *   auth.*               — Authentication events (login, logout, password_change, role_change)
 *   sheet.*              — Sheet lifecycle (create, update, delete, publish, fork, format_change)
 *   comment.*            — Comment lifecycle (create, delete)
 *   moderation.*         — Moderation actions (case_create, case_resolve, strike, appeal)
 *   admin.*              — Admin operations (user_edit, sheet_review, settings_change)
 *   upload.*             — File uploads (content_image, avatar, attachment)
 *   contribution.*       — Contribution lifecycle (create, accept, reject)
 *   settings.*           — Account settings changes
 */

function truncate(value, maxLen) {
  if (typeof value !== 'string') return value
  return value.length > maxLen ? value.slice(0, maxLen) : value
}

/**
 * Extract client IP from an Express request object.
 * Handles X-Forwarded-For (common behind Railway / nginx proxies).
 */
function extractIp(req) {
  if (!req) return null
  const forwarded = req.headers?.['x-forwarded-for']
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim()
    if (first) return truncate(first, 45)
  }
  return truncate(req.ip || req.socket?.remoteAddress || null, 45)
}

/**
 * Record an audit event. Non-blocking — errors are captured to Sentry
 * but never propagated to the caller.
 */
async function recordAudit({ event, actorId = null, actorRole = null, targetUserId = null, route = null, method = null, resource = null, resourceId = null, details = null, ipAddress = null }) {
  try {
    return await prisma.auditLog.create({
      data: {
        event: truncate(event, 256),
        actorId,
        actorRole: truncate(actorRole, 64),
        targetUserId,
        route: truncate(route, 2048),
        method: truncate(method, 16),
        resource: truncate(resource, 128),
        resourceId: typeof resourceId === 'number' ? resourceId : null,
        details: details || undefined,
        ipAddress: truncate(ipAddress, 45),
      },
    })
  } catch (err) {
    // Never let audit failures break the request
    captureError(err, { source: 'auditLog', event, actorId })
    return null
  }
}

/**
 * Convenience helper: create an audit record from an Express request.
 * Extracts actor info from req.user and route info from req.
 */
function auditFromRequest(req, event, { targetUserId = null, resource = null, resourceId = null, details = null } = {}) {
  return recordAudit({
    event,
    actorId: req.user?.userId || null,
    actorRole: req.user?.role || null,
    targetUserId,
    route: req.originalUrl || null,
    method: req.method || null,
    resource,
    resourceId,
    details,
    ipAddress: extractIp(req),
  })
}

/**
 * Standalone audit logger for use outside of Express request context.
 * Compatible with the spec: logAudit({ userId, action, resource, resourceId, details, ipAddress })
 */
async function logAudit({ userId = null, action, resource = null, resourceId = null, details = null, ipAddress = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        event: truncate(action, 256),
        actorId: userId,
        resource: truncate(resource, 128),
        resourceId: typeof resourceId === 'number' ? resourceId : null,
        details: details || undefined,
        ipAddress: truncate(ipAddress, 45),
      },
    })
  } catch (err) {
    console.error('Audit log failed:', err.message)
  }
}

/**
 * Predefined event constants for type safety and consistency.
 */
const AUDIT_EVENTS = {
  // Auth
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_CHANGE: 'auth.password_change',
  AUTH_ROLE_CHANGE: 'auth.role_change',
  AUTH_ACCOUNT_DELETE: 'auth.account_delete',

  // PII
  PII_READ: 'pii.read',
  PII_WRITE: 'pii.write',
  PII_DELETE: 'pii.delete',

  // Sheets
  SHEET_CREATE: 'sheet.create',
  SHEET_UPDATE: 'sheet.update',
  SHEET_DELETE: 'sheet.delete',
  SHEET_PUBLISH: 'sheet.publish',
  SHEET_UNPUBLISH: 'sheet.unpublish',
  SHEET_FORK: 'sheet.fork',
  SHEET_FORMAT_CHANGE: 'sheet.format_change',

  // Comments
  COMMENT_CREATE: 'comment.create',
  COMMENT_DELETE: 'comment.delete',

  // Moderation
  MOD_CASE_CREATE: 'moderation.case_create',
  MOD_CASE_RESOLVE: 'moderation.case_resolve',
  MOD_STRIKE: 'moderation.strike',
  MOD_APPEAL: 'moderation.appeal',
  MOD_APPEAL_RESOLVE: 'moderation.appeal_resolve',
  MOD_QUARANTINE: 'moderation.quarantine',

  // Admin
  ADMIN_USER_EDIT: 'admin.user_edit',
  ADMIN_SHEET_REVIEW: 'admin.sheet_review',
  ADMIN_SETTINGS_CHANGE: 'admin.settings_change',
  ADMIN_ROLE_ASSIGN: 'admin.role_assign',

  // Uploads
  UPLOAD_CONTENT_IMAGE: 'upload.content_image',
  UPLOAD_AVATAR: 'upload.avatar',
  UPLOAD_ATTACHMENT: 'upload.attachment',

  // Contributions
  CONTRIBUTION_CREATE: 'contribution.create',
  CONTRIBUTION_ACCEPT: 'contribution.accept',
  CONTRIBUTION_REJECT: 'contribution.reject',

  // Settings
  SETTINGS_PROFILE_UPDATE: 'settings.profile_update',
  SETTINGS_PASSWORD_CHANGE: 'settings.password_change',
  SETTINGS_EMAIL_CHANGE: 'settings.email_change',
  SETTINGS_PRIVACY_CHANGE: 'settings.privacy_change',
}

module.exports = { recordAudit, auditFromRequest, logAudit, extractIp, AUDIT_EVENTS }
