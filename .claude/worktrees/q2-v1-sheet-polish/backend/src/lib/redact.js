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
  if (typeof obj === 'string') return obj
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
    if (lower === 'cookie' || lower === 'set-cookie' || lower === 'authorization' || lower === 'x-csrf-token') {
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
    userId: req.user?.id || null,
  }
}

module.exports = {
  REDACTED,
  SENSITIVE_KEYS,
  maskEmail,
  redactObject,
  redactHeaders,
  safeRequestContext,
}
