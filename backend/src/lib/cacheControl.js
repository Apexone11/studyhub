/**
 * Express middleware that sets Cache-Control headers.
 * @param {number} maxAge - Cache duration in seconds
 * @param {object} [options] - { public: boolean, staleWhileRevalidate: number }
 * @returns {Function} Express middleware
 */
function cacheControl(maxAge, options = {}) {
  return (req, res, next) => {
    const parts = []
    parts.push(options.public ? 'public' : 'private')
    parts.push(`max-age=${maxAge}`)
    if (options.staleWhileRevalidate) {
      parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`)
    }
    res.set('Cache-Control', parts.join(', '))
    next()
  }
}

module.exports = { cacheControl }
