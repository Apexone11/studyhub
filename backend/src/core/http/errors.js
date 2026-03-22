const { ERROR_CODES, sendError } = require('../../middleware/errorEnvelope')

class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.name = 'AppError'
  }
}

function handleRouteError(res, error, { captureError, route, method } = {}) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500
  if (statusCode >= 500 && captureError) {
    captureError(error, { route, method })
  }
  res.status(statusCode).json({ error: error.message || 'Server error.' })
}

module.exports = { AppError, ERROR_CODES, sendError, handleRouteError }
