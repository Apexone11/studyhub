/**
 * Express middleware that sets Cache-Control (and Vary) headers.
 *
 * @param {number} maxAge - Cache duration in seconds
 * @param {object} [options] - { public: boolean, staleWhileRevalidate: number }
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
 * We also vary on `Cookie` and `Authorization` so authenticated and
 * anonymous variants of the same endpoint don't share cache slots.
 * Without that, an anonymous response could be served to a logged-in
 * user (or vice versa) whenever the same URL is hit.
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
    appendVary(res, ['Origin', 'Cookie', 'Authorization'])
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
