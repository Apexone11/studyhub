const express = require('express')
const { writeLimiter } = require('../../lib/rateLimiters')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const accountController = require('./settings.account.controller')
const emailController = require('./settings.email.controller')
const preferencesController = require('./settings.preferences.controller')
const googleController = require('./settings.google.controller')
const exportController = require('./settings.export.controller')
const auditController = require('./settings.audit.controller')
const recoveryCodesController = require('./settings.recoveryCodes.controller')

const router = express.Router()

// Settings module mutates account state (password, username, deletion,
// recovery codes, preferences). Origin allowlist on the router so every
// PATCH/POST/DELETE inherits CSRF defense-in-depth — the global Origin
// check passes empty-Origin requests; this layer rejects them on the
// most sensitive surface.
router.use(requireAuth)
router.use(originAllowlist())
router.use(writeLimiter)
router.use('/', accountController)
router.use('/', emailController)
router.use('/', preferencesController)
router.use('/', googleController)
router.use('/', exportController)
router.use('/', auditController)
router.use('/', recoveryCodesController)

module.exports = router
