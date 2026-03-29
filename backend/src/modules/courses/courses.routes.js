const express = require('express')
const coursesController = require('./courses.controller')
const schoolsController = require('./courses.schools.controller')
const { readLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

router.use(readLimiter)

router.use('/', coursesController)
router.use('/', schoolsController)

module.exports = router
