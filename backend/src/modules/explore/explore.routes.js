/**
 * explore.routes.js — G2-3 Explore tab. Mounted at /api/explore.
 *
 * Cross-school, read-only discovery. Gated behind flag_explore_tab
 * (fail-closed: returns 503 when the flag row is missing/off — CLAUDE.md §12).
 * optionalAuth so signed-out visitors can browse; an authed viewer's blocked
 * users are filtered out in the service.
 */
const express = require('express')
const optionalAuth = require('../../core/auth/optionalAuth')
const { readLimiter } = require('../../lib/rateLimiters')
const { requireFeatureFlag } = require('../../middleware/featureFlagGate')
const controller = require('./explore.controller')

const router = express.Router()

router.use(requireFeatureFlag('flag_explore_tab'))
router.use(readLimiter)
router.use(optionalAuth)

router.get('/sheets', controller.listSheets)
router.get('/trending', controller.trending)
router.get('/notes', controller.listNotes)
router.get('/study-groups', controller.listStudyGroups)
router.get('/topics', controller.listTopics)

module.exports = router
