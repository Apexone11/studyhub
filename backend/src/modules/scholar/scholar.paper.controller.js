/**
 * scholar.paper.controller.js — Paper detail / citations / references / pdf.
 */

const log = require('../../lib/logger')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const prisma = require('../../lib/prisma')
const service = require('./scholar.service')
const { CANONICAL_ID_RE } = require('./scholar.constants')

function _validateCanonicalId(raw) {
  if (typeof raw !== 'string' || !raw) return null
  // Copilot fix: decodeURIComponent throws URIError on malformed
  // percent-encoding (e.g. `%E0%A4`). Catch and treat as invalid id so
  // the route surfaces 400 BAD_REQUEST rather than a 500.
  let decoded
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (decoded.length > 256) return null
  if (!CANONICAL_ID_RE.test(decoded)) return null
  return decoded
}

function _validatePagination(req) {
  let limit = Number.parseInt(req.query.limit, 10)
  if (!Number.isInteger(limit) || limit < 1) limit = 20
  if (limit > 50) limit = 50
  let offset = Number.parseInt(req.query.offset, 10)
  if (!Number.isInteger(offset) || offset < 0) offset = 0
  if (offset > 1000) offset = 1000
  return { limit, offset }
}

async function getPaper(req, res) {
  try {
    const id = _validateCanonicalId(req.params.id)
    if (!id) {
      return sendError(res, 400, 'Invalid paper id.', ERROR_CODES.BAD_REQUEST)
    }
    const paper = await service.getPaperDetail(id)
    if (!paper) return sendError(res, 404, 'Paper not found.', ERROR_CODES.NOT_FOUND)
    res.json({ paper })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.paper.failed' }, 'Scholar paper detail failed')
    return sendError(res, 500, 'Failed to load paper.', ERROR_CODES.INTERNAL)
  }
}

async function getCitations(req, res) {
  try {
    const id = _validateCanonicalId(req.params.id)
    if (!id) {
      return sendError(res, 400, 'Invalid paper id.', ERROR_CODES.BAD_REQUEST)
    }
    const { limit, offset } = _validatePagination(req)
    const result = await service.getCitations(id, { limit, offset })
    res.json(result)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.citations.failed' }, 'Scholar citations failed')
    return sendError(res, 500, 'Failed to load citations.', ERROR_CODES.INTERNAL)
  }
}

async function getReferences(req, res) {
  try {
    const id = _validateCanonicalId(req.params.id)
    if (!id) {
      return sendError(res, 400, 'Invalid paper id.', ERROR_CODES.BAD_REQUEST)
    }
    const { limit, offset } = _validatePagination(req)
    const result = await service.getReferences(id, { limit, offset })
    res.json(result)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.references.failed' }, 'Scholar references failed')
    return sendError(res, 500, 'Failed to load references.', ERROR_CODES.INTERNAL)
  }
}

async function getPdf(req, res) {
  try {
    const id = _validateCanonicalId(req.params.id)
    if (!id) {
      return sendError(res, 400, 'Invalid paper id.', ERROR_CODES.BAD_REQUEST)
    }
    // Look up the paper to enforce OA + license + cached state.
    let row = null
    try {
      row = await prisma.scholarPaper.findUnique({ where: { id } })
    } catch (lookupErr) {
      log.warn({ event: 'scholar.pdf.lookup_failed', err: lookupErr.message }, 'PDF lookup failed')
    }
    if (!row) return sendError(res, 404, 'Paper not found.', ERROR_CODES.NOT_FOUND)
    if (!row.openAccess) {
      return sendError(res, 403, 'Paper is not open access.', ERROR_CODES.FORBIDDEN)
    }

    if (!row.pdfCachedKey) {
      // One-off lazy cache attempt. License gate runs inside the service.
      const paperShape = service._serializePaper(row)
      const cacheRes = await service.getOrCachePaperPdf(id, paperShape)
      if (!cacheRes.cached) {
        return sendError(res, 404, 'PDF not yet cached.', ERROR_CODES.NOT_FOUND, {
          reason: cacheRes.reason || 'unavailable',
        })
      }
    }

    const signed = await service.getSignedPdfUrl(id)
    if (!signed.url) {
      return sendError(res, 404, 'PDF not available.', ERROR_CODES.NOT_FOUND, {
        reason: signed.reason || 'unknown',
      })
    }
    res.json({ url: signed.url })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.pdf.failed' }, 'Scholar PDF failed')
    return sendError(res, 500, 'Failed to load paper PDF.', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  getPaper,
  getCitations,
  getReferences,
  getPdf,
  _validateCanonicalId,
  _validatePagination,
}
