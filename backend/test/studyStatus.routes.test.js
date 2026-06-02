/**
 * studyStatus.routes.test.js
 *
 * Covers the study-status HTTP surface, focused on the CLAUDE.md A12
 * numeric-id guard on PUT /:sheetId:
 *   - rejects a decimal / negative / non-numeric sheetId with 400 before
 *     the service (and Prisma) ever runs
 *   - accepts a clean positive integer id
 *
 * Uses the same Module._load monkey-patch as test/materials.routes.test.js.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const studyStatusRoutePath = require.resolve('../src/modules/studyStatus')

/* ── Mock factory ────────────────────────────────────────────────────── */
const mocks = vi.hoisted(() => {
  const state = { userId: 42 }

  const service = {
    VALID_STATUSES: ['to-review', 'studying', 'done'],
    getAllForUser: vi.fn(),
    getForSheets: vi.fn(),
    setStatus: vi.fn(),
    bulkSync: vi.fn(),
  }

  return {
    state,
    service,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId }
      next()
    }),
    rateLimiters: {
      studyStatusReadLimiter: (_req, _res, next) => next(),
      studyStatusWriteLimiter: (_req, _res, next) => next(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/modules/studyStatus/studyStatus.service'), mocks.service],
  [require.resolve('../src/middleware/auth'), mocks.auth],
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

  delete require.cache[studyStatusRoutePath]
  delete require.cache[require.resolve('../src/modules/studyStatus/studyStatus.routes')]

  const routerModule = require(studyStatusRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[studyStatusRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
})

/* ===================================================================== */
describe('study-status routes', () => {
  /* -------------------- PUT /:sheetId (A12 id guard) -------------------- */
  describe('PUT /:sheetId', () => {
    // CLAUDE.md A12 — the old `!sheetId || isNaN` guard let Number('-5') === -5
    // (truthy, not NaN) through to Prisma. Number.parseInt + `sheetId < 1`
    // rejects negatives before the service runs.
    it('rejects a negative sheetId with 400', async () => {
      const res = await request(app).put('/-5').send({ status: 'done' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('BAD_REQUEST')
      expect(mocks.service.setStatus).not.toHaveBeenCalled()
    })

    it('rejects a non-numeric sheetId with 400', async () => {
      const res = await request(app).put('/abc').send({ status: 'done' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('BAD_REQUEST')
      expect(mocks.service.setStatus).not.toHaveBeenCalled()
    })

    it('rejects an invalid status with 400', async () => {
      const res = await request(app).put('/10').send({ status: 'not-a-status' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION')
      expect(mocks.service.setStatus).not.toHaveBeenCalled()
    })

    it('accepts a clean positive integer id', async () => {
      mocks.service.setStatus.mockResolvedValue({})

      const res = await request(app).put('/10').send({ status: 'studying' })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(mocks.service.setStatus).toHaveBeenCalledWith(42, 10, 'studying')
    })
  })
})
