/**
 * Lightweight request-timing helpers.
 *
 * Mirrors the feed's `settleSection` pattern but is importable from any module.
 *
 * Usage:
 *   const { timedSection, logTiming } = require('../../lib/requestTiming')
 *   const s = await timedSection('mainQuery', () => prisma.foo.findUnique(...))
 *   logTiming(req, { sections: [s], extra: { sheetId } })
 */

const SLOW_QUERY_MS = 500
const log = require('./logger')

/**
 * Wrap a single async operation and measure its wall-clock time.
 * Never throws — returns `{ ok, label, data, error, durationMs }`.
 */
function timedSection(label, loader) {
  const start = Date.now()
  return Promise.resolve()
    .then(() => loader())
    .then((data) => ({ ok: true, label, data, durationMs: Date.now() - start }))
    .catch((error) => ({ ok: false, label, error, durationMs: Date.now() - start }))
}

/**
 * Log a standardised timing entry for any request.
 *
 * @param {import('express').Request} req
 * @param {object} opts
 * @param {Array} opts.sections – array of timedSection results
 * @param {object} [opts.extra]  – route-specific metadata (counts, IDs, etc.)
 */
function logTiming(req, { sections = [], extra = {} } = {}) {
  const durationMs = Date.now() - (req._timingStart || Date.now())
  const route = req.originalUrl
  const method = req.method
  const userId = req.user?.userId || null

  const timings = sections.map((s) => ({
    label: s.label,
    ok: s.ok,
    durationMs: s.durationMs,
  }))

  const slowSections = timings.filter((t) => t.durationMs >= SLOW_QUERY_MS)

  log.info(
    {
      route,
      method,
      userId,
      durationMs,
      queryCount: sections.length,
      ...extra,
      timings,
      ...(slowSections.length ? { slowSections } : {}),
    },
    '[perf]',
  )
}

/**
 * Express middleware — stamps `req._timingStart` for later use by `logTiming`.
 * Mount at the router level for routes you want to instrument.
 */
function startTimer(req, _res, next) {
  req._timingStart = Date.now()
  next()
}

module.exports = { timedSection, logTiming, startTimer, SLOW_QUERY_MS }
