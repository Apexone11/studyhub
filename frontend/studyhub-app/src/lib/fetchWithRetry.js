/* ═══════════════════════════════════════════════════════════════════════════
 * fetchWithRetry.js — Network-aware retry wrapper around window.fetch
 *
 * Wraps fetch with exponential backoff retries for transient failures.
 * Retries ONLY for:
 *   - Network errors (TypeError thrown by fetch when the request never
 *     reached the server — DNS, TLS, dropped TCP, offline).
 *   - HTTP 5xx responses (server-side transient failure).
 *
 * Does NOT retry for:
 *   - HTTP 4xx (validation, auth, not found — these are user/state errors
 *     that won't recover from a retry).
 *   - AbortError (caller cancelled).
 *   - Mutation requests by default — unless `retryMutations: true` is set.
 *     This is the strict reading of RFC 7231 §4.2.2: GET/HEAD/PUT/DELETE
 *     are idempotent and safe to retry; POST/PATCH are not (a retry can
 *     create a duplicate resource). The hook below opts mutations in only
 *     when the call site has confirmed the endpoint is idempotent or
 *     accepts an Idempotency-Key header.
 *
 * Backoff schedule: 500ms, then 2000ms (capped at 2 retries by default).
 * Total worst-case wait before final failure: ~2.5s + per-request latency.
 *
 * If `navigator.onLine === false` we skip the retry sleeps and fail fast
 * — the caller (e.g. message queue) can then enqueue and retry on the
 * `online` event.
 *
 * Usage:
 *   await fetchWithRetry(`${API}/api/feed`, { credentials: 'include' })
 *   await fetchWithRetry(url, init, { retries: 1, baseDelayMs: 1000 })
 *
 * The wrapper preserves the standard `fetch` contract: it resolves with a
 * `Response` on the first non-retryable status (including 4xx) and only
 * rejects on a thrown network error after exhausting retries.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { isOffline } from './networkStatus'

const DEFAULT_RETRIES = 2
const DEFAULT_BACKOFF_MS = [500, 2000]

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const IDEMPOTENT_MUTATION_METHODS = new Set(['PUT', 'DELETE'])

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function methodOf(init) {
  if (!init || typeof init.method !== 'string') return 'GET'
  return init.method.toUpperCase()
}

function isRetryableStatus(status) {
  return status >= 500 && status <= 599
}

function isAbortError(err) {
  return err && (err.name === 'AbortError' || err.code === 20)
}

/**
 * Decide whether the active method qualifies for retries.
 * - GET/HEAD/OPTIONS — always.
 * - PUT/DELETE — yes (idempotent by RFC 7231).
 * - POST/PATCH — only when `retryMutations: true`.
 */
function shouldRetryForMethod(method, retryMutations) {
  if (SAFE_METHODS.has(method)) return true
  if (IDEMPOTENT_MUTATION_METHODS.has(method)) return true
  return Boolean(retryMutations)
}

/**
 * Pick the backoff delay for retry attempt `n` (0-indexed). Falls back to
 * the last entry of the schedule if the caller configured fewer slots
 * than retries.
 */
function backoffFor(attempt, schedule) {
  if (attempt < schedule.length) return schedule[attempt]
  return schedule[schedule.length - 1]
}

/**
 * Wrap fetch with retry-on-transient-failure logic. Resolves with the
 * final `Response` (which may still be a 4xx — caller checks `res.ok`)
 * or rejects with the last error after exhausting retries.
 *
 * @param {string|Request} input - URL or Request
 * @param {RequestInit} [init] - standard fetch init
 * @param {object} [options]
 * @param {number} [options.retries=2] - max retry attempts after the initial try
 * @param {number[]} [options.backoff=[500, 2000]] - per-attempt delay in ms
 * @param {boolean} [options.retryMutations=false] - allow POST/PATCH retries
 * @param {AbortSignal} [options.signal] - cancel the whole sequence
 */
export async function fetchWithRetry(input, init = {}, options = {}) {
  const {
    retries = DEFAULT_RETRIES,
    backoff = DEFAULT_BACKOFF_MS,
    retryMutations = false,
    signal,
  } = options

  const mergedInit = signal ? { ...init, signal } : init
  const method = methodOf(mergedInit)
  const retryEligible = shouldRetryForMethod(method, retryMutations)

  let lastError = null
  // Total attempts = 1 initial + `retries` retries.
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, mergedInit)
      if (!retryEligible) return response
      if (isRetryableStatus(response.status) && attempt < retries) {
        // Fail-fast when offline: the retry sleep would just delay the
        // inevitable. Caller will see the 5xx response and can decide
        // whether to enqueue.
        if (isOffline()) return response
        await sleep(backoffFor(attempt, backoff))
        continue
      }
      return response
    } catch (err) {
      // AbortError is the caller's signal — never retry past it.
      if (isAbortError(err)) throw err
      lastError = err
      if (!retryEligible || attempt >= retries) throw err
      if (isOffline()) throw err
      await sleep(backoffFor(attempt, backoff))
    }
  }
  // Defensive — only reachable if `retries < 0`, which the type contract forbids.
  throw lastError || new Error('fetchWithRetry: exhausted without response')
}

export default fetchWithRetry
