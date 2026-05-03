const express = require('express')
const requireAuth = require('../../middleware/auth')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const controller = require('./hashtags.controller')

const router = express.Router()

router.get('/me', requireAuth, readLimiter, controller.listMyFollows)
// Catalog is public-readable (it's curated content, not user data) so the
// signup / onboarding flows can render the picker before the session is
// established. Read-tier limit prevents catalog scraping.
router.get('/catalog', readLimiter, controller.listCatalog)
router.post('/follow', requireAuth, writeLimiter, controller.followHashtag)
router.delete('/:name/follow', requireAuth, writeLimiter, controller.unfollowHashtag)

module.exports = router
