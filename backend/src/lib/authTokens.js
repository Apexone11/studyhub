const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const AUTH_COOKIE_NAME = 'studyhub_session'
const TOKEN_EXPIRES_IN = '24h'

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.')
  }

  return process.env.JWT_SECRET
}

function signAuthToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    getJwtSecret(),
    { expiresIn: TOKEN_EXPIRES_IN }
  )
}

function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret())
}

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((cookies, cookie) => {
      const separatorIndex = cookie.indexOf('=')
      if (separatorIndex === -1) return cookies

      const key = cookie.slice(0, separatorIndex).trim()
      const value = cookie.slice(separatorIndex + 1).trim()
      cookies[key] = decodeURIComponent(value)
      return cookies
    }, {})
}

function getAuthTokenFromRequest(req) {
  const authHeader = req.headers.authorization
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ')
    if (/^Bearer$/i.test(scheme) && token) return token
  }

  const cookies = parseCookies(req.headers.cookie)
  return cookies[AUTH_COOKIE_NAME] || null
}

function getAuthCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production'

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  }
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions())
}

function clearAuthCookie(res) {
  const { maxAge: _maxAge, ...cookieOptions } = getAuthCookieOptions()
  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions)
}

function hashStoredSecret(value) {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(value)
    .digest('hex')
}

module.exports = {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  getAuthCookieOptions,
  getAuthTokenFromRequest,
  getJwtSecret,
  hashStoredSecret,
  setAuthCookie,
  signAuthToken,
  verifyAuthToken,
}
