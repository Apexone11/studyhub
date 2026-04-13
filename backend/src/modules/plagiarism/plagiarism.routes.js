/**
 * plagiarism.routes.js — Phase 4 user-facing plagiarism endpoints.
 *
 * Mounted at /api/plagiarism in index.js.
 *
 * Endpoints:
 *   GET  /api/plagiarism/sheet/:id     — user's plagiarism report for their sheet
 *   POST /api/plagiarism/sheet/:id/dispute — file a dispute
 *   POST /api/plagiarism/sheet/:id/rescan — trigger a re-scan (after revision)
 */
const express = require('express')
const requireAuth = require('../../core/auth/requireAuth')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { readLimiter, writeLimiter } = require('../../lib/rateLimiters')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const plagiarismService = require('./plagiarism.service')

const router = express.Router()

/**
 * GET /api/plagiarism/sheet/:id
 * Returns all plagiarism reports for a sheet. Only the sheet author
 * or an admin can view.
 */
router.get('/sheet/:id', readLimiter, requireAuth, async (req, res) => {
  try {
    const sheetId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(sheetId)) {
      return sendError(res, 400, 'Invalid sheet id.', ERROR_CODES.BAD_REQUEST)
    }

    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, title: true },
    })
    if (!sheet) return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)

    // Only the author or admin can see plagiarism reports
    if (sheet.userId !== req.user.userId && req.user.role !== 'admin') {
      return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    }

    const reports = await plagiarismService.getSheetReports(sheetId)

    // Compute aggregate stats
    const totalMatches = reports.length
    const highestScore = reports.length > 0 ? Math.max(...reports.map((r) => r.similarityScore)) : 0
    const hasLikelyCopy = reports.some((r) => r.similarityScore >= 0.85)

    res.json({
      sheetId,
      sheetTitle: sheet.title,
      totalMatches,
      highestScore: Math.round(highestScore * 1000) / 1000,
      hasLikelyCopy,
      reports: reports.map((r) => ({
        id: r.id,
        matchedSheet: r.matchedSheet,
        similarityScore: Math.round(r.similarityScore * 1000) / 1000,
        matchType: r.matchType,
        scores: r.highlightedSections,
        aiVerdict: r.aiVerdict,
        status: r.status,
        createdAt: r.createdAt,
      })),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * POST /api/plagiarism/sheet/:id/dispute
 * File a dispute: "This is original work."
 * Body: { reportId: number, reason: string }
 */
router.post('/sheet/:id/dispute', writeLimiter, requireAuth, async (req, res) => {
  try {
    const sheetId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(sheetId)) {
      return sendError(res, 400, 'Invalid sheet id.', ERROR_CODES.BAD_REQUEST)
    }

    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true },
    })
    if (!sheet || sheet.userId !== req.user.userId) {
      return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    }

    const { reportId, reason } = req.body || {}
    if (!reportId) return sendError(res, 400, 'reportId is required.', ERROR_CODES.BAD_REQUEST)

    const dispute = await plagiarismService.fileDispute({
      reportId: Number.parseInt(reportId, 10),
      userId: req.user.userId,
      reason: typeof reason === 'string' ? reason : '',
    })

    res.status(201).json({
      id: dispute.id,
      status: dispute.status,
      message: 'Dispute filed. Our team will review it.',
    })
  } catch (err) {
    if (err.status) return sendError(res, err.status, err.message, ERROR_CODES.BAD_REQUEST)
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * POST /api/plagiarism/sheet/:id/rescan
 * Trigger a re-scan after the author revises their content.
 * Clears existing pending reports and runs the scanner again.
 */
router.post('/sheet/:id/rescan', writeLimiter, requireAuth, async (req, res) => {
  try {
    const sheetId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(sheetId)) {
      return sendError(res, 400, 'Invalid sheet id.', ERROR_CODES.BAD_REQUEST)
    }

    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, content: true },
    })
    if (!sheet || sheet.userId !== req.user.userId) {
      return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    }

    // Delete pending (not confirmed/dismissed) reports so they're regenerated
    await prisma.plagiarismReport.deleteMany({
      where: { sheetId, status: 'pending' },
    })

    // Fire-and-forget: re-run the scan
    void plagiarismService.runPlagiarismScan(sheetId, sheet.content, sheet.userId)

    res.json({ message: 'Re-scan started. Results will appear shortly.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
