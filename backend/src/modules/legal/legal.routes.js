const express = require('express')
const requireAuth = require('../../middleware/auth')
const controller = require('./legal.controller')

const router = express.Router()

router.get('/current', controller.getCurrentDocuments)
router.get('/current/:slug', controller.getCurrentDocumentBySlug)
router.get('/me/status', requireAuth, controller.getMyLegalStatus)
router.post('/me/accept-current', requireAuth, controller.acceptMyCurrentLegalDocuments)

module.exports = router
