const express = require('express')
const { authLimiter } = require('../../lib/rateLimiters')
const registerController = require('./auth.register.controller')
const loginController = require('./auth.login.controller')
const passwordController = require('./auth.password.controller')
const googleController = require('./auth.google.controller')
const sessionController = require('./auth.session.controller')

const router = express.Router()

// Rate limit all auth endpoints — 15 req / 15 min per IP.
router.use(authLimiter)

router.use(registerController)
router.use(loginController)
router.use(passwordController)
router.use(googleController)
router.use(sessionController)

module.exports = router
