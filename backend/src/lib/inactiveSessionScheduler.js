/**
 * inactiveSessionScheduler — revoke sessions dormant for N days.
 *
 * Runs in-process on a daily interval. Mirrors the pattern used by
 * moderationCleanupScheduler so we don't need a separate Railway cron
 * service — the backend itself handles the housekeeping.
 *
 * Distinct from session.service.js cleanupExpiredSessions(): that one
 * deletes rows past their 24h TTL, this one *revokes* (keeps the row
 * for audit but kills the session) anything that's been idle for 30 days.
 *
 * Horizontal-scaling note: when the backend runs on multiple instances,
 * every process would otherwise fire the same sweep and multiply DB
 * load for zero extra value (updateMany is idempotent, but the
 * second/third/Nth call is pure waste). The scheduler is gated behind
 * `ENABLE_INACTIVE_SESSION_SWEEP=true` — flip it on for exactly one
 * "worker" instance (or the single-node deployment). Other instances
 * no-op. When unset we default to enabled in dev/single-instance
 * setups so local behavior is unchanged; set it explicitly to "false"
 * on N-1 replicas in production.
 */

const prisma = require('./prisma')
const log = require('./logger')

let sweepInterval = null
let sweepTimeout = null

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000 // daily
const DEFAULT_INACTIVE_DAYS = 30

function isEnabled() {
  const flag = process.env.ENABLE_INACTIVE_SESSION_SWEEP
  if (flag === undefined || flag === '') {
    // Default: enabled in dev/test/staging (single-node convenience);
    // DISABLED in production unless explicitly opted in. Production is
    // where horizontal scaling creates the risk of every replica
    // hammering the DB with the same idempotent sweep, so the safer
    // default there is "off — pick one worker and set ENABLE=true".
    return process.env.NODE_ENV !== 'production'
  }
  return flag !== 'false' && flag !== '0'
}

function startInactiveSessionScheduler() {
  if (process.env.NODE_ENV === 'test') return
  if (sweepInterval) return
  if (!isEnabled()) {
    log.info(
      '[inactive-session-sweep] disabled via ENABLE_INACTIVE_SESSION_SWEEP=false; relying on another worker or scripts/sweepInactiveSessions.js',
    )
    return
  }

  const intervalMs = Number(process.env.INACTIVE_SESSION_SWEEP_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  const inactiveDays = Number(process.env.INACTIVE_SESSION_DAYS) || DEFAULT_INACTIVE_DAYS

  async function runSweep() {
    try {
      const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000)
      const result = await prisma.session.updateMany({
        where: {
          revokedAt: null,
          lastActiveAt: { lt: cutoff },
        },
        data: { revokedAt: new Date() },
      })
      if (result.count > 0) {
        log.info(
          `[inactive-session-sweep] revoked ${result.count} sessions inactive since ${cutoff.toISOString()}`,
        )
      }
    } catch (err) {
      // Degrade gracefully — never let a housekeeping failure crash the server.
      log.error({ err }, '[inactive-session-sweep] sweep failed')
    }
  }

  // Run once ~60s after boot so migrations have settled, then every 24h.
  sweepTimeout = setTimeout(runSweep, 60_000)
  if (typeof sweepTimeout.unref === 'function') sweepTimeout.unref()

  sweepInterval = setInterval(runSweep, intervalMs)
  if (typeof sweepInterval.unref === 'function') sweepInterval.unref()
}

function stopInactiveSessionScheduler() {
  if (sweepTimeout) {
    clearTimeout(sweepTimeout)
    sweepTimeout = null
  }
  if (sweepInterval) {
    clearInterval(sweepInterval)
    sweepInterval = null
  }
}

module.exports = { startInactiveSessionScheduler, stopInactiveSessionScheduler }
