import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const adminRoutePath = require.resolve('../src/routes/admin')

const mocks = vi.hoisted(() => {
  const state = { role: 'student', twoFaEnabled: true }
  const prisma = {
    user: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    studySheet: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    comment: {
      count: vi.fn(),
    },
    requestedCourse: {
      count: vi.fn(),
    },
    note: {
      count: vi.fn(),
    },
    userFollow: {
      count: vi.fn(),
    },
    reaction: {
      count: vi.fn(),
    },
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'studyhub_owner', role: state.role }
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    deleteUserAccount: vi.fn(),
    htmlSecurity: {
      validateHtmlForSubmission: vi.fn(() => ({ ok: true, issues: [] })),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/deleteUserAccount'), { deleteUserAccount: mocks.deleteUserAccount }],
  [require.resolve('../src/lib/htmlSecurity'), mocks.htmlSecurity],
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

  delete require.cache[adminRoutePath]
  const adminRouterModule = require(adminRoutePath)
  const adminRouter = adminRouterModule.default || adminRouterModule

  app = express()
  app.use(express.json())
  app.use('/', adminRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[adminRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()

  mocks.state.role = 'student'
  mocks.state.twoFaEnabled = true
  mocks.prisma.user.findUnique.mockImplementation(async () => ({
    id: 42,
    role: mocks.state.role,
    twoFaEnabled: mocks.state.twoFaEnabled,
  }))
  mocks.prisma.user.count.mockResolvedValue(36)
  mocks.prisma.studySheet.count.mockResolvedValue(19)
  mocks.prisma.studySheet.aggregate.mockResolvedValue({ _sum: { stars: 78 } })
  mocks.prisma.comment.count.mockResolvedValue(14)
  mocks.prisma.requestedCourse.count.mockResolvedValue(4)
  mocks.prisma.note.count.mockResolvedValue(0)
  mocks.prisma.userFollow.count.mockResolvedValue(28)
  mocks.prisma.reaction.count.mockResolvedValue(4)
})

describe('admin routes', () => {
  it('returns a FORBIDDEN envelope for non-admin users', async () => {
    const response = await request(app).get('/stats')

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      error: 'Admin access required.',
      code: 'FORBIDDEN',
    })
    expect(mocks.prisma.user.count).not.toHaveBeenCalled()
  })

  it('still returns admin stats for authenticated admins', async () => {
    mocks.state.role = 'admin'

    const response = await request(app).get('/stats')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      totalUsers: 36,
      totalSheets: 19,
      totalComments: 14,
      flaggedRequests: 4,
      totalStars: 78,
      totalNotes: 0,
      totalFollows: 28,
      totalReactions: 4,
    })
    expect(mocks.sentry.captureError).not.toHaveBeenCalled()
  })
})
