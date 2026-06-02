const express = require('express')
const { adminLimiter } = require('../../lib/rateLimiters')
const requireAuth = require('../../middleware/auth')
const requireAdmin = require('../../middleware/requireAdmin')
const originAllowlist = require('../../middleware/originAllowlist')
const usersController = require('./admin.users.controller')
const emailController = require('./admin.email.controller')
const sheetsController = require('./admin.sheets.controller')
const contentController = require('./admin.content.controller')
const schoolsController = require('./admin.schools.controller')
const kmsController = require('./admin.kms.controller')
const auditController = require('./admin.audit.controller')
const cacheController = require('./admin.cache.controller')
const plagiarismController = require('./admin.plagiarism.controller')
const analyticsController = require('./admin.analytics.controller')
const groupReportsController = require('./admin.groupReports.controller')
const waitlistController = require('./admin.waitlist.controller')
const securityController = require('./admin.security.controller')
const growthController = require('./admin.growth.controller')

const router = express.Router()

// All admin routes require auth + admin role
router.use(requireAuth)
router.use(requireAdmin)
router.use(adminLimiter)
// Defense-in-depth origin check on every admin write. The global
// Origin check in index.js is the floor; admin actions are the
// highest-value CSRF target on the platform so the module re-runs
// the allowlist at its router boundary. Safe methods short-circuit
// per the originAllowlist middleware. CLAUDE.md A11.
router.use(originAllowlist())

router.use(usersController)
router.use(emailController)
router.use(sheetsController)
router.use(contentController)
router.use(schoolsController)
router.use(kmsController)
router.use(auditController)
router.use(cacheController)
router.use(plagiarismController)
router.use(analyticsController)
router.use(groupReportsController)
router.use(waitlistController)
router.use(securityController)
router.use(growthController)

module.exports = router
