const ERROR_CODES = Object.freeze({
  // ── Generic HTTP-mapped codes ──────────────────────────────────────────
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION: 'VALIDATION',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',

  // ── Auth ────────────────────────────────────────────────────────────────
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  ADMIN_MFA_REQUIRED: 'ADMIN_MFA_REQUIRED',

  // ── CSRF / guarded mode ────────────────────────────────────────────────
  CSRF_INVALID: 'CSRF_INVALID',
  GUARDED_MODE: 'GUARDED_MODE',

  // ── Preview / HTML ─────────────────────────────────────────────────────
  PREVIEW_TOKEN_INVALID: 'PREVIEW_TOKEN_INVALID',
  PREVIEW_HTML_BLOCKED: 'PREVIEW_HTML_BLOCKED',

  // ── Upload ─────────────────────────────────────────────────────────────
  UPLOAD_INVALID: 'UPLOAD_INVALID',
  UPLOAD_MISSING_FILE: 'UPLOAD_MISSING_FILE',
  UPLOAD_SAVE_FAILED: 'UPLOAD_SAVE_FAILED',
  UPLOAD_SIGNATURE_MISMATCH: 'UPLOAD_SIGNATURE_MISMATCH',

  // ── Account state ──────────────────────────────────────────────────────
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_RESTRICTED: 'ACCOUNT_RESTRICTED',
  SUPER_ADMIN_PROTECTED: 'SUPER_ADMIN_PROTECTED',

  // ── Legacy (alias kept for backward compat) ────────────────────────────
  SERVER_ERROR: 'SERVER_ERROR',
})

function sendError(res, status, error, code, extra = {}) {
  return res.status(status).json({
    error,
    code,
    ...extra,
  })
}

module.exports = {
  ERROR_CODES,
  sendError,
}
