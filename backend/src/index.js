const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const helmet = require('helmet')
const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })
const { initSentry, captureError } = require('./monitoring/sentry')
const { bootstrapRuntime } = require('./lib/bootstrap')
const { validateEmailTransport } = require('./lib/email')
const { startHtmlArchiveScheduler } = require('./lib/htmlArchiveScheduler')
const { AVATARS_DIR, validateUploadStorage } = require('./lib/storage')
const csrfProtection = require('./middleware/csrf')
const { guardedMode, isGuardedModeEnabled } = require('./middleware/guardedMode')
const { ERROR_CODES, sendError } = require('./middleware/errorEnvelope')

const sentryEnabled = initSentry()

const app = express()
const PORT = process.env.PORT || 4000
const authRoutes = require('./routes/auth')
const courseRoutes = require('./routes/courses')
const sheetRoutes = require('./routes/sheets')
const feedRoutes = require('./routes/feed')
const dashboardRoutes = require('./routes/dashboard')
const settingsRoutes = require('./routes/settings')
const announcementRoutes = require('./routes/announcements')
const adminRoutes = require('./routes/admin')
const uploadRoutes = require('./routes/upload')
const notesRoutes = require('./routes/notes')
const notificationsRoutes = require('./routes/notifications')
const usersRoutes = require('./routes/users')
const previewRoutes = require('./routes/preview')
const searchRoutes = require('./routes/search')
const webhookRoutes = require('./routes/webhooks')

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
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "object-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
].join('; ')

app.disable('x-powered-by')

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

// Only avatars remain publicly retrievable. Study attachments now stay behind
// auth-checked preview/download handlers.
app.use('/uploads/avatars', express.static(AVATARS_DIR, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'public, max-age=300')
  },
}))

// Isolated preview surface. Auth cookies are scoped to /api and never sent here.
app.use('/preview', previewRoutes)

// Mount authentication endpoints under /api/auth.
app.use('/api/auth', authRoutes)

// Mount course endpoints under /api/courses.
app.use('/api/courses', courseRoutes)

// Mount study sheet endpoints under /api/sheets.
app.use('/api/sheets', sheetRoutes)

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

// Basic API health check.
app.get('/', (req, res) => {
    res.json({ message: 'StudyHub API is running ✅' })
})

app.get('/health', (req, res) => {
    res.json({ status: 'ok' })
})

async function startServer() {
  validateUploadStorage()
  await bootstrapRuntime()
  await validateEmailTransport({
    strict: String(process.env.EMAIL_STARTUP_STRICT || '').toLowerCase() === 'true',
  })

  const clamAvDisabled = String(process.env.CLAMAV_DISABLED || '').toLowerCase() === 'true'
  if (process.env.NODE_ENV !== 'test' && clamAvDisabled) {
    console.warn('[security-warning] CLAMAV_DISABLED=true; attachment malware scanning is bypassed.')
  }

  if (isGuardedModeEnabled()) {
    console.warn('[ops-warning] Guarded mode is enabled; non-admin write actions are temporarily blocked.')
  }

  return app.listen(PORT, () => {
    startHtmlArchiveScheduler()
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
