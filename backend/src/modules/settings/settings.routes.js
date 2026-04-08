const express = require('express')
const { writeLimiter } = require('../../lib/rateLimiters')
const requireAuth = require('../../middleware/auth')
const accountController = require('./settings.account.controller')
const emailController = require('./settings.email.controller')
const preferencesController = require('./settings.preferences.controller')
const googleController = require('./settings.google.controller')
const exportController = require('./settings.export.controller')
const auditController = require('./settings.audit.controller')

const router = express.Router()

router.use(requireAuth)
router.use(writeLimiter)
router.use('/', accountController)
router.use('/', emailController)
router.use('/', preferencesController)
router.use('/', googleController)
router.use('/', exportController)
router.use('/', auditController)

module.exports = router
