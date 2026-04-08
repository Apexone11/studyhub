/* ═══════════════════════════════════════════════════════════════════════════
 * checkRestrictions.js — Middleware that blocks restricted users from writes
 *
 * Follows the same pattern as guardedMode.js:
 *   - Skips safe methods (GET, HEAD, OPTIONS)
 *   - Skips unauthenticated requests (no req.user yet)
 *   - Skips admin users (admins are never restricted)
 *   - Queries UserRestriction table for active restrictions
 *   - Returns 403 with `restricted: true` flag if user is restricted
 *
 * Fail-open: if the DB query fails, the request proceeds. A database blip
 * should not block all users from posting.
 * ═══════════════════════════════════════════════════════════════════════════ */
const prisma = require('../lib/prisma')
const { ERROR_CODES, sendError } = require('./errorEnvelope')
const { captureError } = require('../monitoring/sentry')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const EXEMPT_WRITE_PREFIXES = ['/api/auth/']

function requestPath(req) {
  return String(req.originalUrl || `${req.baseUrl || ''}${req.path || ''}`).split('?')[0]
}

function isRestrictionExempt(req) {
  const path = requestPath(req)
  return EXEMPT_WRITE_PREFIXES.some((prefix) => path.startsWith(prefix))
}

async function checkRestrictions(req, res, next) {
  /* Skip read-only requests */
  if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) return next()

  /* Skip auth/session maintenance endpoints */
  if (isRestrictionExempt(req)) return next()

  /* Skip if no authenticated user (auth middleware hasn't run yet or user is anonymous) */
  if (!req.user?.userId) return next()

  /* Admins are never restricted */
  if (req.user.role === 'admin') return next()

  try {
    const now = new Date()
    const restriction = await prisma.userRestriction.findFirst({
      where: {
        userId: req.user.userId,
        OR: [
          { endsAt: null },        // permanent restriction
          { endsAt: { gt: now } }, // time-bound restriction still active
        ],
      },
      select: { id: true, type: true, reason: true },
    })

    if (!restriction) return next()

    return sendError(
      res,
      403,
      'Your account is currently restricted. You may not create or modify content.',
      ERROR_CODES.ACCOUNT_RESTRICTED,
      { restricted: true },
    )
  } catch (error) {
    /* Fail-open: DB errors should not block all user writes */
    captureError(error, { context: 'checkRestrictions', route: req.originalUrl })
    return next()
  }
}

module.exports = checkRestrictions
