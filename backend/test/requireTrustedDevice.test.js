/**
 * requireTrustedDevice — middleware unit tests.
 *
 * The middleware is a security gate: it MUST fail closed on any
 * unexpected condition (DB error, missing trustedAt, no auth) and only
 * pass through on a clean, verified TrustedDevice match. The two paths
 * that are easy to regress and have historically caused real incidents
 * are:
 *
 *   - Pre-migration session fall-through (no JTI -> next()). If this
 *     accidentally returns 403 instead, every legacy session breaks
 *     until the user re-logs in.
 *   - DB error fail-closed (catch block -> 503 + REAUTH_REQUIRED).
 *     Failing OPEN here would silently bypass the step-up requirement
 *     for every gated endpoint during a transient prisma blip.
 *
 * Both paths plus the 401/403/200 flows are pinned here.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const middlewarePath = require.resolve('../src/middleware/requireTrustedDevice')

const mocks = vi.hoisted(() => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
    },
  },
  sentry: {
    captureError: vi.fn(),
  },
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
])

const originalModuleLoad = Module._load
let requireTrustedDevice

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      const mocked = mockTargets.get(resolved)
      if (mocked) return mocked
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }
  delete require.cache[middlewarePath]
  requireTrustedDevice = require(middlewarePath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[middlewarePath]
})

beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * Helper: build a tiny express app with optional req.user/req.sessionJti
 * shimmed in BEFORE the middleware. The shim mirrors what `auth.js`
 * normally populates after JWT verification.
 */
function buildApp({ user = null, sessionJti = null } = {}) {
  const app = express()
  app.use((req, _res, next) => {
    if (user) req.user = user
    if (sessionJti) req.sessionJti = sessionJti
    next()
  })
  app.use(requireTrustedDevice)
  app.get('/gated', (_req, res) => res.status(200).json({ ok: true }))
  return app
}

describe('requireTrustedDevice', () => {
  it('returns 401 + UNAUTHORIZED when no req.user is present', async () => {
    const app = buildApp({ user: null, sessionJti: null })

    const res = await request(app).get('/gated')

    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(mocks.prisma.session.findUnique).not.toHaveBeenCalled()
  })

  it('passes through (next) when the session has no JTI (pre-migration cookies)', async () => {
    // Critical regression guard: legacy users who logged in BEFORE the
    // TrustedDevice rollout have JWTs without a `jti` claim. If this
    // path ever 403s, every one of those users is locked out of every
    // gated endpoint until they re-log in.
    const app = buildApp({
      user: { userId: 7, role: 'student' },
      sessionJti: null,
    })

    const res = await request(app).get('/gated')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(mocks.prisma.session.findUnique).not.toHaveBeenCalled()
  })

  it('returns 403 + REAUTH_REQUIRED when the device row exists but trustedAt is null', async () => {
    mocks.prisma.session.findUnique.mockResolvedValueOnce({
      jti: 'sess-1',
      trustedDevice: { id: 99, trustedAt: null },
    })
    const app = buildApp({
      user: { userId: 7, role: 'student' },
      sessionJti: 'sess-1',
    })

    const res = await request(app).get('/gated')

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'REAUTH_REQUIRED' })
    expect(mocks.prisma.session.findUnique).toHaveBeenCalledWith({
      where: { jti: 'sess-1' },
      include: { trustedDevice: true },
    })
  })

  it('returns 403 + REAUTH_REQUIRED when the session has no linked TrustedDevice at all', async () => {
    mocks.prisma.session.findUnique.mockResolvedValueOnce({
      jti: 'sess-2',
      trustedDevice: null,
    })
    const app = buildApp({
      user: { userId: 7 },
      sessionJti: 'sess-2',
    })

    const res = await request(app).get('/gated')

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'REAUTH_REQUIRED' })
  })

  it('returns 403 + REAUTH_REQUIRED when no Session row matches the JTI', async () => {
    mocks.prisma.session.findUnique.mockResolvedValueOnce(null)
    const app = buildApp({
      user: { userId: 7 },
      sessionJti: 'orphaned-jti',
    })

    const res = await request(app).get('/gated')

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'REAUTH_REQUIRED' })
  })

  it('passes through when trustedAt is set on the linked device', async () => {
    mocks.prisma.session.findUnique.mockResolvedValueOnce({
      jti: 'sess-3',
      trustedDevice: { id: 99, trustedAt: new Date('2026-04-01T00:00:00Z') },
    })
    const app = buildApp({
      user: { userId: 7 },
      sessionJti: 'sess-3',
    })

    const res = await request(app).get('/gated')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('fails CLOSED with 503 + REAUTH_REQUIRED on a Prisma error', async () => {
    // The single most important assertion in this file: a transient DB
    // error MUST NOT bypass the gate. If the catch block ever returns
    // next() instead of 503, every gated endpoint becomes silently
    // unauthenticated during a DB blip.
    mocks.prisma.session.findUnique.mockRejectedValueOnce(new Error('connection refused'))
    const app = buildApp({
      user: { userId: 7 },
      sessionJti: 'sess-4',
    })

    const res = await request(app).get('/gated')

    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ code: 'REAUTH_REQUIRED' })
    // Sentry must see the failure so on-call gets paged for sustained DB outages
    // — the user-visible 503 alone isn't an alerting surface.
    expect(mocks.sentry.captureError).toHaveBeenCalledTimes(1)
  })
})
