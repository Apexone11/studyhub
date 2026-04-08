const {
  authLoginLimiter,
  authRegisterLimiter,
  authVerificationLimiter,
  authForgotLimiter,
  authLogoutLimiter,
  authGoogleLimiter,
} = require('../../lib/rateLimiters')

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const PASSWORD_MIN_LENGTH = 8
const COURSE_CODE_REGEX = /^[A-Z0-9-]{2,20}$/

// Re-export rate limiters with original names for backward compatibility
const loginLimiter = authLoginLimiter
const registerLimiter = authRegisterLimiter
const verificationLimiter = authVerificationLimiter
const forgotLimiter = authForgotLimiter
const logoutLimiter = authLogoutLimiter
const googleLimiter = authGoogleLimiter

module.exports = {
  USERNAME_REGEX,
  PASSWORD_MIN_LENGTH,
  COURSE_CODE_REGEX,
  loginLimiter,
  registerLimiter,
  verificationLimiter,
  forgotLimiter,
  logoutLimiter,
  googleLimiter,
}
