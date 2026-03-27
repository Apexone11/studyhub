const { getAuthTokenFromRequest, verifyAuthToken } = require('../lib/authTokens')
const { ERROR_CODES, sendError } = require('./errorEnvelope')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const AUTH_WRITE_ALLOWLIST = new Set([
  'POST /api/auth/login',
  'POST /api/auth/login/verification/send',
  'POST /api/auth/login/verification/verify',
  'POST /api/auth/logout',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
])

function envFlag(name, fallback = false) {
  const value = String(process.env[name] || '').trim()
  if (!value) return fallback
  return /^(1|true|yes|on)$/i.test(value)
}

function isGuardedModeEnabled() {
  return envFlag('GUARDED_MODE_ENABLED', false) || envFlag('GUARDED_MODE', false)
}

function isAdminRequest(req) {
  const token = getAuthTokenFromRequest(req)
  if (!token) return false

  try {
    const payload = verifyAuthToken(token)
    return payload?.role === 'admin'
  } catch {
    return false
  }
}

function routeKey(req) {
  const method = String(req.method || '').toUpperCase()
  const path = req.path || req.originalUrl || ''
  return `${method} ${path}`
}

function guardedMode(req, res, next) {
  if (!isGuardedModeEnabled()) return next()
  if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) return next()
  if (isAdminRequest(req)) return next()
  if (AUTH_WRITE_ALLOWLIST.has(routeKey(req))) return next()

  return sendError(
    res,
    503,
    'Write actions are temporarily paused while maintenance checks run. Please try again shortly.',
    ERROR_CODES.GUARDED_MODE,
  )
}

module.exports = {
  AUTH_WRITE_ALLOWLIST,
  guardedMode,
  isAdminRequest,
  isGuardedModeEnabled,
  routeKey,
}
