const express = require('express')
const commitsController = require('./sheetLab.commits.controller')
const operationsController = require('./sheetLab.operations.controller')

const router = express.Router()

router.use('/', commitsController)
router.use('/', operationsController)

module.exports = router
