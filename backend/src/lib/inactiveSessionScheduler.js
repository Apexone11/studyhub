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
 * Horizontal-scaling safety: when the backend runs on multiple
 * instances, every process would otherwise fire the same sweep and
 * multiply DB load for zero extra value. The sweep is therefore
 * **OFF BY DEFAULT in every environment** — production, staging,
 * test, and local dev. Opt in explicitly per-instance with
 * `ENABLE_INACTIVE_SESSION_SWEEP=true`.
 *
 * Rationale for default-off-everywhere:
 *   - Production: any scaled deployment must pick exactly one worker.
 *   - Staging: the moment staging is scaled to two replicas, an
 *     implicit "on in non-prod" default silently doubles DB load.
 *   - Local dev: developers who need the sweep can set it in
 *     their own .env; skipping the sweep by default costs nothing
 *     because local sessions almost never sit idle for 30 days.
 *
 * The standalone `backend/scripts/sweepInactiveSessions.js` remains
 * the always-safe alternative — run it from a cron / CI job if you
 * don't want any in-process scheduler at all.
 */

const prisma = require('./prisma')
const log = require('./logger')

let sweepInterval = null
let sweepTimeout = null

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000 // daily
const DEFAULT_INACTIVE_DAYS = 30

function isEnabled() {
  const flag = process.env.ENABLE_INACTIVE_SESSION_SWEEP
  // Off by default in every environment (prod / staging / test /
  // local). Opt in explicitly per instance. See the file-level
  // docstring for the reasoning — the short version is that a
  // default-on staging blows up the moment staging is scaled to
  // more than one replica.
  if (flag === undefined || flag === '') return false
  return flag === 'true' || flag === '1'
}

function startInactiveSessionScheduler() {
  if (process.env.NODE_ENV === 'test') return
  if (sweepInterval) return
  if (!isEnabled()) {
    log.info(
      '[inactive-session-sweep] disabled (default). Set ENABLE_INACTIVE_SESSION_SWEEP=true on exactly one worker to enable, or run scripts/sweepInactiveSessions.js from cron.',
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
  // Wrapped in runWithHeartbeat (CLAUDE.md A10) so a hung sweep emits
  // job.start / job.success / job.failure events to pino + Sentry. The
  // sweep deletes from the Session table so a silent stall would mean
  // expired sessions never get revoked.
  const { runWithHeartbeat } = require('./jobs/heartbeat')
  const wrappedSweep = () =>
    runWithHeartbeat('session.inactive_sweep', runSweep, { slaMs: 5 * 60_000 })

  sweepTimeout = setTimeout(wrappedSweep, 60_000)
  if (typeof sweepTimeout.unref === 'function') sweepTimeout.unref()

  sweepInterval = setInterval(wrappedSweep, intervalMs)
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
