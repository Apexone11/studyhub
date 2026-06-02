/**
 * notes.ai.deep.test.js
 *
 * Permissions / edge-case coverage on top of ai.notes.routes.test.js.
 *
 * Surface: POST /api/ai/notes/:noteId/{summarize|flashcards|ask}
 *
 * Covers:
 *   - 403 when note is unreadable (private not owned).
 *   - 404 when note doesn’t exist.
 *   - Mute is one-directional: muter → muted block doesn’t affect AI.
 *   - Block by owner → still treated as no special-case (route trusts
 *     `note.private === false` for cross-user reads).
 *   - Long content gets clamped (verified via the Anthropic prompt body
 *     containing the truncation marker).
 *   - Empty content path returns a sane 200 with a small summary, not a
 *     hard crash. (The route does not short-circuit on empty content —
 *     it forwards "" to Anthropic; a 502 would only come back if the
 *     model returns an unparseable response.)
 *   - Spend ceiling → 429.
 *   - Anthropic timeout → 500.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const aiRoutePath = require.resolve('../src/modules/ai')

const mocks = vi.hoisted(() => {
  const messagesCreate = vi.fn()
  const prisma = {
    user: { findUnique: vi.fn() },
    studySheet: { findUnique: vi.fn(), update: vi.fn() },
    note: { findUnique: vi.fn() },
    sheetCommit: { findFirst: vi.fn(), create: vi.fn() },
    featureFlag: { findUnique: vi.fn() },
  }
  return {
    prisma,
    messagesCreate,
    spendCeiling: {
      reserveSpend: vi.fn(),
      refundSpendDelta: vi.fn(),
      recordActualUsage: vi.fn(),
    },
    aiContext: {
      buildContext: vi.fn(),
      redactPII: vi.fn((text) =>
        typeof text === 'string' ? text.replace(/\S+@\S+\.\S+/g, '[redacted-email]') : '',
      ),
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
    suggestionsService: {
      fetchOrGenerate: vi.fn(),
      refreshSuggestion: vi.fn(),
      dismissSuggestion: vi.fn(),
    },
    sentry: { captureError: vi.fn() },
  }
})

const mockAnthropicInstance = {
  messages: { create: (...args) => mocks.messagesCreate(...args) },
}
function AnthropicClass() {
  return mockAnthropicInstance
}

let authedUser = { userId: 1, username: 'tester', role: 'student' }
function fakeAuth(req, res, next) {
  if (!authedUser) {
    return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
  }
  req.user = { ...authedUser }
  next()
}

let originAllowed = true
function fakeOriginAllowlistFactory() {
  return function (req, res, next) {
    if (!originAllowed) {
      return res.status(403).json({ error: 'Forbidden origin', code: 'FORBIDDEN' })
    }
    next()
  }
}
fakeOriginAllowlistFactory.normalizeOrigin = (v) => v
fakeOriginAllowlistFactory.buildTrustedOrigins = () => new Set()

function fakeRateLimiter(_req, _res, next) {
  next()
}
fakeRateLimiter.default = fakeRateLimiter

function fakeRequireFeatureFlag() {
  return function (_req, _res, next) {
    next()
  }
}

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/modules/ai/ai.context'), mocks.aiContext],
  [require.resolve('../src/modules/ai/ai.spendCeiling'), mocks.spendCeiling],
  [require.resolve('../src/modules/ai/ai.service'), mocks.aiService],
  [require.resolve('../src/modules/ai/ai.suggestions.service'), mocks.suggestionsService],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/middleware/auth'), fakeAuth],
  [require.resolve('../src/middleware/originAllowlist'), fakeOriginAllowlistFactory],
  [
    require.resolve('../src/middleware/featureFlagGate'),
    { requireFeatureFlag: fakeRequireFeatureFlag },
  ],
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
      aiAttachmentUploadLimiter: fakeRateLimiter,
      aiAttachmentDeleteLimiter: fakeRateLimiter,
      aiAttachmentPinLimiter: fakeRateLimiter,
      aiAttachmentReadLimiter: fakeRateLimiter,
    },
  ],
  [require.resolve('express-rate-limit'), () => fakeRateLimiter],
  [require.resolve('@anthropic-ai/sdk'), { default: AnthropicClass, __esModule: true }],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests'
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    try {
      const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
      const mockedModule = mockTargets.get(resolvedRequest)
      if (mockedModule) return mockedModule
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }
  delete require.cache[aiRoutePath]
  const aiRouterModule = require('../src/modules/ai')
  const aiRouter = aiRouterModule.default || aiRouterModule
  app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use('/', aiRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[aiRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.note.findUnique.mockReset()
  mocks.messagesCreate.mockReset()
  authedUser = { userId: 1, username: 'tester', role: 'student' }
  originAllowed = true
  mocks.spendCeiling.reserveSpend.mockResolvedValue({ ok: true, costEstCents: 0 })
  mocks.spendCeiling.recordActualUsage.mockResolvedValue(undefined)
  mocks.spendCeiling.refundSpendDelta.mockResolvedValue(undefined)
})

// ── helpers ─────────────────────────────────────────────────────────

function publicNote(overrides = {}) {
  return {
    id: 20,
    userId: 1,
    private: false,
    title: 'Photosynthesis',
    content: 'Plants convert sunlight using chlorophyll.',
    course: { code: 'BIO101' },
    ...overrides,
  }
}

function privateNote(overrides = {}) {
  return publicNote({ private: true, ...overrides })
}

function anthropicText(text) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

// ──────────────────────────────────────────────────────────────────────
// Permissions edge cases
// ──────────────────────────────────────────────────────────────────────

describe('Permissions edge cases', () => {
  it('summarize: 403 on private note the viewer does not own', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(privateNote({ userId: 999 }))
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(403)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('flashcards: 404 when note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/notes/9999/flashcards').send({})
    expect(res.status).toBe(404)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('ask: 404 when note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/notes/9999/ask').send({ question: 'why?' })
    expect(res.status).toBe(404)
  })

  it('ask: mute is one-directional — muted viewer can still ask about a public note', async () => {
    // Mute is a frontend-only filter on inbound content (notifications,
    // feed). It does NOT restrict the muter from invoking AI on someone
    // else's public note. We assert the controller treats public access
    // purely on note.private, not on any social-relationship flag.
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNote({ userId: 999 }))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicText('Plants convert sunlight.'))
    const res = await request(app).post('/notes/20/ask').send({ question: 'how?' })
    expect(res.status).toBe(200)
  })

  it('ask: viewer blocked by owner of a PRIVATE note → 403 (private gate is what kicks in)', async () => {
    // The route does not consult the block table — only `private` +
    // ownership. A blocked viewer trying a public note still gets 200.
    // Trying a PRIVATE one gets 403.
    mocks.prisma.note.findUnique.mockResolvedValueOnce(privateNote({ userId: 999 }))
    const res = await request(app).post('/notes/20/ask').send({ question: 'how?' })
    expect(res.status).toBe(403)
  })

  it('admin can summarize anyone’s private note', async () => {
    authedUser = { userId: 99, username: 'admin', role: 'admin' }
    mocks.prisma.note.findUnique.mockResolvedValueOnce(privateNote({ userId: 1 }))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicText('Summary.'))
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(200)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Content edge cases
// ──────────────────────────────────────────────────────────────────────

describe('Content edge cases', () => {
  it('long content is clamped (12000 char cap + truncation marker)', async () => {
    const longContent = 'X'.repeat(20000)
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNote({ content: longContent }))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicText('Summary.'))
    await request(app).post('/notes/20/summarize').send({})
    // Anthropic should have been called with a message body that
    // contains the truncated marker rather than the full 20k.
    const call = mocks.messagesCreate.mock.calls[0][0]
    const userContent = call.messages[0].content
    expect(userContent).toContain('[...truncated]')
    expect(userContent.length).toBeLessThan(20000 + 500) // headroom for prompt scaffolding
  })

  it('empty content: summarize still returns 200 with empty-ish summary', async () => {
    // The current implementation forwards "" to Anthropic. Tests assert
    // it does NOT crash with 500. A future hardening might add an empty
    // short-circuit — when that lands, this test becomes the regression
    // anchor.
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNote({ content: '' }))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicText(''))
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('summary')
  })
})

// ──────────────────────────────────────────────────────────────────────
// Spend ceiling + upstream failures
// ──────────────────────────────────────────────────────────────────────

describe('Spend ceiling and upstream failures', () => {
  it('summarize: 429 when spend ceiling reached', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNote())
    mocks.spendCeiling.reserveSpend.mockResolvedValueOnce({
      ok: false,
      reason: 'ceiling_reached',
    })
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/ceiling/i)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('flashcards: 429 when spend ceiling reached', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNote())
    mocks.spendCeiling.reserveSpend.mockResolvedValueOnce({
      ok: false,
      reason: 'ceiling_reached',
    })
    const res = await request(app).post('/notes/20/flashcards').send({})
    expect(res.status).toBe(429)
  })

  it('ask: 429 when spend ceiling reached', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNote())
    mocks.spendCeiling.reserveSpend.mockResolvedValueOnce({
      ok: false,
      reason: 'ceiling_reached',
    })
    const res = await request(app).post('/notes/20/ask').send({ question: 'why?' })
    expect(res.status).toBe(429)
  })

  it('Anthropic timeout / network error → 500', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNote())
    mocks.messagesCreate.mockRejectedValueOnce(
      Object.assign(new Error('ETIMEDOUT: upstream timeout'), { code: 'ETIMEDOUT' }),
    )
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/summarize/i)
  })

  it('Anthropic error refunds the spend reservation', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNote())
    mocks.spendCeiling.reserveSpend.mockResolvedValueOnce({ ok: true, costEstCents: 25 })
    mocks.messagesCreate.mockRejectedValueOnce(new Error('boom'))
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(500)
    expect(mocks.spendCeiling.refundSpendDelta).toHaveBeenCalledWith(
      expect.objectContaining({ estCents: 25, actualCents: 0 }),
    )
  })
})
