const express = require('express')
const { authLimiter } = require('../../lib/rateLimiters')
const registerController = require('./auth.register.controller')
const loginController = require('./auth.login.controller')
const loginChallengeController = require('./login.challenge.controller')
const loginRecoveryController = require('./login.recovery.controller')
const passwordController = require('./auth.password.controller')
const googleController = require('./auth.google.controller')
const sessionController = require('./auth.session.controller')
const revokeLinkController = require('./revokeLink.controller')
const reauthController = require('./reauth.controller')
const panicController = require('./panic.controller')

const router = express.Router()

// Rate limit all auth endpoints — 15 req / 15 min per IP.
router.use(authLimiter)

router.use(registerController)
router.use(loginController)
router.use(loginChallengeController)
router.use(loginRecoveryController)
router.use(passwordController)
router.use(googleController)
router.use(sessionController)
router.use(revokeLinkController)
router.use(reauthController)
router.use(panicController)

module.exports = router
