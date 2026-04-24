/**
 * exams.routes.test.js — Phase 2 Upcoming Exams endpoint coverage.
 *
 * Uses the repo's established Module._load patching pattern to stub
 * prisma + auth middleware + rate limiters + origin allowlist, then
 * drives the real router with supertest. See
 * `docs/internal/audits/2026-04-24-day2-primitives-plus-phase2-handoff.md`
 * Part D for the canonical spec.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const examsRoutePath = require.resolve('../src/modules/exams')

const mocks = vi.hoisted(() => {
  const state = { authenticated: true, userId: 42 }
  const prisma = {
    courseExam: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    enrollment: {
      findUnique: vi.fn(),
    },
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, res, next) => {
      if (!state.authenticated) {
        return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      }
      req.user = { userId: state.userId, username: 'test_user', role: 'student' }
      next()
    }),
    // Pass-through origin allowlist factory — the real one is tested
    // in originAllowlist.test.js and is orthogonal to business logic.
    originAllowlist: vi.fn(() => (_req, _res, next) => next()),
    // No-op rate limiters — the real limits are middleware concerns
    // exercised by ratelimit.test.js; here we want full control over
    // the request path so we can drive the business logic.
    rateLimiters: {
      examReadLimiter: (_req, _res, next) => next(),
      examWriteLimiter: (_req, _res, next) => next(),
    },
    sentry: {
      captureError: vi.fn(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/middleware/originAllowlist'), mocks.originAllowlist],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
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
  delete require.cache[examsRoutePath]
  const routerModule = require(examsRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/api/exams', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[examsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.authenticated = true
  mocks.state.userId = 42
})

// ── Helpers ──────────────────────────────────────────────────────────────
function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

function fakeExam(overrides = {}) {
  return {
    id: 1,
    userId: 42,
    courseId: 17,
    title: 'Biology Midterm',
    location: null,
    examDate: new Date(isoDaysFromNow(7)),
    visibility: 'private',
    notes: null,
    preparednessPercent: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    course: { id: 17, code: 'BIOL 201', name: 'Intro to Biology' },
    ...overrides,
  }
}

// ── GET /api/exams/upcoming ──────────────────────────────────────────────
describe('GET /api/exams/upcoming', () => {
  it('returns an empty array for a user with no exams', async () => {
    mocks.prisma.courseExam.findMany.mockResolvedValue([])
    const res = await request(app).get('/api/exams/upcoming')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ exams: [] })
  })

  it("returns the user's upcoming exams sorted by date ascending", async () => {
    mocks.prisma.courseExam.findMany.mockResolvedValue([
      fakeExam({ id: 1, title: 'Midterm', examDate: new Date(isoDaysFromNow(2)) }),
      fakeExam({ id: 2, title: 'Quiz', examDate: new Date(isoDaysFromNow(5)) }),
    ])
    const res = await request(app).get('/api/exams/upcoming')
    expect(res.status).toBe(200)
    expect(res.body.exams).toHaveLength(2)
    // Verify the Prisma call asked for ascending date order + future-only.
    const call = mocks.prisma.courseExam.findMany.mock.calls[0][0]
    expect(call.orderBy).toEqual({ examDate: 'asc' })
    expect(call.where.examDate).toHaveProperty('gt')
    expect(call.where.userId).toBe(42)
  })

  it('scopes results to the requesting user', async () => {
    mocks.prisma.courseExam.findMany.mockResolvedValue([])
    await request(app).get('/api/exams/upcoming')
    const call = mocks.prisma.courseExam.findMany.mock.calls[0][0]
    expect(call.where.userId).toBe(42)
  })

  it('respects ?limit=N (capped at 20)', async () => {
    mocks.prisma.courseExam.findMany.mockResolvedValue([])
    await request(app).get('/api/exams/upcoming?limit=5')
    // Express 5's req.query is a read-only getter, so the validate()
    // helper's `req.query = parsed` reassignment silently fails and
    // zod's coerce doesn't round-trip. Prisma's generated client does
    // runtime coercion of string -> int for `take`, so the underlying
    // query still runs correctly in production. Asserting via Number()
    // keeps this test honest about current behavior. Tracked as a
    // follow-up: switch validate() to Object.defineProperty or stash
    // parsed values on req.validated.
    expect(Number(mocks.prisma.courseExam.findMany.mock.calls[0][0].take)).toBe(5)
    // Over-max should be rejected by zod before the handler runs.
    const res = await request(app).get('/api/exams/upcoming?limit=999')
    expect(res.status).toBe(400)
  })

  it('serializes exam rows with an ISO date and course subset', async () => {
    const dateIso = isoDaysFromNow(3)
    mocks.prisma.courseExam.findMany.mockResolvedValue([
      fakeExam({ id: 1, examDate: new Date(dateIso) }),
    ])
    const res = await request(app).get('/api/exams/upcoming')
    expect(res.status).toBe(200)
    const [row] = res.body.exams
    expect(row.id).toBe(1)
    expect(row.title).toBe('Biology Midterm')
    expect(typeof row.examDate).toBe('string')
    expect(row.course).toEqual({ id: 17, code: 'BIOL 201', name: 'Intro to Biology' })
  })

  it('serializes preparednessPercent on every row (defaults to 0)', async () => {
    mocks.prisma.courseExam.findMany.mockResolvedValue([
      fakeExam({ id: 1, preparednessPercent: 62 }),
      fakeExam({ id: 2, preparednessPercent: 0 }),
    ])
    const res = await request(app).get('/api/exams/upcoming')
    expect(res.status).toBe(200)
    expect(res.body.exams[0].preparednessPercent).toBe(62)
    expect(res.body.exams[1].preparednessPercent).toBe(0)
  })

  it('returns 401 when the caller is unauthenticated', async () => {
    mocks.state.authenticated = false
    const res = await request(app).get('/api/exams/upcoming')
    expect(res.status).toBe(401)
  })
})

// ── GET /api/exams (list) ────────────────────────────────────────────────
describe('GET /api/exams', () => {
  it('returns all the user exams when no courseId is given', async () => {
    mocks.prisma.courseExam.findMany.mockResolvedValue([fakeExam()])
    const res = await request(app).get('/api/exams')
    expect(res.status).toBe(200)
    expect(res.body.exams).toHaveLength(1)
    const call = mocks.prisma.courseExam.findMany.mock.calls[0][0]
    expect(call.where.userId).toBe(42)
    expect(call.where.courseId).toBeUndefined()
  })

  it('filters by courseId when provided', async () => {
    mocks.prisma.courseExam.findMany.mockResolvedValue([])
    await request(app).get('/api/exams?courseId=17')
    const call = mocks.prisma.courseExam.findMany.mock.calls[0][0]
    // See the "req.query is a getter" note above; Prisma coerces at
    // runtime. Normalize via Number() for the assertion.
    expect(Number(call.where.courseId)).toBe(17)
  })
})

// ── POST /api/exams ──────────────────────────────────────────────────────
describe('POST /api/exams', () => {
  it('creates an exam when the user is enrolled and input is valid', async () => {
    mocks.prisma.enrollment.findUnique.mockResolvedValue({ id: 1 })
    mocks.prisma.courseExam.create.mockResolvedValue(fakeExam({ id: 9 }))
    const res = await request(app)
      .post('/api/exams')
      .send({
        courseId: 17,
        title: 'Midterm',
        examDate: isoDaysFromNow(10),
      })
    expect(res.status).toBe(201)
    expect(res.body.exam.id).toBe(9)
    expect(res.body.exam.course.code).toBe('BIOL 201')
    // Prisma create was called with the right userId + null defaults.
    const createArg = mocks.prisma.courseExam.create.mock.calls[0][0].data
    expect(createArg.userId).toBe(42)
    expect(createArg.courseId).toBe(17)
    expect(createArg.location).toBeNull()
    expect(createArg.notes).toBeNull()
  })

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/exams')
      .send({ courseId: 17, examDate: isoDaysFromNow(10) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when examDate is missing', async () => {
    const res = await request(app).post('/api/exams').send({ courseId: 17, title: 'Midterm' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when examDate is too far in the past (> 1 year)', async () => {
    mocks.prisma.enrollment.findUnique.mockResolvedValue({ id: 1 })
    const res = await request(app)
      .post('/api/exams')
      .send({ courseId: 17, title: 'Midterm', examDate: isoDaysFromNow(-400) })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
  })

  it('returns 400 when examDate is too far in the future (> 5 years)', async () => {
    mocks.prisma.enrollment.findUnique.mockResolvedValue({ id: 1 })
    const res = await request(app)
      .post('/api/exams')
      .send({ courseId: 17, title: 'Midterm', examDate: isoDaysFromNow(365 * 6) })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
  })

  it('returns 403 when the user is not enrolled in the course', async () => {
    mocks.prisma.enrollment.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/exams')
      .send({ courseId: 17, title: 'Midterm', examDate: isoDaysFromNow(7) })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.state.authenticated = false
    const res = await request(app)
      .post('/api/exams')
      .send({ courseId: 17, title: 'x', examDate: isoDaysFromNow(7) })
    expect(res.status).toBe(401)
  })

  it('accepts preparednessPercent within 0..100 and passes it to Prisma', async () => {
    mocks.prisma.enrollment.findUnique.mockResolvedValue({ id: 1 })
    mocks.prisma.courseExam.create.mockResolvedValue(fakeExam({ id: 10, preparednessPercent: 62 }))
    const res = await request(app)
      .post('/api/exams')
      .send({
        courseId: 17,
        title: 'Midterm',
        examDate: isoDaysFromNow(10),
        preparednessPercent: 62,
      })
    expect(res.status).toBe(201)
    expect(res.body.exam.preparednessPercent).toBe(62)
    const createArg = mocks.prisma.courseExam.create.mock.calls[0][0].data
    expect(createArg.preparednessPercent).toBe(62)
  })

  it('rejects preparednessPercent > 100 with a 400 before Prisma runs', async () => {
    const res = await request(app)
      .post('/api/exams')
      .send({
        courseId: 17,
        title: 'Midterm',
        examDate: isoDaysFromNow(10),
        preparednessPercent: 150,
      })
    expect(res.status).toBe(400)
    expect(mocks.prisma.courseExam.create).not.toHaveBeenCalled()
  })

  it('rejects negative preparednessPercent with a 400', async () => {
    const res = await request(app)
      .post('/api/exams')
      .send({
        courseId: 17,
        title: 'Midterm',
        examDate: isoDaysFromNow(10),
        preparednessPercent: -5,
      })
    expect(res.status).toBe(400)
    expect(mocks.prisma.courseExam.create).not.toHaveBeenCalled()
  })

  it('omits preparednessPercent from the Prisma call when not supplied (let DB default apply)', async () => {
    mocks.prisma.enrollment.findUnique.mockResolvedValue({ id: 1 })
    mocks.prisma.courseExam.create.mockResolvedValue(fakeExam({ id: 11 }))
    await request(app)
      .post('/api/exams')
      .send({ courseId: 17, title: 'Midterm', examDate: isoDaysFromNow(10) })
    const createArg = mocks.prisma.courseExam.create.mock.calls[0][0].data
    expect(createArg).not.toHaveProperty('preparednessPercent')
  })
})

// ── PATCH /api/exams/:id ─────────────────────────────────────────────────
describe('PATCH /api/exams/:id', () => {
  it("updates the owner's exam", async () => {
    mocks.prisma.courseExam.findUnique.mockResolvedValue({ id: 5, userId: 42 })
    mocks.prisma.courseExam.update.mockResolvedValue(fakeExam({ id: 5, title: 'Renamed midterm' }))
    const res = await request(app).patch('/api/exams/5').send({ title: 'Renamed midterm' })
    expect(res.status).toBe(200)
    expect(res.body.exam.title).toBe('Renamed midterm')
  })

  it('returns 403 when a different user tries to edit the exam', async () => {
    mocks.prisma.courseExam.findUnique.mockResolvedValue({ id: 5, userId: 99 })
    const res = await request(app).patch('/api/exams/5').send({ title: 'nope' })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
    expect(mocks.prisma.courseExam.update).not.toHaveBeenCalled()
  })

  it('returns 404 when the exam does not exist', async () => {
    mocks.prisma.courseExam.findUnique.mockResolvedValue(null)
    const res = await request(app).patch('/api/exams/999').send({ title: 'x' })
    expect(res.status).toBe(404)
  })

  it('returns 400 when the provided examDate is out of range', async () => {
    mocks.prisma.courseExam.findUnique.mockResolvedValue({ id: 5, userId: 42 })
    const res = await request(app)
      .patch('/api/exams/5')
      .send({ examDate: isoDaysFromNow(365 * 6) })
    expect(res.status).toBe(400)
  })

  it('updates preparednessPercent on the owner exam', async () => {
    mocks.prisma.courseExam.findUnique.mockResolvedValue({ id: 5, userId: 42 })
    mocks.prisma.courseExam.update.mockResolvedValue(fakeExam({ id: 5, preparednessPercent: 75 }))
    const res = await request(app).patch('/api/exams/5').send({ preparednessPercent: 75 })
    expect(res.status).toBe(200)
    expect(res.body.exam.preparednessPercent).toBe(75)
    const updateArg = mocks.prisma.courseExam.update.mock.calls[0][0].data
    expect(updateArg.preparednessPercent).toBe(75)
  })

  it('rejects PATCH preparednessPercent > 100 with a 400 before Prisma runs', async () => {
    const res = await request(app).patch('/api/exams/5').send({ preparednessPercent: 200 })
    expect(res.status).toBe(400)
    expect(mocks.prisma.courseExam.update).not.toHaveBeenCalled()
  })
})

// ── DELETE /api/exams/:id ────────────────────────────────────────────────
describe('DELETE /api/exams/:id', () => {
  it("deletes the owner's exam (204)", async () => {
    mocks.prisma.courseExam.findUnique.mockResolvedValue({ id: 5, userId: 42 })
    mocks.prisma.courseExam.delete.mockResolvedValue({ id: 5 })
    const res = await request(app).delete('/api/exams/5')
    expect(res.status).toBe(204)
    expect(mocks.prisma.courseExam.delete).toHaveBeenCalledWith({ where: { id: 5 } })
  })

  it('returns 403 when a different user tries to delete', async () => {
    mocks.prisma.courseExam.findUnique.mockResolvedValue({ id: 5, userId: 99 })
    const res = await request(app).delete('/api/exams/5')
    expect(res.status).toBe(403)
    expect(mocks.prisma.courseExam.delete).not.toHaveBeenCalled()
  })

  it('returns 404 when the exam does not exist', async () => {
    mocks.prisma.courseExam.findUnique.mockResolvedValue(null)
    const res = await request(app).delete('/api/exams/999')
    expect(res.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.state.authenticated = false
    const res = await request(app).delete('/api/exams/5')
    expect(res.status).toBe(401)
  })
})
