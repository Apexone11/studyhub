/**
 * sh_did — device-identity cookie.
 *
 * 128-bit random, httpOnly, SameSite=Lax, 10-year TTL, Secure in prod.
 * Set on first successful login that didn't already have one. Not tied
 * to auth; survives logout so a returning device can still be recognized.
 *
 * Reads are cheap. Writes happen at most once per browser-lifetime unless
 * the user manually clears cookies or we explicitly rotate (panic mode).
 */

const crypto = require('crypto')

const COOKIE_NAME = 'sh_did'
const DEVICE_ID_BYTES = 16 // 128 bits
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000

function generateDeviceId() {
  return crypto.randomBytes(DEVICE_ID_BYTES).toString('hex') // 32 hex chars
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: TEN_YEARS_MS,
  }
}

function isValidDeviceId(v) {
  return typeof v === 'string' && /^[0-9a-f]{32}$/.test(v)
}

/**
 * Read the device ID from the request cookie. If missing or malformed,
 * generate a new one and Set-Cookie it on the response. Returns the
 * resolved device ID string (always 32 hex chars).
 */
function getOrSetDeviceId(req, res) {
  const incoming = req?.cookies?.[COOKIE_NAME]
  if (isValidDeviceId(incoming)) return incoming

  const deviceId = generateDeviceId()
  if (res && typeof res.cookie === 'function') {
    res.cookie(COOKIE_NAME, deviceId, cookieOptions())
  }
  return deviceId
}

/**
 * Force a new device ID. Used by panic mode — revoke all sessions,
 * rotate sh_did, force next login from this browser to re-establish trust.
 */
function rotateDeviceId(res) {
  const deviceId = generateDeviceId()
  if (res && typeof res.cookie === 'function') {
    res.cookie(COOKIE_NAME, deviceId, cookieOptions())
  }
  return deviceId
}

/**
 * Clear the sh_did cookie entirely. Rarely used.
 */
function clearDeviceCookie(res) {
  if (res && typeof res.clearCookie === 'function') {
    res.clearCookie(COOKIE_NAME, { path: '/' })
  }
}

module.exports = {
  COOKIE_NAME,
  getOrSetDeviceId,
  rotateDeviceId,
  clearDeviceCookie,
  generateDeviceId,
  isValidDeviceId,
}
