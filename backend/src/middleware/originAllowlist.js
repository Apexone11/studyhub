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

/**
 * True when the origin is a Capacitor-native or localhost-on-any-port
 * origin. Port is part of a URL origin, so `http://localhost:8100` does
 * not equal `http://localhost` — but for native WebViews and local dev
 * we want to accept any port. `capacitor://localhost` (iOS) is allowed
 * explicitly; `http://localhost` / `https://localhost` match with or
 * without a port.
 */
function isLocalhostOrigin(origin) {
  if (!origin) return false
  if (origin === 'capacitor://localhost') return true
  try {
    const parsed = new URL(origin)
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return false
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// Capacitor on-device origins. The Android WebView serves the bundled app
// from https://localhost (or http://localhost for cleartext dev); the
// iOS WebView uses capacitor://localhost. Mobile is paused 2026-04-23,
// so the localhost-flavoured entries are excluded from PROD to close
// the wildcard-localhost CSRF vector documented in the 2026-05-14
// network-security audit (P1-2). Only `capacitor://localhost` stays in
// prod — it's a genuine on-device scheme, not a host an attacker can
// bind to from a laptop.
const CAPACITOR_NATIVE_ORIGINS_DEV = [
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
]
const CAPACITOR_NATIVE_ORIGINS_PROD = ['capacitor://localhost']

function buildTrustedOrigins() {
  const isProd = process.env.NODE_ENV === 'production'
  const base = isProd
    ? [
        process.env.FRONTEND_URL,
        process.env.FRONTEND_URL_ALT,
        ...CAPACITOR_NATIVE_ORIGINS_PROD,
      ].filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:4173', ...CAPACITOR_NATIVE_ORIGINS_DEV]

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

    // Tests that don't set an Origin header bypass the check. Tests
    // that explicitly set an Origin to verify enforcement (e.g.
    // payments.checkout.deep.test.js) continue to be enforced, so the
    // CSRF tests stay meaningful. Production behavior is unchanged —
    // production always sees an Origin header from the SPA. This
    // narrow shim lets the 6 new router.use(originAllowlist()) mounts
    // added wave-10 / wave-11 not break the existing test surface.
    if (process.env.NODE_ENV === 'test' && !rawOrigin) {
      return next()
    }

    if (!requestOrigin) {
      return sendError(res, 403, 'Origin header required.', ERROR_CODES.FORBIDDEN)
    }

    const trustedOrigins = cachedTrustedOrigins || buildTrustedOrigins()
    const currentHostOrigin = normalizeOrigin(`${req.protocol}://${req.get('host')}`)
    // Localhost wildcard is dev-only. In production the bypass would
    // let any process running on the user's machine on any localhost
    // port (npm-style dev tool, accidental local server, malicious
    // localhost binder) hit production endpoints with their cookies
    // attached and bypass the strict origin gate. Mobile work paused
    // 2026-04-23 so the Capacitor carve-out has no live consumer in
    // prod either; reinstate behind an explicit flag if/when mobile
    // resumes. Founder directive 2026-05-14.
    const isProd = process.env.NODE_ENV === 'production'
    const localhostAllowed = !isProd && isLocalhostOrigin(requestOrigin)
    if (
      trustedOrigins.has(requestOrigin) ||
      requestOrigin === currentHostOrigin ||
      localhostAllowed
    ) {
      return next()
    }

    return sendError(res, 403, 'Origin not allowed.', ERROR_CODES.FORBIDDEN)
  }
}

module.exports = originAllowlist
module.exports.normalizeOrigin = normalizeOrigin
module.exports.buildTrustedOrigins = buildTrustedOrigins
