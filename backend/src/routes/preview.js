const express = require('express')
const { captureError } = require('../monitoring/sentry')
const prisma = require('../lib/prisma')
const { buildPreviewDocument, buildInteractiveDocument } = require('../lib/htmlPreviewDocument')
const { verifyHtmlPreviewToken } = require('../lib/previewTokens')
const { ERROR_CODES, sendError } = require('../middleware/errorEnvelope')

const router = express.Router()

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : null
}

/**
 * Strict CSP for interactive (runtime) documents.
 * - Scripts/styles: inline only (no remote CDN/src)
 * - Images/media/fonts: data: and blob: only (no remote loading)
 * - connect-src 'none': no fetch/XHR/WebSocket
 * - form-action 'none': no form submissions
 * - frame-src 'none': no nested iframes
 */
const RUNTIME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ')

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
    return sendError(res, 403, 'Preview token is invalid or expired.', ERROR_CODES.PREVIEW_TOKEN_INVALID)
  }

  const sheetId = parseInteger(payload?.sheetId)
  const tokenVersion = typeof payload?.version === 'string' ? payload.version : ''
  const allowUnpublished = Boolean(payload?.allowUnpublished)
  const tokenType = VALID_TOKEN_TYPES.includes(payload?.type) ? payload.type : ''

  if (!tokenType || !sheetId || !tokenVersion) {
    return sendError(res, 403, 'Preview token is invalid or expired.', ERROR_CODES.PREVIEW_TOKEN_INVALID)
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
      },
    })

    if (!sheet || sheet.contentFormat !== 'html') {
      return sendError(res, 404, 'Preview is unavailable.', ERROR_CODES.PREVIEW_TOKEN_INVALID)
    }

    const currentVersion = sheet.updatedAt ? new Date(sheet.updatedAt).toISOString() : '0'
    if (currentVersion !== tokenVersion) {
      return sendError(res, 403, 'Preview token is invalid or expired.', ERROR_CODES.PREVIEW_TOKEN_INVALID)
    }

    if (sheet.status !== 'published' && !allowUnpublished) {
      return sendError(res, 403, 'Preview token is invalid or expired.', ERROR_CODES.PREVIEW_TOKEN_INVALID)
    }

    const isRuntime = tokenType === 'html-runtime'

    const outputHtml = isRuntime
      ? buildInteractiveDocument({ title: sheet.title, html: sheet.content })
      : buildPreviewDocument({ title: sheet.title, html: sheet.content })

    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')

    if (isRuntime) {
      res.setHeader('Content-Security-Policy', RUNTIME_CSP)
    }

    return res.status(200).send(outputHtml)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not render preview.', ERROR_CODES.SERVER_ERROR)
  }
})

module.exports = router
