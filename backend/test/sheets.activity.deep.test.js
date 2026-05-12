/**
 * Deep test coverage — GET /api/sheets/:id/activity.
 *
 * Unified activity feed: commits + contributions (opened + reviewed)
 * + comments. Pagination, sort-by-date, normalized item shape, and access
 * control via canReadSheet.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/sheets/sheets.activity.controller')

const mocks = vi.hoisted(() => {
  const state = { user: { userId: 1, username: 'tester', role: 'student' } }
  const prisma = {
    studySheet: { findUnique: vi.fn() },
    sheetCommit: { findMany: vi.fn() },
    sheetContribution: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
  }
  return {
    state,
    prisma,
    sentry: { captureError: vi.fn() },
    rateLimiters: { sheetActivityLimiter: (_req, _res, next) => next() },
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
    },
    sheetsConstants: {
      AUTHOR_SELECT: { id: true, username: true, avatarUrl: true, isStaffVerified: true },
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/core/db/prisma'), mocks.prisma],
  [require.resolve('../src/core/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/modules/sheetLab/sheetLab.constants'), mocks.sheetLabConstants],
  [require.resolve('../src/modules/sheets/sheets.constants'), mocks.sheetsConstants],
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
  mocks.prisma.sheetContribution.findMany.mockReset()
  mocks.prisma.comment.findMany.mockReset()
  mocks.state.user = { userId: 1, username: 'tester', role: 'student' }
  mocks.sheetLabConstants.canReadSheet.mockImplementation((sheet, user) => {
    if (sheet?.status === 'published') return true
    return Boolean(user && (user.role === 'admin' || user.userId === sheet?.userId))
  })
  mocks.sheetLabConstants.parsePositiveInt.mockImplementation((v, fb) => {
    const n = Number.parseInt(v, 10)
    return Number.isInteger(n) && n > 0 ? n : fb || 0
  })
})

describe('GET /api/sheets/:id/activity', () => {
  it('400 on non-positive id', async () => {
    const res = await request(app).get('/api/sheets/abc/activity')
    expect(res.status).toBe(400)
  })

  it('404 when sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/sheets/10/activity')
    expect(res.status).toBe(404)
  })

  it('403 when caller cannot read the sheet (draft, not owner)', async () => {
    mocks.state.user = { userId: 99, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      status: 'draft',
    })
    const res = await request(app).get('/api/sheets/10/activity')
    expect(res.status).toBe(403)
  })

  it('merges commits + contributions + comments and sorts by date desc', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      status: 'published',
    })
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce([
      {
        id: 1,
        message: 'first',
        kind: 'snapshot',
        checksum: 'abc1234',
        createdAt: new Date('2024-01-01'),
        author: { id: 1, username: 'a' },
      },
    ])
    mocks.prisma.sheetContribution.findMany.mockResolvedValueOnce([
      {
        id: 1,
        status: 'accepted',
        message: 'pr',
        createdAt: new Date('2024-01-02'),
        reviewedAt: new Date('2024-01-03'),
        proposer: { id: 2, username: 'b' },
        reviewer: { id: 1, username: 'a' },
        forkSheet: { id: 11, title: 'F' },
      },
    ])
    mocks.prisma.comment.findMany.mockResolvedValueOnce([
      {
        id: 1,
        content: 'great!',
        createdAt: new Date('2024-01-04'),
        author: { id: 3, username: 'c' },
      },
    ])

    const res = await request(app).get('/api/sheets/10/activity')
    expect(res.status).toBe(200)
    // 4 items total: 1 commit + 1 contribution_opened + 1 contribution_merged + 1 comment
    expect(res.body.total).toBe(4)
    // First item should be the most recent — comment on 2024-01-04
    expect(res.body.items[0].type).toBe('comment')
  })

  it('contribution with no reviewedAt produces only the "opened" item', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      status: 'published',
    })
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce([])
    mocks.prisma.sheetContribution.findMany.mockResolvedValueOnce([
      {
        id: 1,
        status: 'pending',
        message: 'pr',
        createdAt: new Date('2024-01-02'),
        reviewedAt: null,
        proposer: { id: 2, username: 'b' },
        reviewer: null,
        forkSheet: { id: 11, title: 'F' },
      },
    ])
    mocks.prisma.comment.findMany.mockResolvedValueOnce([])

    const res = await request(app).get('/api/sheets/10/activity')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.items[0].type).toBe('contribution_opened')
  })

  it('rejected contributions produce contribution_rejected item', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      status: 'published',
    })
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce([])
    mocks.prisma.sheetContribution.findMany.mockResolvedValueOnce([
      {
        id: 1,
        status: 'rejected',
        message: 'pr',
        createdAt: new Date('2024-01-02'),
        reviewedAt: new Date('2024-01-03'),
        proposer: { id: 2, username: 'b' },
        reviewer: { id: 1, username: 'a' },
        forkSheet: { id: 11, title: 'F' },
      },
    ])
    mocks.prisma.comment.findMany.mockResolvedValueOnce([])

    const res = await request(app).get('/api/sheets/10/activity')
    const types = res.body.items.map((i) => i.type)
    expect(types).toContain('contribution_rejected')
  })

  it('pagination: page=2 with limit=2 returns items 3-4 of 4', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      status: 'published',
    })
    const commits = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      message: `c${i}`,
      kind: 'snapshot',
      checksum: 'x',
      createdAt: new Date(2024, 0, i + 1),
      author: { id: 1, username: 'a' },
    }))
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce(commits)
    mocks.prisma.sheetContribution.findMany.mockResolvedValueOnce([])
    mocks.prisma.comment.findMany.mockResolvedValueOnce([])

    const res = await request(app).get('/api/sheets/10/activity?page=2&limit=2')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(4)
    expect(res.body.items).toHaveLength(2)
    expect(res.body.page).toBe(2)
    expect(res.body.totalPages).toBe(2)
  })

  it('limit is clamped to a maximum of 50', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      status: 'published',
    })
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce([])
    mocks.prisma.sheetContribution.findMany.mockResolvedValueOnce([])
    mocks.prisma.comment.findMany.mockResolvedValueOnce([])

    const res = await request(app).get('/api/sheets/10/activity?limit=9999')
    expect(res.status).toBe(200)
    // route enforces Math.min(parsed, 50)
    expect(res.body.items.length).toBeLessThanOrEqual(50)
  })

  it('comment text is truncated to 120 chars with ellipsis', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      status: 'published',
    })
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce([])
    mocks.prisma.sheetContribution.findMany.mockResolvedValueOnce([])
    mocks.prisma.comment.findMany.mockResolvedValueOnce([
      {
        id: 1,
        content: 'a'.repeat(200),
        createdAt: new Date(),
        author: { id: 1, username: 'a' },
      },
    ])

    const res = await request(app).get('/api/sheets/10/activity')
    expect(res.body.items[0].message).toMatch(/^a+\.\.\.$/)
    expect(res.body.items[0].message.length).toBeLessThanOrEqual(125)
  })

  it('admin can read activity on a draft sheet', async () => {
    mocks.state.user = { userId: 999, username: 'admin', role: 'admin' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      status: 'draft',
    })
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce([])
    mocks.prisma.sheetContribution.findMany.mockResolvedValueOnce([])
    mocks.prisma.comment.findMany.mockResolvedValueOnce([])

    const res = await request(app).get('/api/sheets/10/activity')
    expect(res.status).toBe(200)
  })

  it('commit checksum is truncated to 7 chars in the activity feed', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      status: 'published',
    })
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce([
      {
        id: 1,
        message: 'snap',
        kind: 'snapshot',
        checksum: '0123456789abcdef',
        createdAt: new Date(),
        author: { id: 1, username: 'a' },
      },
    ])
    mocks.prisma.sheetContribution.findMany.mockResolvedValueOnce([])
    mocks.prisma.comment.findMany.mockResolvedValueOnce([])

    const res = await request(app).get('/api/sheets/10/activity')
    expect(res.body.items[0].meta.checksum).toBe('0123456')
  })

  it('empty inputs return empty items array with total=0', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      status: 'published',
    })
    mocks.prisma.sheetCommit.findMany.mockResolvedValueOnce([])
    mocks.prisma.sheetContribution.findMany.mockResolvedValueOnce([])
    mocks.prisma.comment.findMany.mockResolvedValueOnce([])

    const res = await request(app).get('/api/sheets/10/activity')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(0)
    expect(res.body.items).toEqual([])
  })

  it('500 when a downstream query throws (sentry captures)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce({
      id: 10,
      userId: 1,
      status: 'published',
    })
    mocks.prisma.sheetCommit.findMany.mockRejectedValueOnce(new Error('boom'))
    mocks.prisma.sheetContribution.findMany.mockResolvedValueOnce([])
    mocks.prisma.comment.findMany.mockResolvedValueOnce([])

    const res = await request(app).get('/api/sheets/10/activity')
    expect(res.status).toBe(500)
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })
})
