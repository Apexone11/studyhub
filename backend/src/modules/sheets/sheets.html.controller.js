const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const {
  validateHtmlForSubmission,
  RISK_TIER,
  generateRiskSummary,
  generateTierExplanation,
} = require('../../lib/html/htmlSecurity')
const requireVerifiedEmail = require('../../core/auth/requireVerifiedEmail')
const { signHtmlPreviewToken, HTML_PREVIEW_TOKEN_TTL_SECONDS } = require('../../lib/previewTokens')
const { submitHtmlDraftForReview } = require('../../lib/html/htmlDraftWorkflow')
const { sheetWriteLimiter } = require('./sheets.constants')
const { canReadSheet, canModerateOrOwnSheet, resolvePreviewOrigin } = require('./sheets.service')
const { tierToPreviewMode } = require('./sheets.serializer')
const { serializeSheet } = require('./sheets.serializer')

const router = express.Router()

router.post(
  '/:id/submit-review',
  requireAuth,
  requireVerifiedEmail,
  sheetWriteLimiter,
  async (req, res) => {
    const sheetId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(sheetId)) {
      return res.status(400).json({ error: 'Sheet id must be an integer.' })
    }

    try {
      const sheet = await submitHtmlDraftForReview(prisma, { sheetId, user: req.user })
      res.json({
        ...serializeSheet(sheet),
        message: 'HTML sheet submitted for admin review.',
      })
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500
      if (statusCode >= 500) {
        captureError(error, { route: req.originalUrl, method: req.method })
      }
      res.status(statusCode).json({
        error: error.message || 'Could not submit for review.',
        findings: error.findings || [],
      })
    }
  },
)

router.get('/:id/html-preview', requireAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        title: true,
        userId: true,
        content: true,
        contentFormat: true,
        status: true,
        updatedAt: true,
        htmlRiskTier: true,
        htmlScanFindings: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null))
      return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.contentFormat !== 'html') {
      return res.status(400).json({ error: 'This sheet is not in HTML mode.' })
    }

    const tier = sheet.htmlRiskTier || 0
    const findings = Array.isArray(sheet.htmlScanFindings) ? sheet.htmlScanFindings : []
    const validation = validateHtmlForSubmission(sheet.content)
    const issues = validation.ok ? [] : validation.issues || []

    const previewVersion = sheet.updatedAt ? new Date(sheet.updatedAt).toISOString() : '0'
    const previewToken = signHtmlPreviewToken({
      sheetId: sheet.id,
      version: previewVersion,
      allowUnpublished: canModerateOrOwnSheet(sheet, req.user),
      tier,
    })
    const previewUrl = `${resolvePreviewOrigin(req)}/preview/html?token=${encodeURIComponent(previewToken)}`

    res.json({
      id: sheet.id,
      title: sheet.title,
      status: sheet.status,
      htmlRiskTier: tier,
      previewMode: tierToPreviewMode(tier),
      riskSummary: generateRiskSummary(tier, findings),
      tierExplanation: generateTierExplanation(tier),
      updatedAt: sheet.updatedAt,
      previewUrl,
      expiresInSeconds: HTML_PREVIEW_TOKEN_TTL_SECONDS,
      sanitized: issues.length > 0,
      issues,
      // Interactive Preview availability:
      //   - Tier 0 (CLEAN) and Tier 1 (FLAGGED) are both publish-and-show
      //     per the documented HTML risk policy ("Tier 0 publishes, Tier 1
      //     publishes with warning"). The sandboxed iframe runs scripts in
      //     `allow-scripts allow-forms` only — never `allow-same-origin` —
      //     so the parent app stays isolated regardless of tier.
      //   - Tier 2 (HIGH_RISK) and Tier 3 (QUARANTINED) require owner /
      //     admin to bypass the gate (Tier 2 normally never reaches a
      //     non-owner anyway because canReadSheet rejects non-published).
      canInteract:
        Boolean(req.user) && (tier <= RISK_TIER.FLAGGED || canModerateOrOwnSheet(sheet, req.user)),
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/html-runtime', requireAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        title: true,
        userId: true,
        content: true,
        contentFormat: true,
        status: true,
        updatedAt: true,
        htmlRiskTier: true,
        htmlScanFindings: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null))
      return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.contentFormat !== 'html') {
      return res.status(400).json({ error: 'This sheet is not in HTML mode.' })
    }

    const tier = sheet.htmlRiskTier || 0

    // Interactive runtime gate (mirrors the canInteract calculation in
    // /html-preview, keep them in sync). Tier 0 + Tier 1 are publish-and-show
    // for any authenticated viewer — the sandboxed iframe (`allow-scripts
    // allow-forms` with no `allow-same-origin` per CLAUDE.md A14) keeps the
    // parent app isolated regardless of tier. Tier 2 (HIGH_RISK) is owner /
    // admin only; Tier 3 (QUARANTINED) is blocked everywhere.
    if (tier >= RISK_TIER.HIGH_RISK && !canModerateOrOwnSheet(sheet, req.user)) {
      return res.status(403).json({
        error:
          'Interactive preview for high-risk sheets is only available to the sheet owner or an admin.',
      })
    }

    if (tier >= RISK_TIER.QUARANTINED) {
      return res
        .status(403)
        .json({ error: 'This sheet has been quarantined. Preview is disabled.' })
    }

    const runtimeVersion = sheet.updatedAt ? new Date(sheet.updatedAt).toISOString() : '0'
    const runtimeToken = signHtmlPreviewToken({
      sheetId: sheet.id,
      version: runtimeVersion,
      allowUnpublished: canModerateOrOwnSheet(sheet, req.user),
      tokenType: 'html-runtime',
      tier,
    })
    const runtimeUrl = `${resolvePreviewOrigin(req)}/preview/html?token=${encodeURIComponent(runtimeToken)}`

    const findings = Array.isArray(sheet.htmlScanFindings) ? sheet.htmlScanFindings : []

    res.json({
      id: sheet.id,
      title: sheet.title,
      status: sheet.status,
      htmlRiskTier: tier,
      previewMode: tierToPreviewMode(tier),
      riskSummary: generateRiskSummary(tier, findings),
      tierExplanation: generateTierExplanation(tier),
      updatedAt: sheet.updatedAt,
      runtimeUrl,
      expiresInSeconds: HTML_PREVIEW_TOKEN_TTL_SECONDS,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
