/**
 * POST /api/auth/login/challenge
 *
 * Redeems a 6-digit step-up code and issues a session. Marks the device
 * trusted so the next login from the same sh_did cookie doesn't challenge
 * again (until the trusted-device row is revoked).
 */

const express = require('express')
const prisma = require('../../lib/prisma')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { loginLimiter } = require('./auth.constants')
const { issueAuthenticatedSession, handleAuthError } = require('./auth.service')
const { verifyChallenge, MAX_ATTEMPTS } = require('./loginChallenge.service')

const router = express.Router()

router.post('/login/challenge', loginLimiter, async (req, res) => {
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
        expired: 'This code has expired. Please sign in again.',
        locked: 'Too many incorrect attempts. Please sign in again.',
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

    const challenge = result.challenge
    const user = await prisma.user.findUnique({ where: { id: challenge.userId } })
    if (!user) {
      return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)
    }

    // Mark the trusted device row, if we can resolve one, as verified.
    try {
      if (challenge.pendingDeviceId && challenge.pendingDeviceId !== 'unknown') {
        const { markTrusted } = require('./trustedDevice.service')
        const existing = await prisma.trustedDevice.findUnique({
          where: {
            userId_deviceId: {
              userId: user.id,
              deviceId: challenge.pendingDeviceId,
            },
          },
        })
        if (existing) await markTrusted(existing.id)
      }
    } catch {
      // best-effort
    }

    const authenticatedUser = await issueAuthenticatedSession(res, user.id, req)

    // Log the successful challenge resolution separately from login.success
    // so login activity shows both events.
    try {
      await prisma.securityEvent.create({
        data: {
          userId: user.id,
          eventType: 'login.challenge.passed',
          ipAddress: req?.ip ? String(req.ip).slice(0, 45) : null,
          userAgent: req?.headers?.['user-agent']
            ? String(req.headers['user-agent']).slice(0, 512)
            : null,
          metadata: { challengeId: challenge.id },
        },
      })
    } catch {
      // best-effort
    }

    return res.json({
      message: 'Signed in successfully.',
      user: authenticatedUser,
    })
  } catch (error) {
    return handleAuthError(req, res, error)
  }
})

module.exports = router
