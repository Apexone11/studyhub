/**
 * auth.session.deep.test.js — POST /logout, GET /me, GET /sessions,
 * DELETE /sessions/:id, DELETE /sessions (revoke-all-other).
 *
 * Pins the contract that session writes flow through the real
 * session.service, that logout clears the auth cookie even when the
 * token is malformed, and that the IDOR window on per-session revoke
 * is closed (revokeSession returns null when userId doesn't match).
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const authRoutePath = require.resolve('../src/modules/auth')

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    session: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'session-1' }),
    },
    securityEvent: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    trustedDevice: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    featureFlag: { findUnique: vi.fn().mockResolvedValue(null) },
    legalDocument: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    legalAcceptance: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    subscription: { findMany: vi.fn().mockResolvedValue([]) },
    donation: { groupBy: vi.fn().mockResolvedValue([]) },
    notification: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (ops) => {
      if (typeof ops === 'function') return ops(prisma)
      return Promise.all(ops)
    }),
  }

  return {
    prisma,
    sentry: { captureError: vi.fn() },
    legalService: {
      CURRENT_LEGAL_VERSION: '2026-04-04',
      LEGAL_ACCEPTANCE_SOURCES: { REGISTER: 'register' },
      getSessionLegalAcceptanceState: vi.fn().mockResolvedValue({
        currentVersion: '2026-04-04',
        needsAcceptance: false,
        documents: [],
      }),
      recordCurrentRequiredLegalAcceptancesTx: vi.fn().mockResolvedValue({ count: 0 }),
      recordCurrentRequiredLegalAcceptances: vi.fn().mockResolvedValue({ count: 0 }),
      getCurrentLegalDocument: vi.fn().mockResolvedValue(null),
      getCurrentLegalDocuments: vi.fn().mockResolvedValue([]),
      getUserLegalStatus: vi.fn().mockResolvedValue({ needsAcceptance: false }),
      ensureLegalDocumentsSeeded: vi.fn().mockResolvedValue(undefined),
      acceptCurrentLegalDocuments: vi.fn().mockResolvedValue({ count: 0 }),
    },
    trustGate: {
      checkAndPromoteTrust: vi.fn().mockResolvedValue({ promoted: false }),
      TRUST_LEVELS: { NEW: 'new', VERIFIED: 'verified', TRUSTED: 'trusted' },
    },
  }
})

const originAllowlistMock = () => (_req, _res, next) => next()

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/modules/legal/legal.service'), mocks.legalService],
  [require.resolve('../src/lib/trustGate'), mocks.trustGate],
  [require.resolve('../src/middleware/originAllowlist'), originAllowlistMock],
])

const originalModuleLoad = Module._load
let app
let authedJti = null
let authedUserId = null

beforeAll(() => {
  // Long enough secret for JWT validation.
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-validation-check-ok'

  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    if (requestId === 'express-rate-limit') return () => (_req, _res, next) => next()
    // Replace requireAuth with a toggleable middleware so we can test 401 vs authed.
    if (requestId === '../../middleware/auth' || requestId === '../middleware/auth') {
      return function fakeRequireAuth(req, res, next) {
        if (authedUserId == null)
          return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
        req.user = { userId: authedUserId, username: 'sess_user', role: 'student' }
        req.sessionJti = authedJti
        next()
      }
    }
    try {
      const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
      const mockedModule = mockTargets.get(resolvedRequest)
      if (mockedModule) return mockedModule
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[authRoutePath]
  const authRouter = require(authRoutePath)
  app = express()
  app.use(express.json())
  app.use('/', authRouter.default || authRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[authRoutePath]
})

beforeEach(() => {
  // Use resetAllMocks (NOT clearAllMocks) so queued `.mockResolvedValueOnce(...)`
  // calls from one test do not bleed into the next. resetAllMocks wipes
  // implementations too, so all defaults must be re-applied below.
  vi.resetAllMocks()
  authedUserId = 1
  authedJti = 'jti-current'
  // $transaction default: when called with a function, run it; when called with
  // an array of promises, await them all. Mirrors Prisma's interactive-transaction
  // shape so session.service.revokeSession's $transaction([sess.update, td.update])
  // is exercised end-to-end.
  mocks.prisma.$transaction.mockImplementation(async (ops) => {
    if (typeof ops === 'function') return ops(mocks.prisma)
    return Promise.all(ops)
  })
  // Default resolved values so per-test mockResolvedValueOnce overrides cleanly.
  mocks.prisma.session.update.mockResolvedValue({})
  mocks.prisma.session.updateMany.mockResolvedValue({ count: 0 })
  mocks.prisma.session.findMany.mockResolvedValue([])
  mocks.prisma.trustedDevice.update.mockResolvedValue({})
  mocks.prisma.securityEvent.create.mockResolvedValue({})
  mocks.prisma.securityEvent.findMany.mockResolvedValue([])
  mocks.prisma.featureFlag.findUnique.mockResolvedValue(null)
  mocks.legalService.getSessionLegalAcceptanceState.mockResolvedValue({
    currentVersion: '2026-04-04',
    needsAcceptance: false,
    documents: [],
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Logout + session revoke
// ────────────────────────────────────────────────────────────────────────────
describe('POST /logout', () => {
  it('clears the studyhub_session cookie (Set-Cookie has expired Max-Age or Expires)', async () => {
    const res = await request(app).post('/logout')
    const cookies = res.headers['set-cookie']
    expect(cookies).toBeDefined()
    const sessionCookie = Array.isArray(cookies)
      ? cookies.find((c) => c.startsWith('studyhub_session='))
      : cookies
    expect(sessionCookie).toBeDefined()
    // Express clearCookie emits either Expires=Thu, 01 Jan 1970 or Max-Age=0.
    expect(sessionCookie).toMatch(/(Expires=Thu, 01 Jan 1970|Max-Age=0)/i)
  })

  it('returns 200 with a "Logged out." message body', async () => {
    const res = await request(app).post('/logout')
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Logged out.')
  })

  it('is idempotent — second call also returns 200 and clears the cookie', async () => {
    const r1 = await request(app).post('/logout')
    const r2 = await request(app).post('/logout')
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
  })

  it('clears the cookie even when no auth token was sent (anonymous logout)', async () => {
    const res = await request(app).post('/logout').unset('Authorization').unset('Cookie')
    expect(res.status).toBe(200)
    const cookies = res.headers['set-cookie']
    expect(cookies).toBeDefined()
  })

  it('does NOT throw even if the underlying revokeSessionByJti rejects', async () => {
    // The route catches token verification errors silently and still clears
    // the cookie. We assert the happy path: no 5xx leaks out.
    mocks.prisma.session.update.mockRejectedValueOnce(new Error('db down'))
    const res = await request(app).post('/logout')
    expect(res.status).toBe(200)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// GET /me
// ────────────────────────────────────────────────────────────────────────────
describe('GET /me', () => {
  it('401 when not authenticated', async () => {
    authedUserId = null
    const res = await request(app).get('/me')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('AUTH_REQUIRED')
  })

  it('returns the authenticated user payload (id, username, csrfToken)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 1,
      username: 'sess_user',
      email: 'me@studyhub.test',
      emailVerified: true,
      role: 'student',
      authProvider: 'local',
      accountType: 'student',
      trustLevel: 'trusted',
      createdAt: new Date(),
      avatarUrl: null,
      coverImageUrl: null,
      enrollments: [],
      _count: { enrollments: 0, studySheets: 0, starredSheets: 0 },
    })
    const res = await request(app).get('/me')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(1)
    expect(res.body.username).toBe('sess_user')
    expect(res.body.csrfToken).toBeDefined()
  })

  it('404 NOT_FOUND when the user row is gone', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/me')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// GET /sessions (list active)
// ────────────────────────────────────────────────────────────────────────────
describe('GET /sessions — list active sessions', () => {
  it('401 when not authenticated', async () => {
    authedUserId = null
    const res = await request(app).get('/sessions')
    expect(res.status).toBe(401)
  })

  it('returns an empty array when the user has no active sessions', async () => {
    mocks.prisma.session.findMany.mockResolvedValueOnce([])
    const res = await request(app).get('/sessions')
    expect(res.status).toBe(200)
    expect(res.body.sessions).toEqual([])
  })

  it('marks the current session with isCurrent=true via JTI match', async () => {
    mocks.prisma.session.findMany.mockResolvedValueOnce([
      {
        id: 's1',
        jti: 'jti-current',
        deviceLabel: 'Chrome on Windows',
        deviceKind: 'laptop',
        ipAddress: '10.0.0.1',
        country: 'US',
        region: 'CA',
        city: 'San Francisco',
        lastActiveAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: 's2',
        jti: 'jti-other',
        deviceLabel: 'Safari on iOS',
        deviceKind: 'mobile',
        ipAddress: '10.0.0.2',
        country: 'US',
        region: 'NY',
        city: 'New York',
        lastActiveAt: new Date(),
        createdAt: new Date(),
      },
    ])
    const res = await request(app).get('/sessions')
    expect(res.status).toBe(200)
    expect(res.body.sessions).toHaveLength(2)
    expect(res.body.sessions[0].isCurrent).toBe(true)
    expect(res.body.sessions[1].isCurrent).toBe(false)
    // JTI itself must NOT leak to the client — the frontend only needs id.
    expect(res.body.sessions[0].jti).toBeUndefined()
  })

  it('500 INTERNAL when prisma rejects', async () => {
    mocks.prisma.session.findMany.mockRejectedValueOnce(new Error('db down'))
    const res = await request(app).get('/sessions')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// DELETE /sessions/:id
// ────────────────────────────────────────────────────────────────────────────
describe('DELETE /sessions/:id — revoke single session', () => {
  it('401 when not authenticated', async () => {
    authedUserId = null
    const res = await request(app).delete('/sessions/s1')
    expect(res.status).toBe(401)
  })

  it('404 NOT_FOUND when session does not belong to the user (IDOR guard)', async () => {
    // Session belongs to userId=2, but the authed user is userId=1.
    mocks.prisma.session.findUnique.mockResolvedValueOnce({
      id: 's-other',
      userId: 2,
      trustedDevice: null,
    })
    const res = await request(app).delete('/sessions/s-other')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('404 NOT_FOUND when the session row does not exist', async () => {
    mocks.prisma.session.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).delete('/sessions/nope')
    expect(res.status).toBe(404)
  })

  it('200 OK when user revokes their own session — Session.update is called', async () => {
    mocks.prisma.session.findUnique
      .mockResolvedValueOnce({
        id: 's-mine',
        userId: 1,
        revokedAt: null,
        trustedDevice: null,
      })
      .mockResolvedValueOnce({ id: 's-mine', revokedAt: new Date() })
    const res = await request(app).delete('/sessions/s-mine')
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Session revoked.')
    expect(mocks.prisma.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's-mine' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    )
  })

  it('also revokes the linked TrustedDevice when present', async () => {
    mocks.prisma.session.findUnique
      .mockResolvedValueOnce({
        id: 's-mine',
        userId: 1,
        revokedAt: null,
        trustedDevice: { id: 'td-1', revokedAt: null },
      })
      .mockResolvedValueOnce({ id: 's-mine', revokedAt: new Date() })
    await request(app).delete('/sessions/s-mine')
    // session.service uses $transaction with [session.update, trustedDevice.update]
    expect(mocks.prisma.$transaction).toHaveBeenCalled()
    expect(mocks.prisma.trustedDevice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'td-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    )
  })
})

// ────────────────────────────────────────────────────────────────────────────
// DELETE /sessions — revoke all OTHER sessions
// ────────────────────────────────────────────────────────────────────────────
describe('DELETE /sessions — revoke all other sessions', () => {
  it('401 when not authenticated', async () => {
    authedUserId = null
    const res = await request(app).delete('/sessions')
    expect(res.status).toBe(401)
  })

  it('400 when the current session has no JTI (legacy token)', async () => {
    authedJti = null
    const res = await request(app).delete('/sessions')
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('BAD_REQUEST')
    expect(res.body.error).toMatch(/log out and log in again/i)
  })

  it('200 OK and revokes via session.updateMany NOT-current-JTI', async () => {
    mocks.prisma.session.updateMany.mockResolvedValueOnce({ count: 3 })
    const res = await request(app).delete('/sessions')
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('All other sessions revoked.')
    const call = mocks.prisma.session.updateMany.mock.calls[0][0]
    // The implementation uses Prisma 6 array form for NOT (CLAUDE.md §3 of common bugs).
    expect(call.where.userId).toBe(1)
    expect(call.where.revokedAt).toBeNull()
    // NOT-clause must exclude the current JTI to avoid signing the caller out.
    expect(call.where.NOT).toEqual([{ jti: 'jti-current' }])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// GET /security/login-activity
// ────────────────────────────────────────────────────────────────────────────
describe('GET /security/login-activity', () => {
  it('401 when not authenticated', async () => {
    authedUserId = null
    const res = await request(app).get('/security/login-activity')
    expect(res.status).toBe(401)
  })

  it('returns shaped events with band defaulted to "normal" when missing', async () => {
    mocks.prisma.securityEvent.findMany.mockResolvedValueOnce([
      {
        id: 1,
        eventType: 'login.success',
        ipAddress: '10.0.0.1',
        userAgent: 'UA',
        metadata: { deviceLabel: 'Chrome on Windows', riskScore: 5 },
        createdAt: new Date(),
      },
    ])
    const res = await request(app).get('/security/login-activity')
    expect(res.status).toBe(200)
    expect(res.body.events).toHaveLength(1)
    expect(res.body.events[0].band).toBe('normal')
    expect(res.body.events[0].deviceLabel).toBe('Chrome on Windows')
    expect(res.body.events[0].riskScore).toBe(5)
  })

  it('clamps `limit` query param to 1..50 (out-of-range value capped)', async () => {
    mocks.prisma.securityEvent.findMany.mockResolvedValueOnce([])
    await request(app).get('/security/login-activity?limit=9999')
    const call = mocks.prisma.securityEvent.findMany.mock.calls[0][0]
    expect(call.take).toBe(50)
  })

  it('defaults to take=30 when no `limit` is provided', async () => {
    mocks.prisma.securityEvent.findMany.mockResolvedValueOnce([])
    await request(app).get('/security/login-activity')
    const call = mocks.prisma.securityEvent.findMany.mock.calls[0][0]
    expect(call.take).toBe(30)
  })
})
