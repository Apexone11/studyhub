const {
  getAuthCookieTokenFromRequest,
  verifyAuthToken,
  verifyCsrfToken,
} = require('../lib/authTokens')
const { ERROR_CODES, sendError } = require('./errorEnvelope')

const AUTH_BOOTSTRAP_PREFIXES = [
  '/api/auth/login',
  '/api/auth/google',
  '/api/auth/register',
]

function csrfProtection(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next()
  }

  // Auth bootstrap routes establish/refresh sessions and cannot require CSRF
  // upfront. A stale auth cookie must not block these endpoints.
  const url = req.originalUrl || ''
  if (AUTH_BOOTSTRAP_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return next()
  }

  // Only cookie-authenticated browser sessions need CSRF protection.
  // Bearer-token API clients are protected by explicit Authorization headers.
  const authToken = getAuthCookieTokenFromRequest(req)
  if (!authToken) {
    return next()
  }

  let authPayload
  try {
    authPayload = verifyAuthToken(authToken)
  } catch {
    return sendError(res, 401, 'Invalid or expired session.', ERROR_CODES.AUTH_EXPIRED)
  }

  const csrfToken = req.get('x-csrf-token')
  if (!csrfToken) {
    return sendError(res, 403, 'Missing CSRF token.', ERROR_CODES.CSRF_INVALID)
  }

  try {
    const csrfPayload = verifyCsrfToken(csrfToken)
    if (csrfPayload?.type !== 'csrf' || csrfPayload?.sub !== authPayload?.sub) {
      return sendError(res, 403, 'Invalid CSRF token.', ERROR_CODES.CSRF_INVALID)
    }
  } catch {
    return sendError(res, 403, 'Invalid CSRF token.', ERROR_CODES.CSRF_INVALID)
  }

  return next()
}

module.exports = csrfProtection
