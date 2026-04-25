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

// Canonical casing for the Vary tokens we emit. HTTP header values are
// case-insensitive per RFC 7230 §3.2, so upstream middleware that set
// `vary: origin` (lowercase) must not collide with our `Origin` —
// otherwise the header ends up with both "origin" and "Origin" as
// distinct entries, which some proxies treat as invalid.
const CANONICAL_VARY_TOKENS = {
  origin: 'Origin',
  cookie: 'Cookie',
  authorization: 'Authorization',
  'accept-encoding': 'Accept-Encoding',
}

/**
 * Merge additional values into the Vary header without dropping existing
 * ones. Case-insensitive dedupe: we key by lowercased token so `origin`
 * and `Origin` collapse to a single entry. The emitted casing prefers the
 * canonical spelling when we know it, otherwise keeps the caller's input.
 */
function appendVary(res, values) {
  const existing = res.getHeader('Vary')

  // RFC 7231 §7.1.4: `Vary: *` is a sentinel meaning "response varies
  // on axes the server won't enumerate" and MUST NOT be combined with
  // other field names — a cache seeing `*, Origin` will treat the
  // whole header as undefined. If either side contributes `*`, emit
  // just `*` and short-circuit the merge.
  const existingStr = existing ? String(existing) : ''
  const existingHasStar = existingStr.split(',').some((t) => t.trim() === '*')
  const incomingHasStar = values.some((v) => String(v || '').trim() === '*')
  if (existingHasStar || incomingHasStar) {
    res.set('Vary', '*')
    return
  }

  // Map keyed by lowercased token, value is the casing we'll emit.
  const merged = new Map()

  const addToken = (rawToken) => {
    const trimmed = String(rawToken || '').trim()
    if (!trimmed) return
    const normalized = trimmed.toLowerCase()
    // First occurrence wins per normalized token. For known tokens we
    // emit the canonical casing (so an upstream `vary: origin` is
    // re-spelled to `Origin`); for unknown tokens we preserve whatever
    // casing the caller supplied. Subsequent duplicates are ignored,
    // which means once a known token is seen we're locked to its
    // canonical form for the rest of the response.
    if (!merged.has(normalized)) {
      merged.set(normalized, CANONICAL_VARY_TOKENS[normalized] || trimmed)
    }
  }

  if (existingStr) {
    existingStr.split(',').forEach(addToken)
  }
  for (const value of values) addToken(value)

  res.set('Vary', Array.from(merged.values()).join(', '))
}

module.exports = { cacheControl, appendVary }
