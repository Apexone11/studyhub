const express = require('express')
const commitsController = require('./sheetLab.commits.controller')
const operationsController = require('./sheetLab.operations.controller')
const lineageController = require('./sheetLab.lineage.controller')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return readLimiter(req, res, next)
  return writeLimiter(req, res, next)
})

router.use('/', commitsController)
router.use('/', operationsController)
router.use('/', lineageController)

module.exports = router
