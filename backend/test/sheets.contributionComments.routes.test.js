/**
 * Hunk-level contribution comments — access control + validation.
 *
 * Exercises the new endpoints added in 20260408000001_add_contribution_comments:
 *   GET    /api/sheets/contributions/:id/comments
 *   POST   /api/sheets/contributions/:id/comments
 *   DELETE /api/sheets/contributions/:id/comments/:commentId
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/sheets/sheets.contributions.controller')

const mocks = vi.hoisted(() => {
  const state = { userId: 1, role: 'student', username: 'tester' }

  const prisma = {
    studySheet: { findUnique: vi.fn() },
    sheetContribution: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
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
      req.user = { userId: state.userId, role: state.role, username: state.username }
      next()
    }),
    verifiedEmail: vi.fn((_req, _res, next) => next()),
    sentry: { captureError: vi.fn() },
    storage: { cleanupAttachmentIfUnused: vi.fn() },
    htmlSecurity: { validateHtmlForSubmission: vi.fn(() => ({ ok: true, issues: [] })) },
    notify: { createNotification: vi.fn().mockResolvedValue(undefined) },
    diff: { computeLineDiff: vi.fn(() => ({ hunks: [] })), addWordSegments: vi.fn() },
    activityTracker: { trackActivity: vi.fn() },
    badges: { checkAndAwardBadges: vi.fn() },
    accessControl: { sendForbidden: (res, msg) => res.status(403).json({ error: msg }) },
    sheetLabConstants: { computeChecksum: vi.fn(() => 'checksum') },
    serializer: { serializeContribution: vi.fn((c) => c) },
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
  [require.resolve('../src/lib/activityTracker'), mocks.activityTracker],
  [require.resolve('../src/lib/badges'), mocks.badges],
  [require.resolve('../src/modules/sheetLab/sheetLab.constants'), mocks.sheetLabConstants],
  [require.resolve('../src/modules/sheets/sheets.serializer'), mocks.serializer],
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
  mocks.state.userId = 1
  mocks.state.role = 'student'
  mocks.state.username = 'tester'
})

const PROPOSER_ID = 50
const TARGET_OWNER_ID = 100
const STRANGER_ID = 200
const CONTRIBUTION_ID = 7

const contributionContext = () => ({
  id: CONTRIBUTION_ID,
  proposerId: PROPOSER_ID,
  targetSheetId: 5,
  targetSheet: { id: 5, userId: TARGET_OWNER_ID, title: 'Original' },
})

/* ═══════════════════════════════════════════════════════════════
 * GET /contributions/:id/comments
 * ═══════════════════════════════════════════════════════════════ */
describe('GET /api/sheets/contributions/:id/comments', () => {
  it('returns 404 when caller is neither proposer, owner, nor admin', async () => {
    mocks.state.userId = STRANGER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(contributionContext())

    const res = await request(app).get(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments`)

    expect(res.status).toBe(404)
    expect(mocks.prisma.contributionComment.findMany).not.toHaveBeenCalled()
  })

  it('returns 404 when the contribution does not exist', async () => {
    mocks.state.userId = PROPOSER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(null)

    const res = await request(app).get(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments`)
    expect(res.status).toBe(404)
  })

  it('returns comments for the proposer', async () => {
    mocks.state.userId = PROPOSER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(contributionContext())
    mocks.prisma.contributionComment.findMany.mockResolvedValue([
      {
        id: 1, contributionId: CONTRIBUTION_ID, hunkIndex: 0, lineOffset: 2,
        side: 'new', body: 'looks good', createdAt: new Date(), updatedAt: new Date(),
        author: { id: PROPOSER_ID, username: 'fork_owner' },
      },
    ])

    const res = await request(app).get(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments`)
    expect(res.status).toBe(200)
    expect(res.body.comments).toHaveLength(1)
    expect(res.body.comments[0].body).toBe('looks good')
  })

  it('returns comments for the target owner', async () => {
    mocks.state.userId = TARGET_OWNER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(contributionContext())
    mocks.prisma.contributionComment.findMany.mockResolvedValue([])

    const res = await request(app).get(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments`)
    expect(res.status).toBe(200)
    expect(res.body.comments).toEqual([])
  })

  it('returns comments for admins', async () => {
    mocks.state.userId = 999
    mocks.state.role = 'admin'
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(contributionContext())
    mocks.prisma.contributionComment.findMany.mockResolvedValue([])

    const res = await request(app).get(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments`)
    expect(res.status).toBe(200)
  })
})

/* ═══════════════════════════════════════════════════════════════
 * POST /contributions/:id/comments
 * ═══════════════════════════════════════════════════════════════ */
describe('POST /api/sheets/contributions/:id/comments', () => {
  const validBody = { hunkIndex: 0, lineOffset: 3, side: 'new', body: 'please clarify this line' }

  it('returns 400 when hunkIndex is missing', async () => {
    mocks.state.userId = PROPOSER_ID
    const res = await request(app)
      .post(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments`)
      .send({ lineOffset: 1, side: 'new', body: 'hi' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when body is empty', async () => {
    mocks.state.userId = PROPOSER_ID
    const res = await request(app)
      .post(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments`)
      .send({ ...validBody, body: '   ' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when side is invalid', async () => {
    mocks.state.userId = PROPOSER_ID
    const res = await request(app)
      .post(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments`)
      .send({ ...validBody, side: 'middle' })
    expect(res.status).toBe(400)
  })

  it('returns 404 for strangers', async () => {
    mocks.state.userId = STRANGER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(contributionContext())

    const res = await request(app)
      .post(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments`)
      .send(validBody)

    expect(res.status).toBe(404)
    expect(mocks.prisma.contributionComment.create).not.toHaveBeenCalled()
  })

  it('creates a comment for the proposer and notifies the target owner', async () => {
    mocks.state.userId = PROPOSER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(contributionContext())
    mocks.prisma.contributionComment.create.mockResolvedValue({
      id: 11, contributionId: CONTRIBUTION_ID, hunkIndex: 0, lineOffset: 3,
      side: 'new', body: 'please clarify this line', createdAt: new Date(),
      updatedAt: new Date(),
      author: { id: PROPOSER_ID, username: 'fork_owner' },
    })

    const res = await request(app)
      .post(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments`)
      .send(validBody)

    expect(res.status).toBe(201)
    expect(res.body.comment.id).toBe(11)
    expect(mocks.prisma.contributionComment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contributionId: CONTRIBUTION_ID,
        userId: PROPOSER_ID,
        hunkIndex: 0,
        lineOffset: 3,
        side: 'new',
        body: 'please clarify this line',
      }),
      include: expect.any(Object),
    })
    expect(mocks.notify.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: TARGET_OWNER_ID,
        type: 'contribution_comment',
      }),
    )
  })

  it('creates a comment for the target owner and notifies the proposer', async () => {
    mocks.state.userId = TARGET_OWNER_ID
    mocks.prisma.sheetContribution.findUnique.mockResolvedValue(contributionContext())
    mocks.prisma.contributionComment.create.mockResolvedValue({
      id: 12, contributionId: CONTRIBUTION_ID, hunkIndex: 0, lineOffset: 3,
      side: 'new', body: 'please clarify this line', createdAt: new Date(),
      updatedAt: new Date(),
      author: { id: TARGET_OWNER_ID, username: 'target_owner' },
    })

    const res = await request(app)
      .post(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments`)
      .send(validBody)

    expect(res.status).toBe(201)
    expect(mocks.notify.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: PROPOSER_ID, type: 'contribution_comment' }),
    )
  })
})

/* ═══════════════════════════════════════════════════════════════
 * DELETE /contributions/:id/comments/:commentId
 * ═══════════════════════════════════════════════════════════════ */
describe('DELETE /api/sheets/contributions/:id/comments/:commentId', () => {
  it('returns 404 when the comment does not exist', async () => {
    mocks.state.userId = PROPOSER_ID
    mocks.prisma.contributionComment.findUnique.mockResolvedValue(null)

    const res = await request(app).delete(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments/99`)
    expect(res.status).toBe(404)
  })

  it('returns 404 when the comment belongs to a different contribution', async () => {
    mocks.state.userId = PROPOSER_ID
    mocks.prisma.contributionComment.findUnique.mockResolvedValue({
      id: 99, userId: PROPOSER_ID, contributionId: 999,
    })

    const res = await request(app).delete(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments/99`)
    expect(res.status).toBe(404)
  })

  it('returns 404 for non-authors (treated as not-found to avoid probing)', async () => {
    mocks.state.userId = STRANGER_ID
    mocks.prisma.contributionComment.findUnique.mockResolvedValue({
      id: 99, userId: PROPOSER_ID, contributionId: CONTRIBUTION_ID,
    })

    const res = await request(app).delete(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments/99`)
    expect(res.status).toBe(404)
    expect(mocks.prisma.contributionComment.delete).not.toHaveBeenCalled()
  })

  it('deletes when author requests it', async () => {
    mocks.state.userId = PROPOSER_ID
    mocks.prisma.contributionComment.findUnique.mockResolvedValue({
      id: 99, userId: PROPOSER_ID, contributionId: CONTRIBUTION_ID,
    })
    mocks.prisma.contributionComment.delete.mockResolvedValue({})

    const res = await request(app).delete(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments/99`)
    expect(res.status).toBe(200)
    expect(mocks.prisma.contributionComment.delete).toHaveBeenCalledWith({ where: { id: 99 } })
  })

  it('deletes when admin requests it', async () => {
    mocks.state.userId = 999
    mocks.state.role = 'admin'
    mocks.prisma.contributionComment.findUnique.mockResolvedValue({
      id: 99, userId: PROPOSER_ID, contributionId: CONTRIBUTION_ID,
    })
    mocks.prisma.contributionComment.delete.mockResolvedValue({})

    const res = await request(app).delete(`/api/sheets/contributions/${CONTRIBUTION_ID}/comments/99`)
    expect(res.status).toBe(200)
  })
})
