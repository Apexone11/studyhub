/**
 * ai.notes.routes.test.js — Route-level tests for AI note endpoints.
 *
 * Covers:
 *   POST /api/ai/notes/:id/summarize
 *   POST /api/ai/notes/:id/flashcards
 *   POST /api/ai/notes/:id/ask
 *
 * Same Module._load patching pattern as ai.sheet.routes.test.js.
 *
 * Acceptance criteria pinned per task brief:
 *   - 401 when no auth
 *   - 400 when invalid id (non-integer, negative, zero)
 *   - 404 when note doesn't exist
 *   - 403 when viewer can't access (private note not owned)
 *   - 200 happy path with mocked Anthropic response
 *   - 429 when spend ceiling reached
 *   - 502 when AI returns unparseable JSON (flashcards specifically)
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
  return function fakeOriginAllowlist(req, res, next) {
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
  authedUser = { userId: 1, username: 'tester', role: 'student' }
  originAllowed = true
  mocks.spendCeiling.reserveSpend.mockResolvedValue({ ok: true, costEstCents: 0 })
  mocks.spendCeiling.recordActualUsage.mockResolvedValue(undefined)
})

// ── Helpers ──────────────────────────────────────────────────────────

function publicNoteOwnedBy(userId, overrides = {}) {
  return {
    id: 20,
    userId,
    private: false,
    title: 'Photosynthesis primer',
    content: 'Photosynthesis converts light into chemical energy via chlorophyll.',
    course: { code: 'BIO101' },
    ...overrides,
  }
}

function privateNoteOwnedBy(userId, overrides = {}) {
  return publicNoteOwnedBy(userId, { private: true, ...overrides })
}

function anthropicTextResponse(text) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

const VALID_FLASHCARDS_JSON = JSON.stringify([
  { question: 'What does chlorophyll do?', answer: 'Absorbs light energy.', category: 'pigments' },
  {
    question: 'What are the inputs of photosynthesis?',
    answer: 'CO2, water, sunlight.',
    category: 'basics',
  },
])

// ──────────────────────────────────────────────────────────────────────
// POST /notes/:noteId/summarize
// ──────────────────────────────────────────────────────────────────────

describe('POST /notes/:noteId/summarize', () => {
  it('returns 401 when unauthenticated', async () => {
    authedUser = null
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(401)
    expect(mocks.prisma.note.findUnique).not.toHaveBeenCalled()
  })

  it('returns 400 for non-integer id', async () => {
    const res = await request(app).post('/notes/abc/summarize').send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for negative id', async () => {
    const res = await request(app).post('/notes/-1/summarize').send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for zero id', async () => {
    const res = await request(app).post('/notes/0/summarize').send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when the note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/notes/9999/summarize').send({})
    expect(res.status).toBe(404)
  })

  it('returns 403 when viewer cannot access a private note they do not own', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(privateNoteOwnedBy(999))
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(403)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 429 when spend ceiling reached', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    mocks.spendCeiling.reserveSpend.mockResolvedValueOnce({
      ok: false,
      reason: 'ceiling_reached',
    })
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/ceiling/i)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 200 + summary on happy path', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(
      anthropicTextResponse('Photosynthesis converts sunlight into chemical energy in plants.'),
    )
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(200)
    expect(res.body.summary).toMatch(/photosynthesis/i)
    expect(res.body.model).toBeTruthy()
  })

  it('owner can summarize their own private note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(privateNoteOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse('Summary text.'))
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(200)
  })

  it("admin can summarize anyone's private note", async () => {
    authedUser = { userId: 99, username: 'admin', role: 'admin' }
    mocks.prisma.note.findUnique.mockResolvedValueOnce(privateNoteOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse('Summary text.'))
    const res = await request(app).post('/notes/20/summarize').send({})
    expect(res.status).toBe(200)
  })

  it('accepts length parameter (short|medium|long)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse('Short summary.'))
    const res = await request(app).post('/notes/20/summarize').send({ length: 'short' })
    expect(res.status).toBe(200)
  })
})

// ──────────────────────────────────────────────────────────────────────
// POST /notes/:noteId/flashcards
// ──────────────────────────────────────────────────────────────────────

describe('POST /notes/:noteId/flashcards', () => {
  it('returns 401 when unauthenticated', async () => {
    authedUser = null
    const res = await request(app).post('/notes/20/flashcards').send({})
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-integer id', async () => {
    const res = await request(app).post('/notes/notvalid/flashcards').send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for negative id', async () => {
    const res = await request(app).post('/notes/-1/flashcards').send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for zero id', async () => {
    const res = await request(app).post('/notes/0/flashcards').send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when the note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/notes/9999/flashcards').send({})
    expect(res.status).toBe(404)
  })

  it('returns 403 when viewer cannot access a private note they do not own', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(privateNoteOwnedBy(999))
    const res = await request(app).post('/notes/20/flashcards').send({})
    expect(res.status).toBe(403)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 429 when spend ceiling reached', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    mocks.spendCeiling.reserveSpend.mockResolvedValueOnce({
      ok: false,
      reason: 'ceiling_reached',
    })
    const res = await request(app).post('/notes/20/flashcards').send({})
    expect(res.status).toBe(429)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 502 when AI returns non-JSON output', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse('this is not json'))
    const res = await request(app).post('/notes/20/flashcards').send({})
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/unparseable/i)
  })

  it('returns 502 when AI returns JSON object instead of array', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(
      anthropicTextResponse('{"question":"x","answer":"y"}'),
    )
    const res = await request(app).post('/notes/20/flashcards').send({})
    expect(res.status).toBe(502)
  })

  it('returns 200 + array of flashcards on happy path', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse(VALID_FLASHCARDS_JSON))
    const res = await request(app).post('/notes/20/flashcards').send({})
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.cards)).toBe(true)
    expect(res.body.cards.length).toBe(2)
    expect(res.body.cards[0]).toMatchObject({
      question: expect.stringContaining('chlorophyll'),
      answer: expect.any(String),
    })
  })

  it('strips ```json fences before parsing', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(
      anthropicTextResponse('```json\n' + VALID_FLASHCARDS_JSON + '\n```'),
    )
    const res = await request(app).post('/notes/20/flashcards').send({})
    expect(res.status).toBe(200)
    expect(res.body.cards.length).toBe(2)
  })

  it('clamps card count to the requested count (max 30, min 3)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    // AI returns 5 cards, request asks for 3.
    const fiveCards = JSON.stringify(
      Array.from({ length: 5 }, (_, i) => ({
        question: `q${i}`,
        answer: `a${i}`,
        category: 'cat',
      })),
    )
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse(fiveCards))
    const res = await request(app).post('/notes/20/flashcards').send({ count: 3 })
    expect(res.status).toBe(200)
    expect(res.body.cards.length).toBe(3)
  })
})

// ──────────────────────────────────────────────────────────────────────
// POST /notes/:noteId/ask
// ──────────────────────────────────────────────────────────────────────

describe('POST /notes/:noteId/ask', () => {
  const validBody = { question: 'What does chlorophyll do?' }

  it('returns 401 when unauthenticated', async () => {
    authedUser = null
    const res = await request(app).post('/notes/20/ask').send(validBody)
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-integer id', async () => {
    const res = await request(app).post('/notes/abc/ask').send(validBody)
    expect(res.status).toBe(400)
  })

  it('returns 400 for negative id', async () => {
    const res = await request(app).post('/notes/-1/ask').send(validBody)
    expect(res.status).toBe(400)
  })

  it('returns 400 for zero id', async () => {
    const res = await request(app).post('/notes/0/ask').send(validBody)
    expect(res.status).toBe(400)
  })

  it('returns 400 when question is missing', async () => {
    const res = await request(app).post('/notes/20/ask').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Question/i)
  })

  it('returns 400 when question is whitespace-only', async () => {
    const res = await request(app).post('/notes/20/ask').send({ question: '   \t  ' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/notes/9999/ask').send(validBody)
    expect(res.status).toBe(404)
  })

  it('returns 403 when viewer cannot access a private note they do not own', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(privateNoteOwnedBy(999))
    const res = await request(app).post('/notes/20/ask').send(validBody)
    expect(res.status).toBe(403)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 429 when spend ceiling reached', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    mocks.spendCeiling.reserveSpend.mockResolvedValueOnce({
      ok: false,
      reason: 'ceiling_reached',
    })
    const res = await request(app).post('/notes/20/ask').send(validBody)
    expect(res.status).toBe(429)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 200 + answer on happy path', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(
      anthropicTextResponse('Chlorophyll absorbs light energy and converts it for the plant.'),
    )
    const res = await request(app).post('/notes/20/ask').send(validBody)
    expect(res.status).toBe(200)
    expect(res.body.answer).toMatch(/chlorophyll/i)
    expect(res.body.model).toBeTruthy()
  })

  it('owner can ask about their own private note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(privateNoteOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse('A clear answer.'))
    const res = await request(app).post('/notes/20/ask').send(validBody)
    expect(res.status).toBe(200)
  })

  it('truncates questions over 1500 chars but does not 400', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(publicNoteOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse('Answer.'))
    const res = await request(app)
      .post('/notes/20/ask')
      .send({ question: 'why? '.repeat(500) })
    expect(res.status).toBe(200)
  })
})
