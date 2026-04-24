/**
 * ai.suggestions.routes.test.js — Phase 3 endpoint coverage.
 *
 * Mocks ai.suggestions.service + the rate limiters / auth so the
 * routes themselves are exercised without touching Anthropic or the
 * DB. Pattern matches ai.routes.test.js. Required-before-build
 * security checklist items pinned here:
 *
 *   - 401 on every endpoint without auth.
 *   - 403 on POST writes from a disallowed origin (CSRF).
 *   - 404 on dismiss for a suggestion not owned by the caller (IDOR).
 *   - GET happy / GET null / GET quota-exhausted shapes.
 *   - POST /refresh: happy + quota-exhausted.
 *   - 400 on dismiss with a non-numeric id.
 *
 * PII redaction is exercised in ai.context.test.js (redactPII unit
 * tests) — the service code calls it directly so coverage there pins
 * the I/O boundary contract.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const aiRoutePath = require.resolve('../src/modules/ai')

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
  suggestionsService: {
    fetchOrGenerate: vi.fn(),
    refreshSuggestion: vi.fn(),
    dismissSuggestion: vi.fn(),
  },
  aiService: {
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    renameConversation: vi.fn(),
    streamMessage: vi.fn(),
    getUsageStats: vi.fn(),
    getUsageQuota: vi.fn(),
    getDailyLimit: vi.fn(),
    getOrCreateUsage: vi.fn(),
  },
  sentry: { captureError: vi.fn() },
}))

// Toggleable auth: set authedUserId = null to simulate unauthenticated.
let authedUserId = 1
function fakeAuth(req, res, next) {
  if (authedUserId == null) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  req.user = { userId: authedUserId, username: 'tester', role: 'student' }
  next()
}

// Toggleable origin allowlist: set originAllowed = false to simulate
// a CSRF-blocked origin.
let originAllowed = true
function fakeOriginAllowlistFactory() {
  return function fakeOriginAllowlist(req, res, next) {
    if (!originAllowed) {
      return res.status(403).json({ error: 'Forbidden origin' })
    }
    next()
  }
}

function fakeRateLimiter(_req, _res, next) {
  next()
}
fakeRateLimiter.default = fakeRateLimiter

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/modules/ai/ai.suggestions.service'), mocks.suggestionsService],
  [require.resolve('../src/modules/ai/ai.service'), mocks.aiService],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/middleware/auth'), fakeAuth],
  [require.resolve('../src/middleware/originAllowlist'), fakeOriginAllowlistFactory],
  [
    require.resolve('../src/lib/rateLimiters'),
    {
      readLimiter: fakeRateLimiter,
      authLimiter: fakeRateLimiter,
      writeLimiter: fakeRateLimiter,
      createAiMessageLimiter: () => fakeRateLimiter,
      aiSuggestionsReadLimiter: fakeRateLimiter,
      aiSuggestionsRefreshLimiter: fakeRateLimiter,
      aiSuggestionsDismissLimiter: fakeRateLimiter,
    },
  ],
  [require.resolve('express-rate-limit'), () => fakeRateLimiter],
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
  delete require.cache[aiRoutePath]
  const aiRouterModule = require('../src/modules/ai')
  const aiRouter = aiRouterModule.default || aiRouterModule
  app = express()
  app.use(express.json())
  app.use('/', aiRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
})

beforeEach(() => {
  vi.clearAllMocks()
  authedUserId = 1
  originAllowed = true
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: 1,
    role: 'student',
    emailVerified: true,
    isStaffVerified: false,
  })
})

describe('GET /suggestions', () => {
  it('returns the current suggestion when the service has one fresh', async () => {
    mocks.suggestionsService.fetchOrGenerate.mockResolvedValueOnce({
      suggestion: {
        id: 7,
        text: 'Review chapter 3 of Organic Chemistry.',
        ctaLabel: 'Open in Hub AI',
        ctaAction: 'open_chat',
        generatedAt: new Date('2026-04-24T10:00:00Z'),
      },
      quotaExhausted: false,
    })

    const res = await request(app).get('/suggestions')
    expect(res.status).toBe(200)
    expect(res.body.suggestion).toMatchObject({
      id: 7,
      text: 'Review chapter 3 of Organic Chemistry.',
      ctaLabel: 'Open in Hub AI',
      ctaAction: 'open_chat',
    })
    expect(res.body.quotaExhausted).toBe(false)
  })

  it('returns suggestion: null when the service has nothing to show', async () => {
    mocks.suggestionsService.fetchOrGenerate.mockResolvedValueOnce({
      suggestion: null,
      quotaExhausted: false,
    })
    const res = await request(app).get('/suggestions')
    expect(res.status).toBe(200)
    expect(res.body.suggestion).toBeNull()
    expect(res.body.quotaExhausted).toBe(false)
  })

  it('returns quotaExhausted: true when the user has burned their daily AI budget', async () => {
    mocks.suggestionsService.fetchOrGenerate.mockResolvedValueOnce({
      suggestion: null,
      quotaExhausted: true,
    })
    const res = await request(app).get('/suggestions')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ suggestion: null, quotaExhausted: true })
  })

  it('returns 401 when unauthenticated', async () => {
    authedUserId = null
    const res = await request(app).get('/suggestions')
    expect(res.status).toBe(401)
    expect(mocks.suggestionsService.fetchOrGenerate).not.toHaveBeenCalled()
  })

  it('returns 500 + structured error on service failure', async () => {
    mocks.suggestionsService.fetchOrGenerate.mockRejectedValueOnce(new Error('anthropic 500'))
    const res = await request(app).get('/suggestions')
    expect(res.status).toBe(500)
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })

  it('does not leak fields beyond the public client shape', async () => {
    // Service returns a full Prisma row including dismissedAt + userId;
    // route MUST strip those before sending to the client.
    mocks.suggestionsService.fetchOrGenerate.mockResolvedValueOnce({
      suggestion: {
        id: 9,
        userId: 1,
        text: 'Refresh your spaced-repetition queue.',
        ctaLabel: 'Open',
        ctaAction: 'open_chat',
        generatedAt: new Date(),
        dismissedAt: null,
      },
      quotaExhausted: false,
    })
    const res = await request(app).get('/suggestions')
    expect(res.status).toBe(200)
    expect(res.body.suggestion).not.toHaveProperty('userId')
    expect(res.body.suggestion).not.toHaveProperty('dismissedAt')
  })
})

describe('POST /suggestions/refresh', () => {
  it('regenerates and returns the new suggestion on a trusted origin', async () => {
    mocks.suggestionsService.refreshSuggestion.mockResolvedValueOnce({
      suggestion: {
        id: 11,
        text: 'Quick recap of derivatives.',
        ctaLabel: 'Open in Hub AI',
        ctaAction: 'open_chat',
        generatedAt: new Date(),
      },
      quotaExhausted: false,
    })
    const res = await request(app).post('/suggestions/refresh')
    expect(res.status).toBe(200)
    expect(res.body.suggestion.id).toBe(11)
    expect(mocks.suggestionsService.refreshSuggestion).toHaveBeenCalledTimes(1)
  })

  it('returns quotaExhausted: true when the user is at their daily cap', async () => {
    mocks.suggestionsService.refreshSuggestion.mockResolvedValueOnce({
      suggestion: null,
      quotaExhausted: true,
    })
    const res = await request(app).post('/suggestions/refresh')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ suggestion: null, quotaExhausted: true })
  })

  it('returns 403 when the request origin is not on the allowlist (CSRF guard)', async () => {
    originAllowed = false
    const res = await request(app).post('/suggestions/refresh')
    expect(res.status).toBe(403)
    expect(mocks.suggestionsService.refreshSuggestion).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    authedUserId = null
    const res = await request(app).post('/suggestions/refresh')
    expect(res.status).toBe(401)
  })
})

describe('POST /suggestions/:id/dismiss', () => {
  it('marks the suggestion dismissed and returns ok: true', async () => {
    mocks.suggestionsService.dismissSuggestion.mockResolvedValueOnce(true)
    const res = await request(app).post('/suggestions/42/dismiss')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(mocks.suggestionsService.dismissSuggestion).toHaveBeenCalledWith(1, 42)
  })

  it('returns 404 when the suggestion is not owned by the caller (IDOR guard)', async () => {
    // Service returns false when updateMany matched zero rows — that
    // covers both "id does not exist" and "id exists but belongs to a
    // different userId". 404 (not 403) so we don't help an attacker
    // distinguish between the two and probe id existence.
    mocks.suggestionsService.dismissSuggestion.mockResolvedValueOnce(false)
    const res = await request(app).post('/suggestions/9999/dismiss')
    expect(res.status).toBe(404)
  })

  it('returns 400 on a non-numeric id', async () => {
    const res = await request(app).post('/suggestions/abc/dismiss')
    expect(res.status).toBe(400)
    expect(mocks.suggestionsService.dismissSuggestion).not.toHaveBeenCalled()
  })

  it('returns 403 when the request origin is not on the allowlist (CSRF guard)', async () => {
    originAllowed = false
    const res = await request(app).post('/suggestions/42/dismiss')
    expect(res.status).toBe(403)
    expect(mocks.suggestionsService.dismissSuggestion).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    authedUserId = null
    const res = await request(app).post('/suggestions/42/dismiss')
    expect(res.status).toBe(401)
  })
})
