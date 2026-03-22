import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const notesRoutePath = require.resolve('../src/modules/notes')

const mocks = vi.hoisted(() => {
  const prisma = {
    note: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    requireVerifiedEmail: vi.fn((req, _res, next) => next()),
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
  [require.resolve('../src/middleware/requireVerifiedEmail'), mocks.requireVerifiedEmail],
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

  delete require.cache[notesRoutePath]
  const routerModule = require(notesRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[notesRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.note.count.mockResolvedValue(0)
  mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ user, ownerId }) => {
    return user.role === 'admin' || Number(ownerId) === Number(user.userId)
  })
})

describe('notes routes', () => {
  describe('GET /', () => {
    it('returns user notes', async () => {
      mocks.prisma.note.findMany.mockResolvedValue([
        {
          id: 1,
          title: 'My Note',
          content: 'Note content',
          private: true,
          userId: 42,
          updatedAt: new Date(),
          course: { id: 1, code: 'CS101' },
        },
      ])
      mocks.prisma.note.count.mockResolvedValue(1)

      const response = await request(app).get('/')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        notes: expect.any(Array),
        total: 1,
        page: 1,
      })
      expect(response.body.notes).toHaveLength(1)
      expect(response.body.notes[0]).toMatchObject({ title: 'My Note' })
    })

    it('filters notes by search query', async () => {
      mocks.prisma.note.findMany.mockResolvedValue([])
      mocks.prisma.note.count.mockResolvedValue(0)

      const response = await request(app).get('/?q=algorithms')

      expect(response.status).toBe(200)
      expect(mocks.prisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 42,
            title: { contains: 'algorithms', mode: 'insensitive' },
          }),
        }),
      )
    })
  })

  describe('POST /', () => {
    it('creates a new note', async () => {
      mocks.prisma.note.create.mockResolvedValue({
        id: 2,
        title: 'New Note',
        content: 'Some content',
        private: true,
        userId: 42,
        courseId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        course: null,
      })

      const response = await request(app)
        .post('/')
        .send({ title: 'New Note', content: 'Some content' })

      expect(response.status).toBe(201)
      expect(response.body).toMatchObject({
        id: 2,
        title: 'New Note',
        content: 'Some content',
      })
    })

    it('validates title is required', async () => {
      const response = await request(app)
        .post('/')
        .send({ title: '', content: 'content' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({ error: 'Title is required.' })
    })

    it('validates title length', async () => {
      const response = await request(app)
        .post('/')
        .send({ title: 'x'.repeat(121), content: 'content' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'Title must be 120 characters or fewer.',
      })
    })
  })

  describe('PATCH /:id', () => {
    it('updates a note owned by the user', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
        title: 'Old Title',
      })
      mocks.prisma.note.update.mockResolvedValue({
        id: 1,
        title: 'Updated Title',
        content: 'Updated content',
        userId: 42,
        course: null,
      })

      const response = await request(app)
        .patch('/1')
        .send({ title: 'Updated Title', content: 'Updated content' })

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ title: 'Updated Title' })
    })

    it('returns 404 when note does not exist', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue(null)

      const response = await request(app)
        .patch('/999')
        .send({ title: 'Nope' })

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'Note not found.' })
    })

    it('blocks updates to notes owned by other users', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({
        id: 1,
        userId: 99,
        title: 'Other user note',
      })
      mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ res }) => {
        res.status(403).json({ error: 'Not your note.', code: 'FORBIDDEN' })
        return false
      })

      const response = await request(app)
        .patch('/1')
        .send({ title: 'Stolen' })

      expect(response.status).toBe(403)
    })

    it('rejects empty title on update', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
        title: 'Current Title',
      })

      const response = await request(app)
        .patch('/1')
        .send({ title: '   ' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({ error: 'Title cannot be empty.' })
    })
  })

  describe('DELETE /:id', () => {
    it('deletes a note owned by the user', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
      })
      mocks.prisma.note.delete.mockResolvedValue({})

      const response = await request(app).delete('/1')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ message: 'Note deleted.' })
    })

    it('returns 404 when note does not exist', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue(null)

      const response = await request(app).delete('/999')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'Note not found.' })
    })

    it('blocks deletion of notes owned by other users', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({
        id: 1,
        userId: 99,
      })
      mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ res }) => {
        res.status(403).json({ error: 'Not your note.', code: 'FORBIDDEN' })
        return false
      })

      const response = await request(app).delete('/1')

      expect(response.status).toBe(403)
    })
  })
})
