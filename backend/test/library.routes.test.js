import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const libraryRoutePath = require.resolve('../src/modules/library')

/* ── Mock factory (hoisted before any module loads) ───────────────────── */
const mocks = vi.hoisted(() => {
  const state = { userId: 42, username: 'test_user', role: 'student' }

  const prisma = {
    bookShelf: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    shelfBook: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    readingProgress: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    bookBookmark: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    cachedBook: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId, username: state.username, role: state.role }
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    rateLimiters: {
      libraryWriteLimiter: (_req, _res, next) => next(),
    },
    blockFilter: {
      getBlockedUserIds: vi.fn().mockResolvedValue([]),
      getMutedUserIds: vi.fn().mockResolvedValue([]),
      blockFilterClause: vi.fn().mockReturnValue({}),
      hasBlocked: vi.fn().mockResolvedValue(false),
      isBlockedEitherWay: vi.fn().mockResolvedValue(false),
    },
    authTokens: {
      getAuthTokenFromRequest: vi.fn().mockReturnValue(null),
      verifyAuthToken: vi.fn(),
    },
    libraryService: {
      searchBooks: vi.fn(),
      getBookDetail: vi.fn(),
      syncPopularBooksToDB: vi.fn(),
    },
    libraryConstants: {
      GOOGLE_BOOKS_BASE: 'https://www.googleapis.com/books/v1',
      GOOGLE_BOOKS_API_KEY: 'test-key',
      CACHE_TTL: { SEARCH: 3600000, BOOK_DETAIL: 86400000, COVER: 604800000 },
      DEFAULT_PAGE_SIZE: 20,
      MAX_SHELVES_PER_USER: 20,
      MAX_BOOKMARKS_PER_USER_FREE: 50,
      CATEGORIES: ['Fiction', 'Science'],
    },
  }
})

/* ── Wire mock targets ────────────────────────────────────────────────── */
const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
  [require.resolve('../src/lib/authTokens'), mocks.authTokens],
  [require.resolve('../src/modules/library/library.service'), mocks.libraryService],
  [require.resolve('../src/modules/library/library.constants'), mocks.libraryConstants],
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

  delete require.cache[libraryRoutePath]
  const routesPath = require.resolve('../src/modules/library/library.routes')
  delete require.cache[routesPath]

  const routerModule = require(libraryRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[libraryRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.username = 'test_user'
  mocks.state.role = 'student'
})

/* ── Shelves CRUD ──────────────────────────────────────────────────────── */

describe('GET /shelves', () => {
  it('returns user shelves', async () => {
    const shelves = [
      { id: 1, name: 'Favorites', userId: 42, _count: { books: 3 }, createdAt: new Date() },
    ]
    mocks.prisma.bookShelf.findMany.mockResolvedValue(shelves)

    const res = await request(app).get('/shelves')
    expect(res.status).toBe(200)
    expect(res.body.shelves).toHaveLength(1)
    expect(res.body.shelves[0].name).toBe('Favorites')
  })

  it('returns 500 on database error', async () => {
    mocks.prisma.bookShelf.findMany.mockRejectedValue(new Error('DB error'))
    const res = await request(app).get('/shelves')
    expect(res.status).toBe(500)
    expect(res.body.error).toBeDefined()
  })
})

describe('POST /shelves', () => {
  it('creates a new shelf', async () => {
    mocks.prisma.bookShelf.count.mockResolvedValue(0)
    mocks.prisma.bookShelf.create.mockResolvedValue({
      id: 1,
      name: 'My Shelf',
      userId: 42,
      createdAt: new Date(),
    })

    const res = await request(app).post('/shelves').send({ name: 'My Shelf' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('My Shelf')
  })

  it('rejects empty shelf name', async () => {
    const res = await request(app).post('/shelves').send({ name: '' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/name/i)
  })

  it('rejects missing shelf name', async () => {
    const res = await request(app).post('/shelves').send({})
    expect(res.status).toBe(400)
  })
})

describe('DELETE /shelves/:id', () => {
  it('deletes own shelf', async () => {
    mocks.prisma.bookShelf.findUnique.mockResolvedValue({ id: 1, userId: 42 })
    mocks.prisma.bookShelf.delete.mockResolvedValue({ id: 1 })

    const res = await request(app).delete('/shelves/1')
    expect(res.status).toBe(204)
  })

  it('returns 404 for non-existent shelf', async () => {
    mocks.prisma.bookShelf.findUnique.mockResolvedValue(null)
    const res = await request(app).delete('/shelves/999')
    expect(res.status).toBe(404)
  })
})

/* ── Reading Progress ──────────────────────────────────────────────────── */

describe('GET /reading-progress', () => {
  it('returns all reading progress for user', async () => {
    const progress = [
      { id: 1, userId: 42, volumeId: 'zyTCAlFPjgYC', percentage: 45, cfi: 'viewer' },
    ]
    mocks.prisma.readingProgress.findMany.mockResolvedValue(progress)

    const res = await request(app).get('/reading-progress')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].percentage).toBe(45)
  })
})

describe('PUT /reading-progress/:volumeId', () => {
  it('upserts reading progress', async () => {
    mocks.prisma.readingProgress.upsert.mockResolvedValue({
      id: 1,
      userId: 42,
      volumeId: 'zyTCAlFPjgYC',
      percentage: 75,
      cfi: 'viewer',
    })

    const res = await request(app)
      .put('/reading-progress/zyTCAlFPjgYC')
      .send({ percentage: 75, cfi: 'viewer' })
    expect(res.status).toBe(200)
    expect(res.body.percentage).toBe(75)
  })

  it('rejects invalid percentage', async () => {
    const res = await request(app).put('/reading-progress/zyTCAlFPjgYC').send({ percentage: 150 })
    expect(res.status).toBe(400)
  })
})

/* ── Bookmarks ─────────────────────────────────────────────────────────── */

describe('GET /bookmarks/:volumeId', () => {
  it('returns bookmarks for a book', async () => {
    mocks.prisma.bookBookmark.findMany.mockResolvedValue([
      { id: 1, volumeId: 'zyTCAlFPjgYC', cfi: 'page-5', label: 'Chapter 1' },
    ])

    const res = await request(app).get('/bookmarks/zyTCAlFPjgYC')
    expect(res.status).toBe(200)
    expect(res.body.bookmarks).toHaveLength(1)
  })
})

describe('POST /bookmarks', () => {
  it('creates a bookmark', async () => {
    mocks.prisma.bookBookmark.count.mockResolvedValue(0)
    mocks.prisma.bookBookmark.create.mockResolvedValue({
      id: 1,
      userId: 42,
      volumeId: 'zyTCAlFPjgYC',
      cfi: 'page-5',
      label: 'Chapter 1',
    })

    const res = await request(app)
      .post('/bookmarks')
      .send({ volumeId: 'zyTCAlFPjgYC', cfi: 'page-5', label: 'Chapter 1' })
    expect(res.status).toBe(201)
  })

  it('rejects missing cfi', async () => {
    const res = await request(app).post('/bookmarks').send({ volumeId: 'zyTCAlFPjgYC' })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /bookmarks/:id', () => {
  it('deletes own bookmark', async () => {
    mocks.prisma.bookBookmark.findUnique.mockResolvedValue({ id: 1, userId: 42 })
    mocks.prisma.bookBookmark.delete.mockResolvedValue({ id: 1 })

    const res = await request(app).delete('/bookmarks/1')
    expect(res.status).toBe(204)
  })

  it('returns 404 for non-existent bookmark', async () => {
    mocks.prisma.bookBookmark.findUnique.mockResolvedValue(null)
    const res = await request(app).delete('/bookmarks/999')
    expect(res.status).toBe(404)
  })
})

/* ── Admin sync ────────────────────────────────────────────────────────── */

describe('POST /admin/sync-catalog', () => {
  it('rejects non-admin users', async () => {
    mocks.state.role = 'student'
    const res = await request(app).post('/admin/sync-catalog')
    expect(res.status).toBe(403)
  })
})
