/**
 * payments.routes.js — Stripe payment endpoints for StudyHub.
 *
 * Mounted at /api/payments in index.js.
 *
 * Endpoints:
 *   POST /checkout/subscription   — Create subscription checkout session (auth)
 *   POST /checkout/donation       — Create donation checkout session (optional auth)
 *   POST /webhook                 — Stripe webhook handler (raw body, signature verified)
 *   GET  /subscription            — Get current user subscription (auth)
 *   POST /portal                  — Create Stripe Customer Portal session (auth)
 *   GET  /history                 — Get payment history (auth)
 *   GET  /donations/leaderboard   — Public donation leaderboard
 *   GET  /subscribers             — Public subscriber showcase
 *   GET  /admin/revenue           — Admin revenue analytics (admin only)
 */
const express = require('express')
const { verifyAuthToken, getAuthTokenFromRequest } = require('../../lib/authTokens')
const { captureError } = require('../../monitoring/sentry')
const log = require('../../lib/logger')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const {
  paymentCheckoutLimiter,
  paymentPortalLimiter,
  paymentReadLimiter,
} = require('../../lib/rateLimiters')
const {
  DONATION_MIN_CENTS,
  DONATION_MAX_CENTS,
  DONATION_MESSAGE_MAX_LENGTH,
} = require('./payments.constants')
const service = require('./payments.service')

const router = express.Router()

// ── Auth middleware ───────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const token = getAuthTokenFromRequest(req)
  if (!token) return sendError(res, 401, 'Authentication required.', ERROR_CODES.UNAUTHORIZED)

  try {
    const payload = verifyAuthToken(token)
    req.user = payload
    next()
  } catch {
    return sendError(res, 401, 'Invalid or expired token.', ERROR_CODES.UNAUTHORIZED)
  }
}

function optionalAuth(req, _res, next) {
  const token = getAuthTokenFromRequest(req)
  if (token) {
    try {
      req.user = verifyAuthToken(token)
    } catch {
      req.user = null
    }
  }
  next()
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return sendError(res, 403, 'Admin access required.', ERROR_CODES.FORBIDDEN)
  }
  next()
}

// ── POST /checkout/subscription ──────────────────────────────────────────

router.post('/checkout/subscription', paymentCheckoutLimiter, requireAuth, async (req, res) => {
  try {
    const { plan } = req.body
    if (!plan || !['pro_monthly', 'pro_yearly'].includes(plan)) {
      return sendError(
        res,
        400,
        'Invalid plan. Must be pro_monthly or pro_yearly.',
        ERROR_CODES.VALIDATION,
      )
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const successUrl = `${frontendUrl}/settings?payment=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${frontendUrl}/pricing?payment=canceled`

    const user = { id: req.user.userId, email: req.user.email, username: req.user.username }
    const session = await service.createSubscriptionCheckout(user, plan, successUrl, cancelUrl)

    res.json({ url: session.url, sessionId: session.id })
  } catch (error) {
    captureError(error, { context: 'checkout.subscription' })
    log.error({ err: error }, 'Failed to create subscription checkout')
    sendError(res, 500, 'Failed to create checkout session.', ERROR_CODES.INTERNAL)
  }
})

// ── POST /checkout/donation ──────────────────────────────────────────────

router.post('/checkout/donation', paymentCheckoutLimiter, optionalAuth, async (req, res) => {
  try {
    const { amount, message, anonymous } = req.body

    // Validate amount (in dollars from frontend, convert to cents)
    const amountCents = Math.round(Number(amount) * 100)
    if (
      isNaN(amountCents) ||
      amountCents < DONATION_MIN_CENTS ||
      amountCents > DONATION_MAX_CENTS
    ) {
      return sendError(
        res,
        400,
        `Donation amount must be between $${DONATION_MIN_CENTS / 100} and $${DONATION_MAX_CENTS / 100}.`,
        ERROR_CODES.VALIDATION,
      )
    }

    if (message && message.length > DONATION_MESSAGE_MAX_LENGTH) {
      return sendError(
        res,
        400,
        `Message must be under ${DONATION_MESSAGE_MAX_LENGTH} characters.`,
        ERROR_CODES.VALIDATION,
      )
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const successUrl = `${frontendUrl}/donate?payment=success`
    const cancelUrl = `${frontendUrl}/donate?payment=canceled`

    const user = req.user
      ? { id: req.user.userId, email: req.user.email, username: req.user.username }
      : null
    const session = await service.createDonationCheckout({
      user,
      amountCents,
      message: message || '',
      anonymous: Boolean(anonymous),
      successUrl,
      cancelUrl,
    })

    res.json({ url: session.url, sessionId: session.id })
  } catch (error) {
    captureError(error, { context: 'checkout.donation' })
    log.error({ err: error }, 'Failed to create donation checkout')
    sendError(res, 500, 'Failed to create checkout session.', ERROR_CODES.INTERNAL)
  }
})

// ── POST /webhook ────────────────────────────────────────────────────────
// Stripe sends events here. Must receive raw body for signature verification.
// This route uses express.raw() middleware — the parent index.js mounts this
// BEFORE express.json(), similar to the existing /api/webhooks route.

router.post('/webhook', async (req, res) => {
  const stripe = service.getStripe()
  const sig = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    log.error('STRIPE_WEBHOOK_SECRET is not configured')
    return res.status(500).json({ error: 'Webhook not configured' })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
  } catch (err) {
    log.warn({ err: err.message }, 'Stripe webhook signature verification failed')
    return res.status(400).json({ error: 'Webhook signature verification failed' })
  }

  log.info({ type: event.type, id: event.id }, 'Stripe webhook received')

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await service.handleCheckoutCompleted(event.data.object)
        break
      case 'customer.subscription.updated':
        await service.handleSubscriptionUpdated(event.data.object)
        break
      case 'customer.subscription.deleted':
        await service.handleSubscriptionDeleted(event.data.object)
        break
      case 'invoice.payment_succeeded':
        await service.handleInvoicePaymentSucceeded(event.data.object)
        break
      case 'invoice.payment_failed':
        await service.handleInvoicePaymentFailed(event.data.object)
        break
      default:
        log.debug({ type: event.type }, 'Unhandled Stripe event type')
    }
  } catch (error) {
    captureError(error, { context: 'stripe.webhook', eventType: event.type })
    log.error({ err: error, eventType: event.type }, 'Error processing Stripe webhook')
    // Return 200 anyway so Stripe does not retry endlessly
  }

  res.json({ received: true })
})

// ── GET /subscription ────────────────────────────────────────────────────

router.get('/subscription', paymentReadLimiter, requireAuth, async (req, res) => {
  try {
    const sub = await service.getUserSubscription(req.user.userId)
    res.json(sub)
  } catch (error) {
    captureError(error, { context: 'payments.subscription' })
    log.error({ err: error }, 'Failed to get subscription')
    sendError(res, 500, 'Failed to retrieve subscription.', ERROR_CODES.INTERNAL)
  }
})

// ── POST /portal ─────────────────────────────────────────────────────────

router.post('/portal', paymentPortalLimiter, requireAuth, async (req, res) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const returnUrl = `${frontendUrl}/settings`

    const user = { id: req.user.userId }
    const session = await service.createPortalSession(user, returnUrl)

    res.json({ url: session.url })
  } catch (error) {
    captureError(error, { context: 'payments.portal' })
    log.error({ err: error }, 'Failed to create portal session')

    if (error.message === 'No active subscription found') {
      return sendError(res, 404, 'No active subscription found.', ERROR_CODES.NOT_FOUND)
    }
    sendError(res, 500, 'Failed to create portal session.', ERROR_CODES.INTERNAL)
  }
})

// ── GET /history ─────────────────────────────────────────────────────────

router.get('/history', paymentReadLimiter, requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20))

    const result = await service.getUserPayments(req.user.userId, { page, limit })
    res.json(result)
  } catch (error) {
    captureError(error, { context: 'payments.history' })
    log.error({ err: error }, 'Failed to get payment history')
    sendError(res, 500, 'Failed to retrieve payment history.', ERROR_CODES.INTERNAL)
  }
})

// ── GET /donations/leaderboard ───────────────────────────────────────────

router.get('/donations/leaderboard', paymentReadLimiter, async (_req, res) => {
  try {
    const leaderboard = await service.getDonationLeaderboard({ limit: 50 })
    res.json({ donors: leaderboard })
  } catch (error) {
    captureError(error, { context: 'payments.leaderboard' })
    log.error({ err: error }, 'Failed to get donation leaderboard')
    sendError(res, 500, 'Failed to retrieve leaderboard.', ERROR_CODES.INTERNAL)
  }
})

// ── GET /subscribers ─────────────────────────────────────────────────────

router.get('/subscribers', paymentReadLimiter, async (_req, res) => {
  try {
    const subscribers = await service.getSubscriberShowcase({ limit: 100 })
    res.json({ subscribers })
  } catch (error) {
    captureError(error, { context: 'payments.subscribers' })
    log.error({ err: error }, 'Failed to get subscriber showcase')
    sendError(res, 500, 'Failed to retrieve subscribers.', ERROR_CODES.INTERNAL)
  }
})

// ── GET /admin/revenue ───────────────────────────────────────────────────

router.get('/admin/revenue', paymentReadLimiter, requireAuth, requireAdmin, async (_req, res) => {
  try {
    const analytics = await service.getRevenueAnalytics()
    res.json(analytics)
  } catch (error) {
    captureError(error, { context: 'payments.admin.revenue' })
    log.error({ err: error }, 'Failed to get revenue analytics')
    sendError(res, 500, 'Failed to retrieve revenue analytics.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
