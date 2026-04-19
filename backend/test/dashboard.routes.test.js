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

    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        select: expect.objectContaining({
          enrollments: expect.objectContaining({
            orderBy: { id: 'asc' },
          }),
        }),
      }),
    )
    expect(mocks.sentry.captureError).not.toHaveBeenCalled()
  })
})

/**
 * Phase 1 of the v2 design refresh — Top Contributors widget contract.
 *
 * The `/api/dashboard/summary` endpoint is expected to return a
 * `topContributors` array (capped at 5) so the Phase 1 mini-widget on the
 * web + mobile dashboards can render without a second request.
 *
 * These tests are `.skip`'d until the backend field lands mid-Week 1;
 * they encode the contract the frontend (`DashboardPage.jsx` and
 * `TopContributors.jsx`) is already consuming.
 *
 * See:
 *   - docs/internal/design-refresh-v2-master-plan.md (Phase 1)
 *   - docs/internal/design-refresh-v2-roles-integration.md
 *   - frontend/studyhub-app/src/components/TopContributors.jsx
 */
describe.skip('dashboard summary — topContributors (Phase 1, pending backend)', () => {
  it('returns topContributors as an array of at most 5 entries', async () => {
    const response = await request(app).get('/summary')
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.topContributors)).toBe(true)
    expect(response.body.topContributors.length).toBeLessThanOrEqual(5)
  })

  it('each contributor entry exposes username + avatarUrl + contributionCount', async () => {
    const response = await request(app).get('/summary')
    for (const entry of response.body.topContributors) {
      expect(entry).toMatchObject({
        username: expect.any(String),
        contributionCount: expect.any(Number),
      })
      // avatarUrl is nullable but the key must be present so the avatar
      // fallback logic on the frontend stays deterministic.
      expect(entry).toHaveProperty('avatarUrl')
    }
  })

  it('students + teachers get course-scoped contributors (contextLabel carries a course code)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce({
      id: 42,
      username: 'beta_student1',
      role: 'student',
      accountType: 'student',
      createdAt: new Date('2026-03-10T12:00:00.000Z'),
      avatarUrl: null,
      email: 'beta_student1@studyhub.test',
      emailVerified: true,
      _count: { enrollments: 1, studySheets: 2 },
      enrollments: [
        {
          courseId: 88,
          course: {
            id: 88,
            code: 'CMSC131',
            name: 'Intro to Programming',
            school: { id: 9, name: 'University Test', short: 'UT' },
          },
        },
      ],
    })

    const response = await request(app).get('/summary')
    for (const entry of response.body.topContributors) {
      if (entry.contextLabel) {
        expect(typeof entry.contextLabel).toBe('string')
      }
    }
  })

  it('Self-learners (accountType=other) get follow-scoped contributors (no course contextLabel required)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce({
      id: 42,
      username: 'beta_self_learner',
      role: 'student',
      accountType: 'other',
      createdAt: new Date('2026-03-10T12:00:00.000Z'),
      avatarUrl: null,
      email: 'sl@studyhub.test',
      emailVerified: true,
      _count: { enrollments: 0, studySheets: 0 },
      enrollments: [],
    })

    const response = await request(app).get('/summary')
    expect(Array.isArray(response.body.topContributors)).toBe(true)
  })

  it('returns an empty topContributors array for brand-new users with no network', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([])
    const response = await request(app).get('/summary')
    expect(Array.isArray(response.body.topContributors)).toBe(true)
    // No assertions on count here — the endpoint may still return community
    // contributors for self-learners. The contract we enforce is that the
    // key exists and is an array.
  })
})
