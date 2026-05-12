/**
 * Deep test coverage — SheetLab restore + diff endpoints.
 *
 * POST /api/sheets/:id/lab/restore/:commitId         — owner-only restore
 * GET  /api/sheets/:id/lab/restore-preview/:commitId — owner-only preview
 * GET  /api/sheets/:id/lab/diff/:cidA/:cidB          — read-gated diff
 * POST /api/sheets/:id/lab/sync-upstream             — fork-only sync
 * GET  /api/sheets/:id/lab/compare-upstream          — fork diff vs upstream
 * GET  /api/sheets/:id/lab/uncommitted-diff          — owner-only working diff
 * GET  /api/sheets/:id/lab/auto-summary              — owner-only summary
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/sheetLab/sheetLab.operations.controller')

const mocks = vi.hoisted(() => {
  const state = { user: { userId: 1, username: 'owner', role: 'student' } }
  const prisma = {
    studySheet: { findUnique: vi.fn(), update: vi.fn() },
    sheetCommit: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn((calls) => Promise.all(calls)),
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
    diff: {
      computeLineDiff: vi.fn(() => ({ hunks: [{ id: 'h1' }] })),
      addWordSegments: vi.fn(),
      generateChangeSummary: vi.fn(() => 'small change'),
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
      computeChecksum: vi.fn(() => 'CHECKSUM_NEW'),
    },
    sheetsConstants: { diffLimiter: (_req, _res, next) => next() },
    applyContentUpdate: {
      withPreviewText: vi.fn((content) => ({
        content,
        previewText: String(content).slice(0, 100),
      })),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/diff'), mocks.diff],
  [require.resolve('../src/modules/sheetLab/sheetLab.constants'), mocks.sheetLabConstants],
  [require.resolve('../src/modules/sheets/sheets.constants'), mocks.sheetsConstants],
  [require.resolve('../src/lib/sheets/applyContentUpdate'), mocks.applyContentUpdate],
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
  mocks.prisma.sheetCommit.findFirst.mockReset()
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
  mocks.sheetLabConstants.computeChecksum.mockReturnValue('CHECKSUM_NEW')
  mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ res, user, ownerId }) => {
    if (user?.role === 'admin' || user?.userId === ownerId) return true
    res.status(403).json({ error: 'Forbidden' })
    return false
  })
  mocks.diff.computeLineDiff.mockReturnValue({ hunks: [{ id: 'h1' }] })
  mocks.diff.generateChangeSummary.mockReturnValue('small change')
  mocks.prisma.$transaction.mockImplementation((calls) => Promise.all(calls))
})

function pubSheet(overrides = {}) {
  return {
    id: 10,
    userId: 1,
    status: 'published',
    content: '# Current',
    contentFormat: 'markdown',
    forkOf: null,
    ...overrides,
  }
}

// ── POST /:id/lab/restore/:commitId ──────────────────────────────
describe('POST /api/sheets/:id/lab/restore/:commitId', () => {
  it('restores + creates a new commit chained to the previous latest', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      title: 'Sheet',
      userId: 1,
      content: '# Current',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst
      .mockResolvedValueOnce({
        id: 5,
        content: '# Old',
        contentFormat: 'markdown',
      }) // target commit
      .mockResolvedValueOnce({ id: 8 }) // latest commit (parentId source)
    mocks.prisma.$transaction.mockImplementationOnce(async () => [
      {
        id: 9,
        message: 'Restored to commit #5',
        kind: 'restore',
        content: '# Old',
        contentFormat: 'markdown',
        checksum: 'CHECKSUM_NEW',
        author: { id: 1, username: 'o' },
        createdAt: new Date(),
        parentId: 8,
      },
      {
        id: 10,
        title: 'Sheet',
        content: '# Old',
        contentFormat: 'markdown',
      },
    ])
    const res = await request(app).post('/api/sheets/10/lab/restore/5')
    expect(res.status).toBe(200)
    // The route response shape includes id, message, content, parentId etc.
    // (kind is set in the DB row but not echoed; see operations.controller).
    expect(res.body.commit.parentId).toBe(8)
    expect(res.body.commit.message).toMatch(/Restored to commit/)
    expect(res.body.sheet.content).toBe('# Old')
  })

  it('non-owner cannot restore (403)', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      content: '# x',
      contentFormat: 'markdown',
    })
    const res = await request(app).post('/api/sheets/10/lab/restore/5')
    expect(res.status).toBe(403)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('admin can restore any sheet', async () => {
    mocks.state.user = { userId: 999, username: 'admin', role: 'admin' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      content: '# x',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst
      .mockResolvedValueOnce({ id: 5, content: '# Old', contentFormat: 'markdown' })
      .mockResolvedValueOnce(null)
    mocks.prisma.$transaction.mockImplementationOnce(async () => [
      {
        id: 9,
        message: 'Restored to commit #5',
        kind: 'restore',
        content: '# Old',
        contentFormat: 'markdown',
        checksum: 'CHECKSUM_NEW',
        author: { id: 999, username: 'admin' },
        createdAt: new Date(),
        parentId: null,
      },
      { id: 10, title: 'Sheet', content: '# Old', contentFormat: 'markdown' },
    ])
    const res = await request(app).post('/api/sheets/10/lab/restore/5')
    expect(res.status).toBe(200)
  })

  it('A12: 400 on non-positive sheet id', async () => {
    const res = await request(app).post('/api/sheets/abc/lab/restore/5')
    expect(res.status).toBe(400)
  })

  it('A12: 400 on non-positive commit id', async () => {
    const res = await request(app).post('/api/sheets/10/lab/restore/abc')
    expect(res.status).toBe(400)
  })

  it('404 when sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/api/sheets/9999/lab/restore/5')
    expect(res.status).toBe(404)
  })

  it('404 when target commit not found on this sheet', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      content: '# x',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null) // target commit missing
    const res = await request(app).post('/api/sheets/10/lab/restore/5')
    expect(res.status).toBe(404)
  })

  it('401 when unauthenticated', async () => {
    mocks.state.user = null
    const res = await request(app).post('/api/sheets/10/lab/restore/5')
    expect(res.status).toBe(401)
  })
})

// ── GET /:id/lab/restore-preview/:commitId ───────────────────────
describe('GET /api/sheets/:id/lab/restore-preview/:commitId', () => {
  it('returns diff between current and target commit (owner only)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      content: '# Now',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce({
      id: 5,
      content: '# Old',
      message: 'snap',
      createdAt: new Date(),
    })
    const res = await request(app).get('/api/sheets/10/lab/restore-preview/5')
    expect(res.status).toBe(200)
    expect(res.body.diff.hunks).toBeTruthy()
    expect(res.body.commit.id).toBe(5)
  })

  it('non-owner gets 403', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      content: '# x',
      contentFormat: 'markdown',
    })
    const res = await request(app).get('/api/sheets/10/lab/restore-preview/5')
    expect(res.status).toBe(403)
  })

  it('404 when target commit missing', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      content: '# x',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/sheets/10/lab/restore-preview/5')
    expect(res.status).toBe(404)
  })

  it('A12: 400 on non-positive ids', async () => {
    const res = await request(app).get('/api/sheets/abc/lab/restore-preview/5')
    expect(res.status).toBe(400)
  })
})

// ── GET /:id/lab/diff/:cidA/:cidB ────────────────────────────────
describe('GET /api/sheets/:id/lab/diff/:cidA/:cidB', () => {
  it('returns diff between two commits (200)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findFirst
      .mockResolvedValueOnce({ id: 1, content: '# A' })
      .mockResolvedValueOnce({ id: 2, content: '# B' })
    const res = await request(app).get('/api/sheets/10/lab/diff/1/2')
    expect(res.status).toBe(200)
    expect(res.body.diff.hunks).toBeTruthy()
  })

  it('404 when one commit not found', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.sheetCommit.findFirst
      .mockResolvedValueOnce({ id: 1, content: '# A' })
      .mockResolvedValueOnce(null)
    const res = await request(app).get('/api/sheets/10/lab/diff/1/2')
    expect(res.status).toBe(404)
  })

  it('404 when caller cannot read sheet (draft, non-owner)', async () => {
    mocks.state.user = { userId: 999, username: 'stranger', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet({ status: 'draft' }))
    const res = await request(app).get('/api/sheets/10/lab/diff/1/2')
    expect(res.status).toBe(404)
  })

  it('A12: 400 when any id is non-positive', async () => {
    const res = await request(app).get('/api/sheets/10/lab/diff/abc/2')
    expect(res.status).toBe(400)
  })
})

// ── POST /:id/lab/sync-upstream ──────────────────────────────────
describe('POST /api/sheets/:id/lab/sync-upstream', () => {
  it('400 when sheet is not a fork', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet({ forkOf: null }))
    const res = await request(app).post('/api/sheets/10/lab/sync-upstream')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not a fork/i)
  })

  it('200 + synced=false when content is already identical', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce({
        id: 11,
        userId: 1,
        forkOf: 10,
        content: '# X',
        contentFormat: 'markdown',
      })
      .mockResolvedValueOnce({ id: 10, title: 'Up', content: '# X', contentFormat: 'markdown' })
    const res = await request(app).post('/api/sheets/11/lab/sync-upstream')
    expect(res.status).toBe(200)
    expect(res.body.synced).toBe(false)
  })

  it('403 when caller is not fork owner', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 11,
      userId: 1,
      forkOf: 10,
      content: '# X',
      contentFormat: 'markdown',
    })
    const res = await request(app).post('/api/sheets/11/lab/sync-upstream')
    expect(res.status).toBe(403)
  })

  it('404 when upstream/original was deleted', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce({
        id: 11,
        userId: 1,
        forkOf: 10,
        content: '# X',
        contentFormat: 'markdown',
      })
      .mockResolvedValueOnce(null)
    const res = await request(app).post('/api/sheets/11/lab/sync-upstream')
    expect(res.status).toBe(404)
  })
})

// ── GET /:id/lab/compare-upstream ────────────────────────────────
describe('GET /api/sheets/:id/lab/compare-upstream', () => {
  it('200 + identical=true when fork == upstream', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce({ id: 11, userId: 1, status: 'published', forkOf: 10, content: '# X' })
      .mockResolvedValueOnce({ id: 10, title: 'Up', content: '# X' })
    const res = await request(app).get('/api/sheets/11/lab/compare-upstream')
    expect(res.status).toBe(200)
    expect(res.body.identical).toBe(true)
  })

  it('200 + diff when fork differs from upstream', async () => {
    mocks.prisma.studySheet.findUnique
      .mockResolvedValueOnce({ id: 11, userId: 1, status: 'published', forkOf: 10, content: '# A' })
      .mockResolvedValueOnce({ id: 10, title: 'Up', content: '# B' })
    const res = await request(app).get('/api/sheets/11/lab/compare-upstream')
    expect(res.status).toBe(200)
    expect(res.body.identical).toBe(false)
    expect(res.body.diff.hunks).toBeTruthy()
  })

  it('400 when sheet is not a fork', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet({ forkOf: null }))
    const res = await request(app).get('/api/sheets/10/lab/compare-upstream')
    expect(res.status).toBe(400)
  })
})

// ── GET /:id/lab/uncommitted-diff ────────────────────────────────
describe('GET /api/sheets/:id/lab/uncommitted-diff', () => {
  it('returns hasChanges=true + diff when working content differs from last commit', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      content: '# Now',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce({
      id: 5,
      content: '# Old',
      message: 'snap',
      createdAt: new Date(),
    })
    const res = await request(app).get('/api/sheets/10/lab/uncommitted-diff')
    expect(res.status).toBe(200)
    expect(res.body.hasChanges).toBe(true)
    expect(res.body.lastCommit.id).toBe(5)
  })

  it('hasChanges=false when no diff', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      content: '# Same',
      contentFormat: 'markdown',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce({
      id: 5,
      content: '# Same',
      message: 'snap',
      createdAt: new Date(),
    })
    const res = await request(app).get('/api/sheets/10/lab/uncommitted-diff')
    expect(res.status).toBe(200)
    expect(res.body.hasChanges).toBe(false)
  })

  it('403 when caller is not owner', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      content: '# Now',
      contentFormat: 'markdown',
    })
    const res = await request(app).get('/api/sheets/10/lab/uncommitted-diff')
    expect(res.status).toBe(403)
  })
})

// ── GET /:id/lab/auto-summary ────────────────────────────────────
describe('GET /api/sheets/:id/lab/auto-summary', () => {
  it('returns summary (owner only)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      content: '# Now',
    })
    mocks.prisma.sheetCommit.findFirst.mockResolvedValueOnce({ content: '# Old' })
    const res = await request(app).get('/api/sheets/10/lab/auto-summary')
    expect(res.status).toBe(200)
    expect(res.body.summary).toBe('small change')
  })

  it('403 when not owner', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      content: '# Now',
    })
    const res = await request(app).get('/api/sheets/10/lab/auto-summary')
    expect(res.status).toBe(403)
  })

  it('404 when sheet missing', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/sheets/9999/lab/auto-summary')
    expect(res.status).toBe(404)
  })
})
