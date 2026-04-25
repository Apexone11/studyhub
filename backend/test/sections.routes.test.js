/**
 * sections.routes.test.js
 *
 * Covers the HTTP surface introduced by Week 3 §6 of the v2 design refresh:
 *   - teacher gate on writes
 *   - create/list/update/delete
 *   - student self-enroll via join code
 *   - remove enrollment (teacher + self paths)
 *
 * Prisma, auth, rate limiters, and Sentry are replaced via a Module._load
 * monkey-patch (same pattern as test/messaging.routes.test.js).
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const sectionsRoutePath = require.resolve('../src/modules/sections')

/* ── Mock factory (hoisted before any module loads) ───────────────────── */
const mocks = vi.hoisted(() => {
  const state = { userId: 77, username: 'ms_t', role: 'teacher', accountType: 'teacher' }

  const prisma = {
    section: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    sectionEnrollment: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = {
        userId: state.userId,
        username: state.username,
        role: state.role,
        accountType: state.accountType,
      }
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    rateLimiters: {
      readLimiter: (_req, _res, next) => next(),
      writeLimiter: (_req, _res, next) => next(),
    },
  }
})

/* ── Wire mock targets ────────────────────────────────────────────────── */
const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
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

  delete require.cache[sectionsRoutePath]
  delete require.cache[require.resolve('../src/modules/sections/sections.routes')]
  delete require.cache[require.resolve('../src/modules/sections/sections.service')]

  const routerModule = require(sectionsRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[sectionsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 77
  mocks.state.username = 'ms_t'
  mocks.state.role = 'teacher'
  mocks.state.accountType = 'teacher'
})

/* ===================================================================== */
describe('sections routes', () => {
  /* -------------------- teacher gate -------------------- */
  describe('teacher gate', () => {
    it('rejects POST / for non-teacher accounts', async () => {
      mocks.state.accountType = 'student'
      mocks.state.role = 'student'

      const res = await request(app).post('/').send({ name: 'Period 3' })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('allows POST / for trustLevel >= 2 even without accountType', async () => {
      mocks.state.accountType = undefined
      mocks.auth.mockImplementationOnce((req, _res, next) => {
        req.user = { userId: 77, username: 'ms_t', trustLevel: 3 }
        next()
      })
      mocks.prisma.section.count.mockResolvedValue(0)
      mocks.prisma.section.create.mockResolvedValue({
        id: 1,
        name: 'Honors English',
        joinCode: 'ABC234',
        teacherId: 77,
      })

      const res = await request(app).post('/').send({ name: 'Honors English' })

      expect(res.status).toBe(201)
      expect(res.body.section.id).toBe(1)
    })
  })

  /* -------------------- POST / -------------------- */
  describe('POST /', () => {
    it('validates that name is required', async () => {
      const res = await request(app).post('/').send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION')
      expect(mocks.prisma.section.create).not.toHaveBeenCalled()
    })

    it('creates a section and returns it', async () => {
      mocks.prisma.section.count.mockResolvedValue(4)
      mocks.prisma.section.create.mockResolvedValue({
        id: 5,
        name: 'AP Calc',
        joinCode: 'QRST89',
        teacherId: 77,
        archived: false,
      })

      const res = await request(app).post('/').send({ name: 'AP Calc', description: 'Block A' })

      expect(res.status).toBe(201)
      expect(res.body.section).toMatchObject({ id: 5, joinCode: 'QRST89' })
      expect(mocks.prisma.section.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ teacherId: 77, name: 'AP Calc' }),
        }),
      )
    })

    it('returns 400 when the teacher is at the section limit', async () => {
      // SECTION_LIMIT short-circuits before create. 50 is MAX_SECTIONS_PER_TEACHER.
      mocks.prisma.section.count.mockResolvedValue(50)

      const res = await request(app).post('/').send({ name: 'Another' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('SECTION_LIMIT')
      expect(mocks.prisma.section.create).not.toHaveBeenCalled()
    })
  })

  /* -------------------- GET / -------------------- */
  describe('GET /', () => {
    it('returns teacher view when requester is a teacher', async () => {
      mocks.prisma.section.findMany.mockResolvedValue([
        { id: 1, name: 'A', archived: false, _count: { enrollments: 12, assignments: 3 } },
      ])

      const res = await request(app).get('/')

      expect(res.status).toBe(200)
      expect(res.body.role).toBe('teacher')
      expect(res.body.sections).toHaveLength(1)
    })

    it('returns student view when requester is a student', async () => {
      mocks.state.accountType = 'student'
      mocks.state.role = 'student'
      mocks.prisma.sectionEnrollment.findMany.mockResolvedValue([
        {
          id: 10,
          sectionId: 2,
          userId: 77,
          enrolledAt: new Date(),
          section: { id: 2, name: 'Bio' },
        },
      ])

      const res = await request(app).get('/')

      expect(res.status).toBe(200)
      expect(res.body.role).toBe('student')
      expect(res.body.enrollments).toHaveLength(1)
    })
  })

  /* -------------------- POST /join -------------------- */
  describe('POST /join', () => {
    it('requires a join code', async () => {
      const res = await request(app).post('/join').send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION')
    })

    it('returns 404 for an unknown code', async () => {
      mocks.prisma.section.findUnique.mockResolvedValue(null)

      const res = await request(app).post('/join').send({ joinCode: 'zzz999' })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('rejects self-enroll as the owning teacher', async () => {
      mocks.prisma.section.findUnique.mockResolvedValue({
        id: 9,
        teacherId: 77,
        archived: false,
      })

      const res = await request(app).post('/join').send({ joinCode: 'ABC234' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('SELF_ENROLL')
    })

    it('rejects joining an archived section', async () => {
      mocks.prisma.section.findUnique.mockResolvedValue({
        id: 9,
        teacherId: 99,
        archived: true,
      })

      const res = await request(app).post('/join').send({ joinCode: 'ABC234' })

      expect(res.status).toBe(410)
      expect(res.body.code).toBe('SECTION_ARCHIVED')
    })

    it('surfaces ALREADY_ENROLLED as 409 when unique constraint fires', async () => {
      mocks.prisma.section.findUnique.mockResolvedValue({
        id: 9,
        teacherId: 99,
        archived: false,
      })
      mocks.prisma.sectionEnrollment.create.mockRejectedValue(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      )

      const res = await request(app).post('/join').send({ joinCode: 'ABC234' })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('ALREADY_ENROLLED')
    })

    it('returns 201 + enrollment on success', async () => {
      mocks.prisma.section.findUnique.mockResolvedValue({
        id: 9,
        teacherId: 99,
        archived: false,
      })
      mocks.prisma.sectionEnrollment.create.mockResolvedValue({
        id: 42,
        sectionId: 9,
        userId: 77,
        enrolledAt: new Date(),
      })

      const res = await request(app).post('/join').send({ joinCode: 'ABC234' })

      expect(res.status).toBe(201)
      expect(res.body.enrollment.id).toBe(42)
    })
  })

  /* -------------------- PATCH /:id -------------------- */
  describe('PATCH /:id', () => {
    it('rejects updates on a section owned by another teacher', async () => {
      mocks.prisma.section.findUnique.mockResolvedValue({
        id: 3,
        teacherId: 999,
        archived: false,
      })

      const res = await request(app).patch('/3').send({ name: 'new name' })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
      expect(mocks.prisma.section.update).not.toHaveBeenCalled()
    })

    it('returns 404 for a missing section', async () => {
      mocks.prisma.section.findUnique.mockResolvedValue(null)

      const res = await request(app).patch('/3').send({ name: 'x' })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('persists allowed fields only', async () => {
      mocks.prisma.section.findUnique.mockResolvedValue({
        id: 3,
        teacherId: 77,
        archived: false,
      })
      mocks.prisma.section.update.mockResolvedValue({
        id: 3,
        name: 'Renamed',
        archived: true,
      })

      const res = await request(app)
        .patch('/3')
        .send({ name: 'Renamed', archived: true, joinCode: 'HACKED' })

      expect(res.status).toBe(200)
      expect(mocks.prisma.section.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 3 },
          data: expect.objectContaining({ name: 'Renamed', archived: true }),
        }),
      )
      const updateCall = mocks.prisma.section.update.mock.calls[0][0]
      // joinCode must NOT have been forwarded — it's not in the allow-list.
      expect(updateCall.data).not.toHaveProperty('joinCode')
    })
  })

  /* -------------------- DELETE /:id/enrollments/:userId -------------------- */
  describe('DELETE /:id/enrollments/:userId', () => {
    it('lets the teacher remove any student', async () => {
      mocks.prisma.section.findUnique.mockResolvedValue({ id: 8, teacherId: 77 })
      mocks.prisma.sectionEnrollment.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app).delete('/8/enrollments/501')

      expect(res.status).toBe(200)
      expect(res.body.removed).toBe(true)
    })

    it('lets a student remove only themselves', async () => {
      mocks.state.userId = 501
      mocks.state.accountType = 'student'
      mocks.prisma.section.findUnique.mockResolvedValue({ id: 8, teacherId: 77 })
      mocks.prisma.sectionEnrollment.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app).delete('/8/enrollments/501')

      expect(res.status).toBe(200)
    })

    it('blocks cross-student removal', async () => {
      mocks.state.userId = 501
      mocks.state.accountType = 'student'
      mocks.prisma.section.findUnique.mockResolvedValue({ id: 8, teacherId: 77 })

      const res = await request(app).delete('/8/enrollments/502')

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
      expect(mocks.prisma.sectionEnrollment.deleteMany).not.toHaveBeenCalled()
    })
  })
})
