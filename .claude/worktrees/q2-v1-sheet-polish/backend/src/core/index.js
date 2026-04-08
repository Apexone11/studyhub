/**
 * Core barrel export — gives modules one consistent import surface for
 * shared infrastructure that is "small and boring."
 *
 * Usage:  const { prisma, requireAuth, captureError } = require('../core')
 */
const prisma = require('./db/prisma')
const { captureError } = require('./monitoring/sentry')
const requireAuth = require('./auth/requireAuth')
const optionalAuth = require('./auth/optionalAuth')
const requireAdmin = require('./auth/requireAdmin')
const requireVerifiedEmail = require('./auth/requireVerifiedEmail')
const { AppError, ERROR_CODES, sendError, handleRouteError } = require('./http/errors')
const asyncHandler = require('./http/asyncHandler')
const { parsePositiveInt, parseOptionalInteger, parsePage } = require('./http/validate')

module.exports = {
  prisma,
  captureError,
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireVerifiedEmail,
  AppError,
  ERROR_CODES,
  sendError,
  handleRouteError,
  asyncHandler,
  parsePositiveInt,
  parseOptionalInteger,
  parsePage,
}
