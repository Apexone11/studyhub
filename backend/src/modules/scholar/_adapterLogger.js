/**
 * _adapterLogger.js — Rate-limited adapter-error logger for Scholar sources.
 *
 * Why this exists: 429s (rate limited), 404s (paper not found), and
 * `timeout` results from third-party APIs are NORMAL operating conditions.
 * The previous behavior (`log.warn` every occurrence) drowned the Railway
 * deploy log in repeated `Semantic Scholar 429` / `arXiv search timeout` /
 * `Unpaywall 404 invalid_json` lines and made real failures invisible.
 *
 * Policy:
 *   - Expected transient outcomes (status 429 / 404, `timeout`,
 *     `invalid_json` from a 404 body) are logged at `info` level, ONCE per
 *     (source, errorCategory) per minute. The `event` field stays the same
 *     (`scholar.adapter.error`) so the log-aggregator alert key is unchanged
 *     and downstream dashboards keep working.
 *   - Unexpected outcomes (DNS failure, 5xx, parsing errors that aren't
 *     downstream-404 noise) are still `log.warn`, every time.
 *
 * The throttle is in-process only (Map keyed by `${source}:${category}`).
 * No persistence; restarting the process resets the cooldowns. That's
 * fine for log noise reduction — we never block a real alert on it.
 */

const log = require('../../lib/logger')

const THROTTLE_WINDOW_MS = 60_000

// Map<string, lastLoggedAtMs>
const _lastLoggedAt = new Map()

// Categorize a safeFetch result so we can decide log level + throttle key.
// `error` is the safeFetch shape's `error` field (string), `status` is the
// HTTP status when present.
function _categorize(error, status) {
  if (status === 429) return { level: 'info', category: 'rate_limited' }
  if (status === 404) return { level: 'info', category: 'not_found' }
  if (error === 'timeout') return { level: 'info', category: 'timeout' }
  // `invalid_json` from a 404 body — Unpaywall returns 404 with a non-JSON
  // body for unknown DOIs. Safe to demote.
  if (error === 'invalid_json' && (status === undefined || status === 404)) {
    return { level: 'info', category: 'invalid_json_soft' }
  }
  if (error === 'redirect_blocked') return { level: 'info', category: 'redirect_blocked' }
  if (error === 'response_too_large') return { level: 'warn', category: 'response_too_large' }
  if (error === 'host_resolves_to_private_ip') {
    return { level: 'warn', category: 'private_ip' }
  }
  if (error === 'network_error') return { level: 'warn', category: 'network_error' }
  if (typeof status === 'number' && status >= 500) {
    return { level: 'warn', category: `http_${status}` }
  }
  return { level: 'warn', category: error || 'unknown' }
}

function logAdapterError({ source, error, status, message }) {
  const { level, category } = _categorize(error, status)
  const key = `${source}:${category}`

  // Always emit `warn` for unexpected categories; throttle `info`.
  if (level === 'info') {
    const now = Date.now()
    const last = _lastLoggedAt.get(key) || 0
    if (now - last < THROTTLE_WINDOW_MS) return
    _lastLoggedAt.set(key, now)
    log.info(
      { event: 'scholar.adapter.error', source, error, status, category },
      message || `${source} ${category}`,
    )
    return
  }

  log.warn(
    { event: 'scholar.adapter.error', source, error, status, category },
    message || `${source} ${category}`,
  )
}

// Test seam.
function _resetForTests() {
  _lastLoggedAt.clear()
}

module.exports = {
  logAdapterError,
  _resetForTests,
  THROTTLE_WINDOW_MS,
}
