/**
 * AI module barrel — composes the chat routes with the suggestion,
 * attachment, sheet, and note sub-routers onto a single Express router so
 * the top-level mount in src/index.js stays one line: `app.use('/api/ai', ...)`.
 */
const express = require('express')
const aiRoutes = require('./ai.routes')
const suggestionRoutes = require('./ai.suggestions.routes')
const attachmentsRoutes = require('./attachments/attachments.routes')
const sheetAiRoutes = require('./ai.sheet.routes')
const notesAiRoutes = require('./ai.notes.routes')

const router = express.Router()
router.use('/', aiRoutes)
router.use('/suggestions', suggestionRoutes)
router.use('/attachments', attachmentsRoutes)
router.use('/sheets', sheetAiRoutes)
router.use('/notes', notesAiRoutes)

module.exports = router
