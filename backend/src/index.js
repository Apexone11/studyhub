const express = require('express')
const cors = require('cors')
require('dotenv').config()
const { initSentry, captureError } = require('./monitoring/sentry')

const sentryEnabled = initSentry()

const app = express()
const PORT = process.env.PORT || 4000
const authRoutes = require('./routes/auth')
const courseRoutes = require('./routes/courses')
const sheetRoutes = require('./routes/sheets')

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

// Allow the local frontend to call this API with credentials.
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))

// Parse JSON request bodies for auth and future API routes.
app.use(express.json())

// Mount authentication endpoints under /api/auth.
app.use('/api/auth', authRoutes)

// Mount course endpoints under /api/courses.
app.use('/api/courses', courseRoutes)

// Mount study sheet endpoints under /api/sheets.
app.use('/api/sheets', sheetRoutes)

// Basic API health check.
app.get('/', (req, res) => {
    res.json({ message: 'StudyHub API is running ✅' })
})

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})


