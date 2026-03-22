import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const dashboardRoutePath = require.resolve('../src/modules/dashboard')

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    starredSheet: {
      count: vi.fn(),
    },
    studySheet: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    feedPost: {
      count: vi.fn(),
    },
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, role: 'student' }
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
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[dashboardRoutePath]
  const dashboardRouterModule = require(dashboardRoutePath)
  const dashboardRouter = dashboardRouterModule.default || dashboardRouterModule

  app = express()
  app.use(express.json())
  app.use('/', dashboardRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[dashboardRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()

  mocks.prisma.user.findUnique.mockResolvedValue({
    id: 42,
    username: 'beta_student1',
    role: 'student',
    createdAt: new Date('2026-03-10T12:00:00.000Z'),
    avatarUrl: null,
    email: 'beta_student1@studyhub.test',
    emailVerified: true,
    _count: {
      enrollments: 1,
      studySheets: 2,
    },
    enrollments: [
      {
        courseId: 88,
        course: {
          id: 88,
          code: 'CMSC131',
          name: 'Intro to Programming',
          school: {
            id: 9,
            name: 'University Test',
            short: 'UT',
          },
        },
      },
    ],
  })
  mocks.prisma.starredSheet.count.mockResolvedValue(3)
  mocks.prisma.studySheet.count.mockResolvedValue(0)
  mocks.prisma.feedPost.count.mockResolvedValue(0)
  mocks.prisma.studySheet.findMany.mockResolvedValue([
    {
      id: 900,
      title: 'Pointers Review',
      stars: 5,
      author: { id: 7, username: 'author1' },
      course: {
        id: 88,
        code: 'CMSC131',
        name: 'Intro to Programming',
        school: { id: 9, name: 'University Test', short: 'UT' },
      },
    },
  ])
})

describe('dashboard routes', () => {
  it('returns summary data and uses a stable enrollment order supported by Prisma', async () => {
    const response = await request(app).get('/summary')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      hero: {
        username: 'beta_student1',
        emailVerified: true,
      },
      stats: {
        courseCount: 1,
        sheetCount: 2,
        starCount: 3,
      },
      courses: [
        expect.objectContaining({
          code: 'CMSC131',
        }),
      ],
      recentSheets: [
        expect.objectContaining({
          id: 900,
          title: 'Pointers Review',
        }),
      ],
    })

    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 42 },
      select: expect.objectContaining({
        enrollments: expect.objectContaining({
          orderBy: { id: 'asc' },
        }),
      }),
    }))
    expect(mocks.sentry.captureError).not.toHaveBeenCalled()
  })
})
