const { getAuthTokenFromRequest, verifyAuthToken } = require('../lib/authTokens')

function requireAuth(req, res, next) {
  const token = getAuthTokenFromRequest(req)

  if (!token) {
    return res.status(401).json({ error: 'Login required.' })
  }

  try {
    const decoded = verifyAuthToken(token)
    req.user = decoded // { userId, username, role }
    next()
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' })
  }
}

module.exports = requireAuth
