const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 4000
const authRoutes = require('./routes/auth')

// middleware
app.use(cors({ origin: 'Http://localhost:5173', credentials: true}))
app.use(express.json())
app.use('/api/auth', authRoutes)

//Health check route
app.get('/', (req, res) => {
    res.json({ message: 'StudyHub API is running ✅'})
})

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})


