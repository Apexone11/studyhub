const prisma = require('../prisma')
const { archiveExpiredOriginalVersions } = require('./htmlArchive')
const { runWithHeartbeat } = require('../jobs/heartbeat')

let archiveInterval = null

function startHtmlArchiveScheduler() {
  if (process.env.NODE_ENV === 'test') return
  if (archiveInterval) return

  const parsedIntervalMs = Number.parseInt(
    process.env.HTML_ARCHIVE_INTERVAL_MS || String(6 * 60 * 60 * 1000),
    10,
  )
  const intervalMs = Number.isFinite(parsedIntervalMs) ? parsedIntervalMs : 6 * 60 * 60 * 1000

  // The archive task is wrapped in `runWithHeartbeat` so a stalled or
  // failing run produces structured `job.start` / `job.success` /
  // `job.failure` events in pino + Sentry. Bare try/catch + console.error
  // (the prior shape) was invisible to the log aggregator's job-health
  // alerts (CLAUDE.md A10 + A16).
  const runArchive = () =>
    archiveExpiredOriginalVersions(prisma, {
      olderThanDays: Number.parseInt(process.env.HTML_ARCHIVE_DAYS || '20', 10),
      limit: Number.parseInt(process.env.HTML_ARCHIVE_BATCH_SIZE || '50', 10),
    })

  void runWithHeartbeat('html.archive_expired_versions', runArchive, { slaMs: 5 * 60_000 })
  archiveInterval = setInterval(
    () => {
      void runWithHeartbeat('html.archive_expired_versions', runArchive, { slaMs: 5 * 60_000 })
    },
    Math.max(60000, intervalMs),
  )
  if (typeof archiveInterval.unref === 'function') archiveInterval.unref()
}

module.exports = {
  startHtmlArchiveScheduler,
}
