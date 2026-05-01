/**
 * heartbeat.js — minimal liveness instrumentation for setInterval-based
 * background jobs. Wrap your scheduler so missed runs are visible in
 * logs and alertable from the log aggregator.
 *
 * Usage:
 *   const { runWithHeartbeat } = require('../lib/jobs/heartbeat')
 *
 *   setInterval(
 *     () => runWithHeartbeat('html-archive', archiveTask, { slaMs: 5 * 60_000 }),
 *     intervalMs,
 *   )
 *
 * What it does:
 *   - Logs `job.start` / `job.success` / `job.failure` at info/warn level
 *     with a stable `event` field for alerting.
 *   - Times each run; logs `durationMs` and warns when it exceeds `slaMs`.
 *   - Captures exceptions to Sentry with the job name as a tag so they
 *     don't blend into the generic crash queue.
 *
 * What it does NOT do:
 *   - Persist last-run timestamps (use Redis or a job_state table for
 *     cross-restart visibility — out of scope for this helper).
 *   - Retry. Background jobs that need retry should use a queue like
 *     BullMQ; this helper is for "fire and forget" sweeper-style work.
 */
const log = require('../logger')
const { captureError } = require('../../monitoring/sentry')

const DEFAULT_SLA_MS = 30_000

async function runWithHeartbeat(name, task, opts = {}) {
  const slaMs = Number.isFinite(opts.slaMs) ? opts.slaMs : DEFAULT_SLA_MS
  const startedAt = Date.now()

  log.info({ event: 'job.start', job: name }, `[${name}] starting`)

  try {
    const result = await task()
    const durationMs = Date.now() - startedAt
    if (durationMs > slaMs) {
      log.warn(
        { event: 'job.sla_breach', job: name, durationMs, slaMs },
        `[${name}] exceeded SLA (${durationMs}ms > ${slaMs}ms)`,
      )
    } else {
      log.info({ event: 'job.success', job: name, durationMs }, `[${name}] ok in ${durationMs}ms`)
    }
    return result
  } catch (error) {
    const durationMs = Date.now() - startedAt
    log.error(
      { event: 'job.failure', job: name, durationMs, err: error.message },
      `[${name}] failed after ${durationMs}ms`,
    )
    captureError(error, { tag: `job.${name}.failure`, job: name, durationMs })
    return null
  }
}

module.exports = { runWithHeartbeat }
