const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const AUTH_COOKIE_NAME = 'studyhub_session'
const TOKEN_EXPIRES_IN = '24h'
const MIN_SECRET_LENGTH = 32

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.')
  }

  return process.env.JWT_SECRET
}

/**
 * Validate JWT_SECRET at startup — crashes early if missing or too short.
 * Call once from the server bootstrap path so misconfiguration is caught
 * before the process starts serving traffic.
 */
function validateSecrets() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error(
      'FATAL: JWT_SECRET environment variable is not set. The server cannot start without it.'
    )
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `FATAL: JWT_SECRET is too short (${secret.length} chars). Minimum ${MIN_SECRET_LENGTH} characters required for production safety.`
    )
  }
}

function signAuthToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    getJwtSecret(),
    { expiresIn: TOKEN_EXPIRES_IN }
  )
}

function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret())
}

function signCsrfToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'csrf' },
    getJwtSecret(),
    { expiresIn: TOKEN_EXPIRES_IN }
  )
}

function verifyCsrfToken(token) {
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

function getAuthCookieTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie)
  return cookies[AUTH_COOKIE_NAME] || null
}

function getAuthTokenFromRequest(req) {
  const authHeader = req.headers.authorization
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ')
    if (/^Bearer$/i.test(scheme) && token) return token
  }

  return getAuthCookieTokenFromRequest(req)
}

function getAuthCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production'

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    // Restrict the browser cookie to authenticated API routes so non-API
    // preview surfaces can run on the backend origin without receiving it.
    path: '/api',
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
  getAuthCookieTokenFromRequest,
  getAuthTokenFromRequest,
  getJwtSecret,
  hashStoredSecret,
  signCsrfToken,
  setAuthCookie,
  signAuthToken,
  validateSecrets,
  verifyCsrfToken,
  verifyAuthToken,
}
