import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/sheets/sheets.contributors.controller')

const mocks = vi.hoisted(() => ({
  prisma: {
    studySheet: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    sheetCommit: {
      groupBy: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
  sentry: { captureError: vi.fn() },
  optionalAuth: vi.fn((req, _res, next) => {
    req.user = req.__mockUser || null
    next()
  }),
  service: {
    canReadSheet: vi.fn(),
  },
}))

const mockTargets = new Map([
  [require.resolve('../src/core/db/prisma'), mocks.prisma],
  [require.resolve('../src/core/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/core/auth/optionalAuth'), mocks.optionalAuth],
  [require.resolve('../src/modules/sheets/sheets.service'), mocks.service],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
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
  mocks.service.canReadSheet.mockReturnValue(true)
})

describe('GET /api/sheets/:id/contributors', () => {
  it('returns 400 for non-integer ids', async () => {
    const res = await request(app).get('/api/sheets/abc/contributors')
    expect(res.status).toBe(400)
  })

  it('returns 404 when the sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/sheets/10/contributors')
    expect(res.status).toBe(404)
  })

  it('returns 404 when the caller cannot read the sheet (draft/private)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      status: 'draft',
      rootSheetId: null,
      forkOf: null,
    })
    mocks.service.canReadSheet.mockReturnValue(false)

    const res = await request(app).get('/api/sheets/10/contributors')
    expect(res.status).toBe(404)
  })

  it('aggregates commits across the full lineage and returns ordered contributors', async () => {
    // Root sheet 10, with two forks (11 and 12). The caller is anonymous.
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 11,
      userId: 2,
      status: 'published',
      rootSheetId: 10,
      forkOf: 10,
    })
    mocks.prisma.studySheet.findMany.mockResolvedValue([
      { id: 10 },
      { id: 11 },
      { id: 12 },
    ])
    mocks.prisma.sheetCommit.groupBy.mockResolvedValue([
      { userId: 1, _count: { _all: 5 } },
      { userId: 2, _count: { _all: 3 } },
    ])
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: 1, username: 'alice', avatarUrl: null, isStaffVerified: false },
      { id: 2, username: 'bob', avatarUrl: null, isStaffVerified: false },
    ])

    const res = await request(app).get('/api/sheets/11/contributors')
    expect(res.status).toBe(200)
    expect(res.body.rootSheetId).toBe(10)
    expect(res.body.lineageSize).toBe(3)
    expect(res.body.contributors).toHaveLength(2)
    expect(res.body.contributors[0]).toEqual({
      user: { id: 1, username: 'alice', avatarUrl: null, isStaffVerified: false },
      commits: 5,
    })

    // Verify the Prisma 6 array-form NOT clause is used.
    const groupByCall = mocks.prisma.sheetCommit.groupBy.mock.calls[0][0]
    expect(groupByCall.where.NOT).toEqual([{ kind: 'fork_base' }])
    expect(groupByCall.where.sheetId.in).toEqual([10, 11, 12])
  })

  it('drops grouped rows whose user record cannot be loaded', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      status: 'published',
      rootSheetId: null,
      forkOf: null,
    })
    mocks.prisma.studySheet.findMany.mockResolvedValue([{ id: 10 }])
    mocks.prisma.sheetCommit.groupBy.mockResolvedValue([
      { userId: 1, _count: { _all: 2 } },
      { userId: 999, _count: { _all: 1 } },
    ])
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: 1, username: 'alice', avatarUrl: null, isStaffVerified: false },
    ])

    const res = await request(app).get('/api/sheets/10/contributors')
    expect(res.status).toBe(200)
    expect(res.body.contributors).toHaveLength(1)
    expect(res.body.contributors[0].user.username).toBe('alice')
  })
})

describe('GET /api/sheets/:id/fork-tree', () => {
  it('returns 404 for unreadable sheets', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      status: 'draft',
      rootSheetId: null,
      forkOf: null,
    })
    mocks.service.canReadSheet.mockReturnValue(false)

    const res = await request(app).get('/api/sheets/10/fork-tree')
    expect(res.status).toBe(404)
  })

  it('returns an empty tree when no published sheets exist in the lineage', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      status: 'published',
      rootSheetId: null,
      forkOf: null,
    })
    mocks.prisma.studySheet.findMany.mockResolvedValue([])

    const res = await request(app).get('/api/sheets/10/fork-tree')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ root: null, count: 0 })
  })

  it('builds a nested tree with isCurrent set on the requested sheet', async () => {
    // Root 10 -> fork 11 -> fork 12
    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 12,
      userId: 3,
      status: 'published',
      rootSheetId: 10,
      forkOf: 11,
    })
    const author = { id: 1, username: 'alice', avatarUrl: null, isStaffVerified: false }
    mocks.prisma.studySheet.findMany.mockResolvedValue([
      {
        id: 10, title: 'Root', status: 'published', forkOf: null, rootSheetId: null,
        forks: 1, stars: 0, createdAt: new Date('2026-01-01'), author,
      },
      {
        id: 11, title: 'Fork 1', status: 'published', forkOf: 10, rootSheetId: 10,
        forks: 1, stars: 0, createdAt: new Date('2026-01-02'), author,
      },
      {
        id: 12, title: 'Fork 2', status: 'published', forkOf: 11, rootSheetId: 10,
        forks: 0, stars: 0, createdAt: new Date('2026-01-03'), author,
      },
    ])

    const res = await request(app).get('/api/sheets/12/fork-tree')
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(3)
    expect(res.body.root.id).toBe(10)
    expect(res.body.root.isCurrent).toBe(false)
    expect(res.body.root.children).toHaveLength(1)
    expect(res.body.root.children[0].id).toBe(11)
    expect(res.body.root.children[0].children[0].id).toBe(12)
    expect(res.body.root.children[0].children[0].isCurrent).toBe(true)
  })
})
