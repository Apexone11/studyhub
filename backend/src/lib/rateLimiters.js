/**
 * rateLimiters.js — Shared rate limiter presets for route modules.
 *
 * Cycle E4: Security Hardening — adds rate limiting to unprotected routes.
 *
 * All limiters use express-rate-limit with standardHeaders (RateLimit-*)
 * and key on IP address (default). Authenticated limiters key on userId.
 */
const rateLimit = require('express-rate-limit')

/**
 * Auth endpoints — strictest limits (login, register, password reset).
 * 15 requests per 15-minute window per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
})

/**
 * Write/mutation operations — moderate limits.
 * 60 requests per minute per IP.
 */
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Read operations — generous limits.
 * 200 requests per minute per IP.
 */
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
})

/**
 * Admin endpoints — moderate limits (admin-only).
 * 120 requests per minute per IP.
 */
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded.' },
})

/**
 * Preview / resource-intensive endpoints.
 * 60 requests per minute per IP.
 */
const previewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many preview requests. Please slow down.' },
})

/**
 * Public/webhook endpoints — moderate limits.
 * 100 requests per 15-minute window per IP.
 */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded.' },
})

module.exports = {
  authLimiter,
  writeLimiter,
  readLimiter,
  adminLimiter,
  previewLimiter,
  publicLimiter,
}
