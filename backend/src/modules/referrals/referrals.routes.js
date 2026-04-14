const { Router } = require('express')
const requireAuth = require('../../middleware/auth')
const { referralInviteLimiter, referralResolveLimiter } = require('../../lib/rateLimiters')
const controller = require('./referrals.controller')

const router = Router()

router.get('/me', requireAuth, controller.getMyReferrals)
router.post('/invite', requireAuth, referralInviteLimiter, controller.sendInvites)
router.post('/track-share', requireAuth, controller.trackShare)
router.get('/resolve/:code', referralResolveLimiter, controller.resolveCode)

module.exports = router
