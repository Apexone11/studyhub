const {
  sheetReactLimiter,
  sheetWriteLimiter,
  sheetCommentLimiter,
  sheetContributionLimiter,
  sheetContributionReviewLimiter,
  sheetAttachmentDownloadLimiter,
  sheetLeaderboardLimiter,
  sheetDiffLimiter,
} = require('../../lib/rateLimiters')

const SHEET_STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
  QUARANTINED: 'quarantined',
}

/* emailVerified is private — only expose via /api/auth/me or admin routes */
const AUTHOR_SELECT = { id: true, username: true, avatarUrl: true, isStaffVerified: true }

// Re-export rate limiters with original names for backward compatibility
const reactLimiter = sheetReactLimiter
const commentLimiter = sheetCommentLimiter
const contributionRateLimiter = sheetContributionLimiter
const contributionReviewLimiter = sheetContributionReviewLimiter
const attachmentDownloadLimiter = sheetAttachmentDownloadLimiter
const leaderboardLimiter = sheetLeaderboardLimiter
const diffLimiter = sheetDiffLimiter

// Author-selectable typefaces for rendered sheet content. Closed set: the
// value maps to a CSS class on the viewer, so an unvalidated string must
// never reach the column (CLAUDE.md A13).
const SHEET_FONT_FAMILIES = new Set(['sans', 'serif', 'mono'])
const DEFAULT_SHEET_FONT_FAMILY = 'sans'

/**
 * Resolve a request's `fontFamily` field.
 *
 * Returns `{ value }` for an accepted font (an absent field falls back to
 * the default so older clients keep working), or `{ error: true }` for a
 * value that was supplied but is not in the allowlist — callers turn that
 * into a 400 rather than silently storing something else.
 */
function parseSheetFontFamily(raw) {
  if (raw == null || raw === '') return { value: DEFAULT_SHEET_FONT_FAMILY }
  const normalized = String(raw).trim().toLowerCase()
  if (!SHEET_FONT_FAMILIES.has(normalized)) return { error: true }
  return { value: normalized }
}

module.exports = {
  SHEET_STATUS,
  AUTHOR_SELECT,
  SHEET_FONT_FAMILIES,
  DEFAULT_SHEET_FONT_FAMILY,
  parseSheetFontFamily,
  reactLimiter,
  sheetWriteLimiter,
  commentLimiter,
  contributionRateLimiter,
  contributionReviewLimiter,
  attachmentDownloadLimiter,
  leaderboardLimiter,
  diffLimiter,
}
