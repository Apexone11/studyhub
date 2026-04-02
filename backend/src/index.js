const express = require('express')
const compression = require('compression')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const helmet = require('helmet')
const http = require('http')
const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })
const { initSentry, captureError } = require('./monitoring/sentry')
const { bootstrapRuntime } = require('./lib/bootstrap/bootstrap')
const { validateEmailTransport } = require('./lib/email/email')
const { startHtmlArchiveScheduler } = require('./lib/html/htmlArchiveScheduler')
const { startModerationCleanupScheduler } = require('./lib/moderation/moderationCleanupScheduler')
const { AVATARS_DIR, CONTENT_IMAGES_DIR, COVERS_DIR, SCHOOL_LOGOS_DIR, validateUploadStorage } = require('./lib/storage')
const csrfProtection = require('./middleware/csrf')
const { guardedMode, isGuardedModeEnabled } = require('./middleware/guardedMode')
const checkRestrictions = require('./middleware/checkRestrictions')
const auditMiddleware = require('./middleware/auditMiddleware')
const { getAuthTokenFromRequest, validateSecrets, verifyAuthToken } = require('./lib/authTokens')
const { ERROR_CODES, sendError } = require('./middleware/errorEnvelope')
const prisma = require('./lib/prisma')

const sentryEnabled = initSentry()

const app = express()
const PORT = process.env.PORT || 4000
const apiVersion = require('./middleware/apiVersion')
const authRoutes = require('./modules/auth')
const courseRoutes = require('./modules/courses')
const sheetRoutes = require('./modules/sheets')
const feedRoutes = require('./modules/feed')
const dashboardRoutes = require('./modules/dashboard')
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
const { adminRouter: moderationAdminRoutes, userRouter: moderationUserRoutes } = require('./modules/moderation')
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
const { initSocketIO } = require('./lib/socketio')
const { featureFlagMiddleware } = require('./lib/featureFlags')

if (sentryEnabled) {
    console.log('Sentry monitoring enabled for backend.')
}

process.on('uncaughtException', (error) => {
    captureError(error, { source: 'uncaughtException' })
    console.error(error)
})

process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    captureError(error, { source: 'unhandledRejection' })
    console.error(error)
})

// Dynamic CORS: dev allows Vite dev/preview servers; production allows primary and alternate frontend URLs.
const isProd = process.env.NODE_ENV === 'production'
const allowedOrigins = isProd
  ? [
      process.env.FRONTEND_URL,
      process.env.FRONTEND_URL_ALT,
    ].filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:4173']

// In production, also allow www / non-www variants of each origin automatically.
if (isProd) {
  for (const url of [...allowedOrigins]) {
    try {
      const parsed = new URL(url)
      if (parsed.hostname.startsWith('www.')) {
        allowedOrigins.push(url.replace('www.', ''))
      } else {
        allowedOrigins.push(`${parsed.protocol}//www.${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}`)
      }
    } catch { /* skip malformed */ }
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
  allowedOrigins
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean)
)

const appSurfaceCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'none'",
  "media-src 'self'",
  "object-src 'none'",
  "script-src 'none'",
  "style-src 'none'",
].join('; ')

const previewFrameAncestors = Array.from(trustedOrigins)
const previewSurfaceCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  `frame-ancestors ${previewFrameAncestors.length > 0 ? previewFrameAncestors.join(' ') : "'none'"}`,
  "form-action 'none'",
  "connect-src 'none'",
  "img-src data: blob: https:",
  "font-src data: blob: https://fonts.gstatic.com",
  "media-src data: blob:",
  "object-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-elem 'unsafe-inline' https://fonts.googleapis.com",
].join('; ')

app.disable('x-powered-by')

// Gzip/Brotli compression for all text-based responses.
app.use(compression())

if (isProd) {
  app.set('trust proxy', 1)
}

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  hsts: isProd,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}))

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

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    const normalizedOrigin = normalizeOrigin(origin)
    if (normalizedOrigin && trustedOrigins.has(normalizedOrigin)) {
      return callback(null, true)
    }
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))

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

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/' || req.path === '/health' || req.path.startsWith('/uploads/avatars/'),
})

app.use(globalLimiter)

// Webhook routes must stay ahead of JSON parsing/CSRF middleware because
// signature verification depends on the raw request body.
app.use('/api/webhooks', webhookRoutes)

// Parse JSON request bodies for auth and future API routes.
app.use(express.json())

// Optional emergency write-guard for non-admin requests.
app.use(guardedMode)

// CSRF protection for cookie-authenticated session mutations.
app.use(csrfProtection)

// Attempt to decode auth token early so downstream global middleware
// (checkRestrictions) can see req.user. Non-fatal — if no valid token is
// present the request continues as unauthenticated.
app.use((req, _res, next) => {
  if (req.user) return next()
  const token = getAuthTokenFromRequest(req)
  if (!token) return next()
  try {
    req.user = verifyAuthToken(token)
  } catch { /* invalid/expired — proceed unauthenticated */ }
  next()
})

// Block restricted users from write operations (posting, commenting, uploading).
// Skips GET/HEAD/OPTIONS, unauthenticated requests, and admin users.
app.use(checkRestrictions)

// Audit logging for security-relevant write operations. Hooks into res 'finish'
// event — zero impact on response latency. Requires req.user from auth decode above.
app.use(auditMiddleware)

// Attach feature flag evaluation helper to every request.
app.use(featureFlagMiddleware)

// Attach API version headers to all responses.
app.use(apiVersion)

// Avatars and cover images are publicly retrievable. Study attachments stay
// behind auth-checked preview/download handlers.
app.use('/uploads/avatars', express.static(AVATARS_DIR, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'public, max-age=300')
  },
}))

app.use('/uploads/covers', express.static(COVERS_DIR, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'public, max-age=300')
  },
}))

app.use('/uploads/school-logos', express.static(SCHOOL_LOGOS_DIR, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'public, max-age=3600')
  },
}))

// Content images embedded in rich text sheets — publicly accessible.
app.use('/uploads/content-images', express.static(CONTENT_IMAGES_DIR, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    // Prevent content from being framed or used as script
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'")
  },
}))

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

// Waitlist (simple inline route for pricing page)
app.post('/api/waitlist', express.json(), async (req, res) => {
  try {
    const { email, tier } = req.body || {}
    if (!email || !tier) return res.status(400).json({ error: 'Email and tier are required.' })
    if (!['pro', 'institution'].includes(tier)) return res.status(400).json({ error: 'Invalid tier.' })
    if (typeof email !== 'string' || !email.includes('@') || email.length > 320) {
      return res.status(400).json({ error: 'Invalid email address.' })
    }
    await prisma.waitlist.create({ data: { email: email.trim().toLowerCase(), tier } })
    res.json({ message: 'You have been added to the waitlist.' })
  } catch (err) {
    if (err.code === 'P2002') return res.json({ message: 'You are already on the waitlist.' })
    console.error('[waitlist]', err.message)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
})

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
    res.status(statusCode).json({
      error: statusCode >= 500 ? 'Internal server error' : (err.message || 'Something went wrong'),
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
    throw new Error('[security] CLAMAV_DISABLED must not be true in production. Attachment malware scanning is required.')
  } else if (process.env.NODE_ENV !== 'test' && clamAvDisabled) {
    console.warn('[security-warning] CLAMAV_DISABLED=true; attachment malware scanning is bypassed.')
  }

  if (isGuardedModeEnabled()) {
    console.warn('[ops-warning] Guarded mode is enabled; non-admin write actions are temporarily blocked.')
  }

  const server = http.createServer(app)
  initSocketIO(server)

  return server.listen(PORT, () => {
    startHtmlArchiveScheduler()
    startModerationCleanupScheduler()
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

if (require.main === module) {
  startServer().catch((error) => {
    captureError(error, { source: 'serverStartup' })
    console.error(error)
    process.exit(1)
  })
}

module.exports = app
module.exports.startServer = startServer
