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
const prisma = require('../../lib/prisma')

const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const router = express.Router()

router.use(publicLimiter)

router.get(
  '/platform-stats',
  // Browser cache only — Cloudflare ignores Vary: Origin on non-Enterprise
  // plans, so `public: true` here would let the CDN replay one origin's
  // CORS headers to other origins. See courses.schools.controller.js for
  // the full rationale.
  cacheControl(300, { staleWhileRevalidate: 600 }),
  async (req, res) => {
    try {
      const [sheetCount, courseCount, schoolCount, userCount] = await Promise.all([
        prisma.studySheet.count({ where: { status: 'published' } }),
        prisma.course.count(),
        prisma.school.count(),
        prisma.user.count(),
      ])
      res.json({ sheetCount, courseCount, schoolCount, userCount })
    } catch (err) {
      captureError(err, { route: req.originalUrl, method: req.method })
      sendError(res, 500, 'Could not load platform stats.', ERROR_CODES.INTERNAL)
    }
  },
)

/**
 * GET /api/public/health
 * Lightweight health check for uptime monitoring.
 * Returns 200 if database is reachable, 503 otherwise.
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

  checks.uptime = Math.floor(process.uptime())
  checks.memory = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)

  const healthy = checks.database === 'ok'
  res.status(healthy ? 200 : 503).json(checks)
})

module.exports = router
