const express = require('express')
const { DescribeKeyCommand, GenerateDataKeyCommand } = require('@aws-sdk/client-kms')
const { captureError } = require('../../monitoring/sentry')
const { getKmsClient } = require('../../lib/kms/kmsClient')

const router = express.Router()

// ── GET /api/admin/kms/status ─────────────────────────────
// Gated behind ENABLE_KMS_STATUS=true (default: disabled in production)
router.get('/kms/status', (req, res, next) => {
  if (process.env.ENABLE_KMS_STATUS !== 'true') {
    return res.status(404).json({ error: 'Not found' })
  }
  next()
}, async (req, res) => {
  try {
    const keyId = process.env.KMS_KEY_ARN
    if (!keyId) {
      return res.status(500).json({ ok: false, error: 'KMS_KEY_ARN not configured.' })
    }

    const kms = getKmsClient()

    const describe = await kms.send(new DescribeKeyCommand({ KeyId: keyId }))

    // Generate a data key to prove the encrypt path works end-to-end.
    await kms.send(new GenerateDataKeyCommand({ KeyId: keyId, KeySpec: 'AES_256' }))

    res.json({
      ok: true,
      region: process.env.AWS_REGION || 'us-east-2',
      keyId: describe?.KeyMetadata?.KeyId || null,
      keyState: describe?.KeyMetadata?.KeyState || null,
      arn: describe?.KeyMetadata?.Arn || null,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({
      ok: false,
      error: 'KMS service error',
    })
  }
})

module.exports = router
