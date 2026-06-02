/**
 * Centralized redaction for sensitive fields in logs, Sentry, and error responses.
 *
 * Redacts: passwords, tokens, cookies, session data, emails (masked), PII vault payloads.
 */

const REDACTED = '[REDACTED]'

// Field names that should always be fully redacted
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'resetToken',
  'jwt',
  'cookie',
  'cookies',
  'authorization',
  'set-cookie',
  'x-csrf-token',
  'twoFaCode',
  'emailVerificationCode',
  'ciphertext',
  'encryptedDataKey',
  'plaintext',
  'secretKey',
  'apiKey',
  'secret',
])

// Defense-in-depth value-level scrubbing (CLAUDE.md A8). Field-name redaction
// above catches the known sensitive KEYS; these patterns catch PII that leaks
// into a free-text string value (e.g. an error message embedding an email, or
// an IP that a future engineer drops into a log context object). We over-redact
// rather than under-redact by design.
const PII_PATTERNS = [
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, mask: '[redacted-email]' },
  { re: /\b\d{3}-\d{2}-\d{4}\b/g, mask: '[redacted-ssn]' },
  { re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, mask: '[redacted-phone]' },
  { re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, mask: '[redacted-ip]' },
]

// Skip pathologically large strings — log payloads that big are abnormal and
// running 4 global regexes over them is not worth the hot-path cost.
const MAX_SCRUB_LENGTH = 10000

/**
 * Scrub PII patterns out of a free-text string. Order matters: SSN runs before
 * the phone pattern so a `123-45-6789` isn't half-eaten by the phone matcher.
 */
function scrubString(s) {
  if (typeof s !== 'string' || s.length === 0 || s.length > MAX_SCRUB_LENGTH) return s
  let out = s
  for (const { re, mask } of PII_PATTERNS) {
    out = out.replace(re, mask)
  }
  return out
}

/**
 * Mask an email: show first char + domain → t***@example.com
 */
function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return REDACTED
  const parts = email.split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return REDACTED
  return `${parts[0][0]}***@${parts[1]}`
}

/**
 * Deep-redact sensitive fields from an object.
 * Returns a new object — never mutates the original.
 */
function redactObject(obj, depth = 0) {
  if (depth > 10) return REDACTED
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') return scrubString(obj)
  if (typeof obj !== 'object') return obj
  if (Buffer.isBuffer(obj)) return REDACTED
  if (ArrayBuffer.isView(obj)) return REDACTED

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1))
  }

  const cleaned = {}
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase()
    if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(lower)) {
      cleaned[key] = REDACTED
    } else if (lower === 'email' && typeof value === 'string') {
      cleaned[key] = maskEmail(value)
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = redactObject(value, depth + 1)
    } else if (typeof value === 'string') {
      cleaned[key] = scrubString(value)
    } else {
      cleaned[key] = value
    }
  }
  return cleaned
}

/**
 * Redact sensitive headers from a request-like object.
 * Returns a new headers object.
 */
function redactHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {}
  const cleaned = {}
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (
      lower === 'cookie' ||
      lower === 'set-cookie' ||
      lower === 'authorization' ||
      lower === 'x-csrf-token'
    ) {
      cleaned[key] = REDACTED
    } else {
      cleaned[key] = value
    }
  }
  return cleaned
}

/**
 * Build a safe context object from an Express request for Sentry/logging.
 * Never includes body, cookies, or auth headers.
 */
function safeRequestContext(req) {
  if (!req) return {}
  return {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip,
    userAgent: req.get?.('user-agent'),
    userId: req.user?.userId || req.user?.id || req.user?.sub || null,
  }
}

module.exports = {
  REDACTED,
  SENSITIVE_KEYS,
  maskEmail,
  scrubString,
  redactObject,
  redactHeaders,
  safeRequestContext,
}
