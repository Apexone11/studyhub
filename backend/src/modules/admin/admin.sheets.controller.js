const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const { validateHtmlForRuntime, classifyHtmlRisk, RISK_TIER } = require('../../lib/htmlSecurity')
const { sanitizePreviewHtml } = require('../../lib/htmlPreviewDocument')
const prisma = require('../../lib/prisma')
const { PAGE_SIZE, parsePage } = require('./admin.constants')

const router = express.Router()

// ── GET /api/admin/sheets?page=1 ─────────────────────────────
router.get('/sheets', async (req, res) => {
  const page = parsePage(req.query.page)
  try {
    const [sheets, total] = await Promise.all([
      prisma.studySheet.findMany({
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.studySheet.count(),
    ])
    res.json({ sheets, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/sheets/review?status=pending_review&page=1 ───────────────
router.get('/sheets/review', async (req, res) => {
  const page = parsePage(req.query.page)
  const rawStatus = String(req.query.status || 'pending_review').trim().toLowerCase()
  const status = ['pending_review', 'rejected', 'draft', 'published', 'quarantined'].includes(rawStatus)
    ? rawStatus
    : 'pending_review'

  /* Optional filters: contentFormat, htmlScanStatus, tier */
  const rawFormat = String(req.query.contentFormat || '').trim().toLowerCase()
  const contentFormat = ['html', 'markdown'].includes(rawFormat) ? rawFormat : undefined

  const rawScan = String(req.query.htmlScanStatus || '').trim().toLowerCase()
  const htmlScanStatus = ['queued', 'running', 'passed', 'flagged', 'pending_review', 'quarantined'].includes(rawScan) ? rawScan : undefined

  const rawTier = parseInt(req.query.tier, 10)
  const tierFilter = Number.isInteger(rawTier) && rawTier >= 0 && rawTier <= 3 ? rawTier : undefined

  const where = {
    status,
    ...(contentFormat ? { contentFormat } : {}),
    ...(htmlScanStatus ? { htmlScanStatus } : {}),
    ...(tierFilter !== undefined ? { htmlRiskTier: tierFilter } : {}),
  }

  try {
    const [sheets, total] = await Promise.all([
      prisma.studySheet.findMany({
        where,
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
          reviewedBy: { select: { id: true, username: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.studySheet.count({ where }),
    ])
    res.json({ sheets, total, page, pages: Math.ceil(total / PAGE_SIZE), status, filters: { contentFormat, htmlScanStatus } })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/sheets/:id/review-detail ─────────────────────────
router.get('/sheets/:id/review-detail', async (req, res) => {
  const sheetId = parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
        reviewedBy: { select: { id: true, username: true } },
      },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })

    const rawHtml = sheet.contentFormat === 'html' ? sheet.content : null
    const sanitizedHtml = rawHtml ? sanitizePreviewHtml(rawHtml) : null
    const liveClassification = rawHtml ? classifyHtmlRisk(rawHtml) : { tier: 0, findings: [], summary: 'N/A' }

    res.json({
      id: sheet.id,
      title: sheet.title,
      description: sheet.description,
      contentFormat: sheet.contentFormat,
      status: sheet.status,
      rawHtml,
      sanitizedHtml,
      validationIssues: liveClassification.findings.map((f) => f.message),
      htmlRiskTier: sheet.htmlRiskTier || 0,
      liveRiskTier: liveClassification.tier,
      liveRiskSummary: liveClassification.summary,
      htmlScanStatus: sheet.htmlScanStatus,
      htmlScanFindings: sheet.htmlScanFindings || [],
      htmlScanAcknowledgedAt: sheet.htmlScanAcknowledgedAt,
      author: sheet.author,
      course: sheet.course,
      reviewedBy: sheet.reviewedBy,
      reviewedAt: sheet.reviewedAt,
      reviewReason: sheet.reviewReason,
      reviewFindingsSnapshot: sheet.reviewFindingsSnapshot,
      createdAt: sheet.createdAt,
      updatedAt: sheet.updatedAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/sheets/:id/review ─────────────────────────────
router.patch('/sheets/:id/review', async (req, res) => {
  const sheetId = parseInt(req.params.id, 10)
  const action = String(req.body?.action || '').trim().toLowerCase()
  const reason = String(req.body?.reason || '').trim()

  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "approve" or "reject".' })
  }
  const effectiveReason = reason
    || (action === 'approve' ? 'Approved by admin.' : 'Rejected by admin (quick reject).')

  try {
    const current = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        status: true,
        contentFormat: true,
        content: true,
        htmlScanFindings: true,
      },
    })
    if (!current) return res.status(404).json({ error: 'Sheet not found.' })

    if (current.contentFormat === 'html' && action === 'approve') {
      const validation = validateHtmlForRuntime(current.content)
      if (!validation.ok) {
        return res.status(400).json({
          error: validation.issues[0],
          issues: validation.issues,
        })
      }
    }

    const nextStatus = action === 'approve' ? 'published' : 'rejected'
    const updated = await prisma.studySheet.update({
      where: { id: sheetId },
      data: {
        status: nextStatus,
        ...(action === 'approve' ? { htmlRiskTier: RISK_TIER.CLEAN, htmlScanStatus: 'passed' } : {}),
        reviewedById: req.user.userId,
        reviewedAt: new Date(),
        reviewReason: effectiveReason,
        reviewFindingsSnapshot: current.htmlScanFindings || [],
      },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
        reviewedBy: { select: { id: true, username: true } },
      },
    })

    res.json({
      message: action === 'approve' ? 'Sheet approved and published.' : 'Sheet rejected.',
      sheet: updated,
    })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Sheet not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/admin/sheets/:id ─────────────────────────────
router.delete('/sheets/:id', async (req, res) => {
  try {
    await prisma.studySheet.delete({ where: { id: parseInt(req.params.id) } })
    res.json({ message: 'Sheet deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Sheet not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
