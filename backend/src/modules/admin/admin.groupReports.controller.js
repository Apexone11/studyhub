/**
 * admin.groupReports.controller.js — Phase 5 admin review queue.
 *
 * Mounted under the existing /api/admin prefix, so the full route
 * shapes are:
 *   GET   /api/admin/group-reports
 *   PATCH /api/admin/group-reports/:id
 *
 * Admin-only (the admin router already applies requireAdmin above).
 */
const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const reportsService = require('../studyGroups/studyGroups.reports.service')

const router = express.Router()

/**
 * GET /api/admin/group-reports
 * Query params:
 *   status — 'pending' (default) | 'dismissed' | 'warned' | 'locked' | 'deleted' | 'escalated' | 'all'
 *   limit  — pagination cap (default 50, max 100)
 *   offset — pagination offset (default 0)
 */
router.get('/group-reports', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending'
    const limitRaw = Number.parseInt(req.query.limit, 10)
    const offsetRaw = Number.parseInt(req.query.offset, 10)
    const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50, 100)
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0

    const result = await reportsService.listReports({ status, limit, offset })
    res.json(result)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /api/admin/group-reports/:id
 * Body: { action: 'dismiss' | 'warn' | 'lock' | 'delete', resolution?: string }
 */
router.patch('/group-reports/:id', async (req, res) => {
  try {
    const reportId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID.' })
    }

    const { action, resolution } = req.body || {}
    const result = await reportsService.resolveReport({
      reportId,
      actorId: req.user.userId,
      action,
      resolution,
      req,
    })

    res.json({
      message: `Report ${action} applied.`,
      ...result,
    })
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code || 'ERROR' })
    }
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
