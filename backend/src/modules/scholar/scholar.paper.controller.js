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

/**
 * GET /api/scholar/paper/:id/similar
 *
 * Returns papers similar to the given paper. v1 algorithm: shared
 * topics ranked by citation count + recency. Skips the seed paper
 * itself. Bounded to a 50-row candidate window to keep this lightweight
 * — the page renders only ~20 results.
 *
 * Wave-5 fix (2026-05-13): the Similar tab was rendering a raw Express
 * "Cannot GET /api/scholar/paper/:id/similar" 404 because the route +
 * controller had never been added. Frontend already gracefully maps
 * `data.similar`, `data.results`, or array root to the results list.
 */
async function getSimilar(req, res) {
  try {
    const id = _validateCanonicalId(req.params.id)
    if (!id) {
      return sendError(res, 400, 'Invalid paper id.', ERROR_CODES.BAD_REQUEST)
    }
    const { limit } = _validatePagination(req)

    const seed = await prisma.scholarPaper.findUnique({ where: { id } })
    if (!seed) return sendError(res, 404, 'Paper not found.', ERROR_CODES.NOT_FOUND)

    // Extract topic names from the seed paper. v1 stores topics as a
    // string array or [{ name }] array on topicsJson; tolerate either.
    const seedTopics = (Array.isArray(seed.topicsJson) ? seed.topicsJson : [])
      .map((t) => (typeof t === 'string' ? t : t?.name || ''))
      .filter((t) => t && t.length > 0)
      .map((t) => t.toLowerCase())

    if (seedTopics.length === 0) {
      // No topics → no similarity signal. Return empty rather than
      // 500 so the Similar tab renders cleanly.
      return res.json({ similar: [], reason: 'no_topics' })
    }

    // Candidate window: recent + highly-cited papers, JS-filter by topic
    // overlap. JSONB topic indexing is deferred to v2.
    const candidateWindow = Math.min(Math.max(limit * 6, 60), 200)
    const candidates = await prisma.scholarPaper.findMany({
      where: {
        id: { not: id },
        title: { not: null },
      },
      orderBy: [{ citationCount: 'desc' }, { publishedAt: 'desc' }],
      take: candidateWindow,
    })

    const scored = candidates
      .map((row) => {
        const rowTopics = (Array.isArray(row.topicsJson) ? row.topicsJson : [])
          .map((t) => (typeof t === 'string' ? t : t?.name || ''))
          .filter((t) => t)
          .map((t) => t.toLowerCase())
        const overlap = rowTopics.filter((t) => seedTopics.includes(t)).length
        return { row, overlap }
      })
      .filter((s) => s.overlap > 0)
      .sort((a, b) => {
        if (b.overlap !== a.overlap) return b.overlap - a.overlap
        // Tie-break by citation count desc, then recency.
        const ca = a.row.citationCount || 0
        const cb = b.row.citationCount || 0
        if (cb !== ca) return cb - ca
        const da = a.row.publishedAt ? new Date(a.row.publishedAt).getTime() : 0
        const db = b.row.publishedAt ? new Date(b.row.publishedAt).getTime() : 0
        return db - da
      })
      .slice(0, limit)
      .map((s) => service._serializePaper(s.row))

    return res.json({ similar: scored })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.similar.failed' }, 'Scholar similar failed')
    // Empty result rather than 500 — the tab renders a clean empty
    // state instead of an error toast that masks all the working tabs.
    return res.json({ similar: [] })
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
  getSimilar,
  getPdf,
  _validateCanonicalId,
  _validatePagination,
}
