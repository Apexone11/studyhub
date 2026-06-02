/**
 * courses.deep.test.js — Comprehensive coverage for /api/courses.
 *
 * Covers:
 *   - GET /schools (cached listing of all schools + courses)
 *   - GET /popular (popular courses ranked by published-sheet count)
 *   - GET /schools/suggest (suggest school by .edu email domain)
 *   - GET /recommendations (popular fallback + collaborative)
 *   - POST /request (RequestedCourse atomic increment)
 *   - GET /requested (admin-only)
 *
 * Plus CLAUDE.md A12 schoolId validation and graceful degradation on
 * Prisma failures.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const coursesRoutePath = require.resolve('../src/modules/courses')

const mocks = vi.hoisted(() => {
  const state = { userId: 42, username: 'test_user', role: 'student', email: 'me@umd.edu' }

  const prisma = {
    studySheet: { groupBy: vi.fn() },
    course: { findMany: vi.fn() },
    school: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    enrollment: { findMany: vi.fn(), groupBy: vi.fn() },
    requestedCourse: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = {
        userId: state.userId,
        username: state.username,
        role: state.role,
        email: state.email,
      }
      next()
    }),
    requireAdmin: vi.fn((req, res, next) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.', code: 'FORBIDDEN' })
      }
      next()
    }),
    sentry: { captureError: vi.fn() },
    email: {
      sendCourseRequestNotice: vi.fn().mockResolvedValue(true),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/middleware/requireAdmin'), mocks.requireAdmin],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/email/email'), mocks.email],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    // Stub express-rate-limit at the require level so route-level limiters
    // are no-ops in tests.
    if (requestId === 'express-rate-limit') {
      return () => (_req, _res, next) => next()
    }
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
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
  delete require.cache[coursesRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.role = 'student'
  mocks.state.email = 'me@umd.edu'
})

// ── 1) GET /schools — cached listing ──────────────────────────────────────
describe('GET /api/courses/schools', () => {
  it('returns all schools with attached courses', async () => {
    mocks.prisma.school.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'University of Maryland',
        short: 'UMD',
        city: 'College Park',
        state: 'MD',
        schoolType: 'university',
        logoUrl: null,
        courses: [{ id: 10, code: 'CMSC131', name: 'Intro CS', department: 'CS' }],
      },
    ])

    const res = await request(app).get('/api/courses/schools')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].courses).toHaveLength(1)
  })

  it('sets Cache-Control with max-age (600s — schools rarely change)', async () => {
    mocks.prisma.school.findMany.mockResolvedValue([])
    const res = await request(app).get('/api/courses/schools')
    expect(res.headers['cache-control']).toBeDefined()
    expect(res.headers['cache-control']).toMatch(/max-age=600/)
    // Must NOT be `public` (Cloudflare/Vary caveat documented in the source).
    expect(res.headers['cache-control']).toMatch(/private/)
  })

  it('returns 500 on Prisma failure', async () => {
    mocks.prisma.school.findMany.mockRejectedValue(new Error('DB down'))
    const res = await request(app).get('/api/courses/schools')
    expect(res.status).toBe(500)
  })
})

// ── 2) GET /popular — ranking by sheet count ──────────────────────────────
describe('GET /api/courses/popular', () => {
  it('ranks courses by published-sheet count and joins course metadata', async () => {
    mocks.prisma.studySheet.groupBy.mockResolvedValue([
      { courseId: 10, _count: { courseId: 5 } },
      { courseId: 20, _count: { courseId: 2 } },
    ])
    mocks.prisma.course.findMany.mockResolvedValue([
      {
        id: 10,
        code: 'CMSC131',
        name: 'Intro CS',
        school: { id: 1, name: 'UMD', short: 'UMD' },
      },
      {
        id: 20,
        code: 'MATH140',
        name: 'Calc 1',
        school: { id: 1, name: 'UMD', short: 'UMD' },
      },
    ])

    const res = await request(app).get('/api/courses/popular')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toMatchObject({ id: 10, sheetCount: 5 })
    expect(res.body[1].sheetCount).toBe(2)
  })

  it('filters out courses that no longer exist in DB', async () => {
    mocks.prisma.studySheet.groupBy.mockResolvedValue([
      { courseId: 10, _count: { courseId: 5 } },
      { courseId: 99, _count: { courseId: 2 } },
    ])
    mocks.prisma.course.findMany.mockResolvedValue([
      {
        id: 10,
        code: 'CMSC131',
        name: 'Intro CS',
        school: { id: 1, name: 'UMD', short: 'UMD' },
      },
    ])

    const res = await request(app).get('/api/courses/popular')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe(10)
  })
})

// ── 3) GET /schools/suggest — by .edu domain ──────────────────────────────
describe('GET /api/courses/schools/suggest', () => {
  it('returns the matching school for a .edu email', async () => {
    mocks.prisma.school.findFirst.mockResolvedValue({
      id: 1,
      name: 'University of Maryland',
      short: 'UMD',
    })

    const res = await request(app).get('/api/courses/schools/suggest')
    expect(res.status).toBe(200)
    expect(res.body.school).toMatchObject({ short: 'UMD' })

    const findCall = mocks.prisma.school.findFirst.mock.calls[0][0]
    expect(findCall.where.emailDomain).toBe('umd.edu')
  })

  it('returns { school: null } for a non-.edu email', async () => {
    mocks.state.email = 'me@gmail.com'
    const res = await request(app).get('/api/courses/schools/suggest')
    expect(res.status).toBe(200)
    expect(res.body.school).toBeNull()
    expect(mocks.prisma.school.findFirst).not.toHaveBeenCalled()
  })
})

// ── 4) POST /request — RequestedCourse atomic increment ───────────────────
describe('POST /api/courses/request', () => {
  it('increments existing RequestedCourse via update (NOT new row)', async () => {
    mocks.prisma.requestedCourse.findFirst.mockResolvedValue({
      id: 5,
      name: 'Advanced Underwater Basketweaving',
      count: 2,
      flagged: false,
      schoolId: 1,
    })
    mocks.prisma.requestedCourse.update.mockResolvedValue({
      id: 5,
      count: 3,
      flagged: true,
    })
    mocks.prisma.user.findUnique.mockResolvedValue({
      username: 'test_user',
      email: 'me@umd.edu',
    })

    const res = await request(app)
      .post('/api/courses/request')
      .send({ name: 'Advanced Underwater Basketweaving', schoolId: 1 })

    expect(res.status).toBe(201)
    expect(res.body.request.count).toBe(3)
    expect(res.body.request.flagged).toBe(true)
    // Critical: existing row → update, NOT create.
    expect(mocks.prisma.requestedCourse.update).toHaveBeenCalled()
    expect(mocks.prisma.requestedCourse.create).not.toHaveBeenCalled()
  })

  it('creates a new RequestedCourse when nothing matches', async () => {
    mocks.prisma.requestedCourse.findFirst.mockResolvedValue(null)
    mocks.prisma.requestedCourse.create.mockResolvedValue({
      id: 99,
      name: 'New Course',
      count: 1,
      flagged: false,
    })

    const res = await request(app).post('/api/courses/request').send({ name: 'New Course' })
    expect(res.status).toBe(201)
    expect(res.body.request.count).toBe(1)
  })

  it('rejects names < 2 characters', async () => {
    const res = await request(app).post('/api/courses/request').send({ name: 'A' })
    expect(res.status).toBe(400)
  })

  it('rejects names > 200 characters', async () => {
    const res = await request(app)
      .post('/api/courses/request')
      .send({ name: 'x'.repeat(201) })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/200/)
  })

  it('rejects non-integer schoolId (A12 — parseOptionalInteger guard)', async () => {
    const res = await request(app)
      .post('/api/courses/request')
      .send({ name: 'Some Course', schoolId: 'banana' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/integer/)
  })
})

// ── 5) GET /requested — admin only ────────────────────────────────────────
describe('GET /api/courses/requested', () => {
  it('blocks non-admin viewers with 403', async () => {
    mocks.state.role = 'student'
    const res = await request(app).get('/api/courses/requested')
    expect(res.status).toBe(403)
  })

  it('returns the full list for admins, sorted by flagged → count desc', async () => {
    mocks.state.role = 'admin'
    mocks.prisma.requestedCourse.findMany.mockResolvedValue([
      { id: 1, name: 'Flagged Hot', count: 10, flagged: true },
      { id: 2, name: 'Other', count: 1, flagged: false },
    ])

    const res = await request(app).get('/api/courses/requested')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.flagged).toBe(1)
    expect(res.body.courses).toHaveLength(2)
  })
})

// ── 6) GET /recommendations ───────────────────────────────────────────────
describe('GET /api/courses/recommendations', () => {
  it('returns popular courses when the user has no enrollments', async () => {
    mocks.prisma.enrollment.findMany.mockResolvedValueOnce([]) // myEnrollments
    mocks.prisma.enrollment.groupBy.mockResolvedValueOnce([
      { courseId: 1, _count: { courseId: 5 } },
    ])
    mocks.prisma.course.findMany.mockResolvedValue([
      { id: 1, code: 'CMSC131', name: 'Intro', school: null },
    ])

    const res = await request(app).get('/api/courses/recommendations')
    expect(res.status).toBe(200)
    expect(res.body.type).toBe('popular')
    expect(res.body.recommendations).toHaveLength(1)
  })

  it('returns collaborative results when similar users exist', async () => {
    mocks.prisma.enrollment.findMany
      .mockResolvedValueOnce([{ courseId: 10 }]) // myEnrollments
      .mockResolvedValueOnce([{ userId: 99 }]) // similarUsers
    mocks.prisma.enrollment.groupBy.mockResolvedValueOnce([
      { courseId: 20, _count: { courseId: 3 } },
    ])
    mocks.prisma.course.findMany.mockResolvedValue([
      { id: 20, code: 'CMSC132', name: 'OOP', school: null },
    ])

    const res = await request(app).get('/api/courses/recommendations')
    expect(res.status).toBe(200)
    expect(res.body.type).toBe('collaborative')
    expect(res.body.recommendations).toHaveLength(1)
    expect(res.body.recommendations[0].id).toBe(20)
  })

  it('returns type=none when no overlap is found', async () => {
    mocks.prisma.enrollment.findMany
      .mockResolvedValueOnce([{ courseId: 10 }])
      .mockResolvedValueOnce([]) // no similar users
    const res = await request(app).get('/api/courses/recommendations')
    expect(res.status).toBe(200)
    expect(res.body.type).toBe('none')
    expect(res.body.recommendations).toEqual([])
  })
})
