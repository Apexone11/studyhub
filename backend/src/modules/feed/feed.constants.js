const {
  feedReactLimiter,
  feedReadLimiter,
  feedWriteLimiter,
  feedCommentLimiter,
  feedAttachmentDownloadLimiter,
  feedAuthLimiter,
  feedLeaderboardLimiter,
} = require('../../lib/rateLimiters')

// Re-export rate limiters with original names for backward compatibility
const reactLimiter = feedReactLimiter
const commentLimiter = feedCommentLimiter
const attachmentDownloadLimiter = feedAttachmentDownloadLimiter
const authLimiter = feedAuthLimiter
const leaderboardLimiter = feedLeaderboardLimiter

module.exports = {
  reactLimiter,
  feedReadLimiter,
  feedWriteLimiter,
  commentLimiter,
  attachmentDownloadLimiter,
  authLimiter,
  leaderboardLimiter,
}
