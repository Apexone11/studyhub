/**
 * Shared lightweight validators for route parameters.
 */

const MAX_SAFE = Number.MAX_SAFE_INTEGER

/**
 * @deprecated 2026-05-14 — prefer `parseBoundedInt(value, fallback, max)`
 * on list endpoints. `parsePositiveInt` accepts unbounded input and was
 * the DoS vector behind 2026-05-14 P1-C (a client could request millions
 * of rows). Kept for legacy non-list callers (e.g. parsing a single
 * positive value from a query string) where the result isn't piped to a
 * Prisma `take` / `LIMIT` / unbounded array op.
 */
function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Parse a positive integer with an upper cap. Use this on every list
 * endpoint that reads `?limit=` from req.query — `parsePositiveInt`
 * (which has NO cap) was a DoS vector on uncapped list endpoints. Values
 * above `max` are silently clamped (Stripe/GitHub convention) rather than
 * 400'd, because the existing callers don't validate before send.
 * 2026-05-14 P1-C.
 *
 * @param {*} value     raw query-string value
 * @param {number} fallback  default when value is missing / invalid
 * @param {number} max       hard ceiling; values above are clamped down
 */
function parseBoundedInt(value, fallback, max) {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error('parseBoundedInt: max must be a positive integer')
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return Math.min(fallback, max)
  return Math.min(parsed, max)
}

/**
 * Strictly parse a positive-integer route/path parameter.
 *
 * Unlike `Number.parseInt` (which accepts "12abc" → 12, "0x10" → 16 via
 * Number(), "1e3" etc.) this rejects any value that is not a pure run of
 * ASCII digits. Closes the partial-numeric path-param hole on mutating
 * routes flagged by CLAUDE.md A12 — a malformed path like
 * PATCH /api/materials/12abc/archive must 400, not silently act on row 12.
 *
 * Rejects: "12abc", "0x10", "1e3", "12.5", " 12", "-1", "007abc", "", null.
 * Accepts: "1" .. up to Number.MAX_SAFE_INTEGER (over-long digit runs that
 * would lose precision are rejected). Returns the integer, or null.
 *
 * @param {*} value  req.params.<id> (string) or a numeric id
 * @returns {number|null}
 */
function parseRouteId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const str = String(value)
  if (!/^[0-9]+$/.test(str)) return null
  const parsed = Number.parseInt(str, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SAFE) return null
  return parsed
}

function parseOptionalInteger(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : null
}

function parsePage(raw) {
  const page = Number.parseInt(raw, 10)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

module.exports = {
  parsePositiveInt,
  parseBoundedInt,
  parseRouteId,
  parseOptionalInteger,
  parsePage,
}
