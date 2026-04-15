const express = require('express')
const requireAuth = require('../../middleware/auth')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const controller = require('./hashtags.controller')

const router = express.Router()

router.get('/me', requireAuth, readLimiter, controller.listMyFollows)
router.post('/follow', requireAuth, writeLimiter, controller.followHashtag)
router.delete('/:name/follow', requireAuth, writeLimiter, controller.unfollowHashtag)

module.exports = router
