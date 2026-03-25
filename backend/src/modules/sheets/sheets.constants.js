const rateLimit = require('express-rate-limit')

const SHEET_STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
  QUARANTINED: 'quarantined',
}

const reactLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const sheetWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many sheet updates. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const commentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Too many comments. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const contributionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many contribution requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const contributionReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many contribution reviews. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const attachmentDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many attachment downloads. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many leaderboard requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const diffLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many diff requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = {
  SHEET_STATUS,
  reactLimiter,
  sheetWriteLimiter,
  commentLimiter,
  contributionRateLimiter,
  contributionReviewLimiter,
  attachmentDownloadLimiter,
  leaderboardLimiter,
  diffLimiter,
}
