const path = require('node:path')
const prisma = require('../../core/db/prisma')
const { SHEET_STATUS } = require('./sheets.constants')
const { normalizeContentFormat } = require('../../lib/htmlSecurity')
const { shouldAutoPublish } = require('../../lib/trustGate')

function normalizeSheetStatus(value, fallback = SHEET_STATUS.PUBLISHED) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === SHEET_STATUS.DRAFT) return SHEET_STATUS.DRAFT
  if (normalized === SHEET_STATUS.PENDING_REVIEW) return SHEET_STATUS.PENDING_REVIEW
  if (normalized === SHEET_STATUS.PUBLISHED) return SHEET_STATUS.PUBLISHED
  if (normalized === SHEET_STATUS.REJECTED) return SHEET_STATUS.REJECTED
  if (normalized === SHEET_STATUS.QUARANTINED) return SHEET_STATUS.QUARANTINED
  return fallback
}

function canModerateOrOwnSheet(sheet, user) {
  return Boolean(user && (user.role === 'admin' || user.userId === sheet.userId))
}

function canReadSheet(sheet, user) {
  if (sheet.status === SHEET_STATUS.PUBLISHED) return true
  return canModerateOrOwnSheet(sheet, user)
}

function resolveNextSheetStatus({ requestedStatus, contentFormat, isDraftAutosave = false, user = null, currentStatus = null }) {
  const normalizedRequested = normalizeSheetStatus(requestedStatus, '')
  if (normalizedRequested === SHEET_STATUS.DRAFT || isDraftAutosave) {
    return SHEET_STATUS.DRAFT
  }
  if (contentFormat === 'html') {
    return SHEET_STATUS.PENDING_REVIEW
  }
  // Preserve pending_review on edits — only an admin review should clear it
  if (currentStatus === SHEET_STATUS.PENDING_REVIEW) {
    return SHEET_STATUS.PENDING_REVIEW
  }
  if (user && !shouldAutoPublish(user)) {
    return SHEET_STATUS.PENDING_REVIEW
  }
  return SHEET_STATUS.PUBLISHED
}

function safeDownloadName(name, fallbackExt = '') {
  const ext = fallbackExt || path.extname(name || '')
  const base = String(name || 'studyhub-sheet')
    .replace(path.extname(String(name || '')), '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'studyhub-sheet'

  return `${base}${ext}`.toLowerCase()
}

function resolvePreviewOrigin(req) {
  const configuredOrigin = String(process.env.HTML_PREVIEW_ORIGIN || '').trim()

  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin
    } catch {
      // Fall back to the current request origin when misconfigured.
    }
  }

  return `${req.protocol}://${req.get('host')}`
}

/**
 * Reads the user's defaultDownloads preference from UserPreferences.
 * Returns true if no preference record exists (safe default).
 */
async function getUserDefaultDownloads(userId) {
  const prefs = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { defaultDownloads: true },
  })
  return prefs?.defaultDownloads !== false
}

module.exports = {
  normalizeSheetStatus,
  canModerateOrOwnSheet,
  canReadSheet,
  resolveNextSheetStatus,
  safeDownloadName,
  resolvePreviewOrigin,
  getUserDefaultDownloads,
  normalizeContentFormat,
}
