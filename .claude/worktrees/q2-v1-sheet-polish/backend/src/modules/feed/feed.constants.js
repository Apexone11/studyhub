const rateLimit = require('express-rate-limit')

const reactLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const feedReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  message: { error: 'Too many feed requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const feedWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many feed updates. Please slow down.' },
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

const attachmentDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many attachment downloads. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  message: { error: 'Too many authenticated feed requests. Please slow down.' },
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

module.exports = {
  reactLimiter,
  feedReadLimiter,
  feedWriteLimiter,
  commentLimiter,
  attachmentDownloadLimiter,
  authLimiter,
  leaderboardLimiter,
}
