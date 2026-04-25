/**
 * POST /api/auth/security/reauth/send
 * POST /api/auth/security/reauth/verify
 *
 * Re-authenticate the current session's trusted device. Issued when a
 * sensitive action (e.g. delete account) hits the requireTrustedDevice gate.
 *
 * Reuses the LoginChallenge table from Phase 3 — a new challenge with a
 * 6-digit code, 15 min TTL, 3 attempt cap. On success we set the linked
 * TrustedDevice.trustedAt, so subsequent requests pass the middleware.
 */

const express = require('express')
const prisma = require('../../lib/prisma')
const requireAuth = require('../../middleware/auth')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { sessionRevokeLimiter } = require('../../lib/rateLimiters')
const { createChallenge, verifyChallenge, MAX_ATTEMPTS } = require('./loginChallenge.service')
const { markTrusted } = require('./trustedDevice.service')
const { sendLoginChallengeCode } = require('../../lib/email/emailTemplates')

const router = express.Router()

router.post('/security/reauth/send', requireAuth, sessionRevokeLimiter, async (req, res) => {
  try {
    const userId = req.user.userId
    if (!req.sessionJti) {
      return sendError(
        res,
        400,
        'Current session does not support re-authentication. Please log in again.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    const session = await prisma.session.findUnique({
      where: { jti: req.sessionJti },
      include: { trustedDevice: true },
    })
    if (!session) {
      return sendError(res, 401, 'Session not found.', ERROR_CODES.UNAUTHORIZED)
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.email) {
      return sendError(
        res,
        400,
        'No email address on file to receive the verification code.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    const deviceId = session.trustedDevice?.deviceId || `session-${session.id}`

    const { id, code } = await createChallenge({
      userId,
      pendingDeviceId: deviceId,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'] || null,
    })

    void sendLoginChallengeCode(user.email, user.username || 'there', code, {
      city: session.city,
      region: session.region,
      country: session.country,
      ipAddress: req.ip,
    }).catch(() => {})

    return res.json({ challengeId: id })
  } catch {
    return sendError(res, 500, 'Could not send verification code.', ERROR_CODES.INTERNAL)
  }
})

router.post('/security/reauth/verify', requireAuth, sessionRevokeLimiter, async (req, res) => {
  const body = req.body || {}
  const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''

  if (!challengeId || !code) {
    return sendError(res, 400, 'Missing challenge id or code.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const result = await verifyChallenge({ id: challengeId, code })
    if (!result.ok) {
      const messages = {
        not_found: 'Challenge not found or already used.',
        consumed: 'Challenge already used.',
        expired: 'This code has expired. Please request a new one.',
        locked: 'Too many incorrect attempts. Please request a new code.',
        wrong: `Incorrect code. ${result.remaining} of ${MAX_ATTEMPTS} attempts remaining.`,
      }
      const status = result.reason === 'wrong' ? 401 : 410
      return sendError(
        res,
        status,
        messages[result.reason] || 'Could not verify code.',
        result.reason === 'wrong' ? ERROR_CODES.UNAUTHORIZED : ERROR_CODES.BAD_REQUEST,
        { remaining: result.remaining, reason: result.reason },
      )
    }

    // Verify the challenge belongs to the current user (prevents a stolen
    // challengeId from verifying a different session). 403 + FORBIDDEN
    // is the correct semantic — the request IS authenticated, it's just
    // not authorized for THIS challenge. UNAUTHORIZED would tell the
    // frontend's interceptor to log the user out, which is wrong here.
    if (result.challenge.userId !== req.user.userId) {
      return sendError(
        res,
        403,
        'Challenge does not belong to this account.',
        ERROR_CODES.FORBIDDEN,
      )
    }

    // Mark the session's linked trusted device as verified.
    if (req.sessionJti) {
      const session = await prisma.session.findUnique({
        where: { jti: req.sessionJti },
        include: { trustedDevice: true },
      })
      if (session?.trustedDevice) {
        await markTrusted(session.trustedDevice.id)
      }
    }

    return res.json({ message: 'Verified.' })
  } catch {
    return sendError(res, 500, 'Could not verify code.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
