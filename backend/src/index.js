// Load env vars FIRST — every other require below may read process.env
// at import time. Centralized in lib/loadEnv so scripts and tests use
// the same path-resolution logic and the dotenv call doesn't drift.
require('./lib/loadEnv')

const express = require('express')
const compression = require('compression')
const cors = require('cors')
const helmet = require('helmet')
const http = require('http')
const { initSentry, captureError } = require('./monitoring/sentry')
const { validateSecrets: validateStartupSecrets } = require('./lib/secretValidator')
const { bootstrapRuntime } = require('./lib/bootstrap/bootstrap')
const { validateEmailTransport } = require('./lib/email/email')
const { startHtmlArchiveScheduler } = require('./lib/html/htmlArchiveScheduler')
const { startModerationCleanupScheduler } = require('./lib/moderation/moderationCleanupScheduler')
const { startInactiveSessionScheduler } = require('./lib/inactiveSessionScheduler')
const {
  AVATARS_DIR,
  CONTENT_IMAGES_DIR,
  COVERS_DIR,
  GROUP_MEDIA_DIR,
  NOTE_IMAGES_DIR,
  SCHOOL_LOGOS_DIR,
  validateUploadStorage,
} = require('./lib/storage')
const csrfProtection = require('./middleware/csrf')
const { guardedMode, isGuardedModeEnabled } = require('./middleware/guardedMode')
const checkRestrictions = require('./middleware/checkRestrictions')
const auditMiddleware = require('./middleware/auditMiddleware')
const optionalAuth = require('./core/auth/optionalAuth')
const { validateSecrets } = require('./lib/authTokens')
const { ERROR_CODES, sendError } = require('./middleware/errorEnvelope')
const prisma = require('./lib/prisma')

const sentryEnabled = initSentry()

// Phase 5: validate all required secrets are set at boot time.
// In production, missing critical secrets cause a hard exit.
validateStartupSecrets()

const app = express()
const PORT = process.env.PORT || 4000
const apiVersion = require('./middleware/apiVersion')
const authRoutes = require('./modules/auth')
const courseRoutes = require('./modules/courses')
const sheetRoutes = require('./modules/sheets')
const feedRoutes = require('./modules/feed')
const dashboardRoutes = require('./modules/dashboard')
const examRoutes = require('./modules/exams')
const settingsRoutes = require('./modules/settings')
const announcementRoutes = require('./modules/announcements')
const adminRoutes = require('./modules/admin')
const uploadRoutes = require('./modules/upload')
const notesRoutes = require('./modules/notes')
const notificationsRoutes = require('./modules/notifications')
const usersRoutes = require('./modules/users')
const previewRoutes = require('./modules/preview')
const searchRoutes = require('./modules/search')
const sheetLabRoutes = require('./modules/sheetLab')
const webhookRoutes = require('./modules/webhooks')
const {
  adminRouter: moderationAdminRoutes,
  userRouter: moderationUserRoutes,
} = require('./modules/moderation')
const provenanceRoutes = require('./modules/provenance')
const featureFlagRoutes = require('./modules/featureFlags')
const webauthnRoutes = require('./modules/webauthn')
const publicRoutes = require('./modules/public')
const messagingRoutes = require('./modules/messaging')
const studyGroupRoutes = require('./modules/studyGroups')
const docsRoutes = require('./modules/docs')
const sharingRoutes = require('./modules/sharing')
const aiRoutes = require('./modules/ai')
const libraryRoutes = require('./modules/library')
const scholarRoutes = require('./modules/scholar')
const videoRoutes = require('./modules/video')
const paymentsRoutes = require('./modules/payments')
const reviewsRoutes = require('./modules/reviews')
const legalRoutes = require('./modules/legal')
const plagiarismRoutes = require('./modules/plagiarism')
const studyStatusRoutes = require('./modules/studyStatus')
const onboardingRoutes = require('./modules/onboarding')
const referralRoutes = require('./modules/referrals')
const hashtagsRoutes = require('./modules/hashtags')
const sectionsRoutes = require('./modules/sections')
const materialsRoutes = require('./modules/materials')
const creatorAuditRoutes = require('./modules/creatorAudit')
const achievementsRoutes = require('./modules/achievements')
const gifsRoutes = require('./modules/gifs')
const crypto = require('node:crypto')
const log = require('./lib/logger')
const { httpLogger } = require('./lib/httpLogger')
const { initSocketIO } = require('./lib/socketio')
const { featureFlagMiddleware } = require('./lib/featureFlags')
const { trackActiveUser } = require('./lib/activeTracking')
const { requestMetricsMiddleware, startMetricsTimers } = require('./middleware/requestMetrics')

if (sentryEnabled) {
  log.info('Sentry monitoring enabled for backend.')
}

process.on('uncaughtException', (error) => {
  captureError(error, { source: 'uncaughtException' })
  log.fatal({ err: error }, 'Uncaught exception')
})

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason))
  captureError(error, { source: 'unhandledRejection' })
  log.error({ err: error }, 'Unhandled promise rejection')
})

// Dynamic CORS: dev allows Vite dev/preview servers; production allows primary and alternate frontend URLs.
const isProd = process.env.NODE_ENV === 'production'
// Production hard-coded fallbacks. If FRONTEND_URL / FRONTEND_URL_ALT are not
// set in the environment, we still want CORS + frame-ancestors to permit the
// canonical production frontend instead of silently blocking it. This is the
// root cause of the blank-iframe HTML preview bug observed 2026-04-30: when
// the env vars were missing, allowedOrigins collapsed to ['https://localhost']
// and frame-ancestors blocked the real getstudyhub.org parent page.
//
// We deliberately do NOT include the Railway preview hostname (e.g.
// studyhub-frontend.up.railway.app) here. Railway preview subdomains can be
// recycled to other tenants, so hard-coding one would over-allow CORS in
// perpetuity. If you need to allow a Railway subdomain, set FRONTEND_URL_ALT
// in env vars for that environment.
const PROD_FRONTEND_FALLBACKS = ['https://getstudyhub.org', 'https://www.getstudyhub.org']
const allowedOrigins = isProd
  ? [
      process.env.FRONTEND_URL,
      process.env.FRONTEND_URL_ALT,
      ...PROD_FRONTEND_FALLBACKS,
      'https://localhost',
    ].filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:4173', 'https://localhost']

// In production, also allow www / non-www variants of each origin automatically.
if (isProd) {
  for (const url of [...allowedOrigins]) {
    try {
      const parsed = new URL(url)
      if (parsed.hostname.startsWith('www.')) {
        allowedOrigins.push(url.replace('www.', ''))
      } else {
        allowedOrigins.push(
          `${parsed.protocol}//www.${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}`,
        )
      }
    } catch {
      /* skip malformed */
    }
  }
}

function normalizeOrigin(value) {
  if (!value) return null

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

const trustedOrigins = new Set(
  allowedOrigins.map((origin) => normalizeOrigin(origin)).filter(Boolean),
)

// CSP violation reporting endpoint — when present, browsers POST a JSON
// report any time a directive blocks something. Set CSP_REPORT_URI to
// e.g. a Sentry CSP intake URL (`https://o<org>.ingest.sentry.io/api/<id>/security/?sentry_key=<dsn-public-key>`)
// or any internal endpoint that accepts `application/csp-report`. Empty
// string disables reporting (no `report-uri` directive emitted).
const cspReportUri = (process.env.CSP_REPORT_URI || '').trim()
const cspReportDirective = cspReportUri ? `report-uri ${cspReportUri}` : null

function buildCsp(directives) {
  const filtered = directives.filter(Boolean)
  if (cspReportDirective) filtered.push(cspReportDirective)
  return filtered.join('; ')
}

/**
 * Build the list of R2 origins the browser may load media/images from.
 * Two URL shapes are possible:
 *   1. Signed URLs from `r2.getSignedDownloadUrl()` — point to
 *      `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/...`
 *   2. Public URLs when `R2_PUBLIC_URL` is configured (custom CDN domain).
 * Without these in `media-src` / `img-src`, the browser blocks `<video src>`
 * with a CSP violation that does NOT show up as a failed network request,
 * making "video doesn't play" hard to diagnose.
 */
// Cloudflare R2 account IDs are lowercase hex (per Cloudflare's public
// docs). Reject anything else so an operator-supplied env value can't
// inject CSP directives via stray whitespace, semicolons, or quotes —
// defense in depth on the Railway secret pipeline.
const R2_ACCOUNT_ID_PATTERN = /^[a-f0-9]{8,64}$/i

function r2CspOrigins() {
  const origins = []
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim()
  if (accountId && R2_ACCOUNT_ID_PATTERN.test(accountId)) {
    origins.push(`https://${accountId}.r2.cloudflarestorage.com`)
  }
  const publicUrl = (process.env.R2_PUBLIC_URL || '').trim()
  if (publicUrl) {
    try {
      const parsed = new URL(publicUrl)
      // Only http(s) origins belong in a CSP source list.
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        origins.push(parsed.origin)
      }
    } catch {
      // Malformed env value — skip silently. secretValidator surfaces it.
    }
  }
  return origins
}

const r2Origins = r2CspOrigins()
const r2OriginList = r2Origins.length > 0 ? ' ' + r2Origins.join(' ') : ''

const appSurfaceCsp = buildCsp([
  "default-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "connect-src 'self'",
  `img-src 'self' data:${r2OriginList}`,
  "font-src 'none'",
  `media-src 'self' blob:${r2OriginList}`,
  "object-src 'none'",
  "script-src 'none'",
  "style-src 'none'",
  // Belt-and-suspenders for HSTS preload: tell the browser to upgrade
  // any stray http:// resource to https://. Catches mixed-content from
  // user-pasted URLs that slip past `resolveImageUrl`. CSP3 directive,
  // supported by every modern browser.
  'upgrade-insecure-requests',
])

const previewFrameAncestors = Array.from(trustedOrigins)
const previewSurfaceCsp = buildCsp([
  "default-src 'none'",
  "base-uri 'none'",
  `frame-ancestors ${previewFrameAncestors.length > 0 ? previewFrameAncestors.join(' ') : "'none'"}`,
  "form-action 'none'",
  "connect-src 'none'",
  'img-src data: blob: https:',
  'font-src data: blob: https://fonts.gstatic.com',
  'media-src data: blob:',
  "object-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-elem 'unsafe-inline' https://fonts.googleapis.com",
])

app.disable('x-powered-by')

// ── Request ID ──────────────────────────────────────────────────────────
// Attach a unique request ID to every request for end-to-end tracing.
// If the client sends X-Request-Id (e.g., from Sentry on the frontend),
// we reuse it; otherwise we generate one. The ID is returned in the
// response header so frontend error reports can be correlated with
// backend logs. Same pattern used by GitHub, Stripe, and Heroku.
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || crypto.randomUUID()
  req.requestId = id
  res.setHeader('X-Request-Id', id)
  next()
})

// Structured HTTP request/response logging (pino-http).
// Logs method, url, status, response time, request ID, and user ID.
app.use(httpLogger)

// Gzip/Brotli compression for all text-based responses.
// SSE streams MUST bypass compression — buffering would hold every Hub AI
// delta in a 16 KB chunk before flushing, which makes the chat feel frozen
// for the first 5–20 seconds of a response. We can't gate on the response
// Content-Type because `compression()` evaluates its filter on the FIRST
// `res.write` call, before the route handler has had a chance to call
// `res.writeHead({'Content-Type': 'text/event-stream'})`. Path-based gating
// is the reliable signal: register every SSE-emitting route URL here. The
// `x-no-compression` request header is also honored as a per-request
// escape hatch (mirrors compression's default behavior).
const SSE_PATH_PATTERNS = [/^\/api\/ai\/messages(?:\?|$)/]
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false
      const url = req.originalUrl || req.url || ''
      if (SSE_PATH_PATTERNS.some((re) => re.test(url))) return false
      return compression.filter(req, res)
    },
  }),
)

if (isProd) {
  app.set('trust proxy', 1)
}

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    // HSTS preload: 1 year max-age + includeSubDomains + preload, only
    // in prod. Submit the apex domain to https://hstspreload.org once
    // every subdomain confirmed serves HTTPS — getting on the preload
    // list bakes HSTS into Chrome/Firefox/Safari ship builds so a MITM
    // can't strip it on the user's first visit.
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
)

app.use((req, res, next) => {
  const isPreviewSurface = req.path === '/preview' || req.path.startsWith('/preview/')

  if (isPreviewSurface) {
    res.setHeader('Content-Security-Policy', previewSurfaceCsp)
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.removeHeader('X-Frame-Options')
    // Pass computed frame-ancestors to preview route handlers so they can
    // include it when they override CSP with route-specific directives.
    res.locals.frameAncestorsDirective = `frame-ancestors ${previewFrameAncestors.length > 0 ? previewFrameAncestors.join(' ') : "'none'"}`
  } else {
    res.setHeader('Content-Security-Policy', appSurfaceCsp)
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('X-Frame-Options', 'DENY')
  }

  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  next()
})

// Belt-and-suspenders Vary: Origin on EVERY response. The cors() middleware
// adds it for routes it touches and cacheControl() adds it for cached routes,
// but a response that errors out before either runs (rate-limit 429, validation
// 400 from earlier middleware, the global error handler at the bottom of this
// file) would otherwise reach a shared cache without Vary: Origin. A shared
// cache that keys only by URL would then serve one origin's cached body to
// requests from a different origin, surfacing in the browser as a "CORS error"
// even though the backend is healthy. This was the failure mode the
// cacheControl.js header note describes — re-asserted globally so no response
// path can skip it.
app.use((req, res, next) => {
  res.setHeader('Vary', 'Origin')
  next()
})

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      const normalizedOrigin = normalizeOrigin(origin)
      if (normalizedOrigin && trustedOrigins.has(normalizedOrigin)) {
        return callback(null, true)
      }
      // In dev, accept any localhost/127.0.0.1 port so Vite picking a fallback
      // port (5174, 4177, etc. when 5173 is in use) doesn't break auth.
      if (!isProd && normalizedOrigin) {
        try {
          const { hostname } = new URL(normalizedOrigin)
          if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return callback(null, true)
          }
        } catch {
          /* fall through to reject */
        }
      }
      // Reject by returning false instead of throwing. callback(new Error())
      // routes the request to the global error handler at the bottom of this
      // file, which sends a 500 with NO Access-Control-Allow-Origin header.
      // If a shared cache (Cloudflare edge) catches that 500, it can be
      // re-served to requests from legitimate origins → browser reports
      // "CORS error" on a healthy endpoint. callback(null, false) lets cors
      // respond cleanly without Allow-Origin (browser blocks naturally) and
      // does not produce a cacheable error body.
      callback(null, false)
    },
    credentials: true,
  }),
)

// Lightweight CSRF protection for cookie-authenticated browser requests.
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next()
  }

  const requestOrigin = normalizeOrigin(req.headers.origin || req.headers.referer)
  if (!requestOrigin) return next()

  const currentHostOrigin = normalizeOrigin(`${req.protocol}://${req.get('host')}`)
  if (trustedOrigins.has(requestOrigin) || requestOrigin === currentHostOrigin) {
    return next()
  }

  return sendError(res, 403, 'Origin not allowed.', ERROR_CODES.FORBIDDEN)
})

const { globalLimiter } = require('./lib/rateLimiters')

app.use(globalLimiter)

// Default headers on every /api response. Mounted as a top-level
// middleware (with an explicit path check) BEFORE any /api/* router so
// it runs even on routes that end the response without calling next()
// — webhook handlers, the Stripe webhook wrapper, the video chunk
// handler, etc. Mount-ordering this after webhook routes (the earlier
// 2026-04-30 placement) defeated the no-store + X-Robots-Tag
// guarantees because some webhook handlers terminate the response.
//
//  - `Cache-Control: no-store`: auth-bearing endpoints
//    (e.g. `/api/users/me`) must NEVER be cached. A misconfigured CDN
//    keying only on URL would otherwise serve user A's session payload
//    to user B. Routes that benefit from caching (public schools list,
//    platform-stats, popular courses) override via the existing
//    `cacheControl()` middleware.
//  - `X-Robots-Tag: noindex, nofollow, noarchive`: industry standard
//    for JSON APIs (Stripe, Twilio, GitHub). Defends against accidental
//    indexing if a JSON endpoint ever returns HTML, and against CDN
//    misconfig that proxies api.* responses to a crawl-allowed
//    hostname.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/api') {
    if (!res.getHeader('Cache-Control')) {
      res.setHeader('Cache-Control', 'no-store')
    }
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  }
  next()
})

// Webhook routes must stay ahead of JSON parsing/CSRF middleware because
// signature verification depends on the raw request body.
app.use('/api/webhooks', webhookRoutes)

// Stripe payment webhook also needs raw body for signature verification.
// Mount only the webhook sub-path here; the rest of payments mounts below.
app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  (req, res, next) => {
    // Forward to the payments router's webhook handler
    req.url = '/webhook'
    paymentsRoutes(req, res, next)
  },
)

// Video chunk upload must also bypass JSON parsing to receive raw binary data.
// This route uses express.raw() internally to handle 3MB binary chunks.
//
// SECURITY: csrfProtection MUST run on this route. Because it's mounted at the
// app level (above the global `app.use(csrfProtection)` call below), it would
// otherwise bypass CSRF entirely — a malicious page could replay the victim's
// session cookie + a forged uploadId to overwrite chunks. Unlike the Stripe
// webhook (which has signature verification), this route has no compensating
// control. The CSRF token lives in the X-CSRF-Token header, not the body, so
// it works correctly with the raw-body parser.
const videoUploadChunkHandler = (req, res, next) => {
  req.url = '/upload/chunk'
  videoRoutes(req, res, next)
}
app.post(
  '/api/video/upload/chunk',
  express.raw({ type: '*/*', limit: '3mb' }),
  csrfProtection,
  videoUploadChunkHandler,
)

// Parse JSON request bodies for auth and future API routes.
// 5mb limit matches the inputSanitizer per-field cap and accommodates
// imported HTML sheets, AI-generated sheets, and chunked-note bodies.
// Without this, the express default 100KB cap rejected any legitimate
// HTML import or AI sheet save with PayloadTooLargeError before the
// route ever ran.
// Strict content-type: only accept `application/json`. Without this,
// Express defaults match `application/*+json` and treat missing
// Content-Type as JSON, which lets attackers slip
// `application/x-www-form-urlencoded` past JSON-shaped validation.
// Routes that legitimately need urlencoded must opt in explicitly via
// their own `express.urlencoded()` middleware.
app.use(express.json({ limit: '5mb', type: 'application/json' }))

// Phase 5: reject payloads with null bytes, control chars, excessive
// nesting/length, or duplicate query params before they reach routes.
const inputSanitizer = require('./middleware/inputSanitizer')
app.use(inputSanitizer)

// Optional emergency write-guard for non-admin requests.
app.use(guardedMode)

// CSRF protection for cookie-authenticated session mutations.
app.use(csrfProtection)

// Attempt to decode auth token early so downstream global middleware
// (checkRestrictions) can see req.user. Non-fatal — if no valid token is
// present the request continues as unauthenticated.
app.use(optionalAuth)

// Block restricted users from write operations (posting, commenting, uploading).
// Skips GET/HEAD/OPTIONS, unauthenticated requests, and admin users.
app.use(checkRestrictions)

// Track user activity for active-users metrics.
// Runs after auth decode so req.user is available. Throttled internally.
app.use(trackActiveUser)

// Per-request latency metrics. Runs after auth so req.user is available.
// Buffers in memory and flushes to RequestMetric table every 30 seconds.
app.use(requestMetricsMiddleware)
startMetricsTimers()

// Audit logging for security-relevant write operations. Hooks into res 'finish'
// event — zero impact on response latency. Requires req.user from auth decode above.
app.use(auditMiddleware)

// Attach feature flag evaluation helper to every request.
app.use(featureFlagMiddleware)

// Attach API version headers to all responses.
app.use(apiVersion)

// Avatars and cover images are publicly retrievable. Study attachments stay
// behind auth-checked preview/download handlers.
app.use(
  '/uploads/avatars',
  express.static(AVATARS_DIR, {
    index: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'public, max-age=300')
    },
  }),
)

app.use(
  '/uploads/covers',
  express.static(COVERS_DIR, {
    index: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'public, max-age=300')
    },
  }),
)

app.use(
  '/uploads/school-logos',
  express.static(SCHOOL_LOGOS_DIR, {
    index: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'public, max-age=3600')
    },
  }),
)

// Content images embedded in rich text sheets — publicly accessible.
app.use(
  '/uploads/content-images',
  express.static(CONTENT_IMAGES_DIR, {
    index: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      // Prevent content from being framed or used as script
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'")
    },
  }),
)

// Note images — image attachments embedded in notes. Publicly retrievable
// because notes themselves can be public, and the upload route enforces
// auth + an image-only mime allowlist on write.
app.use(
  '/uploads/note-images',
  express.static(NOTE_IMAGES_DIR, {
    index: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'")
    },
  }),
)

// Group media — banner backgrounds, discussion attachments, and group
// resources uploaded via /api/study-groups/:id/resources/upload. The
// upload route enforces membership + a strict mime allowlist on write,
// so the served files are safe to expose under a hardened static handler.
app.use(
  '/uploads/group-media',
  express.static(GROUP_MEDIA_DIR, {
    index: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'")
    },
  }),
)

// Isolated preview surface. Auth cookies are scoped to /api and never sent here.
app.use('/preview', previewRoutes)

// Mount API documentation endpoint under /api/docs (public, no auth required).
app.use('/api/docs', docsRoutes)

// Mount authentication endpoints under /api/auth.
app.use('/api/auth', authRoutes)

// Mount course endpoints under /api/courses.
app.use('/api/courses', courseRoutes)

// Mount study sheet endpoints under /api/sheets.
app.use('/api/sheets', sheetRoutes)

// Mount Sheet Lab (version control) endpoints under /api/sheets/:id/lab.
app.use('/api/sheets', sheetLabRoutes)

// Mount feed endpoints under /api/feed.
app.use('/api/feed', feedRoutes)

// Mount dashboard summary endpoints under /api/dashboard.
app.use('/api/dashboard', dashboardRoutes)

// Mount upcoming-exams endpoints under /api/exams (Phase 2 of v2 design refresh).
// Frontend is flag-gated by `design_v2_upcoming_exams`; server keeps endpoints
// available to authenticated users so the flag flip is one-sided.
app.use('/api/exams', examRoutes)

// Achievements V2 (2026-04-30) — gallery, detail page, pinned strip, stats.
// Catalog endpoints are public (optionalAuth); pin / visibility writes require auth.
// Plan: docs/internal/audits/2026-04-30-achievements-v2-plan.md
app.use('/api/achievements', achievementsRoutes)

// Mount Creator Audit foundation endpoints. Frontend rollout remains flag-gated;
// the server keeps the owner-checked audit and consent primitives available.
app.use('/api/creator-audit', creatorAuditRoutes)

// Mount settings endpoints under /api/settings.
app.use('/api/settings', settingsRoutes)

// Mount announcements endpoints under /api/announcements.
app.use('/api/announcements', announcementRoutes)

// Mount admin endpoints under /api/admin.
app.use('/api/admin', adminRoutes)

// Mount moderation admin routes under /api/admin/moderation.
app.use('/api/admin/moderation', moderationAdminRoutes)

// Mount moderation user-facing routes under /api/moderation.
app.use('/api/moderation', moderationUserRoutes)

// Mount upload endpoints under /api/upload.
app.use('/api/upload', uploadRoutes)

// Mount notes endpoints under /api/notes.
app.use('/api/notes', notesRoutes)

// Mount notifications endpoints under /api/notifications.
app.use('/api/notifications', notificationsRoutes)

// Mount user profile endpoints under /api/users.
app.use('/api/users', usersRoutes)

// Mount legal document and acceptance endpoints under /api/legal.
app.use('/api/legal', legalRoutes)

// Mount unified search endpoints under /api/search.
app.use('/api/search', searchRoutes)

// Mount provenance manifest endpoints under /api/provenance.
app.use('/api/provenance', provenanceRoutes)

// Mount feature flag endpoints under /api/flags.
app.use('/api/flags', featureFlagRoutes)

// Mount WebAuthn passkey endpoints under /api/webauthn.
app.use('/api/webauthn', webauthnRoutes)

// Mount messaging endpoints under /api/messages.
app.use('/api/messages', messagingRoutes)

// Mount study groups endpoints under /api/study-groups.
app.use('/api/study-groups', studyGroupRoutes)

// Mount sharing (privacy controls v2) endpoints under /api/sharing.
app.use('/api/sharing', sharingRoutes)

// Hub AI assistant endpoints under /api/ai.
app.use('/api/ai', aiRoutes)

// Library module endpoints under /api/library.
app.use('/api/library', libraryRoutes)

// Scholar v1 endpoints under /api/scholar (master plan §18).
app.use('/api/scholar', scholarRoutes)

// Video module endpoints under /api/video.
app.use('/api/video', videoRoutes)

// Payments module endpoints under /api/payments (webhook handled above).
app.use('/api/payments', paymentsRoutes)

// Reviews module endpoints under /api/reviews.
app.use('/api/reviews', reviewsRoutes)
app.use('/api/gifs', gifsRoutes)

// Phase 4: Plagiarism detection user-facing endpoints.
app.use('/api/plagiarism', plagiarismRoutes)

// Study status sync (per-user sheet study tracking across devices).
app.use('/api/study-status', studyStatusRoutes)

// Onboarding module (7-step new user flow).
app.use('/api/onboarding', onboardingRoutes)

// Referral system (invite, track, resolve, rewards).
app.use('/api/referrals', referralRoutes)
app.use('/api/hashtags', hashtagsRoutes)

// Sections + Materials (Week 3 of v2 design refresh — teacher section-aware publishing).
// Frontend is gated by `design_v2_teach_sections`; server-side endpoints stay available
// to teacher accounts so the flag flip is one-sided and safe to roll back.
app.use('/api/sections', sectionsRoutes)
app.use('/api/materials', materialsRoutes)

// Waitlist module (Phase 0 — confirmation email + in-app notification + admin endpoints)
app.use('/api/waitlist', require('./modules/waitlist'))

// Public unauthenticated data endpoints (landing page stats, etc.).
app.use('/api/public', publicRoutes)

// Basic API health check.
app.get('/', (req, res) => {
  res.json({ message: 'StudyHub API is running' })
})

app.get('/health', async (req, res) => {
  const checks = { api: 'ok', database: 'ok' }
  let httpStatus = 200
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    checks.database = 'error'
    httpStatus = 503
  }
  checks.status = httpStatus === 200 ? 'healthy' : 'degraded'
  res.status(httpStatus).json(checks)
})

// Global error handler — catches unhandled route errors and prevents stack trace leakage.
// Express requires all 4 parameters to identify this as an error handler.
app.use((err, req, res, _next) => {
  captureError(err, { url: req.originalUrl, method: req.method })
  const statusCode = err.statusCode || err.status || 500
  // CORS preservation: if the request came from a trusted origin, re-emit
  // Access-Control-Allow-Origin + Allow-Credentials on the error response.
  // Without this, an error thrown by any route handler short-circuits the
  // cors middleware's response decoration and the browser sees a response
  // with no CORS headers → reports "CORS error" instead of the actual
  // status code. This matters for rate-limit 429s, validation 400s, and
  // anything that hits this handler. Vary: Origin is already set globally
  // upstream so caches won't mix origins.
  const requestOrigin = req.headers.origin
  if (requestOrigin) {
    const normalized = normalizeOrigin(requestOrigin)
    if (normalized && trustedOrigins.has(normalized)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
  }
  // Error responses must never be cached. Without this, Cloudflare can
  // cache a transient 500 and serve it to other origins for the cache TTL.
  res.setHeader('Cache-Control', 'no-store')
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error' : err.message || 'Something went wrong',
    ...(err.code ? { code: err.code } : {}),
  })
})

async function startServer() {
  validateSecrets()
  validateUploadStorage()
  await bootstrapRuntime()
  await validateEmailTransport({
    strict: String(process.env.EMAIL_STARTUP_STRICT || '').toLowerCase() === 'true',
  })

  const clamAvDisabled = String(process.env.CLAMAV_DISABLED || '').toLowerCase() === 'true'
  if (process.env.NODE_ENV === 'production' && clamAvDisabled) {
    throw new Error(
      '[security] CLAMAV_DISABLED must not be true in production. Attachment malware scanning is required.',
    )
  } else if (process.env.NODE_ENV !== 'test' && clamAvDisabled) {
    log.warn('CLAMAV_DISABLED=true; attachment malware scanning is bypassed.')
  }

  if (isGuardedModeEnabled()) {
    log.warn('Guarded mode is enabled; non-admin write actions are temporarily blocked.')
  }

  const server = http.createServer(app)
  initSocketIO(server)

  const instance = server.listen(PORT, () => {
    startHtmlArchiveScheduler()
    startModerationCleanupScheduler()
    startInactiveSessionScheduler()
    // Pre-warm library cache with popular books (non-blocking).
    // Also syncs to CachedBook DB table so fallback works when Google Books is unavailable.
    const {
      preloadPopularBooks,
      syncPopularBooksToDB,
    } = require('./modules/library/library.service')
    const { runWithHeartbeat } = require('./lib/jobs/heartbeat')
    preloadPopularBooks().catch(() => {})
    // Always trigger a background sync on startup regardless of existing data.
    // The upsert logic is idempotent -- it just refreshes existing records.
    runWithHeartbeat('library.sync_popular_books_boot', () => syncPopularBooksToDB(16))
    // Re-sync every 24 hours to keep the cache fresh across long-running deploys.
    // .unref() so the interval doesn't hold the process open during graceful
    // shutdown — the heartbeat wrapper still emits failure events to Sentry.
    setInterval(
      () => {
        runWithHeartbeat('library.sync_popular_books', () => syncPopularBooksToDB(16))
      },
      24 * 60 * 60 * 1000,
    ).unref()

    // Hub AI v2 — retention sweeper for AI document attachments. Runs every
    // 6h. Two-phase (mark soft-delete → drain to R2). Master plan §4.3 +
    // L5-CRIT-4. SLA 10 min.
    const { sweepAiAttachments } = require('./lib/jobs/aiAttachmentSweeper')
    setInterval(
      () => {
        runWithHeartbeat('ai.attachment_sweep', () => sweepAiAttachments(), {
          slaMs: 10 * 60_000,
        })
      },
      6 * 60 * 60 * 1000,
    ).unref()

    // Hub AI v2 — weekly Google Books corpus expansion. Master plan §3.3 +
    // L2-CRIT-1: runWithHeartbeat is INSIDE the arrow function, not
    // wrapping the setInterval itself.
    const { syncWeeklyCorpus } = require('./modules/library/library.weeklySync')
    setInterval(
      () => {
        runWithHeartbeat('library.weekly_corpus_sync', () => syncWeeklyCorpus(), {
          slaMs: 20 * 60_000,
        })
      },
      7 * 24 * 60 * 60 * 1000,
    ).unref()

    log.info({ port: PORT }, `Server running on http://localhost:${PORT}`)
  })

  // Store for graceful shutdown regardless of how startServer was invoked
  serverInstance = instance
  return instance
}

// ── Graceful Shutdown ─────────────────────────────────────────────────────
// When Railway (or any PaaS) redeploys, it sends SIGTERM to the process.
// Without this handler, in-flight requests (sheet saves, messages, uploads)
// are killed mid-execution causing data loss. This pattern:
// 1. Stops accepting new connections
// 2. Waits for in-flight requests to finish (up to 15s)
// 3. Disconnects all WebSocket clients cleanly
// 4. Closes the Prisma database connection pool
// 5. Exits cleanly
// Same pattern used by GitHub, Heroku, Vercel, and every serious Node.js app.
let serverInstance = null

function gracefulShutdown(signal) {
  log.info({ signal }, 'Received shutdown signal, starting graceful shutdown...')

  if (!serverInstance) {
    process.exit(0)
  }

  // Stop accepting new connections
  serverInstance.close(() => {
    log.info('HTTP server closed, cleaning up...')

    // Disconnect Prisma connection pool
    prisma
      .$disconnect()
      .catch(() => {})
      .finally(() => {
        log.info('Cleanup complete, exiting.')
        process.exit(0)
      })
  })

  // Force exit after 15 seconds if connections won't drain
  setTimeout(() => {
    log.error('Could not close connections in time, forcing exit.')
    process.exit(1)
  }, 15000).unref()
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

module.exports = { app, startServer }

if (require.main === module) {
  startServer()
    .then((server) => {
      serverInstance = server
    })
    .catch((error) => {
      captureError(error, { source: 'serverStartup' })
      console.error(error)
      process.exit(1)
    })
}
