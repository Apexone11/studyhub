const { ERROR_CODES, sendError } = require('../../middleware/errorEnvelope')

class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.name = 'AppError'
  }
}

function defaultErrorCode(statusCode) {
  if (statusCode === 400) return ERROR_CODES.BAD_REQUEST
  if (statusCode === 401) return ERROR_CODES.UNAUTHORIZED
  if (statusCode === 403) return ERROR_CODES.FORBIDDEN
  if (statusCode === 404) return ERROR_CODES.NOT_FOUND
  if (statusCode === 409) return ERROR_CODES.CONFLICT
  if (statusCode === 429) return ERROR_CODES.RATE_LIMITED
  return ERROR_CODES.INTERNAL
}

function handleRouteError(res, error, { captureError, route, method } = {}) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500
  if (statusCode >= 500 && captureError) {
    captureError(error, { route, method })
  }

  const code =
    typeof error.code === 'string' && error.code.trim()
      ? error.code.trim()
      : defaultErrorCode(statusCode)

  return sendError(res, statusCode, error.message || 'Server error.', code)
}

module.exports = { AppError, ERROR_CODES, sendError, handleRouteError }
