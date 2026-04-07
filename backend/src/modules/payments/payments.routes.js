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
const optionalAuth = require('../../core/auth/optionalAuth')
const { captureError } = require('../../monitoring/sentry')
const log = require('../../lib/logger')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const {
  paymentCheckoutLimiter,
  paymentPortalLimiter,
  paymentReadLimiter,
  paymentWebhookLimiter,
} = require('../../lib/rateLimiters')
const {
  DONATION_MIN_CENTS,
  DONATION_MAX_CENTS,
  DONATION_MESSAGE_MAX_LENGTH,
  PLANS,
  planFromPriceId,
} = require('./payments.constants')
const service = require('./payments.service')
const prisma = require('../../lib/prisma')
const { getUserPlan, isPro } = require('../../lib/getUserPlan')
const requireAuth = require('../../middleware/auth')

const router = express.Router()

// ── Auth middleware ───────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return sendError(res, 403, 'Admin access required.', ERROR_CODES.FORBIDDEN)
  }
  next()
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
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
    const successUrl = `${frontendUrl}/settings?tab=subscription&payment=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${frontendUrl}/pricing?payment=canceled`

    // Fetch email from DB (auth middleware doesn't include email in req.user)
    const dbUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true, username: true },
    })
    const user = {
      id: req.user.userId,
      email: dbUser?.email || '',
      username: dbUser?.username || req.user.username,
    }
    const session = await service.createSubscriptionCheckout(user, plan, successUrl, cancelUrl)

    res.json({ url: session.url, sessionId: session.id })
  } catch (error) {
    captureError(error, { context: 'checkout.subscription' })
    log.error({ err: error }, 'Failed to create subscription checkout')
    const msg =
      error.message && error.message.includes('not configured')
        ? 'Payments are not fully configured yet. Please try again later.'
        : 'Failed to create checkout session.'
    sendError(res, 500, msg, ERROR_CODES.INTERNAL)
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
    const successUrl = `${frontendUrl}/supporters?payment=success`
    const cancelUrl = `${frontendUrl}/pricing?payment=canceled`

    let user = null
    if (req.user) {
      const donorDbUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { email: true, username: true },
      })
      user = {
        id: req.user.userId,
        email: donorDbUser?.email || '',
        username: donorDbUser?.username || '',
      }
    }
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

router.post('/webhook', paymentWebhookLimiter, async (req, res) => {
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

  let handled = false
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await service.handleCheckoutCompleted(event.data.object)
        handled = true
        log.info({ eventId: event.id }, 'checkout.session.completed processed successfully')
        break
      case 'customer.subscription.updated':
        await service.handleSubscriptionUpdated(event.data.object)
        handled = true
        break
      case 'customer.subscription.deleted':
        await service.handleSubscriptionDeleted(event.data.object)
        handled = true
        break
      case 'invoice.payment_succeeded':
        await service.handleInvoicePaymentSucceeded(event.data.object)
        handled = true
        break
      case 'invoice.payment_failed':
        await service.handleInvoicePaymentFailed(event.data.object)
        handled = true
        break
      default:
        log.debug({ type: event.type }, 'Unhandled Stripe event type')
    }
  } catch (error) {
    captureError(error, { context: 'stripe.webhook', eventType: event.type })
    log.error({ err: error, eventType: event.type }, 'Error processing Stripe webhook')
    console.error('[stripe:webhook] Handler failed for', event.type, '-', error.message)
    // Return 500 so Stripe retries the webhook (up to ~3 days)
    return res.status(500).json({ error: 'Webhook handler failed', eventType: event.type })
  }

  res.json({ received: true, handled })
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

// ── GET /subscription/debug — Raw DB record for debugging ────────────────
router.get('/subscription/debug', paymentReadLimiter, requireAuth, async (req, res) => {
  try {
    // Test if the Subscription table exists by running a raw query
    let tableExists = true
    try {
      await prisma.$queryRaw`SELECT 1 FROM "Subscription" LIMIT 1`
    } catch {
      tableExists = false
    }

    const raw = tableExists
      ? await prisma.subscription.findUnique({ where: { userId: req.user.userId } })
      : null

    const planFromEnv = {
      STRIPE_PRICE_ID_PRO: process.env.STRIPE_PRICE_ID_PRO ? 'set' : 'MISSING',
      STRIPE_PRICE_ID_PRO_YEARLY: process.env.STRIPE_PRICE_ID_PRO_YEARLY ? 'set' : 'MISSING',
    }
    res.json({
      raw: raw || null,
      envStatus: planFromEnv,
      userId: req.user.userId,
      tableExists,
      migrationHint: tableExists ? null : 'Subscription table does not exist. Run: npx prisma migrate deploy',
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
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

router.get('/history/export', paymentReadLimiter, requireAuth, async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase()
    if (format !== 'csv') {
      return sendError(res, 400, 'Only csv export is supported.', ERROR_CODES.VALIDATION)
    }

    const rows = await service.getUserPaymentExportRows(req.user.userId)
    const header = ['Date', 'Type', 'Status', 'Description', 'Amount', 'Currency', 'Receipt URL']
    const csvRows = rows.map((row) => [
      new Date(row.createdAt).toISOString(),
      row.type,
      row.status,
      row.description || '',
      (Number(row.amount || 0) / 100).toFixed(2),
      String(row.currency || 'usd').toUpperCase(),
      row.receiptUrl || '',
    ])

    const csv = [header, ...csvRows]
      .map((line) => line.map(escapeCsvValue).join(','))
      .join('\n')

    const filename = `studyhub-payments-${req.user.userId}-${new Date().toISOString().slice(0, 10)}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (error) {
    captureError(error, { context: 'payments.history.export' })
    log.error({ err: error }, 'Failed to export payment history')
    sendError(res, 500, 'Failed to export payment history.', ERROR_CODES.INTERNAL)
  }
})

// ── GET /donations/leaderboard ───────────────────────────────────────────

router.get('/donations/leaderboard', paymentReadLimiter, async (_req, res) => {
  try {
    const [leaderboard, anonymousSupport] = await Promise.all([
      service.getDonationLeaderboard({ limit: 50 }),
      service.getAnonymousDonationSummary(),
    ])
    res.json({ donors: leaderboard, anonymousSupport })
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

// ── POST /admin/sync-stripe ─────────────────────────────────────────────
// Admin-only: sync all active Stripe subscriptions into the DB.
// Recovers subscriptions that were missed due to webhook failures.

router.post(
  '/admin/sync-stripe',
  paymentReadLimiter,
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      const stripe = service.getStripe()
      const subscriptions = await stripe.subscriptions.list({
        status: 'active',
        limit: 100,
        expand: ['data.customer', 'data.latest_invoice'],
      })

      let synced = 0
      let errors = 0

      for (const sub of subscriptions.data) {
        try {
          const userId = parseInt(sub.metadata?.studyhub_user_id, 10)
          if (!userId || isNaN(userId)) continue

          const priceId = sub.items?.data?.[0]?.price?.id || ''
          const plan =
            PLANS.pro_monthly?.stripePriceId === priceId
              ? 'pro_monthly'
              : PLANS.pro_yearly?.stripePriceId === priceId
                ? 'pro_yearly'
                : 'pro_monthly'

          const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id

          // Safely convert Stripe Unix timestamps (seconds) to Date objects
          const periodStart = sub.current_period_start
            ? new Date(sub.current_period_start * 1000)
            : null
          const periodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000)
            : null

          await prisma.subscription.upsert({
            where: { userId },
            create: {
              userId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: sub.id,
              stripePriceId: priceId,
              plan,
              status: sub.status,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
            },
            update: {
              stripeCustomerId: customerId,
              stripeSubscriptionId: sub.id,
              stripePriceId: priceId,
              plan,
              status: sub.status,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
              canceledAt: null,
            },
          })

          // Also sync payment record from latest invoice
          const invoice = typeof sub.latest_invoice === 'object' ? sub.latest_invoice : null
          if (invoice?.id) {
            const exists = await prisma.payment.findFirst({
              where: { stripeInvoiceId: invoice.id },
              select: { id: true },
            })
            if (!exists) {
              const dbSub = await prisma.subscription.findUnique({
                where: { userId },
                select: { id: true },
              })
              await prisma.payment.create({
                data: {
                  userId,
                  subscriptionId: dbSub?.id || null,
                  stripeInvoiceId: invoice.id,
                  stripePaymentIntentId: invoice.payment_intent || null,
                  amount: invoice.amount_paid || 0,
                  currency: (invoice.currency || 'usd').toLowerCase(),
                  status: 'succeeded',
                  description: invoice.lines?.data?.[0]?.description || `${plan} subscription`,
                  receiptUrl: invoice.hosted_invoice_url || null,
                  type: 'subscription',
                },
              })
            }
          }

          synced++
        } catch (err) {
          log.error({ err, subId: sub.id, userId: parseInt(sub.metadata?.studyhub_user_id, 10) }, 'Failed to sync subscription')
          errors++
          // Surface the last error in the response so admin can debug
          res.locals._lastSyncError = err.message
        }
      }

      log.info({ synced, errors }, 'Stripe subscription sync complete')
      res.json({ synced, errors, total: subscriptions.data.length, lastError: res.locals._lastSyncError || null })
    } catch (error) {
      captureError(error, { context: 'payments.admin.syncStripe' })
      log.error({ err: error }, 'Failed to sync Stripe subscriptions')
      sendError(res, 500, 'Failed to sync subscriptions.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── POST /subscription/sync — Self-heal: sync current user's subscription from Stripe ──
// Any authenticated user can call this to recover their subscription if the
// webhook failed (e.g., because migrations weren't deployed when the webhook fired).
router.post('/subscription/sync', paymentReadLimiter, requireAuth, async (req, res) => {
  try {
    const stripe = service.getStripe()

    // Get user's email for broader search
    const dbUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true },
    })

    // Search for customers by metadata AND email
    const customerIds = new Set()

    // Search by metadata
    try {
      const byMeta = await stripe.customers.search({
        query: `metadata["studyhub_user_id"]:"${req.user.userId}"`,
        limit: 10,
      })
      byMeta.data.forEach((c) => customerIds.add(c.id))
    } catch {
      // Search API may not be available in test mode
    }

    // Search by email
    if (dbUser?.email) {
      try {
        const byEmail = await stripe.customers.list({
          email: dbUser.email,
          limit: 10,
        })
        byEmail.data.forEach((c) => customerIds.add(c.id))
      } catch {
        // Graceful degradation
      }
    }

    if (customerIds.size === 0) {
      return res.json({
        synced: false,
        message:
          'No Stripe customer found for your account. Try subscribing from the pricing page.',
      })
    }

    // Search ALL subscription statuses across all matching customers
    let synced = false
    const statusesToCheck = ['active', 'trialing', 'past_due']

    for (const customerId of customerIds) {
      for (const status of statusesToCheck) {
        if (synced) break
        try {
          const subs = await stripe.subscriptions.list({
            customer: customerId,
            status,
            limit: 1,
          })

          for (const sub of subs.data) {
            const priceId = sub.items?.data?.[0]?.price?.id || ''
            const resolved = planFromPriceId(priceId)
            const plan = resolved || 'pro_monthly'

            const periodStart = sub.current_period_start
              ? new Date(sub.current_period_start * 1000)
              : null
            const periodEnd = sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null

            await prisma.subscription.upsert({
              where: { userId: req.user.userId },
              create: {
                userId: req.user.userId,
                stripeCustomerId: customerId,
                stripeSubscriptionId: sub.id,
                stripePriceId: priceId,
                plan,
                status: sub.status,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
              },
              update: {
                stripeCustomerId: customerId,
                stripeSubscriptionId: sub.id,
                stripePriceId: priceId,
                plan,
                status: sub.status,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
                canceledAt: null,
              },
            })

            synced = true
            log.info(
              { userId: req.user.userId, plan, subId: sub.id, customerId },
              'User self-synced subscription',
            )
            break
          }
        } catch (syncErr) {
          log.error({ err: syncErr, customerId, status, userId: req.user.userId }, 'Sync: DB write failed for subscription')
          // Surface the ACTUAL error to the user so we can debug
          return res.status(500).json({
            synced: false,
            message: `Database write failed: ${syncErr.message}`,
            hint: 'This usually means the Subscription table does not exist. Run: npx prisma migrate deploy',
            customersFound: customerIds.size,
          })
        }
      }
      if (synced) break
    }

    if (synced) {
      const updated = await service.getUserSubscription(req.user.userId)
      res.json({ synced: true, subscription: updated })
    } else {
      res.json({
        synced: false,
        message:
          'No active subscription found in Stripe. Your previous subscriptions may have been refunded or canceled. Try subscribing again from the pricing page.',
        customersFound: customerIds.size,
      })
    }
  } catch (error) {
    captureError(error, { context: 'payments.subscription.sync' })
    log.error({ err: error }, 'Failed to sync user subscription')
    sendError(res, 500, 'Failed to sync subscription.', ERROR_CODES.INTERNAL)
  }
})

// ── GET /usage ───────────────────────────────────────────────────────────

router.get('/usage', requireAuth, paymentReadLimiter, async (req, res) => {
  try {
    const plan = await getUserPlan(req.user.userId)
    const planDef = PLANS[plan] || PLANS.free
    const pro = isPro(plan)

    // Count sheets this month
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const sheetsThisMonth = await prisma.studySheet.count({
      where: { userId: req.user.userId, createdAt: { gte: startOfMonth } },
    })

    // Count private study groups
    const privateGroups = await prisma.studyGroup.count({
      where: { createdById: req.user.userId, privacy: { in: ['private', 'invite_only'] } },
    })

    res.json({
      plan,
      usage: {
        uploadsThisMonth: sheetsThisMonth,
        uploadsLimit: pro ? -1 : planDef.uploadsPerMonth,
        privateGroups,
        privateGroupsLimit: pro ? 10 : 2,
        aiMessagesPerDay: pro ? 120 : planDef.aiMessagesPerDay || 30,
        storageMb: planDef.storageMb,
      },
    })
  } catch (err) {
    captureError(err, { context: 'payments.usage' })
    log.error({ err }, 'Failed to load usage data')
    res.status(500).json({ error: 'Failed to load usage data.' })
  }
})

// ── Cancel Subscription ────────────────────────────────────────────────────
// Sets cancel_at_period_end on Stripe so the user keeps access until the
// billing period ends, then moves to free.
router.post('/subscription/cancel', paymentPortalLimiter, requireAuth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: req.user.userId },
      select: { stripeSubscriptionId: true, status: true, plan: true },
    })

    if (!sub || sub.status === 'canceled' || sub.plan === 'free') {
      return sendError(res, 400, 'No active subscription to cancel.', ERROR_CODES.BAD_REQUEST)
    }

    if (!sub.stripeSubscriptionId) {
      return sendError(res, 400, 'No Stripe subscription found.', ERROR_CODES.BAD_REQUEST)
    }

    const stripe = service.getStripe()
    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })

    await prisma.subscription.update({
      where: { userId: req.user.userId },
      data: {
        cancelAtPeriodEnd: true,
      },
    })

    log.info({ userId: req.user.userId }, 'Subscription set to cancel at period end')

    res.json({
      message: 'Subscription will be canceled at the end of your billing period.',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(updated.current_period_end * 1000),
    })
  } catch (err) {
    captureError(err, { context: 'payments.cancel' })
    log.error({ err }, 'Failed to cancel subscription')
    sendError(res, 500, 'Failed to cancel subscription.', ERROR_CODES.INTERNAL)
  }
})

// ── Reactivate Subscription (undo cancel) ─────────────────────────────────
router.post('/subscription/reactivate', paymentPortalLimiter, requireAuth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: req.user.userId },
      select: { stripeSubscriptionId: true, cancelAtPeriodEnd: true },
    })

    if (!sub?.stripeSubscriptionId || !sub.cancelAtPeriodEnd) {
      return sendError(res, 400, 'No pending cancellation to undo.', ERROR_CODES.BAD_REQUEST)
    }

    const stripe = service.getStripe()
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
    })

    await prisma.subscription.update({
      where: { userId: req.user.userId },
      data: { cancelAtPeriodEnd: false },
    })

    log.info({ userId: req.user.userId }, 'Subscription reactivated')
    res.json({ message: 'Subscription reactivated. You will continue to be billed.' })
  } catch (err) {
    captureError(err, { context: 'payments.reactivate' })
    log.error({ err }, 'Failed to reactivate subscription')
    sendError(res, 500, 'Failed to reactivate subscription.', ERROR_CODES.INTERNAL)
  }
})

// ── Sprint E: Pro-level features (referral, gift, trial, pause, student) ──
const sprintERoutes = require('./sprintE.routes')
router.use('/', sprintERoutes)

module.exports = router
