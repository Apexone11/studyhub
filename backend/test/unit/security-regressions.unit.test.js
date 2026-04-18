/**
 * security-regressions.unit.test.js
 *
 * Regression tests for five security fixes. Each block pins the behavior of
 * exactly one fix; if the corresponding guard is removed, the tests here
 * should fail loudly.
 */
import Module, { createRequire } from 'node:module'
import crypto from 'node:crypto'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)

// ───────────────────────────────────────────────────────────────────────────
// Hoisted mock groups (one per fix)
// ───────────────────────────────────────────────────────────────────────────

const fix2Mocks = vi.hoisted(() => {
  const stripeWebhooks = { constructEvent: vi.fn() }
  const mockStripeInstance = {
    customers: { create: vi.fn(), search: vi.fn(), list: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    subscriptions: { retrieve: vi.fn(), list: vi.fn(), update: vi.fn() },
    webhooks: stripeWebhooks,
  }
  return {
    stripeWebhooks,
    mockStripeInstance,
    service: {
      getStripe: vi.fn(() => mockStripeInstance),
      handleCheckoutCompleted: vi.fn(),
      handleSubscriptionUpdated: vi.fn(),
      handleSubscriptionDeleted: vi.fn(),
      handleInvoicePaymentSucceeded: vi.fn(),
      handleInvoicePaymentFailed: vi.fn(),
      createSubscriptionCheckout: vi.fn(),
      createDonationCheckout: vi.fn(),
      createPortalSession: vi.fn(),
      getUserSubscription: vi.fn(),
      getUserPayments: vi.fn(),
      getUserPaymentExportRows: vi.fn(),
      getDonationLeaderboard: vi.fn(),
      getAnonymousDonationSummary: vi.fn(),
      getSubscriberShowcase: vi.fn(),
      getRevenueAnalytics: vi.fn(),
    },
    prisma: {
      user: { findUnique: vi.fn() },
      subscription: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
      payment: { findFirst: vi.fn(), create: vi.fn() },
      studySheet: { count: vi.fn() },
      studyGroup: { count: vi.fn() },
    },
    sentry: { captureError: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    rateLimiters: {
      paymentCheckoutLimiter: (_req, _res, next) => next(),
      paymentPortalLimiter: (_req, _res, next) => next(),
      paymentReadLimiter: (_req, _res, next) => next(),
      paymentWebhookLimiter: (_req, _res, next) => next(),
    },
    requireAuth: (req, _res, next) => {
      req.user = { userId: 1, username: 'test', role: 'user' }
      next()
    },
    optionalAuth: (_req, _res, next) => next(),
  }
})

const fix3Mocks = vi.hoisted(() => {
  const mockStripeInstance = {
    customers: { search: vi.fn(), list: vi.fn() },
    subscriptions: { list: vi.fn() },
  }
  return {
    mockStripeInstance,
    service: {
      getStripe: vi.fn(() => mockStripeInstance),
      getUserSubscription: vi.fn(async () => ({ plan: 'free', status: 'active' })),
      handleCheckoutCompleted: vi.fn(),
      handleSubscriptionUpdated: vi.fn(),
      handleSubscriptionDeleted: vi.fn(),
      handleInvoicePaymentSucceeded: vi.fn(),
      handleInvoicePaymentFailed: vi.fn(),
      createSubscriptionCheckout: vi.fn(),
      createDonationCheckout: vi.fn(),
      createPortalSession: vi.fn(),
      getUserPayments: vi.fn(),
      getUserPaymentExportRows: vi.fn(),
      getDonationLeaderboard: vi.fn(),
      getAnonymousDonationSummary: vi.fn(),
      getSubscriberShowcase: vi.fn(),
      getRevenueAnalytics: vi.fn(),
    },
    prisma: {
      user: { findUnique: vi.fn(async () => ({ email: 'user@test.com' })) },
      subscription: {
        upsert: vi.fn(async () => ({})),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      payment: { findFirst: vi.fn(), create: vi.fn() },
      studySheet: { count: vi.fn() },
      studyGroup: { count: vi.fn() },
    },
    sentry: { captureError: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    rateLimiters: {
      paymentCheckoutLimiter: (_req, _res, next) => next(),
      paymentPortalLimiter: (_req, _res, next) => next(),
      paymentReadLimiter: (_req, _res, next) => next(),
      paymentWebhookLimiter: (_req, _res, next) => next(),
    },
    requireAuth: (req, _res, next) => {
      req.user = { userId: 42, username: 'test', role: 'user' }
      next()
    },
    optionalAuth: (_req, _res, next) => next(),
  }
})

const fix4Mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    conversationParticipant: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    studyGroupMember: { findMany: vi.fn() },
  },
  sentry: { captureError: vi.fn() },
}))

const fix5Mocks = vi.hoisted(() => {
  class MockAppError extends Error {
    constructor(statusCode, message) {
      super(message)
      this.statusCode = statusCode
    }
  }

  const tx = {
    user: { create: vi.fn() },
  }

  return {
    tx,
    prisma: {
      user: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback) => callback(tx)),
    },
    googleAuth: {
      verifyGoogleIdToken: vi.fn(),
      findUserByGoogleId: vi.fn(async () => null),
      findUserByEmail: vi.fn(async () => null),
      isGoogleOAuthEnabled: vi.fn(() => true),
    },
    authConstants: {
      googleLimiter: (_req, _res, next) => next(),
    },
    rateLimiters: {
      googleCompleteLimiter: (_req, _res, next) => next(),
    },
    authService: {
      AppError: MockAppError,
      issueAuthenticatedSession: vi.fn(async (_res, userId) => ({
        id: userId,
        username: 'session_user',
        legalAcceptance: {
          currentVersion: '2026-04-04',
          needsAcceptance: false,
        },
      })),
      handleAuthError: vi.fn((req, res, error) =>
        res.status(error.statusCode || 500).json({
          error: error.message || 'Server error.',
        }),
      ),
    },
    legalService: {
      CURRENT_LEGAL_VERSION: '2026-04-04',
      LEGAL_ACCEPTANCE_SOURCES: { GOOGLE_SIGNUP: 'google-signup' },
      recordCurrentRequiredLegalAcceptancesTx: vi.fn(),
    },
  }
})

// ───────────────────────────────────────────────────────────────────────────
// Fix 1 — isMobileClient requires Capacitor origin
// ───────────────────────────────────────────────────────────────────────────

describe('Fix 1 — isMobileClient requires Capacitor origin', () => {
  const authServicePath = require.resolve('../../src/modules/auth/auth.service')
  const originalModuleLoad = Module._load
  let isMobileClient

  beforeAll(() => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-123'
    }

    // auth.service requires prisma at module load; stub it so Prisma Client
    // does not need to be generated for a pure-function test.
    const prismaStub = {
      user: { findUnique: vi.fn() },
      course: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
      school: { findUnique: vi.fn() },
    }
    const targets = new Map([[require.resolve('../../src/lib/prisma'), prismaStub]])
    Module._load = function patchedModuleLoad(requestId, parent, isMain) {
      try {
        const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
        const mocked = targets.get(resolvedRequest)
        if (mocked) return mocked
      } catch {
        // fall through
      }
      return originalModuleLoad.apply(this, arguments)
    }

    delete require.cache[authServicePath]
    const mod = require(authServicePath)
    isMobileClient = mod.isMobileClient
  })

  afterAll(() => {
    Module._load = originalModuleLoad
    delete require.cache[authServicePath]
  })

  it('accepts X-Client mobile with https://localhost origin', () => {
    expect(isMobileClient({ headers: { 'x-client': 'mobile', origin: 'https://localhost' } })).toBe(
      true,
    )
  })

  it('accepts X-Client mobile with capacitor://localhost origin', () => {
    expect(
      isMobileClient({ headers: { 'x-client': 'mobile', origin: 'capacitor://localhost' } }),
    ).toBe(true)
  })

  it('rejects X-Client mobile with a non-Capacitor origin (exploit case)', () => {
    expect(
      isMobileClient({ headers: { 'x-client': 'mobile', origin: 'https://getstudyhub.org' } }),
    ).toBe(false)
  })

  it('rejects X-Client mobile with no origin header', () => {
    expect(isMobileClient({ headers: { 'x-client': 'mobile' } })).toBe(false)
  })

  it('rejects a Capacitor origin alone when X-Client is absent', () => {
    expect(isMobileClient({ headers: { origin: 'https://localhost' } })).toBe(false)
  })

  it('rejects an empty headers object', () => {
    expect(isMobileClient({ headers: {} })).toBe(false)
  })

  it('rejects null input', () => {
    expect(isMobileClient(null)).toBe(false)
  })

  it('rejects undefined input', () => {
    expect(isMobileClient(undefined)).toBe(false)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Fix 2 — Stripe webhook rejects non-Buffer body
// ───────────────────────────────────────────────────────────────────────────

describe('Fix 2 — Stripe webhook rejects non-Buffer body', () => {
  const routesPath = require.resolve('../../src/modules/payments/payments.routes')
  const servicePath = require.resolve('../../src/modules/payments/payments.service')
  const sprintEPath = require.resolve('../../src/modules/payments/sprintE.routes')

  let fix2MockTargets
  const originalModuleLoad = Module._load
  let app

  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123456789'
    process.env.STRIPE_PRICE_ID_PRO = 'price_pro_monthly_test'
    process.env.STRIPE_PRICE_ID_PRO_YEARLY = 'price_pro_yearly_test'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123456789'

    fix2MockTargets = new Map([
      [servicePath, fix2Mocks.service],
      [require.resolve('../../src/lib/prisma'), fix2Mocks.prisma],
      [require.resolve('../../src/monitoring/sentry'), fix2Mocks.sentry],
      [require.resolve('../../src/lib/logger'), fix2Mocks.logger],
      [require.resolve('../../src/lib/rateLimiters'), fix2Mocks.rateLimiters],
      [require.resolve('../../src/middleware/auth'), fix2Mocks.requireAuth],
      [require.resolve('../../src/core/auth/optionalAuth'), fix2Mocks.optionalAuth],
      [sprintEPath, express.Router()],
    ])

    Module._load = function patchedModuleLoad(requestId, parent, isMain) {
      try {
        const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
        const mockedModule = fix2MockTargets.get(resolvedRequest)
        if (mockedModule) return mockedModule
      } catch {
        // fall through
      }
      return originalModuleLoad.apply(this, arguments)
    }

    delete require.cache[routesPath]
    delete require.cache[sprintEPath]
    const router = require(routesPath)

    app = express()
    // Deliberately mount WITHOUT express.raw() to simulate the misconfiguration
    // the fix defends against.
    app.use(express.json())
    app.use('/api/payments', router)
  })

  afterAll(() => {
    Module._load = originalModuleLoad
    delete require.cache[routesPath]
    delete require.cache[sprintEPath]
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when body is a parsed JSON object (non-Buffer)', async () => {
    const response = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 'dummy-sig')
      .set('Content-Type', 'application/json')
      .send({ type: 'checkout.session.completed', data: { object: {} } })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Invalid webhook payload' })
    expect(fix2Mocks.stripeWebhooks.constructEvent).not.toHaveBeenCalled()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Fix 3 — planFromPriceId rejects unknown in self-sync
// ───────────────────────────────────────────────────────────────────────────

describe('Fix 3 — planFromPriceId rejects unknown in /subscription/sync', () => {
  const routesPath = require.resolve('../../src/modules/payments/payments.routes')
  const servicePath = require.resolve('../../src/modules/payments/payments.service')
  const sprintEPath = require.resolve('../../src/modules/payments/sprintE.routes')

  let fix3MockTargets
  const originalModuleLoad = Module._load
  let app

  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123456789'
    process.env.STRIPE_PRICE_ID_PRO = 'price_pro_monthly_test'
    process.env.STRIPE_PRICE_ID_PRO_YEARLY = 'price_pro_yearly_test'

    fix3MockTargets = new Map([
      [servicePath, fix3Mocks.service],
      [require.resolve('../../src/lib/prisma'), fix3Mocks.prisma],
      [require.resolve('../../src/monitoring/sentry'), fix3Mocks.sentry],
      [require.resolve('../../src/lib/logger'), fix3Mocks.logger],
      [require.resolve('../../src/lib/rateLimiters'), fix3Mocks.rateLimiters],
      [require.resolve('../../src/middleware/auth'), fix3Mocks.requireAuth],
      [require.resolve('../../src/core/auth/optionalAuth'), fix3Mocks.optionalAuth],
      [sprintEPath, express.Router()],
    ])

    Module._load = function patchedModuleLoad(requestId, parent, isMain) {
      try {
        const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
        const mockedModule = fix3MockTargets.get(resolvedRequest)
        if (mockedModule) return mockedModule
      } catch {
        // fall through
      }
      return originalModuleLoad.apply(this, arguments)
    }

    delete require.cache[routesPath]
    delete require.cache[sprintEPath]
    const router = require(routesPath)

    app = express()
    app.use(express.json())
    app.use('/api/payments', router)
  })

  afterAll(() => {
    Module._load = originalModuleLoad
    delete require.cache[routesPath]
    delete require.cache[sprintEPath]
  })

  beforeEach(() => {
    vi.clearAllMocks()
    fix3Mocks.service.getStripe.mockReturnValue(fix3Mocks.mockStripeInstance)
    fix3Mocks.prisma.user.findUnique.mockResolvedValue({ email: 'user@test.com' })
  })

  it('skips upsert when Stripe subscription has an unrecognized price ID', async () => {
    fix3Mocks.mockStripeInstance.customers.search.mockResolvedValue({
      data: [{ id: 'cus_fix3' }],
    })
    fix3Mocks.mockStripeInstance.customers.list.mockResolvedValue({ data: [] })
    fix3Mocks.mockStripeInstance.subscriptions.list.mockImplementation(async ({ status }) => {
      if (status === 'active') {
        return {
          data: [
            {
              id: 'sub_fix3_unknown',
              status: 'active',
              items: { data: [{ price: { id: 'price_unknown_xyz' } }] },
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
              cancel_at_period_end: false,
            },
          ],
        }
      }
      return { data: [] }
    })

    const response = await request(app).post('/api/payments/subscription/sync').send({})

    expect(response.status).toBe(200)
    expect(response.body.synced).toBe(false)

    // Upsert must NOT have been called at all — and certainly never with pro_monthly.
    expect(fix3Mocks.prisma.subscription.upsert).not.toHaveBeenCalled()
    for (const call of fix3Mocks.prisma.subscription.upsert.mock.calls) {
      const arg = call[0]
      expect(arg?.create?.plan).not.toBe('pro_monthly')
      expect(arg?.update?.plan).not.toBe('pro_monthly')
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Fix 4 — Socket.io bearer auth gated on Capacitor origin
// ───────────────────────────────────────────────────────────────────────────

describe('Fix 4 — Socket.io bearer auth gated on Capacitor origin', () => {
  const socketioPath = require.resolve('../../src/lib/socketio.js')

  let fix4Targets
  const originalModuleLoad = Module._load
  let authenticateSocketHandshake
  let signValidJwt

  beforeAll(() => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-123'
    }

    fix4Targets = new Map([
      [require.resolve('../../src/lib/prisma'), fix4Mocks.prisma],
      [require.resolve('../../src/monitoring/sentry'), fix4Mocks.sentry],
    ])

    Module._load = function patchedModuleLoad(requestId, parent, isMain) {
      try {
        const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
        const mocked = fix4Targets.get(resolvedRequest)
        if (mocked) return mocked
      } catch {
        // fall through
      }
      return originalModuleLoad.apply(this, arguments)
    }

    delete require.cache[socketioPath]
    const mod = require(socketioPath)
    authenticateSocketHandshake = mod.authenticateSocketHandshake

    signValidJwt = (userId = 42) =>
      jwt.sign({ sub: userId, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '24h' })
  })

  afterAll(() => {
    Module._load = originalModuleLoad
    delete require.cache[socketioPath]
  })

  it('exports authenticateSocketHandshake for testing', () => {
    expect(typeof authenticateSocketHandshake).toBe('function')
  })

  it('rejects a bearer token when Origin is not a Capacitor scheme', () => {
    const token = signValidJwt(42)
    const socket = {
      id: 'sock-1',
      handshake: {
        headers: { origin: 'https://getstudyhub.org' },
        auth: { token },
      },
    }
    const next = vi.fn()

    authenticateSocketHandshake(socket, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(next.mock.calls[0][0].message).toBe('Auth required')
    expect(socket.userId).toBeUndefined()
  })

  it('rejects an Authorization: Bearer header when Origin is not a Capacitor scheme', () => {
    const token = signValidJwt(42)
    const socket = {
      id: 'sock-1b',
      handshake: {
        headers: {
          origin: 'https://getstudyhub.org',
          authorization: `Bearer ${token}`,
        },
        auth: {},
      },
    }
    const next = vi.fn()

    authenticateSocketHandshake(socket, next)

    expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(socket.userId).toBeUndefined()
  })

  it('accepts a bearer token when Origin is https://localhost (Capacitor)', () => {
    const token = signValidJwt(77)
    const socket = {
      id: 'sock-2',
      handshake: {
        headers: { origin: 'https://localhost' },
        auth: { token },
      },
    }
    const next = vi.fn()

    authenticateSocketHandshake(socket, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0]).toBeUndefined()
    expect(socket.userId).toBe(77)
  })

  it('accepts a bearer token when Origin is capacitor://localhost', () => {
    const token = signValidJwt(99)
    const socket = {
      id: 'sock-3',
      handshake: {
        headers: { origin: 'capacitor://localhost' },
        auth: { token },
      },
    }
    const next = vi.fn()

    authenticateSocketHandshake(socket, next)

    expect(next.mock.calls[0][0]).toBeUndefined()
    expect(socket.userId).toBe(99)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Fix 5 — Google tempToken single-use
// ───────────────────────────────────────────────────────────────────────────

describe('Fix 5 — Google tempToken single-use', () => {
  const googleRoutePath = require.resolve('../../src/modules/auth/auth.google.controller')

  let fix5Targets
  const originalModuleLoad = Module._load
  let app
  let usedTokenCache

  beforeAll(() => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-123'
    }

    fix5Targets = new Map([
      [require.resolve('../../src/lib/prisma'), fix5Mocks.prisma],
      [require.resolve('../../src/lib/googleAuth'), fix5Mocks.googleAuth],
      [require.resolve('../../src/modules/auth/auth.constants'), fix5Mocks.authConstants],
      [require.resolve('../../src/lib/rateLimiters'), fix5Mocks.rateLimiters],
      [require.resolve('../../src/modules/auth/auth.service'), fix5Mocks.authService],
      [require.resolve('../../src/modules/legal/legal.service'), fix5Mocks.legalService],
    ])

    Module._load = function patchedModuleLoad(requestId, parent, isMain) {
      try {
        const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
        const mocked = fix5Targets.get(resolvedRequest)
        if (mocked) return mocked
      } catch {
        // fall through
      }
      return originalModuleLoad.apply(this, arguments)
    }

    delete require.cache[googleRoutePath]
    const routerModule = require(googleRoutePath)
    const router = routerModule.default || routerModule

    usedTokenCache = require('../../src/lib/usedTokenCache')

    app = express()
    app.use(express.json())
    app.use('/', router)
  })

  afterAll(() => {
    Module._load = originalModuleLoad
    delete require.cache[googleRoutePath]
  })

  beforeEach(() => {
    vi.clearAllMocks()
    fix5Mocks.googleAuth.findUserByGoogleId.mockResolvedValue(null)
    fix5Mocks.googleAuth.findUserByEmail.mockResolvedValue(null)
    fix5Mocks.googleAuth.isGoogleOAuthEnabled.mockReturnValue(true)
    fix5Mocks.prisma.$transaction.mockImplementation(async (callback) => callback(fix5Mocks.tx))
    usedTokenCache._resetForTests()
  })

  function signTempToken({ googleId = 'g1', email = 'u@test.com', emailVerified = true } = {}) {
    return jwt.sign(
      { typ: 'google_pending', googleId, email, emailVerified, name: null, picture: null },
      process.env.JWT_SECRET,
      { expiresIn: '15m', jwtid: crypto.randomUUID() },
    )
  }

  it('rejects a replayed tempToken with a "already been used" error', async () => {
    fix5Mocks.tx.user.create.mockResolvedValue({ id: 501 })

    const tempToken = signTempToken({ googleId: 'g-replay', email: 'replay@test.com' })

    const first = await request(app).post('/google/complete').send({
      tempToken,
      accountType: 'student',
      legalAccepted: true,
      legalVersion: '2026-04-04',
    })

    // The first call should succeed (201) so we know the token was valid.
    expect(first.status).toBe(201)

    const replay = await request(app).post('/google/complete').send({
      tempToken,
      accountType: 'student',
      legalAccepted: true,
      legalVersion: '2026-04-04',
    })

    expect(replay.status).toBe(400)
    expect(replay.body.error).toMatch(/already been used/i)
  })

  it('rejects a replayed tempToken even when the first call failed after marking the jti', async () => {
    // Simulate DB failure AFTER markTokenUsed. The jti should still be burned.
    const dbError = new Error('DB down')
    fix5Mocks.prisma.$transaction.mockRejectedValueOnce(dbError)

    const tempToken = signTempToken({ googleId: 'g-db-fail', email: 'dbfail@test.com' })

    const first = await request(app).post('/google/complete').send({
      tempToken,
      accountType: 'student',
      legalAccepted: true,
      legalVersion: '2026-04-04',
    })

    // First call hit the DB error path; exact status depends on handleAuthError.
    // What matters is the jti was marked before the DB write.
    expect(first.status).toBeGreaterThanOrEqual(400)

    const replay = await request(app).post('/google/complete').send({
      tempToken,
      accountType: 'student',
      legalAccepted: true,
      legalVersion: '2026-04-04',
    })

    expect(replay.status).toBe(400)
    expect(replay.body.error).toMatch(/already been used/i)
  })
})
