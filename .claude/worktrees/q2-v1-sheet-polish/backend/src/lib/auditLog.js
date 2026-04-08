const prisma = require('./prisma')

/**
 * Record an audit event for sensitive operations.
 * Never stores plaintext PII — only metadata about who did what.
 *
 * @param {object} params
 * @param {string} params.event - Event type (e.g. 'pii.read', 'pii.write')
 * @param {number|null} params.actorId - User performing the action
 * @param {string|null} params.actorRole - Role of the actor (e.g. 'admin', 'student')
 * @param {number|null} params.targetUserId - User whose data is being accessed
 * @param {string|null} params.route - Request route (e.g. '/api/admin/users/42/pii')
 * @param {string|null} params.method - HTTP method (e.g. 'GET', 'PUT')
 */
function truncate(value, maxLen) {
  if (typeof value !== 'string') return value
  return value.length > maxLen ? value.slice(0, maxLen) : value
}

async function recordAudit({ event, actorId = null, actorRole = null, targetUserId = null, route = null, method = null }) {
  return prisma.auditLog.create({
    data: {
      event: truncate(event, 256),
      actorId,
      actorRole: truncate(actorRole, 64),
      targetUserId,
      route: truncate(route, 2048),
      method: truncate(method, 16),
    },
  })
}

module.exports = { recordAudit }
