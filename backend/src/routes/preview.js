const express = require('express')
const { captureError } = require('../monitoring/sentry')
const prisma = require('../lib/prisma')
const { buildPreviewDocument } = require('../lib/htmlPreviewDocument')
const { validateHtmlForSubmission } = require('../lib/htmlSecurity')
const { verifyHtmlPreviewToken } = require('../lib/previewTokens')
const { ERROR_CODES, sendError } = require('../middleware/errorEnvelope')

const router = express.Router()

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : null
}

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
  const userId = parseInteger(payload?.userId)
  const tokenVersion = typeof payload?.version === 'string' ? payload.version : ''
  const allowUnpublished = Boolean(payload?.allowUnpublished)

  if (payload?.type !== 'html-preview' || !sheetId || !userId || !tokenVersion) {
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

    const canReadUnpublished = allowUnpublished || Number(sheet.userId) === userId
    if (sheet.status !== 'published' && !canReadUnpublished) {
      return sendError(res, 403, 'Preview token is invalid or expired.', ERROR_CODES.PREVIEW_TOKEN_INVALID)
    }

    const validation = validateHtmlForSubmission(sheet.content)
    if (!validation.ok) {
      return sendError(
        res,
        400,
        'HTML preview blocked by security checks.',
        ERROR_CODES.PREVIEW_TOKEN_INVALID,
        { issues: validation.issues },
      )
    }

    const previewHtml = buildPreviewDocument({
      title: sheet.title,
      html: sheet.content,
    })

    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(previewHtml)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Could not render preview.', ERROR_CODES.PREVIEW_TOKEN_INVALID)
  }
})

module.exports = router
