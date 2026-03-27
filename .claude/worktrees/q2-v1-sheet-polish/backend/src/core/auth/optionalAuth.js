const { getAuthTokenFromRequest, verifyAuthToken } = require('../../lib/authTokens')

/**
 * Middleware that attempts to decode an auth token if present.
 * Never blocks the request — unauthenticated visitors pass through.
 */
function optionalAuth(req, _res, next) {
  const token = getAuthTokenFromRequest(req)
  if (!token) return next()
  try {
    req.user = verifyAuthToken(token)
  } catch {
    // Invalid token — proceed as unauthenticated.
  }
  next()
}

module.exports = optionalAuth
