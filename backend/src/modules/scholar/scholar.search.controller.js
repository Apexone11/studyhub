/**
 * scholar.search.controller.js — Search endpoint handler.
 */

const log = require('../../lib/logger')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const service = require('./scholar.service')
const {
  SEARCH_QUERY_MIN,
  SEARCH_QUERY_MAX,
  SEARCH_LIMIT_MAX,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_YEAR_MIN,
  SEARCH_YEAR_MAX,
} = require('./scholar.constants')

// Strict query sanitizer — only printable ASCII + common Unicode letters,
// no control chars (ASCII 0-31 except space). Length-clamped.
function _validateQuery(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'q_required' }
  const trimmed = raw.trim()
  if (trimmed.length < SEARCH_QUERY_MIN) return { ok: false, reason: 'q_too_short' }
  if (trimmed.length > SEARCH_QUERY_MAX) return { ok: false, reason: 'q_too_long' }
  // Reject control characters except tab.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0a-\x1f\x7f]/.test(trimmed)) return { ok: false, reason: 'q_invalid_chars' }
  return { ok: true, value: trimmed }
}

function _validateYear(raw, label) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const n = Number.parseInt(raw, 10)
  if (!Number.isInteger(n) || n < SEARCH_YEAR_MIN || n > SEARCH_YEAR_MAX) {
    return { ok: false, reason: `${label}_out_of_range` }
  }
  return { ok: true, value: n }
}

async function search(req, res) {
  try {
    const qCheck = _validateQuery(req.query.q)
    if (!qCheck.ok) {
      return sendError(res, 400, 'Invalid search query.', ERROR_CODES.VALIDATION, {
        reason: qCheck.reason,
      })
    }
    const fromCheck = _validateYear(req.query.from, 'from')
    if (!fromCheck.ok) {
      return sendError(res, 400, 'Invalid `from` year.', ERROR_CODES.VALIDATION, {
        reason: fromCheck.reason,
      })
    }
    const toCheck = _validateYear(req.query.to, 'to')
    if (!toCheck.ok) {
      return sendError(res, 400, 'Invalid `to` year.', ERROR_CODES.VALIDATION, {
        reason: toCheck.reason,
      })
    }
    let limit = Number.parseInt(req.query.limit, 10)
    if (!Number.isInteger(limit) || limit < 1) limit = SEARCH_LIMIT_DEFAULT
    if (limit > SEARCH_LIMIT_MAX) limit = SEARCH_LIMIT_MAX

    // Optional, lightly bounded — type / domain / cursor are passed through.
    const type = typeof req.query.type === 'string' ? req.query.type.slice(0, 32) : null
    const domain = typeof req.query.domain === 'string' ? req.query.domain.slice(0, 64) : null
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 256) : null

    const payload = await service.searchPapers({
      q: qCheck.value,
      type,
      domain,
      from: fromCheck.value,
      to: toCheck.value,
      limit,
      cursor,
    })
    res.json(payload)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.search.failed' }, 'Scholar search failed')
    return sendError(res, 500, 'Failed to run scholar search.', ERROR_CODES.INTERNAL)
  }
}

module.exports = { search, _validateQuery, _validateYear }
