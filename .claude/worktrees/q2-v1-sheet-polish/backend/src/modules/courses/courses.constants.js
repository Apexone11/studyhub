const rateLimit = require('express-rate-limit')

const POPULAR_THRESHOLD = 3
const RECOMMENDATION_LIMIT = 6
const POPULAR_COURSES_LIMIT = 8

const schoolsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many school catalog requests. Please try again later.'
  }
})

function parseOptionalInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue)) {
    throw new Error(`${fieldName} must be an integer.`)
  }

  return parsedValue
}

module.exports = {
  POPULAR_THRESHOLD,
  RECOMMENDATION_LIMIT,
  POPULAR_COURSES_LIMIT,
  schoolsLimiter,
  parseOptionalInteger,
}
