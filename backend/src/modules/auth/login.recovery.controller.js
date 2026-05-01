/**
 * POST /api/auth/login/recovery-code
 *
 * Alternative-factor login when the user can't receive the email OTP.
 * Consumes a single recovery code, marks the challenge consumed, and
 * issues a session. Same exit shape as the OTP path
 * (`/api/auth/login/challenge`) so the frontend can reuse the success
 * handler.
 *
 * Behind `flag_2fa_recovery_codes`. Fail-CLOSED: if the flag row is
 * missing or `enabled !== true`, the endpoint returns 404.
 *
 * Why a separate endpoint instead of overloading the OTP route:
 * lower regression risk on the primary login flow. Keeps OTP logic
 * untouched. Can be removed in one commit if the recovery feature is
 * ever rolled back.
 */
const express = require('express')
const prisma = require('../../lib/prisma')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { loginLimiter } = require('./auth.constants')
const { issueAuthenticatedSession, handleAuthError } = require('./auth.service')
const { captureError } = require('../../monitoring/sentry')
const log = require('../../lib/logger')
const { consumeRecoveryCode } = require('../../lib/auth/recoveryCodes')

const router = express.Router()
const FLAG_NAME = 'flag_2fa_recovery_codes'

router.post('/login/recovery-code', loginLimiter, async (req, res) => {
  // Flag check (fail-CLOSED). Returns 404 — same shape an attacker
  // probing for the endpoint would see if it didn't exist.
  try {
    const flag = await prisma.featureFlag.findUnique({
      where: { name: FLAG_NAME },
      select: { enabled: true },
    })
    if (!flag || flag.enabled !== true) {
      return sendError(res, 404, 'Not found.', ERROR_CODES.NOT_FOUND)
    }
  } catch (error) {
    captureError(error, { route: req.originalUrl, tag: 'recovery-login.flag' })
    return sendError(res, 404, 'Not found.', ERROR_CODES.NOT_FOUND)
  }

  const body = req.body || {}
  const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : ''
  const submittedCode = typeof body.recoveryCode === 'string' ? body.recoveryCode : ''

  if (!challengeId || !submittedCode) {
    return sendError(res, 400, 'Missing challenge id or recovery code.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const challenge = await prisma.loginChallenge.findUnique({ where: { id: challengeId } })
    if (!challenge) {
      return sendError(res, 410, 'Challenge not found or already used.', ERROR_CODES.BAD_REQUEST)
    }
    if (challenge.consumedAt) {
      return sendError(res, 410, 'Challenge already used.', ERROR_CODES.BAD_REQUEST)
    }
    if (challenge.expiresAt < new Date()) {
      return sendError(
        res,
        410,
        'This code has expired. Please sign in again.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: challenge.userId },
      select: {
        id: true,
        twoFaRecoveryHashes: true,
        twoFaRecoveryUsedCount: true,
      },
    })
    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    const { matched, remainingHashes } = await consumeRecoveryCode({
      hashes: user.twoFaRecoveryHashes || [],
      submitted: submittedCode,
    })
    if (!matched) {
      return sendError(res, 401, 'Invalid recovery code.', ERROR_CODES.UNAUTHORIZED)
    }

    // Atomic claim of the challenge (matches verifyChallenge's race-
    // safe pattern) — only the first parallel recovery attempt wins.
    const consumeAt = new Date()
    const claimed = await prisma.loginChallenge.updateMany({
      where: { id: challengeId, consumedAt: null, expiresAt: { gte: consumeAt } },
      data: { consumedAt: consumeAt },
    })
    if (claimed.count !== 1) {
      return sendError(
        res,
        410,
        'Challenge was consumed by another request.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    // Drop the matching hash + bump used count. Done after the
    // challenge claim so a lost-race recovery attempt doesn't burn a
    // code without granting a session.
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
        remainingCount: remainingHashes.length,
      },
      '2FA recovery code consumed',
    )

    const authenticatedUser = await issueAuthenticatedSession(res, user.id, req)

    try {
      await prisma.securityEvent.create({
        data: {
          userId: user.id,
          eventType: 'login.recovery_code.consumed',
          ipAddress: req?.ip ? String(req.ip).slice(0, 45) : null,
          userAgent: req?.headers?.['user-agent']
            ? String(req.headers['user-agent']).slice(0, 512)
            : null,
          metadata: {
            challengeId: challenge.id,
            remainingRecoveryCodes: remainingHashes.length,
          },
        },
      })
    } catch {
      /* best-effort */
    }

    return res.json({
      message: 'Signed in successfully.',
      user: authenticatedUser,
      remainingRecoveryCodes: remainingHashes.length,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

module.exports = router
