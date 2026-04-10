/**
 * inputSanitizer.js — Phase 5 request-level input sanitization.
 *
 * Runs BEFORE route handlers on every request with a JSON body. Rejects
 * payloads that contain:
 *   - Null bytes (\0) — common injection vector
 *   - Control characters (ASCII 0-31 except \t, \n, \r)
 *   - Any single string field longer than MAX_FIELD_LENGTH
 *   - JSON nesting deeper than MAX_DEPTH
 *   - Duplicate query parameters (parameter pollution)
 *
 * Designed to be added early in the Express middleware stack (after
 * express.json() but before any route). Failures return 400 with a
 * generic message — never reveal what was rejected or why to avoid
 * guiding attackers.
 */

const MAX_FIELD_LENGTH = 10 * 1024 // 10 KB per field
const MAX_DEPTH = 5

/**
 * Check a value for null bytes and control characters.
 * Returns true if clean, false if tainted.
 */
function isCleanString(value) {
  if (typeof value !== 'string') return true
  if (value.length > MAX_FIELD_LENGTH) return false
  // eslint-disable-next-line no-control-regex
  return !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)
}

/**
 * Recursively walk a parsed JSON value and validate all strings.
 * Returns false on the first violation. depth tracks nesting.
 */
function validatePayload(value, depth = 0) {
  if (depth > MAX_DEPTH) return false
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return isCleanString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) {
    if (value.length > 1000) return false // cap array size
    return value.every((item) => validatePayload(item, depth + 1))
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length > 200) return false // cap key count
    return keys.every((key) => {
      if (!isCleanString(key)) return false
      return validatePayload(value[key], depth + 1)
    })
  }
  return true
}

/**
 * Check for duplicate query parameters (parameter pollution).
 * Express parses ?a=1&a=2 as { a: ['1', '2'] }. We reject that.
 */
function hasDuplicateQueryParams(query) {
  if (!query || typeof query !== 'object') return false
  return Object.values(query).some((v) => Array.isArray(v))
}

/**
 * Express middleware. Mount after express.json().
 */
function inputSanitizer(req, res, next) {
  // Validate JSON body if present
  if (req.body && typeof req.body === 'object') {
    if (!validatePayload(req.body)) {
      return res.status(400).json({ error: 'Invalid request payload.' })
    }
  }

  // Reject duplicate query params
  if (hasDuplicateQueryParams(req.query)) {
    return res.status(400).json({ error: 'Invalid query parameters.' })
  }

  next()
}

module.exports = inputSanitizer
module.exports.validatePayload = validatePayload
module.exports.isCleanString = isCleanString
module.exports.MAX_FIELD_LENGTH = MAX_FIELD_LENGTH
module.exports.MAX_DEPTH = MAX_DEPTH
