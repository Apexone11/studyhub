const express = require('express')
const requireAuth = require('../../middleware/auth')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const { cacheControl } = require('../../lib/cacheControl')
const controller = require('./hashtags.controller')

const router = express.Router()

router.get('/me', requireAuth, readLimiter, controller.listMyFollows)
// Catalog is public-readable (it's curated content, not user data) so the
// signup / onboarding flows can render the picker before the session is
// established. Read-tier limit prevents catalog scraping.
// 5-min browser cache (private — no shared CDN cache per the
// Cloudflare/Vary caveat in courses.schools.controller.js). The catalog
// changes only via admin curation; a 5-min staleness budget is cheap
// for the signup/onboarding flow that re-hits this on every page load.
router.get(
  '/catalog',
  cacheControl(300, { staleWhileRevalidate: 600 }),
  readLimiter,
  controller.listCatalog,
)
router.post('/follow', requireAuth, writeLimiter, controller.followHashtag)
router.delete('/:name/follow', requireAuth, writeLimiter, controller.unfollowHashtag)

module.exports = router
