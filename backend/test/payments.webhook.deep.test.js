/**
 * payments.webhook.deep.test.js — deep coverage of Stripe webhook
 * delivery + the 5 supported event handlers. Loop T6 (2026-05-12).
 *
 * Pins:
 *   - constructEvent invoked with raw Buffer body (signature verification)
 *   - Invalid signature → 400 BAD_REQUEST + NO DB write
 *   - Non-Buffer body (raw middleware missing) → 400 (defense-in-depth)
 *   - 5 supported event types dispatched correctly
 *   - checkout.session.completed → Subscription row + achievement event
 *   - checkout.session.completed (donation) → Payment row + achievement event
 *   - customer.subscription.updated → plan + status updated
 *   - customer.subscription.deleted → canceled + notification
 *   - invoice.payment_succeeded → Payment row created (dedup by stripeInvoiceId)
 *   - invoice.payment_failed → past_due + notification
 *   - DONATION_COMPLETE + SUBSCRIPTION_ACTIVATE achievement events fire
 *   - Unknown event types are silently logged (no throw)
 *   - Handler errors return 500 so Stripe retries
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const routesPath = require.resolve('../src/modules/payments/payments.routes')

const mocks = vi.hoisted(() => {
  const prisma = {
    subscription: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    donation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    giftSubscription: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    studySheet: { count: vi.fn().mockResolvedValue(0) },
    studyGroup: { count: vi.fn().mockResolvedValue(0) },
  }

  const stripeWebhooks = { constructEvent: vi.fn() }
  const stripeSubscriptions = { retrieve: vi.fn(), list: vi.fn(), update: vi.fn() }
  const stripeCustomer = { create: vi.fn(), list: vi.fn(), search: vi.fn() }
  const stripeCheckout = { create: vi.fn() }
  const stripeBillingPortal = { sessions: { create: vi.fn() } }
  const stripeInvoices = { retrieve: vi.fn() }
  const stripePrices = { retrieve: vi.fn() }
  const stripeCoupons = { retrieve: vi.fn(), create: vi.fn() }

  function StripeClass() {
    this.webhooks = stripeWebhooks
    this.subscriptions = stripeSubscriptions
    this.customers = stripeCustomer
    this.checkout = { sessions: stripeCheckout }
    this.billingPortal = stripeBillingPortal
    this.invoices = stripeInvoices
    this.prices = stripePrices
    this.coupons = stripeCoupons
  }

  return {
    prisma,
    stripeWebhooks,
    stripeSubscriptions,
    stripeCustomer,
    stripeInvoices,
    stripeCheckout,
    StripeClass,
    email: {
      sendSubscriptionWelcome: vi.fn().mockResolvedValue({}),
      sendDonationThankYou: vi.fn().mockResolvedValue({}),
      sendPaymentReceipt: vi.fn().mockResolvedValue({}),
    },
    notify: { createNotification: vi.fn().mockResolvedValue({}) },
    sentry: { captureError: vi.fn() },
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'tester', role: 'student' }
      next()
    }),
    optionalAuth: vi.fn((_req, _res, next) => next()),
    achievements: {
      emitAchievementEvent: vi.fn(),
      EVENT_KINDS: {
        DONATION_COMPLETE: 'donation.complete',
        SUBSCRIPTION_ACTIVATE: 'subscription.activate',
      },
    },
  }
})

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/email/email'), mocks.email],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/logger'), mockLogger],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/core/auth/optionalAuth'), mocks.optionalAuth],
  [require.resolve('../src/modules/achievements'), mocks.achievements],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_webhookdeep'
  process.env.STRIPE_PRICE_ID_PRO = 'price_pro_monthly_deep'
  process.env.STRIPE_PRICE_ID_PRO_YEARLY = 'price_pro_yearly_deep'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_deep_test_webhook'
  process.env.FRONTEND_URL = 'http://localhost:5173'

  Module._load = function patched(requestId, parent, isMain) {
    if (requestId === 'stripe') return mocks.StripeClass
    if (requestId === 'express-rate-limit') return () => (_req, _res, next) => next()
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      const m = mockTargets.get(resolved)
      if (m) return m
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }

  for (const key of Object.keys(require.cache)) {
    if (key.includes('modules/payments') || key.includes('modules\\payments')) {
      delete require.cache[key]
    }
  }

  const router = require(routesPath)
  app = express()
  // Mirror the prod mount: webhook uses raw body BEFORE json parser.
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))
  app.use(express.json())
  app.use('/api/payments', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  for (const key of Object.keys(require.cache)) {
    if (key.includes('modules/payments') || key.includes('modules\\payments')) {
      delete require.cache[key]
    }
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  // Default Prisma stubs.
  mocks.prisma.subscription.findUnique.mockResolvedValue(null)
  mocks.prisma.subscription.findFirst.mockResolvedValue(null)
  mocks.prisma.subscription.upsert.mockResolvedValue({})
  mocks.prisma.subscription.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.payment.findUnique.mockResolvedValue(null)
  mocks.prisma.payment.findFirst.mockResolvedValue(null)
  mocks.prisma.payment.create.mockResolvedValue({ id: 'pay_x' })
  mocks.prisma.donation.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.donation.findUnique.mockResolvedValue(null)
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: 42,
    email: 'sub@studyhub.test',
    username: 'subscriber',
  })
})

function postWebhook(eventPayload, sigHeader = 't=now,v1=fake-signature') {
  return request(app)
    .post('/api/payments/webhook')
    .set('Stripe-Signature', sigHeader)
    .set('Content-Type', 'application/json')
    .send(Buffer.from(JSON.stringify(eventPayload)))
}

// ────────────────────────────────────────────────────────────────────────────
// Signature verification + transport-level guards
// ────────────────────────────────────────────────────────────────────────────
describe('Stripe webhook — transport guards', () => {
  it('calls stripe.webhooks.constructEvent with raw Buffer body', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'unknown.event',
      data: { object: {} },
    })
    await postWebhook({ id: 'evt_1', type: 'unknown.event' })
    expect(mocks.stripeWebhooks.constructEvent).toHaveBeenCalledTimes(1)
    const [body, sig, secret] = mocks.stripeWebhooks.constructEvent.mock.calls[0]
    expect(Buffer.isBuffer(body)).toBe(true)
    expect(sig).toBe('t=now,v1=fake-signature')
    expect(secret).toBe('whsec_deep_test_webhook')
  })

  it('returns 400 BAD_REQUEST when signature verification fails (no DB write)', async () => {
    mocks.stripeWebhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature')
    })
    const res = await postWebhook({ id: 'evt_x', type: 'checkout.session.completed' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('BAD_REQUEST')
    expect(res.body.error).toMatch(/signature/i)
    // Critical: no DB writes occurred.
    expect(mocks.prisma.subscription.upsert).not.toHaveBeenCalled()
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled()
    expect(mocks.prisma.donation.updateMany).not.toHaveBeenCalled()
  })

  it('returns 400 when raw body middleware is not applied (non-Buffer body)', async () => {
    // Build a separate app WITHOUT express.raw on /webhook to simulate misconfig.
    const localApp = express()
    localApp.use(express.json())
    for (const key of Object.keys(require.cache)) {
      if (key.includes('modules/payments') || key.includes('modules\\payments')) {
        delete require.cache[key]
      }
    }
    const router = require(routesPath)
    localApp.use('/api/payments', router)

    const res = await request(localApp)
      .post('/api/payments/webhook')
      .set('Stripe-Signature', 't=now,v1=fake')
      .send({ id: 'evt_y', type: 'checkout.session.completed' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('BAD_REQUEST')
    expect(res.body.error).toMatch(/invalid webhook payload/i)

    // Restore main app's payments module.
    for (const key of Object.keys(require.cache)) {
      if (key.includes('modules/payments') || key.includes('modules\\payments')) {
        delete require.cache[key]
      }
    }
  })

  it('logs and ignores unknown event types with 200 + handled=false', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_unknown',
      type: 'product.created',
      data: { object: { id: 'prod_1' } },
    })
    const res = await postWebhook({})
    expect(res.status).toBe(200)
    expect(res.body.handled).toBe(false)
    expect(res.body.received).toBe(true)
  })

  it('returns 500 INTERNAL when handler throws (so Stripe retries)', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_boom',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_boom', metadata: { studyhub_user_id: '42' } } },
    })
    mocks.prisma.subscription.updateMany.mockRejectedValue(new Error('DB connection lost'))
    const res = await postWebhook({})
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL')
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// checkout.session.completed — subscription
// ────────────────────────────────────────────────────────────────────────────
describe('checkout.session.completed — subscription', () => {
  beforeEach(() => {
    mocks.stripeSubscriptions.retrieve.mockResolvedValue({
      status: 'active',
      items: { data: [{ price: { id: 'price_pro_monthly_deep' } }] },
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancel_at_period_end: false,
      latest_invoice: null,
    })
  })

  it('upserts a Subscription row tied to the userId in metadata', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_sub_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_sub_1',
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: { studyhub_user_id: '42', plan: 'pro_monthly' },
        },
      },
    })
    const res = await postWebhook({})
    expect(res.status).toBe(200)
    expect(res.body.handled).toBe(true)
    expect(mocks.prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42 },
        create: expect.objectContaining({
          userId: 42,
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
          plan: 'pro_monthly',
          status: 'active',
        }),
      }),
    )
  })

  it('emits SUBSCRIPTION_ACTIVATE achievement event on successful upsert', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_sub_ach',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_ach',
          customer: 'cus_ach',
          subscription: 'sub_ach',
          metadata: { studyhub_user_id: '42', plan: 'pro_monthly' },
        },
      },
    })
    await postWebhook({})
    expect(mocks.achievements.emitAchievementEvent).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'subscription.activate',
      expect.objectContaining({ plan: 'pro_monthly', stripeSubscriptionId: 'sub_ach' }),
    )
  })

  it('skips upsert when studyhub_user_id metadata is missing / invalid', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_no_user',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_no_user',
          customer: 'cus_x',
          subscription: 'sub_x',
          metadata: { plan: 'pro_monthly' },
        },
      },
    })
    const res = await postWebhook({})
    expect(res.status).toBe(200)
    expect(mocks.prisma.subscription.upsert).not.toHaveBeenCalled()
    expect(mocks.achievements.emitAchievementEvent).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// checkout.session.completed — donation
// ────────────────────────────────────────────────────────────────────────────
describe('checkout.session.completed — donation', () => {
  it('marks donation completed + creates Payment + emits DONATION_COMPLETE', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_donation_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_d1',
          payment_intent: 'pi_d1',
          amount_total: 5000,
          metadata: { type: 'donation', studyhub_user_id: '42', anonymous: 'false' },
        },
      },
    })
    mocks.prisma.donation.findUnique.mockResolvedValue({
      userId: 42,
      amount: 5000,
      currency: 'usd',
      donorMessage: '',
      anonymous: false,
    })

    const res = await postWebhook({})
    expect(res.status).toBe(200)
    expect(mocks.prisma.donation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSessionId: 'sess_d1' },
        data: { status: 'completed', stripePaymentIntentId: 'pi_d1' },
      }),
    )
    expect(mocks.prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 42,
          amount: 5000,
          type: 'donation',
          status: 'succeeded',
          stripePaymentIntentId: 'pi_d1',
        }),
      }),
    )
    expect(mocks.achievements.emitAchievementEvent).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'donation.complete',
      expect.objectContaining({ sessionId: 'sess_d1', amountCents: 5000 }),
    )
  })

  it('skips Payment row creation when one already exists (idempotent webhook)', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_donation_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_d2',
          payment_intent: 'pi_d2',
          amount_total: 5000,
          metadata: { type: 'donation', studyhub_user_id: '42', anonymous: 'false' },
        },
      },
    })
    mocks.prisma.donation.findUnique.mockResolvedValue({
      userId: 42,
      amount: 5000,
      currency: 'usd',
      donorMessage: '',
      anonymous: false,
    })
    mocks.prisma.payment.findUnique.mockResolvedValue({ id: 'pay_existing' })

    await postWebhook({})
    expect(mocks.prisma.donation.updateMany).toHaveBeenCalled()
    // Already-existing Payment with this PI → no duplicate row.
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled()
  })

  it('does not send donation thank-you email for anonymous donor', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_donation_anon',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_d_anon',
          payment_intent: 'pi_d_anon',
          amount_total: 2000,
          metadata: { type: 'donation', studyhub_user_id: 'anonymous', anonymous: 'true' },
        },
      },
    })
    await postWebhook({})
    expect(mocks.email.sendDonationThankYou).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// customer.subscription.updated / deleted
// ────────────────────────────────────────────────────────────────────────────
describe('customer.subscription.updated', () => {
  it('updates plan + status based on the new Stripe price ID', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_sub_upd',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_upd_1',
          customer: 'cus_1',
          status: 'active',
          items: { data: [{ price: { id: 'price_pro_yearly_deep' } }] },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 365 * 86400,
          cancel_at_period_end: false,
          canceled_at: null,
          metadata: { studyhub_user_id: '42' },
        },
      },
    })
    const res = await postWebhook({})
    expect(res.status).toBe(200)
    expect(mocks.prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 42 },
        update: expect.objectContaining({
          plan: 'pro_yearly',
          status: 'active',
        }),
      }),
    )
  })

  it('re-emits SUBSCRIPTION_ACTIVATE on past_due → active retry', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_sub_recovery',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_recovery',
          customer: 'cus_r',
          status: 'active',
          items: { data: [{ price: { id: 'price_pro_monthly_deep' } }] },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          cancel_at_period_end: false,
          canceled_at: null,
          metadata: { studyhub_user_id: '42' },
        },
      },
    })
    await postWebhook({})
    expect(mocks.achievements.emitAchievementEvent).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'subscription.activate',
      expect.objectContaining({ status: 'active' }),
    )
  })

  it('does NOT emit SUBSCRIPTION_ACTIVATE for past_due → past_due', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_pastdue',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_pd',
          customer: 'cus_pd',
          status: 'past_due',
          items: { data: [{ price: { id: 'price_pro_monthly_deep' } }] },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          cancel_at_period_end: false,
          canceled_at: null,
          metadata: { studyhub_user_id: '42' },
        },
      },
    })
    await postWebhook({})
    expect(mocks.achievements.emitAchievementEvent).not.toHaveBeenCalled()
  })
})

describe('customer.subscription.deleted', () => {
  it('marks Subscription canceled + creates notification for the user', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_sub_del',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_deleted_1',
          metadata: { studyhub_user_id: '42' },
        },
      },
    })
    const res = await postWebhook({})
    expect(res.status).toBe(200)
    expect(mocks.prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSubscriptionId: 'sub_deleted_1' },
        data: expect.objectContaining({ status: 'canceled' }),
      }),
    )
    expect(mocks.notify.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 42,
        type: 'subscription_canceled',
        linkPath: '/settings?tab=subscription',
      }),
    )
  })

  it('still returns 200 if notification call rejects (non-fatal)', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_sub_del_2',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_x', metadata: { studyhub_user_id: '42' } } },
    })
    mocks.notify.createNotification.mockRejectedValue(new Error('Notifications down'))
    const res = await postWebhook({})
    expect(res.status).toBe(200)
    expect(res.body.handled).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// invoice.payment_succeeded / invoice.payment_failed
// ────────────────────────────────────────────────────────────────────────────
describe('invoice.payment_succeeded', () => {
  it('creates Payment row for matching subscription (succeeded)', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_inv_1',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'inv_1',
          customer: 'cus_inv_1',
          amount_paid: 999,
          currency: 'usd',
          payment_intent: 'pi_inv_1',
          hosted_invoice_url: 'https://stripe.com/inv/1',
          lines: { data: [{ description: 'Pro Monthly' }] },
        },
      },
    })
    mocks.prisma.subscription.findFirst.mockResolvedValue({ id: 'sub_row_1', userId: 42 })
    const res = await postWebhook({})
    expect(res.status).toBe(200)
    expect(mocks.prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 42,
          subscriptionId: 'sub_row_1',
          stripeInvoiceId: 'inv_1',
          amount: 999,
          status: 'succeeded',
          type: 'subscription',
        }),
      }),
    )
  })

  it('is idempotent on duplicate invoice events (no double Payment row)', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_inv_dup',
      type: 'invoice.payment_succeeded',
      data: {
        object: { id: 'inv_dup', customer: 'cus_x', amount_paid: 999, currency: 'usd' },
      },
    })
    mocks.prisma.subscription.findFirst.mockResolvedValue({ id: 'sub_x', userId: 42 })
    mocks.prisma.payment.findUnique.mockResolvedValue({ id: 'pay_already' }) // dedupe hit
    await postWebhook({})
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled()
  })

  it('logs and skips when no subscription matches the customer', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_inv_nosub',
      type: 'invoice.payment_succeeded',
      data: {
        object: { id: 'inv_nosub', customer: 'cus_ghost', amount_paid: 999, currency: 'usd' },
      },
    })
    mocks.prisma.subscription.findFirst.mockResolvedValue(null)
    const res = await postWebhook({})
    expect(res.status).toBe(200)
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled()
  })
})

describe('invoice.payment_failed', () => {
  it('flips subscription status to past_due and notifies user', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_inv_fail',
      type: 'invoice.payment_failed',
      data: { object: { id: 'inv_fail', customer: 'cus_fail' } },
    })
    mocks.prisma.subscription.findFirst.mockResolvedValue({ userId: 42 })
    const res = await postWebhook({})
    expect(res.status).toBe(200)
    expect(mocks.prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_fail' },
      data: { status: 'past_due' },
    })
    expect(mocks.notify.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 42,
        type: 'payment_failed',
        priority: 'high',
      }),
    )
  })

  it('still returns 200 when notification fails (non-fatal)', async () => {
    mocks.stripeWebhooks.constructEvent.mockReturnValue({
      id: 'evt_inv_fail_notif',
      type: 'invoice.payment_failed',
      data: { object: { id: 'inv_fail_2', customer: 'cus_fail_2' } },
    })
    mocks.prisma.subscription.findFirst.mockResolvedValue({ userId: 42 })
    mocks.notify.createNotification.mockRejectedValue(new Error('Notifications down'))
    const res = await postWebhook({})
    expect(res.status).toBe(200)
  })
})
