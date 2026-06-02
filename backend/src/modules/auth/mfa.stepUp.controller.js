/**
 * mfa.stepUp.controller.js — step-up MFA endpoints.
 *
 * Used by the frontend when an admin-sensitive request returns 403
 * with `code: 'MFA_STEP_UP_REQUIRED'`. The frontend interceptor opens
 * a modal that POSTs here to refresh `Session.mfaVerifiedAt`, then
 * retries the original request.
 *
 * Two endpoints (wave-12.11):
 *
 *   POST /api/auth/mfa/step-up/start
 *     Authenticated. Creates a fresh email-OTP challenge row (reusing
 *     the loginChallenge primitive) for the current user and emails
 *     the 6-digit code. Returns `{ challengeId }`.
 *
 *   POST /api/auth/mfa/step-up/verify
 *     Authenticated. Body `{ challengeId, code }` OR
 *     `{ recoveryCode }`. On success, sets the current session's
 *     `mfaVerifiedAt = NOW()` so requireRecentMfa permits the next
 *     15 minutes of admin-sensitive routes without prompting again.
 *
 * Why two steps instead of one: matches the login-challenge UX. The
 * modal opens immediately, fires `start`, the email arrives, the user
 * types the code, the modal calls `verify`. Same primitives, same
 * mental model.
 *
 * Recovery-code branch: lets a user with 2FA configured but no email
 * access (their device is offline / they're on a borrowed network)
 * still complete step-up via a stored recovery code. The
 * `flag_2fa_recovery_codes` gate from settings.recoveryCodes applies
 * here too.
 */
const express = require('express')
const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { captureError } = require('../../monitoring/sentry')
const { settingsTwoFaLimiter } = require('../../lib/rateLimiters')
const { signAuthToken, setAuthCookie } = require('../../lib/authTokens')
const { createChallenge, verifyChallenge } = require('./loginChallenge.service')
const { generateJti } = require('./session.service')
const { consumeRecoveryCode } = require('../../lib/auth/recoveryCodes')

const router = express.Router()
const requireTrustedOrigin = originAllowlist()

const FLAG_RECOVERY_CODES = 'flag_2fa_recovery_codes'

router.post(
  '/mfa/step-up/start',
  requireAuth,
  requireTrustedOrigin,
  settingsTwoFaLimiter,
  async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, email: true, twoFaEnabled: true },
      })
      if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
      if (!user.email) {
        return sendError(
          res,
          409,
          'Add an email address before using step-up MFA.',
          ERROR_CODES.CONFLICT,
          { setupPath: '/settings' },
        )
      }
      if (!user.twoFaEnabled) {
        return sendError(
          res,
          409,
          'Enable email 2FA in Settings before completing step-up MFA.',
          ERROR_CODES.CONFLICT,
          { setupPath: '/settings/security/setup-2fa' },
        )
      }

      // Reuse the loginChallenge primitive — same TTL (15 min), same
      // max-attempts (3), same hash-then-store discipline. We pass a
      // synthetic pendingDeviceId so the createChallenge validator
      // doesn't reject the call; this row is never used for trusted-
      // device promotion (the user is already authenticated).
      const { id: challengeId, code } = await createChallenge({
        userId: user.id,
        pendingDeviceId: `step-up:${req.sessionJti || 'no-jti'}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      })

      try {
        const { sendLoginChallengeCode } = require('../../lib/email/emailTemplates')
        void sendLoginChallengeCode(user.email, user.username || 'there', code, {
          ipAddress: req.ip,
        }).catch(() => {})
      } catch {
        /* email transport optional in dev */
      }

      return res.json({ challengeId, message: 'Verification code sent to your email.' })
    } catch (error) {
      captureError(error, { route: req.originalUrl, tag: 'mfa.step-up.start' })
      return sendError(res, 500, 'Could not start step-up.', ERROR_CODES.INTERNAL)
    }
  },
)

router.post(
  '/mfa/step-up/verify',
  requireAuth,
  requireTrustedOrigin,
  settingsTwoFaLimiter,
  async (req, res) => {
    if (!req.sessionJti) {
      return sendError(res, 401, 'No active session to refresh.', ERROR_CODES.AUTH_EXPIRED)
    }

    const body = req.body || {}
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : ''
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    const recoveryCode = typeof body.recoveryCode === 'string' ? body.recoveryCode : ''

    // Path A — email OTP.
    if (challengeId && code) {
      const result = await verifyChallenge({ id: challengeId, code })
      if (!result.ok) {
        const messages = {
          not_found: 'Challenge not found.',
          consumed: 'Code already used.',
          expired: 'Code expired. Start over.',
          locked: 'Too many incorrect attempts. Start over.',
          wrong: `Incorrect code. ${result.remaining} attempts remaining.`,
        }
        const status = result.reason === 'wrong' ? 401 : 410
        return sendError(
          res,
          status,
          messages[result.reason] || 'Could not verify code.',
          result.reason === 'wrong' ? ERROR_CODES.UNAUTHORIZED : ERROR_CODES.BAD_REQUEST,
          { reason: result.reason, remaining: result.remaining },
        )
      }
      // Bind the challenge to the same user. createChallenge wrote the
      // userId from req.user.userId, but defense-in-depth verify the
      // claimed challenge belongs to the caller before we refresh
      // their session.
      if (result.challenge.userId !== req.user.userId) {
        return sendError(
          res,
          403,
          'Challenge does not belong to this session.',
          ERROR_CODES.FORBIDDEN,
        )
      }
      return refreshSessionMfa(req, res, { method: 'otp' })
    }

    // Path B — recovery code (alternative factor). Flag-gated.
    if (recoveryCode) {
      try {
        const flag = await prisma.featureFlag.findUnique({
          where: { name: FLAG_RECOVERY_CODES },
          select: { enabled: true },
        })
        if (!flag || flag.enabled !== true) {
          return sendError(res, 404, 'Not found.', ERROR_CODES.NOT_FOUND)
        }
      } catch (flagErr) {
        captureError(flagErr, { route: req.originalUrl, tag: 'mfa.step-up.flag' })
        return sendError(res, 404, 'Not found.', ERROR_CODES.NOT_FOUND)
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, twoFaRecoveryHashes: true, twoFaRecoveryUsedCount: true },
      })
      if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

      const { matched, remainingHashes } = await consumeRecoveryCode({
        hashes: user.twoFaRecoveryHashes || [],
        submitted: recoveryCode,
      })
      if (!matched) {
        return sendError(res, 401, 'Invalid recovery code.', ERROR_CODES.UNAUTHORIZED)
      }
      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFaRecoveryHashes: remainingHashes,
          twoFaRecoveryUsedCount: { increment: 1 },
        },
      })
      log.warn(
        {
          event: 'auth.recovery_code.consumed',
          userId: user.id,
          context: 'step-up',
          remainingCount: remainingHashes.length,
        },
        '2FA recovery code consumed via step-up',
      )
      return refreshSessionMfa(req, res, { method: 'recovery_code' })
    }

    return sendError(
      res,
      400,
      'Submit either { challengeId, code } or { recoveryCode }.',
      ERROR_CODES.BAD_REQUEST,
    )
  },
)

async function refreshSessionMfa(req, res, { method }) {
  try {
    const now = new Date()
    // Wave-12.19 — session-fixation defense on elevation. Rotate the
    // session JTI in lockstep with stamping mfaVerifiedAt so a stolen
    // pre-elevation JWT cannot ride the 15-minute requireRecentMfa
    // window. Same pattern as rotating the session on login.
    const newJti = generateJti()
    // updateMany so a missing row (revoked session, race) returns
    // count=0 rather than throwing — frontend gets a clear 401. We
    // also gate on the old jti so a concurrent rotation can't double-
    // rotate the row.
    const updated = await prisma.session.updateMany({
      where: { jti: req.sessionJti, revokedAt: null },
      data: { jti: newJti, mfaVerifiedAt: now },
    })
    if (updated.count !== 1) {
      return sendError(res, 401, 'Session not found or revoked.', ERROR_CODES.AUTH_EXPIRED)
    }
    // Re-sign the JWT with the fresh jti and replace the auth cookie.
    // Old JWTs carrying req.sessionJti now reference a non-existent
    // row and will fail validateSession on the next request.
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, role: true },
    })
    if (!user) {
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
    }
    const token = signAuthToken(user, { jti: newJti })
    setAuthCookie(res, token)
    log.info(
      {
        event: 'auth.mfa.step_up_verified',
        userId: req.user.userId,
        method,
        jtiRotated: true,
      },
      'MFA step-up verified',
    )
    return res.json({ message: 'Step-up complete.', mfaVerifiedAt: now.toISOString() })
  } catch (error) {
    captureError(error, { route: req.originalUrl, tag: 'mfa.step-up.refresh' })
    return sendError(res, 500, 'Could not refresh session.', ERROR_CODES.INTERNAL)
  }
}

module.exports = router
