/**
 * AI module barrel — composes the chat routes (existing) with the
 * Phase 3 suggestion routes onto a single Express router so the
 * top-level mount in src/index.js stays one line: `app.use('/api/ai', ...)`.
 */
const express = require('express')
const aiRoutes = require('./ai.routes')
const suggestionRoutes = require('./ai.suggestions.routes')
const attachmentsRoutes = require('./attachments/attachments.routes')

const router = express.Router()
router.use('/', aiRoutes)
router.use('/suggestions', suggestionRoutes)
router.use('/attachments', attachmentsRoutes)

module.exports = router
