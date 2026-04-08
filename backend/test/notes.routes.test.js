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
    noteStar: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    noteReaction: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    noteComment: {
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
    moderationEngine: {
      isModerationEnabled: vi.fn(() => true),
      scanContent: vi.fn(),
    },
    notify: {
      createNotification: vi.fn(),
    },
    mentions: {
      notifyMentionedUsers: vi.fn(),
    },
    activityTracker: {
      trackActivity: vi.fn(),
    },
    noteAnchor: {
      buildAnchorContext: vi.fn(() => null),
      validateAnchorInput: vi.fn(() => null),
    },
    optionalAuth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/middleware/requireVerifiedEmail'), mocks.requireVerifiedEmail],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/moderation/moderationEngine'), mocks.moderationEngine],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
  [require.resolve('../src/lib/activityTracker'), mocks.activityTracker],
  [require.resolve('../src/lib/noteAnchor'), mocks.noteAnchor],
  [require.resolve('../src/core/auth/optionalAuth'), mocks.optionalAuth],
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
  mocks.prisma.noteStar.findUnique.mockResolvedValue(null)
  mocks.prisma.noteStar.findMany.mockResolvedValue([])
  mocks.prisma.noteStar.count.mockResolvedValue(0)
  mocks.prisma.noteReaction.count.mockResolvedValue(0)
  mocks.prisma.noteReaction.findUnique.mockResolvedValue(null)
  mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ user, ownerId }) => {
    return user.role === 'admin' || Number(ownerId) === Number(user.userId)
  })
  mocks.moderationEngine.isModerationEnabled.mockReturnValue(true)
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
          tags: '["algorithms","graphs"]',
          userId: 42,
          updatedAt: new Date(),
          course: { id: 1, code: 'CS101' },
        },
      ])
      mocks.prisma.note.count.mockResolvedValue(1)
      mocks.prisma.noteStar.findMany.mockResolvedValue([{ noteId: 1 }])

      const response = await request(app).get('/')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        notes: expect.any(Array),
        total: 1,
        page: 1,
      })
      expect(response.body.notes).toHaveLength(1)
      expect(response.body.notes[0]).toMatchObject({
        title: 'My Note',
        _starred: true,
        tags: ['algorithms', 'graphs'],
      })
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
            OR: [
              { title: { contains: 'algorithms', mode: 'insensitive' } },
              { content: { contains: 'algorithms', mode: 'insensitive' } },
              { tags: { contains: 'algorithms', mode: 'insensitive' } },
            ],
          }),
        }),
      )
    })

    it('filters notes by exact tag', async () => {
      mocks.prisma.note.findMany.mockResolvedValue([])
      mocks.prisma.note.count.mockResolvedValue(0)

      const response = await request(app).get('/?tag=Physics')

      expect(response.status).toBe(200)
      expect(mocks.prisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 42,
            tags: { contains: '"physics"', mode: 'insensitive' },
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

  describe('content moderation', () => {
    it('calls scanContent on note creation with title + content', async () => {
      mocks.prisma.note.create.mockResolvedValue({
        id: 10,
        title: 'Biology Notes',
        content: 'Cell division overview',
        private: true,
        userId: 42,
        courseId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        course: null,
      })

      await request(app)
        .post('/')
        .send({ title: 'Biology Notes', content: 'Cell division overview' })

      expect(mocks.moderationEngine.scanContent).toHaveBeenCalledWith({
        contentType: 'note',
        contentId: 10,
        text: 'Biology Notes Cell division overview',
        userId: 42,
      })
    })

    it('calls scanContent on note update when content changes', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({
        id: 5,
        userId: 42,
        title: 'Old Title',
      })
      mocks.prisma.note.update.mockResolvedValue({
        id: 5,
        title: 'Updated Title',
        content: 'Updated body text',
        userId: 42,
        course: null,
      })

      await request(app)
        .patch('/5')
        .send({ title: 'Updated Title', content: 'Updated body text' })

      expect(mocks.moderationEngine.scanContent).toHaveBeenCalledWith({
        contentType: 'note',
        contentId: 5,
        text: 'Updated Title Updated body text',
        userId: 42,
      })
    })

    it('does not call scanContent on metadata-only update', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({
        id: 5,
        userId: 42,
        title: 'Title',
      })
      mocks.prisma.note.update.mockResolvedValue({
        id: 5,
        title: 'Title',
        content: 'Existing content',
        userId: 42,
        private: false,
        course: null,
      })

      await request(app)
        .patch('/5')
        .send({ private: false })

      expect(mocks.moderationEngine.scanContent).not.toHaveBeenCalled()
    })

    it('skips scanContent when moderation is disabled', async () => {
      mocks.moderationEngine.isModerationEnabled.mockReturnValue(false)
      mocks.prisma.note.create.mockResolvedValue({
        id: 11,
        title: 'Test',
        content: 'Content',
        private: true,
        userId: 42,
        courseId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        course: null,
      })

      await request(app)
        .post('/')
        .send({ title: 'Test', content: 'Content' })

      expect(mocks.moderationEngine.scanContent).not.toHaveBeenCalled()
    })

    it('calls scanContent on note comment creation', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({
        id: 3,
        private: false,
        userId: 99,
        title: 'Shared Note',
        content: 'Some note content',
      })
      mocks.prisma.noteComment.create.mockResolvedValue({
        id: 20,
        content: 'Great explanation!',
        noteId: 3,
        userId: 42,
        createdAt: new Date(),
        author: { id: 42, username: 'test_user' },
      })

      const res = await request(app)
        .post('/3/comments')
        .send({ content: 'Great explanation!' })

      expect(res.status).toBe(201)
      expect(mocks.moderationEngine.scanContent).toHaveBeenCalledWith({
        contentType: 'note_comment',
        contentId: 20,
        text: 'Great explanation!',
        userId: 42,
      })
    })
  })

  describe('moderation visibility (gating disabled)', () => {
    it('GET /:id returns pending_review note to non-owner (moderation gating disabled)', async () => {
      // optionalAuth gives userId: 42, but note belongs to userId: 99
      mocks.prisma.note.findUnique.mockResolvedValue({
        id: 7,
        title: 'Flagged Note',
        content: 'Bad content',
        private: false,
        moderationStatus: 'pending_review',
        userId: 99,
        course: null,
        author: { id: 99, username: 'other' },
      })

      const res = await request(app).get('/7')
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('Flagged Note')
    })

    it('GET /:id returns note for pending_review note when owner', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({
        id: 8,
        title: 'My Flagged Note',
        content: 'Under review',
        private: false,
        moderationStatus: 'pending_review',
        userId: 42,
        course: null,
        author: { id: 42, username: 'test_user' },
      })

      const res = await request(app).get('/8')
      expect(res.status).toBe(200)
      expect(res.body.title).toBe('My Flagged Note')
    })

    it('GET /?shared=true does not filter by moderationStatus (gating disabled)', async () => {
      mocks.prisma.note.findMany.mockResolvedValue([])
      mocks.prisma.note.count.mockResolvedValue(0)

      await request(app).get('/?shared=true')

      const call = mocks.prisma.note.findMany.mock.calls[0][0]
      expect(call.where.private).toBe(false)
      expect(call.where.moderationStatus).toBeUndefined()
    })

    it('GET /?shared=true does not include own notes filter', async () => {
      mocks.prisma.note.findMany.mockResolvedValue([])
      mocks.prisma.note.count.mockResolvedValue(0)

      await request(app).get('/?shared=true')

      const call = mocks.prisma.note.findMany.mock.calls[0][0]
      expect(call.where.userId).toBeUndefined()
    })
  })
})
