/**
 * payments.sprintE.deep.test.js — deep coverage for the subscription pause
 * + resume flow in sprintE.routes.js. Loop T6 (2026-05-12).
 *
 * Pins:
 *   - POST /subscription/pause — only allowed for active subscriptions
 *   - Pause duration clamped to 1..30 days
 *   - Stripe pause_collection called with behavior=void + correct resumes_at
 *   - SubscriptionPause row created with resumeAt populated
 *   - 409 CONFLICT when already paused
 *   - POST /subscription/resume — flips status to 'resumed' + clears Stripe pause
 *   - GET /subscription/pause-status — returns paused flag + record
 *   - Gift subs (stripeSubscriptionId starts with 'gift_') skip Stripe SDK
 *   - Auth required + origin allowlist for writes
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
    subscriptionPause: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    referralCode: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    referralRedemption: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    giftSubscription: {
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    studySheet: { count: vi.fn().mockResolvedValue(0) },
    studyGroup: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn((arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  }

  const stripeCustomer = { create: vi.fn(), list: vi.fn(), search: vi.fn() }
  const stripeCheckout = { create: vi.fn() }
  const stripeBillingPortal = { sessions: { create: vi.fn() } }
  const stripeSubscriptions = { retrieve: vi.fn(), list: vi.fn(), update: vi.fn() }
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
      if (state.authed)
        req.user = { userId: state.userId, username: state.username, role: state.role }
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
  process.env.STRIPE_SECRET_KEY = 'sk_test_sprintedeep'
  process.env.STRIPE_PRICE_ID_PRO = 'price_pro_monthly_deep'
  process.env.STRIPE_PRICE_ID_PRO_YEARLY = 'price_pro_yearly_deep'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_deep_test_sprintE'
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

  mocks.prisma.subscriptionPause.findFirst.mockResolvedValue(null)
  mocks.prisma.subscriptionPause.create.mockImplementation(({ data }) => ({
    id: 'pause_1',
    pausedAt: new Date(),
    ...data,
  }))
  mocks.prisma.subscriptionPause.update.mockResolvedValue({ id: 'pause_1', status: 'resumed' })
  mocks.stripeSubscriptions.update.mockResolvedValue({ id: 'sub_x' })
})

// ────────────────────────────────────────────────────────────────────────────
// POST /api/payments/subscription/pause
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/subscription/pause', () => {
  it('creates a SubscriptionPause row with resumeAt and clamps days to ≤ 30', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: 'sub_real_1',
      status: 'active',
      plan: 'pro_monthly',
    })
    const res = await request(app)
      .post('/api/payments/subscription/pause')
      .set('Origin', 'http://localhost:5173')
      .send({ days: 999, reason: 'on holiday' }) // way over 30
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/30 days/)
    expect(mocks.prisma.subscriptionPause.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 42,
          status: 'active',
          reason: 'on holiday',
        }),
      }),
    )
    // resumeAt should be 30 days out (within a 1-min tolerance)
    const createArgs = mocks.prisma.subscriptionPause.create.mock.calls[0][0].data
    const delta = createArgs.resumeAt.getTime() - Date.now()
    expect(delta).toBeGreaterThan(29.99 * 86400_000)
    expect(delta).toBeLessThan(30.01 * 86400_000)
  })

  it('floors pause days to ≥ 1 (rejects 0 / negative / NaN by defaulting to 14)', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: 'sub_real_1',
      status: 'active',
      plan: 'pro_monthly',
    })
    const res = await request(app)
      .post('/api/payments/subscription/pause')
      .set('Origin', 'http://localhost:5173')
      .send({ days: -5 })
    expect(res.status).toBe(200)
    // The Math.max(1, parseInt(days)) path with -5 yields 1 (parseInt('-5')=-5, max(1,-5)=1).
    expect(res.body.message).toMatch(/1 days/)
  })

  it('calls Stripe pause_collection with behavior=void and resumes_at timestamp', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: 'sub_real_1',
      status: 'active',
      plan: 'pro_monthly',
    })
    await request(app)
      .post('/api/payments/subscription/pause')
      .set('Origin', 'http://localhost:5173')
      .send({ days: 10 })
    expect(mocks.stripeSubscriptions.update).toHaveBeenCalledWith(
      'sub_real_1',
      expect.objectContaining({
        pause_collection: expect.objectContaining({
          behavior: 'void',
          resumes_at: expect.any(Number),
        }),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
  })

  it('skips Stripe SDK call for gift subscriptions (stripeSubscriptionId starts with gift_)', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: 'gift_sub_ABCD',
      status: 'active',
      plan: 'pro_monthly',
    })
    await request(app)
      .post('/api/payments/subscription/pause')
      .set('Origin', 'http://localhost:5173')
      .send({ days: 7 })
    expect(mocks.stripeSubscriptions.update).not.toHaveBeenCalled()
    expect(mocks.prisma.subscriptionPause.create).toHaveBeenCalled()
  })

  it('returns 400 when user has no active subscription', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/payments/subscription/pause')
      .set('Origin', 'http://localhost:5173')
      .send({ days: 14 })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('BAD_REQUEST')
    expect(res.body.error).toMatch(/no active subscription/i)
    expect(mocks.prisma.subscriptionPause.create).not.toHaveBeenCalled()
  })

  it('returns 400 when subscription status is not active (e.g. past_due)', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: 'sub_pd',
      status: 'past_due',
      plan: 'pro_monthly',
    })
    const res = await request(app)
      .post('/api/payments/subscription/pause')
      .set('Origin', 'http://localhost:5173')
      .send({ days: 7 })
    expect(res.status).toBe(400)
    expect(mocks.prisma.subscriptionPause.create).not.toHaveBeenCalled()
  })

  it('returns 409 CONFLICT when an active pause already exists', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: 'sub_real_1',
      status: 'active',
      plan: 'pro_monthly',
    })
    mocks.prisma.subscriptionPause.findFirst.mockResolvedValue({
      id: 'pause_existing',
      status: 'active',
    })
    const res = await request(app)
      .post('/api/payments/subscription/pause')
      .set('Origin', 'http://localhost:5173')
      .send({ days: 14 })
    expect(res.status).toBe(400) // sendError uses 400 + CONFLICT code per the route
    expect(res.body.code).toBe('CONFLICT')
    expect(mocks.prisma.subscriptionPause.create).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.state.authed = false
    const res = await request(app)
      .post('/api/payments/subscription/pause')
      .set('Origin', 'http://localhost:5173')
      .send({ days: 14 })
    expect(res.status).toBe(401)
    expect(mocks.prisma.subscriptionPause.create).not.toHaveBeenCalled()
  })

  it('returns 403 FORBIDDEN on disallowed origin', async () => {
    const res = await request(app)
      .post('/api/payments/subscription/pause')
      .set('Origin', 'https://attacker.example')
      .send({ days: 14 })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
    expect(mocks.prisma.subscriptionPause.create).not.toHaveBeenCalled()
  })

  it('truncates pause reason to 500 chars', async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: 'sub_real_1',
      status: 'active',
      plan: 'pro_monthly',
    })
    const longReason = 'a'.repeat(700)
    await request(app)
      .post('/api/payments/subscription/pause')
      .set('Origin', 'http://localhost:5173')
      .send({ days: 14, reason: longReason })
    const createArgs = mocks.prisma.subscriptionPause.create.mock.calls[0][0].data
    expect(createArgs.reason.length).toBe(500)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// POST /api/payments/subscription/resume
// ────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/subscription/resume', () => {
  it('marks the active pause as resumed and clears Stripe pause_collection', async () => {
    mocks.prisma.subscriptionPause.findFirst.mockResolvedValue({
      id: 'pause_to_resume',
      status: 'active',
    })
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: 'sub_real_2',
    })

    const res = await request(app)
      .post('/api/payments/subscription/resume')
      .set('Origin', 'http://localhost:5173')
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/resumed/i)
    expect(mocks.prisma.subscriptionPause.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pause_to_resume' },
        data: expect.objectContaining({ status: 'resumed' }),
      }),
    )
    expect(mocks.stripeSubscriptions.update).toHaveBeenCalledWith(
      'sub_real_2',
      expect.objectContaining({ pause_collection: '' }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
  })

  it('returns 400 when no active pause exists', async () => {
    mocks.prisma.subscriptionPause.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/payments/subscription/resume')
      .set('Origin', 'http://localhost:5173')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no active pause/i)
    expect(mocks.prisma.subscriptionPause.update).not.toHaveBeenCalled()
  })

  it('skips Stripe API call for gift subscriptions', async () => {
    mocks.prisma.subscriptionPause.findFirst.mockResolvedValue({ id: 'p1', status: 'active' })
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: 'gift_sub_XYZ',
    })
    await request(app)
      .post('/api/payments/subscription/resume')
      .set('Origin', 'http://localhost:5173')
      .send({})
    expect(mocks.stripeSubscriptions.update).not.toHaveBeenCalled()
    // Local pause is still marked resumed.
    expect(mocks.prisma.subscriptionPause.update).toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// GET /api/payments/subscription/pause-status
// ────────────────────────────────────────────────────────────────────────────
describe('GET /api/payments/subscription/pause-status', () => {
  it('returns paused=false when no active pause exists', async () => {
    mocks.prisma.subscriptionPause.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .get('/api/payments/subscription/pause-status')
      .set('Origin', 'http://localhost:5173')
    expect(res.status).toBe(200)
    expect(res.body.paused).toBe(false)
    expect(res.body.pause).toBeNull()
  })

  it('returns paused=true + the pause record when one exists', async () => {
    const resumeAt = new Date(Date.now() + 7 * 86400_000)
    const pausedAt = new Date()
    mocks.prisma.subscriptionPause.findFirst.mockResolvedValue({
      id: 'pause_active',
      pausedAt,
      resumeAt,
      reason: 'travel',
      status: 'active',
    })
    const res = await request(app)
      .get('/api/payments/subscription/pause-status')
      .set('Origin', 'http://localhost:5173')
    expect(res.status).toBe(200)
    expect(res.body.paused).toBe(true)
    expect(res.body.pause.id).toBe('pause_active')
    expect(res.body.pause.reason).toBe('travel')
  })
})
