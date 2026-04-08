/**
 * Wraps an async route handler so rejected promises are forwarded to Express
 * error handling instead of silently swallowed.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

module.exports = asyncHandler
