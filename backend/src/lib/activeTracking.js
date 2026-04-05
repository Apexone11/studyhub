/**
 * activeTracking.js — Middleware to update User.lastActiveAt on authenticated requests.
 *
 * Throttles DB writes to at most once per 60 seconds per user using an in-memory
 * cache. Cleans up stale cache entries every 5 minutes. Wrapped in try-catch for
 * graceful degradation — failures never block the request.
 */
const prisma = require('./prisma')
const { captureError } = require('../monitoring/sentry')

/** In-memory map: userId -> last update timestamp (ms). */
const lastUpdateMap = new Map()

/** Only update DB if the cached entry is older than this threshold (ms). */
const THROTTLE_MS = 60 * 1000

/** Evict cache entries older than this (ms). */
const CACHE_TTL_MS = 5 * 60 * 1000

/** Sweep interval for stale entries (ms). */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000

let sweepTimerStarted = false

function startSweepTimer() {
  if (sweepTimerStarted) return
  sweepTimerStarted = true
  setInterval(() => {
    const now = Date.now()
    for (const [userId, ts] of lastUpdateMap) {
      if (now - ts > CACHE_TTL_MS) {
        lastUpdateMap.delete(userId)
      }
    }
  }, SWEEP_INTERVAL_MS).unref()
}

/**
 * Express middleware that updates `User.lastActiveAt` for authenticated requests.
 * Non-blocking — the DB write is fire-and-forget.
 */
function trackActiveUser(req, _res, next) {
  try {
    const userId = req.user?.userId
    if (!userId) return next()

    const now = Date.now()
    const lastUpdate = lastUpdateMap.get(userId)

    if (lastUpdate && now - lastUpdate < THROTTLE_MS) {
      return next()
    }

    // Update cache immediately to prevent duplicate writes from concurrent requests
    lastUpdateMap.set(userId, now)
    startSweepTimer()

    // Fire-and-forget DB update
    prisma.user
      .update({
        where: { id: userId },
        data: { lastActiveAt: new Date(now) },
      })
      .catch((err) => {
        captureError(err, { context: 'activeTracking', userId })
      })
  } catch (err) {
    // Graceful degradation — never block the request
    captureError(err, { context: 'activeTracking' })
  }

  next()
}

module.exports = { trackActiveUser }
