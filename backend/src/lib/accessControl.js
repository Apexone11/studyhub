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

/**
 * Owner-only gate. Use on content-mutation routes where the founder
 * directive 2026-05-13 applies: admin is a moderator role, not a
 * creator role. Admin moderation actions live on dedicated /api/admin/*
 * routes that audit-log every change. Same shape as assertOwnerOrAdmin
 * so swapping is a one-line edit.
 */
function assertOwner({ res, user, ownerId, message, targetType, targetId }) {
  if (isOwner(user, ownerId)) {
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
  assertOwner,
  isAdmin,
  isOwner,
  sendForbidden,
}
