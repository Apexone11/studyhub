const express = require('express')
const { z } = require('zod')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const { validate } = require('../../lib/validate')
const {
  creatorAuditConsentLimiter,
  creatorAuditConsentReadLimiter,
  creatorAuditRunLimiter,
} = require('../../lib/rateLimiters')
const {
  acceptConsent,
  getConsent,
  revokeConsent,
  runCreatorAudit,
} = require('./creatorAudit.controller')

const router = express.Router()
const requireTrustedOrigin = originAllowlist()

const runAuditSchema = z.object({
  body: z.object({
    entityType: z.enum(['sheet', 'note', 'material']),
    entityId: z.number().int().positive(),
  }),
})

const consentSchema = z.object({
  body: z.object({
    docVersion: z.string().trim().min(1).max(16),
  }),
})

router.use(requireAuth)

router.post(
  '/run',
  requireTrustedOrigin,
  creatorAuditRunLimiter,
  validate(runAuditSchema),
  runCreatorAudit,
)
router.get('/consent', creatorAuditConsentReadLimiter, getConsent)
router.post(
  '/consent',
  requireTrustedOrigin,
  creatorAuditConsentLimiter,
  validate(consentSchema),
  acceptConsent,
)
router.delete('/consent', requireTrustedOrigin, creatorAuditConsentLimiter, revokeConsent)

module.exports = router
