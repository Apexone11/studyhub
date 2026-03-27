const { getAuthTokenFromRequest, verifyAuthToken } = require('../lib/authTokens')
const { ERROR_CODES, sendError } = require('./errorEnvelope')
const prisma = require('../lib/prisma')

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
    next()
  } catch {
    return sendError(res, 401, 'Invalid or expired token.', ERROR_CODES.AUTH_EXPIRED)
  }
}

module.exports = requireAuth
