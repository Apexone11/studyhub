/**
 * requireRecentMfa — step-up MFA middleware.
 *
 * What it does:
 *   Reads the current session row (by JTI) and checks whether
 *   `mfaVerifiedAt` is within `withinMs` of the current time.
 *   If it isn't, the request is short-circuited with 403 and a
 *   `code: 'MFA_STEP_UP_REQUIRED'` body so the frontend interceptor
 *   can open the step-up modal, prompt for an email-OTP code, hit
 *   POST /api/auth/mfa/step-up to refresh the timestamp, then retry
 *   the original request.
 *
 * Why a session column instead of a JWT claim:
 *   JWTs are issued at login and stay valid for 24h. Storing
 *   `mfaVerifiedAt` on the session row means the step-up endpoint
 *   can refresh it without re-issuing the cookie, and revoking the
 *   session (logout, admin force-out) wipes the timestamp atomically.
 *
 * Industry references:
 *   - NIST SP 800-63B §AAL2 — "reauthentication SHALL be required at
 *     least once per 12 hours" for AAL2 admin sessions. We use 15 min
 *     for the highest-privilege actions (delete user, refund), the
 *     same window GitHub uses for org-owner sudo-mode.
 *   - GitHub sudo-mode (Settings → Security → "you must reauthenticate
 *     before this action") — 15-min default window, OTP or password.
 *   - AWS root-account "session token elevation" — similar pattern.
 *
 * Usage:
 *   router.delete('/users/:id',
 *     requireAuth,
 *     requireAdmin,
 *     requireRecentMfa({ withinMs: 15 * 60_000 }),
 *     handler,
 *   )
 *
 * Behavior when MFA isn't configured at all (`!user.twoFaEnabled` and
 * no recovery codes), the middleware still returns 403 with
 * `code: 'MFA_STEP_UP_REQUIRED'` AND `setupPath: '/settings/security/setup-2fa'`
 * so the admin gets routed to setup-2fa first, the same UX as the
 * login-time Path A in `auth.login.controller.js`.
 *
 * Test-environment safety:
 *   When the Session row is missing because the migration hasn't been
 *   applied (P2021), the middleware falls open rather than blocking
 *   every admin action in a fresh dev DB. Same graceful-degrade
 *   pattern as `middleware/auth.js`.
 */
const prisma = require('../lib/prisma')
const log = require('../lib/logger')
const { sendError, ERROR_CODES } = require('./errorEnvelope')

const DEFAULT_WINDOW_MS = 15 * 60_000 // 15 minutes

function requireRecentMfa({ withinMs = DEFAULT_WINDOW_MS } = {}) {
  return async function requireRecentMfaMiddleware(req, res, next) {
    // requireAuth must run BEFORE this middleware. If it didn't, fail
    // closed — never permit a privileged action without identity.
    if (!req.user || !req.user.userId) {
      return sendError(res, 401, 'Login required.', ERROR_CODES.UNAUTHORIZED)
    }

    // EMERGENCY_DISABLE_ADMIN_MFA bypasses step-up too. Same sealed
    // glass-break as the login flow — if the founder is locked out
    // without 2FA they need a way through. Loud log so the override
    // is visible in Sentry.
    const emergencyOverrideRaw = process.env.EMERGENCY_DISABLE_ADMIN_MFA
    const emergencyOverride =
      typeof emergencyOverrideRaw === 'string' &&
      emergencyOverrideRaw.trim().toLowerCase() === 'true'
    if (emergencyOverride) {
      log.warn(
        {
          event: 'auth.admin_mfa_step_up_emergency_bypass',
          userId: req.user.userId,
          route: req.originalUrl,
        },
        'requireRecentMfa bypassed via EMERGENCY_DISABLE_ADMIN_MFA',
      )
      return next()
    }

    // No JTI on the JWT means a pre-Session-table session (legacy)
    // or a stripped token. We can't check freshness — fail closed.
    if (!req.sessionJti) {
      return sendError(res, 403, 'Step-up MFA required.', ERROR_CODES.FORBIDDEN, {
        code: 'MFA_STEP_UP_REQUIRED',
        reason: 'no_session',
      })
    }

    try {
      const session = await prisma.session.findUnique({
        where: { jti: req.sessionJti },
        select: { mfaVerifiedAt: true, userId: true },
      })
      if (!session) {
        return sendError(res, 401, 'Session not found.', ERROR_CODES.AUTH_EXPIRED)
      }

      const verifiedAt = session.mfaVerifiedAt
      if (!verifiedAt) {
        // Never verified on this session. Tell the frontend whether
        // the user even has 2FA configured so the step-up modal can
        // route to setup if needed.
        const user = await prisma.user.findUnique({
          where: { id: req.user.userId },
          select: { twoFaEnabled: true },
        })
        return sendError(res, 403, 'Step-up MFA required.', ERROR_CODES.FORBIDDEN, {
          code: 'MFA_STEP_UP_REQUIRED',
          reason: 'not_verified',
          // If 2FA isn't set up yet, frontend routes to setup-2fa
          // first. Otherwise it opens the OTP step-up modal.
          setupRequired: !user || !user.twoFaEnabled,
          setupPath: '/settings/security/setup-2fa',
        })
      }

      const ageMs = Date.now() - new Date(verifiedAt).getTime()
      if (ageMs > withinMs) {
        return sendError(res, 403, 'Step-up MFA required.', ERROR_CODES.FORBIDDEN, {
          code: 'MFA_STEP_UP_REQUIRED',
          reason: 'stale',
          ageMs,
          withinMs,
        })
      }

      return next()
    } catch (err) {
      // Graceful degrade ONLY when the Session table is missing in a
      // fresh dev DB. Any other error fails closed.
      const isTableMissing =
        err?.code === 'P2021' || (err?.message && err.message.includes('does not exist'))
      if (isTableMissing) {
        log.warn(
          { event: 'auth.require_recent_mfa.session_table_missing' },
          'Session table missing — requireRecentMfa skipped (run prisma migrate deploy)',
        )
        return next()
      }
      log.error(
        { event: 'auth.require_recent_mfa.failed', err: err?.message || String(err) },
        'requireRecentMfa failed',
      )
      return sendError(res, 503, 'Could not verify MFA freshness.', ERROR_CODES.INTERNAL)
    }
  }
}

module.exports = requireRecentMfa
module.exports.DEFAULT_WINDOW_MS = DEFAULT_WINDOW_MS
