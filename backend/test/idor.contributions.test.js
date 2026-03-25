/**
 * IDOR / Permission Tests — Contributions
 *
 * Proves:
 * - Only fork owner can create a contribution (POST /:id/contributions)
 * - Only target sheet owner (or admin) can review (PATCH /contributions/:id)
 * - Non-parties cannot access diff (GET /contributions/:id/diff)
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const sheetsRoutePath = require.resolve('../src/modules/sheets')

const mocks = vi.hoisted(() => {
  const state = { userId: 42, role: 'student' }

  const prisma = {
    studySheet: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    sheetContribution: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    sheetCommit: { findFirst: vi.fn(), create: vi.fn() },
    comment: { findMany: vi.fn(), create: vi.fn(), count: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), groupBy: vi.fn() },
    reaction: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), groupBy: vi.fn() },
    starredSheet: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    course: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    notification: { create: vi.fn() },
    pinnedSheet: { findMany: vi.fn() },
    contribution: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    $transaction: vi.fn((fn) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn))),
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId, username: 'test_user', role: state.role }
      next()
    }),
    verifiedEmail: vi.fn((_req, _res, next) => next()),
    sentry: { captureError: vi.fn() },
    storage: { cleanupAttachmentIfUnused: vi.fn(), resolveAttachmentPath: vi.fn() },
    htmlSecurity: {
      validateHtmlForSubmission: vi.fn(() => ({ ok: true, issues: [] })),
      validateHtmlForRuntime: vi.fn(() => ({ ok: true, issues: [] })),
      classifyHtmlRisk: vi.fn(() => ({ tier: 0, reasons: [] })),
      RISK_TIER: { CLEAN: 0, LOW: 1, MEDIUM: 2, HIGH: 3 },
    },
    htmlKillSwitch: { isHtmlUploadsEnabled: vi.fn(() => true) },
    moderationEngine: { isModerationEnabled: vi.fn(() => false), scanContent: vi.fn() },
    provenance: { createProvenanceToken: vi.fn(() => 'tok_fake') },
    notify: { createNotification: vi.fn() },
    mentions: { notifyMentionedUsers: vi.fn() },
    attachmentPreview: { sendAttachmentPreview: vi.fn() },
    securityEvents: { logSecurityEvent: vi.fn() },
    diff: { computeLineDiff: vi.fn(() => []), addWordSegments: vi.fn(() => []) },
    activityTracker: { trackActivity: vi.fn() },
    badges: { checkAndAwardBadges: vi.fn() },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/middleware/requireVerifiedEmail'), mocks.verifiedEmail],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/storage'), mocks.storage],
  [require.resolve('../src/lib/htmlSecurity'), mocks.htmlSecurity],
  [require.resolve('../src/lib/htmlKillSwitch'), mocks.htmlKillSwitch],
  [require.resolve('../src/lib/moderationEngine'), mocks.moderationEngine],
  [require.resolve('../src/lib/provenance'), mocks.provenance],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
  [require.resolve('../src/lib/attachmentPreview'), mocks.attachmentPreview],
  [require.resolve('../src/lib/securityEvents'), mocks.securityEvents],
  [require.resolve('../src/lib/diff'), mocks.diff],
  [require.resolve('../src/lib/activityTracker'), mocks.activityTracker],
  [require.resolve('../src/lib/badges'), mocks.badges],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    if (requestId === 'express-rate-limit') return () => (_req, _res, next) => next()
    try {
      const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
      const mockedModule = mockTargets.get(resolvedRequest)
      if (mockedModule) return mockedModule
    } catch { /* fall through */ }
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[sheetsRoutePath]
  const sheetsRouter = require(sheetsRoutePath)
  app = express()
  app.use(express.json())
  app.use('/api/sheets', sheetsRouter.default || sheetsRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[sheetsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.role = 'student'
})

const FORK_OWNER_ID = 50
const TARGET_OWNER_ID = 100
const STRANGER_ID = 42 // default test user — not owner of fork or target

/* ══════════════════════════════════════════════════════════════════════════
 * POST /api/sheets/:id/contributions — only fork owner can propose
 * ══════════════════════════════════════════════════════════════════════════ */
describe('POST /api/sheets/:id/contributions — fork owner only', () => {
  it('returns 403 when non-fork-owner tries to create contribution', async () => {
    mocks.state.userId = STRANGER_ID
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 10, title: 'Fork', userId: FORK_OWNER_ID, forkOf: 5,
    })

    const res = await request(app)
      .post('/api/sheets/10/contributions')
      .send({ message: 'my changes' })

    expect(res.status).toBe(403)
    expect(mocks.prisma.sheetContribution.create).not.toHaveBeenCalled()
  })

  it('returns 201 when fork owner creates contribution', async () => {
    mocks.state.userId = FORK_OWNER_ID
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce({ id: 10, title: 'Fork', userId: FORK_OWNER_ID, forkOf: 5 })
      .mockResolvedValueOnce({ id: 5, title: 'Original', userId: TARGET_OWNER_ID })
    mocks.prisma.sheetContribution.findFirst.mockResolvedValue(null) // no pending
    mocks.prisma.sheetContribution.create.mockResolvedValue({
      id: 1, status: 'pending', message: 'my changes',
      proposer: { id: FORK_OWNER_ID, username: 'fork_owner' },
      forkSheet: { id: 10, title: 'Fork', updatedAt: new Date(), author: { id: FORK_OWNER_ID, username: 'fork_owner' } },
    })

    const res = await request(app)
      .post('/api/sheets/10/contributions')
      .send({ message: 'my changes' })

    expect(res.status).toBe(201)
    expect(mocks.prisma.sheetContribution.create).toHaveBeenCalled()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
 * PATCH /api/sheets/contributions/:id — only target owner or admin
 * ══════════════════════════════════════════════════════════════════════════ */
describe('PATCH /api/sheets/contributions/:id — target owner only', () => {
  const contributionFixture = () => ({
    id: 1,
    status: 'pending',
    proposerId: FORK_OWNER_ID,
    targetSheetId: 5,
    forkSheetId: 10,
    targetSheet: { id: 5, userId: TARGET_OWNER_ID, title: 'Original', attachmentUrl: null },
    forkSheet: {
      id: 10, title: 'Fork', description: 'desc', content: 'updated',
      contentFormat: 'markdown', attachmentUrl: null, attachmentType: null,
      attachmentName: null, allowDownloads: true,
    },
    proposer: { id: FORK_OWNER_ID, username: 'fork_owner' },
  })

  it('returns 403 when stranger tries to review', async () => {
    mocks.state.userId = STRANGER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(contributionFixture())

    const res = await request(app)
      .patch('/api/sheets/contributions/1')
      .send({ action: 'accept' })

    expect(res.status).toBe(403)
    expect(mocks.prisma.studySheet.update).not.toHaveBeenCalled()
  })

  it('returns 403 when fork owner (proposer) tries to self-review', async () => {
    mocks.state.userId = FORK_OWNER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(contributionFixture())

    const res = await request(app)
      .patch('/api/sheets/contributions/1')
      .send({ action: 'accept' })

    expect(res.status).toBe(403)
  })

  it('returns 200 when target owner accepts', async () => {
    mocks.state.userId = TARGET_OWNER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(contributionFixture())
    mocks.prisma.studySheet.update.mockResolvedValue({})
    mocks.prisma.sheetCommit.findFirst.mockResolvedValue({ id: 99 })
    mocks.prisma.sheetCommit.create.mockResolvedValue({})
    mocks.prisma.sheetContribution.update.mockResolvedValue({
      ...contributionFixture(),
      status: 'accepted',
      reviewer: { id: TARGET_OWNER_ID, username: 'target_owner' },
      forkSheet: { id: 10, title: 'Fork', updatedAt: new Date(), author: { id: FORK_OWNER_ID, username: 'fork_owner' } },
    })

    const res = await request(app)
      .patch('/api/sheets/contributions/1')
      .send({ action: 'accept' })

    expect(res.status).toBe(200)
    expect(mocks.prisma.studySheet.update).toHaveBeenCalled()
  })

  it('returns 200 when admin reviews any contribution', async () => {
    mocks.state.userId = 99
    mocks.state.role = 'admin'
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(contributionFixture())
    mocks.prisma.studySheet.update.mockResolvedValue({})
    mocks.prisma.sheetCommit.findFirst.mockResolvedValue(null)
    mocks.prisma.sheetCommit.create.mockResolvedValue({})
    mocks.prisma.sheetContribution.update.mockResolvedValue({
      ...contributionFixture(),
      status: 'accepted',
      reviewer: { id: 99, username: 'admin_user' },
      forkSheet: { id: 10, title: 'Fork', updatedAt: new Date(), author: { id: FORK_OWNER_ID, username: 'fork_owner' } },
    })

    const res = await request(app)
      .patch('/api/sheets/contributions/1')
      .send({ action: 'accept' })

    expect(res.status).toBe(200)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
 * GET /api/sheets/contributions/:id/diff — parties only
 * ══════════════════════════════════════════════════════════════════════════ */
describe('GET /api/sheets/contributions/:id/diff — access control', () => {
  const diffContribution = () => ({
    id: 1,
    targetSheet: { id: 5, userId: TARGET_OWNER_ID, content: 'original', contentFormat: 'markdown' },
    forkSheet: { id: 10, content: 'updated', contentFormat: 'markdown' },
    proposerId: FORK_OWNER_ID,
  })

  it('returns 403 for unrelated user', async () => {
    mocks.state.userId = STRANGER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(diffContribution())

    const res = await request(app).get('/api/sheets/contributions/1/diff')

    expect(res.status).toBe(403)
  })

  it('returns 200 for target owner', async () => {
    mocks.state.userId = TARGET_OWNER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(diffContribution())

    const res = await request(app).get('/api/sheets/contributions/1/diff')

    expect(res.status).toBe(200)
  })

  it('returns 200 for fork owner (proposer)', async () => {
    mocks.state.userId = FORK_OWNER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(diffContribution())

    const res = await request(app).get('/api/sheets/contributions/1/diff')

    expect(res.status).toBe(200)
  })
})
