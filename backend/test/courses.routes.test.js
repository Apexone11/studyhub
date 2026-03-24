import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const coursesRoutePath = require.resolve('../src/modules/courses')

const mocks = vi.hoisted(() => {
  const prisma = {
    studySheet: {
      groupBy: vi.fn(),
    },
    course: {
      findMany: vi.fn(),
    },
    school: {
      findMany: vi.fn(),
    },
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
])

const originalModuleLoad = Module._load

let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    // Stub rate limiter
    if (requestId === 'express-rate-limit') {
      return () => (_req, _res, next) => next()
    }

    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[coursesRoutePath]
  const coursesModule = require(coursesRoutePath)
  const coursesRouter = coursesModule.default || coursesModule

  app = express()
  app.use(express.json())
  app.use('/api/courses', coursesRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/courses/popular', () => {
  it('returns 200 with popular courses ranked by sheet count', async () => {
    mocks.prisma.studySheet.groupBy.mockResolvedValue([
      { courseId: 10, _count: { _all: 5 } },
      { courseId: 20, _count: { _all: 3 } },
    ])
    mocks.prisma.course.findMany.mockResolvedValue([
      { id: 10, code: 'CMSC131', name: 'Intro CS', school: { id: 1, name: 'UMD', short: 'UMD' } },
      { id: 20, code: 'MATH140', name: 'Calculus I', school: { id: 1, name: 'UMD', short: 'UMD' } },
    ])

    const res = await request(app).get('/api/courses/popular')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toEqual({
      id: 10,
      code: 'CMSC131',
      name: 'Intro CS',
      school: { id: 1, name: 'UMD', short: 'UMD' },
      sheetCount: 5,
    })
    expect(res.body[1].sheetCount).toBe(3)

    // Verify the where clause excludes null courseIds
    const groupByCall = mocks.prisma.studySheet.groupBy.mock.calls[0][0]
    expect(groupByCall.where.courseId).toEqual({ not: null })
  })

  it('returns empty array when no published sheets exist', async () => {
    mocks.prisma.studySheet.groupBy.mockResolvedValue([])

    const res = await request(app).get('/api/courses/popular')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
    // Should not query courses if no groups
    expect(mocks.prisma.course.findMany).not.toHaveBeenCalled()
  })

  it('filters out courses that no longer exist in DB', async () => {
    mocks.prisma.studySheet.groupBy.mockResolvedValue([
      { courseId: 10, _count: { _all: 5 } },
      { courseId: 99, _count: { _all: 2 } },
    ])
    mocks.prisma.course.findMany.mockResolvedValue([
      { id: 10, code: 'CMSC131', name: 'Intro CS', school: { id: 1, name: 'UMD', short: 'UMD' } },
    ])

    const res = await request(app).get('/api/courses/popular')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe(10)
  })

  it('returns 500 on Prisma failure', async () => {
    mocks.prisma.studySheet.groupBy.mockRejectedValue(new Error('DB down'))

    const res = await request(app).get('/api/courses/popular')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Server error.')
  })
})
