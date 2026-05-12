/**
 * Deep test coverage — SheetLab commits endpoints.
 *
 * GET  /api/sheets/:id/lab/commits           — pagination
 * GET  /api/sheets/:id/lab/commits/:commitId — single commit
 * POST /api/sheets/:id/lab/commits           — owner-only create
 *
 * Verifies A12 numeric-ID validation, parentId chaining, achievement
 * emission, and 403 for non-owners on POST even when read is allowed.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/sheetLab/sheetLab.commits.controller')

const mocks = vi.hoisted(() => {
  const state = { user: { userId: 1, username: 'owner', role: 'student' } }
  const prisma = {
    studySheet: { findUnique: vi.fn() },
    sheetCommit: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
  }
  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      if (!state.user) return _res.status(401).json({ error: 'Login required.' })
      req.user = { ...state.user }
      next()
    }),
    sentry: { captureError: vi.fn() },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(({ res, user, ownerId }) => {
        if (user?.role === 'admin' || user?.userId === ownerId) return true
        res.status(403).json({ error: 'Forbidden' })
        return false
      }),
    },
    sheetLabConstants: {
      optionalAuth: vi.fn((req, _res, next) => {
        if (state.user) req.user = { ...state.user }
        next()
      }),
      canReadSheet: vi.fn((sheet, user) => {
        if (sheet?.status === 'published') return true
        return Boolean(user && (user.role === 'admin' || user.userId === sheet?.userId))
      }),
      parsePositiveInt: vi.fn((v, fb) => {
        const n = Number.parseInt(v, 10)
        return Number.isInteger(n) && n > 0 ? n : fb || 0
      }),
      computeChecksum: vi.fn(() => 'CHECKSUM_X'),
    },
    activityTracker: { trackActivity: vi.fn() },
    achievements: {
      emitAchievementEvent: vi.fn(),
      checkAndAwardBadgesLegacy: vi.fn(),
      EVENT_KINDS: { COMMIT_CREATE: 'commit.create' },
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/modules/sheetLab/sheetLab.constants'), mocks.sheetLabConstants],
  [require.resolve('../src/lib/activityTracker'), mocks.activityTracker],
  [require.resolve('../src/modules/achievements'), mocks.achievements],
  [require.resolve('../src/lib/badges'), mocks.achievements],
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
  mocks.prisma.sheetCommit.findMany.mockReset()
  mocks.prisma.sheetCommit.findFirst.mockReset()
  mocks.prisma.sheetCommit.count.mockReset()
  mocks.prisma.sheetCommit.create.mockReset()
  mocks.state.user = { userId: 1, username: 'owner', role: 'student' }
  mocks.sheetLabConstants.canReadSheet.mockImplementation((sheet, user) => {
    if (sheet?.status === 'published') return true
    return Boolean(user && (user.role === 'admin' || user.userId === sheet?.userId))
  })
  mocks.sheetLabConstants.parsePositiveInt.mockImplementation((v, fb) => {
    const n = Number.parseInt(v, 10)
    return Number.isInteger(n) && n > 0 ? n : fb || 0
  })
  mocks.sheetLabConstants.computeChecksum.mockReturnValue('CHECKSUM_X')
  mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ res, user, ownerId }) => {
    if (user?.role === 'admin' || user?.userId === ownerId) return true
    res.status(403).json({ error: 'Forbidden' })
    return false
  })
})

function pubSheet(overrides = {}) {
  return {
    id: 10,
    userId: 1,
    status: 'published',
    content: '# Hi',
    contentFormat: 'markdown',
    ...overrides,
  }
}

// ── GET /:id/lab/commits ─────────────────────────────────────────
describe('GET /api/sheets/:id/lab/commits', () => {
  it('returns paginated commits with default page/limit', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce([
      {
        id: 1,
        message: 'init',
        kind: 'snapshot',
        checksum: 'a',
        contentFormat: 'markdown',
        parentId: null,
        createdAt: new Date(),
        author: { id: 1, username: 'o' },
      },
    ])
    mocks.prisma.sheetCommit.count.mockResolvedValueOnce(1)
    const res = await request(app).get('/api/sheets/10/lab/commits')
    expect(res.status).toBe(200)
    expect(res.body.commits).toHaveLength(1)
    expect(res.body.total).toBe(1)
    expect(res.body.page).toBe(1)
    expect(res.body.totalPages).toBe(1)
  })

  it('honors page=2 limit=3 (skip=3, take=3)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce([])
    mocks.prisma.sheetCommit.count.mockResolvedValueOnce(0)
    await request(app).get('/api/sheets/10/lab/commits?page=2&limit=3')
    const args = mocks.prisma.sheetCommit.findMany.mock.calls[0][0]
    expect(args.take).toBe(3)
    expect(args.skip).toBe(3)
  })

  it('clamps limit to a maximum of 100', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce([])
    mocks.prisma.sheetCommit.count.mockResolvedValueOnce(0)
    await request(app).get('/api/sheets/10/lab/commits?limit=9999')
    const args = mocks.prisma.sheetCommit.findMany.mock.calls[0][0]
    expect(args.take).toBe(100)
  })

  it('A12: 400 on non-positive id', async () => {
    const res = await request(app).get('/api/sheets/abc/lab/commits')
    expect(res.status).toBe(400)
  })

  it('404 when sheet not found', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/sheets/9999/lab/commits')
    expect(res.status).toBe(404)
  })

  it('404 when caller cannot read (draft, not owner)', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet({ status: 'draft' }))
    const res = await request(app).get('/api/sheets/10/lab/commits')
    expect(res.status).toBe(404)
  })
})

// ── GET /:id/lab/commits/:commitId ───────────────────────────────
describe('GET /api/sheets/:id/lab/commits/:commitId', () => {
  it('returns full content for the requested commit', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce({
      id: 5,
      message: 'snap',
      content: '# Hi',
      contentFormat: 'markdown',
      checksum: 'CHECKSUM_X',
      author: { id: 1, username: 'o' },
      createdAt: new Date(),
      parentId: null,
    })
    const res = await request(app).get('/api/sheets/10/lab/commits/5')
    expect(res.status).toBe(200)
    expect(res.body.commit.id).toBe(5)
    expect(res.body.commit.content).toBe('# Hi')
  })

  it('404 when commit not found', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/sheets/10/lab/commits/999')
    expect(res.status).toBe(404)
  })

  it('A12: 400 on either non-positive id', async () => {
    const res = await request(app).get('/api/sheets/abc/lab/commits/1')
    expect(res.status).toBe(400)
  })

  it('A12: 400 on non-positive commit id', async () => {
    const res = await request(app).get('/api/sheets/10/lab/commits/abc')
    expect(res.status).toBe(400)
  })

  it('404 when caller cannot read sheet (draft, non-owner)', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet({ status: 'draft' }))
    const res = await request(app).get('/api/sheets/10/lab/commits/5')
    expect(res.status).toBe(404)
  })
})

// ── POST /:id/lab/commits ────────────────────────────────────────
describe('POST /api/sheets/:id/lab/commits', () => {
  it('owner can create a commit (201) and chains parentId from latest', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce({ id: 50 })
    mocks.prisma.sheetCommit.create.mockResolvedValueOnce({
      id: 51,
      message: 'msg',
      content: '# Hi',
      contentFormat: 'markdown',
      checksum: 'CHECKSUM_X',
      author: { id: 1, username: 'o' },
      createdAt: new Date(),
      parentId: 50,
    })
    const res = await request(app).post('/api/sheets/10/lab/commits').send({ message: 'msg' })
    expect(res.status).toBe(201)
    expect(res.body.commit.parentId).toBe(50)
    expect(res.body.commit.checksum).toBe('CHECKSUM_X')
  })

  it('non-owner cannot create commit (403) — defense in depth', async () => {
    mocks.state.user = { userId: 999, username: 'stranger', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet({ userId: 1 }))
    const res = await request(app).post('/api/sheets/10/lab/commits').send({ message: 'msg' })
    expect(res.status).toBe(403)
    expect(mocks.prisma.sheetCommit.create).not.toHaveBeenCalled()
  })

  it("admin can create commit on someone else's sheet", async () => {
    mocks.state.user = { userId: 999, username: 'admin', role: 'admin' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet({ userId: 1 }))
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.sheetCommit.create.mockResolvedValueOnce({
      id: 1,
      message: 'msg',
      content: '# Hi',
      contentFormat: 'markdown',
      checksum: 'CHECKSUM_X',
      author: { id: 999, username: 'admin' },
      createdAt: new Date(),
      parentId: null,
    })
    const res = await request(app).post('/api/sheets/10/lab/commits').send({ message: 'msg' })
    expect(res.status).toBe(201)
  })

  it('401 when unauthenticated', async () => {
    mocks.state.user = null
    const res = await request(app).post('/api/sheets/10/lab/commits').send({ message: 'msg' })
    expect(res.status).toBe(401)
  })

  it('A12: 400 on non-positive id', async () => {
    const res = await request(app).post('/api/sheets/abc/lab/commits').send({ message: 'msg' })
    expect(res.status).toBe(400)
  })

  it('404 when sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/api/sheets/9999/lab/commits').send({ message: 'msg' })
    expect(res.status).toBe(404)
  })

  it('empty / missing message defaults to "Snapshot"', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.sheetCommit.create.mockResolvedValueOnce({
      id: 1,
      message: 'Snapshot',
      content: '# Hi',
      contentFormat: 'markdown',
      checksum: 'CHECKSUM_X',
      author: { id: 1, username: 'o' },
      createdAt: new Date(),
      parentId: null,
    })
    await request(app).post('/api/sheets/10/lab/commits').send({})
    const args = mocks.prisma.sheetCommit.create.mock.calls[0][0]
    expect(args.data.message).toBe('Snapshot')
  })

  it('emits COMMIT_CREATE achievement event', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.sheetCommit.create.mockResolvedValueOnce({
      id: 1,
      message: 'snap',
      content: '# Hi',
      contentFormat: 'markdown',
      checksum: 'CHECKSUM_X',
      author: { id: 1, username: 'o' },
      createdAt: new Date(),
      parentId: null,
    })
    await request(app).post('/api/sheets/10/lab/commits').send({ message: 'snap' })
    expect(mocks.achievements.emitAchievementEvent).toHaveBeenCalledWith(
      mocks.prisma,
      1,
      'commit.create',
      expect.objectContaining({ sheetId: 10, commitId: 1 }),
    )
  })

  it('tracks activity on successful commit', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.sheetCommit.create.mockResolvedValueOnce({
      id: 1,
      message: 'snap',
      content: '# Hi',
      contentFormat: 'markdown',
      checksum: 'CHECKSUM_X',
      author: { id: 1, username: 'o' },
      createdAt: new Date(),
      parentId: null,
    })
    await request(app).post('/api/sheets/10/lab/commits').send({ message: 'snap' })
    expect(mocks.activityTracker.trackActivity).toHaveBeenCalledWith(mocks.prisma, 1, 'commits')
  })

  it('message is trimmed and clamped to 500 chars', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.sheetCommit.create.mockResolvedValueOnce({
      id: 1,
      message: 'a'.repeat(500),
      content: '# Hi',
      contentFormat: 'markdown',
      checksum: 'CHECKSUM_X',
      author: { id: 1, username: 'o' },
      createdAt: new Date(),
      parentId: null,
    })
    await request(app)
      .post('/api/sheets/10/lab/commits')
      .send({ message: 'a'.repeat(2000) })
    const args = mocks.prisma.sheetCommit.create.mock.calls[0][0]
    expect(args.data.message.length).toBeLessThanOrEqual(500)
  })
})
