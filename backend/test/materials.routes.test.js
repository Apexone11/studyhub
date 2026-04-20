/**
 * materials.routes.test.js
 *
 * Covers the teacher materials HTTP surface:
 *   - create + XOR sheet/note invariant
 *   - source ownership gate (a teacher can only wrap their own content)
 *   - bulk-assign: skip reasons and created count
 *   - GET /mine for enrolled students
 *
 * Uses the same Module._load monkey-patch as test/sections.routes.test.js.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const materialsRoutePath = require.resolve('../src/modules/materials')

/* ── Mock factory ────────────────────────────────────────────────────── */
const mocks = vi.hoisted(() => {
  const state = { userId: 77, username: 'ms_t', role: 'teacher', accountType: 'teacher' }

  const prisma = {
    studySheet: { findUnique: vi.fn() },
    note: { findUnique: vi.fn() },
    material: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    section: {
      findMany: vi.fn(),
    },
    sectionEnrollment: {
      findMany: vi.fn(),
    },
    materialAssignment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
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
    sentry: { captureError: vi.fn() },
    rateLimiters: {
      readLimiter: (_req, _res, next) => next(),
      writeLimiter: (_req, _res, next) => next(),
    },
  }
})

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

  delete require.cache[materialsRoutePath]
  delete require.cache[require.resolve('../src/modules/materials/materials.routes')]
  delete require.cache[require.resolve('../src/modules/materials/materials.service')]

  const routerModule = require(materialsRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[materialsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 77
  mocks.state.username = 'ms_t'
  mocks.state.role = 'teacher'
  mocks.state.accountType = 'teacher'
})

/* ===================================================================== */
describe('materials routes', () => {
  /* -------------------- teacher gate -------------------- */
  it('blocks POST / for non-teachers', async () => {
    mocks.state.accountType = 'student'
    mocks.state.role = 'student'

    const res = await request(app).post('/').send({ title: 'x', sheetId: 1 })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  /* -------------------- POST / (create material) -------------------- */
  describe('POST /', () => {
    it('requires a title', async () => {
      const res = await request(app).post('/').send({ sheetId: 1 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION')
    })

    it('rejects wrapping both a sheet and a note', async () => {
      const res = await request(app).post('/').send({ title: 'dual', sheetId: 1, noteId: 2 })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION')
      expect(mocks.prisma.material.create).not.toHaveBeenCalled()
    })

    it('rejects wrapping neither a sheet nor a note', async () => {
      const res = await request(app).post('/').send({ title: 'empty' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION')
    })

    it('rejects wrapping a sheet owned by another teacher', async () => {
      mocks.prisma.studySheet.findUnique.mockResolvedValue({ id: 10, userId: 999 })

      const res = await request(app).post('/').send({ title: 'stolen', sheetId: 10 })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
      expect(mocks.prisma.material.create).not.toHaveBeenCalled()
    })

    it('creates a material when the teacher owns the sheet', async () => {
      mocks.prisma.studySheet.findUnique.mockResolvedValue({ id: 10, userId: 77 })
      mocks.prisma.material.create.mockResolvedValue({
        id: 1,
        teacherId: 77,
        sheetId: 10,
        title: 'Week 1 reading',
        instructions: '',
        week: 1,
      })

      const res = await request(app)
        .post('/')
        .send({ title: 'Week 1 reading', sheetId: 10, week: 1 })

      expect(res.status).toBe(201)
      expect(res.body.material).toMatchObject({ id: 1, sheetId: 10 })
    })
  })

  /* -------------------- POST /assign (bulk) -------------------- */
  describe('POST /assign', () => {
    it('requires non-empty materialIds + sectionIds', async () => {
      const res = await request(app).post('/assign').send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION')
    })

    it('rejects dueAt that is not a valid ISO date', async () => {
      const res = await request(app)
        .post('/assign')
        .send({
          materialIds: [1],
          sectionIds: [2],
          dueAt: 'not-a-date',
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION')
    })

    it('skips pairs for non-owned material and counts inserts for owned ones', async () => {
      // Teacher owns material 10 and 11, but only section 20. Material 99 is foreign.
      mocks.prisma.material.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }])
      mocks.prisma.section.findMany.mockResolvedValue([{ id: 20 }])
      mocks.prisma.materialAssignment.findMany.mockResolvedValue([
        // material 10 is already assigned to section 20 → skip reason 'already_assigned'
        { materialId: 10, sectionId: 20 },
      ])
      mocks.prisma.materialAssignment.createMany.mockResolvedValue({ count: 1 })

      const res = await request(app)
        .post('/assign')
        .send({
          materialIds: [10, 11, 99],
          sectionIds: [20, 21],
        })

      expect(res.status).toBe(201)
      expect(res.body.created).toBe(1)

      const reasons = res.body.skipped.map((s) => s.reason).sort()
      // Expected skips:
      //   (10,20) already_assigned
      //   (10,21) section_not_owned
      //   (11,20) — inserted (not skipped)
      //   (11,21) section_not_owned
      //   (99,20) material_not_owned
      //   (99,21) material_not_owned
      expect(reasons).toEqual(
        [
          'already_assigned',
          'material_not_owned',
          'material_not_owned',
          'section_not_owned',
          'section_not_owned',
        ].sort(),
      )

      // The single insert should be (11, 20).
      expect(mocks.prisma.materialAssignment.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ materialId: 11, sectionId: 20 })],
      })
    })

    it('enforces the bulk materialIds cap', async () => {
      const tooMany = Array.from({ length: 26 }, (_, i) => i + 1)
      const res = await request(app)
        .post('/assign')
        .send({
          materialIds: tooMany,
          sectionIds: [1],
        })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION')
    })
  })

  /* -------------------- GET /mine (student) -------------------- */
  describe('GET /mine', () => {
    it('returns the assignments for the sections the student is enrolled in', async () => {
      mocks.state.accountType = 'student'
      mocks.state.role = 'student'
      mocks.prisma.sectionEnrollment.findMany.mockResolvedValue([
        { sectionId: 1 },
        { sectionId: 2 },
      ])
      mocks.prisma.materialAssignment.findMany.mockResolvedValue([
        {
          id: 100,
          sectionId: 1,
          assignedAt: new Date(),
          dueAt: null,
          material: {
            id: 10,
            title: 'Chapter 1',
            instructions: '',
            sheet: { id: 5, title: 'Chapter 1 sheet', status: 'public' },
            note: null,
            teacher: { id: 77, username: 'ms_t', displayName: 'Ms. T' },
          },
          section: { id: 1, name: 'Block A' },
        },
      ])

      const res = await request(app).get('/mine')

      expect(res.status).toBe(200)
      expect(res.body.assignments).toHaveLength(1)
      expect(res.body.assignments[0].material.title).toBe('Chapter 1')
    })

    it('returns empty list when the student has no enrollments (graceful)', async () => {
      mocks.state.accountType = 'student'
      mocks.state.role = 'student'
      mocks.prisma.sectionEnrollment.findMany.mockResolvedValue([])

      const res = await request(app).get('/mine')

      expect(res.status).toBe(200)
      expect(res.body.assignments).toEqual([])
      expect(mocks.prisma.materialAssignment.findMany).not.toHaveBeenCalled()
    })

    it('returns empty list when the underlying query throws (graceful degradation)', async () => {
      mocks.state.accountType = 'student'
      mocks.state.role = 'student'
      mocks.prisma.sectionEnrollment.findMany.mockRejectedValue(new Error('db down'))

      const res = await request(app).get('/mine')

      expect(res.status).toBe(200)
      expect(res.body.assignments).toEqual([])
      expect(mocks.sentry.captureError).toHaveBeenCalled()
    })
  })

  /* -------------------- DELETE /assignments/:id -------------------- */
  describe('DELETE /assignments/:id', () => {
    it('blocks deleting an assignment owned by another teacher', async () => {
      mocks.prisma.materialAssignment.findUnique.mockResolvedValue({
        id: 55,
        material: { teacherId: 999 },
      })

      const res = await request(app).delete('/assignments/55')

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
      expect(mocks.prisma.materialAssignment.delete).not.toHaveBeenCalled()
    })

    it('deletes when the owning teacher asks', async () => {
      mocks.prisma.materialAssignment.findUnique.mockResolvedValue({
        id: 55,
        material: { teacherId: 77 },
      })
      mocks.prisma.materialAssignment.delete.mockResolvedValue({})

      const res = await request(app).delete('/assignments/55')

      expect(res.status).toBe(200)
      expect(res.body.deleted).toBe(true)
    })

    it('returns {deleted:false} when the assignment is already gone', async () => {
      mocks.prisma.materialAssignment.findUnique.mockResolvedValue(null)

      const res = await request(app).delete('/assignments/55')

      expect(res.status).toBe(200)
      expect(res.body.deleted).toBe(false)
      expect(mocks.prisma.materialAssignment.delete).not.toHaveBeenCalled()
    })
  })
})
