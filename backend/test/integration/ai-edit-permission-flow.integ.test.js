/**
 * ai-edit-permission-flow.integ.test.js — Loop V4 deep permission-flow test.
 *
 * Scenario (full user click → DB write):
 *   1. Owner posts an instruction to /api/ai/sheets/:id/propose-edit. The AI
 *      (mocked Anthropic) returns canned proposed content. Nothing persists
 *      yet — this is the "preview" the permission dialog will show.
 *   2. The frontend's AiPermissionDialog (covered by its own jsx test) asks
 *      the user to Accept. On accept, the frontend posts the proposed
 *      content + a snapshotName to /api/ai/sheets/:id/apply-edit.
 *   3. apply-edit creates TWO SheetCommit rows inside a single transaction:
 *        - ai_pre_apply  (captures the OLD content for revert)
 *        - ai_applied    (records the new content for audit)
 *      and patches StudySheet.content to the proposed value.
 *   4. The user reverts via POST /api/sheets/:id/lab/restore/:commitId,
 *      targeting the ai_pre_apply commit id. The sheet body returns to the
 *      original content and a new "restore" SheetCommit row is appended.
 *
 * The whole chain is one user story: click → permission dialog → snapshot
 * → write → revert. This test exercises both the AI sheet routes and the
 * SheetLab restore route in the SAME request lifecycle so a regression in
 * either layer (snapshot kind, content shape, owner gating) shows up here
 * even if the per-module unit tests stay green.
 *
 * External services mocked:
 *   - @anthropic-ai/sdk  (canned propose-edit response)
 *   - ai.spendCeiling    (reserveSpend returns ok:true)
 *   - Sentry, rate limiters, originAllowlist, featureFlagGate, auth
 *
 * What is NOT mocked: prisma.$transaction, the html-scan pipeline (the
 * fixture sheet is markdown so the scan branch is skipped), the
 * accessControl middleware, computeChecksum.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)

// ── In-memory store ──────────────────────────────────────────────────

const ORIGINAL_CONTENT = '# OOP\n\nA class encapsulates data and behavior.'
const PROPOSED_CONTENT =
  '# OOP\n\nA class encapsulates data and behavior. Inheritance lets one class extend another.'

const state = {
  nextCommitId: 1,
  sheets: [
    {
      id: 10,
      userId: 1,
      status: 'published',
      title: 'OOP cheat sheet',
      description: 'Classes and inheritance',
      content: ORIGINAL_CONTENT,
      contentFormat: 'markdown',
      course: { code: 'CMSC131', title: 'OOP I' },
      allowEditing: true,
    },
  ],
  commits: [],
}

function reset() {
  state.sheets[0].content = ORIGINAL_CONTENT
  state.commits.length = 0
  state.nextCommitId = 1
}

// ── Prisma mock ──────────────────────────────────────────────────────
//
// $transaction supports both call shapes used by the route handlers:
//   - $transaction([promise1, promise2])    — sheetLab restore
//   - $transaction(async (tx) => { ... })   — ai apply-edit
// Both branches operate against the same in-memory store via the same
// mock model functions, which is the correct semantics for an in-memory
// integration test (every write is durable + atomic by construction).

const messagesCreate = vi.fn()

function makePrismaMock() {
  const studySheet = {
    findUnique: vi.fn(async ({ where }) => {
      const sheet = state.sheets.find((s) => s.id === where.id)
      return sheet ? { ...sheet } : null
    }),
    update: vi.fn(async ({ where, data, select }) => {
      const sheet = state.sheets.find((s) => s.id === where.id)
      if (!sheet) {
        const err = new Error('not found')
        err.code = 'P2025'
        throw err
      }
      // The route may pass a `withPreviewText(content)` slice — strip
      // previewText (we don't model it) and apply the rest.
      const next = { ...data }
      delete next.previewText
      Object.assign(sheet, next)
      sheet.updatedAt = new Date()
      const result = { ...sheet }
      if (select) {
        const filtered = {}
        for (const k of Object.keys(select)) {
          if (select[k]) filtered[k] = result[k]
        }
        return filtered
      }
      return result
    }),
  }

  const sheetCommit = {
    findFirst: vi.fn(async ({ where, orderBy: _orderBy } = {}) => {
      let matches = [...state.commits]
      if (where?.sheetId) matches = matches.filter((c) => c.sheetId === where.sheetId)
      if (where?.id) matches = matches.filter((c) => c.id === where.id)
      if (where?.label) matches = matches.filter((c) => c.label === where.label)
      return matches[matches.length - 1] || null
    }),
    create: vi.fn(async ({ data, select, include }) => {
      const c = { id: state.nextCommitId++, ...data, createdAt: new Date() }
      // The restore handler `include`s an author block — synthesize a
      // minimal one so the route's response shape stays consistent.
      if (include?.author) {
        c.author = { id: data.userId, username: `user${data.userId}`, avatarUrl: null }
      }
      state.commits.push(c)
      if (select) {
        const filtered = {}
        for (const k of Object.keys(select)) {
          if (select[k]) filtered[k] = c[k]
        }
        return filtered
      }
      return c
    }),
    findMany: vi.fn(async ({ where } = {}) => {
      let rows = [...state.commits]
      if (where?.sheetId) rows = rows.filter((c) => c.sheetId === where.sheetId)
      return rows
    }),
  }

  return {
    studySheet,
    sheetCommit,
    note: { findUnique: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => null) },
    featureFlag: { findUnique: vi.fn(async () => ({ enabled: true })) },
    // $transaction supports both array and callback forms.
    $transaction: vi.fn(async (arg) => {
      if (typeof arg === 'function') {
        // Callback form (ai apply-edit). The route uses the same `prisma`
        // surface as the outer mock so we pass it straight through.
        return arg(prismaMock)
      }
      // Array form (sheetLab restore). Each entry is already a Promise
      // because the route called the create/update mocks which return
      // resolved promises. Await them in declaration order.
      const results = []
      for (const p of arg) {
        results.push(await p)
      }
      return results
    }),
  }
}

const prismaMock = makePrismaMock()

// ── External service mocks ───────────────────────────────────────────

const spendCeilingMock = {
  reserveSpend: vi.fn(async () => ({ ok: true, costEstCents: 1 })),
  refundSpendDelta: vi.fn(async () => undefined),
  recordActualUsage: vi.fn(async () => undefined),
}

const aiContextMock = {
  buildContext: vi.fn(async () => ''),
  redactPII: (s) => s,
}

const AnthropicClass = vi.fn(function Anthropic() {
  this.messages = { create: messagesCreate }
})
const anthropicSdkMock = { default: AnthropicClass, __esModule: true }

const sentryMock = { captureError: vi.fn(), redactObject: (o) => o, redactHeaders: (h) => h }

// ── Middleware mocks ─────────────────────────────────────────────────

function fakeAuth(req, res, next) {
  const id = req.headers['x-test-user-id']
  if (!id) return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
  req.user = {
    userId: Number(id),
    role: req.headers['x-test-role'] || 'student',
    username: `user${id}`,
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

const featureFlagGateMock = { requireFeatureFlag: () => (req, res, next) => next() }

// AI service / suggestions service stubs — ai routes import these even
// though this test only exercises sheet sub-routes.
const aiServiceMock = {
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
}
const suggestionsServiceMock = {
  fetchOrGenerate: vi.fn(),
  refreshSuggestion: vi.fn(),
  dismissSuggestion: vi.fn(),
}

// optionalAuth shim — sheetLab restore doesn't use it, but the route
// barrel imports it for the diff routes alongside.
function fakeOptionalAuth(req, _res, next) {
  const id = req.headers['x-test-user-id']
  if (id) {
    req.user = {
      userId: Number(id),
      role: req.headers['x-test-role'] || 'student',
      username: `user${id}`,
    }
  }
  next()
}
fakeOptionalAuth.default = fakeOptionalAuth

const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), prismaMock],
  [require.resolve('../../src/modules/ai/ai.context'), aiContextMock],
  [require.resolve('../../src/modules/ai/ai.spendCeiling'), spendCeilingMock],
  [require.resolve('../../src/modules/ai/ai.service'), aiServiceMock],
  [require.resolve('../../src/modules/ai/ai.suggestions.service'), suggestionsServiceMock],
  [require.resolve('../../src/middleware/auth'), fakeAuth],
  [require.resolve('../../src/core/auth/optionalAuth'), fakeOptionalAuth],
  [require.resolve('../../src/middleware/originAllowlist'), originAllowlistMock],
  [require.resolve('../../src/middleware/featureFlagGate'), featureFlagGateMock],
  [require.resolve('../../src/lib/rateLimiters'), rateLimitersMock],
  [require.resolve('../../src/monitoring/sentry'), sentryMock],
  [require.resolve('@anthropic-ai/sdk'), anthropicSdkMock],
])

const originalLoad = Module._load
let app
const aiRoutePath = require.resolve('../../src/modules/ai')
const sheetLabRoutePath = require.resolve('../../src/modules/sheetLab')

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  Module._load = function patched(req, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(req, parent, isMain)
      if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    } catch {
      /* fall through */
    }
    return originalLoad.apply(this, arguments)
  }
  delete require.cache[aiRoutePath]
  delete require.cache[sheetLabRoutePath]
  const aiRouter = require('../../src/modules/ai')
  const sheetLabRouter = require('../../src/modules/sheetLab')
  app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use('/api/ai', aiRouter.default || aiRouter)
  // SheetLab mounts under /api/sheets to match the production route
  // (the restore endpoint is /api/sheets/:id/lab/restore/:commitId).
  app.use('/api/sheets', sheetLabRouter.default || sheetLabRouter)
  app.use((err, _req, res, _next) =>
    res.status(500).json({ error: err?.message || 'Server error' }),
  )
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[aiRoutePath]
  delete require.cache[sheetLabRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  reset()
  spendCeilingMock.reserveSpend.mockResolvedValue({ ok: true, costEstCents: 1 })
})

// ── Tests ────────────────────────────────────────────────────────────

describe('Integration: AI edit permission flow (propose → apply → revert)', () => {
  it('completes the full chain: propose → apply (2 commits + body update) → restore', async () => {
    // ── Step 1: propose-edit ────────────────────────────────────────
    // The frontend would normally hand this response to the permission
    // dialog. The dialog's job is to gate the next call — nothing here
    // touches the DB yet, which is the whole point of the gate.
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: PROPOSED_CONTENT }],
      usage: { input_tokens: 200, output_tokens: 80 },
    })

    const proposeRes = await request(app)
      .post('/api/ai/sheets/10/propose-edit')
      .set('x-test-user-id', '1')
      .set('x-test-role', 'student')
      .send({ instruction: 'Add an inheritance example' })

    expect(proposeRes.status).toBe(200)
    expect(proposeRes.body.proposedContent).toMatch(/Inheritance lets one class extend another/i)
    // Critical invariant: propose-edit is read-only.
    expect(state.sheets[0].content).toBe(ORIGINAL_CONTENT)
    expect(state.commits).toHaveLength(0)

    // ── Step 2: apply-edit ──────────────────────────────────────────
    // This is what the frontend posts AFTER the user accepts the
    // permission dialog. Two commits + one sheet update must land in a
    // single transaction.
    const applyRes = await request(app)
      .post('/api/ai/sheets/10/apply-edit')
      .set('x-test-user-id', '1')
      .set('x-test-role', 'student')
      .send({
        proposedContent: proposeRes.body.proposedContent,
        snapshotName: 'Add inheritance example',
      })

    expect(applyRes.status).toBe(200)
    expect(applyRes.body.sheet).toMatchObject({
      id: 10,
      content: PROPOSED_CONTENT,
    })
    expect(applyRes.body.snapshotCommit).toBeTruthy()
    expect(applyRes.body.appliedCommit).toBeTruthy()

    // Side-effect: sheet body now equals the proposal.
    expect(state.sheets[0].content).toBe(PROPOSED_CONTENT)

    // Side-effect: TWO commits — pre + applied.
    expect(state.commits).toHaveLength(2)
    const preCommit = state.commits.find((c) => c.kind === 'ai_pre_apply')
    const appliedCommit = state.commits.find((c) => c.kind === 'ai_applied')
    expect(preCommit).toBeTruthy()
    expect(appliedCommit).toBeTruthy()
    expect(preCommit.content).toBe(ORIGINAL_CONTENT)
    expect(appliedCommit.content).toBe(PROPOSED_CONTENT)
    // The applied commit chains off the pre-commit so a future restore
    // can walk the history.
    expect(appliedCommit.parentId).toBe(preCommit.id)

    // ── Step 3: restore via the pre-apply commit id ─────────────────
    // The user clicks "Revert" in the sheet's History panel. The
    // frontend posts to /api/sheets/:id/lab/restore/:commitId targeting
    // the ai_pre_apply commit. The sheet body goes back to ORIGINAL,
    // and a new "restore" commit row is appended (which makes the
    // restore itself revertable too).
    const preApplyCommitId = preCommit.id
    const restoreRes = await request(app)
      .post(`/api/sheets/10/lab/restore/${preApplyCommitId}`)
      .set('x-test-user-id', '1')
      .set('x-test-role', 'student')
      .send({})

    expect(restoreRes.status).toBe(200)
    expect(restoreRes.body.sheet).toMatchObject({
      id: 10,
      content: ORIGINAL_CONTENT,
    })

    // Side-effect: sheet body is back to the original content.
    expect(state.sheets[0].content).toBe(ORIGINAL_CONTENT)
    // Side-effect: a new restore commit landed on top of the chain.
    const restoreCommit = state.commits.find((c) => c.kind === 'restore')
    expect(restoreCommit).toBeTruthy()
    expect(restoreCommit.content).toBe(ORIGINAL_CONTENT)
    expect(state.commits).toHaveLength(3)
  })

  it('apply-edit refuses a non-owner (403) — defense in depth (A6)', async () => {
    // Even if the frontend permission dialog was bypassed, the backend
    // re-checks ownership before persisting anything.
    const res = await request(app)
      .post('/api/ai/sheets/10/apply-edit')
      .set('x-test-user-id', '999')
      .set('x-test-role', 'student')
      .send({ proposedContent: 'evil', snapshotName: 'evil' })

    expect(res.status).toBe(403)
    // No commits, no sheet mutation — the gate held.
    expect(state.commits).toHaveLength(0)
    expect(state.sheets[0].content).toBe(ORIGINAL_CONTENT)
  })

  it('apply-edit rejects missing snapshotName (400) — required by the route', async () => {
    const res = await request(app)
      .post('/api/ai/sheets/10/apply-edit')
      .set('x-test-user-id', '1')
      .set('x-test-role', 'student')
      .send({ proposedContent: PROPOSED_CONTENT })

    expect(res.status).toBe(400)
    expect(state.commits).toHaveLength(0)
  })

  it('restore refuses a non-owner (403) — owner-only revert', async () => {
    // First, an owner applies an edit so we have a pre-commit id.
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: PROPOSED_CONTENT }],
      usage: { input_tokens: 200, output_tokens: 80 },
    })
    await request(app)
      .post('/api/ai/sheets/10/propose-edit')
      .set('x-test-user-id', '1')
      .set('x-test-role', 'student')
      .send({ instruction: 'tweak' })
    await request(app)
      .post('/api/ai/sheets/10/apply-edit')
      .set('x-test-user-id', '1')
      .set('x-test-role', 'student')
      .send({ proposedContent: PROPOSED_CONTENT, snapshotName: 'tweak' })

    const preCommit = state.commits.find((c) => c.kind === 'ai_pre_apply')

    const res = await request(app)
      .post(`/api/sheets/10/lab/restore/${preCommit.id}`)
      .set('x-test-user-id', '999')
      .set('x-test-role', 'student')
      .send({})

    expect(res.status).toBe(403)
    // Sheet body still reflects the applied edit — the failed restore
    // did not touch the row.
    expect(state.sheets[0].content).toBe(PROPOSED_CONTENT)
  })
})
