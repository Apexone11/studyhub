const { getOptionalAuthUserFromRequest } = require('../../lib/authTokens')

/**
 * Middleware that attempts to decode an auth token if present.
 * Never blocks the request — unauthenticated visitors pass through.
 */
function optionalAuth(req, _res, next) {
  if (req.user) return next()

  const user = getOptionalAuthUserFromRequest(req)
  if (user) req.user = user
  next()
}

module.exports = optionalAuth
