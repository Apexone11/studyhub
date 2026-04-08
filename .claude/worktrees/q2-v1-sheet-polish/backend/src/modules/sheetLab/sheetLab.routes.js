const express = require('express')
const commitsController = require('./sheetLab.commits.controller')
const operationsController = require('./sheetLab.operations.controller')
const lineageController = require('./sheetLab.lineage.controller')

const router = express.Router()

router.use('/', commitsController)
router.use('/', operationsController)
router.use('/', lineageController)

module.exports = router
