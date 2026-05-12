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
      deleteMany: vi.fn(),
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
      const baseRow = {
        id: 1,
        userId: 42,
        type: 'follow',
        message: 'Someone followed you.',
        read: false,
        createdAt: new Date(),
        actor: { id: 10, username: 'follower', avatarUrl: null },
      }
      // The grouping pass fetches the main page AND a parallel unread set
      // for the badge count. Mock both calls.
      mocks.prisma.notification.findMany
        .mockResolvedValueOnce([baseRow])
        .mockResolvedValueOnce([baseRow])

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

    it('groups distinct actors who starred the same sheet within 24h', async () => {
      // Three different users star the same sheet within 24h — the bell
      // should collapse them into one grouped row with actorCount=3.
      const baseTime = new Date('2026-05-12T10:00:00Z').getTime()
      const rows = [
        {
          id: 30,
          userId: 42,
          type: 'star',
          message: 'starred your sheet.',
          read: false,
          sheetId: 7,
          linkPath: '/sheets/7',
          createdAt: new Date(baseTime),
          actor: { id: 3, username: 'carol', avatarUrl: null },
        },
        {
          id: 20,
          userId: 42,
          type: 'star',
          message: 'starred your sheet.',
          read: false,
          sheetId: 7,
          linkPath: '/sheets/7',
          createdAt: new Date(baseTime - 60_000),
          actor: { id: 2, username: 'bob', avatarUrl: null },
        },
        {
          id: 10,
          userId: 42,
          type: 'star',
          message: 'starred your sheet.',
          read: false,
          sheetId: 7,
          linkPath: '/sheets/7',
          createdAt: new Date(baseTime - 120_000),
          actor: { id: 1, username: 'alice', avatarUrl: null },
        },
      ]
      mocks.prisma.notification.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows)

      const response = await request(app).get('/')

      expect(response.status).toBe(200)
      // One grouped row carrying all three actors.
      expect(response.body.notifications).toHaveLength(1)
      const group = response.body.notifications[0]
      expect(group.grouped).toBe(true)
      expect(group.actorCount).toBe(3)
      expect(group.actors).toHaveLength(3)
      expect(group.actors.map((a) => a.username)).toEqual(['carol', 'bob', 'alice'])
      expect(group.groupedIds.sort()).toEqual([10, 20, 30])
      // Unread group count should be 1, not 3.
      expect(response.body.unreadCount).toBe(1)
      expect(response.body.unreadRawCount).toBe(3)
    })

    it('caps actors at 3 and reports overflow via actorCount', async () => {
      const baseTime = new Date('2026-05-12T10:00:00Z').getTime()
      const rows = [5, 4, 3, 2, 1].map((id) => ({
        id: id * 10,
        userId: 42,
        type: 'star',
        message: 'starred your sheet.',
        read: false,
        sheetId: 7,
        linkPath: '/sheets/7',
        createdAt: new Date(baseTime - (5 - id) * 60_000),
        actor: { id, username: `user${id}`, avatarUrl: null },
      }))
      mocks.prisma.notification.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows)

      const response = await request(app).get('/')

      expect(response.status).toBe(200)
      expect(response.body.notifications).toHaveLength(1)
      const group = response.body.notifications[0]
      expect(group.actorCount).toBe(5)
      expect(group.actors).toHaveLength(3)
      expect(group.groupedIds).toHaveLength(5)
    })

    it('does NOT group critical notification types (mention, reply, comment)', async () => {
      const baseTime = new Date('2026-05-12T10:00:00Z').getTime()
      const rows = [
        {
          id: 2,
          userId: 42,
          type: 'mention',
          message: 'mentioned you.',
          read: false,
          linkPath: '/feed/posts/9',
          createdAt: new Date(baseTime),
          actor: { id: 2, username: 'bob', avatarUrl: null },
        },
        {
          id: 1,
          userId: 42,
          type: 'mention',
          message: 'mentioned you.',
          read: false,
          linkPath: '/feed/posts/9',
          createdAt: new Date(baseTime - 60_000),
          actor: { id: 1, username: 'alice', avatarUrl: null },
        },
      ]
      mocks.prisma.notification.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows)

      const response = await request(app).get('/')

      expect(response.status).toBe(200)
      // Each mention stays its own row — context is irreplaceable.
      expect(response.body.notifications).toHaveLength(2)
      expect(response.body.notifications.every((n) => !n.grouped)).toBe(true)
    })

    it('does NOT group entries older than 24h together', async () => {
      const baseTime = new Date('2026-05-12T10:00:00Z').getTime()
      const rows = [
        {
          id: 2,
          userId: 42,
          type: 'star',
          message: 'starred your sheet.',
          read: false,
          sheetId: 7,
          linkPath: '/sheets/7',
          createdAt: new Date(baseTime),
          actor: { id: 2, username: 'bob', avatarUrl: null },
        },
        {
          id: 1,
          userId: 42,
          type: 'star',
          message: 'starred your sheet.',
          read: false,
          sheetId: 7,
          linkPath: '/sheets/7',
          // 25h earlier — outside the 24h window.
          createdAt: new Date(baseTime - 25 * 60 * 60 * 1000),
          actor: { id: 1, username: 'alice', avatarUrl: null },
        },
      ]
      mocks.prisma.notification.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows)

      const response = await request(app).get('/')

      expect(response.status).toBe(200)
      expect(response.body.notifications).toHaveLength(2)
    })

    it('respects limit and offset query parameters (after grouping)', async () => {
      mocks.prisma.notification.findMany.mockResolvedValue([])

      const response = await request(app).get('/?limit=5&offset=10')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        limit: 5,
        offset: 10,
      })
      // Over-fetch shape: take is bounded by MAX_RAW_ROWS_FOR_GROUPING (300)
      // and scales with offset+limit. For limit=5, offset=10 we expect 75
      // (i.e. (10+5)*5).
      expect(mocks.prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 75,
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

    it('sweeps the whole group when groupedIds is provided', async () => {
      mocks.prisma.notification.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
        read: false,
      })
      mocks.prisma.notification.updateMany.mockResolvedValue({ count: 3 })

      const response = await request(app).patch('/1/read?groupedIds=2,3')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ id: 1, read: true, groupedIds: [2, 3] })
      // userId scope on updateMany is the defense-in-depth guard — a forged
      // groupedIds list must NOT sweep another user's inbox.
      expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2, 3] }, userId: 42 },
        data: { read: true },
      })
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

  describe('DELETE /read (clear read notifications)', () => {
    it('deletes all read notifications for the user', async () => {
      mocks.prisma.notification.deleteMany.mockResolvedValue({ count: 7 })

      const response = await request(app).delete('/read')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ deleted: 7 })
      expect(mocks.prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { userId: 42, read: true },
      })
    })

    it('returns zero when no read notifications exist', async () => {
      mocks.prisma.notification.deleteMany.mockResolvedValue({ count: 0 })

      const response = await request(app).delete('/read')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ deleted: 0 })
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
