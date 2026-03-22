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

module.exports = { PAGE_SIZE, parsePage, appealLimiter }
