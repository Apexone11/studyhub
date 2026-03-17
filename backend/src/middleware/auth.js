const { getAuthTokenFromRequest, verifyAuthToken } = require('../lib/authTokens')
const { ERROR_CODES, sendError } = require('./errorEnvelope')

function requireAuth(req, res, next) {
  const token = getAuthTokenFromRequest(req)

  if (!token) {
    return sendError(res, 401, 'Login required.', ERROR_CODES.AUTH_REQUIRED)
  }

  try {
    const decoded = verifyAuthToken(token)
    req.user = decoded // { userId, username, role }
    next()
  } catch {
    return sendError(res, 401, 'Invalid or expired token.', ERROR_CODES.AUTH_EXPIRED)
  }
}

module.exports = requireAuth
