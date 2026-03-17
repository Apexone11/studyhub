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
      select: { id: true, role: true, twoFaEnabled: true },
    })

    if (!user || user.role !== 'admin') {
      logSecurityEvent('admin.access.denied', {
        actorId: req.user?.userId || null,
        actorRole: req.user?.role || 'unknown',
        reason: ERROR_CODES.FORBIDDEN,
      })
      return sendError(res, 403, 'Admin access required.', ERROR_CODES.FORBIDDEN)
    }

    if (!user.twoFaEnabled) {
      logSecurityEvent('admin.mfa.required', {
        actorId: user.id,
        actorRole: user.role,
        reason: ERROR_CODES.ADMIN_MFA_REQUIRED,
      })
      return sendError(
        res,
        403,
        'Enable 2-step verification in Settings before using admin tools.',
        ERROR_CODES.ADMIN_MFA_REQUIRED,
      )
    }

    return next()
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
}

module.exports = requireAdmin
