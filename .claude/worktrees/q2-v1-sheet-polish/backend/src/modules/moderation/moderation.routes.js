const express = require('express')
const requireAuth = require('../../middleware/auth')
const requireAdmin = require('../../middleware/requireAdmin')
const adminCasesController = require('./moderation.admin.cases.controller')
const adminEnforcementController = require('./moderation.admin.enforcement.controller')
const userController = require('./moderation.user.controller')

const adminRouter = express.Router()
adminRouter.use(requireAuth)
adminRouter.use(requireAdmin)
adminRouter.use('/', adminCasesController)
adminRouter.use('/', adminEnforcementController)

const userRouter = express.Router()
userRouter.use(requireAuth)
userRouter.use('/', userController)

module.exports = { adminRouter, userRouter }
