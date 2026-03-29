const express = require('express')
const requireAuth = require('../../middleware/auth')
const { authLimiter, feedReadLimiter } = require('./feed.constants')
const listController = require('./feed.list.controller')
const postsController = require('./feed.posts.controller')
const socialController = require('./feed.social.controller')
const discoveryController = require('./feed.discovery.controller')

const router = express.Router()

// Discovery endpoints handle their own auth (optional for trending/course, required for recommended).
// Mounted before global auth gate so public trending works for unauthenticated visitors.
router.use(discoveryController)

router.use(authLimiter)
router.use(requireAuth)
router.use(feedReadLimiter)

router.use(listController)
router.use(postsController)
router.use(socialController)

module.exports = router
