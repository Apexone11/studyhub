const express = require('express')
const { previewLimiter } = require('../../lib/rateLimiters')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const {
  buildPreviewDocument,
  buildInteractiveDocument,
} = require('../../lib/html/htmlPreviewDocument')
const { verifyHtmlPreviewToken } = require('../../lib/previewTokens')
const { ERROR_CODES, sendError } = require('../../middleware/errorEnvelope')
const { RISK_TIER } = require('../../lib/html/htmlSecurity')

const router = express.Router()

router.use(previewLimiter)

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : null
}

/**
 * Base CSP directives shared by all preview modes.
 * frame-ancestors is NOT included here — it is appended per-request from
 * res.locals.frameAncestorsDirective (set by the security-header middleware)
 * so that the trusted-origin list stays in one place.
 */
const BASE_PREVIEW_DIRECTIVES = [
  "default-src 'none'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-elem 'unsafe-inline' https://fonts.googleapis.com",
  'img-src data: blob: https:',
  'media-src data: blob:',
  'font-src data: blob: https://fonts.gstatic.com',
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
]

/** Tier 0 runtime: scripts allowed (inline only). */
const RUNTIME_DIRECTIVES = [...BASE_PREVIEW_DIRECTIVES, "script-src 'unsafe-inline'"]

/** Tier 1+ safe preview: scripts completely blocked. */
const SAFE_PREVIEW_DIRECTIVES = [...BASE_PREVIEW_DIRECTIVES, "script-src 'none'"]

/** Build final CSP string with the correct frame-ancestors for this request. */
function buildPreviewCsp(directives, res) {
  const frameAncestors = res.locals.frameAncestorsDirective || "frame-ancestors 'none'"
  return [...directives, frameAncestors].join('; ')
}

const VALID_TOKEN_TYPES = ['html-preview', 'html-runtime']

router.get('/html', async (req, res) => {
  const rawToken = typeof req.query.token === 'string' ? req.query.token.trim() : ''

  if (!rawToken) {
    return sendError(res, 403, 'Preview token is required.', ERROR_CODES.PREVIEW_TOKEN_INVALID)
  }

  let payload
  try {
    payload = verifyHtmlPreviewToken(rawToken)
  } catch {
    return sendError(
      res,
      403,
      'Preview token is invalid or expired.',
      ERROR_CODES.PREVIEW_TOKEN_INVALID,
    )
  }

  const sheetId = parseInteger(payload?.sheetId)
  const tokenVersion = typeof payload?.version === 'string' ? payload.version : ''
  const allowUnpublished = Boolean(payload?.allowUnpublished)
  const tokenType = VALID_TOKEN_TYPES.includes(payload?.type) ? payload.type : ''
  const tier = Number.isInteger(payload?.tier) ? payload.tier : 0

  if (!tokenType || !sheetId || !tokenVersion) {
    return sendError(
      res,
      403,
      'Preview token is invalid or expired.',
      ERROR_CODES.PREVIEW_TOKEN_INVALID,
    )
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        title: true,
        userId: true,
        status: true,
        content: true,
        contentFormat: true,
        updatedAt: true,
        htmlRiskTier: true,
      },
    })

    if (!sheet || sheet.contentFormat !== 'html') {
      return sendError(res, 404, 'Preview is unavailable.', ERROR_CODES.PREVIEW_TOKEN_INVALID)
    }

    const currentVersion = sheet.updatedAt ? new Date(sheet.updatedAt).toISOString() : '0'
    if (currentVersion !== tokenVersion) {
      return sendError(
        res,
        403,
        'Preview token is invalid or expired.',
        ERROR_CODES.PREVIEW_TOKEN_INVALID,
      )
    }

    if (sheet.status !== 'published' && !allowUnpublished) {
      return sendError(
        res,
        403,
        'Preview token is invalid or expired.',
        ERROR_CODES.PREVIEW_TOKEN_INVALID,
      )
    }

    // Tier 3 (quarantined): always block preview
    const effectiveTier = Math.max(tier, sheet.htmlRiskTier || 0)
    if (effectiveTier >= RISK_TIER.QUARANTINED) {
      return sendError(
        res,
        403,
        'This sheet has been quarantined. Preview is disabled.',
        ERROR_CODES.PREVIEW_TOKEN_INVALID,
      )
    }

    // Tier 2 (high risk): allow if either an admin/owner is viewing
    // (allowUnpublished) OR the sheet is in the PUBLISHED state (admin
    // already approved it for the public). This matches the runtime gate
    // in /api/sheets/:id/html-runtime — the admin's publish IS the safety
    // review and lets the sheet behave like a real interactive sheet for
    // anyone who can already read it.
    const isPublished = sheet.status === 'published'
    if (effectiveTier >= RISK_TIER.HIGH_RISK && !allowUnpublished && !isPublished) {
      return sendError(
        res,
        403,
        'This sheet is pending safety review. Preview is disabled.',
        ERROR_CODES.PREVIEW_TOKEN_INVALID,
      )
    }

    const isRuntime = tokenType === 'html-runtime'

    // Tier 2 + safe-preview token: still strip scripts (the safe view).
    // Tier 2 + runtime token: serve the interactive document — same isolation
    // sandbox as Tier 0/1 (allow-scripts allow-forms, no allow-same-origin),
    // CSP `script-src 'unsafe-inline'`, no network/connect.
    if (effectiveTier >= RISK_TIER.HIGH_RISK) {
      const outputHtml = isRuntime
        ? buildInteractiveDocument({ title: sheet.title, html: sheet.content })
        : buildPreviewDocument({ title: sheet.title, html: sheet.content })
      res.setHeader('Cache-Control', 'private, no-store, max-age=0')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader(
        'Content-Security-Policy',
        buildPreviewCsp(isRuntime ? RUNTIME_DIRECTIVES : SAFE_PREVIEW_DIRECTIVES, res),
      )
      return res.status(200).send(outputHtml)
    }

    // Tier 1 (flagged): runtime token gets the interactive document AND
    // the runtime CSP that allows inline scripts; preview token still gets
    // the safe doc + safe CSP. Without the runtime CSP swap, the iframe
    // loads an HTML doc with <script> tags but the CSP header silently
    // blocks their execution and click handlers never fire.
    if (effectiveTier >= RISK_TIER.FLAGGED) {
      const outputHtml = isRuntime
        ? buildInteractiveDocument({ title: sheet.title, html: sheet.content })
        : buildPreviewDocument({ title: sheet.title, html: sheet.content })
      res.setHeader('Cache-Control', 'private, no-store, max-age=0')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader(
        'Content-Security-Policy',
        buildPreviewCsp(isRuntime ? RUNTIME_DIRECTIVES : SAFE_PREVIEW_DIRECTIVES, res),
      )
      return res.status(200).send(outputHtml)
    }

    // Tier 0 (clean): explicitly set CSP for both safe and runtime previews
    // so the route is not relying on the global preview-surface middleware
    // value silently flowing through. Safer against future route-ordering
    // refactors that could leave Tier 0 safe previews with frame-ancestors
    // 'none' and produce a blank-iframe failure mode.
    const outputHtml = isRuntime
      ? buildInteractiveDocument({ title: sheet.title, html: sheet.content })
      : buildPreviewDocument({ title: sheet.title, html: sheet.content })

    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader(
      'Content-Security-Policy',
      buildPreviewCsp(isRuntime ? RUNTIME_DIRECTIVES : SAFE_PREVIEW_DIRECTIVES, res),
    )

    return res.status(200).send(outputHtml)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not render preview.', ERROR_CODES.SERVER_ERROR)
  }
})

module.exports = router
