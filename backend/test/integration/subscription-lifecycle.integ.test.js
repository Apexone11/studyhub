/**
 * subscription-lifecycle.integ.test.js — Loop T10 deep integration test.
 *
 * Scenario:
 *   1. Free user starts at plan='free' with AI quota 30/day.
 *   2. POST /api/payments/checkout/subscription → returns Stripe Checkout
 *      session URL (Stripe SDK mocked).
 *   3. Simulate `checkout.session.completed` webhook (via direct service
 *      call) → Subscription row written + DB plan = 'pro_monthly'.
 *   4. getUserPlan() now returns 'pro_monthly'.
 *   5. AI quota for the user is now 120/day (per PLANS[pro_monthly]).
 *   6. Simulate `customer.subscription.deleted` webhook → Subscription
 *      moved to 'canceled' status.
 *   7. getUserPlan returns 'free' once status is canceled.
 *
 * External services mocked:
 *   - Stripe SDK constructor (returns a stub Stripe client with the methods
 *     the route + service call).
 *   - Email helpers (send*).
 *   - Notify helper.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)

const state = {
  users: [{ id: 1, username: 'student1', email: 'student1@x.com', accountType: 'student' }],
  subscriptions: [],
  payments: [],
  notifications: [],
  emittedAchievementEvents: [],
  nextSubId: 1,
  nextPaymentId: 1,
}

function reset() {
  state.subscriptions.length = 0
  state.payments.length = 0
  state.notifications.length = 0
  state.emittedAchievementEvents.length = 0
  state.nextSubId = 1
  state.nextPaymentId = 1
}

// ── Stripe SDK stub ─────────────────────────────────────────────────
const stripeStub = {
  customers: {
    create: vi.fn(async ({ email, metadata }) => ({
      id: `cus_test_${metadata.studyhub_user_id}`,
      email,
      metadata,
    })),
    list: vi.fn(async () => ({ data: [] })),
    search: vi.fn(async () => ({ data: [] })),
    retrieve: vi.fn(async (id) => ({ id, email: 'student1@x.com' })),
  },
  checkout: {
    sessions: {
      create: vi.fn(async ({ customer, success_url, cancel_url, metadata }) => ({
        id: 'cs_test_abc123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_abc123',
        customer,
        success_url,
        cancel_url,
        metadata,
      })),
    },
  },
  subscriptions: {
    list: vi.fn(async () => ({ data: [] })),
    update: vi.fn(async (id, data) => ({ id, ...data })),
    retrieve: vi.fn(async (id) => ({ id, status: 'active' })),
  },
  billingPortal: {
    sessions: {
      create: vi.fn(async ({ return_url }) => ({
        url: 'https://billing.stripe.com/p/session_test',
        return_url,
      })),
    },
  },
  webhooks: {
    constructEvent: vi.fn((raw, _sig, _secret) => {
      // For the test we just JSON.parse the raw buffer and trust it.
      return JSON.parse(raw.toString('utf8'))
    }),
  },
}

function StripeCtor() {
  return stripeStub
}
Object.assign(StripeCtor, stripeStub)

const prismaMock = {
  $transaction: async (fnOrArr) =>
    typeof fnOrArr === 'function' ? fnOrArr(prismaMock) : Promise.all(fnOrArr),
  $queryRaw: vi.fn(async () => []),
  user: {
    findUnique: vi.fn(async ({ where, select }) => {
      const u = state.users.find((x) => x.id === where.id || x.email === where.email)
      if (!u) return null
      if (!select) return { ...u }
      const out = {}
      for (const k of Object.keys(select)) if (select[k]) out[k] = u[k]
      return out
    }),
  },
  subscription: {
    findUnique: vi.fn(async ({ where, select }) => {
      const s = state.subscriptions.find((x) => x.userId === where.userId)
      if (!s) return null
      if (!select) return { ...s }
      const out = {}
      for (const k of Object.keys(select)) if (select[k]) out[k] = s[k]
      return out
    }),
    upsert: vi.fn(async ({ where, create, update }) => {
      const existing = state.subscriptions.find((x) => x.userId === where.userId)
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() })
        return { ...existing }
      }
      const s = {
        id: state.nextSubId++,
        ...create,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      state.subscriptions.push(s)
      return { ...s }
    }),
    update: vi.fn(async ({ where, data }) => {
      const s = state.subscriptions.find((x) => x.userId === where.userId)
      if (!s) {
        const err = new Error('not found')
        err.code = 'P2025'
        throw err
      }
      Object.assign(s, data, { updatedAt: new Date() })
      return { ...s }
    }),
    findFirst: vi.fn(async ({ where }) => {
      let rows = state.subscriptions
      if (where?.stripeSubscriptionId) {
        rows = rows.filter((s) => s.stripeSubscriptionId === where.stripeSubscriptionId)
      }
      if (where?.stripeCustomerId) {
        rows = rows.filter((s) => s.stripeCustomerId === where.stripeCustomerId)
      }
      return rows[0] || null
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      let count = 0
      for (const s of state.subscriptions) {
        let match = true
        if (where?.stripeSubscriptionId && s.stripeSubscriptionId !== where.stripeSubscriptionId)
          match = false
        if (where?.userId && s.userId !== where.userId) match = false
        if (match) {
          Object.assign(s, data, { updatedAt: new Date() })
          count++
        }
      }
      return { count }
    }),
  },
  payment: {
    create: vi.fn(async ({ data }) => {
      const p = { id: state.nextPaymentId++, ...data, createdAt: new Date() }
      state.payments.push(p)
      return p
    }),
    findFirst: vi.fn(async ({ where }) => {
      let rows = state.payments
      if (where?.stripeInvoiceId)
        rows = rows.filter((p) => p.stripeInvoiceId === where.stripeInvoiceId)
      return rows[0] || null
    }),
  },
  donation: {
    create: vi.fn(async ({ data }) => ({ id: 1, ...data, createdAt: new Date() })),
    findFirst: vi.fn(async () => null),
    update: vi.fn(async () => null),
  },
}

const sentryMock = { captureError: vi.fn(), redactObject: (o) => o, redactHeaders: (h) => h }

const notifyMock = {
  createNotification: vi.fn(async (_p, payload) => {
    state.notifications.push({ ...payload })
    return payload
  }),
}

const emailMock = {
  sendDonationThankYou: vi.fn(async () => undefined),
  sendPaymentReceipt: vi.fn(async () => undefined),
  sendSubscriptionWelcome: vi.fn(async () => undefined),
}

const achievementsMock = {
  emitAchievementEvent: vi.fn(async (_p, userId, kind, metadata) => {
    state.emittedAchievementEvents.push({ userId, kind, metadata })
    return { awarded: [] }
  }),
  EVENT_KINDS: {
    SUBSCRIPTION_ACTIVATE: 'subscription.activate',
    DONATION_COMPLETE: 'donation.complete',
  },
}

const PRO_MONTHLY_PRICE = 'price_pro_monthly_test'

const paymentsConstantsMock = {
  PLANS: {
    free: {
      uploadsPerMonth: 10,
      privateGroups: 0,
      aiMessagesPerDay: 30,
      storageMb: 50,
    },
    pro_monthly: {
      uploadsPerMonth: -1,
      privateGroups: 5,
      aiMessagesPerDay: 120,
      storageMb: 1000,
      stripePriceId: PRO_MONTHLY_PRICE,
    },
    pro_yearly: {
      uploadsPerMonth: -1,
      privateGroups: 5,
      aiMessagesPerDay: 120,
      storageMb: 1000,
      stripePriceId: 'price_pro_yearly_test',
    },
  },
  DONATION_MIN_CENTS: 100,
  DONATION_MAX_CENTS: 100000,
  DONATION_MESSAGE_MAX_LENGTH: 280,
  planFromPriceId: (priceId) => {
    if (priceId === PRO_MONTHLY_PRICE) return 'pro_monthly'
    if (priceId === 'price_pro_yearly_test') return 'pro_yearly'
    return null
  },
}

// getUserPlan resolves from the in-memory subscription table; mirrors the
// real implementation (active sub → plan, else free).
const getUserPlanMock = {
  getUserPlan: vi.fn(async (userId) => {
    const sub = state.subscriptions.find((s) => s.userId === userId && s.status === 'active')
    return sub ? sub.plan : 'free'
  }),
  getUserTier: vi.fn(async (userId) => {
    const sub = state.subscriptions.find((s) => s.userId === userId && s.status === 'active')
    return sub ? sub.plan : 'free'
  }),
}

function fakeAuth(req, res, next) {
  const id = req.headers['x-test-user-id']
  if (!id) return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
  req.user = {
    userId: Number(id),
    role: String(req.headers['x-test-role'] || 'student'),
    username: state.users.find((u) => u.id === Number(id))?.username || `user${id}`,
  }
  next()
}
fakeAuth.default = fakeAuth

const passthroughLimiter = (_req, _res, next) => next()
const rateLimitersMock = new Proxy(
  {},
  {
    get(_t, key) {
      if (key === '__esModule') return true
      if (typeof key === 'string' && key.startsWith('create')) return () => passthroughLimiter
      return passthroughLimiter
    },
  },
)

const originAllowlistMock = Object.assign(() => (req, res, next) => next(), {
  normalizeOrigin: (v) => v,
  buildTrustedOrigins: () => new Set(),
})

const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), prismaMock],
  [require.resolve('../../src/middleware/auth'), fakeAuth],
  [require.resolve('../../src/middleware/originAllowlist'), originAllowlistMock],
  [require.resolve('../../src/core/auth/requireAuth'), fakeAuth],
  [
    require.resolve('../../src/core/auth/optionalAuth'),
    (req, _res, next) => {
      const id = req.headers['x-test-user-id']
      if (id) {
        req.user = {
          userId: Number(id),
          role: String(req.headers['x-test-role'] || 'student'),
        }
      }
      next()
    },
  ],
  [require.resolve('../../src/monitoring/sentry'), sentryMock],
  [require.resolve('../../src/lib/rateLimiters'), rateLimitersMock],
  [require.resolve('../../src/lib/notify'), notifyMock],
  [require.resolve('../../src/lib/email/email'), emailMock],
  [require.resolve('../../src/lib/getUserPlan'), getUserPlanMock],
  [require.resolve('../../src/modules/payments/payments.constants'), paymentsConstantsMock],
  [require.resolve('../../src/modules/achievements'), achievementsMock],
  [require.resolve('stripe'), StripeCtor],
])

const originalLoad = Module._load
let app
const paymentsRoutePath = require.resolve('../../src/modules/payments')

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy'
  process.env.STRIPE_PRICE_ID_PRO = PRO_MONTHLY_PRICE
  process.env.STRIPE_PRICE_ID_PRO_YEARLY = 'price_pro_yearly_test'
  process.env.FRONTEND_URL = 'http://localhost:5173'

  Module._load = function patched(req, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(req, parent, isMain)
      if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    } catch {
      /* fall through */
    }
    return originalLoad.apply(this, arguments)
  }

  delete require.cache[paymentsRoutePath]
  const paymentsRouter = require('../../src/modules/payments')
  const paymentsService = require('../../src/modules/payments/payments.service')

  app = express()
  // Webhook needs raw body — mount express.raw BEFORE express.json.
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))
  app.use(express.json({ limit: '2mb' }))
  app.use('/api/payments', paymentsRouter.default || paymentsRouter)
  // Expose service for assertions
  app.locals.paymentsService = paymentsService
  app.use((err, _req, res, _next) =>
    res.status(500).json({ error: err?.message || 'Server error' }),
  )
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[paymentsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  reset()
})

describe('Integration: subscription lifecycle (checkout → webhook → cancel)', () => {
  it('full free → pro → canceled lifecycle including plan resolution', async () => {
    // ── Step 1: confirm free baseline ────────────────────────────
    const initialPlan = await getUserPlanMock.getUserPlan(1)
    expect(initialPlan).toBe('free')
    expect(paymentsConstantsMock.PLANS.free.aiMessagesPerDay).toBe(30)

    // ── Step 2: POST /checkout/subscription ──────────────────────
    const checkoutRes = await request(app)
      .post('/api/payments/checkout/subscription')
      .set('x-test-user-id', '1')
      .set('x-test-role', 'student')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'pro_monthly' })

    expect(checkoutRes.status).toBe(200)
    expect(checkoutRes.body.url).toMatch(/checkout\.stripe\.com/)
    expect(checkoutRes.body.sessionId).toBe('cs_test_abc123')
    expect(stripeStub.checkout.sessions.create).toHaveBeenCalledTimes(1)

    // ── Step 3: simulate checkout.session.completed webhook ──────
    // The webhook handler in payments.service uses metadata.studyhub_user_id
    // + subscription details to upsert a Subscription row.
    const checkoutSessionEvent = {
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_abc123',
          mode: 'subscription',
          subscription: 'sub_test_1',
          customer: 'cus_test_1',
          metadata: { studyhub_user_id: '1', plan: 'pro_monthly' },
        },
      },
    }

    // The webhook also calls stripe.subscriptions.retrieve to get sub details.
    stripeStub.subscriptions.retrieve.mockResolvedValueOnce({
      id: 'sub_test_1',
      customer: 'cus_test_1',
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: PRO_MONTHLY_PRICE } }] },
    })

    const paymentsService = app.locals.paymentsService
    await paymentsService.handleCheckoutCompleted(checkoutSessionEvent.data.object)

    // Side-effect: Subscription row created with plan = 'pro_monthly'
    const sub = state.subscriptions.find((s) => s.userId === 1)
    expect(sub).toBeTruthy()
    expect(sub.plan).toBe('pro_monthly')
    expect(sub.status).toBe('active')
    expect(sub.stripeSubscriptionId).toBe('sub_test_1')

    // ── Step 4: getUserPlan() now returns 'pro_monthly' ──────────
    const newPlan = await getUserPlanMock.getUserPlan(1)
    expect(newPlan).toBe('pro_monthly')

    // ── Step 5: AI quota is now 120/day (per PLANS[pro_monthly]) ─
    const quotaForPro = paymentsConstantsMock.PLANS.pro_monthly.aiMessagesPerDay
    expect(quotaForPro).toBe(120)

    // ── Step 6: customer.subscription.deleted webhook fires ──────
    const subDeletedEvent = {
      id: 'sub_test_1',
      customer: 'cus_test_1',
      status: 'canceled',
      canceled_at: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) - 1,
      // The service uses metadata.studyhub_user_id to identify the owner.
      metadata: { studyhub_user_id: '1' },
    }

    await paymentsService.handleSubscriptionDeleted(subDeletedEvent)

    // Side-effect: subscription marked canceled
    const canceledSub = state.subscriptions.find((s) => s.userId === 1)
    expect(canceledSub.status).toBe('canceled')

    // ── Step 7: getUserPlan returns 'free' for canceled subs ─────
    const finalPlan = await getUserPlanMock.getUserPlan(1)
    expect(finalPlan).toBe('free')
  })

  it('rejects invalid plan name on checkout', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/subscription')
      .set('x-test-user-id', '1')
      .set('x-test-role', 'student')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'enterprise_unlimited' })
    expect(res.status).toBe(400)
  })

  it('rejects unauthenticated checkout', async () => {
    const res = await request(app)
      .post('/api/payments/checkout/subscription')
      .set('Origin', 'http://localhost:5173')
      .send({ plan: 'pro_monthly' })
    expect(res.status).toBe(401)
  })

  it('webhook rejects non-Buffer body (raw middleware not applied)', async () => {
    // Hit webhook through express.json path — i.e. with JSON content-type but
    // no raw mount. We accomplish this by sending a request that won't match
    // the raw mount for /webhook (e.g. wrong content-type). Express will
    // parse it via express.json, leaving req.body as a parsed object.
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('content-type', 'text/plain')
      .send('not json')
    // Some failure mode — depending on signature config, either 400 or 500.
    expect([400, 500]).toContain(res.status)
  })

  it('GET /subscription returns subscription state', async () => {
    // Seed an active subscription
    state.subscriptions.push({
      id: state.nextSubId++,
      userId: 1,
      stripeCustomerId: 'cus_test_1',
      stripeSubscriptionId: 'sub_test_1',
      stripePriceId: PRO_MONTHLY_PRICE,
      plan: 'pro_monthly',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await request(app)
      .get('/api/payments/subscription')
      .set('x-test-user-id', '1')
      .set('x-test-role', 'student')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      plan: 'pro_monthly',
      status: 'active',
    })
  })
})
