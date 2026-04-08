const { getAuthTokenFromRequest, verifyAuthToken } = require('../../lib/authTokens')

/**
 * Middleware that attempts to decode an auth token if present.
 * Never blocks the request — unauthenticated visitors pass through.
 */
function optionalAuth(req, _res, next) {
  const token = getAuthTokenFromRequest(req)
  if (!token) return next()
  try {
    const decoded = verifyAuthToken(token)
    const userId = decoded?.sub || decoded?.userId || decoded?.id
    if (userId) {
      req.user = {
        userId,
        username: decoded?.username || null,
        role: decoded?.role || null,
        trustLevel: decoded?.trustLevel || null,
      }
    }
  } catch {
    // Invalid token — proceed as unauthenticated.
  }
  next()
}

module.exports = optionalAuth
