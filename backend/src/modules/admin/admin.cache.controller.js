/**
 * Admin cache statistics controller.
 * Provides monitoring and diagnostics for the in-memory cache.
 */

const express = require('express')
const { cache } = require('../../lib/cache')
const { captureError } = require('../../monitoring/sentry')

const router = express.Router()

/**
 * GET /api/admin/cache-stats
 * Returns cache statistics including size, hits, misses, and hit rate.
 * Admin only.
 */
router.get('/cache-stats', (req, res) => {
  try {
    const stats = cache.stats()
    res.json(stats)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to retrieve cache statistics.' })
  }
})

/**
 * DELETE /api/admin/cache
 * Clears all cached entries. Use with caution.
 * Admin only.
 */
router.delete('/cache', (req, res) => {
  try {
    cache.clear()
    res.json({ cleared: true, message: 'Cache cleared.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to clear cache.' })
  }
})

module.exports = router
