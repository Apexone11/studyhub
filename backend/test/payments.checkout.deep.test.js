/**
 * payments.checkout.deep.test.js — deep coverage for subscription + donation
 * checkout endpoints.
 *
 * Pins:
 *   - POST /checkout/subscription contract (valid plan → Stripe URL)
 *   - Plan allowlist validation (400 on bogus plan)
 *   - Customer creation on first checkout; reuse on subsequent
 *   - Email + username resolved from DB at checkout time
 *   - POST /checkout/donation amount validation (min $1, max $1000)
 *   - Donation message length cap (500 chars)
 *   - Variable amount via price_data (NOT fixed price ID)
 *   - Anonymous flag wiring + pending Donation row creation
 *   - Origin allowlist enforcement (403 on bogus origin)
 *   - Auth required on subscription checkout
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const routesPath = require.resolve('../src/modules/payments/payments.routes')

const mocks = vi.hoisted(() => {
  const state = { userId: 42, username: 'tester', role: 'student', authed: true }

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
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    studySheet: { count: vi.fn().mockResolvedValue(0) },
    studyGroup: { count: vi.fn().mockResolvedValue(0) },
    giftSubscription: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    referralCode: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    referralRedemption: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    subscriptionPause: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  }

  const stripeCustomer = { create: vi.fn(), list: vi.fn(), search: vi.fn() }
  const stripeCheckout = { create: vi.fn() }
  const stripeBillingPortal = { sessions: { create: vi.fn() } }
  const stripeSubscriptions = {
    retrieve: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
  }
  const stripeWebhooks = { constructEvent: vi.fn() }
  const stripeInvoices = { retrieve: vi.fn() }
  const stripePrices = { retrieve: vi.fn() }
  const stripeCoupons = { retrieve: vi.fn(), create: vi.fn() }

  function StripeClass() {
    this.customers = stripeCustomer
    this.checkout = { sessions: stripeCheckout }
    this.billingPortal = stripeBillingPortal
    this.subscriptions = stripeSubscriptions
    this.webhooks = stripeWebhooks
    this.invoices = stripeInvoices
    this.prices = stripePrices
    this.coupons = stripeCoupons
  }

  return {
    state,
    prisma,
    stripeCustomer,
    stripeCheckout,
    stripeBillingPortal,
    stripeSubscriptions,
    stripeWebhooks,
    stripeInvoices,
    stripePrices,
    stripeCoupons,
    StripeClass,
    email: {
      sendSubscriptionWelcome: vi.fn().mockResolvedValue({}),
      sendDonationThankYou: vi.fn().mockResolvedValue({}),
      sendPaymentReceipt: vi.fn().mockResolvedValue({}),
    },
    notify: { createNotification: vi.fn().mockResolvedValue({}) },
    sentry: { captureError: vi.fn() },
    auth: vi.fn((req, res, next) => {
      if (!state.authed) {
        return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
      }
      req.user = { userId: state.userId, username: state.username, role: state.role }
      next()
    }),
    optionalAuth: vi.fn((req, _res, next) => {
      if (state.authed) {
        req.user = { userId: state.userId, username: state.username, role: state.role }
      }
      next()
    }),
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
  process.env.STRIPE_SECRET_KEY = 'sk_test_checkoutdeep'
  process.env.STRIPE_PRICE_ID_PRO = 'price_pro_monthly_deep'
  process.env.STRIPE_PRICE_ID_PRO_YEARLY = 'price_pro_yearly_deep'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_deep_test'
  process.env.FRONTEND_URL = 'http://localhost:5173'

  Module._load = function patched(requestId, parent, isMain) {
    if (requestId === 'stripe') return mocks.StripeClass
    // Stub rate limiters to no-op so we can hit the same route many times.
    if (requestId === 'express-rate-limit') {
      return () => (_req, _res, next) => next()
    }
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      const m = mockTargets.get(resolved)
      if (m) return m
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }

  // Wipe payments module cache (so the stubbed Stripe class is picked up).
  for (const key of Object.keys(require.cache)) {
    if (key.includes('modules/payments') || key.includes('modules\\payments')) {
      delete require.cache[key]
    }
  }

  const router = require(routesPath)
  app = express()
  app.use(express.json())
  // Default-trusted origin so we can isolate the origin-rejection test.
  app.use((req, _res, next) => {
    if (!req.headers.origin) req.headers.origin = 'http://localhost:5173'
    next()
  })
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
  mocks.state.authed = true
  mocks.state.userId = 42
  mocks.state.username = 'tester'
  mocks.state.role = 'student'

  mocks.prisma.user.findUnique.mockResolvedValue({
    id: 42,
    email: 'tester@studyhub.test',
    username: 'tester',
  })
  mocks.prisma.subscription.findUnique.mockResolvedValue(null)
  mocks.stripeCustomer.create.mockResolvedValue({ id: 'cus_new_42' })
  mocks.stripeCheckout.create.mockResolvedValue({
    id: 'cs_test_123',
    url: 'https://checkout.stripe.com/c/pay/cs_test_123',
  })
})

// ────────────────────────────────────────────────────────────────────────────
// POST /api/payments/checkout/subscription
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/checkout/subscription', () => {
  it('returns Stripe checkout URL when given a valid pro_monthly plan', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'pro_monthly' })
    expect(res.status).toBe(200)
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.com/)
    expect(res.body.sessionId).toBe('cs_test_123')
    expect(mocks.stripeCheckout.create).toHaveBeenCalledTimes(1)
  })

  it('returns Stripe checkout URL for pro_yearly plan', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'pro_yearly' })
    expect(res.status).toBe(200)
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.com/)
    // Verify the pro_yearly price ID was used in line_items.
    const callArgs = mocks.stripeCheckout.create.mock.calls[0][0]
    expect(callArgs.line_items[0].price).toBe('price_pro_yearly_deep')
  })

  it('rejects missing plan with 400 VALIDATION', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'http://localhost:5173')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
    expect(res.body.error).toMatch(/invalid plan/i)
    expect(mocks.stripeCheckout.create).not.toHaveBeenCalled()
  })

  it('rejects unknown plan with 400 VALIDATION (allowlist enforcement)', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'pro_lifetime' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
    expect(mocks.stripeCheckout.create).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated request with 401', async () => {
    mocks.state.authed = false
    const res = await request(app)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'pro_monthly' })
    expect(res.status).toBe(401)
    expect(mocks.stripeCheckout.create).not.toHaveBeenCalled()
  })

  it('rejects request from disallowed origin with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'https://evil.example.com')
      .send({ plan: 'pro_monthly' })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
    expect(mocks.stripeCheckout.create).not.toHaveBeenCalled()
  })

  it('creates a new Stripe customer on first checkout', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue(null)
    await request(app)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'pro_monthly' })
    expect(mocks.stripeCustomer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'tester@studyhub.test',
        metadata: expect.objectContaining({
          studyhub_user_id: '42',
          studyhub_username: 'tester',
        }),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
  })

  it('reuses existing Stripe customer when one is on file', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_existing_999' })
    await request(app)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'pro_monthly' })
    expect(mocks.stripeCustomer.create).not.toHaveBeenCalled()
    expect(mocks.stripeCheckout.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing_999' }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
  })

  it('embeds studyhub_user_id + plan in both session and subscription metadata', async () => {
    await request(app)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'pro_monthly' })
    const args = mocks.stripeCheckout.create.mock.calls[0][0]
    expect(args.metadata.studyhub_user_id).toBe('42')
    expect(args.metadata.plan).toBe('pro_monthly')
    expect(args.subscription_data.metadata.studyhub_user_id).toBe('42')
    expect(args.subscription_data.metadata.plan).toBe('pro_monthly')
    expect(args.mode).toBe('subscription')
  })

  it('returns generic 500 with INTERNAL when Stripe SDK throws', async () => {
    mocks.stripeCheckout.create.mockRejectedValue(new Error('Stripe network error'))
    const res = await request(app)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'pro_monthly' })
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL')
    // Must not leak the underlying Stripe error message.
    expect(res.body.error).not.toMatch(/network/i)
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })

  it('returns a friendly 500 message when Stripe price ID is not configured', async () => {
    // Force planFromPriceId failure by stripping env var.
    const original = process.env.STRIPE_PRICE_ID_PRO
    delete process.env.STRIPE_PRICE_ID_PRO
    // Reload payments to pick up missing config.
    for (const key of Object.keys(require.cache)) {
      if (key.includes('modules/payments') || key.includes('modules\\payments')) {
        delete require.cache[key]
      }
    }
    const router = require(routesPath)
    const localApp = express()
    localApp.use(express.json())
    localApp.use((req, _res, next) => {
      if (!req.headers.origin) req.headers.origin = 'http://localhost:5173'
      next()
    })
    localApp.use('/api/payments', router)

    const res = await request(localApp)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'pro_monthly' })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/not fully configured/i)

    // Restore env + module cache for downstream tests.
    process.env.STRIPE_PRICE_ID_PRO = original
    for (const key of Object.keys(require.cache)) {
      if (key.includes('modules/payments') || key.includes('modules\\payments')) {
        delete require.cache[key]
      }
    }
  })
})

// ────────────────────────────────────────────────────────────────────────────
// POST /api/payments/checkout/donation
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/checkout/donation', () => {
  beforeEach(() => {
    mocks.prisma.donation.create.mockResolvedValue({ id: 7, status: 'pending' })
  })

  it('accepts a $1 donation (DONATION_MIN_CENTS boundary)', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/donation')
      .set('Origin', 'http://localhost:5173')
      .send({ amount: 1, message: 'thanks', anonymous: false })
    expect(res.status).toBe(200)
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.com/)
    // Verify the inline price_data was set with 100 cents (variable amount).
    const args = mocks.stripeCheckout.create.mock.calls[0][0]
    expect(args.line_items[0].price_data.unit_amount).toBe(100)
    expect(args.line_items[0].price_data.currency).toBe('usd')
    expect(args.line_items[0].price).toBeUndefined() // no fixed price ID
  })

  it('accepts a $1000 donation (DONATION_MAX_CENTS boundary)', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/donation')
      .set('Origin', 'http://localhost:5173')
      .send({ amount: 1000 })
    expect(res.status).toBe(200)
    const args = mocks.stripeCheckout.create.mock.calls[0][0]
    expect(args.line_items[0].price_data.unit_amount).toBe(100000)
  })

  it('rejects donation below $1 with 400 VALIDATION', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/donation')
      .set('Origin', 'http://localhost:5173')
      .send({ amount: 0.5 })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
    expect(res.body.error).toMatch(/\$1.*\$1000/)
    expect(mocks.stripeCheckout.create).not.toHaveBeenCalled()
  })

  it('rejects donation above $1000 with 400 VALIDATION', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/donation')
      .set('Origin', 'http://localhost:5173')
      .send({ amount: 1001 })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
    expect(mocks.stripeCheckout.create).not.toHaveBeenCalled()
  })

  it('rejects donation message longer than DONATION_MESSAGE_MAX_LENGTH', async () => {
    const longMessage = 'x'.repeat(501)
    const res = await request(app)
      .post('/api/payments/checkout/donation')
      .set('Origin', 'http://localhost:5173')
      .send({ amount: 5, message: longMessage })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
    expect(res.body.error).toMatch(/500 characters/)
  })

  it('creates a pending Donation row with anonymous=true and null donorName', async () => {
    await request(app)
      .post('/api/payments/checkout/donation')
      .set('Origin', 'http://localhost:5173')
      .send({ amount: 10, message: 'great work', anonymous: true })
    expect(mocks.prisma.donation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 42,
          amount: 1000,
          status: 'pending',
          anonymous: true,
          donorName: null,
          donorMessage: 'great work',
        }),
      }),
    )
  })

  it('attaches metadata.type=donation + anonymous flag for the webhook', async () => {
    await request(app)
      .post('/api/payments/checkout/donation')
      .set('Origin', 'http://localhost:5173')
      .send({ amount: 25, anonymous: false })
    const args = mocks.stripeCheckout.create.mock.calls[0][0]
    expect(args.metadata.type).toBe('donation')
    expect(args.metadata.anonymous).toBe('false')
    expect(args.metadata.studyhub_user_id).toBe('42')
    expect(args.mode).toBe('payment')
  })

  it('accepts unauthenticated donation (optionalAuth) and records userId=null', async () => {
    mocks.state.authed = false
    await request(app)
      .post('/api/payments/checkout/donation')
      .set('Origin', 'http://localhost:5173')
      .send({ amount: 5 })
    expect(mocks.stripeCheckout.create).toHaveBeenCalled()
    const args = mocks.stripeCheckout.create.mock.calls[0][0]
    // No customer ID attached when anonymous (no user logged in).
    expect(args.customer).toBeUndefined()
    expect(args.metadata.studyhub_user_id).toBe('anonymous')
    expect(mocks.prisma.donation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: null }) }),
    )
  })

  it('rejects donation from disallowed origin with 403', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/donation')
      .set('Origin', 'https://malicious.example.com')
      .send({ amount: 25 })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('returns 500 INTERNAL with sentry capture when Stripe throws', async () => {
    mocks.stripeCheckout.create.mockRejectedValue(new Error('Stripe down'))
    const res = await request(app)
      .post('/api/payments/checkout/donation')
      .set('Origin', 'http://localhost:5173')
      .send({ amount: 10 })
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL')
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })
})
