import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const barrelPath = require.resolve('../../src/modules/sheetLab')
const routesPath = require.resolve('../../src/modules/sheetLab/sheetLab.routes')
const commitsPath = require.resolve('../../src/modules/sheetLab/sheetLab.commits.controller')
const operationsPath = require.resolve('../../src/modules/sheetLab/sheetLab.operations.controller')
const lineagePath = require.resolve('../../src/modules/sheetLab/sheetLab.lineage.controller')
const constantsPath = require.resolve('../../src/modules/sheetLab/sheetLab.constants')

const mocks = vi.hoisted(() => {
  const state = {
    userId: 42,
    username: 'alice',
    role: 'student',
    authenticated: true,
  }

  const prisma = {
    studySheet: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    sheetCommit: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (ops) =>
      Promise.all(ops.map((op) => (typeof op === 'function' ? op() : op))),
    ),
  }

  const sentry = {
    captureError: vi.fn(),
  }

  const activityTracker = {
    trackActivity: vi.fn().mockResolvedValue(undefined),
  }

  const badges = {
    checkAndAwardBadges: vi.fn().mockResolvedValue(undefined),
    BADGE_CATALOG: {},
    seedBadgeCatalog: vi.fn(),
  }

  const accessControl = {
    assertOwnerOrAdmin: vi.fn(({ res, user, ownerId, message }) => {
      if (user?.role === 'admin') return true
      if (user && Number(user.userId) === Number(ownerId)) return true
      res.status(403).json({ error: message || 'Forbidden.' })
      return false
    }),
    isAdmin: (u) => u?.role === 'admin',
    isOwner: (u, id) => Boolean(u && Number(u.userId) === Number(id)),
    sendForbidden: (res, message) => res.status(403).json({ error: message }),
  }

  const requireAuth = vi.fn((req, res, next) => {
    if (!state.authenticated) {
      return res.status(401).json({ error: 'Unauthorized.' })
    }
    req.user = { userId: state.userId, username: state.username, role: state.role }
    next()
  })

  const optionalAuthFn = vi.fn((req, _res, next) => {
    if (state.authenticated) {
      req.user = { userId: state.userId, username: state.username, role: state.role }
    }
    next()
  })

  const passThrough = (_req, _res, next) => next()
  const rateLimiters = {
    readLimiter: passThrough,
    writeLimiter: passThrough,
    sheetDiffLimiter: passThrough,
    sheetReactLimiter: passThrough,
    sheetWriteLimiter: passThrough,
    sheetCommentLimiter: passThrough,
    sheetContributionLimiter: passThrough,
    sheetContributionReviewLimiter: passThrough,
    sheetAttachmentDownloadLimiter: passThrough,
    sheetLeaderboardLimiter: passThrough,
  }

  return {
    state,
    prisma,
    sentry,
    activityTracker,
    badges,
    accessControl,
    requireAuth,
    optionalAuthFn,
    rateLimiters,
  }
})

const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), mocks.prisma],
  [require.resolve('../../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../../src/lib/activityTracker'), mocks.activityTracker],
  [require.resolve('../../src/lib/badges'), mocks.badges],
  [require.resolve('../../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../../src/middleware/auth'), mocks.requireAuth],
  [require.resolve('../../src/core/auth/optionalAuth'), mocks.optionalAuthFn],
  [require.resolve('../../src/lib/rateLimiters'), mocks.rateLimiters],
])

const originalModuleLoad = Module._load

let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      const mocked = mockTargets.get(resolved)
      if (mocked) return mocked
    } catch {
      // fall through
    }
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[barrelPath]
  delete require.cache[routesPath]
  delete require.cache[commitsPath]
  delete require.cache[operationsPath]
  delete require.cache[lineagePath]
  delete require.cache[constantsPath]

  const router = require(barrelPath)
  app = express()
  app.use(express.json())
  app.use('/api/sheets', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[barrelPath]
  delete require.cache[routesPath]
  delete require.cache[commitsPath]
  delete require.cache[operationsPath]
  delete require.cache[lineagePath]
  delete require.cache[constantsPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.username = 'alice'
  mocks.state.role = 'student'
  mocks.state.authenticated = true

  // Reset $transaction default implementation (cleared by clearAllMocks).
  mocks.prisma.$transaction.mockImplementation(async (ops) =>
    Promise.all(ops.map((op) => (typeof op === 'function' ? op() : op))),
  )
})

/* ===================================================================== */
/* sheetLab.constants                                                     */
/* ===================================================================== */
describe('sheetLab.constants', () => {
  const constants = require(constantsPath)

  it('parsePositiveInt returns the integer for valid positive input', () => {
    expect(constants.parsePositiveInt('42', 0)).toBe(42)
    expect(constants.parsePositiveInt('1', 99)).toBe(1)
  })

  it('parsePositiveInt returns the fallback for zero, negatives, or junk', () => {
    expect(constants.parsePositiveInt('0', 7)).toBe(7)
    expect(constants.parsePositiveInt('-5', 7)).toBe(7)
    expect(constants.parsePositiveInt('abc', 7)).toBe(7)
    expect(constants.parsePositiveInt(undefined, 7)).toBe(7)
  })

  it('computeChecksum returns a 64-char hex sha256 for identical inputs', () => {
    const a = constants.computeChecksum('hello world')
    const b = constants.computeChecksum('hello world')
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
    expect(a).toMatch(/^[a-f0-9]+$/)
  })

  it('computeChecksum produces different hashes for different content', () => {
    expect(constants.computeChecksum('a')).not.toBe(constants.computeChecksum('b'))
  })

  it('computeChecksum handles null/undefined content safely', () => {
    expect(() => constants.computeChecksum(null)).not.toThrow()
    expect(() => constants.computeChecksum(undefined)).not.toThrow()
    // Hash of empty string.
    expect(constants.computeChecksum(null)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('canReadSheet returns true for any published sheet regardless of viewer', () => {
    const sheet = { status: 'published', userId: 99 }
    expect(constants.canReadSheet(sheet, null)).toBe(true)
    expect(constants.canReadSheet(sheet, { userId: 1, role: 'student' })).toBe(true)
  })

  it('canReadSheet restricts draft sheets to owner or admin', () => {
    const draft = { status: 'draft', userId: 99 }
    expect(constants.canReadSheet(draft, null)).toBe(false)
    expect(constants.canReadSheet(draft, { userId: 1, role: 'student' })).toBe(false)
    expect(constants.canReadSheet(draft, { userId: 99, role: 'student' })).toBe(true)
    expect(constants.canReadSheet(draft, { userId: 1, role: 'admin' })).toBe(true)
  })
})

/* ===================================================================== */
/* GET /api/sheets/:id/lab/commits                                        */
/* ===================================================================== */
describe('GET /api/sheets/:id/lab/commits', () => {
  it('returns 400 for an invalid sheet id', async () => {
    const res = await request(app).get('/api/sheets/not-a-number/lab/commits')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid/i)
  })

  it('returns 404 when the sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(null)

    const res = await request(app).get('/api/sheets/123/lab/commits')

    expect(res.status).toBe(404)
    expect(mocks.prisma.sheetCommit.findMany).not.toHaveBeenCalled()
  })

  it('returns 404 when the sheet is a draft owned by someone else', async () => {
    mocks.state.userId = 7
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      status: 'draft',
      userId: 99,
    })

    const res = await request(app).get('/api/sheets/123/lab/commits')

    expect(res.status).toBe(404)
  })

  it('returns paginated commits for a published sheet', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      status: 'published',
      userId: 99,
    })
    mocks.prisma.sheetCommit.findMany.mockResolvedValue([
      {
        id: 2,
        message: 'Second',
        kind: null,
        checksum: 'abc',
        contentFormat: 'markdown',
        parentId: 1,
        createdAt: new Date('2026-04-02T00:00:00Z'),
        author: { id: 42, username: 'alice', avatarUrl: null },
      },
      {
        id: 1,
        message: 'First',
        kind: null,
        checksum: 'def',
        contentFormat: 'markdown',
        parentId: null,
        createdAt: new Date('2026-04-01T00:00:00Z'),
        author: { id: 42, username: 'alice', avatarUrl: null },
      },
    ])
    mocks.prisma.sheetCommit.count.mockResolvedValue(2)

    const res = await request(app).get('/api/sheets/123/lab/commits?page=1&limit=20')

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.commits).toHaveLength(2)
    expect(res.body.totalPages).toBe(1)
    expect(mocks.prisma.sheetCommit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sheetId: 123 },
        take: 20,
        skip: 0,
      }),
    )
  })
})

/* ===================================================================== */
/* POST /api/sheets/:id/lab/commits                                       */
/* ===================================================================== */
describe('POST /api/sheets/:id/lab/commits', () => {
  it('returns 401 when unauthenticated', async () => {
    mocks.state.authenticated = false

    const res = await request(app).post('/api/sheets/123/lab/commits').send({ message: 'x' })

    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid sheet id', async () => {
    const res = await request(app).post('/api/sheets/0/lab/commits').send({ message: 'x' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the sheet is missing', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(null)

    const res = await request(app).post('/api/sheets/123/lab/commits').send({ message: 'x' })

    expect(res.status).toBe(404)
  })

  it('returns 403 when the caller is not the owner or an admin', async () => {
    mocks.state.userId = 7
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      userId: 99,
      content: 'hello',
      contentFormat: 'markdown',
    })

    const res = await request(app).post('/api/sheets/123/lab/commits').send({ message: 'x' })

    expect(res.status).toBe(403)
    expect(mocks.prisma.sheetCommit.create).not.toHaveBeenCalled()
  })

  it('creates a commit for the owner and computes a checksum of the sheet content', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      userId: 42,
      content: 'hello world',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValue({ id: 7 })
    mocks.prisma.sheetCommit.create.mockResolvedValue({
      id: 8,
      message: 'My snapshot',
      content: 'hello world',
      contentFormat: 'markdown',
      checksum: 'deadbeef',
      parentId: 7,
      createdAt: new Date('2026-04-16T00:00:00Z'),
      author: { id: 42, username: 'alice', avatarUrl: null },
    })

    const res = await request(app)
      .post('/api/sheets/123/lab/commits')
      .send({ message: 'My snapshot' })

    expect(res.status).toBe(201)
    expect(res.body.commit).toMatchObject({
      id: 8,
      message: 'My snapshot',
      parentId: 7,
    })
    expect(mocks.prisma.sheetCommit.create).toHaveBeenCalledTimes(1)
    const createArg = mocks.prisma.sheetCommit.create.mock.calls[0][0]
    expect(createArg.data.sheetId).toBe(123)
    expect(createArg.data.userId).toBe(42)
    expect(createArg.data.parentId).toBe(7)
    expect(createArg.data.checksum).toHaveLength(64)
    expect(mocks.activityTracker.trackActivity).toHaveBeenCalledWith(mocks.prisma, 42, 'commits')
    expect(mocks.badges.checkAndAwardBadges).toHaveBeenCalledWith(mocks.prisma, 42)
  })

  it('defaults the commit message to "Snapshot" when none is provided', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      userId: 42,
      content: '',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValue(null)
    mocks.prisma.sheetCommit.create.mockResolvedValue({
      id: 1,
      message: 'Snapshot',
      content: '',
      contentFormat: 'markdown',
      checksum: 'x',
      parentId: null,
      createdAt: new Date(),
      author: { id: 42, username: 'alice', avatarUrl: null },
    })

    const res = await request(app).post('/api/sheets/123/lab/commits').send({})

    expect(res.status).toBe(201)
    const createArg = mocks.prisma.sheetCommit.create.mock.calls[0][0]
    expect(createArg.data.message).toBe('Snapshot')
    expect(createArg.data.parentId).toBeNull()
  })

  it('truncates long messages to 500 characters', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      userId: 42,
      content: '',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValue(null)
    mocks.prisma.sheetCommit.create.mockResolvedValue({
      id: 1,
      message: 'x'.repeat(500),
      content: '',
      contentFormat: 'markdown',
      checksum: 'x',
      parentId: null,
      createdAt: new Date(),
      author: { id: 42, username: 'alice', avatarUrl: null },
    })

    const res = await request(app)
      .post('/api/sheets/123/lab/commits')
      .send({ message: 'x'.repeat(5000) })

    expect(res.status).toBe(201)
    const createArg = mocks.prisma.sheetCommit.create.mock.calls[0][0]
    expect(createArg.data.message).toHaveLength(500)
  })
})

/* ===================================================================== */
/* POST /api/sheets/:id/lab/restore/:commitId                             */
/* ===================================================================== */
describe('POST /api/sheets/:id/lab/restore/:commitId', () => {
  it('returns 400 for an invalid sheet or commit id', async () => {
    const res = await request(app).post('/api/sheets/0/lab/restore/0')
    expect(res.status).toBe(400)
  })

  it('returns 403 when the caller is not the owner', async () => {
    mocks.state.userId = 7
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      title: 'T',
      userId: 99,
      content: 'current',
      contentFormat: 'markdown',
    })

    const res = await request(app).post('/api/sheets/123/lab/restore/5')

    expect(res.status).toBe(403)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('returns 404 when the target commit does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      title: 'T',
      userId: 42,
      content: 'current',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null)

    const res = await request(app).post('/api/sheets/123/lab/restore/5')

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/Commit not found/)
  })

  it('restores sheet content from the target commit and creates a restore commit', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      title: 'T',
      userId: 42,
      content: 'current',
      contentFormat: 'markdown',
    })
    // First findFirst = target commit lookup. Second = latest commit lookup.
    mocks.prisma.sheetCommit.findFirst
      .mockResolvedValueOnce({
        id: 5,
        content: 'restored content',
        contentFormat: 'markdown',
      })
      .mockResolvedValueOnce({ id: 9 })

    const createdCommit = {
      id: 10,
      message: 'Restored to commit #5',
      content: 'restored content',
      contentFormat: 'markdown',
      checksum: 'abc',
      parentId: 9,
      createdAt: new Date(),
      author: { id: 42, username: 'alice', avatarUrl: null },
    }
    const updatedSheet = {
      id: 123,
      title: 'T',
      content: 'restored content',
      contentFormat: 'markdown',
    }
    mocks.prisma.sheetCommit.create.mockResolvedValue(createdCommit)
    mocks.prisma.studySheet.update.mockResolvedValue(updatedSheet)
    mocks.prisma.$transaction.mockResolvedValue([createdCommit, updatedSheet])

    const res = await request(app).post('/api/sheets/123/lab/restore/5')

    expect(res.status).toBe(200)
    expect(res.body.commit).toMatchObject({ id: 10, message: 'Restored to commit #5' })
    expect(res.body.sheet).toMatchObject({ id: 123, content: 'restored content' })
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
  })
})

/* ===================================================================== */
/* POST /api/sheets/:id/lab/sync-upstream                                 */
/* ===================================================================== */
describe('POST /api/sheets/:id/lab/sync-upstream', () => {
  it('returns 400 when the sheet is not a fork', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      userId: 42,
      forkOf: null,
      content: 'x',
      contentFormat: 'markdown',
    })

    const res = await request(app).post('/api/sheets/123/lab/sync-upstream')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not a fork/)
  })

  it('returns 200 with synced=false when fork content equals original', async () => {
    // First findUnique = fork lookup; second = original lookup.
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce({
        id: 123,
        userId: 42,
        forkOf: 10,
        content: 'same',
        contentFormat: 'markdown',
      })
      .mockResolvedValueOnce({
        id: 10,
        title: 'Original',
        content: 'same',
        contentFormat: 'markdown',
      })

    const res = await request(app).post('/api/sheets/123/lab/sync-upstream')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ synced: false })
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('creates a merge commit and updates fork content when upstream differs', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce({
        id: 123,
        userId: 42,
        forkOf: 10,
        content: 'old',
        contentFormat: 'markdown',
      })
      .mockResolvedValueOnce({
        id: 10,
        title: 'Upstream',
        content: 'new',
        contentFormat: 'markdown',
      })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValue({ id: 4 })

    const newCommit = {
      id: 5,
      message: 'Synced from "Upstream"',
      kind: 'merge',
      checksum: 'x',
      parentId: 4,
      createdAt: new Date(),
      author: { id: 42, username: 'alice', avatarUrl: null },
    }
    mocks.prisma.sheetCommit.create.mockResolvedValue(newCommit)
    mocks.prisma.studySheet.update.mockResolvedValue({})
    mocks.prisma.$transaction.mockResolvedValue([newCommit, {}])

    const res = await request(app).post('/api/sheets/123/lab/sync-upstream')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ synced: true, commit: { id: 5, kind: 'merge' } })
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
  })
})

/* ===================================================================== */
/* GET /api/sheets/:id/lab/uncommitted-diff                               */
/* ===================================================================== */
describe('GET /api/sheets/:id/lab/uncommitted-diff', () => {
  it('returns hasChanges=false when content matches the latest commit', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      userId: 42,
      content: 'same',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValue({
      id: 1,
      content: 'same',
      message: 'initial',
      createdAt: new Date(),
    })

    const res = await request(app).get('/api/sheets/123/lab/uncommitted-diff')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ hasChanges: false })
  })

  it('returns a diff when content has diverged from the latest commit', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      userId: 42,
      content: 'line a\nline b\nline c',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValue({
      id: 1,
      content: 'line a\nline b',
      message: 'initial',
      createdAt: new Date(),
    })

    const res = await request(app).get('/api/sheets/123/lab/uncommitted-diff')

    expect(res.status).toBe(200)
    expect(res.body.hasChanges).toBe(true)
    expect(res.body.diff).toBeTruthy()
    expect(res.body.lastCommit).toMatchObject({ id: 1, message: 'initial' })
  })
})

/* ===================================================================== */
/* GET /api/sheets/:id/lab/lineage                                        */
/* ===================================================================== */
describe('GET /api/sheets/:id/lab/lineage', () => {
  it('returns 400 for an invalid sheet id', async () => {
    const res = await request(app).get('/api/sheets/abc/lab/lineage')
    expect(res.status).toBe(400)
  })

  it('returns a root-only tree when the sheet has no forks', async () => {
    const rootSheet = {
      id: 10,
      forkOf: null,
      rootSheetId: null,
      status: 'published',
      userId: 42,
    }
    const rootSelectResult = {
      id: 10,
      title: 'Root',
      status: 'published',
      forkOf: null,
      rootSheetId: null,
      stars: 5,
      forks: 0,
      updatedAt: new Date('2026-04-01T00:00:00Z'),
      createdAt: new Date('2026-03-01T00:00:00Z'),
      author: { id: 42, username: 'alice', avatarUrl: null },
    }
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce(rootSheet)
      .mockResolvedValueOnce(rootSelectResult)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])

    const res = await request(app).get('/api/sheets/10/lab/lineage')

    expect(res.status).toBe(200)
    expect(res.body.root).toMatchObject({ id: 10, title: 'Root', isCurrent: true })
    expect(res.body.root.children).toEqual([])
    expect(res.body.currentSheetId).toBe(10)
    expect(res.body.totalForks).toBe(0)
  })

  it('builds a parent-children tree including forks of the root', async () => {
    const currentSheet = {
      id: 20,
      forkOf: 10,
      rootSheetId: 10,
      status: 'published',
      userId: 42,
    }
    const rootSelectResult = {
      id: 10,
      title: 'Root',
      status: 'published',
      forkOf: null,
      rootSheetId: null,
      stars: 0,
      forks: 2,
      updatedAt: new Date(),
      createdAt: new Date(),
      author: { id: 99, username: 'bob', avatarUrl: null },
    }
    const forks = [
      {
        id: 20,
        title: 'Fork A',
        status: 'published',
        forkOf: 10,
        rootSheetId: 10,
        stars: 0,
        forks: 0,
        updatedAt: new Date(),
        createdAt: new Date(),
        author: { id: 42, username: 'alice', avatarUrl: null },
      },
      {
        id: 21,
        title: 'Fork B',
        status: 'published',
        forkOf: 10,
        rootSheetId: 10,
        stars: 0,
        forks: 0,
        updatedAt: new Date(),
        createdAt: new Date(),
        author: { id: 43, username: 'carol', avatarUrl: null },
      },
    ]
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce(currentSheet)
      .mockResolvedValueOnce(rootSelectResult)
    mocks.prisma.studySheet.findMany.mockResolvedValue(forks)

    const res = await request(app).get('/api/sheets/20/lab/lineage')

    expect(res.status).toBe(200)
    expect(res.body.root.id).toBe(10)
    expect(res.body.root.children).toHaveLength(2)
    const childIds = res.body.root.children.map((c) => c.id).sort()
    expect(childIds).toEqual([20, 21])
    expect(res.body.currentSheetId).toBe(20)
    expect(res.body.totalForks).toBe(2)
    const current = res.body.root.children.find((c) => c.id === 20)
    expect(current.isCurrent).toBe(true)
  })
})

/* ===================================================================== */
/* GET /api/sheets/:id/lab/compare-upstream                               */
/* ===================================================================== */
describe('GET /api/sheets/:id/lab/compare-upstream', () => {
  it('returns 400 when the sheet is not a fork', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 123,
      userId: 42,
      status: 'published',
      forkOf: null,
      content: 'x',
    })

    const res = await request(app).get('/api/sheets/123/lab/compare-upstream')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not a fork/)
  })

  it('returns identical=true when fork matches upstream exactly', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce({
        id: 123,
        userId: 42,
        status: 'published',
        forkOf: 10,
        content: 'same',
      })
      .mockResolvedValueOnce({
        id: 10,
        title: 'Upstream',
        content: 'same',
      })

    const res = await request(app).get('/api/sheets/123/lab/compare-upstream')

    expect(res.status).toBe(200)
    expect(res.body.identical).toBe(true)
    expect(res.body.diff).toBeNull()
    expect(res.body.upstream).toMatchObject({ id: 10, title: 'Upstream' })
  })

  it('returns a diff + summary when fork diverges from upstream', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce({
        id: 123,
        userId: 42,
        status: 'published',
        forkOf: 10,
        content: 'alpha\nbeta',
      })
      .mockResolvedValueOnce({
        id: 10,
        title: 'Upstream',
        content: 'alpha',
      })

    const res = await request(app).get('/api/sheets/123/lab/compare-upstream')

    expect(res.status).toBe(200)
    expect(res.body.identical).toBe(false)
    expect(res.body.diff).toBeTruthy()
    expect(typeof res.body.summary).toBe('string')
  })
})
