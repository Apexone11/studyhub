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

module.exports = {
  SHEET_STATUS,
  AUTHOR_SELECT,
  reactLimiter,
  sheetWriteLimiter,
  commentLimiter,
  contributionRateLimiter,
  contributionReviewLimiter,
  attachmentDownloadLimiter,
  leaderboardLimiter,
  diffLimiter,
}
