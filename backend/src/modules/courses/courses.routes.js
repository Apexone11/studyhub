const express = require('express')
const coursesController = require('./courses.controller')
const schoolsController = require('./courses.schools.controller')
const originAllowlist = require('../../middleware/originAllowlist')
const { readLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

// CLAUDE.md A11 — CSRF defense-in-depth on writes (POST /request). Short-circuits
// GET/HEAD/OPTIONS, so applying at router.use is safe for this mixed read+write surface.
router.use(originAllowlist())

router.use(readLimiter)

router.use('/', coursesController)
router.use('/', schoolsController)

module.exports = router
