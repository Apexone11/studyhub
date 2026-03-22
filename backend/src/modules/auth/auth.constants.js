const rateLimit = require('express-rate-limit')

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/
const PASSWORD_MIN_LENGTH = 8
const COURSE_CODE_REGEX = /^[A-Z0-9-]{2,20}$/

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: { error: 'Too many verification attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const logoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many Google sign-in attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

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
