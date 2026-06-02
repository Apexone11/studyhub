/**
 * featureFlags-origin.unit.test.js — Regression for wave-12.19 fix.
 *
 * The featureFlags router applies `router.use(originAllowlist())` so every
 * write (POST/PUT/DELETE) is re-checked against the trusted-origin allowlist
 * on top of the global Origin check in index.js (CLAUDE.md A11). GETs are
 * short-circuited inside originAllowlist so the public /evaluate/:name read
 * keeps working for anonymous /register viewers.
 *
 * These tests assert:
 *   1. POST /api/flags with a trusted origin (http://localhost:5173 in dev) is
 *      NOT blocked at the origin layer — the request reaches the handler.
 *   2. POST /api/flags with an untrusted origin (https://evil.example.com) is
 *      rejected with 403 + body { error: 'Origin not allowed.', code: 'FORBIDDEN' }.
 *   3. GET /api/flags with no Origin header passes the origin gate (safe-method
 *      short-circuit) and reaches the handler.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const featureFlagsRoutePath = require.resolve('../../src/modules/featureFlags/featureFlags.routes')

const mocks = vi.hoisted(() => {
  const authState = {
    user: { userId: 1, username: 'admin_user', role: 'admin' },
  }

  const prisma = {
    featureFlag: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  }

  return {
    authState,
    prisma,
    requireAuth: vi.fn((req, res, next) => {
      if (!authState.user) {
        return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
      }
      req.user = authState.user
      next()
    }),
    requireAdmin: vi.fn((req, res, next) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.', code: 'FORBIDDEN' })
      }
      next()
    }),
    optionalAuth: vi.fn((req, _res, next) => {
      req.user = authState.user || null
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    rateLimiters: {
      adminLimiter: (_req, _res, next) => next(),
      readLimiter: (_req, _res, next) => next(),
    },
    featureFlagsLib: {
      evaluateFlag: vi.fn(async () => ({ enabled: false, reason: 'FLAG_NOT_FOUND' })),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), mocks.prisma],
  [require.resolve('../../src/middleware/auth'), mocks.requireAuth],
  [require.resolve('../../src/middleware/requireAdmin'), mocks.requireAdmin],
  [require.resolve('../../src/core/auth/optionalAuth'), mocks.optionalAuth],
  [require.resolve('../../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../../src/lib/featureFlags'), mocks.featureFlagsLib],
])

const originalModuleLoad = Module._load

let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[featureFlagsRoutePath]
  const featureFlagsRouterModule = require(featureFlagsRoutePath)
  const featureFlagsRouter = featureFlagsRouterModule.default || featureFlagsRouterModule

  app = express()
  app.use(express.json())
  app.use('/api/flags', featureFlagsRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[featureFlagsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.authState.user = { userId: 1, username: 'admin_user', role: 'admin' }
  mocks.prisma.featureFlag.findMany.mockResolvedValue([])
  mocks.prisma.featureFlag.create.mockResolvedValue({
    id: 1,
    name: 'design_v2_demo',
    description: null,
    enabled: false,
    rolloutPercentage: 0,
    conditions: null,
    createdAt: new Date('2026-05-29T00:00:00Z'),
    updatedAt: new Date('2026-05-29T00:00:00Z'),
  })
})

describe('POST /api/flags — originAllowlist gate (wave-12.19)', () => {
  it('lets a trusted dev Origin (http://localhost:5173) through to the handler', async () => {
    const res = await request(app)
      .post('/api/flags')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'design_v2_demo' })

    // Trusted origin: must NOT be blocked at the origin layer. The handler
    // runs and persists the flag, returning 201.
    expect(res.status).toBe(201)
    expect(mocks.prisma.featureFlag.create).toHaveBeenCalledTimes(1)
  })

  it('rejects an untrusted Origin (https://evil.example.com) with 403 + FORBIDDEN code', async () => {
    const res = await request(app)
      .post('/api/flags')
      .set('Origin', 'https://evil.example.com')
      .send({ name: 'design_v2_demo' })

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({
      error: 'Origin not allowed.',
      code: 'FORBIDDEN',
    })
    // Handler must NOT have run — the origin gate short-circuited.
    expect(mocks.prisma.featureFlag.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/flags — safe-method short-circuit', () => {
  it('passes the origin gate with no Origin header and reaches the handler', async () => {
    const res = await request(app).get('/api/flags')

    expect(res.status).toBe(200)
    expect(mocks.prisma.featureFlag.findMany).toHaveBeenCalledTimes(1)
  })
})
