/**
 * courses.equivalents.deep.test.js — G2-4 course-aliasing HTTP surface.
 *
 * Mounts the real courses router with mocked collaborators (courseAliasing,
 * auth, originAllowlist, rateLimiters, schools controller). Covers:
 *   - GET /topics returns { topics } (200)
 *   - GET /:id/equivalents rejects a partial-numeric id (parseRouteId → 400)
 *   - flag-off path returns { equivalents: [] }
 *   - flag-on path excludes the source course id
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const routesPath = require.resolve('../src/modules/courses/courses.routes')

const mocks = vi.hoisted(() => {
  const state = { flagEnabled: false }

  // Stand-in for the curated alias store. getEquivalentCourses honors the
  // fail-closed flag and the self-exclusion contract the controller relies on.
  const courseAliasing = {
    listTopics: vi.fn(async () =>
      state.flagEnabled
        ? [{ topicTag: 'cs-intro', displayName: 'Intro to CS', category: 'cs', courseCount: 3 }]
        : [],
    ),
    getEquivalentCourses: vi.fn(async (courseId) => {
      if (!state.flagEnabled) return []
      return [
        {
          id: 7,
          code: 'CS61A',
          name: 'SICP',
          school: { id: 2, name: 'Cal' },
          topics: [{ topicTag: 'cs-intro', displayName: 'Intro to CS' }],
        },
        {
          id: 9,
          code: '6.0001',
          name: 'Intro',
          school: { id: 3, name: 'MIT' },
          topics: [{ topicTag: 'cs-intro', displayName: 'Intro to CS' }],
        },
      ].filter((c) => c.id !== courseId)
    }),
  }

  return {
    state,
    courseAliasing,
    optionalAuth: vi.fn((req, _res, next) => next()),
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 1, username: 'tester', role: 'student' }
      next()
    }),
    // originAllowlist is a factory returning middleware — match that shape.
    originAllowlist: vi.fn(() => (_req, _res, next) => next()),
    rateLimiters: {
      readLimiter: (_req, _res, next) => next(),
      writeLimiter: (_req, _res, next) => next(),
    },
    // Replace the schools controller (heavy deps) with a no-op middleware so the
    // routes file loads cleanly; the aliasing routes live in courses.controller.
    // A bare passthrough mounts fine via router.use('/', ...) — we never hit a
    // schools route in these tests, so a full Router isn't needed (and building
    // one in vi.hoisted would touch `express` before its import initializes).
    schoolsController: (_req, _res, next) => next(),
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/courseAliasing'), mocks.courseAliasing],
  [require.resolve('../src/core/auth/optionalAuth'), mocks.optionalAuth],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/middleware/originAllowlist'), mocks.originAllowlist],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/modules/courses/courses.schools.controller'), mocks.schoolsController],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    try {
      const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
      const mockedModule = mockTargets.get(resolvedRequest)
      if (mockedModule) return mockedModule
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }
  delete require.cache[routesPath]
  delete require.cache[require.resolve('../src/modules/courses/courses.controller')]
  const routerModule = require(routesPath)
  const router = routerModule.default || routerModule
  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[routesPath]
  delete require.cache[require.resolve('../src/modules/courses/courses.controller')]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.flagEnabled = false
})

/* ── GET /topics ─────────────────────────────────────────────────────── */
describe('GET /topics', () => {
  it('returns { topics: [] } when the flag is off (fail-closed)', async () => {
    const res = await request(app).get('/topics')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ topics: [] })
  })

  it('returns the catalog when the flag is on', async () => {
    mocks.state.flagEnabled = true
    const res = await request(app).get('/topics')
    expect(res.status).toBe(200)
    expect(res.body.topics).toHaveLength(1)
    expect(res.body.topics[0]).toMatchObject({ topicTag: 'cs-intro' })
  })

  it('500s with INTERNAL when the catalog query throws', async () => {
    mocks.courseAliasing.listTopics.mockRejectedValueOnce(new Error('boom'))
    const res = await request(app).get('/topics')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL')
  })
})

/* ── GET /:id/equivalents ────────────────────────────────────────────── */
describe('GET /:id/equivalents', () => {
  // CLAUDE.md A12 — parseRouteId rejects "12abc" so a malformed path 400s
  // instead of Number.parseInt('12abc') === 12 silently acting on course 12.
  it('rejects a partial-numeric id (12abc) with 400 BAD_REQUEST', async () => {
    const res = await request(app).get('/12abc/equivalents')
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('BAD_REQUEST')
    expect(mocks.courseAliasing.getEquivalentCourses).not.toHaveBeenCalled()
  })

  it('returns { equivalents: [] } when the flag is off', async () => {
    const res = await request(app).get('/5/equivalents')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ equivalents: [] })
    expect(mocks.courseAliasing.getEquivalentCourses).toHaveBeenCalledWith(5, expect.any(Object))
  })

  it('excludes the source course (5) when the flag is on', async () => {
    mocks.state.flagEnabled = true
    const res = await request(app).get('/5/equivalents')
    expect(res.status).toBe(200)
    const ids = res.body.equivalents.map((e) => e.id)
    expect(ids).not.toContain(5)
    expect(ids.sort()).toEqual([7, 9])
    expect(res.body.equivalents[0].topics[0].topicTag).toBe('cs-intro')
  })

  it('500s with INTERNAL when the equivalents query throws', async () => {
    mocks.state.flagEnabled = true
    mocks.courseAliasing.getEquivalentCourses.mockRejectedValueOnce(new Error('boom'))
    const res = await request(app).get('/5/equivalents')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL')
  })
})
