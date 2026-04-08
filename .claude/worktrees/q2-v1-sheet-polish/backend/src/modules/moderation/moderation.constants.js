const rateLimit = require('express-rate-limit')

const PAGE_SIZE = 20

function parsePage(value) {
  const page = Number.parseInt(value, 10)
  return Number.isFinite(page) && page > 0 && page <= 10000 ? page : 1
}

const appealLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many appeal submissions. Please try again later.' },
})

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many reports. Please try again later.' },
})

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

module.exports = { PAGE_SIZE, parsePage, appealLimiter, reportLimiter, REASON_CATEGORIES, APPEAL_REASON_CATEGORIES }
