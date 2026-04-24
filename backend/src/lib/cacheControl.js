/**
 * Express middleware that sets Cache-Control (and Vary) headers.
 *
 * @param {number} maxAge - Cache duration in seconds
 * @param {object} [options]
 *   - public {boolean} — `public` directive. When true, shared caches may
 *     store the response. Implies the body does NOT depend on auth; the
 *     Vary header intentionally omits Cookie/Authorization so shared
 *     caches can actually share the entry across users (keying every
 *     variant by Cookie is the same as disabling the shared cache).
 *   - staleWhileRevalidate {number} — seconds of SWR grace.
 *   - varyByAuth {boolean} — force Cookie + Authorization into the Vary
 *     header even on `public` responses. Use only when the body legitimately
 *     differs for authed vs anonymous callers (e.g., an endpoint that
 *     degrades for anonymous users but still opts into shared caching).
 *     For private responses this is the default regardless.
 * @returns {Function} Express middleware
 *
 * Critical: every response that CORS decorates (`Access-Control-Allow-Origin`
 * + `Access-Control-Allow-Credentials`) MUST include `Vary: Origin`. Any
 * shared cache in front of the backend (Cloudflare edge, Railway proxy,
 * the browser's own HTTP cache) keys entries by URL — without `Vary:
 * Origin` a single cached body can be served to requests from multiple
 * origins, and the browser will reject the response for credentialed
 * requests because the cached `Access-Control-Allow-Origin` header
 * doesn't match the current origin. That surfaces in the frontend as
 * `TypeError: Failed to fetch` even though the backend is healthy —
 * this was the root cause of the `/api/courses/schools`,
 * `/api/public/*`, and `/api/feed/*` failures reported in production.
 *
 * For PRIVATE responses we also vary on Cookie + Authorization so a
 * cached authenticated response doesn't leak to a different user or an
 * anonymous one. For PUBLIC responses we deliberately skip those unless
 * the caller opts in with `varyByAuth: true` — otherwise the shared
 * cache becomes useless because every unique session cookie creates a
 * new cache slot.
 */
function cacheControl(maxAge, options = {}) {
  return (req, res, next) => {
    const parts = []
    parts.push(options.public ? 'public' : 'private')
    parts.push(`max-age=${maxAge}`)
    if (options.staleWhileRevalidate) {
      parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`)
    }
    res.set('Cache-Control', parts.join(', '))

    const varyValues = ['Origin']
    const includeAuthVary = !options.public || options.varyByAuth === true
    if (includeAuthVary) {
      varyValues.push('Cookie', 'Authorization')
    }
    appendVary(res, varyValues)
    next()
  }
}

/** Merge additional values into the Vary header without dropping existing ones. */
function appendVary(res, values) {
  const existing = res.getHeader('Vary')
  const set = new Set(
    existing
      ? String(existing)
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean)
      : [],
  )
  for (const value of values) set.add(value)
  res.set('Vary', Array.from(set).join(', '))
}

module.exports = { cacheControl, appendVary }
