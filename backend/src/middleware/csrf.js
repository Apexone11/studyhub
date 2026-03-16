const {
  getAuthCookieTokenFromRequest,
  verifyAuthToken,
  verifyCsrfToken,
} = require('../lib/authTokens')

function csrfProtection(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
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
    return res.status(403).json({ error: 'Invalid or expired session.' })
  }

  const csrfToken = req.get('x-csrf-token')
  if (!csrfToken) {
    return res.status(403).json({ error: 'Missing CSRF token.' })
  }

  try {
    const csrfPayload = verifyCsrfToken(csrfToken)
    if (csrfPayload?.type !== 'csrf' || csrfPayload?.userId !== authPayload?.userId) {
      return res.status(403).json({ error: 'Invalid CSRF token.' })
    }
  } catch {
    return res.status(403).json({ error: 'Invalid CSRF token.' })
  }

  return next()
}

module.exports = csrfProtection
