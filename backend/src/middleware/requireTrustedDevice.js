/**
 * requireTrustedDevice — middleware that gates sensitive endpoints.
 *
 * Must run AFTER `requireAuth`. Passes through only if the current session
 * is linked to a TrustedDevice whose `trustedAt` is non-null (i.e. the user
 * has verified this browser via the step-up challenge at least once).
 *
 * Responses:
 *   - 403 + `REAUTH_REQUIRED` when the session is not linked to a verified
 *     TrustedDevice.
 *   - 503 + `REAUTH_REQUIRED` on a transient DB error (see "Outage
 *     behavior" below). We deliberately reuse the same application
 *     error code on both paths because the user's required action is
 *     identical (re-verify or retry); the HTTP status is what
 *     distinguishes "device untrusted" from "service degraded".
 *
 * NOTE on client handling: the frontend does not currently special-case
 * REAUTH_REQUIRED — affected requests fall through to the generic
 * fetch error handler and surface a toast. A dedicated step-up modal
 * is on the roadmap; until that ships, the error message string IS the
 * user-facing UX. Keep it short and actionable.
 *
 * Outage behavior: this is a security gate on sensitive endpoints, so we
 * fail CLOSED on DB errors with 503 + REAUTH_REQUIRED. Failing open during
 * a Prisma outage would silently bypass the step-up requirement for every
 * gated endpoint — a real attacker who can induce / wait for a transient
 * DB blip could escalate. The 503 path is loud (Sentry + visible to the
 * user), which is the right shape for a temporary outage on a security
 * surface.
 *
 * Pre-migration cookies (no JTI) are still allowed through — those accounts
 * predate the TrustedDevice rollout and have no row to look up. That branch
 * is bounded and disappears when sessions naturally rotate.
 */

const prisma = require('../lib/prisma')
const { sendError, ERROR_CODES } = require('./errorEnvelope')
const { captureError } = require('../monitoring/sentry')

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
        ERROR_CODES.REAUTH_REQUIRED,
      )
    }
    return next()
  } catch (err) {
    // Fail CLOSED. Allowing the request through here would silently bypass
    // the step-up gate during a DB outage; a 503 makes the failure visible
    // and recoverable (user retries when the DB is back) instead of
    // invisibly granting access to sensitive endpoints.
    captureError(err, {
      route: 'requireTrustedDevice',
      userId: req.user?.userId || null,
      sessionJti: req.sessionJti,
      reason: 'fail-closed',
    })
    return sendError(
      res,
      503,
      'Device verification is temporarily unavailable. Please try again shortly.',
      ERROR_CODES.REAUTH_REQUIRED,
    )
  }
}
