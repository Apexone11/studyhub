/**
 * ai.sheet.routes.test.js — Route-level tests for AI sheet endpoints.
 *
 * Covers:
 *   POST /api/ai/sheets/:id/analyze
 *   POST /api/ai/sheets/:id/propose-edit
 *   POST /api/ai/sheets/:id/apply-edit
 *
 * Pattern matches ai.routes.test.js + ai.suggestions.routes.test.js:
 *   - Module._load patching for prisma, ai.context, ai.spendCeiling,
 *     auth middleware, originAllowlist, rate limiters, sentry, and
 *     the Anthropic SDK constructor.
 *   - Toggleable auth (set authedUserId = null to simulate 401).
 *
 * Acceptance criteria pinned per task brief:
 *   - 401 when no auth
 *   - 400 when invalid id (non-integer, negative, zero)
 *   - 404 when sheet doesn't exist
 *   - 403 when viewer can't access (private sheet not owned)
 *   - 403 on apply-edit when viewer is not the owner (CLAUDE.md A6)
 *   - 200 happy path with mocked Anthropic response
 *   - 429 when spend ceiling reached (reserveSpend → ok:false)
 *   - 502 when AI returns unparseable JSON for analyze
 *   - apply-edit: TWO SheetCommit rows + sheet update
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
    studySheet: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    note: { findUnique: vi.fn() },
    sheetCommit: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
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

// ── Anthropic SDK mock ───────────────────────────────────────────────
const mockAnthropicInstance = {
  messages: {
    create: (...args) => mocks.messagesCreate(...args),
  },
}
function AnthropicClass() {
  return mockAnthropicInstance
}

// ── Toggleable auth ──────────────────────────────────────────────────
let authedUser = { userId: 1, username: 'tester', role: 'student' }
function fakeAuth(req, res, next) {
  if (!authedUser) {
    return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
  }
  req.user = { ...authedUser }
  next()
}

// ── Toggleable origin allowlist ──────────────────────────────────────
let originAllowed = true
function fakeOriginAllowlistFactory() {
  return function fakeOriginAllowlist(req, res, next) {
    if (!originAllowed) {
      return res.status(403).json({ error: 'Forbidden origin', code: 'FORBIDDEN' })
    }
    next()
  }
}
// Preserve helper exports the real module attaches.
fakeOriginAllowlistFactory.normalizeOrigin = (v) => v
fakeOriginAllowlistFactory.buildTrustedOrigins = () => new Set()

// ── No-op rate limiter ───────────────────────────────────────────────
function fakeRateLimiter(_req, _res, next) {
  next()
}
fakeRateLimiter.default = fakeRateLimiter

// ── Feature flag gate stub (attachments router uses this) ────────────
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
  // Default: spend ceiling allows requests through.
  mocks.spendCeiling.reserveSpend.mockResolvedValue({ ok: true, costEstCents: 0 })
  mocks.spendCeiling.refundSpendDelta.mockResolvedValue(undefined)
  mocks.spendCeiling.recordActualUsage.mockResolvedValue(undefined)
})

// ── Helpers ──────────────────────────────────────────────────────────

function publishedSheetOwnedBy(userId, overrides = {}) {
  return {
    id: 10,
    userId,
    status: 'published',
    title: 'Calc Cheat Sheet',
    description: 'Intro to derivatives',
    content: '# Derivatives\n\nThe derivative measures rate of change.',
    contentFormat: 'markdown',
    course: { code: 'MATH101', title: 'Calculus I' },
    ...overrides,
  }
}

function anthropicTextResponse(text) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

const VALID_ANALYZE_JSON = JSON.stringify({
  summary: 'Decent intro but missing the chain rule example.',
  issues: [
    {
      severity: 'medium',
      category: 'content',
      title: 'Missing chain rule',
      suggestion: 'Add a worked example.',
    },
  ],
  suggestions: [
    {
      title: 'Add diagrams',
      why: 'Visuals help with rate-of-change intuition.',
      example: '![graph](url)',
    },
  ],
})

// ──────────────────────────────────────────────────────────────────────
// POST /sheets/:sheetId/analyze
// ──────────────────────────────────────────────────────────────────────

describe('POST /sheets/:sheetId/analyze', () => {
  it('returns 401 when unauthenticated', async () => {
    authedUser = null
    const res = await request(app).post('/sheets/10/analyze').send({})
    expect(res.status).toBe(401)
    expect(mocks.prisma.studySheet.findUnique).not.toHaveBeenCalled()
  })

  it('returns 400 for non-integer id', async () => {
    const res = await request(app).post('/sheets/abc/analyze').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid/i)
  })

  it('returns 400 for negative id', async () => {
    const res = await request(app).post('/sheets/-5/analyze').send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for zero id', async () => {
    const res = await request(app).post('/sheets/0/analyze').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid/i)
  })

  it('returns 404 when the sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/sheets/9999/analyze').send({})
    expect(res.status).toBe(404)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 403 when viewer cannot access a private (draft) sheet they do not own', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      publishedSheetOwnedBy(999, { status: 'draft' }),
    )
    const res = await request(app).post('/sheets/10/analyze').send({})
    expect(res.status).toBe(403)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 429 when spend ceiling reached', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    mocks.spendCeiling.reserveSpend.mockResolvedValueOnce({
      ok: false,
      reason: 'ceiling_reached',
    })
    const res = await request(app).post('/sheets/10/analyze').send({})
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/ceiling/i)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 502 when AI returns unparseable JSON', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse('this is not json at all'))
    const res = await request(app).post('/sheets/10/analyze').send({})
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/unparseable/i)
  })

  it('returns 200 + shaped report on happy path', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse(VALID_ANALYZE_JSON))

    const res = await request(app).post('/sheets/10/analyze').send({})

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      summary: expect.stringContaining('chain rule'),
      issues: expect.arrayContaining([
        expect.objectContaining({
          severity: 'medium',
          category: 'content',
          title: 'Missing chain rule',
        }),
      ]),
      suggestions: expect.arrayContaining([expect.objectContaining({ title: 'Add diagrams' })]),
      model: expect.any(String),
    })
  })

  it('strips ```json fences before parsing', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(
      anthropicTextResponse('```json\n' + VALID_ANALYZE_JSON + '\n```'),
    )
    const res = await request(app).post('/sheets/10/analyze').send({})
    expect(res.status).toBe(200)
    expect(res.body.summary).toBeTruthy()
  })

  it('allows the owner to analyze their own draft sheet', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      publishedSheetOwnedBy(1, { status: 'draft' }),
    )
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse(VALID_ANALYZE_JSON))
    const res = await request(app).post('/sheets/10/analyze').send({})
    expect(res.status).toBe(200)
  })

  it('allows admin to analyze any sheet (draft included)', async () => {
    authedUser = { userId: 99, username: 'admin', role: 'admin' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      publishedSheetOwnedBy(1, { status: 'draft' }),
    )
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse(VALID_ANALYZE_JSON))
    const res = await request(app).post('/sheets/10/analyze').send({})
    expect(res.status).toBe(200)
  })

  it('clamps issues over the 30-row cap and unknown severities default to "low"', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    const tooManyIssues = Array.from({ length: 40 }, (_, i) => ({
      severity: i === 0 ? 'critical' : 'high',
      category: 'content',
      title: `Issue ${i}`,
      suggestion: 'Fix it.',
    }))
    mocks.messagesCreate.mockResolvedValueOnce(
      anthropicTextResponse(
        JSON.stringify({ summary: '...', issues: tooManyIssues, suggestions: [] }),
      ),
    )
    const res = await request(app).post('/sheets/10/analyze').send({})
    expect(res.status).toBe(200)
    expect(res.body.issues.length).toBeLessThanOrEqual(30)
    // First issue had 'critical' severity which is not in allowlist → 'low'.
    expect(res.body.issues[0].severity).toBe('low')
  })
})

// ──────────────────────────────────────────────────────────────────────
// POST /sheets/:sheetId/propose-edit
// ──────────────────────────────────────────────────────────────────────

describe('POST /sheets/:sheetId/propose-edit', () => {
  it('returns 401 when unauthenticated', async () => {
    authedUser = null
    const res = await request(app)
      .post('/sheets/10/propose-edit')
      .send({ instruction: 'Tighten the intro.' })
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-integer id', async () => {
    const res = await request(app)
      .post('/sheets/notanumber/propose-edit')
      .send({ instruction: 'Fix typos.' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for negative id', async () => {
    const res = await request(app)
      .post('/sheets/-1/propose-edit')
      .send({ instruction: 'Fix typos.' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for zero id', async () => {
    const res = await request(app)
      .post('/sheets/0/propose-edit')
      .send({ instruction: 'Fix typos.' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when instruction is missing', async () => {
    const res = await request(app).post('/sheets/10/propose-edit').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Instruction/i)
  })

  it('returns 400 when instruction is whitespace-only', async () => {
    const res = await request(app)
      .post('/sheets/10/propose-edit')
      .send({ instruction: '   \t\n  ' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app)
      .post('/sheets/9999/propose-edit')
      .send({ instruction: 'Fix typos.' })
    expect(res.status).toBe(404)
  })

  it('returns 403 when viewer cannot access (private sheet not owned)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      publishedSheetOwnedBy(999, { status: 'draft' }),
    )
    const res = await request(app)
      .post('/sheets/10/propose-edit')
      .send({ instruction: 'Fix typos.' })
    expect(res.status).toBe(403)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 429 when spend ceiling reached', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    mocks.spendCeiling.reserveSpend.mockResolvedValueOnce({
      ok: false,
      reason: 'ceiling_reached',
    })
    const res = await request(app)
      .post('/sheets/10/propose-edit')
      .send({ instruction: 'Tighten conclusion.' })
    expect(res.status).toBe(429)
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns 502 when AI returns an empty proposal', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse(''))
    const res = await request(app).post('/sheets/10/propose-edit').send({ instruction: 'Polish.' })
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/empty/i)
  })

  it('returns 200 + proposedContent on happy path', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    const newBody = '# Derivatives\n\nThe derivative measures instantaneous rate of change.'
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse(newBody))

    const res = await request(app)
      .post('/sheets/10/propose-edit')
      .send({ instruction: 'Tighten the intro.' })

    expect(res.status).toBe(200)
    expect(res.body.proposedContent).toBe(newBody)
    expect(res.body.diffSummary).toMatchObject({
      oldLength: expect.any(Number),
      newLength: newBody.length,
      delta: expect.any(Number),
    })
    expect(res.body.model).toBeTruthy()
  })

  it('strips wrapping code fences from the model output', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(
      anthropicTextResponse('```markdown\n# New content\n\nHi.\n```'),
    )
    const res = await request(app).post('/sheets/10/propose-edit').send({ instruction: 'Rewrite.' })
    expect(res.status).toBe(200)
    expect(res.body.proposedContent).not.toMatch(/^```/)
    expect(res.body.proposedContent).not.toMatch(/```$/)
  })

  it('truncates instructions over 2000 chars (does not 400, accepts clamped)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    mocks.messagesCreate.mockResolvedValueOnce(anthropicTextResponse('# trimmed'))
    const longInstruction = 'a'.repeat(5000)
    const res = await request(app)
      .post('/sheets/10/propose-edit')
      .send({ instruction: longInstruction })
    expect(res.status).toBe(200)
  })
})

// ──────────────────────────────────────────────────────────────────────
// POST /sheets/:sheetId/apply-edit
// ──────────────────────────────────────────────────────────────────────

describe('POST /sheets/:sheetId/apply-edit', () => {
  const validBody = {
    proposedContent: '# New content\n\nFresh, tightened intro.',
    snapshotName: 'Tighten intro',
    snapshotMessage: 'AI edit per user instruction.',
  }

  function mockApplyEditDb({ snapshotCommitId = 101, appliedCommitId = 102 } = {}) {
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce({ id: 50 })
    mocks.prisma.sheetCommit.create
      .mockResolvedValueOnce({
        id: snapshotCommitId,
        message: 'Before AI edit: Tighten intro',
        createdAt: new Date(),
        kind: 'ai_pre_apply',
        checksum: 'snap-checksum',
      })
      .mockResolvedValueOnce({
        id: appliedCommitId,
        message: 'Tighten intro',
        createdAt: new Date(),
        kind: 'ai_applied',
        checksum: 'applied-checksum',
      })
    mocks.prisma.studySheet.update.mockResolvedValueOnce({
      id: 10,
      content: validBody.proposedContent,
      contentFormat: 'markdown',
      updatedAt: new Date(),
    })
  }

  it('returns 401 when unauthenticated', async () => {
    authedUser = null
    const res = await request(app).post('/sheets/10/apply-edit').send(validBody)
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-integer id', async () => {
    const res = await request(app).post('/sheets/abc/apply-edit').send(validBody)
    expect(res.status).toBe(400)
  })

  it('returns 400 for negative id', async () => {
    const res = await request(app).post('/sheets/-1/apply-edit').send(validBody)
    expect(res.status).toBe(400)
  })

  it('returns 400 for zero id', async () => {
    const res = await request(app).post('/sheets/0/apply-edit').send(validBody)
    expect(res.status).toBe(400)
  })

  it('returns 400 when proposedContent is missing', async () => {
    const res = await request(app).post('/sheets/10/apply-edit').send({ snapshotName: 'Test' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/proposedContent/i)
  })

  it('returns 400 when proposedContent is empty/whitespace', async () => {
    const res = await request(app)
      .post('/sheets/10/apply-edit')
      .send({ proposedContent: '   ', snapshotName: 'Test' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when snapshotName is missing', async () => {
    const res = await request(app).post('/sheets/10/apply-edit').send({ proposedContent: '# new' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/snapshotName/i)
  })

  it('returns 400 when proposedContent exceeds 1M chars', async () => {
    const res = await request(app)
      .post('/sheets/10/apply-edit')
      .send({
        proposedContent: 'x'.repeat(1_000_001),
        snapshotName: 'Huge',
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/maximum size/i)
  })

  it('returns 404 when the sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/sheets/9999/apply-edit').send(validBody)
    expect(res.status).toBe(404)
    expect(mocks.prisma.sheetCommit.create).not.toHaveBeenCalled()
    expect(mocks.prisma.studySheet.update).not.toHaveBeenCalled()
  })

  it('returns 403 when viewer is NOT the owner (CLAUDE.md A6 defense in depth)', async () => {
    // Published, readable, but viewer userId=1 ≠ sheet.userId=999.
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(999))
    const res = await request(app).post('/sheets/10/apply-edit').send(validBody)
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/owner/i)
    expect(mocks.prisma.sheetCommit.create).not.toHaveBeenCalled()
    expect(mocks.prisma.studySheet.update).not.toHaveBeenCalled()
  })

  it('happy path: creates TWO SheetCommit rows (pre-apply + applied) AND updates the sheet', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    mockApplyEditDb()

    const res = await request(app).post('/sheets/10/apply-edit').send(validBody)

    expect(res.status).toBe(200)
    // 1. Exactly two sheetCommit.create calls — pre-apply snapshot + applied.
    expect(mocks.prisma.sheetCommit.create).toHaveBeenCalledTimes(2)
    const firstCall = mocks.prisma.sheetCommit.create.mock.calls[0][0]
    const secondCall = mocks.prisma.sheetCommit.create.mock.calls[1][0]
    expect(firstCall.data.kind).toBe('ai_pre_apply')
    expect(firstCall.data.content).toContain('# Derivatives') // OLD content
    expect(secondCall.data.kind).toBe('ai_applied')
    expect(secondCall.data.content).toBe(validBody.proposedContent) // NEW content
    // 2. Applied commit chains off the snapshot commit (parentId).
    expect(secondCall.data.parentId).toBe(101)
    // 3. Sheet content is patched to the new content.
    expect(mocks.prisma.studySheet.update).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.studySheet.update.mock.calls[0][0]).toMatchObject({
      where: { id: 10 },
      data: expect.objectContaining({ content: validBody.proposedContent }),
    })
    // 4. Response includes both commits.
    expect(res.body.snapshotCommit).toBeTruthy()
    expect(res.body.appliedCommit).toBeTruthy()
    expect(res.body.sheet.content).toBe(validBody.proposedContent)
  })

  it('admin can apply edits to any sheet (defense in depth still allows admin)', async () => {
    authedUser = { userId: 99, username: 'admin', role: 'admin' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    mockApplyEditDb()
    const res = await request(app).post('/sheets/10/apply-edit').send(validBody)
    expect(res.status).toBe(200)
    expect(mocks.prisma.sheetCommit.create).toHaveBeenCalledTimes(2)
  })

  it('handles "no prior commits" (parentId = null on the snapshot commit)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(publishedSheetOwnedBy(1))
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null) // no prior commit
    mocks.prisma.sheetCommit.create
      .mockResolvedValueOnce({
        id: 101,
        message: 'Before AI edit: Tighten intro',
        createdAt: new Date(),
        kind: 'ai_pre_apply',
        checksum: 'snap-checksum',
      })
      .mockResolvedValueOnce({
        id: 102,
        message: 'Tighten intro',
        createdAt: new Date(),
        kind: 'ai_applied',
        checksum: 'applied-checksum',
      })
    mocks.prisma.studySheet.update.mockResolvedValueOnce({
      id: 10,
      content: validBody.proposedContent,
      contentFormat: 'markdown',
      updatedAt: new Date(),
    })
    const res = await request(app).post('/sheets/10/apply-edit').send(validBody)
    expect(res.status).toBe(200)
    const firstCall = mocks.prisma.sheetCommit.create.mock.calls[0][0]
    expect(firstCall.data.parentId).toBeNull()
  })
})
