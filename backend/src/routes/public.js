/**
 * public.js — Unauthenticated endpoints for public-facing landing page data.
 *
 * GET /api/public/platform-stats
 *   Returns live platform activity counts used by the homepage to replace
 *   the previously hardcoded proof stats.
 */
const express = require('express')
const { captureError } = require('../monitoring/sentry')
const prisma = require('../lib/prisma')

const router = express.Router()

// Simple in-memory cache so the landing page doesn't hammer the DB on every
// anonymous page load.  Stats are accurate within 5 minutes.
let cachedStats = null
let cacheExpiresAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

router.get('/platform-stats', async (req, res) => {
  try {
    const now = Date.now()
    if (cachedStats && now < cacheExpiresAt) {
      return res.json(cachedStats)
    }

    const [sheetCount, courseCount, schoolCount, userCount] = await Promise.all([
      prisma.studySheet.count({ where: { status: 'published' } }),
      prisma.course.count(),
      prisma.school.count(),
      prisma.user.count(),
    ])

    cachedStats = { sheetCount, courseCount, schoolCount, userCount }
    cacheExpiresAt = now + CACHE_TTL_MS

    res.json(cachedStats)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    // Fail gracefully — the homepage can still render with fallback values
    res.status(500).json({ error: 'Could not load platform stats.' })
  }
})

module.exports = router
