const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const { validateHtmlForSubmission, RISK_TIER, generateRiskSummary, generateTierExplanation } = require('../../lib/html/htmlSecurity')
const requireVerifiedEmail = require('../../core/auth/requireVerifiedEmail')
const { signHtmlPreviewToken, HTML_PREVIEW_TOKEN_TTL_SECONDS } = require('../../lib/previewTokens')
const { submitHtmlDraftForReview } = require('../../lib/html/htmlDraftWorkflow')
const { sheetWriteLimiter } = require('./sheets.constants')
const { canReadSheet, canModerateOrOwnSheet, resolvePreviewOrigin } = require('./sheets.service')
const { tierToPreviewMode } = require('./sheets.serializer')
const { serializeSheet } = require('./sheets.serializer')

const router = express.Router()

router.post('/:id/submit-review', requireAuth, requireVerifiedEmail, sheetWriteLimiter, async (req, res) => {
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
})

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
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.contentFormat !== 'html') {
      return res.status(400).json({ error: 'This sheet is not in HTML mode.' })
    }

    const tier = sheet.htmlRiskTier || 0
    const findings = Array.isArray(sheet.htmlScanFindings) ? sheet.htmlScanFindings : []
    const validation = validateHtmlForSubmission(sheet.content)
    const issues = validation.ok ? [] : (validation.issues || [])

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
      canInteract: canModerateOrOwnSheet(sheet, req.user),
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
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.contentFormat !== 'html') {
      return res.status(400).json({ error: 'This sheet is not in HTML mode.' })
    }

    const tier = sheet.htmlRiskTier || 0

    if (!canModerateOrOwnSheet(sheet, req.user)) {
      return res.status(403).json({ error: 'Interactive preview is only available to the sheet owner or an admin.' })
    }

    if (tier >= RISK_TIER.QUARANTINED) {
      return res.status(403).json({ error: 'This sheet has been quarantined. Preview is disabled.' })
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
