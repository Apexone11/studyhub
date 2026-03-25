/**
 * Auth Cookie Hardening — Regression Tests
 *
 * Proves:
 * - Auth cookie is set with HttpOnly, Secure (prod), SameSite, Path=/api
 * - setAuthCookie / clearAuthCookie produce correct Set-Cookie headers
 * - JWT_SECRET validation catches missing/short secrets at startup
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const authTokensPath = require.resolve('../src/lib/authTokens')
const authRoutePath = require.resolve('../src/modules/auth')

const mocks = {
  prisma: {
    user: { findUnique: () => null, findFirst: () => null, create: () => null, update: () => null, count: () => 0 },
    school: { findFirst: () => null },
    $transaction: (fn) => (typeof fn === 'function' ? fn(mocks.prisma) : Promise.all(fn)),
  },
  sentry: { captureError: () => {} },
  securityEvents: { logSecurityEvent: () => {} },
  email: { sendVerificationEmail: () => {} },
  notify: { createNotification: () => {} },
  badges: { checkAndAwardBadges: () => {} },
  activityTracker: { trackActivity: () => {} },
}

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/securityEvents'), mocks.securityEvents],
  [require.resolve('../src/lib/email'), mocks.email],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/badges'), mocks.badges],
  [require.resolve('../src/lib/activityTracker'), mocks.activityTracker],
])

const originalModuleLoad = Module._load
let logoutApp

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-validation-check-ok'

  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    if (requestId === 'express-rate-limit') return () => (_req, _res, next) => next()
    try {
      const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
      const mockedModule = mockTargets.get(resolvedRequest)
      if (mockedModule) return mockedModule
    } catch { /* fall through */ }
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[authRoutePath]
  const authRouter = require(authRoutePath)
  logoutApp = express()
  logoutApp.use(express.json())
  logoutApp.use('/api/auth', authRouter.default || authRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[authRoutePath]
})

/* ═══════════════════════════════════════════════════════════════════════════
 * setAuthCookie — direct unit test via a mini Express app
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('setAuthCookie() produces correct Set-Cookie header', () => {
  it('sets HttpOnly, SameSite=Lax, Path=/api, Max-Age in dev', async () => {
    const { setAuthCookie, signAuthToken } = require(authTokensPath)
    const miniApp = express()
    miniApp.get('/test-cookie', (_req, res) => {
      const token = signAuthToken({ id: 1, role: 'student' })
      setAuthCookie(res, token)
      res.json({ ok: true })
    })

    const res = await request(miniApp).get('/test-cookie')
    const cookies = res.headers['set-cookie']
    expect(cookies).toBeDefined()

    const sessionCookie = Array.isArray(cookies)
      ? cookies.find((c) => c.startsWith('studyhub_session='))
      : cookies

    expect(sessionCookie).toBeDefined()
    expect(sessionCookie).toMatch(/HttpOnly/i)
    expect(sessionCookie).toMatch(/Path=\/api/i)
    expect(sessionCookie).toMatch(/SameSite=Lax/i)
    expect(sessionCookie).toMatch(/Max-Age=86400/i)
    // In dev mode, Secure flag should NOT be present
    expect(sessionCookie).not.toMatch(/;\s*Secure/i)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * Logout clears cookie with matching path/flags
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('POST /api/auth/logout — clears cookie correctly', () => {
  it('clears studyhub_session with HttpOnly and Path=/api', async () => {
    const res = await request(logoutApp).post('/api/auth/logout')

    const cookies = res.headers['set-cookie']
    expect(cookies).toBeDefined()

    const clearCookie = Array.isArray(cookies)
      ? cookies.find((c) => c.startsWith('studyhub_session='))
      : cookies

    expect(clearCookie).toBeDefined()
    expect(clearCookie).toMatch(/HttpOnly/i)
    expect(clearCookie).toMatch(/Path=\/api/i)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * getAuthCookieOptions() shape — dev vs production
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('getAuthCookieOptions()', () => {
  function freshAuthTokens() {
    delete require.cache[authTokensPath]
    return require(authTokensPath)
  }

  it('dev: httpOnly=true, secure=false, sameSite=lax, path=/api', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
      const { getAuthCookieOptions } = freshAuthTokens()
      const opts = getAuthCookieOptions()
      expect(opts.httpOnly).toBe(true)
      expect(opts.secure).toBe(false)
      expect(opts.sameSite).toBe('lax')
      expect(opts.path).toBe('/api')
      expect(opts.maxAge).toBe(86400000)
    } finally {
      process.env.NODE_ENV = prev
    }
  })

  it('production: httpOnly=true, secure=true, sameSite=none (cross-origin)', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const { getAuthCookieOptions } = freshAuthTokens()
      const opts = getAuthCookieOptions()
      expect(opts.httpOnly).toBe(true)
      expect(opts.secure).toBe(true)
      // SameSite=None is required for cross-origin cookie auth on split-origin deploy
      expect(opts.sameSite).toBe('none')
      expect(opts.path).toBe('/api')
    } finally {
      process.env.NODE_ENV = prev
    }
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * validateSecrets() — startup crash on bad config
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('validateSecrets()', () => {
  function freshAuthTokens() {
    delete require.cache[authTokensPath]
    return require(authTokensPath)
  }

  it('throws when JWT_SECRET is missing', () => {
    const prev = process.env.JWT_SECRET
    delete process.env.JWT_SECRET
    try {
      const { validateSecrets } = freshAuthTokens()
      expect(() => validateSecrets()).toThrow(/JWT_SECRET.*not set/)
    } finally {
      process.env.JWT_SECRET = prev
    }
  })

  it('throws when JWT_SECRET is too short (<32 chars)', () => {
    const prev = process.env.JWT_SECRET
    process.env.JWT_SECRET = 'short'
    try {
      const { validateSecrets } = freshAuthTokens()
      expect(() => validateSecrets()).toThrow(/too short/)
    } finally {
      process.env.JWT_SECRET = prev
    }
  })

  it('passes with sufficiently long secret (>=32 chars)', () => {
    const prev = process.env.JWT_SECRET
    process.env.JWT_SECRET = 'a'.repeat(32)
    try {
      const { validateSecrets } = freshAuthTokens()
      expect(() => validateSecrets()).not.toThrow()
    } finally {
      process.env.JWT_SECRET = prev
    }
  })
})
