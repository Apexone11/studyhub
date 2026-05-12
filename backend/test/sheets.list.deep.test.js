/**
 * Deep test coverage — GET /api/sheets list endpoint.
 *
 * Covers pagination, search, school/course filtering, mine/starred views,
 * sort, status filter, previewText shape, limit clamping, block-filter
 * applicability, and the FTS opt-in path. Mocks Prisma, sheetSearch,
 * fullTextSearch, and the serializer. Auth is toggled per-test.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/sheets/sheets.list.controller')

const mocks = vi.hoisted(() => ({
  prisma: {
    studySheet: { findMany: vi.fn(), count: vi.fn() },
    starredSheet: { findMany: vi.fn(), count: vi.fn() },
    comment: { groupBy: vi.fn() },
    user: { findMany: vi.fn() },
  },
  sentry: { captureError: vi.fn() },
  optionalAuth: vi.fn((req, _res, next) => {
    if (req.headers['x-test-user']) {
      try {
        req.user = JSON.parse(req.headers['x-test-user'])
      } catch {
        /* ignore */
      }
    }
    next()
  }),
  sheetSearch: {
    buildSheetTextSearchClauses: vi.fn((q) =>
      q && String(q).trim() ? [{ title: { contains: q } }] : [],
    ),
  },
  fullTextSearch: { searchSheetsFTS: vi.fn() },
  cache: { cache: { get: vi.fn(() => null), set: vi.fn() } },
  validate: {
    parsePositiveInt: vi.fn((v, fallback) => {
      const n = Number.parseInt(v, 10)
      return Number.isInteger(n) && n > 0 ? n : fallback
    }),
  },
  // Use a serializer that echoes minimal shape — the route under test attaches
  // commentCount/starred via opts.
  serializer: {
    serializeSheet: vi.fn((sheet, opts = {}) => ({
      id: sheet.id,
      title: sheet.title,
      previewText: sheet.previewText || '',
      status: sheet.status,
      stars: sheet.stars || 0,
      forks: sheet.forks || 0,
      downloads: sheet.downloads || 0,
      createdAt: sheet.createdAt,
      starred: Boolean(opts.starred),
      commentCount: opts.commentCount || 0,
    })),
    fetchContributionCollections: vi.fn().mockResolvedValue({}),
    tierToPreviewMode: vi.fn(() => 'interactive'),
  },
  constants: {
    SHEET_STATUS: {
      DRAFT: 'draft',
      PENDING_REVIEW: 'pending_review',
      PUBLISHED: 'published',
      REJECTED: 'rejected',
      QUARANTINED: 'quarantined',
    },
    AUTHOR_SELECT: { id: true, username: true, avatarUrl: true, isStaffVerified: true },
    leaderboardLimiter: (_req, _res, next) => next(),
  },
}))

const mockTargets = new Map([
  [require.resolve('../src/core/db/prisma'), mocks.prisma],
  [require.resolve('../src/core/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/core/auth/optionalAuth'), mocks.optionalAuth],
  [require.resolve('../src/core/http/validate'), mocks.validate],
  [require.resolve('../src/modules/sheets/sheets.constants'), mocks.constants],
  [require.resolve('../src/modules/sheets/sheets.serializer'), mocks.serializer],
  [require.resolve('../src/lib/sheetSearch'), mocks.sheetSearch],
  [require.resolve('../src/lib/fullTextSearch'), mocks.fullTextSearch],
  [require.resolve('../src/lib/cache'), mocks.cache],
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
  mocks.prisma.studySheet.findMany.mockResolvedValue([])
  mocks.prisma.studySheet.count.mockResolvedValue(0)
  mocks.prisma.starredSheet.findMany.mockResolvedValue([])
  mocks.prisma.starredSheet.count.mockResolvedValue(0)
  mocks.prisma.comment.groupBy.mockResolvedValue([])
})

function authHeader(user = { userId: 1, username: 'tester', role: 'student' }) {
  return { 'x-test-user': JSON.stringify(user) }
}

describe('GET /api/sheets — list', () => {
  it('returns a paginated envelope { sheets, total, limit, offset } with defaults', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([
      { id: 1, title: 'A', status: 'published', stars: 0, createdAt: new Date() },
    ])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(1)

    const res = await request(app).get('/api/sheets')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      sheets: expect.any(Array),
      total: 1,
      limit: 20,
      offset: 0,
    })
  })

  it('clamps non-integer limit/offset to defaults and zero, respectively', async () => {
    const res = await request(app).get('/api/sheets?limit=abc&offset=xyz')
    expect(res.status).toBe(200)
    expect(res.body.limit).toBe(20)
    expect(res.body.offset).toBe(0)
  })

  it('honors explicit limit/offset', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    const res = await request(app).get('/api/sheets?limit=5&offset=10')
    expect(res.status).toBe(200)
    expect(res.body.limit).toBe(5)
    expect(res.body.offset).toBe(10)
    // Verify the underlying call honored skip
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.take).toBe(5)
    expect(args.skip).toBe(10)
  })

  it('passes the search query into buildSheetTextSearchClauses and applies its OR clause', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    await request(app).get('/api/sheets?search=calculus')
    expect(mocks.sheetSearch.buildSheetTextSearchClauses).toHaveBeenCalledWith('calculus')
    const callArgs = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(callArgs.where.OR).toEqual(expect.arrayContaining([{ title: { contains: 'calculus' } }]))
  })

  it('filters by courseId when provided', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    await request(app).get('/api/sheets?courseId=42')
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.where.courseId).toBe(42)
  })

  it('filters by schoolId via nested course.schoolId', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    await request(app).get('/api/sheets?schoolId=7')
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.where.course).toEqual({ schoolId: 7 })
  })

  it('mine=1 without auth → 401', async () => {
    const res = await request(app).get('/api/sheets?mine=1')
    expect(res.status).toBe(401)
  })

  it('mine=1 with auth → scopes to req.user.userId and accepts a valid status filter', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    await request(app)
      .get('/api/sheets?mine=1&status=draft')
      .set(authHeader({ userId: 42, username: 'me', role: 'student' }))
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.where.userId).toBe(42)
    expect(args.where.status).toBe('draft')
  })

  it('mine=1 ignores unknown status values (no SQL injection / no echo into where)', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    await request(app)
      .get('/api/sheets?mine=1&status=hack')
      .set(authHeader({ userId: 42, username: 'me', role: 'student' }))
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    // Unknown status is dropped — only userId is present, no `status` clause.
    expect(args.where.status).toBeUndefined()
  })

  it('default (no mine flag) restricts to status=published', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    await request(app).get('/api/sheets')
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.where.status).toBe('published')
  })

  it('starred=1 without auth → 401', async () => {
    const res = await request(app).get('/api/sheets?starred=1')
    expect(res.status).toBe(401)
  })

  it('starred=1 with auth returns starred sheets only', async () => {
    mocks.prisma.starredSheet.findMany.mockResolvedValueOnce([{ sheetId: 5 }, { sheetId: 7 }])
    mocks.prisma.starredSheet.count.mockResolvedValueOnce(2)
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([
      { id: 5, title: 'Five', status: 'published', stars: 1, createdAt: new Date() },
      { id: 7, title: 'Seven', status: 'published', stars: 2, createdAt: new Date() },
    ])
    const res = await request(app)
      .get('/api/sheets?starred=1')
      .set(authHeader({ userId: 1, username: 'me', role: 'student' }))
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.sheets).toHaveLength(2)
  })

  it('sort=stars maps to orderBy { stars: desc }', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    await request(app).get('/api/sheets?sort=stars')
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.orderBy).toEqual({ stars: 'desc' })
  })

  it('unknown sort value silently falls back to createdAt (no 400)', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    const res = await request(app).get('/api/sheets?sort=NOTREAL')
    expect(res.status).toBe(200)
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
  })

  it('recommended sort enters the composite-score branch (no DB sort by stars)', async () => {
    const now = Date.now()
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([
      {
        id: 1,
        title: 'old',
        stars: 10,
        forks: 0,
        downloads: 0,
        createdAt: new Date(now - 30 * 86400000),
      },
      { id: 2, title: 'new', stars: 50, forks: 0, downloads: 0, createdAt: new Date(now) },
    ])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(2)
    const res = await request(app).get('/api/sheets?sort=recommended')
    expect(res.status).toBe(200)
    // Sort-by-stars sheet (id=2 with 50 stars) wins over older id=1 with 10 stars.
    expect(res.body.sheets[0].id).toBe(2)
  })

  it('format=html applies contentFormat="html" filter', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    await request(app).get('/api/sheets?format=html')
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.where.contentFormat).toBe('html')
  })

  it('format=pdf applies attachmentType contains pdf filter', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    await request(app).get('/api/sheets?format=pdf')
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.where.attachmentType).toEqual({ contains: 'pdf', mode: 'insensitive' })
  })

  it('fts=true with search ≥2 chars routes through searchSheetsFTS', async () => {
    mocks.fullTextSearch.searchSheetsFTS.mockResolvedValueOnce({
      sheets: [{ id: 99 }],
      total: 1,
    })
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([
      { id: 99, title: 'FTS hit', status: 'published', stars: 0, createdAt: new Date() },
    ])
    const res = await request(app).get('/api/sheets?fts=true&search=foo')
    expect(res.status).toBe(200)
    expect(mocks.fullTextSearch.searchSheetsFTS).toHaveBeenCalled()
    expect(res.body.fts).toBe(true)
  })

  it('fts=true with short search (<2 chars) does NOT call FTS — falls back to where-search', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    const res = await request(app).get('/api/sheets?fts=true&search=a')
    expect(res.status).toBe(200)
    expect(mocks.fullTextSearch.searchSheetsFTS).not.toHaveBeenCalled()
  })

  it('returns 500 on unexpected Prisma failures (caught by captureError)', async () => {
    mocks.prisma.studySheet.findMany.mockRejectedValueOnce(new Error('boom'))
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    const res = await request(app).get('/api/sheets')
    expect(res.status).toBe(500)
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })

  it('serializer is called with starred flag and commentCount', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([
      { id: 1, title: 'A', status: 'published', stars: 0, createdAt: new Date() },
    ])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(1)
    mocks.prisma.comment.groupBy.mockResolvedValueOnce([{ sheetId: 1, _count: { _all: 3 } }])
    const res = await request(app).get('/api/sheets')
    expect(res.status).toBe(200)
    // Serializer invoked with opts including commentCount.
    expect(mocks.serializer.serializeSheet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ commentCount: 3 }),
    )
  })

  it('previewText flows through the serializer output', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([
      {
        id: 1,
        title: 'A',
        status: 'published',
        stars: 0,
        createdAt: new Date(),
        previewText: 'Preview blurb here',
      },
    ])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(1)
    const res = await request(app).get('/api/sheets')
    expect(res.body.sheets[0].previewText).toBe('Preview blurb here')
  })

  it('empty result returns an empty array and total=0 (no crash)', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    const res = await request(app).get('/api/sheets?search=zzznomatch')
    expect(res.status).toBe(200)
    expect(res.body.sheets).toEqual([])
    expect(res.body.total).toBe(0)
  })
})
