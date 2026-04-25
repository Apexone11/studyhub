const { moderationAppealLimiter, moderationReportLimiter } = require('../../lib/rateLimiters')

const PAGE_SIZE = 20

function parsePage(value) {
  const page = Number.parseInt(value, 10)
  return Number.isFinite(page) && page > 0 && page <= 10000 ? page : 1
}

// Re-export rate limiters with original names for backward compatibility
const appealLimiter = moderationAppealLimiter
const reportLimiter = moderationReportLimiter

const REASON_CATEGORIES = [
  'harassment',
  'violence',
  'sexual',
  'self_harm',
  'spam',
  'misinformation',
  'hate_speech',
  'plagiarism',
  'other',
]

const APPEAL_REASON_CATEGORIES = [
  'educational_context',
  'false_positive',
  'not_me',
  'content_edited',
  'other',
]

module.exports = {
  PAGE_SIZE,
  parsePage,
  appealLimiter,
  reportLimiter,
  REASON_CATEGORIES,
  APPEAL_REASON_CATEGORIES,
}
