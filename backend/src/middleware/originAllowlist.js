/**
 * originAllowlist.js — Defense-in-depth Origin enforcement for high-value routes.
 *
 * The global CSRF guard in index.js validates the Origin/Referer header against
 * a trusted-origin set, but it intentionally bails out (`next()`) when neither
 * header is present to avoid breaking native and server-to-server callers.
 *
 * For the highest-value endpoints (payments checkout/portal) we want a stricter
 * posture: REQUIRE an Origin or Referer header AND enforce it against the
 * allowlist — on top of the existing CSRF-token validation. This guards against
 * scenarios where a CSRF token might leak or a browser-extension attack omits
 * the Origin header.
 *
 * Webhook endpoints that rely on signature verification (e.g. Stripe) must NOT
 * be wrapped with this middleware — they are legitimately called by servers
 * without an Origin header.
 *
 * The allowlist mirrors the one constructed in backend/src/index.js so this
 * middleware is self-contained and does not depend on module-load ordering.
 */
const { sendError, ERROR_CODES } = require('./errorEnvelope')

function normalizeOrigin(value) {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

// Capacitor on-device origins. The Android WebView serves the bundled app
// from https://localhost (or http://localhost for cleartext dev); the
// iOS WebView uses capacitor://localhost. These are trusted-by-device,
// not remote, so they must be on the allowlist in BOTH prod and dev —
// otherwise native callers get a 403 on any write route this middleware
// guards. Mobile work is paused as of 2026-04-23, but keeping these in
// so the Android APK still works when/if a build gets deployed.
const CAPACITOR_NATIVE_ORIGINS = ['capacitor://localhost', 'http://localhost', 'https://localhost']

function buildTrustedOrigins() {
  const isProd = process.env.NODE_ENV === 'production'
  const base = isProd
    ? [process.env.FRONTEND_URL, process.env.FRONTEND_URL_ALT, ...CAPACITOR_NATIVE_ORIGINS].filter(
        Boolean,
      )
    : ['http://localhost:5173', 'http://localhost:4173', ...CAPACITOR_NATIVE_ORIGINS]

  // In production, also allow www / non-www variants automatically.
  if (isProd) {
    for (const url of [...base]) {
      try {
        const parsed = new URL(url)
        if (parsed.hostname.startsWith('www.')) {
          base.push(url.replace('www.', ''))
        } else {
          base.push(
            `${parsed.protocol}//www.${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}`,
          )
        }
      } catch {
        /* skip malformed */
      }
    }
  }

  return new Set(base.map((o) => normalizeOrigin(o)).filter(Boolean))
}

/**
 * Factory that returns an Express middleware enforcing the Origin/Referer
 * header against the trusted-origin set.
 *
 * Options:
 *   - rebuildPerRequest: if true, reconstructs the trusted-origin set on each
 *     request. Useful for tests that mutate process.env between cases. Defaults
 *     to false for production (set is built once at factory time).
 */
function originAllowlist({ rebuildPerRequest = false } = {}) {
  const cachedTrustedOrigins = rebuildPerRequest ? null : buildTrustedOrigins()

  return function originAllowlistMiddleware(req, res, next) {
    // Safe methods skip the check — payment POST routes are what we care about.
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next()
    }

    const rawOrigin = req.headers.origin || req.headers.referer
    const requestOrigin = normalizeOrigin(rawOrigin)

    if (!requestOrigin) {
      return sendError(res, 403, 'Origin header required.', ERROR_CODES.FORBIDDEN)
    }

    const trustedOrigins = cachedTrustedOrigins || buildTrustedOrigins()
    const currentHostOrigin = normalizeOrigin(`${req.protocol}://${req.get('host')}`)
    if (trustedOrigins.has(requestOrigin) || requestOrigin === currentHostOrigin) {
      return next()
    }

    return sendError(res, 403, 'Origin not allowed.', ERROR_CODES.FORBIDDEN)
  }
}

module.exports = originAllowlist
module.exports.normalizeOrigin = normalizeOrigin
module.exports.buildTrustedOrigins = buildTrustedOrigins
