/**
 * Deep test coverage — contribution submit + review on /api/sheets.
 *
 * Covers: POST /:id/contributions (fork-back), PATCH /contributions/:cid
 * (accept/reject), conflict detection via baseChecksum, achievements V2
 * events (CONTRIBUTION_SUBMIT, CONTRIBUTION_QUICKDRAW, CONTRIBUTION_ACCEPT,
 * CONTRIBUTION_PERFECT, REVIEW_SUBMIT, REVIEW_FAST), diff endpoint access
 * control. Mocks Prisma, achievements, notify, html, diff, storage.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/sheets/sheets.contributions.controller')

const mocks = vi.hoisted(() => {
  const state = { user: { userId: 1, username: 'tester', role: 'student' } }
  const prisma = {
    studySheet: { findUnique: vi.fn(), update: vi.fn() },
    sheetContribution: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sheetCommit: { findFirst: vi.fn(), create: vi.fn() },
    contributionComment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  }
  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      if (!state.user) return _res.status(401).json({ error: 'Login required.' })
      req.user = { ...state.user }
      next()
    }),
    verifiedEmail: vi.fn((_req, _res, next) => next()),
    sentry: { captureError: vi.fn() },
    accessControl: { sendForbidden: (res, msg) => res.status(403).json({ error: msg }) },
    notify: { createNotification: vi.fn().mockResolvedValue(undefined) },
    htmlSecurity: { validateHtmlForSubmission: vi.fn(() => ({ ok: true, issues: [] })) },
    storage: { cleanupAttachmentIfUnused: vi.fn() },
    diff: { computeLineDiff: vi.fn(() => ({ hunks: [] })), addWordSegments: vi.fn() },
    sheetsConstants: {
      SHEET_STATUS: { PUBLISHED: 'published', DRAFT: 'draft' },
      AUTHOR_SELECT: { id: true, username: true, avatarUrl: true, isStaffVerified: true },
      contributionRateLimiter: (_req, _res, next) => next(),
      contributionReviewLimiter: (_req, _res, next) => next(),
      diffLimiter: (_req, _res, next) => next(),
    },
    serializer: { serializeContribution: vi.fn((c) => c) },
    sheetLabConstants: { computeChecksum: vi.fn(() => 'CHECKSUM_A') },
    activityTracker: { trackActivity: vi.fn() },
    achievements: {
      emitAchievementEvent: vi.fn(),
      checkAndAwardBadgesLegacy: vi.fn(),
      EVENT_KINDS: {
        CONTRIBUTION_SUBMIT: 'contribution.submit',
        CONTRIBUTION_QUICKDRAW: 'contribution.quickdraw',
        CONTRIBUTION_ACCEPT: 'contribution.accept',
        CONTRIBUTION_PERFECT: 'contribution.perfect',
        REVIEW_SUBMIT: 'review.submit',
        REVIEW_FAST: 'review.fast',
      },
    },
    applyContentUpdate: {
      withPreviewText: vi.fn((content) => ({
        content,
        previewText: String(content).slice(0, 100),
      })),
    },
    errorEnvelope: {
      sendError: (res, status, message, code) => res.status(status).json({ error: message, code }),
      ERROR_CODES: {
        BAD_REQUEST: 'BAD_REQUEST',
        VALIDATION: 'VALIDATION',
        NOT_FOUND: 'NOT_FOUND',
        INTERNAL: 'INTERNAL',
      },
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/core/db/prisma'), mocks.prisma],
  [require.resolve('../src/core/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/core/auth/requireAuth'), mocks.auth],
  [require.resolve('../src/core/auth/requireVerifiedEmail'), mocks.verifiedEmail],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/html/htmlSecurity'), mocks.htmlSecurity],
  [require.resolve('../src/lib/storage'), mocks.storage],
  [require.resolve('../src/lib/diff'), mocks.diff],
  [require.resolve('../src/modules/sheets/sheets.constants'), mocks.sheetsConstants],
  [require.resolve('../src/modules/sheets/sheets.serializer'), mocks.serializer],
  [require.resolve('../src/modules/sheetLab/sheetLab.constants'), mocks.sheetLabConstants],
  [require.resolve('../src/lib/activityTracker'), mocks.activityTracker],
  [require.resolve('../src/modules/achievements'), mocks.achievements],
  [require.resolve('../src/lib/badges'), mocks.achievements],
  [require.resolve('../src/lib/sheets/applyContentUpdate'), mocks.applyContentUpdate],
  [require.resolve('../src/middleware/errorEnvelope'), mocks.errorEnvelope],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
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
  delete require.cache[controllerPath]
  const routerModule = require(controllerPath)
  const router = routerModule.default || routerModule
  app = express()
  app.use(express.json())
  app.use('/api/sheets', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[controllerPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.studySheet.findUnique.mockReset()
  mocks.prisma.studySheet.update.mockReset()
  mocks.prisma.sheetContribution.findUnique.mockReset()
  mocks.prisma.sheetContribution.findFirst.mockReset()
  mocks.prisma.sheetContribution.create.mockReset()
  mocks.prisma.sheetContribution.update.mockReset()
  mocks.prisma.sheetCommit.findFirst.mockReset()
  mocks.prisma.sheetCommit.create.mockReset()
  mocks.state.user = { userId: 1, username: 'tester', role: 'student' }
  mocks.htmlSecurity.validateHtmlForSubmission.mockImplementation(() => ({ ok: true, issues: [] }))
  mocks.sheetLabConstants.computeChecksum.mockImplementation(() => 'CHECKSUM_A')
})

const FORK_ID = 11
const ORIG_ID = 10
const PROPOSER_ID = 1
const TARGET_OWNER_ID = 5

function forkSheet(overrides = {}) {
  return {
    id: FORK_ID,
    title: 'My Fork',
    userId: PROPOSER_ID,
    forkOf: ORIG_ID,
    createdAt: new Date(),
    ...overrides,
  }
}
function targetSheet(overrides = {}) {
  return {
    id: ORIG_ID,
    title: 'Original',
    userId: TARGET_OWNER_ID,
    content: '# Original',
    attachmentUrl: null,
    ...overrides,
  }
}

// ── POST /:id/contributions ───────────────────────────────────────
describe('POST /api/sheets/:id/contributions — submit', () => {
  it('creates a contribution from a forked sheet (201)', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce(forkSheet())
      .mockResolvedValueOnce(targetSheet())
    mocks.prisma.sheetContribution.findFirst.mockResolvedValueOnce(null) // no pending
    mocks.prisma.sheetContribution.create.mockResolvedValueOnce({
      id: 100,
      status: 'pending',
      proposer: { id: PROPOSER_ID, username: 'tester' },
      forkSheet: { id: FORK_ID, title: 'My Fork', author: null },
    })

    const res = await request(app)
      .post(`/api/sheets/${FORK_ID}/contributions`)
      .send({ message: 'Please merge!' })
    expect(res.status).toBe(201)
    expect(res.body.contribution.id).toBe(100)
    // baseChecksum captured at submit time per CLAUDE.md design
    const args = mocks.prisma.sheetContribution.create.mock.calls[0][0]
    expect(args.data.baseChecksum).toBe('CHECKSUM_A')
  })

  it('404 when the fork sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app)
      .post(`/api/sheets/${FORK_ID}/contributions`)
      .send({ message: 'hi' })
    expect(res.status).toBe(404)
  })

  it('400 when the sheet is not actually a fork (forkOf=null)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(forkSheet({ forkOf: null }))
    const res = await request(app)
      .post(`/api/sheets/${FORK_ID}/contributions`)
      .send({ message: 'hi' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/forked sheets/i)
  })

  it('403 when the requester is not the fork owner', async () => {
    mocks.state.user = { userId: 999, username: 'stranger', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(forkSheet())
    const res = await request(app)
      .post(`/api/sheets/${FORK_ID}/contributions`)
      .send({ message: 'hi' })
    expect(res.status).toBe(403)
  })

  it('400 when contributing to your own sheet', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce(forkSheet())
      .mockResolvedValueOnce(targetSheet({ userId: PROPOSER_ID })) // same user
    const res = await request(app)
      .post(`/api/sheets/${FORK_ID}/contributions`)
      .send({ message: 'hi' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/own sheet/i)
  })

  it('409 when there is already a pending contribution for this fork', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce(forkSheet())
      .mockResolvedValueOnce(targetSheet())
    mocks.prisma.sheetContribution.findFirst.mockResolvedValueOnce({ id: 7 })
    const res = await request(app)
      .post(`/api/sheets/${FORK_ID}/contributions`)
      .send({ message: 'hi' })
    expect(res.status).toBe(409)
  })

  it('emits CONTRIBUTION_SUBMIT achievement', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce(forkSheet())
      .mockResolvedValueOnce(targetSheet())
    mocks.prisma.sheetContribution.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.sheetContribution.create.mockResolvedValueOnce({
      id: 100,
      status: 'pending',
      proposer: { id: PROPOSER_ID, username: 'tester' },
      forkSheet: { id: FORK_ID, title: 'My Fork', author: null },
    })

    await request(app).post(`/api/sheets/${FORK_ID}/contributions`).send({ message: 'hi' })
    const kinds = mocks.achievements.emitAchievementEvent.mock.calls.map((c) => c[2])
    expect(kinds).toContain('contribution.submit')
  })

  it('emits CONTRIBUTION_QUICKDRAW when fork is <1h old', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce(forkSheet({ createdAt: new Date(Date.now() - 30 * 60_000) })) // 30 min old
      .mockResolvedValueOnce(targetSheet())
    mocks.prisma.sheetContribution.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.sheetContribution.create.mockResolvedValueOnce({
      id: 100,
      status: 'pending',
      proposer: { id: PROPOSER_ID, username: 'tester' },
      forkSheet: { id: FORK_ID, title: 'My Fork', author: null },
    })

    await request(app).post(`/api/sheets/${FORK_ID}/contributions`).send({ message: 'hi' })
    const kinds = mocks.achievements.emitAchievementEvent.mock.calls.map((c) => c[2])
    expect(kinds).toContain('contribution.quickdraw')
  })
})

// ── PATCH /contributions/:cid ────────────────────────────────────
describe('PATCH /api/sheets/contributions/:cid — review', () => {
  function pendingContribution(overrides = {}) {
    return {
      id: 100,
      status: 'pending',
      baseChecksum: 'CHECKSUM_A',
      targetSheetId: ORIG_ID,
      proposerId: PROPOSER_ID,
      createdAt: new Date(),
      targetSheet: {
        id: ORIG_ID,
        userId: TARGET_OWNER_ID,
        title: 'Original',
        content: '# Original',
        attachmentUrl: null,
      },
      forkSheet: {
        id: FORK_ID,
        title: 'My Fork',
        description: 'd',
        content: '# Improved',
        contentFormat: 'markdown',
        attachmentUrl: null,
        attachmentType: null,
        attachmentName: null,
        allowDownloads: true,
      },
      proposer: { id: PROPOSER_ID, username: 'tester' },
      ...overrides,
    }
  }

  beforeEach(() => {
    mocks.state.user = { userId: TARGET_OWNER_ID, username: 'owner', role: 'student' }
  })

  it('accept merges fork content into target', async () => {
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(pendingContribution())
    mocks.prisma.studySheet.update.mockResolvedValueOnce({})
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce({ id: 1 })
    mocks.prisma.sheetCommit.create.mockResolvedValueOnce({ id: 2 })
    mocks.prisma.sheetContribution.update.mockResolvedValueOnce({
      id: 100,
      status: 'accepted',
      proposer: { id: PROPOSER_ID, username: 'tester' },
      reviewer: { id: TARGET_OWNER_ID, username: 'owner' },
      forkSheet: { id: FORK_ID, title: 'My Fork', author: null },
    })

    const res = await request(app).patch('/api/sheets/contributions/100').send({ action: 'accept' })
    expect(res.status).toBe(200)
    expect(mocks.prisma.studySheet.update).toHaveBeenCalled()
    expect(mocks.prisma.sheetCommit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'merge' }) }),
    )
  })

  it('reject does NOT update the target sheet', async () => {
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(pendingContribution())
    mocks.prisma.sheetContribution.update.mockResolvedValueOnce({
      id: 100,
      status: 'rejected',
      proposer: { id: PROPOSER_ID, username: 'tester' },
      reviewer: { id: TARGET_OWNER_ID, username: 'owner' },
      forkSheet: { id: FORK_ID, title: 'My Fork', author: null },
    })

    const res = await request(app)
      .patch('/api/sheets/contributions/100')
      .send({ action: 'reject', reviewComment: 'not yet' })
    expect(res.status).toBe(200)
    expect(mocks.prisma.studySheet.update).not.toHaveBeenCalled()
    expect(mocks.prisma.sheetCommit.create).not.toHaveBeenCalled()
  })

  it('400 when action is missing or invalid', async () => {
    const res = await request(app)
      .patch('/api/sheets/contributions/100')
      .send({ action: 'sometimes' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/accept.*reject/i)
  })

  it('400 when contribution id is not an integer', async () => {
    const res = await request(app).patch('/api/sheets/contributions/abc').send({ action: 'accept' })
    expect(res.status).toBe(400)
  })

  it('404 when contribution does not exist', async () => {
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).patch('/api/sheets/contributions/100').send({ action: 'accept' })
    expect(res.status).toBe(404)
  })

  it('409 when contribution has already been reviewed', async () => {
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(
      pendingContribution({ status: 'accepted' }),
    )
    const res = await request(app).patch('/api/sheets/contributions/100').send({ action: 'accept' })
    expect(res.status).toBe(409)
  })

  it('403 when reviewer is neither the target sheet owner nor admin', async () => {
    mocks.state.user = { userId: 999, username: 'stranger', role: 'student' }
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(pendingContribution())
    const res = await request(app).patch('/api/sheets/contributions/100').send({ action: 'accept' })
    expect(res.status).toBe(403)
  })

  it('admin can review any contribution', async () => {
    mocks.state.user = { userId: 999, username: 'admin', role: 'admin' }
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(pendingContribution())
    mocks.prisma.studySheet.update.mockResolvedValueOnce({})
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.sheetCommit.create.mockResolvedValueOnce({ id: 1 })
    mocks.prisma.sheetContribution.update.mockResolvedValueOnce({
      id: 100,
      status: 'accepted',
      proposer: { id: PROPOSER_ID, username: 'tester' },
      reviewer: { id: 999, username: 'admin' },
      forkSheet: { id: FORK_ID, title: 'My Fork', author: null },
    })
    const res = await request(app).patch('/api/sheets/contributions/100').send({ action: 'accept' })
    expect(res.status).toBe(200)
  })

  it('conflict detection: surfaces conflictWarning when baseChecksum differs', async () => {
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(
      pendingContribution({ baseChecksum: 'STALE' }),
    )
    mocks.sheetLabConstants.computeChecksum.mockReturnValueOnce('CURRENT_OTHER')
    mocks.prisma.studySheet.update.mockResolvedValueOnce({})
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.sheetCommit.create.mockResolvedValueOnce({ id: 1 })
    mocks.prisma.sheetContribution.update.mockResolvedValueOnce({
      id: 100,
      status: 'accepted',
      proposer: { id: PROPOSER_ID, username: 'tester' },
      reviewer: { id: TARGET_OWNER_ID, username: 'owner' },
      forkSheet: { id: FORK_ID, title: 'My Fork', author: null },
    })

    const res = await request(app).patch('/api/sheets/contributions/100').send({ action: 'accept' })
    expect(res.status).toBe(200)
    expect(res.body.conflictWarning).toBeTruthy()
  })

  it('emits REVIEW_FAST + CONTRIBUTION_ACCEPT + CONTRIBUTION_PERFECT (no reviewComment)', async () => {
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(
      pendingContribution({ createdAt: new Date(Date.now() - 60_000) }), // 1 min ago
    )
    mocks.prisma.studySheet.update.mockResolvedValueOnce({})
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.sheetCommit.create.mockResolvedValueOnce({ id: 1 })
    mocks.prisma.sheetContribution.update.mockResolvedValueOnce({
      id: 100,
      status: 'accepted',
      proposer: { id: PROPOSER_ID, username: 'tester' },
      reviewer: { id: TARGET_OWNER_ID, username: 'owner' },
      forkSheet: { id: FORK_ID, title: 'My Fork', author: null },
    })

    await request(app).patch('/api/sheets/contributions/100').send({ action: 'accept' }) // no reviewComment ⇒ "perfect" event fires
    const kinds = mocks.achievements.emitAchievementEvent.mock.calls.map((c) => c[2])
    expect(kinds).toContain('review.submit')
    expect(kinds).toContain('review.fast')
    expect(kinds).toContain('contribution.accept')
    expect(kinds).toContain('contribution.perfect')
  })

  it('HTML contribution: rejects when validateHtmlForSubmission says !ok', async () => {
    mocks.htmlSecurity.validateHtmlForSubmission.mockReturnValueOnce({
      ok: false,
      issues: ['Bad HTML'],
    })
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(
      pendingContribution({
        forkSheet: {
          id: FORK_ID,
          title: 'F',
          description: '',
          content: '<script>x</script>',
          contentFormat: 'html',
          attachmentUrl: null,
          attachmentType: null,
          attachmentName: null,
          allowDownloads: true,
        },
      }),
    )
    const res = await request(app).patch('/api/sheets/contributions/100').send({ action: 'accept' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Bad HTML/)
  })
})

// ── GET /contributions/:cid/diff ──────────────────────────────────
describe('GET /api/sheets/contributions/:cid/diff', () => {
  function contribForDiff(viewerIsOwner) {
    return {
      id: 100,
      proposerId: PROPOSER_ID,
      baseChecksum: 'CHECKSUM_A',
      targetSheet: { id: ORIG_ID, userId: viewerIsOwner ? 1 : 99, content: 'old' },
      forkSheet: { id: FORK_ID, content: 'new' },
    }
  }

  it('happy path returns diff + hasConflict=false when checksum matches', async () => {
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(contribForDiff(true))
    const res = await request(app).get('/api/sheets/contributions/100/diff')
    expect(res.status).toBe(200)
    expect(res.body.hasConflict).toBe(false)
  })

  it('hasConflict=true when baseChecksum differs', async () => {
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(contribForDiff(true))
    mocks.sheetLabConstants.computeChecksum.mockReturnValueOnce('DIFFERENT')
    const res = await request(app).get('/api/sheets/contributions/100/diff')
    expect(res.status).toBe(200)
    expect(res.body.hasConflict).toBe(true)
  })

  it('403 when caller is neither owner, proposer, nor admin', async () => {
    mocks.state.user = { userId: 999, username: 'random', role: 'student' }
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(contribForDiff(false))
    const res = await request(app).get('/api/sheets/contributions/100/diff')
    expect(res.status).toBe(403)
  })

  it('404 when contribution does not exist', async () => {
    mocks.prisma.sheetContribution.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/sheets/contributions/9999/diff')
    expect(res.status).toBe(404)
  })

  it('400 on non-integer contribution id', async () => {
    const res = await request(app).get('/api/sheets/contributions/abc/diff')
    expect(res.status).toBe(400)
  })
})
