/**
 * messaging.messages.deep.test.js — deep coverage for POST/PATCH/DELETE on
 * the messages router. Loop T4 (2026-05-12). Mounts the real router with the
 * Module._load patching pattern used by auth.deep.test.js / messaging.routes.test.js.
 *
 * Pins:
 *   - Message type allowlist (A13 enforcement: text|image|gif|system)
 *   - replyToId cross-conversation leak prevention (Loop 2 finding)
 *   - 15-min edit window
 *   - Soft-delete via deletedAt
 *   - A12 numeric-id validation on :id
 *   - 5000-char content cap
 *   - Whitespace-only rejection
 *   - 403 vs 404 for permission gates
 *   - Rate limiter wiring
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const messagingRoutePath = require.resolve('../src/modules/messaging')

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
    user: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    userFollow: { findUnique: vi.fn() },
    $transaction: vi.fn((fn) => fn(prisma)),
  }

  const ioInstance = { to: vi.fn().mockReturnThis(), emit: vi.fn() }

  const messagingWriteCounter = { count: 0, max: 60 }

  return {
    state,
    prisma,
    ioInstance,
    messagingWriteCounter,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId, username: state.username, role: state.role }
      next()
    }),
    sentry: { captureError: vi.fn() },
    socketio: {
      getIO: vi.fn(() => ioInstance),
      getOnlineUsers: vi.fn(() => []),
    },
    rateLimiters: {
      readLimiter: (_req, _res, next) => next(),
      messagingWriteLimiter: (_req, res, next) => {
        messagingWriteCounter.count += 1
        if (messagingWriteCounter.count > messagingWriteCounter.max) {
          return res.status(429).json({ error: 'Too many messages. Please slow down.' })
        }
        next()
      },
    },
    blockFilter: {
      getBlockedUserIds: vi.fn().mockResolvedValue([]),
      isBlockedEitherWay: vi.fn().mockResolvedValue(false),
    },
    mentions: {
      notifyMentionedUsers: vi.fn().mockResolvedValue([]),
      extractMentionUsernames: vi.fn((text = '') => {
        const re = /(^|[\s(])@([a-zA-Z0-9_]{3,20})(?=$|[\s),.!?:;])/g
        const out = new Set()
        let m
        while ((m = re.exec(text))) out.add(m[2].toLowerCase())
        return [...out]
      }),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/socketio'), mocks.socketio],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patched(requestId, parent, isMain) {
    const resolved = Module._resolveFilename(requestId, parent, isMain)
    if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    return originalModuleLoad.apply(this, arguments)
  }

  // Clear all messaging modules from cache
  for (const key of Object.keys(require.cache)) {
    if (key.includes('modules/messaging') || key.includes('modules\\messaging')) {
      delete require.cache[key]
    }
  }

  const router = require(messagingRoutePath).default || require(messagingRoutePath)
  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  for (const key of Object.keys(require.cache)) {
    if (key.includes('modules/messaging') || key.includes('modules\\messaging')) {
      delete require.cache[key]
    }
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.username = 'test_user'
  mocks.state.role = 'student'
  mocks.messagingWriteCounter.count = 0
  mocks.blockFilter.getBlockedUserIds.mockResolvedValue([])
  mocks.blockFilter.isBlockedEitherWay.mockResolvedValue(false)
  mocks.socketio.getIO.mockReturnValue(mocks.ioInstance)
  mocks.ioInstance.to.mockReturnThis()
  mocks.mentions.notifyMentionedUsers.mockResolvedValue([])
})

/* ──────────────────────────────────────────────────────────────────── */
/* POST /conversations/:id/messages — CREATE                            */
/* ──────────────────────────────────────────────────────────────────── */
describe('messaging.messages.deep — POST /conversations/:id/messages', () => {
  function mockParticipant() {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: 42,
      conversationId: 1,
      role: 'member',
    })
    mocks.prisma.conversation.findUnique.mockResolvedValue({
      id: 1,
      type: 'group',
      participants: [],
    })
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([{ userId: 42 }])
  }

  function mockMessageCreate(overrides = {}) {
    mocks.prisma.message.create.mockResolvedValue({
      id: 200,
      content: 'Hi',
      type: 'text',
      senderId: 42,
      conversationId: 1,
      createdAt: new Date(),
      sender: { id: 42, username: 'test_user', avatarUrl: null },
      reactions: [],
      attachments: [],
      poll: null,
      replyTo: null,
      ...overrides,
    })
    mocks.prisma.conversation.update.mockResolvedValue({})
  }

  it('creates a message with valid content under 5000 chars', async () => {
    mockParticipant()
    mockMessageCreate({ content: 'hello world' })
    const res = await request(app)
      .post('/conversations/1/messages')
      .send({ content: 'hello world' })
    expect(res.status).toBe(201)
    expect(res.body.content).toBe('hello world')
  })

  it('rejects empty content (400) with no attachments or poll', async () => {
    mockParticipant()
    const res = await request(app).post('/conversations/1/messages').send({ content: '' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/content required/i)
  })

  it('rejects whitespace-only content (400)', async () => {
    mockParticipant()
    const res = await request(app)
      .post('/conversations/1/messages')
      .send({ content: '   \n  \t  ' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/content required/i)
  })

  it('rejects overlong content (>5000 chars) with 400', async () => {
    mockParticipant()
    const res = await request(app)
      .post('/conversations/1/messages')
      .send({ content: 'x'.repeat(5001) })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/5000|too long/i)
  })

  it('accepts content exactly at the 5000-char boundary', async () => {
    mockParticipant()
    mockMessageCreate()
    const res = await request(app)
      .post('/conversations/1/messages')
      .send({ content: 'a'.repeat(5000) })
    expect(res.status).toBe(201)
  })

  it('A13: rejects invalid message `type` not in the allowlist', async () => {
    mockParticipant()
    const res = await request(app)
      .post('/conversations/1/messages')
      .send({ content: 'hi', type: 'malicious' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid message type/i)
  })

  it('A13: accepts `type=image` from the allowlist', async () => {
    mockParticipant()
    mockMessageCreate({ type: 'image' })
    const res = await request(app)
      .post('/conversations/1/messages')
      .send({
        content: '',
        type: 'image',
        attachments: [{ url: 'https://cdn.example.com/x.png', type: 'image' }],
      })
    expect(res.status).toBe(201)
  })

  it('A13: accepts `type=gif` from the allowlist', async () => {
    mockParticipant()
    mockMessageCreate({ type: 'gif' })
    const res = await request(app)
      .post('/conversations/1/messages')
      .send({
        content: '',
        type: 'gif',
        attachments: [{ url: 'https://media.tenor.com/x.gif', type: 'gif' }],
      })
    expect(res.status).toBe(201)
  })

  it('A13: accepts `type=system` from the allowlist', async () => {
    mockParticipant()
    mockMessageCreate({ type: 'system' })
    const res = await request(app)
      .post('/conversations/1/messages')
      .send({ content: 'user joined', type: 'system' })
    expect(res.status).toBe(201)
  })

  it('returns 404 when the user is not a conversation participant', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/conversations/1/messages').send({ content: 'sneaky' })
    expect(res.status).toBe(404)
  })

  it('A12: rejects non-numeric conversation id (400)', async () => {
    const res = await request(app).post('/conversations/abc/messages').send({ content: 'hi' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid conversation id/i)
  })

  it('A12: rejects negative conversation id (400)', async () => {
    const res = await request(app).post('/conversations/-5/messages').send({ content: 'hi' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid conversation id/i)
  })

  it('A12: rejects zero conversation id (400)', async () => {
    const res = await request(app).post('/conversations/0/messages').send({ content: 'hi' })
    expect(res.status).toBe(400)
  })

  it('rate-limits POST after 60 writes within the window (429)', async () => {
    mockParticipant()
    mockMessageCreate()
    // Burn the budget directly to assert the limiter is wired
    mocks.messagingWriteCounter.count = 60
    const res = await request(app).post('/conversations/1/messages').send({ content: 'hello' })
    expect(res.status).toBe(429)
  })

  it('broadcasts `message:new` to the conversation room on create', async () => {
    mockParticipant()
    mockMessageCreate({ id: 999 })
    const res = await request(app).post('/conversations/1/messages').send({ content: 'hi' })
    expect(res.status).toBe(201)
    expect(mocks.ioInstance.to).toHaveBeenCalledWith('conversation:1')
    expect(mocks.ioInstance.emit).toHaveBeenCalledWith(
      'message:new',
      expect.objectContaining({ id: 999 }),
    )
  })

  it('rejects replyToId pointing at a message in a different conversation (cross-conversation leak)', async () => {
    mockParticipant()
    // Parent message lives in conversation 99 — the sender is only in conv 1.
    mocks.prisma.message.findUnique.mockResolvedValue({ conversationId: 99 })
    const res = await request(app)
      .post('/conversations/1/messages')
      .send({ content: 'sneaky reply', replyToId: 500 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid replytoid/i)
    expect(mocks.prisma.message.create).not.toHaveBeenCalled()
  })

  it('rejects replyToId pointing at a non-existent parent message', async () => {
    mockParticipant()
    mocks.prisma.message.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post('/conversations/1/messages')
      .send({ content: 'reply to ghost', replyToId: 12345 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid replytoid/i)
    expect(mocks.prisma.message.create).not.toHaveBeenCalled()
  })

  it('accepts replyToId pointing at a message in the same conversation', async () => {
    mockParticipant()
    mocks.prisma.message.findUnique.mockResolvedValue({ conversationId: 1 })
    mockMessageCreate({ id: 201, replyTo: { id: 50, content: 'parent', senderId: 7 } })
    const res = await request(app)
      .post('/conversations/1/messages')
      .send({ content: 'valid reply', replyToId: 50 })
    expect(res.status).toBe(201)
    expect(mocks.prisma.message.create).toHaveBeenCalled()
  })

  it('refuses to send DM when blocked by counterparty', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: 42,
      conversationId: 1,
      role: 'member',
    })
    mocks.prisma.conversation.findUnique.mockResolvedValue({
      id: 1,
      type: 'dm',
      participants: [{ userId: 99 }],
    })
    mocks.blockFilter.isBlockedEitherWay.mockResolvedValue(true)

    const res = await request(app)
      .post('/conversations/1/messages')
      .send({ content: 'hi blocked person' })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/cannot message/i)
  })
})

/* ──────────────────────────────────────────────────────────────────── */
/* PATCH /:messageId — EDIT                                             */
/* ──────────────────────────────────────────────────────────────────── */
describe('messaging.messages.deep — PATCH /:messageId', () => {
  it('allows owner to edit within 15-minute window', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    mocks.prisma.message.findUnique.mockResolvedValue({
      id: 100,
      conversationId: 1,
      senderId: 42,
      createdAt: fiveMinAgo,
      deletedAt: null,
      content: 'original',
    })
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: 42,
      conversationId: 1,
    })
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([{ userId: 42 }])
    mocks.prisma.message.update.mockResolvedValue({
      id: 100,
      content: 'edited',
      editedAt: new Date(),
      conversationId: 1,
      sender: { id: 42, username: 'test_user', avatarUrl: null },
      reactions: [],
      attachments: [],
    })

    const res = await request(app).patch('/100').send({ content: 'edited' })
    expect(res.status).toBe(200)
    expect(mocks.ioInstance.emit).toHaveBeenCalledWith(
      'message:edit',
      expect.objectContaining({ id: 100 }),
    )
  })

  it('returns 403 when editing after the 15-minute window', async () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000)
    mocks.prisma.message.findUnique.mockResolvedValue({
      id: 100,
      conversationId: 1,
      senderId: 42,
      createdAt: twentyMinAgo,
      deletedAt: null,
      content: 'original',
    })
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: 42,
      conversationId: 1,
    })

    const res = await request(app).patch('/100').send({ content: 'too late' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/15 min/i)
  })

  it('returns 403 when a non-owner tries to edit', async () => {
    mocks.prisma.message.findUnique.mockResolvedValue({
      id: 100,
      conversationId: 1,
      senderId: 99, // different sender
      createdAt: new Date(),
      deletedAt: null,
      content: 'theirs',
    })
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: 42,
      conversationId: 1,
    })

    const res = await request(app).patch('/100').send({ content: 'hax' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/your own/i)
  })

  it('A12: rejects non-numeric messageId (400)', async () => {
    const res = await request(app).patch('/abc').send({ content: 'edit' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid message id/i)
  })

  it('rejects empty content on edit (400)', async () => {
    const res = await request(app).patch('/100').send({ content: '   ' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/content required/i)
  })

  it('rejects edit content over 5000 chars (400)', async () => {
    const res = await request(app)
      .patch('/100')
      .send({ content: 'x'.repeat(5001) })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/5000|too long/i)
  })
})

/* ──────────────────────────────────────────────────────────────────── */
/* DELETE /:messageId — SOFT DELETE                                     */
/* ──────────────────────────────────────────────────────────────────── */
describe('messaging.messages.deep — DELETE /:messageId', () => {
  it('soft-deletes by setting deletedAt on the message', async () => {
    mocks.prisma.message.findUnique.mockResolvedValue({
      id: 100,
      conversationId: 1,
      senderId: 42,
      createdAt: new Date(),
      deletedAt: null,
      conversation: { participants: [{ userId: 42, role: 'member' }] },
    })
    mocks.prisma.message.update.mockResolvedValue({
      id: 100,
      deletedAt: new Date(),
      sender: { id: 42, username: 'test_user' },
    })

    const res = await request(app).delete('/100')
    expect(res.status).toBe(204)
    const updateCall = mocks.prisma.message.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: 100 })
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date)
  })

  it('returns 403 when a non-author non-admin tries to delete', async () => {
    mocks.prisma.message.findUnique.mockResolvedValue({
      id: 100,
      conversationId: 1,
      senderId: 99,
      createdAt: new Date(),
      deletedAt: null,
      conversation: { participants: [{ userId: 42, role: 'member' }] },
    })
    const res = await request(app).delete('/100')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/insufficient permissions/i)
  })

  it('allows a group admin to delete another user message', async () => {
    mocks.prisma.message.findUnique.mockResolvedValue({
      id: 100,
      conversationId: 1,
      senderId: 99, // different author
      createdAt: new Date(),
      deletedAt: null,
      conversation: { participants: [{ userId: 42, role: 'admin' }] },
    })
    mocks.prisma.message.update.mockResolvedValue({
      id: 100,
      deletedAt: new Date(),
      sender: { id: 99, username: 'other' },
    })
    const res = await request(app).delete('/100')
    expect(res.status).toBe(204)
  })

  it('returns 404 when the message does not exist', async () => {
    mocks.prisma.message.findUnique.mockResolvedValue(null)
    const res = await request(app).delete('/999')
    expect(res.status).toBe(404)
  })

  it('A12: rejects non-numeric messageId (400)', async () => {
    const res = await request(app).delete('/abc')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid message id/i)
  })

  it('broadcasts `message:delete` to the conversation room', async () => {
    mocks.prisma.message.findUnique.mockResolvedValue({
      id: 100,
      conversationId: 1,
      senderId: 42,
      createdAt: new Date(),
      deletedAt: null,
      conversation: { participants: [{ userId: 42, role: 'member' }] },
    })
    mocks.prisma.message.update.mockResolvedValue({
      id: 100,
      deletedAt: new Date(),
      sender: { id: 42, username: 'test_user' },
    })
    await request(app).delete('/100')
    expect(mocks.ioInstance.emit).toHaveBeenCalledWith(
      'message:delete',
      expect.objectContaining({ messageId: 100, conversationId: 1 }),
    )
  })
})
