/**
 * scholar.search.controller.js — Search endpoint handler.
 *
 * The Filters drawer (frontend `ScholarFiltersDrawer.jsx`) emits 11 URL
 * params. The 4 legacy ones (q / from / to / openAccess via `from`,`to`,
 * `openAccess`) plus 7 new ones (hasPdf, sources, domains, sort,
 * minCitations, author, venue) are all validated here and forwarded to
 * `service.searchPapers()`. Validation follows CLAUDE.md A12 + A13:
 * `Number.parseInt + Number.isInteger` for numerics, allowlist `Set`
 * lookups for enums + multi-selects.
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
  SEARCH_YEAR_RANGE_MIN,
  SEARCH_YEAR_RANGE_MAX,
  SEARCH_MIN_CITATIONS_MAX,
  SEARCH_AUTHOR_MAX,
  SEARCH_VENUE_MAX,
  SCHOLAR_SOURCE_SLUG_SET,
  SCHOLAR_SORT_SLUG_SET,
  SCHOLAR_DOMAIN_SLUG_SET,
  SCHOLAR_SOURCES_MAX,
  SCHOLAR_DOMAINS_MAX,
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

// Drawer year-range bound (stricter than the legacy from/to bound). The
// drawer emits `yearFrom` / `yearTo`; validate both against the [1700,
// currentYear+1] window per the plan.
function _validateYearRange(raw, label) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const n = Number.parseInt(raw, 10)
  if (!Number.isInteger(n) || n < SEARCH_YEAR_RANGE_MIN || n > SEARCH_YEAR_RANGE_MAX) {
    return { ok: false, reason: `${label}_out_of_range` }
  }
  return { ok: true, value: n }
}

// Boolean toggle — accept the conventional truthy strings. Anything else
// (including absence) defaults to false.
function _parseBooleanFlag(raw) {
  if (raw === undefined || raw === null || raw === '') return false
  if (raw === true) return true
  if (typeof raw !== 'string') return false
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

// Generic comma-separated multi-select validator. Splits on comma,
// trims, dedupes, validates each entry against `allowSet`. Any entry
// outside the allowlist is a hard 400 (CLAUDE.md A13).
function _validateCsvAllowlist(raw, allowSet, max, label) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, reason: `${label}_invalid` }
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return { ok: true, value: null }
  if (parts.length > max) return { ok: false, reason: `${label}_too_many` }
  const seen = new Set()
  for (const p of parts) {
    if (!allowSet.has(p)) return { ok: false, reason: `${label}_invalid_value` }
    seen.add(p)
  }
  return { ok: true, value: Array.from(seen) }
}

function _validateMinCitations(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: 0 }
  const n = Number.parseInt(raw, 10)
  if (!Number.isInteger(n) || n < 0 || n > SEARCH_MIN_CITATIONS_MAX) {
    return { ok: false, reason: 'minCitations_out_of_range' }
  }
  return { ok: true, value: n }
}

function _validateText(raw, max, label) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, reason: `${label}_invalid` }
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: true, value: null }
  if (trimmed.length > max) return { ok: false, reason: `${label}_too_long` }
  // Reject control characters (same rule as q).
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0a-\x1f\x7f]/.test(trimmed))
    return { ok: false, reason: `${label}_invalid_chars` }
  return { ok: true, value: trimmed }
}

function _validateSort(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: 'relevance' }
  if (typeof raw !== 'string') return { ok: false, reason: 'sort_invalid' }
  const v = raw.trim()
  if (!SCHOLAR_SORT_SLUG_SET.has(v)) return { ok: false, reason: 'sort_invalid_value' }
  return { ok: true, value: v }
}

async function search(req, res) {
  try {
    const qCheck = _validateQuery(req.query.q)
    if (!qCheck.ok) {
      return sendError(res, 400, 'Invalid search query.', ERROR_CODES.VALIDATION, {
        reason: qCheck.reason,
      })
    }

    // Legacy `from` / `to` (kept for backward compatibility) AND drawer
    // `yearFrom` / `yearTo` (preferred). If both are supplied, drawer
    // wins — it is the more explicit signal.
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
    const yearFromCheck = _validateYearRange(req.query.yearFrom, 'yearFrom')
    if (!yearFromCheck.ok) {
      return sendError(res, 400, 'Invalid `yearFrom` year.', ERROR_CODES.VALIDATION, {
        reason: yearFromCheck.reason,
      })
    }
    const yearToCheck = _validateYearRange(req.query.yearTo, 'yearTo')
    if (!yearToCheck.ok) {
      return sendError(res, 400, 'Invalid `yearTo` year.', ERROR_CODES.VALIDATION, {
        reason: yearToCheck.reason,
      })
    }

    let limit = Number.parseInt(req.query.limit, 10)
    if (!Number.isInteger(limit) || limit < 1) limit = SEARCH_LIMIT_DEFAULT
    if (limit > SEARCH_LIMIT_MAX) limit = SEARCH_LIMIT_MAX

    // Optional, lightly bounded — type / domain (legacy) / cursor are passed through.
    const type = typeof req.query.type === 'string' ? req.query.type.slice(0, 32) : null
    const domain = typeof req.query.domain === 'string' ? req.query.domain.slice(0, 64) : null
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 256) : null

    // ── New filter params (from the Filters drawer) ────────────────────
    const openAccess = _parseBooleanFlag(req.query.openAccess)
    const hasPdf = _parseBooleanFlag(req.query.hasPdf)

    const sourcesCheck = _validateCsvAllowlist(
      req.query.sources,
      SCHOLAR_SOURCE_SLUG_SET,
      SCHOLAR_SOURCES_MAX,
      'sources',
    )
    if (!sourcesCheck.ok) {
      return sendError(res, 400, 'Invalid `sources`.', ERROR_CODES.VALIDATION, {
        reason: sourcesCheck.reason,
      })
    }

    const domainsCheck = _validateCsvAllowlist(
      req.query.domains,
      SCHOLAR_DOMAIN_SLUG_SET,
      SCHOLAR_DOMAINS_MAX,
      'domains',
    )
    if (!domainsCheck.ok) {
      return sendError(res, 400, 'Invalid `domains`.', ERROR_CODES.VALIDATION, {
        reason: domainsCheck.reason,
      })
    }

    const sortCheck = _validateSort(req.query.sort)
    if (!sortCheck.ok) {
      return sendError(res, 400, 'Invalid `sort`.', ERROR_CODES.VALIDATION, {
        reason: sortCheck.reason,
      })
    }

    const minCitationsCheck = _validateMinCitations(req.query.minCitations)
    if (!minCitationsCheck.ok) {
      return sendError(res, 400, 'Invalid `minCitations`.', ERROR_CODES.VALIDATION, {
        reason: minCitationsCheck.reason,
      })
    }

    const authorCheck = _validateText(req.query.author, SEARCH_AUTHOR_MAX, 'author')
    if (!authorCheck.ok) {
      return sendError(res, 400, 'Invalid `author`.', ERROR_CODES.VALIDATION, {
        reason: authorCheck.reason,
      })
    }

    const venueCheck = _validateText(req.query.venue, SEARCH_VENUE_MAX, 'venue')
    if (!venueCheck.ok) {
      return sendError(res, 400, 'Invalid `venue`.', ERROR_CODES.VALIDATION, {
        reason: venueCheck.reason,
      })
    }

    // Drawer year-range wins over legacy `from`/`to` if both supplied.
    const effectiveFrom = yearFromCheck.value ?? fromCheck.value
    const effectiveTo = yearToCheck.value ?? toCheck.value

    const payload = await service.searchPapers({
      q: qCheck.value,
      type,
      domain,
      from: effectiveFrom,
      to: effectiveTo,
      limit,
      cursor,
      // New post-fetch / fan-out filters:
      openAccess,
      hasPdf,
      sources: sourcesCheck.value,
      domains: domainsCheck.value,
      sort: sortCheck.value,
      minCitations: minCitationsCheck.value,
      author: authorCheck.value,
      venue: venueCheck.value,
    })
    res.json(payload)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.search.failed' }, 'Scholar search failed')
    return sendError(res, 500, 'Failed to run scholar search.', ERROR_CODES.INTERNAL)
  }
}

module.exports = {
  search,
  _validateQuery,
  _validateYear,
  _validateYearRange,
  _parseBooleanFlag,
  _validateCsvAllowlist,
  _validateMinCitations,
  _validateText,
  _validateSort,
}
