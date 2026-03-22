import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const feedRoutePath = require.resolve('../src/routes/feed')

const mocks = vi.hoisted(() => {
  const prisma = {
    announcement: {
      findMany: vi.fn(),
    },
    studySheet: {
      findMany: vi.fn(),
    },
    feedPost: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    feedPostComment: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      groupBy: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    feedPostReaction: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    starredSheet: {
      findMany: vi.fn(),
    },
    comment: {
      groupBy: vi.fn(),
    },
    reaction: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
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
    notify: {
      createNotification: vi.fn(),
    },
    mentions: {
      notifyMentionedUsers: vi.fn(),
    },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(() => true),
      sendForbidden: vi.fn(),
    },
    storage: {
      cleanupAttachmentIfUnused: vi.fn(),
      resolveAttachmentPath: vi.fn(),
    },
    attachmentPreview: {
      sendAttachmentPreview: vi.fn(),
    },
    moderationEngine: {
      isModerationEnabled: vi.fn(() => false),
      scanContent: vi.fn(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/storage'), mocks.storage],
  [require.resolve('../src/lib/attachmentPreview'), mocks.attachmentPreview],
  [require.resolve('../src/lib/moderationEngine'), mocks.moderationEngine],
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

  delete require.cache[feedRoutePath]
  const feedRouterModule = require(feedRoutePath)
  const feedRouter = feedRouterModule.default || feedRouterModule

  app = express()
  app.use(express.json())
  app.use('/', feedRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[feedRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()

  mocks.prisma.announcement.findMany.mockResolvedValue([])
  mocks.prisma.studySheet.findMany.mockResolvedValue([])
  mocks.prisma.feedPost.findMany.mockResolvedValue([])
  mocks.prisma.starredSheet.findMany.mockResolvedValue([])
  mocks.prisma.comment.groupBy.mockResolvedValue([])
  mocks.prisma.feedPostComment.groupBy.mockResolvedValue([])
  mocks.prisma.feedPostComment.count.mockResolvedValue(0)
  mocks.prisma.reaction.groupBy.mockResolvedValue([])
  mocks.prisma.reaction.findMany.mockResolvedValue([])
  mocks.prisma.feedPostReaction.groupBy.mockResolvedValue([])
  mocks.prisma.feedPostReaction.findMany.mockResolvedValue([])
  mocks.notify.createNotification.mockResolvedValue({})
  mocks.mentions.notifyMentionedUsers.mockResolvedValue()
  mocks.accessControl.assertOwnerOrAdmin.mockReturnValue(true)
  mocks.storage.cleanupAttachmentIfUnused.mockResolvedValue()
  mocks.moderationEngine.isModerationEnabled.mockReturnValue(false)
})

describe('feed routes', () => {
  describe('GET /', () => {
    it('returns feed items with announcements, sheets, and posts', async () => {
      mocks.prisma.announcement.findMany.mockResolvedValue([
        {
          id: 1,
          title: 'Welcome',
          body: 'Hello everyone',
          pinned: true,
          createdAt: new Date('2026-03-20'),
          author: { id: 1, username: 'admin' },
        },
      ])
      mocks.prisma.feedPost.findMany.mockResolvedValue([
        {
          id: 10,
          content: 'Hello world',
          createdAt: new Date('2026-03-19'),
          updatedAt: new Date('2026-03-19'),
          userId: 42,
          author: { id: 42, username: 'test_user' },
          course: null,
          attachmentUrl: null,
          attachmentName: null,
          attachmentType: null,
          allowDownloads: true,
        },
      ])

      const response = await request(app).get('/')

      expect(response.status).toBe(200)
      expect(response.body.items).toBeDefined()
      expect(response.body.items.length).toBeGreaterThanOrEqual(1)
      // Pinned announcement should come first
      const announcementItem = response.body.items.find((i) => i.type === 'announcement')
      expect(announcementItem).toBeDefined()
      expect(announcementItem.title).toBe('Welcome')
    })

    it('returns 500 when all primary sections fail', async () => {
      mocks.prisma.announcement.findMany.mockRejectedValue(new Error('db down'))
      mocks.prisma.studySheet.findMany.mockRejectedValue(new Error('db down'))
      mocks.prisma.feedPost.findMany.mockRejectedValue(new Error('db down'))

      const response = await request(app).get('/')

      expect(response.status).toBe(500)
      expect(response.body).toMatchObject({ error: 'Could not load the feed right now.' })
    })
  })

  describe('POST /posts', () => {
    it('creates a new post', async () => {
      mocks.prisma.feedPost.create.mockResolvedValue({
        id: 20,
        content: 'My new post',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 42,
        author: { id: 42, username: 'test_user' },
        course: null,
        attachmentUrl: null,
        attachmentName: null,
        attachmentType: null,
        allowDownloads: true,
      })

      const response = await request(app)
        .post('/posts')
        .send({ content: 'My new post' })

      expect(response.status).toBe(201)
      expect(response.body).toMatchObject({
        id: 20,
        content: 'My new post',
        type: 'post',
      })
      expect(mocks.prisma.feedPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: 'My new post',
            userId: 42,
          }),
        }),
      )
    })

    it('validates content is required', async () => {
      const response = await request(app)
        .post('/posts')
        .send({ content: '' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({ error: 'Post content is required.' })
    })

    it('rejects content over 2000 characters', async () => {
      const response = await request(app)
        .post('/posts')
        .send({ content: 'x'.repeat(2001) })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'Post content must be 2000 characters or fewer.',
      })
    })
  })

  describe('POST /posts/:id/react', () => {
    it('adds a like reaction to a post', async () => {
      mocks.prisma.feedPost.findUnique.mockResolvedValue({ id: 10 })
      mocks.prisma.feedPostReaction.findUnique.mockResolvedValue(null)
      mocks.prisma.feedPostReaction.create.mockResolvedValue({})
      mocks.prisma.feedPostReaction.groupBy.mockResolvedValue([
        { postId: 10, type: 'like', _count: { _all: 1 } },
      ])
      mocks.prisma.feedPostReaction.findMany.mockResolvedValue([
        { postId: 10, type: 'like' },
      ])

      const response = await request(app)
        .post('/posts/10/react')
        .send({ type: 'like' })

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ likes: 1, userReaction: 'like' })
    })

    it('rejects invalid reaction types', async () => {
      const response = await request(app)
        .post('/posts/10/react')
        .send({ type: 'love' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'Reaction type must be "like", "dislike", or null.',
      })
    })

    it('returns 404 when post does not exist', async () => {
      mocks.prisma.feedPost.findUnique.mockResolvedValue(null)

      const response = await request(app)
        .post('/posts/999/react')
        .send({ type: 'like' })

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'Post not found.' })
    })
  })

  describe('DELETE /posts/:id', () => {
    it('deletes own post', async () => {
      mocks.prisma.feedPost.findUnique.mockResolvedValue({
        id: 10,
        userId: 42,
        attachmentUrl: null,
      })
      mocks.prisma.feedPost.delete.mockResolvedValue({})

      const response = await request(app).delete('/posts/10')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ message: 'Post deleted.' })
    })

    it('returns 404 when post does not exist', async () => {
      mocks.prisma.feedPost.findUnique.mockResolvedValue(null)

      const response = await request(app).delete('/posts/999')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'Post not found.' })
    })

    it('blocks deletion when not owner or admin', async () => {
      mocks.prisma.feedPost.findUnique.mockResolvedValue({
        id: 10,
        userId: 99,
        attachmentUrl: null,
      })
      mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ res }) => {
        res.status(403).json({ error: 'Not your post.', code: 'FORBIDDEN' })
        return false
      })

      const response = await request(app).delete('/posts/10')

      expect(response.status).toBe(403)
    })
  })

  describe('POST /posts/:id/comments', () => {
    it('adds a comment to a post', async () => {
      mocks.prisma.feedPost.findUnique.mockResolvedValue({
        id: 10,
        userId: 99,
        author: { id: 99, username: 'poster' },
      })
      mocks.prisma.feedPostComment.create.mockResolvedValue({
        id: 1,
        content: 'Great post!',
        postId: 10,
        userId: 42,
        author: { id: 42, username: 'test_user' },
        createdAt: new Date(),
      })

      const response = await request(app)
        .post('/posts/10/comments')
        .send({ content: 'Great post!' })

      expect(response.status).toBe(201)
      expect(response.body).toMatchObject({ content: 'Great post!' })
      expect(mocks.notify.createNotification).toHaveBeenCalled()
    })

    it('rejects empty comments', async () => {
      const response = await request(app)
        .post('/posts/10/comments')
        .send({ content: '' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({ error: 'Comment cannot be empty.' })
    })

    it('rejects comments over 500 characters', async () => {
      const response = await request(app)
        .post('/posts/10/comments')
        .send({ content: 'x'.repeat(501) })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'Comment must be 500 characters or fewer.',
      })
    })

    it('returns 404 when post does not exist', async () => {
      mocks.prisma.feedPost.findUnique.mockResolvedValue(null)

      const response = await request(app)
        .post('/posts/999/comments')
        .send({ content: 'Hello' })

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'Post not found.' })
    })
  })

  describe('GET /posts/:id/comments', () => {
    it('returns comments for a post', async () => {
      mocks.prisma.feedPostComment.findMany.mockResolvedValue([
        {
          id: 1,
          content: 'Comment 1',
          postId: 10,
          createdAt: new Date(),
          author: { id: 42, username: 'test_user' },
        },
      ])
      mocks.prisma.feedPostComment.count.mockResolvedValue(1)

      const response = await request(app).get('/posts/10/comments')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        comments: expect.any(Array),
        total: 1,
        limit: 20,
        offset: 0,
      })
      expect(response.body.comments).toHaveLength(1)
    })
  })
})
