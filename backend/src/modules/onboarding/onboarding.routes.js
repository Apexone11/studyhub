const { Router } = require('express')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const { onboardingWriteLimiter } = require('../../lib/rateLimiters')
const controller = require('./onboarding.controller')

const router = Router()

// CLAUDE.md A11: defense-in-depth CSRF check on writes (short-circuits GET/HEAD/OPTIONS).
router.use(originAllowlist())

router.get('/state', requireAuth, controller.getOnboardingState)
router.post('/step', requireAuth, onboardingWriteLimiter, controller.submitStep)
router.post('/complete', requireAuth, onboardingWriteLimiter, controller.completeOnboarding)
router.post('/skip', requireAuth, onboardingWriteLimiter, controller.skipOnboarding)

module.exports = router
