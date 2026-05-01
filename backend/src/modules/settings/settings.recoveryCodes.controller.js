/**
 * settings.recoveryCodes.controller.js — 2FA recovery code endpoints.
 *
 * Behind `flag_2fa_recovery_codes` (fail-CLOSED). Requires the user to
 * have email-OTP 2FA enabled before they can generate codes — codes
 * are an *alternative* factor, not a replacement for the primary 2FA
 * setup.
 *
 * Endpoints:
 *   POST /settings/2fa/recovery-codes/regenerate
 *     Generates 10 fresh codes, replaces all stored hashes, and
 *     returns the plaintext codes ONCE. Each call invalidates the
 *     previous batch — there is no "view existing codes" endpoint.
 *
 *   GET /settings/2fa/recovery-codes/status
 *     Returns { enabled: bool, generatedAt: ISO|null,
 *               remainingCount: int, usedCount: int }.
 *     Never returns hashes or plaintext.
 */
const express = require('express')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const originAllowlist = require('../../middleware/originAllowlist')
const log = require('../../lib/logger')
const {
  generatePlaintextCodes,
  hashCodes,
  RECOVERY_CODE_COUNT,
} = require('../../lib/auth/recoveryCodes')

const router = express.Router()
const requireTrustedOrigin = originAllowlist()

const FLAG_NAME = 'flag_2fa_recovery_codes'

// Flag check is fail-CLOSED: missing row, DB error, or non-enabled
// row all return 404 (so the endpoint looks like it doesn't exist
// when the feature is off — matches the frontend fail-closed contract
// in `designV2Flags.js`).
async function gateOnFlag(req, res, next) {
  try {
    const flag = await prisma.featureFlag.findUnique({
      where: { name: FLAG_NAME },
      select: { enabled: true },
    })
    if (!flag || flag.enabled !== true) {
      return sendError(res, 404, 'Not found.', ERROR_CODES.NOT_FOUND)
    }
    next()
  } catch (error) {
    captureError(error, { route: req.originalUrl, tag: 'recovery-codes.flag' })
    return sendError(res, 404, 'Not found.', ERROR_CODES.NOT_FOUND)
  }
}

router.post(
  '/2fa/recovery-codes/regenerate',
  requireTrustedOrigin,
  gateOnFlag,
  async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, twoFaEnabled: true },
      })
      if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

      if (!user.twoFaEnabled) {
        return sendError(
          res,
          409,
          'Enable email 2FA before generating recovery codes.',
          ERROR_CODES.CONFLICT,
        )
      }

      const plaintextCodes = generatePlaintextCodes()
      const hashes = await hashCodes(plaintextCodes)

      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFaRecoveryHashes: hashes,
          twoFaRecoveryGeneratedAt: new Date(),
          // Reset the used counter on regenerate so the UI can show a
          // fresh "0 / 10 used" state.
          twoFaRecoveryUsedCount: 0,
        },
      })

      // Audit log — never log the plaintext codes themselves. Only the
      // fact that a regeneration happened.
      log.warn(
        {
          event: 'auth.recovery_codes.regenerated',
          userId: user.id,
          count: plaintextCodes.length,
        },
        '2FA recovery codes regenerated',
      )

      // Return plaintext ONCE. Re-loading the page or hitting the
      // status endpoint will not re-surface them.
      return res.json({ codes: plaintextCodes, count: plaintextCodes.length })
    } catch (error) {
      captureError(error, {
        route: req.originalUrl,
        tag: 'recovery-codes.regenerate',
      })
      return sendError(res, 500, 'Could not generate recovery codes.', ERROR_CODES.INTERNAL)
    }
  },
)

router.get('/2fa/recovery-codes/status', gateOnFlag, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        twoFaEnabled: true,
        twoFaRecoveryHashes: true,
        twoFaRecoveryGeneratedAt: true,
        twoFaRecoveryUsedCount: true,
      },
    })
    if (!user) return sendError(res, 404, 'User not found.', ERROR_CODES.NOT_FOUND)

    res.json({
      enabled: Boolean(user.twoFaEnabled),
      generatedAt: user.twoFaRecoveryGeneratedAt
        ? user.twoFaRecoveryGeneratedAt.toISOString()
        : null,
      remainingCount: Array.isArray(user.twoFaRecoveryHashes) ? user.twoFaRecoveryHashes.length : 0,
      usedCount: user.twoFaRecoveryUsedCount || 0,
      maxCount: RECOVERY_CODE_COUNT,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, tag: 'recovery-codes.status' })
    sendError(res, 500, 'Could not load status.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
