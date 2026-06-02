const express = require('express')
const requireAuth = require('../../middleware/auth')
const requireAdmin = require('../../middleware/requireAdmin')
const originAllowlist = require('../../middleware/originAllowlist')
const adminCasesController = require('./moderation.admin.cases.controller')
const adminEnforcementController = require('./moderation.admin.enforcement.controller')
const userController = require('./moderation.user.controller')
const { writeLimiter } = require('../../lib/rateLimiters')

// CSRF defense-in-depth — every write under both routers must carry a
// trusted Origin / Referer (CLAUDE.md A11). originAllowlist() short-
// circuits GET/HEAD/OPTIONS so attaching it at the router level is
// safe for read endpoints too. Mirrors admin.routes.js.
const requireTrustedOrigin = originAllowlist()

const adminRouter = express.Router()
adminRouter.use(requireAuth)
adminRouter.use(requireAdmin)
adminRouter.use(requireTrustedOrigin)
adminRouter.use(writeLimiter)
adminRouter.use('/', adminCasesController)
adminRouter.use('/', adminEnforcementController)

const userRouter = express.Router()
userRouter.use(requireAuth)
userRouter.use(requireTrustedOrigin)
userRouter.use(writeLimiter)
userRouter.use('/', userController)

module.exports = { adminRouter, userRouter }
