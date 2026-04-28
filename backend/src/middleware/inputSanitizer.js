/**
 * inputSanitizer.js — Phase 5 request-level input sanitization.
 *
 * Runs BEFORE route handlers on every request with a JSON body. Rejects
 * payloads that contain:
 *   - Null bytes (\0) — common injection vector
 *   - Control characters (ASCII 0-31 except \t, \n, \r)
 *   - Any single string field longer than MAX_FIELD_LENGTH
 *   - JSON nesting deeper than MAX_DEPTH
 * Normalizes duplicate query parameters (parameter pollution) to
 * first-value-wins instead of rejecting them.
 *
 * Designed to be added early in the Express middleware stack (after
 * express.json() but before any route). Failures return 400 with a
 * generic message — never reveal what was rejected or why to avoid
 * guiding attackers.
 */

// 5 MB matches the express.json() body cap mounted in src/index.js. The
// previous 10 KB cap silently rejected any legitimate large field —
// imported HTML sheets, AI-generated sheets, chunked-note bodies (32 KB
// per chunk), and Hub AI prompts — with the generic "Invalid request
// payload" message. The middleware's real purpose is null-byte /
// control-char rejection; that check runs regardless of length.
const MAX_FIELD_LENGTH = 5 * 1024 * 1024
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
 * Normalize duplicate query parameters (parameter pollution).
 * Express parses ?a=1&a=2 as { a: ['1', '2'] }. Instead of rejecting
 * (which would break routes that tolerate duplicates by taking the
 * first value, e.g. search.routes.js), we normalize arrays to their
 * first element so downstream code always sees a string.
 */
function normalizeDuplicateQueryParams(query) {
  if (!query || typeof query !== 'object') return
  for (const key of Object.keys(query)) {
    if (Array.isArray(query[key])) {
      query[key] = query[key][0]
    }
  }
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

  // Normalize duplicate query params to first-value-wins
  normalizeDuplicateQueryParams(req.query)

  next()
}

module.exports = inputSanitizer
module.exports.validatePayload = validatePayload
module.exports.isCleanString = isCleanString
module.exports.MAX_FIELD_LENGTH = MAX_FIELD_LENGTH
module.exports.MAX_DEPTH = MAX_DEPTH
