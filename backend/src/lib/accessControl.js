const { ERROR_CODES, sendError } = require('../middleware/errorEnvelope')
const { logSecurityEvent } = require('./securityEvents')

function isAdmin(user) {
  return user?.role === 'admin'
}

function isOwner(user, ownerId) {
  return Boolean(user && Number(ownerId) === Number(user.userId))
}

function sendForbidden(res, message, extra = {}) {
  return sendError(res, 403, message, ERROR_CODES.FORBIDDEN, extra)
}

function assertOwnerOrAdmin({ res, user, ownerId, message, targetType, targetId }) {
  if (isAdmin(user) || isOwner(user, ownerId)) {
    return true
  }

  logSecurityEvent('access.denied', {
    actorId: user?.userId || null,
    actorRole: user?.role || 'anonymous',
    targetType: targetType || null,
    targetId: targetId ?? null,
    reason: ERROR_CODES.FORBIDDEN,
  })

  sendForbidden(res, message)
  return false
}

module.exports = {
  assertOwnerOrAdmin,
  isAdmin,
  isOwner,
  sendForbidden,
}
