import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const announcementsRoutePath = require.resolve('../src/routes/announcements')

const mocks = vi.hoisted(() => {
  const state = { role: 'student' }
  const prisma = {
    announcement: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: state.role }
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    accessControl: {
      sendForbidden: vi.fn((res, message) => {
        res.status(403).json({ error: message, code: 'FORBIDDEN' })
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

  delete require.cache[announcementsRoutePath]
  const routerModule = require(announcementsRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[announcementsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.role = 'student'
})

describe('announcements routes', () => {
  describe('GET /', () => {
    it('returns announcements', async () => {
      mocks.prisma.announcement.findMany.mockResolvedValue([
        {
          id: 1,
          title: 'Welcome',
          body: 'Hello everyone!',
          pinned: true,
          createdAt: new Date(),
          author: { id: 1, username: 'admin' },
        },
        {
          id: 2,
          title: 'Update',
          body: 'New features coming.',
          pinned: false,
          createdAt: new Date(),
          author: { id: 1, username: 'admin' },
        },
      ])

      const response = await request(app).get('/')

      expect(response.status).toBe(200)
      expect(response.body).toHaveLength(2)
      expect(response.body[0]).toMatchObject({ title: 'Welcome', pinned: true })
    })

    it('returns 500 on database error', async () => {
      mocks.prisma.announcement.findMany.mockRejectedValue(new Error('db error'))

      const response = await request(app).get('/')

      expect(response.status).toBe(500)
      expect(response.body).toMatchObject({ error: 'Server error.' })
      expect(mocks.sentry.captureError).toHaveBeenCalled()
    })
  })

  describe('POST /', () => {
    it('allows admin to create an announcement', async () => {
      mocks.state.role = 'admin'
      mocks.prisma.announcement.create.mockResolvedValue({
        id: 3,
        title: 'New Announcement',
        body: 'Important information.',
        pinned: false,
        authorId: 42,
        createdAt: new Date(),
        author: { id: 42, username: 'test_user' },
      })

      const response = await request(app)
        .post('/')
        .send({ title: 'New Announcement', body: 'Important information.' })

      expect(response.status).toBe(201)
      expect(response.body).toMatchObject({
        title: 'New Announcement',
        body: 'Important information.',
      })
    })

    it('rejects non-admin users', async () => {
      mocks.state.role = 'student'

      const response = await request(app)
        .post('/')
        .send({ title: 'Hack', body: 'Should not work.' })

      expect(response.status).toBe(403)
      expect(mocks.prisma.announcement.create).not.toHaveBeenCalled()
    })

    it('validates title is required', async () => {
      mocks.state.role = 'admin'

      const response = await request(app)
        .post('/')
        .send({ title: '', body: 'Has body but no title.' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({ error: 'Title is required.' })
    })

    it('validates body is required', async () => {
      mocks.state.role = 'admin'

      const response = await request(app)
        .post('/')
        .send({ title: 'Has Title', body: '' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({ error: 'Body is required.' })
    })

    it('validates title length', async () => {
      mocks.state.role = 'admin'

      const response = await request(app)
        .post('/')
        .send({ title: 'x'.repeat(201), body: 'Valid body.' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'Title must be 200 characters or fewer.',
      })
    })
  })

  describe('DELETE /:id', () => {
    it('allows admin to delete an announcement', async () => {
      mocks.state.role = 'admin'
      mocks.prisma.announcement.delete.mockResolvedValue({})

      const response = await request(app).delete('/1')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ message: 'Announcement deleted.' })
    })

    it('rejects non-admin users', async () => {
      mocks.state.role = 'student'

      const response = await request(app).delete('/1')

      expect(response.status).toBe(403)
      expect(mocks.prisma.announcement.delete).not.toHaveBeenCalled()
    })

    it('returns 404 when announcement does not exist', async () => {
      mocks.state.role = 'admin'
      const notFoundError = new Error('Not found')
      notFoundError.code = 'P2025'
      mocks.prisma.announcement.delete.mockRejectedValue(notFoundError)

      const response = await request(app).delete('/999')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'Announcement not found.' })
    })
  })
})
