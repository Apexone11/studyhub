/**
 * Express middleware for simple GET endpoint caching.
 * Intercepts res.json() to cache responses automatically.
 */

const { cache } = require('../lib/cache')

/**
 * Create a response caching middleware for GET endpoints.
 *
 * @param {string|function} keyFn - Cache key or function to generate it from request
 * @param {number} ttlMs - Time-to-live in milliseconds (default: 60000)
 * @returns {function} Express middleware
 *
 * Usage:
 *   router.get('/my-endpoint', responseCache('my-key', 5 * 60 * 1000), handler)
 *   router.get('/user/:id', responseCache(req => `user:${req.params.id}`), handler)
 */
function responseCache(keyFn, ttlMs = 60000) {
  return (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next()
    }

    const key = typeof keyFn === 'function' ? keyFn(req) : keyFn

    // Check cache first
    const cached = cache.get(key)
    if (cached) {
      return res.json(cached)
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res)
    res.json = (body) => {
      cache.set(key, body, ttlMs)
      return originalJson(body)
    }

    next()
  }
}

module.exports = responseCache
