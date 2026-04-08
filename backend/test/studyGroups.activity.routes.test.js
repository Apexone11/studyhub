import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const studyGroupsActivityRoutePath = require.resolve('../src/modules/studyGroups/studyGroups.activity.routes')

const mocks = vi.hoisted(() => ({
  prisma: {
    groupDiscussionPost: {
      findMany: vi.fn(),
    },
    groupResource: {
      findMany: vi.fn(),
    },
    studyGroupMember: {
      findMany: vi.fn(),
    },
    groupSession: {
      findMany: vi.fn(),
    },
  },
  auth: vi.fn((req, _res, next) => {
    req.user = { userId: 42, username: 'group_member', role: 'student' }
    next()
  }),
  sentry: {
    captureError: vi.fn(),
  },
  rateLimiters: {
    readLimiter: (_req, _res, next) => next(),
  },
  helpers: {
    parseId: vi.fn((value) => Number.parseInt(value, 10)),
    requireGroupMember: vi.fn().mockResolvedValue({ groupId: 1, userId: 42, status: 'active' }),
  },
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/modules/studyGroups/studyGroups.helpers'), mocks.helpers],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[studyGroupsActivityRoutePath]
  const routerModule = require(studyGroupsActivityRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/:id/activity', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[studyGroupsActivityRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.helpers.requireGroupMember.mockResolvedValue({ groupId: 1, userId: 42, status: 'active' })
  mocks.prisma.groupDiscussionPost.findMany.mockResolvedValue([
    {
      id: 10,
      title: 'Exam prep thread',
      type: 'question',
      createdAt: new Date('2026-04-08T10:00:00.000Z'),
      author: { id: 7, username: 'alice', avatarUrl: null },
    },
  ])
  mocks.prisma.groupResource.findMany.mockResolvedValue([
    {
      id: 20,
      title: 'Formula sheet',
      resourceType: 'sheet',
      createdAt: new Date('2026-04-08T09:00:00.000Z'),
      user: { id: 8, username: 'bob', avatarUrl: null },
    },
  ])
  mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])
  mocks.prisma.groupSession.findMany.mockResolvedValue([])
})

describe('GET /:id/activity', () => {
  it('uses GroupResource.resourceType instead of a nonexistent type field', async () => {
    const response = await request(app).get('/1/activity')

    expect(response.status).toBe(200)
    expect(mocks.prisma.groupResource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          resourceType: true,
        }),
      })
    )
    expect(response.body.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource',
          subType: 'sheet',
          title: 'Formula sheet',
        }),
      ])
    )
  })
})