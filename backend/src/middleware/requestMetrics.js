/**
 * Request metrics middleware -- captures per-request latency data,
 * buffers in memory, and flushes to the RequestMetric table periodically.
 *
 * No request/response bodies, headers, or query parameters are logged.
 * Route templates use parameterized form only (IDs replaced with :id).
 */
const prisma = require('../lib/prisma')
const log = require('../lib/logger')

// ── Ring buffer ─────────────────────────────────────────────────────────
const BUFFER_CAP = 5000
const buffer = []

// ── Route group mapping ─────────────────────────────────────────────────
// Maps first path segment after /api/ to a logical group.
const ROUTE_GROUP_MAP = {
  auth: 'auth',
  sheets: 'sheets',
  ai: 'ai',
  payments: 'payments',
  messaging: 'messaging',
  messages: 'messaging',
  'study-groups': 'messaging',
  search: 'search',
  admin: 'admin',
  notes: 'sheets',
  feed: 'sheets',
}

/**
 * Derive a route group from the request path.
 */
function getRouteGroup(path) {
  const match = path.match(/^\/api\/([^/]+)/)
  if (!match) return 'other'
  return ROUTE_GROUP_MAP[match[1]] || 'other'
}

/**
 * Build a parameterized route template from a raw path.
 * Strips query strings and replaces numeric, hex (24+), and CUID-like IDs
 * with :id placeholders.
 */
function parameterizeRoute(path) {
  // Strip query string
  const clean = path.split('?')[0]

  return clean.replace(/\/([^/]+)/g, (segment, value) => {
    // Numeric IDs
    if (/^\d+$/.test(value)) return '/:id'
    // Hex IDs (MongoDB ObjectId-style, 24+ hex chars)
    if (/^[0-9a-f]{24,}$/i.test(value)) return '/:id'
    // CUID / CUID2 patterns (starts with c, 20+ alphanumeric)
    if (/^c[a-z0-9]{19,}$/i.test(value)) return '/:id'
    // UUID patterns
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return '/:id'
    }
    return segment
  })
}

// ── Timers ──────────────────────────────────────────────────────────────
let flushTimer = null
let cleanupTimer = null

const FLUSH_INTERVAL_MS = 30 * 1000
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000
const RETENTION_DAYS = 30

/**
 * Flush buffered metrics to the database.
 */
async function flushBuffer() {
  if (buffer.length === 0) return

  // Drain the buffer atomically
  const batch = buffer.splice(0, buffer.length)

  try {
    await prisma.requestMetric.createMany({ data: batch })
  } catch (err) {
    log.error({ err, count: batch.length }, 'Failed to flush request metrics')
    // Do not re-queue -- data is dropped to avoid memory growth
  }
}

/**
 * Delete metrics older than RETENTION_DAYS.
 */
async function cleanupOldMetrics() {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const result = await prisma.requestMetric.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    if (result.count > 0) {
      log.info({ deleted: result.count }, 'Cleaned up old request metrics')
    }
  } catch (err) {
    log.error({ err }, 'Failed to clean up old request metrics')
  }
}

/**
 * Express middleware that records per-request latency via res 'finish' event.
 */
function requestMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint()

  res.on('finish', () => {
    try {
      // Backpressure: silently drop if buffer is full
      if (buffer.length >= BUFFER_CAP) return

      const durationNs = process.hrtime.bigint() - start
      const durationMs = Number(durationNs / 1_000_000n)
      const path = req.originalUrl || req.url

      buffer.push({
        method: req.method,
        routeGroup: getRouteGroup(path),
        route: parameterizeRoute(path),
        statusCode: res.statusCode,
        durationMs,
        userId: req.user?.userId || null,
      })
    } catch {
      // Never break requests -- silently discard
    }
  })

  next()
}

/**
 * Start the flush and cleanup timers. Call once at boot.
 */
function startMetricsTimers() {
  // Both intervals write to the DB. Wrap in runWithHeartbeat so a
  // hung flush or hung cleanup emits job.start / job.success /
  // job.failure events to pino + Sentry instead of failing silently
  // (CLAUDE.md A10).
  const { runWithHeartbeat } = require('../lib/jobs/heartbeat')
  flushTimer = setInterval(
    () => runWithHeartbeat('metrics.flush', flushBuffer, { slaMs: 10 * 1000 }),
    FLUSH_INTERVAL_MS,
  )
  flushTimer.unref()

  // Run cleanup on boot (also wrapped so the boot run is observable).
  void runWithHeartbeat('metrics.cleanup', cleanupOldMetrics, { slaMs: 60 * 1000 })

  cleanupTimer = setInterval(
    () => runWithHeartbeat('metrics.cleanup', cleanupOldMetrics, { slaMs: 60 * 1000 }),
    CLEANUP_INTERVAL_MS,
  )
  cleanupTimer.unref()
}

/**
 * Stop timers and flush remaining buffer. For graceful shutdown.
 */
async function stopMetrics() {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  await flushBuffer()
}

module.exports = {
  requestMetricsMiddleware,
  startMetricsTimers,
  stopMetrics,
}
