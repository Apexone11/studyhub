const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const {
  validateHtmlForRuntime,
  classifyHtmlRisk,
  RISK_TIER,
  generateRiskSummary,
  generateTierExplanation,
  groupFindingsByCategory,
} = require('../../lib/html/htmlSecurity')
const { sanitizePreviewHtml } = require('../../lib/html/htmlPreviewDocument')
const prisma = require('../../lib/prisma')
const { PAGE_SIZE, parsePage } = require('./admin.constants')
const { reReviewSheet } = require('../../modules/sheetReviewer')

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
  const rawStatus = String(req.query.status || 'pending_review')
    .trim()
    .toLowerCase()
  const status = ['pending_review', 'rejected', 'draft', 'published', 'quarantined'].includes(
    rawStatus,
  )
    ? rawStatus
    : 'pending_review'

  /* Optional filters: contentFormat, htmlScanStatus, tier */
  const rawFormat = String(req.query.contentFormat || '')
    .trim()
    .toLowerCase()
  const contentFormat = ['html', 'markdown', 'richtext'].includes(rawFormat) ? rawFormat : undefined

  const rawScan = String(req.query.htmlScanStatus || '')
    .trim()
    .toLowerCase()
  const htmlScanStatus = [
    'queued',
    'running',
    'passed',
    'flagged',
    'pending_review',
    'quarantined',
  ].includes(rawScan)
    ? rawScan
    : undefined

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
    res.json({
      sheets,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
      status,
      filters: { contentFormat, htmlScanStatus },
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/sheets/:id/review-detail ─────────────────────────
router.get('/sheets/:id/review-detail', async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId) || sheetId < 1) {
    return res.status(400).json({ error: 'Sheet id must be a positive integer.' })
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
    const liveClassification = rawHtml
      ? classifyHtmlRisk(rawHtml)
      : { tier: 0, findings: [], summary: 'N/A' }
    const runtimeValidation = rawHtml
      ? validateHtmlForRuntime(rawHtml)
      : { ok: true, issues: [], enrichedIssues: [] }

    const storedFindings = sheet.htmlScanFindings || []
    const storedTier = sheet.htmlRiskTier || 0

    res.json({
      id: sheet.id,
      title: sheet.title,
      description: sheet.description,
      contentFormat: sheet.contentFormat,
      status: sheet.status,
      rawHtml,
      sanitizedHtml,
      validationIssues: liveClassification.findings.map((f) => f.message),
      htmlRiskTier: storedTier,
      liveRiskTier: liveClassification.tier,
      liveRiskSummary: liveClassification.summary,
      riskSummary: generateRiskSummary(storedTier, storedFindings),
      tierExplanation: generateTierExplanation(storedTier),
      findingsByCategory: groupFindingsByCategory(storedFindings),
      liveRiskSummaryText: generateRiskSummary(
        liveClassification.tier,
        liveClassification.findings,
      ),
      liveTierExplanation: generateTierExplanation(liveClassification.tier),
      liveFindingsByCategory: groupFindingsByCategory(liveClassification.findings),
      htmlScanStatus: sheet.htmlScanStatus,
      htmlScanFindings: storedFindings,
      htmlScanAcknowledgedAt: sheet.htmlScanAcknowledgedAt,
      author: sheet.author,
      course: sheet.course,
      reviewedBy: sheet.reviewedBy,
      reviewedAt: sheet.reviewedAt,
      reviewReason: sheet.reviewReason,
      reviewFindingsSnapshot: sheet.reviewFindingsSnapshot,
      runtimeValidation: {
        ok: runtimeValidation.ok,
        issues: runtimeValidation.issues,
        enrichedIssues: runtimeValidation.enrichedIssues || [],
      },
      // AI review data (admin-only)
      aiReviewDecision: sheet.aiReviewDecision || null,
      aiReviewConfidence: sheet.aiReviewConfidence || null,
      aiReviewScore: sheet.aiReviewScore || null,
      aiReviewFindings: sheet.aiReviewFindings || null,
      aiReviewReasoning: sheet.aiReviewReasoning || null,
      aiReviewedAt: sheet.aiReviewedAt || null,
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
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId) || sheetId < 1) {
    return res.status(400).json({ error: 'Sheet id must be a positive integer.' })
  }
  const action = String(req.body?.action || '')
    .trim()
    .toLowerCase()
  const reason = String(req.body?.reason || '').trim()

  if (!Number.isInteger(sheetId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "approve" or "reject".' })
  }
  const effectiveReason =
    reason || (action === 'approve' ? 'Approved by admin.' : 'Rejected by admin (quick reject).')

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
          enrichedIssues: validation.enrichedIssues || [],
        })
      }
    }

    const nextStatus = action === 'approve' ? 'published' : 'rejected'
    const updated = await prisma.studySheet.update({
      where: { id: sheetId },
      data: {
        status: nextStatus,
        ...(action === 'approve'
          ? { htmlRiskTier: RISK_TIER.CLEAN, htmlScanStatus: 'passed' }
          : {}),
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

    // Notify the sheet author when their pending review lands. Without
    // this the user has to refresh the page and check status manually.
    // Skip when admin == author (self-review of their own sheet — rare
    // but the notification would just be noise).
    if (updated.author && updated.author.id !== req.user.userId) {
      try {
        const { createNotification } = require('../../lib/notify')
        await createNotification(prisma, {
          userId: updated.author.id,
          type: action === 'approve' ? 'sheet_approved' : 'sheet_rejected',
          message:
            action === 'approve'
              ? `Your sheet "${updated.title}" was approved and published.`
              : `Your sheet "${updated.title}" was rejected by an admin.`,
          actorId: req.user.userId,
          linkPath: `/sheets/${updated.id}`,
        })
      } catch {
        /* fire-and-forget — admin action is the source of truth */
      }
    }

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
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid sheet id.' })
    }
    await prisma.studySheet.delete({ where: { id } })
    res.json({ message: 'Sheet deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Sheet not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/admin/sheets/:id/ai-review — Trigger AI re-review ─────────
router.post('/sheets/:id/ai-review', async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId) || sheetId < 1) {
    return res.status(400).json({ error: 'Sheet id must be a positive integer.' })
  }

  try {
    const result = await reReviewSheet(sheetId)
    res.json({
      message: 'AI re-review completed.',
      decision: result.decision,
      confidence: result.confidence,
      risk_score: result.risk_score,
      findings: result.findings,
      reasoning: result.reasoning,
    })
  } catch (err) {
    if (err.message === 'Sheet not found') return res.status(404).json({ error: err.message })
    if (err.message === 'Only HTML sheets can be AI-reviewed')
      return res.status(400).json({ error: err.message })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'AI review failed.' })
  }
})

module.exports = router
