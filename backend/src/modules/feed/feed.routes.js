const express = require('express')
const requireAuth = require('../../middleware/auth')
const { authLimiter, feedReadLimiter } = require('./feed.constants')
const listController = require('./feed.list.controller')
const postsController = require('./feed.posts.controller')
const socialController = require('./feed.social.controller')
const discoveryController = require('./feed.discovery.controller')
const leaderboardController = require('./feed.leaderboard.controller')

const router = express.Router()

// Leaderboard is public — no auth required
router.use(leaderboardController)

// Discovery endpoints (trending is public, recommended/for-you need auth via their own middleware)
router.use(discoveryController)

router.use(authLimiter)
router.use(requireAuth)
router.use(feedReadLimiter)

router.use(listController)
router.use(postsController)
router.use(socialController)

module.exports = router
