/**
 * payments.portal.deep.test.js — deep coverage of POST /api/payments/portal.
 *
 * Pins:
 *   - Creates Stripe Customer Portal session bound to existing customerId
 *   - Returns the URL Stripe gives back
 *   - 404 NOT_FOUND when user has no subscription / no stripeCustomerId
 *   - 401 when unauthenticated
 *   - 403 when Origin header is not on the allowlist
 *   - returnUrl points at the settings page
 *   - Sentry capture + 500 INTERNAL when Stripe SDK errors
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
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    studySheet: { count: vi.fn().mockResolvedValue(0) },
    studyGroup: { count: vi.fn().mockResolvedValue(0) },
  }

  const stripeBillingPortal = { sessions: { create: vi.fn() } }
  const stripeCustomer = { create: vi.fn(), list: vi.fn(), search: vi.fn() }
  const stripeCheckout = { create: vi.fn() }
  const stripeSubscriptions = { retrieve: vi.fn(), list: vi.fn(), update: vi.fn() }
  const stripeWebhooks = { constructEvent: vi.fn() }
  const stripeInvoices = { retrieve: vi.fn() }
  const stripePrices = { retrieve: vi.fn() }
  const stripeCoupons = { retrieve: vi.fn(), create: vi.fn() }

  function StripeClass() {
    this.billingPortal = stripeBillingPortal
    this.customers = stripeCustomer
    this.checkout = { sessions: stripeCheckout }
    this.subscriptions = stripeSubscriptions
    this.webhooks = stripeWebhooks
    this.invoices = stripeInvoices
    this.prices = stripePrices
    this.coupons = stripeCoupons
  }

  return {
    state,
    prisma,
    stripeBillingPortal,
    stripeCustomer,
    stripeSubscriptions,
    stripeCheckout,
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
  process.env.STRIPE_SECRET_KEY = 'sk_test_portaldeep'
  process.env.STRIPE_PRICE_ID_PRO = 'price_pro_monthly_deep'
  process.env.STRIPE_PRICE_ID_PRO_YEARLY = 'price_pro_yearly_deep'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_deep_test_portal'
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
  app.use(express.json())
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

  mocks.prisma.subscription.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_42' })
  mocks.stripeBillingPortal.sessions.create.mockResolvedValue({
    id: 'bps_1',
    url: 'https://billing.stripe.com/p/session/abc',
  })
})

// ────────────────────────────────────────────────────────────────────────────
// POST /api/payments/portal
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/portal', () => {
  it('returns the Stripe-issued Customer Portal URL', async () => {
    const res = await request(app)
      .post('/api/payments/portal')
      .set('Origin', 'http://localhost:5173')
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.url).toBe('https://billing.stripe.com/p/session/abc')
  })

  it('passes the existing stripeCustomerId to Stripe', async () => {
    await request(app).post('/api/payments/portal').set('Origin', 'http://localhost:5173').send({})
    expect(mocks.stripeBillingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_42' }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
  })

  it('sets the return_url to the frontend settings page', async () => {
    await request(app).post('/api/payments/portal').set('Origin', 'http://localhost:5173').send({})
    const args = mocks.stripeBillingPortal.sessions.create.mock.calls[0][0]
    expect(args.return_url).toBe('http://localhost:5173/settings')
  })

  it('returns 404 NOT_FOUND when user has no subscription record', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/payments/portal')
      .set('Origin', 'http://localhost:5173')
      .send({})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
    expect(res.body.error).toMatch(/no active subscription/i)
    expect(mocks.stripeBillingPortal.sessions.create).not.toHaveBeenCalled()
  })

  it('returns 404 when subscription row exists but stripeCustomerId is null', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({ stripeCustomerId: null })
    const res = await request(app)
      .post('/api/payments/portal')
      .set('Origin', 'http://localhost:5173')
      .send({})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.state.authed = false
    const res = await request(app)
      .post('/api/payments/portal')
      .set('Origin', 'http://localhost:5173')
      .send({})
    expect(res.status).toBe(401)
    expect(mocks.stripeBillingPortal.sessions.create).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN on disallowed origin', async () => {
    const res = await request(app)
      .post('/api/payments/portal')
      .set('Origin', 'https://attacker.example')
      .send({})
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
    expect(mocks.stripeBillingPortal.sessions.create).not.toHaveBeenCalled()
  })

  it('returns 500 INTERNAL + sentry capture when Stripe rejects', async () => {
    mocks.stripeBillingPortal.sessions.create.mockRejectedValue(new Error('Stripe unavailable'))
    const res = await request(app)
      .post('/api/payments/portal')
      .set('Origin', 'http://localhost:5173')
      .send({})
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL')
    expect(mocks.sentry.captureError).toHaveBeenCalled()
    // Underlying error message must not leak.
    expect(res.body.error).not.toMatch(/unavailable/i)
  })
})
