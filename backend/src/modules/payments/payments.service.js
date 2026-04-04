/**
 * payments.service.js — Stripe SDK interactions and DB operations for payments.
 */
const Stripe = require('stripe')
const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const {
  PLANS,
  DONATION_MIN_CENTS,
  DONATION_MAX_CENTS,
  planFromPriceId,
} = require('./payments.constants')

// Stripe client — initialized lazily so the module can load even when the
// key is not yet configured (e.g., in test environments).
let _stripe = null
function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
    _stripe = new Stripe(key)
  }
  return _stripe
}

// ── Stripe Customer ──────────────────────────────────────────────────────

/**
 * Find or create a Stripe customer for the given user.
 */
async function getOrCreateCustomer(user) {
  const stripe = getStripe()

  // Check if user already has a subscription record with a Stripe customer ID
  // Wrapped in try-catch for graceful degradation if Subscription table does not exist yet
  try {
    const existing = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { stripeCustomerId: true },
    })

    if (existing?.stripeCustomerId) {
      return existing.stripeCustomerId
    }
  } catch (err) {
    // Subscription table may not exist yet (migration not deployed)
    log.warn({ err: err.message }, 'Subscription table query failed, creating new Stripe customer')
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email: user.email || undefined,
    metadata: {
      studyhub_user_id: String(user.id),
      studyhub_username: user.username,
    },
  })

  return customer.id
}

// ── Checkout Sessions ────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout Session for a subscription plan.
 */
async function createSubscriptionCheckout(user, plan, successUrl, cancelUrl) {
  const stripe = getStripe()
  const planDef = PLANS[plan]
  if (!planDef) {
    throw new Error(`Invalid plan: ${plan}`)
  }
  if (!planDef.stripePriceId) {
    throw new Error(
      `Stripe price ID not configured for plan: ${plan}. Set STRIPE_PRICE_ID_PRO and STRIPE_PRICE_ID_PRO_YEARLY env vars.`,
    )
  }

  const customerId = await getOrCreateCustomer(user)

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: planDef.stripePriceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      studyhub_user_id: String(user.id),
      plan,
    },
    subscription_data: {
      metadata: {
        studyhub_user_id: String(user.id),
        plan,
      },
    },
  })

  return session
}

/**
 * Create a Stripe Checkout Session for a one-time donation.
 */
async function createDonationCheckout({
  user,
  amountCents,
  message,
  anonymous,
  successUrl,
  cancelUrl,
}) {
  const stripe = getStripe()

  if (amountCents < DONATION_MIN_CENTS || amountCents > DONATION_MAX_CENTS) {
    throw new Error(
      `Donation amount must be between $${DONATION_MIN_CENTS / 100} and $${DONATION_MAX_CENTS / 100}`,
    )
  }

  const sessionParams = {
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'StudyHub Donation',
            description: 'Support StudyHub and help keep it free for students',
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'donation',
      studyhub_user_id: user ? String(user.id) : 'anonymous',
      donor_message: message || '',
      anonymous: anonymous ? 'true' : 'false',
    },
  }

  // Attach customer if authenticated
  if (user) {
    const customerId = await getOrCreateCustomer(user)
    sessionParams.customer = customerId
  }

  const session = await stripe.checkout.sessions.create(sessionParams)

  // Record pending donation
  await prisma.donation.create({
    data: {
      userId: user?.id || null,
      stripeSessionId: session.id,
      amount: amountCents,
      currency: 'usd',
      status: 'pending',
      donorName: anonymous ? null : user?.username || null,
      donorMessage: message || null,
      anonymous: Boolean(anonymous),
    },
  })

  return session
}

/**
 * Create a Stripe Customer Portal session for subscription management.
 */
async function createPortalSession(user, returnUrl) {
  const stripe = getStripe()

  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
    select: { stripeCustomerId: true },
  })

  if (!sub?.stripeCustomerId) {
    throw new Error('No active subscription found')
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: returnUrl,
  })

  return session
}

// ── Webhook Handlers ─────────────────────────────────────────────────────

/**
 * Handle checkout.session.completed event.
 */
async function handleCheckoutCompleted(session) {
  const metadata = session.metadata || {}

  // Donation checkout
  if (metadata.type === 'donation') {
    await prisma.donation.updateMany({
      where: { stripeSessionId: session.id },
      data: {
        status: 'completed',
        stripePaymentIntentId: session.payment_intent || null,
      },
    })
    log.info({ sessionId: session.id }, 'Donation completed')
    return
  }

  // Gift subscription checkout
  if (metadata.type === 'gift') {
    try {
      await prisma.giftSubscription.updateMany({
        where: { stripeSessionId: session.id },
        data: { status: 'paid' },
      })
      log.info({ sessionId: session.id, giftCode: metadata.gift_code }, 'Gift subscription paid')
    } catch (err) {
      log.warn({ err: err.message }, 'Failed to update gift status (table may not exist)')
    }
    return
  }

  // Subscription checkout
  const userId = parseInt(metadata.studyhub_user_id, 10)
  const plan = metadata.plan || 'pro_monthly'
  log.info({ metadata, userId, plan, sessionId: session.id }, 'Processing subscription checkout')
  if (!userId || isNaN(userId)) {
    log.warn({ metadata }, 'checkout.session.completed missing user ID')
    return
  }

  const stripeSubscriptionId = session.subscription
  if (!stripeSubscriptionId) {
    log.warn({ sessionId: session.id }, 'checkout.session.completed missing subscription ID')
    return
  }

  const stripe = getStripe()
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId)

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeCustomerId: session.customer,
      stripeSubscriptionId,
      stripePriceId: stripeSub.items.data[0]?.price?.id || '',
      plan,
      status: stripeSub.status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    },
    update: {
      stripeCustomerId: session.customer,
      stripeSubscriptionId,
      stripePriceId: stripeSub.items.data[0]?.price?.id || '',
      plan,
      status: stripeSub.status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      canceledAt: null,
    },
  })

  log.info({ userId, plan, stripeSubscriptionId }, 'Subscription activated via checkout')

  // Also create a Payment record immediately so the user sees payment history
  // even if the invoice.payment_succeeded webhook is delayed or misconfigured.
  try {
    const latestInvoice = stripeSub.latest_invoice
    const invoiceId = typeof latestInvoice === 'string' ? latestInvoice : latestInvoice?.id
    if (invoiceId) {
      const exists = await prisma.payment.findFirst({
        where: { stripeInvoiceId: invoiceId },
        select: { id: true },
      })
      if (!exists) {
        const sub = await prisma.subscription.findUnique({
          where: { userId },
          select: { id: true },
        })
        const invoice = await stripe.invoices.retrieve(invoiceId)
        await prisma.payment.create({
          data: {
            userId,
            subscriptionId: sub?.id || null,
            stripeInvoiceId: invoiceId,
            stripePaymentIntentId: invoice.payment_intent || session.payment_intent || null,
            amount: invoice.amount_paid || session.amount_total || 0,
            currency: (invoice.currency || 'usd').toLowerCase(),
            status: 'succeeded',
            description:
              invoice.lines?.data?.[0]?.description ||
              `${plan === 'pro_yearly' ? 'Pro Yearly' : 'Pro Monthly'} subscription`,
            receiptUrl: invoice.hosted_invoice_url || null,
            type: 'subscription',
          },
        })
        log.info({ userId, invoiceId }, 'Payment record created from checkout')
      }
    }
  } catch (err) {
    // Non-fatal — payment record may be created later by invoice webhook
    log.warn({ err: err.message, userId }, 'Failed to create payment record from checkout')
  }
}

/**
 * Handle customer.subscription.updated event.
 */
async function handleSubscriptionUpdated(subscription) {
  const userId = parseInt(subscription.metadata?.studyhub_user_id, 10)
  if (!userId || isNaN(userId)) {
    log.warn(
      { subscriptionId: subscription.id },
      'subscription.updated missing user ID in metadata',
    )
    return
  }

  const priceId = subscription.items?.data?.[0]?.price?.id || ''
  const plan = planFromPriceId(priceId)

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    },
    update: {
      stripePriceId: priceId,
      plan,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    },
  })

  log.info({ userId, plan, status: subscription.status }, 'Subscription updated')
}

/**
 * Handle customer.subscription.deleted event.
 */
async function handleSubscriptionDeleted(subscription) {
  const userId = parseInt(subscription.metadata?.studyhub_user_id, 10)
  if (!userId || isNaN(userId)) {
    log.warn(
      { subscriptionId: subscription.id },
      'subscription.deleted missing user ID in metadata',
    )
    return
  }

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: 'canceled',
      canceledAt: new Date(),
    },
  })

  log.info({ userId, subscriptionId: subscription.id }, 'Subscription canceled')
}

/**
 * Handle invoice.payment_succeeded event.
 */
async function handleInvoicePaymentSucceeded(invoice) {
  const customerId = invoice.customer
  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true, userId: true },
  })

  if (!sub) {
    log.warn(
      { customerId, invoiceId: invoice.id },
      'invoice.payment_succeeded — no matching subscription',
    )
    return
  }

  // Avoid duplicate payment records
  const exists = await prisma.payment.findUnique({
    where: { stripeInvoiceId: invoice.id },
    select: { id: true },
  })
  if (exists) return

  await prisma.payment.create({
    data: {
      userId: sub.userId,
      subscriptionId: sub.id,
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId: invoice.payment_intent || null,
      amount: invoice.amount_paid || 0,
      currency: (invoice.currency || 'usd').toLowerCase(),
      status: 'succeeded',
      description: invoice.lines?.data?.[0]?.description || 'Subscription payment',
      receiptUrl: invoice.hosted_invoice_url || null,
      type: 'subscription',
    },
  })

  log.info({ userId: sub.userId, amount: invoice.amount_paid }, 'Invoice payment recorded')
}

/**
 * Handle invoice.payment_failed event.
 */
async function handleInvoicePaymentFailed(invoice) {
  const customerId = invoice.customer

  await prisma.subscription.updateMany({
    where: { stripeCustomerId: customerId },
    data: { status: 'past_due' },
  })

  log.warn({ customerId, invoiceId: invoice.id }, 'Invoice payment failed — subscription past_due')
}

// ── Queries ──────────────────────────────────────────────────────────────

/**
 * Get user's current subscription status.
 */
async function getUserSubscription(userId) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      plan: true,
      status: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      canceledAt: true,
      createdAt: true,
    },
  })

  if (!sub || sub.status === 'canceled') {
    return { plan: 'free', status: 'active', features: PLANS.free }
  }

  return {
    plan: sub.plan,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    canceledAt: sub.canceledAt,
    createdAt: sub.createdAt,
    features: PLANS[sub.plan] || PLANS.free,
  }
}

/**
 * Get user's payment history (paginated).
 */
async function getUserPayments(userId, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        description: true,
        receiptUrl: true,
        type: true,
        createdAt: true,
      },
    }),
    prisma.payment.count({ where: { userId } }),
  ])

  return { payments, total, page, limit, totalPages: Math.ceil(total / limit) }
}

/**
 * Public donation leaderboard.
 */
async function getDonationLeaderboard({ limit = 50 } = {}) {
  // Top donors by total amount (non-anonymous only)
  const donors = await prisma.donation.groupBy({
    by: ['userId'],
    where: {
      status: 'completed',
      anonymous: false,
      NOT: [{ userId: null }],
    },
    _sum: { amount: true },
    _count: { id: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: limit,
  })

  // Fetch user info for each donor
  const userIds = donors.map((d) => d.userId).filter(Boolean)
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatarUrl: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  return donors.map((d) => ({
    userId: d.userId,
    username: userMap.get(d.userId)?.username || 'Unknown',
    avatarUrl: userMap.get(d.userId)?.avatarUrl || null,
    totalAmount: d._sum.amount || 0,
    donationCount: d._count.id || 0,
  }))
}

/**
 * Public subscriber showcase (Pro users — username + avatar only).
 */
async function getSubscriberShowcase({ limit = 100 } = {}) {
  const subs = await prisma.subscription.findMany({
    where: {
      status: { in: ['active', 'trialing'] },
      plan: { in: ['pro_monthly', 'pro_yearly'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      plan: true,
      createdAt: true,
      user: {
        select: { id: true, username: true, avatarUrl: true },
      },
    },
  })

  return subs.map((s) => ({
    userId: s.user.id,
    username: s.user.username,
    avatarUrl: s.user.avatarUrl,
    plan: s.plan,
    since: s.createdAt,
  }))
}

/**
 * Admin: revenue analytics summary.
 */
async function getRevenueAnalytics() {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [totalRevenue, monthlyRevenue, activeSubscribers, totalDonations, recentPayments] =
    await Promise.all([
      // All-time revenue
      prisma.payment.aggregate({
        where: { status: 'succeeded' },
        _sum: { amount: true },
      }),
      // Last 30 days revenue
      prisma.payment.aggregate({
        where: { status: 'succeeded', createdAt: { gte: thirtyDaysAgo } },
        _sum: { amount: true },
      }),
      // Active subscriber count
      prisma.subscription.count({
        where: { status: { in: ['active', 'trialing'] } },
      }),
      // Total completed donations
      prisma.donation.aggregate({
        where: { status: 'completed' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Recent 20 payments for transaction log
      prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          type: true,
          description: true,
          createdAt: true,
          user: { select: { id: true, username: true } },
        },
      }),
    ])

  return {
    totalRevenueCents: totalRevenue._sum.amount || 0,
    monthlyRevenueCents: monthlyRevenue._sum.amount || 0,
    activeSubscribers,
    totalDonationsCents: totalDonations._sum.amount || 0,
    totalDonationCount: totalDonations._count.id || 0,
    recentPayments,
  }
}

module.exports = {
  getStripe,
  getOrCreateCustomer,
  createSubscriptionCheckout,
  createDonationCheckout,
  createPortalSession,
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
  getUserSubscription,
  getUserPayments,
  getDonationLeaderboard,
  getSubscriberShowcase,
  getRevenueAnalytics,
}
