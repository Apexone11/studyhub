const { coursesSchoolsLimiter } = require('../../lib/rateLimiters')

const POPULAR_THRESHOLD = 3
const RECOMMENDATION_LIMIT = 6
const POPULAR_COURSES_LIMIT = 8

// Re-export rate limiter with original name for backward compatibility
const schoolsLimiter = coursesSchoolsLimiter

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
