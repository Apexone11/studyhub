const express = require('express')
const { DescribeKeyCommand, GenerateDataKeyCommand } = require('@aws-sdk/client-kms')
const { captureError } = require('../../monitoring/sentry')
const { getKmsClient } = require('../../lib/kmsClient')

const router = express.Router()

// ── GET /api/admin/kms/status ─────────────────────────────
router.get('/kms/status', async (req, res) => {
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
      name: err.name,
      message: err.message,
    })
  }
})

module.exports = router
