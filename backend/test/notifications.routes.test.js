import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const notificationsRoutePath = require.resolve('../src/modules/notifications')

const mocks = vi.hoisted(() => {
  const prisma = {
    notification: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(({ user, ownerId }) => {
        return user.role === 'admin' || Number(ownerId) === Number(user.userId)
      }),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
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

  delete require.cache[notificationsRoutePath]
  const routerModule = require(notificationsRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[notificationsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ user, ownerId }) => {
    return user.role === 'admin' || Number(ownerId) === Number(user.userId)
  })
})

describe('notifications routes', () => {
  describe('GET /', () => {
    it('returns user notifications with unread count', async () => {
      mocks.prisma.notification.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 42,
          type: 'follow',
          message: 'Someone followed you.',
          read: false,
          createdAt: new Date(),
          actor: { id: 10, username: 'follower', avatarUrl: null },
        },
      ])
      mocks.prisma.notification.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1) // unreadCount

      const response = await request(app).get('/')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        notifications: expect.any(Array),
        total: 1,
        unreadCount: 1,
        limit: 20,
        offset: 0,
      })
      expect(response.body.notifications).toHaveLength(1)
    })

    it('respects limit and offset query parameters', async () => {
      mocks.prisma.notification.findMany.mockResolvedValue([])
      mocks.prisma.notification.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(10)

      const response = await request(app).get('/?limit=5&offset=10')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        limit: 5,
        offset: 10,
      })
      expect(mocks.prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
          skip: 10,
        }),
      )
    })
  })

  describe('PATCH /:id/read', () => {
    it('marks a notification as read', async () => {
      mocks.prisma.notification.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
        read: false,
      })
      mocks.prisma.notification.update.mockResolvedValue({
        id: 1,
        userId: 42,
        read: true,
      })

      const response = await request(app).patch('/1/read')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ id: 1, read: true })
    })

    it('returns 404 when notification does not exist', async () => {
      mocks.prisma.notification.findUnique.mockResolvedValue(null)

      const response = await request(app).patch('/999/read')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'Notification not found.' })
    })

    it('blocks marking other users notifications as read', async () => {
      mocks.prisma.notification.findUnique.mockResolvedValue({
        id: 1,
        userId: 99,
        read: false,
      })
      mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ res }) => {
        res.status(403).json({ error: 'Not your notification.', code: 'FORBIDDEN' })
        return false
      })

      const response = await request(app).patch('/1/read')

      expect(response.status).toBe(403)
    })
  })

  describe('PATCH /read-all', () => {
    it('marks all notifications as read', async () => {
      mocks.prisma.notification.updateMany.mockResolvedValue({ count: 5 })

      const response = await request(app).patch('/read-all')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ updated: 5 })
      expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 42, read: false },
        data: { read: true },
      })
    })

    it('returns zero when no unread notifications exist', async () => {
      mocks.prisma.notification.updateMany.mockResolvedValue({ count: 0 })

      const response = await request(app).patch('/read-all')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ updated: 0 })
    })
  })

  describe('DELETE /:id', () => {
    it('deletes a notification owned by the user', async () => {
      mocks.prisma.notification.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
      })
      mocks.prisma.notification.delete.mockResolvedValue({})

      const response = await request(app).delete('/1')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ message: 'Notification deleted.' })
    })

    it('returns 404 when notification does not exist', async () => {
      mocks.prisma.notification.findUnique.mockResolvedValue(null)

      const response = await request(app).delete('/999')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'Notification not found.' })
    })

    it('blocks deletion of other users notifications', async () => {
      mocks.prisma.notification.findUnique.mockResolvedValue({
        id: 1,
        userId: 99,
      })
      mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ res }) => {
        res.status(403).json({ error: 'Not your notification.', code: 'FORBIDDEN' })
        return false
      })

      const response = await request(app).delete('/1')

      expect(response.status).toBe(403)
    })
  })
})
