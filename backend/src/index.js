const express = require('express')
const cors = require('cors')
require('dotenv').config()
const { initSentry, captureError } = require('./monitoring/sentry')
const { bootstrapRuntime } = require('./lib/bootstrap')
const { validatePrismaEnvironment } = require('./lib/prisma')
const { UPLOADS_DIR, validateUploadStorage } = require('./lib/storage')
const csrfProtection = require('./middleware/csrf')

const sentryEnabled = initSentry()

const app = express()
const PORT = process.env.PORT || 4000
const authRoutes = require('./routes/auth')
const courseRoutes = require('./routes/courses')
const sheetRoutes = require('./routes/sheets')
const feedRoutes = require('./routes/feed')
const settingsRoutes = require('./routes/settings')
const announcementRoutes = require('./routes/announcements')
const adminRoutes = require('./routes/admin')
const uploadRoutes = require('./routes/upload')
const notesRoutes = require('./routes/notes')
const notificationsRoutes = require('./routes/notifications')
const usersRoutes = require('./routes/users')

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

if (isProd) {
  app.set('trust proxy', 1)
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
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

  return res.status(403).json({ error: 'Origin not allowed.' })
})

// Parse JSON request bodies for auth and future API routes.
app.use(express.json())

// CSRF protection for cookie-authenticated session mutations.
app.use(csrfProtection)

// Serve uploaded files (avatars, attachments) as static assets.
app.use('/uploads', express.static(UPLOADS_DIR, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
  },
}))

// Mount authentication endpoints under /api/auth.
app.use('/api/auth', authRoutes)

// Mount course endpoints under /api/courses.
app.use('/api/courses', courseRoutes)

// Mount study sheet endpoints under /api/sheets.
app.use('/api/sheets', sheetRoutes)

// Mount feed endpoints under /api/feed.
app.use('/api/feed', feedRoutes)

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

// Basic API health check.
app.get('/', (req, res) => {
    res.json({ message: 'StudyHub API is running ✅' })
})

app.get('/health', (req, res) => {
    res.json({ status: 'ok' })
})

async function startServer() {
  validatePrismaEnvironment()
  validateUploadStorage()
  await bootstrapRuntime()

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

startServer().catch((error) => {
  captureError(error, { source: 'serverStartup' })
  console.error(error)
  process.exit(1)
})


