import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const usersRoutePath = require.resolve('../src/modules/users')

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    userFollow: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    note: {
      findMany: vi.fn(),
    },
    starredSheet: {
      findMany: vi.fn(),
    },
    userPreferences: {
      findMany: vi.fn(),
    },
    enrollment: {
      findMany: vi.fn(),
    },
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    authTokens: {
      getAuthTokenFromRequest: vi.fn(() => null),
      verifyAuthToken: vi.fn(),
    },
    sentry: {
      captureError: vi.fn(),
    },
    notify: {
      createNotification: vi.fn(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/lib/authTokens'), mocks.authTokens],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/notify'), mocks.notify],
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

  delete require.cache[usersRoutePath]
  const usersRouterModule = require(usersRoutePath)
  const usersRouter = usersRouterModule.default || usersRouterModule

  app = express()
  app.use(express.json())
  app.use('/', usersRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[usersRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()

  mocks.authTokens.getAuthTokenFromRequest.mockReturnValue(null)

  mocks.prisma.note.findMany.mockResolvedValue([])
  mocks.prisma.starredSheet.findMany.mockResolvedValue([])
  mocks.prisma.userPreferences.findMany.mockResolvedValue([])
  mocks.prisma.enrollment.findMany.mockResolvedValue([])
  mocks.prisma.userFollow.findUnique.mockResolvedValue(null)
  mocks.prisma.userFollow.count.mockResolvedValue(0)
  mocks.notify.createNotification.mockResolvedValue({})
})

describe('users routes', () => {
  describe('GET /:username', () => {
    it('returns user profile with sheets, notes, and starred', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 10,
        username: 'profile_user',
        role: 'student',
        avatarUrl: null,
        createdAt: new Date('2026-01-01'),
        _count: { studySheets: 3, followers: 5, following: 2 },
        enrollments: [],
        studySheets: [
          { id: 1, title: 'Sheet 1', createdAt: new Date(), course: null },
        ],
      })
      mocks.prisma.note.findMany.mockResolvedValue([
        { id: 1, title: 'Note 1', updatedAt: new Date(), course: null },
      ])
      mocks.prisma.starredSheet.findMany.mockResolvedValue([
        {
          sheet: {
            id: 2,
            title: 'Starred Sheet',
            stars: 5,
            updatedAt: new Date(),
            status: 'published',
            author: { id: 3, username: 'author' },
            course: { id: 1, code: 'CS101' },
          },
        },
      ])

      const response = await request(app).get('/profile_user')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        id: 10,
        username: 'profile_user',
        sheetCount: 3,
        followerCount: 5,
        followingCount: 2,
        isFollowing: false,
      })
      expect(response.body.recentSheets).toHaveLength(1)
      expect(response.body.sharedNotes).toHaveLength(1)
      expect(response.body.starredSheets).toHaveLength(1)
    })

    it('returns 404 for non-existent user', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue(null)

      const response = await request(app).get('/nonexistent')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'User not found.' })
    })

    it('returns 403 for private profiles', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 99,
        username: 'private_user',
        role: 'student',
        avatarUrl: null,
        createdAt: new Date(),
        _count: { studySheets: 0, followers: 0, following: 0 },
        enrollments: [],
        studySheets: [],
      })
      mocks.prisma.userPreferences.findMany.mockResolvedValue([
        { userId: 99, profileVisibility: 'private' },
      ])

      const response = await request(app).get('/private_user')

      expect(response.status).toBe(403)
      expect(response.body).toMatchObject({ error: 'This profile is private.' })
    })

    it('returns 403 for classmates-only profiles when not a classmate', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 88,
        username: 'enrolled_user',
        role: 'student',
        avatarUrl: null,
        createdAt: new Date(),
        _count: { studySheets: 0, followers: 0, following: 0 },
        enrollments: [],
        studySheets: [],
      })
      mocks.prisma.userPreferences.findMany.mockResolvedValue([
        { userId: 88, profileVisibility: 'enrolled' },
      ])
      // No shared enrollments
      mocks.prisma.enrollment.findMany.mockResolvedValue([])

      const response = await request(app).get('/enrolled_user')

      expect(response.status).toBe(403)
      expect(response.body).toMatchObject({
        error: 'This profile is only visible to classmates.',
      })
    })
  })

  describe('POST /:username/follow', () => {
    it('creates a follow relationship', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 10,
        username: 'target_user',
        _count: { followers: 5 },
      })
      mocks.prisma.userFollow.create.mockResolvedValue({})
      mocks.prisma.userFollow.count.mockResolvedValue(6)

      const response = await request(app).post('/target_user/follow')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ following: true, followerCount: 6 })
      expect(mocks.prisma.userFollow.create).toHaveBeenCalledWith({
        data: { followerId: 42, followingId: 10 },
      })
      expect(mocks.notify.createNotification).toHaveBeenCalled()
    })

    it('prevents self-follow', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 42,
        username: 'test_user',
        _count: { followers: 0 },
      })

      const response = await request(app).post('/test_user/follow')

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({ error: 'You cannot follow yourself.' })
      expect(mocks.prisma.userFollow.create).not.toHaveBeenCalled()
    })

    it('returns 404 when target user does not exist', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue(null)

      const response = await request(app).post('/ghost/follow')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'User not found.' })
    })

    it('returns 409 when already following', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 10,
        username: 'target_user',
        _count: { followers: 5 },
      })
      const duplicateError = new Error('Unique constraint')
      duplicateError.code = 'P2002'
      mocks.prisma.userFollow.create.mockRejectedValue(duplicateError)

      const response = await request(app).post('/target_user/follow')

      expect(response.status).toBe(409)
      expect(response.body).toMatchObject({ error: 'Already following this user.' })
    })
  })

  describe('DELETE /:username/follow', () => {
    it('removes a follow relationship', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 10 })
      mocks.prisma.userFollow.delete.mockResolvedValue({})
      mocks.prisma.userFollow.count.mockResolvedValue(4)

      const response = await request(app).delete('/target_user/follow')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ following: false, followerCount: 4 })
    })

    it('returns 404 when not following the user', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 10 })
      const notFoundError = new Error('Record not found')
      notFoundError.code = 'P2025'
      mocks.prisma.userFollow.delete.mockRejectedValue(notFoundError)

      const response = await request(app).delete('/target_user/follow')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'Not following this user.' })
    })

    it('returns 404 when target user does not exist', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue(null)

      const response = await request(app).delete('/ghost/follow')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'User not found.' })
    })
  })

  describe('GET /:username/followers', () => {
    it('returns followers list', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 10 })
      mocks.prisma.userFollow.findMany.mockResolvedValue([
        { follower: { id: 1, username: 'follower1', role: 'student', avatarUrl: null } },
        { follower: { id: 2, username: 'follower2', role: 'student', avatarUrl: null } },
      ])

      const response = await request(app).get('/target_user/followers')

      expect(response.status).toBe(200)
      expect(response.body).toHaveLength(2)
      expect(response.body[0]).toMatchObject({ username: 'follower1' })
    })

    it('returns 404 when user does not exist', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue(null)

      const response = await request(app).get('/ghost/followers')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'User not found.' })
    })
  })

  describe('GET /:username/following', () => {
    it('returns following list', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 10 })
      mocks.prisma.userFollow.findMany.mockResolvedValue([
        { following: { id: 3, username: 'followed1', role: 'student', avatarUrl: null } },
      ])

      const response = await request(app).get('/target_user/following')

      expect(response.status).toBe(200)
      expect(response.body).toHaveLength(1)
      expect(response.body[0]).toMatchObject({ username: 'followed1' })
    })

    it('returns 404 when user does not exist', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue(null)

      const response = await request(app).get('/ghost/following')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'User not found.' })
    })
  })
})
