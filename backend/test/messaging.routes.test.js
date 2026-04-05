import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const messagingRoutePath = require.resolve('../src/modules/messaging')

/* ── Mock factory (hoisted before any module loads) ───────────────────── */
const mocks = vi.hoisted(() => {
  const state = { userId: 42, username: 'test_user', role: 'student' }

  const prisma = {
    conversationParticipant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    message: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    messageReaction: {
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    pollVote: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    pollOption: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    poll: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    userFollow: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
  }

  const ioInstance = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  }

  return {
    state,
    prisma,
    ioInstance,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId, username: state.username, role: state.role }
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    socketio: {
      getIO: vi.fn(() => ioInstance),
      getOnlineUsers: vi.fn(() => new Map()),
    },
    rateLimiters: {
      readLimiter: (_req, _res, next) => next(),
      messagingWriteLimiter: (_req, _res, next) => next(),
    },
    blockFilter: {
      getBlockedUserIds: vi.fn().mockResolvedValue([]),
      isBlockedEitherWay: vi.fn().mockResolvedValue(false),
    },
  }
})

/* ── Wire mock targets ────────────────────────────────────────────────── */
const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/socketio'), mocks.socketio],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
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

  delete require.cache[messagingRoutePath]
  // Also clear the routes file cache
  const routesPath = require.resolve('../src/modules/messaging/messaging.routes')
  delete require.cache[routesPath]

  const routerModule = require(messagingRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[messagingRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.username = 'test_user'
  mocks.state.role = 'student'
  mocks.blockFilter.getBlockedUserIds.mockResolvedValue([])
  mocks.socketio.getIO.mockReturnValue(mocks.ioInstance)
  mocks.ioInstance.to.mockReturnThis()
})

/* ===================================================================== */
/* GET /conversations                                                    */
/* ===================================================================== */
describe('messaging routes', () => {
  describe('GET /conversations', () => {
    it('returns formatted conversation list', async () => {
      mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
        {
          lastReadAt: new Date('2026-01-01'),
          muted: false,
          _unreadCount: 0,
          conversation: {
            id: 1,
            type: 'dm',
            name: null,
            avatarUrl: null,
            createdBy: { id: 10, username: 'alice', avatarUrl: null },
            participants: [
              { user: { id: 10, username: 'alice', avatarUrl: null } },
            ],
            messages: [
              { id: 101, content: 'Hey', sender: { id: 10, username: 'alice' } },
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ])
      mocks.prisma.message.count.mockResolvedValue(3)

      const res = await request(app).get('/conversations')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0]).toMatchObject({
        id: 1,
        type: 'dm',
        unreadCount: 3,
        participants: [{ id: 10, username: 'alice' }],
      })
    })

    it('filters out conversations with blocked users', async () => {
      mocks.blockFilter.getBlockedUserIds.mockResolvedValue([10])
      mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
        {
          lastReadAt: null,
          muted: false,
          conversation: {
            id: 2,
            type: 'dm',
            name: null,
            avatarUrl: null,
            createdBy: { id: 10, username: 'blocked_user', avatarUrl: null },
            participants: [
              { user: { id: 10, username: 'blocked_user', avatarUrl: null } },
            ],
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ])
      mocks.prisma.message.count.mockResolvedValue(0)

      const res = await request(app).get('/conversations')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(0)
    })

    it('returns 500 on database error', async () => {
      mocks.prisma.conversationParticipant.findMany.mockRejectedValue(new Error('db'))

      const res = await request(app).get('/conversations')

      expect(res.status).toBe(500)
      expect(res.body).toMatchObject({ error: 'Server error.' })
      expect(mocks.sentry.captureError).toHaveBeenCalled()
    })
  })

  /* =================================================================== */
  /* POST /conversations                                                 */
  /* =================================================================== */
  describe('POST /conversations', () => {
    it('requires participantIds', async () => {
      const res = await request(app)
        .post('/conversations')
        .send({ type: 'dm' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/participant/i)
    })

    it('rejects creating DM with blocked user', async () => {
      mocks.blockFilter.getBlockedUserIds.mockResolvedValue([99])

      const res = await request(app)
        .post('/conversations')
        .send({ participantIds: [99], type: 'dm' })

      expect(res.status).toBe(403)
    })

    it('creates a new conversation', async () => {
      mocks.prisma.conversation.findFirst.mockResolvedValue(null) // No existing DM
      mocks.prisma.conversation.create.mockResolvedValue({
        id: 3,
        type: 'dm',
        name: null,
        createdById: 42,
        createdAt: new Date(),
        updatedAt: new Date(),
        participants: [
          { userId: 42, user: { id: 42, username: 'test_user', avatarUrl: null } },
          { userId: 99, user: { id: 99, username: 'bob', avatarUrl: null } },
        ],
      })

      const res = await request(app)
        .post('/conversations')
        .send({ participantIds: [99], type: 'dm' })

      expect(res.status).toBe(201)
      expect(res.body.id).toBe(3)
    })
  })

  /* =================================================================== */
  /* GET /conversations/:id/messages                                     */
  /* =================================================================== */
  describe('GET /conversations/:id/messages', () => {
    it('returns messages for a valid participant', async () => {
      mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
        userId: 42,
        conversationId: 1,
      })
      mocks.prisma.message.findMany.mockResolvedValue([
        {
          id: 101,
          content: 'Hello',
          type: 'text',
          senderId: 42,
          createdAt: new Date(),
          editedAt: null,
          deletedAt: null,
          replyToId: null,
          sender: { id: 42, username: 'test_user', avatarUrl: null },
          reactions: [],
          attachments: [],
          poll: null,
          replyTo: null,
        },
      ])

      const res = await request(app).get('/conversations/1/messages')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].content).toBe('Hello')
    })

    it('returns 404 for non-participant', async () => {
      mocks.prisma.conversationParticipant.findUnique.mockResolvedValue(null)

      const res = await request(app).get('/conversations/999/messages')

      expect(res.status).toBe(404)
    })
  })

  /* =================================================================== */
  /* POST /conversations/:id/messages                                    */
  /* =================================================================== */
  describe('POST /conversations/:id/messages', () => {
    beforeEach(() => {
      mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
        userId: 42,
        conversationId: 1,
        role: 'member',
      })
    })

    it('creates a text message and broadcasts via socket', async () => {
      const createdMessage = {
        id: 102,
        content: 'Hello world',
        type: 'text',
        senderId: 42,
        conversationId: 1,
        createdAt: new Date(),
        sender: { id: 42, username: 'test_user', avatarUrl: null },
        reactions: [],
        attachments: [],
        poll: null,
        replyTo: null,
      }
      mocks.prisma.message.create.mockResolvedValue(createdMessage)
      mocks.prisma.conversation.update.mockResolvedValue({})

      const res = await request(app)
        .post('/conversations/1/messages')
        .send({ content: 'Hello world' })

      expect(res.status).toBe(201)
      expect(res.body.content).toBe('Hello world')
      expect(mocks.ioInstance.to).toHaveBeenCalledWith('conversation:1')
      expect(mocks.ioInstance.emit).toHaveBeenCalledWith('message:new', expect.objectContaining({ id: 102, content: 'Hello world' }))
    })

    it('strips HTML from message content', async () => {
      mocks.prisma.message.create.mockResolvedValue({
        id: 104,
        content: 'clean text',
        type: 'text',
        senderId: 42,
        conversationId: 1,
        createdAt: new Date(),
        sender: { id: 42, username: 'test_user', avatarUrl: null },
        reactions: [],
        attachments: [],
        poll: null,
        replyTo: null,
      })
      mocks.prisma.conversation.update.mockResolvedValue({})

      const res = await request(app)
        .post('/conversations/1/messages')
        .send({ content: '<script>alert("xss")</script>clean text' })

      expect(res.status).toBe(201)
      // Verify prisma.create was called with sanitized content
      const createCall = mocks.prisma.message.create.mock.calls[0][0]
      expect(createCall.data.content).not.toContain('<script>')
    })

    it('rejects message exceeding max length', async () => {
      const res = await request(app)
        .post('/conversations/1/messages')
        .send({ content: 'x'.repeat(5001) })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/5000|too long|length/i)
    })

    it('rejects empty message with no attachments or poll', async () => {
      const res = await request(app)
        .post('/conversations/1/messages')
        .send({ content: '' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/content required/i)
    })

    it('allows empty content when attachments are present', async () => {
      mocks.prisma.message.create.mockResolvedValue({
        id: 103,
        content: '',
        type: 'text',
        senderId: 42,
        conversationId: 1,
        createdAt: new Date(),
        sender: { id: 42, username: 'test_user', avatarUrl: null },
        reactions: [],
        attachments: [{ url: 'https://media.tenor.com/gif.gif', type: 'image' }],
        poll: null,
        replyTo: null,
      })
      mocks.prisma.conversation.update.mockResolvedValue({})

      const res = await request(app)
        .post('/conversations/1/messages')
        .send({
          content: '',
          attachments: [{ url: 'https://media.tenor.com/gif.gif', type: 'image' }],
        })

      expect(res.status).toBe(201)
    })

    it('rejects non-HTTPS attachment URLs', async () => {
      const res = await request(app)
        .post('/conversations/1/messages')
        .send({
          content: '',
          attachments: [{ url: 'http://evil.com/payload.js', type: 'file' }],
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/HTTPS/i)
    })

    it('rejects attachment with missing URL', async () => {
      const res = await request(app)
        .post('/conversations/1/messages')
        .send({
          content: '',
          attachments: [{ type: 'file' }],
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/URL required/i)
    })

    it('returns 404 for non-participant', async () => {
      mocks.prisma.conversationParticipant.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/conversations/1/messages')
        .send({ content: 'Sneaky' })

      expect(res.status).toBe(404)
    })
  })

  /* =================================================================== */
  /* PATCH /messages/:messageId                                          */
  /* =================================================================== */
  describe('PATCH /messages/:messageId (edit message)', () => {
    it('allows message owner to edit within 15 minutes', async () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
      mocks.prisma.message.findUnique.mockResolvedValue({
        id: 100,
        conversationId: 1,
        senderId: 42,
        createdAt: fiveMinAgo,
        deletedAt: null,
      })
      mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
        userId: 42,
        conversationId: 1,
      })
      mocks.prisma.message.update.mockResolvedValue({
        id: 100,
        content: 'Edited content',
        editedAt: new Date(),
        conversationId: 1,
        sender: { id: 42, username: 'test_user', avatarUrl: null },
        reactions: [],
        attachments: [],
      })

      const res = await request(app)
        .patch('/100')
        .send({ content: 'Edited content' })

      expect(res.status).toBe(200)
      expect(mocks.ioInstance.emit).toHaveBeenCalledWith('message:edit', expect.objectContaining({ id: 100 }))
    })

    it('rejects edit after 15-minute window', async () => {
      const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000)
      mocks.prisma.message.findUnique.mockResolvedValue({
        id: 100,
        conversationId: 1,
        senderId: 42,
        createdAt: twentyMinAgo,
        deletedAt: null,
      })
      mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
        userId: 42,
        conversationId: 1,
      })

      const res = await request(app)
        .patch('/100')
        .send({ content: 'Too late' })

      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/15 min/i)
    })

    it('rejects edit by non-owner', async () => {
      mocks.prisma.message.findUnique.mockResolvedValue({
        id: 100,
        conversationId: 1,
        senderId: 99, // Different user
        createdAt: new Date(),
        deletedAt: null,
      })
      mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
        userId: 42,
        conversationId: 1,
      })

      const res = await request(app)
        .patch('/100')
        .send({ content: 'Not my message' })

      expect(res.status).toBe(403)
    })
  })

  /* =================================================================== */
  /* DELETE /messages/:messageId                                         */
  /* =================================================================== */
  describe('DELETE /messages/:messageId (soft delete)', () => {
    it('soft deletes message for owner', async () => {
      mocks.prisma.message.findUnique.mockResolvedValue({
        id: 100,
        conversationId: 1,
        senderId: 42,
        createdAt: new Date(),
        deletedAt: null,
        conversation: {
          participants: [{ userId: 42, role: 'member' }],
        },
      })
      mocks.prisma.message.update.mockResolvedValue({
        id: 100,
        deletedAt: new Date(),
        sender: { id: 42, username: 'test_user' },
      })

      const res = await request(app).delete('/100')

      expect(res.status).toBe(204)
      expect(mocks.prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 100 },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        })
      )
      expect(mocks.ioInstance.emit).toHaveBeenCalledWith('message:delete', expect.objectContaining({ messageId: 100 }))
    })

    it('returns 404 for non-existent message', async () => {
      mocks.prisma.message.findUnique.mockResolvedValue(null)

      const res = await request(app).delete('/999')

      expect(res.status).toBe(404)
    })
  })

  /* =================================================================== */
  /* POST /:messageId/reactions                                          */
  /* =================================================================== */
  describe('POST /messages/:messageId/reactions', () => {
    beforeEach(() => {
      mocks.prisma.message.findUnique.mockResolvedValue({
        id: 100,
        conversationId: 1,
        senderId: 99,
        createdAt: new Date(),
        deletedAt: null,
      })
      mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
        userId: 42,
        conversationId: 1,
      })
    })

    it('adds a reaction and broadcasts via socket', async () => {
      mocks.prisma.messageReaction.upsert.mockResolvedValue({
        id: 201,
        messageId: 100,
        userId: 42,
        emoji: 'thumbsup',
        createdAt: new Date(),
        user: { id: 42, username: 'test_user' },
      })

      const res = await request(app)
        .post('/100/reactions')
        .send({ emoji: 'thumbsup' })

      expect(res.status).toBe(201)
      expect(mocks.ioInstance.emit).toHaveBeenCalledWith('reaction:add', expect.objectContaining({ messageId: 100 }))
    })

    it('rejects missing emoji', async () => {
      const res = await request(app)
        .post('/100/reactions')
        .send({})

      expect(res.status).toBe(400)
    })
  })

  /* =================================================================== */
  /* POST /conversations/:id/read (mark read)                             */
  /* =================================================================== */
  describe('POST /conversations/:id/read', () => {
    it('marks conversation as read and returns zero unread count', async () => {
      mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
        conversationId: 1,
        userId: 42,
        lastReadAt: new Date('2026-03-19'),
      })
      mocks.prisma.conversationParticipant.update.mockResolvedValue({
        conversationId: 1,
        userId: 42,
        lastReadAt: new Date('2026-03-20T12:00:00Z'),
      })

      const res = await request(app).post('/conversations/1/read')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        conversationId: 1,
        unreadCount: 0,
      })
      expect(mocks.prisma.conversationParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId_userId: {
              conversationId: 1,
              userId: 42,
            },
          }),
          data: expect.objectContaining({
            lastReadAt: expect.any(Date),
          }),
        })
      )
    })

    it('rejects non-participants from marking read', async () => {
      mocks.prisma.conversationParticipant.findUnique.mockResolvedValue(null)

      const res = await request(app).post('/conversations/1/read')

      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/not a participant/i)
    })

    it('rejects invalid conversation ID', async () => {
      const res = await request(app).post('/conversations/invalid/read')

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/invalid.*id/i)
    })
  })

  /* =================================================================== */
  /* GET /unread-total                                                   */
  /* =================================================================== */
  describe('GET /unread-total', () => {
    it('returns total unread message count across all conversations', async () => {
      mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
        {
          conversationId: 1,
          lastReadAt: new Date('2026-03-19T00:00:00Z'),
        },
        {
          conversationId: 2,
          lastReadAt: new Date('2026-03-20T09:00:00Z'),
        },
      ])
      mocks.prisma.message.count
        .mockResolvedValueOnce(5) // 5 unread in conversation 1
        .mockResolvedValueOnce(2) // 2 unread in conversation 2

      const res = await request(app).get('/unread-total')

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(7)
      expect(mocks.prisma.message.count).toHaveBeenCalledTimes(2)
    })

    it('counts only messages newer than lastReadAt', async () => {
      const lastReadTime = new Date('2026-03-20T10:00:00Z')
      mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
        {
          conversationId: 1,
          lastReadAt: lastReadTime,
        },
      ])
      mocks.prisma.message.count.mockResolvedValue(3)

      await request(app).get('/unread-total')

      const callArgs = mocks.prisma.message.count.mock.calls[0][0]
      expect(callArgs.where.createdAt.gt).toEqual(lastReadTime)
    })

    it('excludes messages from current user in unread count', async () => {
      mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
        {
          conversationId: 1,
          lastReadAt: new Date('2026-03-19T00:00:00Z'),
        },
      ])
      mocks.prisma.message.count.mockResolvedValue(4)

      await request(app).get('/unread-total')

      const callArgs = mocks.prisma.message.count.mock.calls[0][0]
      expect(callArgs.where.senderId.not).toBe(42) // req.user.userId
    })

    it('excludes deleted messages from unread count', async () => {
      mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
        {
          conversationId: 1,
          lastReadAt: new Date('2026-03-19T00:00:00Z'),
        },
      ])
      mocks.prisma.message.count.mockResolvedValue(2)

      await request(app).get('/unread-total')

      const callArgs = mocks.prisma.message.count.mock.calls[0][0]
      expect(callArgs.where.deletedAt).toBe(null)
    })

    it('gracefully handles count errors with zero fallback', async () => {
      mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
        {
          conversationId: 1,
          lastReadAt: new Date('2026-03-19T00:00:00Z'),
        },
      ])
      mocks.prisma.message.count.mockRejectedValue(new Error('db error'))

      const res = await request(app).get('/unread-total')

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(0) // Graceful degradation
    })

    it('returns 0 when participant has no lastReadAt (treats as epoch)', async () => {
      mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
        {
          conversationId: 1,
          lastReadAt: null,
        },
      ])
      mocks.prisma.message.count.mockResolvedValue(10)

      const res = await request(app).get('/unread-total')

      expect(res.status).toBe(200)
      const callArgs = mocks.prisma.message.count.mock.calls[0][0]
      expect(callArgs.where.createdAt.gt).toEqual(new Date(0))
    })
  })

  /* =================================================================== */
  /* GET /online                                                         */
  /* =================================================================== */
  describe('GET /online', () => {
    it('returns list of online user IDs', async () => {
      mocks.socketio.getOnlineUsers.mockReturnValue([1, 2])

      const res = await request(app).get('/online')

      expect(res.status).toBe(200)
      expect(res.body.online).toEqual(expect.arrayContaining([1, 2]))
    })
  })
})
