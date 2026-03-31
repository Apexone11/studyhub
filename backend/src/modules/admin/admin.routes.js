const express = require('express')
const { adminLimiter } = require('../../lib/rateLimiters')
const requireAuth = require('../../middleware/auth')
const requireAdmin = require('../../middleware/requireAdmin')
const usersController = require('./admin.users.controller')
const emailController = require('./admin.email.controller')
const sheetsController = require('./admin.sheets.controller')
const contentController = require('./admin.content.controller')
const schoolsController = require('./admin.schools.controller')
const kmsController = require('./admin.kms.controller')
const auditController = require('./admin.audit.controller')
const cacheController = require('./admin.cache.controller')
const plagiarismController = require('./admin.plagiarism.controller')

const router = express.Router()

// All admin routes require auth + admin role
router.use(requireAuth)
router.use(requireAdmin)
router.use(adminLimiter)

router.use(usersController)
router.use(emailController)
router.use(sheetsController)
router.use(contentController)
router.use(schoolsController)
router.use(kmsController)
router.use(auditController)
router.use(cacheController)
router.use(plagiarismController)

module.exports = router
