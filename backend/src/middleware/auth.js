const { getAuthTokenFromRequest, verifyAuthToken } = require('../lib/authTokens')
const { ERROR_CODES, sendError } = require('./errorEnvelope')
const prisma = require('../lib/prisma')
const { TRUST_LEVELS, checkAndPromoteTrust } = require('../lib/trustGate')

async function requireAuth(req, res, next) {
  const token = getAuthTokenFromRequest(req)

  if (!token) {
    return sendError(res, 401, 'Login required.', ERROR_CODES.AUTH_REQUIRED)
  }

  try {
    const decoded = verifyAuthToken(token)
    // Fetch identity fresh from DB — keeps req.user.username current without
    // storing PII in the token, and ensures role is never stale.
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, username: true, role: true, trustLevel: true },
    })
    if (!user) {
      return sendError(res, 401, 'Invalid or expired token.', ERROR_CODES.AUTH_EXPIRED)
    }
    req.user = { userId: user.id, username: user.username, role: user.role, trustLevel: user.trustLevel }

    // Fire-and-forget: auto-promote "new" users that have met the age/email threshold.
    // This runs asynchronously and does not block the request.
    if (user.trustLevel === TRUST_LEVELS.NEW) {
      void checkAndPromoteTrust(user.id).catch(() => {})
    }

    next()
  } catch {
    return sendError(res, 401, 'Invalid or expired token.', ERROR_CODES.AUTH_EXPIRED)
  }
}

module.exports = requireAuth
