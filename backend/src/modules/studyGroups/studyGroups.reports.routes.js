/**
 * studyGroups.reports.routes.js — Phase 5 report + appeal endpoints.
 *
 * Mounted under /api/study-groups so route shapes are:
 *   POST   /api/study-groups/:id/report
 *   POST   /api/study-groups/:id/appeal
 *   GET    /api/admin/group-reports        (admin queue — separate mount in admin module)
 *   PATCH  /api/admin/group-reports/:id    (admin resolution — separate mount)
 *
 * The member-facing routes live here; the admin routes are mounted
 * separately in the admin module so the existing /api/admin prefix
 * middleware (role checks, audit) stays in one place.
 */
const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { readLimiter, groupReportLimiter, groupAppealLimiter } = require('../../lib/rateLimiters')
const { parseId } = require('./studyGroups.helpers')
const reportsService = require('./studyGroups.reports.service')

const router = express.Router({ mergeParams: true })

/**
 * POST /:id/report — file a report against a group.
 */
router.post('/report', groupReportLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    const { reason, details, attachments } = req.body || {}
    const report = await reportsService.createReport({
      groupId,
      reporterId: req.user.userId,
      reason,
      details,
      attachments,
      req,
    })

    res.status(201).json({
      id: report.id,
      status: report.status,
      message: 'Thanks. We will review this report. You will stop seeing this group in your feed.',
    })
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code || 'ERROR',
      })
    }
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /:id/appeal — group owner appeals a warn/lock/delete action.
 * One appeal per (group, user). Final decision is admin-only.
 */
router.post('/appeal', groupAppealLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    const group = await prisma.studyGroup.findUnique({
      where: { id: groupId },
      select: { id: true, createdById: true, moderationStatus: true, name: true },
    })
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' })
    }
    if (group.createdById !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the group creator can appeal.' })
    }
    if (!['warned', 'locked', 'deleted'].includes(group.moderationStatus)) {
      return res.status(400).json({ error: 'No action to appeal.' })
    }

    // One appeal per (group, user) — let the unique index catch races.
    const existing = await prisma.groupAppeal.findUnique({
      where: { groupId_appealerId: { groupId, appealerId: req.user.userId } },
      select: { id: true, status: true },
    })
    if (existing) {
      return res.status(409).json({
        error: 'You have already appealed this decision. Appeals are final.',
        code: 'DUPLICATE_APPEAL',
      })
    }

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
    if (message.length < 10) {
      return res.status(400).json({
        error: 'Appeal message must be at least 10 characters.',
        code: 'VALIDATION',
      })
    }
    if (message.length > 2000) {
      return res.status(400).json({
        error: 'Appeal message must be at most 2000 characters.',
        code: 'VALIDATION',
      })
    }

    const appeal = await prisma.groupAppeal.create({
      data: {
        groupId,
        appealerId: req.user.userId,
        originalAction: group.moderationStatus,
        message: message.replace(/<[^>]*>/g, ''),
      },
    })

    await reportsService.writeAuditLog({
      groupId,
      actorId: req.user.userId,
      action: 'group.appeal.filed',
      targetType: 'group',
      targetId: groupId,
      context: { originalAction: group.moderationStatus },
      req,
    })

    res.status(201).json({
      id: appeal.id,
      status: appeal.status,
      message: 'Appeal submitted. Our team will review it and respond via notification.',
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /:id/my-report — did the current user already report this group?
 * Frontend uses this to hide the "Report" button after submission so
 * users don't try to file a duplicate.
 */
router.get('/my-report', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) return res.status(400).json({ error: 'Invalid group ID.' })

    const row = await prisma.groupReport.findUnique({
      where: { groupId_reporterId: { groupId, reporterId: req.user.userId } },
      select: { id: true, status: true, createdAt: true },
    })
    res.json({ report: row || null })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
