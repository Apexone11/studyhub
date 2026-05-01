const express = require('express')
const requireAuth = require('../../middleware/auth')
const requireAdmin = require('../../middleware/requireAdmin')
const originAllowlist = require('../../middleware/originAllowlist')
const { legalDataRequestLimiter, legalAcceptLimiter } = require('../../lib/rateLimiters')
const controller = require('./legal.controller')

const router = express.Router()
const requireTrustedOrigin = originAllowlist()

router.get('/current', controller.getCurrentDocuments)
router.get('/current/:slug', controller.getCurrentDocumentBySlug)
router.get('/me/status', requireAuth, controller.getMyLegalStatus)
router.post(
  '/me/accept-current',
  requireAuth,
  requireTrustedOrigin,
  legalAcceptLimiter,
  controller.acceptMyCurrentLegalDocuments,
)

// Public DSAR (Data Subject Access Request) endpoint. Unauthenticated
// because users may not have an account or may have lost access to it.
// Origin allowlist + rate limit + honeypot in the controller form the
// CSRF / abuse defense triad for this public write surface.
router.post(
  '/data-request',
  requireTrustedOrigin,
  legalDataRequestLimiter,
  controller.submitDataRequest,
)

// Admin-only DSAR triage.
router.get('/admin/data-requests', requireAuth, requireAdmin, controller.listDataRequestsAdmin)
router.post(
  '/admin/data-requests/:id/resolve',
  requireAuth,
  requireAdmin,
  requireTrustedOrigin,
  controller.resolveDataRequestAdmin,
)

module.exports = router
