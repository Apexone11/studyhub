const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 4000
const authRoutes = require('./routes/auth')

// Allow the local frontend to call this API with credentials.
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))

// Parse JSON request bodies for auth and future API routes.
app.use(express.json())

// Mount authentication endpoints under /api/auth.
app.use('/api/auth', authRoutes)

// Basic API health check.
app.get('/', (req, res) => {
    res.json({ message: 'StudyHub API is running ✅' })
})

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})


