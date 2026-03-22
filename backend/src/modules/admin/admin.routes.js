const express = require('express')
const requireAuth = require('../../middleware/auth')
const requireAdmin = require('../../middleware/requireAdmin')
const usersController = require('./admin.users.controller')
const emailController = require('./admin.email.controller')
const sheetsController = require('./admin.sheets.controller')
const contentController = require('./admin.content.controller')

const router = express.Router()

// All admin routes require auth + admin role
router.use(requireAuth)
router.use(requireAdmin)

router.use(usersController)
router.use(emailController)
router.use(sheetsController)
router.use(contentController)

module.exports = router
