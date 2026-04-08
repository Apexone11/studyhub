import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const searchRoutePath = require.resolve('../src/modules/search')

const SEARCH_SHEETS = [
  {
    searchableContent: 'Dijkstra shortest paths and priority queue walkthroughs.',
    result: {
      id: 501,
      title: 'Algorithms Graph Review',
      description: 'Focused review on graph traversal patterns.',
      stars: 12,
      downloads: 34,
      createdAt: new Date('2026-03-18T19:59:00.000Z'),
      course: { id: 101, code: 'CMSC351', name: 'Algorithms' },
      author: { id: 17, username: 'graph_guru' },
    },
  },
  {
    searchableContent: 'Balanced trees and heap invariants.',
    result: {
      id: 502,
      title: 'Data Structures Review',
      description: 'Trees, heaps, and hash tables.',
      stars: 8,
      downloads: 21,
      createdAt: new Date('2026-03-18T19:58:00.000Z'),
      course: { id: 102, code: 'CMSC132', name: 'Object-Oriented Programming II' },
      author: { id: 18, username: 'tree_keeper' },
    },
  },
]

const SEARCH_USERS = [
  {
    id: 7,
    username: 'public_user',
    role: 'student',
    avatarUrl: null,
    createdAt: new Date('2026-03-18T20:00:00.000Z'),
  },
  {
    id: 8,
    username: 'private_user',
    role: 'student',
    avatarUrl: null,
    createdAt: new Date('2026-03-18T20:01:00.000Z'),
  },
  {
    id: 9,
    username: 'enrolled_user',
    role: 'student',
    avatarUrl: null,
    createdAt: new Date('2026-03-18T20:02:00.000Z'),
  },
  {
    id: 42,
    username: 'viewer_user',
    role: 'student',
    avatarUrl: null,
    createdAt: new Date('2026-03-18T20:03:00.000Z'),
  },
]

const VISIBILITY_BY_USER_ID = new Map([
  [8, 'private'],
  [9, 'enrolled'],
  [42, 'private'],
])

const SESSION_BY_TOKEN = {
  'student-token': { userId: 42, role: 'student' },
  'outsider-token': { userId: 55, role: 'student' },
  'admin-token': { userId: 999, role: 'admin' },
}

const ENROLLMENTS = [
  { userId: 42, courseId: 100 },
  { userId: 55, courseId: 200 },
  { userId: 9, courseId: 100 },
]

const mocks = vi.hoisted(() => {
  const prisma = {
    studySheet: {
      findMany: vi.fn(),
    },
    course: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    userPreferences: {
      findMany: vi.fn(),
    },
    enrollment: {
      findMany: vi.fn(),
    },
    note: {
      findMany: vi.fn(),
    },
    studyGroup: {
      findMany: vi.fn(),
    },
  }

  return {
    prisma,
    authTokens: {
      getAuthTokenFromRequest: vi.fn((req) => req.headers['x-studyhub-test-token'] || null),
      verifyAuthToken: vi.fn((token) => {
        const session = SESSION_BY_TOKEN[token]
        if (!session) {
          throw new Error('invalid token')
        }
        return session
      }),
    },
    rateLimiters: {
      searchLimiter: (_req, _res, next) => next(),
    },
    blockFilter: {
      getBlockedUserIds: vi.fn().mockResolvedValue([]),
    },
    sentry: {
      captureError: vi.fn(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/authTokens'), mocks.authTokens],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
])

const originalModuleLoad = Module._load

let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[searchRoutePath]
  const searchRouterModule = require(searchRoutePath)
  const searchRouter = searchRouterModule.default || searchRouterModule

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

  mocks.prisma.studySheet.findMany.mockImplementation(async ({ where, take }) => {
    const query = String(
      where?.OR?.find((clause) => clause.title)?.title?.contains
        || where?.OR?.find((clause) => clause.content)?.content?.contains
        || where?.OR?.find((clause) => clause.description)?.description?.contains
        || ''
    ).toLowerCase()

    return SEARCH_SHEETS
      .filter(({ searchableContent, result }) => {
        if (where?.status !== 'published') {
          return false
        }

        return [result.title, result.description, searchableContent]
          .some((value) => String(value).toLowerCase().includes(query))
      })
      .map(({ result }) => result)
      .slice(0, take)
  })
  mocks.prisma.course.findMany.mockResolvedValue([])
  mocks.prisma.user.findMany.mockImplementation(async ({ where, take }) => {
    const query = String(where?.username?.contains || '').toLowerCase()

    return SEARCH_USERS
      .filter((user) => user.username.toLowerCase().includes(query))
      .sort((left, right) => left.username.localeCompare(right.username))
      .slice(0, take)
  })
  mocks.prisma.userPreferences.findMany.mockImplementation(async ({ where }) => {
    const userIds = where?.userId?.in || []

    return userIds
      .filter((userId) => VISIBILITY_BY_USER_ID.has(userId))
      .map((userId) => ({
        userId,
        profileVisibility: VISIBILITY_BY_USER_ID.get(userId),
      }))
  })
  mocks.prisma.enrollment.findMany.mockImplementation(async ({ where }) => {
    if (typeof where?.userId === 'number') {
      return ENROLLMENTS
        .filter((enrollment) => enrollment.userId === where.userId)
        .map((enrollment) => ({ courseId: enrollment.courseId }))
    }

    const userIds = where?.userId?.in || []

    return ENROLLMENTS
      .filter((enrollment) => userIds.includes(enrollment.userId))
      .map((enrollment) => ({
        userId: enrollment.userId,
        courseId: enrollment.courseId,
      }))
  })
  mocks.prisma.note.findMany.mockResolvedValue([])
  mocks.prisma.studyGroup.findMany.mockResolvedValue([])
})

describe('search routes', () => {
  it('matches sheets by content in global search results', async () => {
    const response = await request(app).get('/').query({ q: 'dijkstra', type: 'sheets' })

    expect(response.status).toBe(200)
    expect(response.body.results.sheets.map((sheet) => sheet.title)).toEqual(['Algorithms Graph Review'])
  })

  it('hides private and classmates-only users from unauthenticated searches', async () => {
    const response = await request(app).get('/').query({ q: 'user', type: 'users' })

    expect(response.status).toBe(200)
    expect(response.body.results.users.map((user) => user.username)).toEqual(['public_user'])
  })

  it('shows classmates-only users to classmates and keeps own private profile visible', async () => {
    const response = await request(app)
      .get('/')
      .set('x-studyhub-test-token', 'student-token')
      .query({ q: 'user', type: 'users' })

    expect(response.status).toBe(200)
    expect(response.body.results.users.map((user) => user.username)).toEqual([
      'enrolled_user',
      'public_user',
      'viewer_user',
    ])
  })

  it('keeps classmates-only users hidden from non-classmates', async () => {
    const response = await request(app)
      .get('/')
      .set('x-studyhub-test-token', 'outsider-token')
      .query({ q: 'user', type: 'users' })

    expect(response.status).toBe(200)
    expect(response.body.results.users.map((user) => user.username)).toEqual(['public_user'])
  })

  it('allows admins to search all matching users regardless of visibility', async () => {
    const response = await request(app)
      .get('/')
      .set('x-studyhub-test-token', 'admin-token')
      .query({ q: 'user', type: 'users' })

    expect(response.status).toBe(200)
    expect(response.body.results.users.map((user) => user.username)).toEqual([
      'enrolled_user',
      'private_user',
      'public_user',
      'viewer_user',
    ])
    expect(mocks.sentry.captureError).not.toHaveBeenCalled()
  })

  // ── Notes search tests ──────────────────────────────────────────
  it('returns shared notes in search results', async () => {
    mocks.prisma.note.findMany.mockResolvedValue([
      { id: 301, title: 'Study Guide Chapter 5', tags: '["exam-review"]', createdAt: new Date(), course: { id: 10, code: 'CMSC132', name: 'OOP II' }, author: { id: 99, username: 'note_author' } },
    ])

    const response = await request(app)
      .get('/')
      .set('x-studyhub-test-token', 'student-token')
      .query({ q: 'Study Guide', type: 'all' })

    expect(response.status).toBe(200)
    expect(response.body.results.notes).toBeDefined()
    expect(response.body.results.notes.length).toBe(1)
    expect(response.body.results.notes[0].title).toBe('Study Guide Chapter 5')
  })

  it('only queries shared notes (private: false in where clause)', async () => {
    mocks.prisma.note.findMany.mockResolvedValue([])

    await request(app)
      .get('/')
      .set('x-studyhub-test-token', 'student-token')
      .query({ q: 'anything', type: 'notes' })

    const noteCall = mocks.prisma.note.findMany.mock.calls[0]?.[0]
    expect(noteCall?.where?.private).toBe(false)
    expect(noteCall?.where?.OR).toEqual(
      expect.arrayContaining([
        { title: { contains: 'anything', mode: 'insensitive' } },
        { content: { contains: 'anything', mode: 'insensitive' } },
        { tags: { contains: 'anything', mode: 'insensitive' } },
      ])
    )
  })

  it('does not return notes for unauthenticated search', async () => {
    const response = await request(app)
      .get('/')
      .query({ q: 'Public Note', type: 'all' })

    // Notes are skipped for unauthenticated users
    expect(response.status).toBe(200)
    expect(response.body.results.notes).toBeDefined()
    expect(response.body.results.notes).toHaveLength(0)
  })

  it('does not expose note content in search results', async () => {
    mocks.prisma.note.findMany.mockResolvedValue([
      { id: 303, title: 'Secret Content Note', createdAt: new Date(), course: null, author: { id: 1, username: 'user1' } },
    ])

    const response = await request(app)
      .get('/')
      .set('x-studyhub-test-token', 'student-token')
      .query({ q: 'Secret', type: 'notes' })

    expect(response.status).toBe(200)
    const note = response.body.results.notes[0]
    // The select clause only picks id, title, createdAt, course, author — no content
    expect(note.content).toBeUndefined()
  })

  it('accepts notes as a valid search type', async () => {
    const response = await request(app)
      .get('/')
      .set('x-studyhub-test-token', 'student-token')
      .query({ q: 'test', type: 'notes' })

    expect(response.status).toBe(200)
    expect(response.body.type).toBe('notes')
  })
})