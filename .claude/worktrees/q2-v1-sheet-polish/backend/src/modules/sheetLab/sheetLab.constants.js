const crypto = require('node:crypto')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../../lib/authTokens')

const SHEET_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
}

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

function canReadSheet(sheet, user) {
  if (sheet.status === SHEET_STATUS.PUBLISHED) return true
  return Boolean(user && (user.role === 'admin' || user.userId === sheet.userId))
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content || '', 'utf8').digest('hex')
}

module.exports = {
  SHEET_STATUS,
  optionalAuth,
  canReadSheet,
  parsePositiveInt,
  computeChecksum,
}
