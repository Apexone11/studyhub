/**
 * newsletter.routes.js — routes for the Product-Updates newsletter (#291).
 *
 * Public: archive list, single issue, unsubscribe (GET human-click + POST
 * one-click). Admin: CRUD + publish/unpublish + send. All admin writes apply
 * requireAuth + requireAdmin + originAllowlist (A11) + a limiter.
 *
 * Route ordering matters: the literal `/admin` and `/unsubscribe` GET routes
 * are declared BEFORE the catch-all GET `/:slug` so the slug param can't
 * swallow them.
 */
const express = require('express')
const requireAuth = require('../../middleware/auth')
const requireAdmin = require('../../middleware/requireAdmin')
const originAllowlist = require('../../middleware/originAllowlist')
const {
  newsletterReadLimiter,
  newsletterAdminLimiter,
  newsletterSendLimiter,
  newsletterUnsubscribeLimiter,
} = require('../../lib/rateLimiters')
const ctrl = require('./newsletter.controller')

const requireTrustedOrigin = originAllowlist()
const router = express.Router()

// ── public reads ───────────────────────────────────────────────
router.get('/', newsletterReadLimiter, ctrl.listPublic)

// ── admin reads (declared before /:slug) ───────────────────────
router.get('/admin', requireAuth, requireAdmin, newsletterAdminLimiter, ctrl.adminList)
router.get('/admin/:id', requireAuth, requireAdmin, newsletterAdminLimiter, ctrl.adminGet)

// ── unsubscribe (public, declared before /:slug) ───────────────
// Intentionally NO originAllowlist here (unlike the admin writes): RFC 8058
// one-click unsubscribe POSTs originate from the mail client, not the app
// origin, so a trusted-origin check would break them. CSRF is not a concern —
// the HMAC unsubscribe token IS the authorization, and a forged request can
// only flip the token-holder's own emailProductUpdates flag.
router.get('/unsubscribe', newsletterUnsubscribeLimiter, ctrl.getUnsubscribe)
router.post('/unsubscribe', newsletterUnsubscribeLimiter, ctrl.postUnsubscribe)

// ── admin writes ───────────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  requireAdmin,
  requireTrustedOrigin,
  newsletterAdminLimiter,
  ctrl.create,
)
router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  requireTrustedOrigin,
  newsletterAdminLimiter,
  ctrl.update,
)
router.post(
  '/:id/publish',
  requireAuth,
  requireAdmin,
  requireTrustedOrigin,
  newsletterAdminLimiter,
  ctrl.publish,
)
router.post(
  '/:id/unpublish',
  requireAuth,
  requireAdmin,
  requireTrustedOrigin,
  newsletterAdminLimiter,
  ctrl.unpublish,
)
router.post(
  '/:id/send',
  requireAuth,
  requireAdmin,
  requireTrustedOrigin,
  newsletterSendLimiter,
  ctrl.send,
)
router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  requireTrustedOrigin,
  newsletterAdminLimiter,
  ctrl.remove,
)

// ── public single issue (catch-all GET, declared last) ─────────
router.get('/:slug', newsletterReadLimiter, ctrl.getBySlugPublic)

module.exports = router
