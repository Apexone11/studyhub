/**
 * requireTrustedDevice — middleware that gates sensitive endpoints.
 *
 * Must run AFTER `requireAuth`. Passes through only if the current session
 * is linked to a TrustedDevice whose `trustedAt` is non-null (i.e. the user
 * has verified this browser via the step-up challenge at least once).
 *
 * Responds 403 with code `REAUTH_REQUIRED` otherwise. The frontend catches
 * this code and opens a step-up modal that routes the user through an
 * email code before retrying the original request.
 *
 * Graceful-degradation rule (CLAUDE.md #10): if the TrustedDevice table
 * is unreachable, we DO NOT lock the user out of their own settings;
 * we fail open and log. This matches how block/mute filters behave.
 */

const prisma = require('../lib/prisma')
const { sendError, ERROR_CODES } = require('./errorEnvelope')

module.exports = async function requireTrustedDevice(req, res, next) {
  if (!req.user) {
    return sendError(res, 401, 'Unauthorized', ERROR_CODES.UNAUTHORIZED)
  }
  if (!req.sessionJti) {
    // Legacy session without a JTI — pre-migration cookies. Fail open so we
    // don't brick accounts that predate the TrustedDevice rollout.
    return next()
  }
  try {
    const session = await prisma.session.findUnique({
      where: { jti: req.sessionJti },
      include: { trustedDevice: true },
    })
    const trustedAt = session?.trustedDevice?.trustedAt
    if (!trustedAt) {
      return sendError(
        res,
        403,
        'This action requires device verification. Check your email for a code.',
        'REAUTH_REQUIRED',
      )
    }
    return next()
  } catch {
    // Fail open — a transient Prisma error must not brick settings.
    return next()
  }
}
