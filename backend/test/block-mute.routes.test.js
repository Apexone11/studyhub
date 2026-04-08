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
      findFirst: vi.fn(),
    },
    userFollow: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    userBlock: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    userMute: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    note: {
      findMany: vi.fn(),
    },
    starredSheet: {
      findMany: vi.fn(),
    },
    studySheet: {
      count: vi.fn(),
    },
    userPinnedSheet: {
      findMany: vi.fn(),
    },
    userPreferences: {
      findMany: vi.fn(),
    },
    enrollment: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
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
    profileVisibility: {
      getProfileAccessDecision: vi.fn().mockResolvedValue({ allowed: true, visibility: 'public' }),
      PROFILE_VISIBILITY: { PUBLIC: 'public', ENROLLED: 'enrolled', PRIVATE: 'private' },
    },
    userBadges: {
      enrichUserWithBadges: vi.fn((user) => Promise.resolve({ ...user, plan: 'free', isDonor: false, donorLevel: null })),
      enrichUsersWithBadges: vi.fn((users) => Promise.resolve(users)),
    },
    badges: {
      checkAndAwardBadges: vi.fn(),
    },
    streaks: {
      getUserStreak: vi.fn().mockResolvedValue({ currentStreak: 0, longestStreak: 0 }),
      getWeeklyActivity: vi.fn().mockResolvedValue({ daysActive: 0, goal: 5, goalMet: false }),
    },
    rateLimiters: {
      readLimiter: (_req, _res, next) => next(),
      usersFollowLimiter: (_req, _res, next) => next(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/lib/authTokens'), mocks.authTokens],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/profileVisibility'), mocks.profileVisibility],
  [require.resolve('../src/lib/userBadges'), mocks.userBadges],
  [require.resolve('../src/lib/badges'), mocks.badges],
  [require.resolve('../src/lib/streaks'), mocks.streaks],
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
  mocks.prisma.studySheet.count.mockResolvedValue(0)
  mocks.prisma.userPinnedSheet.findMany.mockResolvedValue([])
  mocks.prisma.userPreferences.findMany.mockResolvedValue([])
  mocks.prisma.enrollment.findMany.mockResolvedValue([])
  mocks.prisma.userFollow.findUnique.mockResolvedValue(null)
  mocks.prisma.userFollow.count.mockResolvedValue(0)
  mocks.prisma.notify?.createNotification?.mockResolvedValue({})
  // Block/mute defaults
  mocks.prisma.user.findFirst.mockResolvedValue(null)
  mocks.prisma.userBlock.findUnique.mockResolvedValue(null)
  mocks.prisma.userBlock.findMany.mockResolvedValue([])
  mocks.prisma.userBlock.deleteMany.mockResolvedValue({ count: 0 })
  mocks.prisma.userMute.findUnique.mockResolvedValue(null)
  mocks.prisma.userMute.findMany.mockResolvedValue([])
  mocks.prisma.userMute.deleteMany.mockResolvedValue({ count: 0 })
  mocks.prisma.userFollow.deleteMany.mockResolvedValue({ count: 0 })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCK ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('block/mute routes', () => {
  describe('POST /:username/block', () => {
    it('blocks a user and returns { blocked: true }', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue({ id: 99 })
      mocks.prisma.userBlock.create.mockResolvedValue({})
      mocks.prisma.userFollow.deleteMany.mockResolvedValue({ count: 0 })

      const res = await request(app).post('/target_user/block').send({})

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ blocked: true })
    })

    it('returns 400 when blocking self', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue({ id: 42 })

      const res = await request(app).post('/test_user/block').send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/yourself/i)
    })

    it('returns 404 when target does not exist', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue(null)

      const res = await request(app).post('/ghost/block').send({})

      expect(res.status).toBe(404)
    })

    it('returns blocked:true when user is already blocked (P2002)', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue({ id: 99 })
      const duplicateError = new Error('Unique constraint')
      duplicateError.code = 'P2002'
      mocks.prisma.userBlock.create.mockRejectedValue(duplicateError)

      const res = await request(app).post('/target_user/block').send({})

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ blocked: true })
    })
  })

  describe('DELETE /:username/block', () => {
    it('unblocks a user and returns { blocked: false }', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue({ id: 99 })
      mocks.prisma.userBlock.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app).delete('/target_user/block')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ blocked: false })
    })

    it('returns 404 when target user does not exist', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue(null)

      const res = await request(app).delete('/ghost/block')

      expect(res.status).toBe(404)
    })
  })

  describe('GET /me/blocked', () => {
    it('returns list of blocked users', async () => {
      mocks.prisma.userBlock.findMany.mockResolvedValue([
        {
          blockedId: 99,
          createdAt: new Date('2026-03-01'),
          blocked: { id: 99, username: 'blocked_user', avatarUrl: null },
        },
      ])

      const res = await request(app).get('/me/blocked')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0]).toMatchObject({ id: 99, username: 'blocked_user' })
    })

    it('returns empty array when no users blocked', async () => {
      mocks.prisma.userBlock.findMany.mockResolvedValue([])

      const res = await request(app).get('/me/blocked')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })

  /* ═══════════════════════════════════════════════════════════════════════
   * MUTE ENDPOINTS
   * ═══════════════════════════════════════════════════════════════════════ */
  describe('POST /:username/mute', () => {
    it('mutes a user and returns { muted: true }', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue({ id: 99 })
      mocks.prisma.userMute.create.mockResolvedValue({})

      const res = await request(app).post('/target_user/mute').send({})

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ muted: true })
    })

    it('returns 400 when muting self', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue({ id: 42 })

      const res = await request(app).post('/test_user/mute').send({})

      expect(res.status).toBe(400)
    })

    it('returns muted:true when user is already muted (P2002)', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue({ id: 99 })
      const duplicateError = new Error('Unique constraint')
      duplicateError.code = 'P2002'
      mocks.prisma.userMute.create.mockRejectedValue(duplicateError)

      const res = await request(app).post('/target_user/mute').send({})

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ muted: true })
    })
  })

  describe('DELETE /:username/mute', () => {
    it('unmutes a user and returns { muted: false }', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue({ id: 99 })
      mocks.prisma.userMute.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app).delete('/target_user/mute')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ muted: false })
    })

    it('returns 404 when target user does not exist', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue(null)

      const res = await request(app).delete('/ghost/mute')

      expect(res.status).toBe(404)
    })
  })

  describe('GET /me/muted', () => {
    it('returns list of muted users', async () => {
      mocks.prisma.userMute.findMany.mockResolvedValue([
        {
          mutedId: 88,
          createdAt: new Date('2026-03-10'),
          muted: { id: 88, username: 'muted_user', avatarUrl: '/img.png' },
        },
      ])

      const res = await request(app).get('/me/muted')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0]).toMatchObject({ id: 88, username: 'muted_user' })
    })
  })
})
