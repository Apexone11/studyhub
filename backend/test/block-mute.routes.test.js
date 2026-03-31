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
    userBlock: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    userMute: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
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
  mocks.prisma.userPreferences.findMany.mockResolvedValue([])
  mocks.prisma.enrollment.findMany.mockResolvedValue([])
  mocks.prisma.userFollow.findUnique.mockResolvedValue(null)
  mocks.prisma.userFollow.count.mockResolvedValue(0)
  mocks.prisma.notify?.createNotification?.mockResolvedValue({})
  // Block/mute defaults
  mocks.prisma.userBlock.findUnique.mockResolvedValue(null)
  mocks.prisma.userBlock.findMany.mockResolvedValue([])
  mocks.prisma.userMute.findUnique.mockResolvedValue(null)
  mocks.prisma.userMute.findMany.mockResolvedValue([])
})

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCK ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('block/mute routes', () => {
  describe('POST /:username/block', () => {
    it('blocks a user and returns { blocked: true }', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 99, username: 'target_user' })
      mocks.prisma.userBlock.findUnique.mockResolvedValue(null) // not already blocked
      mocks.prisma.$transaction.mockResolvedValue([{}, {}])

      const res = await request(app).post('/target_user/block').send({})

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ blocked: true })
    })

    it('returns 400 when blocking self', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 42, username: 'test_user' })

      const res = await request(app).post('/test_user/block').send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/yourself/i)
    })

    it('returns 404 when target does not exist', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue(null)

      const res = await request(app).post('/ghost/block').send({})

      expect(res.status).toBe(404)
    })

    it('returns 409 when user is already blocked', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 99, username: 'target_user' })
      mocks.prisma.userBlock.findUnique.mockResolvedValue({ blockerId: 42, blockedId: 99 })

      const res = await request(app).post('/target_user/block').send({})

      expect(res.status).toBe(409)
    })
  })

  describe('DELETE /:username/block', () => {
    it('unblocks a user and returns { blocked: false }', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 99, username: 'target_user' })
      mocks.prisma.userBlock.findUnique.mockResolvedValue({ blockerId: 42, blockedId: 99 })
      mocks.prisma.userBlock.delete.mockResolvedValue({})

      const res = await request(app).delete('/target_user/block')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ blocked: false })
    })

    it('returns 404 when block does not exist', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 99, username: 'target_user' })
      mocks.prisma.userBlock.findUnique.mockResolvedValue(null)

      const res = await request(app).delete('/target_user/block')

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
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 99, username: 'target_user' })
      mocks.prisma.userMute.findUnique.mockResolvedValue(null)
      mocks.prisma.userMute.create.mockResolvedValue({})

      const res = await request(app).post('/target_user/mute').send({})

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ muted: true })
    })

    it('returns 400 when muting self', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 42, username: 'test_user' })

      const res = await request(app).post('/test_user/mute').send({})

      expect(res.status).toBe(400)
    })

    it('returns 409 when user is already muted', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 99, username: 'target_user' })
      mocks.prisma.userMute.findUnique.mockResolvedValue({ muterId: 42, mutedId: 99 })

      const res = await request(app).post('/target_user/mute').send({})

      expect(res.status).toBe(409)
    })
  })

  describe('DELETE /:username/mute', () => {
    it('unmutes a user and returns { muted: false }', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 99, username: 'target_user' })
      mocks.prisma.userMute.findUnique.mockResolvedValue({ muterId: 42, mutedId: 99 })
      mocks.prisma.userMute.delete.mockResolvedValue({})

      const res = await request(app).delete('/target_user/mute')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ muted: false })
    })

    it('returns 404 when mute does not exist', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 99, username: 'target_user' })
      mocks.prisma.userMute.findUnique.mockResolvedValue(null)

      const res = await request(app).delete('/target_user/mute')

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
