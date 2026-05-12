/**
 * search.deep.test.js — Comprehensive coverage for the unified /api/search endpoint.
 *
 * Covers the contract documented in CLAUDE.md "Search System":
 *   - Response shape `{ results: { sheets, courses, users, notes, groups } }` (Pitfall #2)
 *   - Block-filter applied for authenticated users (and graceful when the
 *     UserBlock table is transiently unavailable — Pitfall #6 + try/catch)
 *   - Profile visibility honored (via lib/profileVisibility.js)
 *   - Type allowlist + limit clamp + empty query path
 *   - Unauth viewer privacy (notes always empty, public groups only)
 *   - Shared sheet text-search clauses via lib/sheetSearch.js
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const searchRoutePath = require.resolve('../src/modules/search')

const SESSION_BY_TOKEN = {
  'student-token': { userId: 42, role: 'student' },
  'admin-token': { userId: 999, role: 'admin' },
}

const mocks = vi.hoisted(() => {
  const prisma = {
    studySheet: { findMany: vi.fn() },
    course: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    userPreferences: { findMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    note: { findMany: vi.fn() },
    studyGroup: { findMany: vi.fn() },
  }

  return {
    prisma,
    authTokens: {
      getAuthTokenFromRequest: vi.fn((req) => req.headers['x-studyhub-test-token'] || null),
      verifyAuthToken: vi.fn(),
      getOptionalAuthUserFromRequest: vi.fn((req) => {
        const token = req.headers['x-studyhub-test-token'] || null
        if (!token) return null
        return null
      }),
    },
    rateLimiters: {
      searchLimiter: (_req, _res, next) => next(),
    },
    blockFilter: {
      getBlockedUserIds: vi.fn().mockResolvedValue([]),
    },
    sentry: { captureError: vi.fn() },
    fullTextSearch: {
      searchSheetsFTS: vi.fn().mockResolvedValue({ sheets: [], total: 0, page: 1, totalPages: 0 }),
      searchCoursesFTS: vi.fn().mockResolvedValue([]),
      searchUsersFTS: vi.fn().mockResolvedValue([]),
    },
    feedService: {
      summarizeText: vi.fn((text, max) => {
        if (!text) return ''
        return String(text).length > (max || 200)
          ? `${String(text).slice(0, (max || 200) - 3)}...`
          : String(text)
      }),
    },
  }
})

// Patch the optional-auth helper after the module loads so each test can
// control whether the supertest call appears authenticated.
mocks.authTokens.getOptionalAuthUserFromRequest = vi.fn((req) => {
  const token = req.headers['x-studyhub-test-token'] || null
  if (!token) return null
  return SESSION_BY_TOKEN[token] || null
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/authTokens'), mocks.authTokens],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
  [require.resolve('../src/lib/fullTextSearch'), mocks.fullTextSearch],
  [require.resolve('../src/modules/feed/feed.service'), mocks.feedService],
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

  delete require.cache[searchRoutePath]
  const routerModule = require(searchRoutePath)
  const searchRouter = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', searchRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[searchRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()

  mocks.prisma.studySheet.findMany.mockResolvedValue([])
  mocks.prisma.course.findMany.mockResolvedValue([])
  mocks.prisma.user.findMany.mockResolvedValue([])
  mocks.prisma.userPreferences.findMany.mockResolvedValue([])
  mocks.prisma.enrollment.findMany.mockResolvedValue([])
  mocks.prisma.note.findMany.mockResolvedValue([])
  mocks.prisma.studyGroup.findMany.mockResolvedValue([])
  mocks.blockFilter.getBlockedUserIds.mockResolvedValue([])
})

// ── Coverage area #1: Response shape (CLAUDE.md Pitfall #2) ──────────────
describe('GET /api/search — response shape', () => {
  it('returns { results: { sheets, courses, users, notes, groups } } as a nested object', async () => {
    const res = await request(app).get('/').query({ q: 'physics' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      results: {
        sheets: expect.any(Array),
        courses: expect.any(Array),
        users: expect.any(Array),
        notes: expect.any(Array),
        groups: expect.any(Array),
      },
      query: 'physics',
      type: 'all',
    })
  })

  it('exposes the resolved type in the response body', async () => {
    const res = await request(app).get('/').query({ q: 'algorithms', type: 'sheets' })
    expect(res.status).toBe(200)
    expect(res.body.type).toBe('sheets')
  })
})

// ── Coverage area #2: Block filter applied (and graceful) ─────────────────
describe('GET /api/search — block filtering', () => {
  it('hides sheets authored by blocked users for an authenticated viewer', async () => {
    mocks.blockFilter.getBlockedUserIds.mockResolvedValue([7])
    mocks.prisma.studySheet.findMany.mockResolvedValue([
      {
        id: 1,
        title: 'Visible Sheet',
        description: 'ok',
        stars: 1,
        downloads: 0,
        createdAt: new Date(),
        course: null,
        author: { id: 1, username: 'allowed' },
      },
      {
        id: 2,
        title: 'Hidden Sheet',
        description: 'blocked',
        stars: 1,
        downloads: 0,
        createdAt: new Date(),
        course: null,
        author: { id: 7, username: 'blocked_user' },
      },
    ])

    const res = await request(app)
      .get('/')
      .set('x-studyhub-test-token', 'student-token')
      .query({ q: 'sheet', type: 'sheets' })

    expect(res.status).toBe(200)
    const ids = res.body.results.sheets.map((sheet) => sheet.id)
    expect(ids).toEqual([1])
  })

  it('gracefully falls back to no block filtering when the UserBlock table errors', async () => {
    mocks.blockFilter.getBlockedUserIds.mockRejectedValue(new Error('UserBlock table missing'))
    mocks.prisma.studySheet.findMany.mockResolvedValue([
      {
        id: 99,
        title: 'Still Visible',
        description: '',
        stars: 0,
        downloads: 0,
        createdAt: new Date(),
        course: null,
        author: { id: 7, username: 'maybe_blocked' },
      },
    ])

    const res = await request(app)
      .get('/')
      .set('x-studyhub-test-token', 'student-token')
      .query({ q: 'sheet', type: 'sheets' })

    expect(res.status).toBe(200)
    expect(res.body.results.sheets).toHaveLength(1)
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })
})

// ── Coverage area #3: Profile visibility on users ─────────────────────────
describe('GET /api/search — profile visibility', () => {
  it('strips private-profile users from anonymous result sets', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: 10, username: 'public_user', role: 'student', avatarUrl: null, createdAt: new Date() },
      { id: 11, username: 'private_user', role: 'student', avatarUrl: null, createdAt: new Date() },
    ])
    mocks.prisma.userPreferences.findMany.mockResolvedValue([
      { userId: 11, profileVisibility: 'private' },
    ])

    const res = await request(app).get('/').query({ q: 'user', type: 'users' })

    expect(res.status).toBe(200)
    const usernames = res.body.results.users.map((u) => u.username)
    expect(usernames).toContain('public_user')
    expect(usernames).not.toContain('private_user')
  })
})

// ── Coverage area #4: Type allowlist enforced ─────────────────────────────
describe('GET /api/search — type allowlist', () => {
  it('rejects invalid `type` values with 400', async () => {
    const res = await request(app).get('/').query({ q: 'cats', type: 'badType' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid search type/)
  })

  it('returns only the matching slice when type=sheets — courses/users/groups stay empty', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValue([
      {
        id: 5,
        title: 'Sheet Only',
        description: '',
        stars: 1,
        downloads: 0,
        createdAt: new Date(),
        course: null,
        author: null,
      },
    ])

    const res = await request(app).get('/').query({ q: 'sheet', type: 'sheets' })

    expect(res.status).toBe(200)
    expect(res.body.results.sheets).toHaveLength(1)
    expect(res.body.results.courses).toHaveLength(0)
    expect(res.body.results.users).toHaveLength(0)
    expect(res.body.results.groups).toHaveLength(0)
  })
})

// ── Coverage area #5: Limit clamp ─────────────────────────────────────────
describe('GET /api/search — limit clamping', () => {
  it('clamps an out-of-range limit to the 20-item ceiling', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    await request(app).get('/').query({ q: 'cap', type: 'sheets', limit: '9999' })

    const sheetCall = mocks.prisma.studySheet.findMany.mock.calls[0]?.[0]
    expect(sheetCall?.take).toBeLessThanOrEqual(20)
    expect(sheetCall?.take).toBeGreaterThan(0)
  })

  it('falls back to default limit on a non-numeric limit value', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    await request(app).get('/').query({ q: 'words', type: 'sheets', limit: 'banana' })
    const sheetCall = mocks.prisma.studySheet.findMany.mock.calls[0]?.[0]
    expect(sheetCall?.take).toBe(8)
  })
})

// ── Coverage area #6: Empty / short query path ────────────────────────────
describe('GET /api/search — empty query short-circuit', () => {
  it('returns an empty result envelope without touching Prisma when q is missing', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.results).toEqual({
      sheets: [],
      courses: [],
      users: [],
      notes: [],
      groups: [],
    })
    expect(mocks.prisma.studySheet.findMany).not.toHaveBeenCalled()
  })

  it('rejects an over-long query with 400 (200 char ceiling)', async () => {
    const overLong = 'x'.repeat(201)
    const res = await request(app).get('/').query({ q: overLong })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/too long/i)
  })
})

// ── Coverage area #7: Unauth viewer privacy ───────────────────────────────
describe('GET /api/search — unauth viewer privacy', () => {
  it('never returns notes for an anonymous searcher even when type=all', async () => {
    mocks.prisma.note.findMany.mockResolvedValue([
      {
        id: 1,
        title: 'Should Not Leak',
        createdAt: new Date(),
        course: null,
        author: null,
      },
    ])

    const res = await request(app).get('/').query({ q: 'note', type: 'all' })
    expect(res.status).toBe(200)
    expect(res.body.results.notes).toHaveLength(0)
    // The anonymous branch must not even hit the note table.
    expect(mocks.prisma.note.findMany).not.toHaveBeenCalled()
  })

  it('only surfaces public groups for anonymous viewers', async () => {
    mocks.prisma.studyGroup.findMany.mockImplementation(async ({ where }) => {
      if (where?.privacy === 'public') {
        return [
          {
            id: 1,
            name: 'Open Group',
            description: 'public chat',
            privacy: 'public',
            courseId: 1,
            course: null,
            createdAt: new Date(),
            _count: { members: 3 },
          },
        ]
      }
      return []
    })

    const res = await request(app).get('/').query({ q: 'open', type: 'groups' })
    expect(res.status).toBe(200)
    expect(res.body.results.groups).toHaveLength(1)
    expect(res.body.results.groups[0].privacy).toBe('public')

    const groupCall = mocks.prisma.studyGroup.findMany.mock.calls[0]?.[0]
    expect(groupCall?.where?.privacy).toBe('public')
  })
})

// ── Coverage area #8: Shared sheet text-search clauses ────────────────────
describe('GET /api/search — shared sheet text-search clauses', () => {
  it('includes title/content/description in the sheet OR clauses (SheetsPage parity)', async () => {
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    await request(app).get('/').query({ q: 'osmosis', type: 'sheets' })

    const sheetCall = mocks.prisma.studySheet.findMany.mock.calls[0]?.[0]
    expect(sheetCall?.where?.OR).toEqual(
      expect.arrayContaining([
        { title: { contains: 'osmosis', mode: 'insensitive' } },
        { content: { contains: 'osmosis', mode: 'insensitive' } },
        { description: { contains: 'osmosis', mode: 'insensitive' } },
      ]),
    )
    expect(sheetCall?.where?.status).toBe('published')
  })
})
