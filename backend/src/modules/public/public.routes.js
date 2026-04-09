/**
 * public.js — Unauthenticated endpoints for public-facing landing page data.
 *
 * GET /api/public/platform-stats
 *   Returns live platform activity counts used by the homepage to replace
 *   the previously hardcoded proof stats.
 */
const express = require('express')
const { publicLimiter } = require('../../lib/rateLimiters')
const { captureError } = require('../../monitoring/sentry')
const { cacheControl } = require('../../lib/cacheControl')
const { cached } = require('../../lib/redis')
const prisma = require('../../lib/prisma')

const router = express.Router()

router.use(publicLimiter)

router.get('/platform-stats', cacheControl(300, { public: true, staleWhileRevalidate: 600 }), async (req, res) => {
  try {
    // Phase 6: Redis cache with 5min TTL, graceful fallback to DB
    const stats = await cached('public:platform-stats', async () => {
      const [sheetCount, courseCount, schoolCount, userCount] = await Promise.all([
        prisma.studySheet.count({ where: { status: 'published' } }),
        prisma.course.count(),
        prisma.school.count(),
        prisma.user.count(),
      ])
      return { sheetCount, courseCount, schoolCount, userCount }
    }, 300)

    res.json(stats)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Could not load platform stats.' })
  }
})

/**
 * GET /api/public/health
 * Phase 6 Step 10: lightweight health check for uptime monitoring.
 * Returns 200 if database is reachable, 503 otherwise.
 * No rate limiter needed -- this is a simple diagnostic endpoint.
 */
router.get('/health', async (_req, res) => {
  const checks = {}

  // Database connectivity
  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
  }

  // Redis connectivity (optional)
  try {
    const { ping } = require('../../lib/redis')
    checks.redis = await ping()
  } catch {
    checks.redis = 'unavailable'
  }

  checks.uptime = Math.floor(process.uptime())
  checks.memory = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)

  const healthy = checks.database === 'ok'
  res.status(healthy ? 200 : 503).json(checks)
})

module.exports = router
