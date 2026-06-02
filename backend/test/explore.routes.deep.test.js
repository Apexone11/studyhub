/**
 * explore.routes.deep.test.js — G2-3 Explore tab HTTP surface.
 *
 * Mounts the real explore router + controller + service with a mocked prisma,
 * a togglable feature-flag gate, and a mocked block filter. Covers:
 *   - 503 when the flag is off (fail-closed via requireFeatureFlag)
 *   - each GET returns its documented shape (200) when the flag is on
 *   - ?limit is capped (parseBoundedInt → Prisma take <= 50)
 *   - ?topic= filters via courseAlias → courseId IN clause
 *   - block-filtered authors excluded (userId notIn)
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const routesPath = require.resolve('../src/modules/explore/explore.routes')

const mocks = vi.hoisted(() => {
  const state = { flagEnabled: true, blockedIds: [] }

  const prisma = {
    studySheet: { findMany: vi.fn(async () => []) },
    note: { findMany: vi.fn(async () => []) },
    studyGroup: { findMany: vi.fn(async () => []) },
    courseAlias: { findMany: vi.fn(async () => []) },
    topicCanonical: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
  }

  return {
    state,
    prisma,
    // requireFeatureFlag(name) → middleware. Pass-through when on, 503 when off
    // (mirrors the real fail-closed gate without touching the DB).
    featureFlagGate: {
      requireFeatureFlag: vi.fn(
        () => (_req, res, next) =>
          state.flagEnabled
            ? next()
            : res.status(503).json({
                error: 'This feature is temporarily unavailable.',
                code: 'SERVICE_UNAVAILABLE',
              }),
      ),
    },
    optionalAuth: vi.fn((req, _res, next) => {
      if (state.viewer) req.user = state.viewer
      next()
    }),
    rateLimiters: { readLimiter: (_req, _res, next) => next() },
    blockFilter: { getBlockedUserIds: vi.fn(async () => state.blockedIds) },
    // Real courseAliasing is fine, but its listTopics() is unrelated to these
    // assertions and would need its own flag mock — stub the two methods used.
    courseAliasing: {
      isValidTag: (tag) => typeof tag === 'string' && /^[a-z0-9-]{1,80}$/.test(tag),
      listTopics: vi.fn(async () => [{ topicTag: 'cs-intro', displayName: 'Intro to CS' }]),
    },
    sentry: { captureError: vi.fn() },
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/middleware/featureFlagGate'), mocks.featureFlagGate],
  [require.resolve('../src/core/auth/optionalAuth'), mocks.optionalAuth],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
  [require.resolve('../src/lib/courseAliasing'), mocks.courseAliasing],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/logger'), mocks.logger],
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
  delete require.cache[require.resolve('../src/modules/explore/explore.controller')]
  delete require.cache[require.resolve('../src/modules/explore/explore.service')]
  const routerModule = require(routesPath)
  const router = routerModule.default || routerModule
  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[routesPath]
  delete require.cache[require.resolve('../src/modules/explore/explore.controller')]
  delete require.cache[require.resolve('../src/modules/explore/explore.service')]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.flagEnabled = true
  mocks.state.blockedIds = []
  mocks.state.viewer = undefined
})

/* ── fail-closed gate ────────────────────────────────────────────────── */
describe('flag gate', () => {
  it('503s every route when flag_explore_tab is off', async () => {
    mocks.state.flagEnabled = false
    for (const path of ['/sheets', '/trending', '/notes', '/study-groups', '/topics']) {
      const res = await request(app).get(path)
      expect(res.status).toBe(503)
      expect(res.body.code).toBe('SERVICE_UNAVAILABLE')
    }
    expect(mocks.prisma.studySheet.findMany).not.toHaveBeenCalled()
  })
})

/* ── shapes ──────────────────────────────────────────────────────────── */
describe('response shapes (flag on)', () => {
  it('GET /sheets → { sheets: [...] }', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([
      {
        id: 1,
        title: 'Linked Lists',
        previewText: 'nodes',
        stars: 4,
        createdAt: new Date(),
        author: { id: 5, username: 'a' },
        course: { id: 2, code: 'CS', name: 'CS', school: { name: 'Cal' } },
      },
    ])
    const res = await request(app).get('/sheets')
    expect(res.status).toBe(200)
    expect(res.body.sheets).toHaveLength(1)
    expect(res.body.sheets[0]).toMatchObject({ id: 1, title: 'Linked Lists' })
  })

  it('GET /trending → { sheets: [...] }', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValueOnce([
      { id: 9, title: 'Hot', stars: 99, createdAt: new Date() },
    ])
    const res = await request(app).get('/trending')
    expect(res.status).toBe(200)
    expect(res.body.sheets[0].id).toBe(9)
    // Trending orders by stars desc then recency.
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.orderBy).toEqual([{ stars: 'desc' }, { createdAt: 'desc' }])
  })

  it('GET /notes → { notes: [...] }', async () => {
    mocks.prisma.note.findMany.mockResolvedValueOnce([
      { id: 3, title: 'Notes', createdAt: new Date(), author: { id: 5, username: 'a' } },
    ])
    const res = await request(app).get('/notes')
    expect(res.status).toBe(200)
    expect(res.body.notes).toHaveLength(1)
    // Public + clean only.
    const args = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(args.where).toMatchObject({ private: false, moderationStatus: 'clean' })
  })

  it('GET /study-groups → { groups: [...] } with _count', async () => {
    mocks.prisma.studyGroup.findMany.mockResolvedValueOnce([
      {
        id: 8,
        name: 'Study Crew',
        description: 'desc',
        createdAt: new Date(),
        course: { id: 2, code: 'CS', name: 'CS' },
        _count: { members: 5 },
      },
    ])
    const res = await request(app).get('/study-groups')
    expect(res.status).toBe(200)
    expect(res.body.groups[0]).toMatchObject({ id: 8, _count: { members: 5 } })
    const args = mocks.prisma.studyGroup.findMany.mock.calls[0][0]
    expect(args.where).toMatchObject({ privacy: 'public', moderationStatus: 'active' })
  })

  it('GET /topics → { topics: [...] }', async () => {
    const res = await request(app).get('/topics')
    expect(res.status).toBe(200)
    expect(res.body.topics[0].topicTag).toBe('cs-intro')
    expect(mocks.courseAliasing.listTopics).toHaveBeenCalled()
  })
})

/* ── limit capping (parseBoundedInt) ─────────────────────────────────── */
describe('limit capping', () => {
  it('clamps ?limit=999 to <= 50 on /sheets', async () => {
    await request(app).get('/sheets?limit=999')
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.take).toBeLessThanOrEqual(50)
    expect(args.take).toBe(50)
  })

  it('clamps ?limit=999 to <= 30 on /trending', async () => {
    await request(app).get('/trending?limit=999')
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.take).toBeLessThanOrEqual(30)
    expect(args.take).toBe(30)
  })

  it('uses the default (20) when ?limit is missing on /notes', async () => {
    await request(app).get('/notes')
    const args = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(args.take).toBe(20)
  })
})

/* ── topic filtering ─────────────────────────────────────────────────── */
describe('topic filtering', () => {
  it('?topic=cs-intro resolves courseIds via courseAlias and filters by them', async () => {
    mocks.prisma.courseAlias.findMany.mockResolvedValueOnce([{ courseId: 2 }, { courseId: 7 }])
    await request(app).get('/sheets?topic=cs-intro')
    expect(mocks.prisma.courseAlias.findMany).toHaveBeenCalledWith({
      where: { topicTag: 'cs-intro' },
      select: { courseId: true },
      take: 500,
    })
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.where.courseId).toEqual({ in: [2, 7] })
  })

  it('returns [] (short-circuit) when a topic maps to no courses', async () => {
    mocks.prisma.courseAlias.findMany.mockResolvedValueOnce([])
    const res = await request(app).get('/sheets?topic=cs-intro')
    expect(res.status).toBe(200)
    expect(res.body.sheets).toEqual([])
    // No sheet query — short-circuited on the empty course set.
    expect(mocks.prisma.studySheet.findMany).not.toHaveBeenCalled()
  })

  it('an invalid topic tag yields an EMPTY shelf (no leak of all content)', async () => {
    // A present-but-invalid topic must NOT fall through to an unfiltered query
    // (which would surface ALL cross-school sheets). topicCourseIds returns []
    // for an invalid tag, so the shelf short-circuits to [] without touching
    // courseAlias OR the sheet table.
    const res = await request(app).get('/sheets?topic=Bad Tag')
    expect(res.status).toBe(200)
    expect(res.body.sheets).toEqual([])
    expect(mocks.prisma.courseAlias.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.studySheet.findMany).not.toHaveBeenCalled()
  })
})

/* ── block filtering ─────────────────────────────────────────────────── */
describe('block filtering', () => {
  it('excludes blocked authors via userId notIn for an authed viewer', async () => {
    mocks.state.viewer = { userId: 1, role: 'student' }
    mocks.state.blockedIds = [42, 99]
    await request(app).get('/sheets')
    expect(mocks.blockFilter.getBlockedUserIds).toHaveBeenCalledWith(mocks.prisma, 1)
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.where.userId).toEqual({ notIn: [42, 99] })
  })

  it('applies no author filter when the viewer has no blocks', async () => {
    mocks.state.viewer = { userId: 1, role: 'student' }
    mocks.state.blockedIds = []
    await request(app).get('/sheets')
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.where.userId).toBeUndefined()
  })

  it('degrades to no block filter when getBlockedUserIds throws', async () => {
    mocks.state.viewer = { userId: 1, role: 'student' }
    mocks.blockFilter.getBlockedUserIds.mockRejectedValueOnce(new Error('UserBlock table missing'))
    const res = await request(app).get('/sheets')
    expect(res.status).toBe(200)
    const args = mocks.prisma.studySheet.findMany.mock.calls[0][0]
    expect(args.where.userId).toBeUndefined()
  })
})
