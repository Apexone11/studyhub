import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const sheetsReadRoutePath = require.resolve('../src/modules/sheets/sheets.read.controller')

const mocks = vi.hoisted(() => ({
  prisma: {
    studySheet: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    reaction: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    comment: {
      count: vi.fn(),
    },
    starredSheet: {
      findUnique: vi.fn(),
    },
    sheetContribution: {
      findMany: vi.fn(),
    },
    sheetCommit: {
      findFirst: vi.fn(),
    },
  },
  sentry: {
    captureError: vi.fn(),
  },
  optionalAuth: vi.fn((req, _res, next) => next()),
  service: {
    canReadSheet: vi.fn(() => true),
  },
  serializer: {
    serializeSheet: vi.fn((sheet) => sheet),
    fetchContributionCollections: vi.fn().mockResolvedValue({}),
  },
  timing: {
    timedSection: vi.fn(async (_name, fn) => ({ data: await fn() })),
    logTiming: vi.fn(),
  },
  rateLimiters: {
    sheetReadmeLimiter: (_req, _res, next) => next(),
  },
}))

const mockTargets = new Map([
  [require.resolve('../src/core/db/prisma'), mocks.prisma],
  [require.resolve('../src/core/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/core/auth/optionalAuth'), mocks.optionalAuth],
  [require.resolve('../src/modules/sheets/sheets.service'), mocks.service],
  [require.resolve('../src/modules/sheets/sheets.serializer'), mocks.serializer],
  [require.resolve('../src/lib/requestTiming'), mocks.timing],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
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

  delete require.cache[sheetsReadRoutePath]
  const routerModule = require(sheetsReadRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/api/sheets', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[sheetsReadRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()

  mocks.prisma.studySheet.findUnique.mockImplementation(async (args) => {
    if (args?.select) {
      expect(args.select.visibility).toBeUndefined()
    }

    return {
      id: 20,
      userId: 7,
      status: 'published',
      courseId: 11,
      author: { id: 7, username: 'owner', avatarUrl: null },
    }
  })
  mocks.prisma.sheetContribution.findMany.mockResolvedValue([])
  mocks.prisma.sheetCommit.findFirst.mockResolvedValue(null)
  mocks.prisma.studySheet.count.mockResolvedValue(2)
  mocks.prisma.reaction.count.mockResolvedValue(0)
  mocks.prisma.comment.count.mockResolvedValue(0)
  mocks.prisma.starredSheet.findUnique.mockResolvedValue(null)
  mocks.prisma.reaction.findUnique.mockResolvedValue(null)
})

describe('GET /api/sheets/:id/readme', () => {
  it('does not request a nonexistent visibility field from StudySheet', async () => {
    const response = await request(app).get('/api/sheets/20/readme')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      contributors: [{ id: 7, username: 'owner', avatarUrl: null }],
      latestCommit: null,
      forkCount: 2,
    })
  })
})