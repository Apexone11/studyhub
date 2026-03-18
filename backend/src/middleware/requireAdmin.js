const { captureError } = require('../monitoring/sentry')
const prisma = require('../lib/prisma')
const { logSecurityEvent } = require('../lib/securityEvents')
const { ERROR_CODES, sendError } = require('./errorEnvelope')

async function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    logSecurityEvent('admin.access.denied', {
      actorId: req.user?.userId || null,
      actorRole: req.user?.role || 'anonymous',
      reason: ERROR_CODES.FORBIDDEN,
    })
    return sendError(res, 403, 'Admin access required.', ERROR_CODES.FORBIDDEN)
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, role: true },
    })

    if (!user || user.role !== 'admin') {
      logSecurityEvent('admin.access.denied', {
        actorId: req.user?.userId || null,
        actorRole: req.user?.role || 'unknown',
        reason: ERROR_CODES.FORBIDDEN,
      })
      return sendError(res, 403, 'Admin access required.', ERROR_CODES.FORBIDDEN)
    }

    return next()
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.SERVER_ERROR)
  }
}

module.exports = requireAdmin
