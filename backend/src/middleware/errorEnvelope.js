const ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  ADMIN_MFA_REQUIRED: 'ADMIN_MFA_REQUIRED',
  CSRF_INVALID: 'CSRF_INVALID',
  GUARDED_MODE: 'GUARDED_MODE',
  PREVIEW_TOKEN_INVALID: 'PREVIEW_TOKEN_INVALID',
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
