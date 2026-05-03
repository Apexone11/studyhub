// hashtags.catalog.routes.test — covers the new GET /api/hashtags/catalog
// endpoint added with the canonical-topic picker (2026-05-03 bug bash).
//
// Same module-load mock harness as auth.routes.test.js: we swap the prisma
// require with an in-memory stub, mount the hashtags router, and exercise
// it via supertest. No DB needed.
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const hashtagsRoutePath = require.resolve('../src/modules/hashtags/hashtags.routes')

const mocks = vi.hoisted(() => ({
  prisma: {
    hashtag: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    hashtagFollow: {
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  sentry: { captureError: vi.fn() },
  // The router uses readLimiter/writeLimiter; stub both to no-op so a
  // burst of test requests can't trip the in-memory rate limiter and
  // leak state between tests.
  rateLimiters: {
    readLimiter: (_req, _res, next) => next(),
    writeLimiter: (_req, _res, next) => next(),
  },
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
])

const originalModuleLoad = Module._load

let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolved = Module._resolveFilename(requestId, parent, isMain)
    const mocked = mockTargets.get(resolved)
    if (mocked) return mocked
    return originalModuleLoad.apply(this, arguments)
  }
  delete require.cache[hashtagsRoutePath]
  const router = require('../src/modules/hashtags/hashtags.routes')
  app = express()
  app.use(express.json())
  // The route file needs req.user only for auth-gated routes; catalog is
  // public. We DON'T mount requireAuth in the test app, so the auth-gated
  // routes (`/me`, `/follow`, `/:name/follow`) won't execute correctly
  // here. Catalog is what we're testing.
  app.use('/', router.default || router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[hashtagsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /catalog', () => {
  it('returns only canonical topics by default', async () => {
    mocks.prisma.hashtag.findMany.mockResolvedValueOnce([
      { id: 1, name: 'calculus', displayName: 'Calculus', category: 'Math' },
      { id: 2, name: 'algorithms', displayName: 'Algorithms', category: 'Computer Science' },
    ])

    const res = await request(app).get('/catalog')

    expect(res.status).toBe(200)
    expect(res.body.topics).toHaveLength(2)
    expect(res.body.categories.sort()).toEqual(['Computer Science', 'Math'])
    // Verify the canonical-only filter actually made it into the query.
    const findArgs = mocks.prisma.hashtag.findMany.mock.calls[0][0]
    expect(findArgs.where).toMatchObject({ isCanonical: true })
  })

  it('passes the search query to both name and displayName (case-insensitive)', async () => {
    mocks.prisma.hashtag.findMany.mockResolvedValueOnce([
      {
        id: 1,
        name: 'machine_learning',
        displayName: 'Machine Learning',
        category: 'Computer Science',
      },
    ])

    await request(app).get('/catalog?q=machine learning')

    const findArgs = mocks.prisma.hashtag.findMany.mock.calls[0][0]
    expect(findArgs.where.OR).toEqual([
      // Spaces collapse to underscores for the slug-shaped `name` lookup.
      { name: { contains: 'machine_learning', mode: 'insensitive' } },
      { displayName: { contains: 'machine learning', mode: 'insensitive' } },
    ])
  })

  it('filters by category when supplied', async () => {
    mocks.prisma.hashtag.findMany.mockResolvedValueOnce([])

    await request(app).get('/catalog?category=Biology')

    const findArgs = mocks.prisma.hashtag.findMany.mock.calls[0][0]
    expect(findArgs.where).toMatchObject({ isCanonical: true, category: 'Biology' })
  })

  it('returns an empty list shape on DB failure (sentry-captured)', async () => {
    mocks.prisma.hashtag.findMany.mockRejectedValueOnce(new Error('boom'))

    const res = await request(app).get('/catalog')

    expect(res.status).toBe(500)
    expect(mocks.sentry.captureError).toHaveBeenCalledTimes(1)
  })
})
