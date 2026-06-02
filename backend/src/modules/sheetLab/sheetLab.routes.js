const express = require('express')
const commitsController = require('./sheetLab.commits.controller')
const operationsController = require('./sheetLab.operations.controller')
const lineageController = require('./sheetLab.lineage.controller')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const originAllowlist = require('../../middleware/originAllowlist')

const router = express.Router()

router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return readLimiter(req, res, next)
  return writeLimiter(req, res, next)
})

// CLAUDE.md A11 — this module owns content-write routes (lab commits,
// sync-upstream, restore) but is mounted as its own router separate from the
// main /api/sheets router, so it must opt into the fail-closed Origin
// allowlist itself. originAllowlist() short-circuits GET/HEAD/OPTIONS, so the
// lineage read routes are unaffected.
router.use(originAllowlist())

router.use('/', commitsController)
router.use('/', operationsController)
router.use('/', lineageController)

module.exports = router
