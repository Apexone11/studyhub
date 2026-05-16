/**
 * messaging.reactions.deep.test.js — deep coverage for the reactions router.
 * Loop T4 (2026-05-12).
 *
 * Pins:
 *   - POST /:messageId/reactions creates upserted reaction
 *   - Emoji length cap (≤16 chars; schema is VarChar(16), route enforces same)
 *   - Whitespace-only emoji rejected
 *   - DELETE removes the reaction row
 *   - Dedup: posting the same emoji twice is idempotent (upsert)
 *   - Rate limited
 *   - Broadcasts via Socket.io to conversation room
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const messagingRoutePath = require.resolve('../src/modules/messaging')

const mocks = vi.hoisted(() => {
  const state = { userId: 42, username: 'test_user', role: 'student' }
  const writeCounter = { count: 0, max: 60 }
  const prisma = {
    conversationParticipant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    conversation: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    message: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    messageReaction: {
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    messagePollVote: { findFirst: vi.fn(), delete: vi.fn(), upsert: vi.fn() },
    messagePoll: { update: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    userFollow: { findUnique: vi.fn() },
    $transaction: vi.fn((fn) => fn(prisma)),
  }
  const ioInstance = { to: vi.fn().mockReturnThis(), emit: vi.fn() }
  return {
    state,
    prisma,
    ioInstance,
    writeCounter,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId, username: state.username, role: state.role }
      next()
    }),
    sentry: { captureError: vi.fn() },
    socketio: { getIO: vi.fn(() => ioInstance), getOnlineUsers: vi.fn(() => []) },
    rateLimiters: {
      readLimiter: (_req, _res, next) => next(),
      messagingWriteLimiter: (_req, res, next) => {
        writeCounter.count += 1
        if (writeCounter.count > writeCounter.max) {
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
      extractMentionUsernames: vi.fn(() => []),
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
  mocks.writeCounter.count = 0
  mocks.socketio.getIO.mockReturnValue(mocks.ioInstance)
  mocks.ioInstance.to.mockReturnThis()

  // Default: user is participant of a real message in conversation 1
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

describe('messaging.reactions.deep — POST /:messageId/reactions', () => {
  it('adds a reaction and returns 201', async () => {
    mocks.prisma.messageReaction.upsert.mockResolvedValue({
      id: 50,
      messageId: 100,
      userId: 42,
      emoji: '👍',
      user: { id: 42, username: 'test_user' },
    })
    const res = await request(app).post('/100/reactions').send({ emoji: '👍' })
    expect(res.status).toBe(201)
    expect(res.body.emoji).toBe('👍')
  })

  it('rejects missing emoji (400)', async () => {
    const res = await request(app).post('/100/reactions').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/reaction required/i)
  })

  it('rejects empty-string emoji (400)', async () => {
    const res = await request(app).post('/100/reactions').send({ emoji: '' })
    expect(res.status).toBe(400)
  })

  it('rejects whitespace-only emoji (400)', async () => {
    const res = await request(app).post('/100/reactions').send({ emoji: '   ' })
    expect(res.status).toBe(400)
  })

  it('rejects emoji longer than 32 chars (400)', async () => {
    const res = await request(app)
      .post('/100/reactions')
      .send({ emoji: 'x'.repeat(33) })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/too long/i)
  })

  // Research-loop-4 F11: schema is VarChar(16); any 17–32-char input used
  // to pass validation and get silently truncated by Postgres. Route now
  // matches the column cap so the upsert key stays consistent.
  it('rejects emoji exactly 17 chars (400) — matches VarChar(16) column', async () => {
    const res = await request(app)
      .post('/100/reactions')
      .send({ emoji: 'x'.repeat(17) })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/too long/i)
  })

  it('accepts emoji exactly 16 chars (boundary case)', async () => {
    mocks.prisma.messageReaction.upsert.mockResolvedValue({
      id: 9,
      messageId: 100,
      userId: 42,
      emoji: 'x'.repeat(16),
      createdAt: new Date(),
      user: { id: 42, username: 'test_user' },
    })
    const res = await request(app)
      .post('/100/reactions')
      .send({ emoji: 'x'.repeat(16) })
    expect(res.status).toBe(201)
  })

  it('rejects emoji containing ASCII control characters (400)', async () => {
    const res = await request(app).post('/100/reactions').send({ emoji: '' }) // BEL char
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid characters/i)
  })

  it('A12: rejects non-numeric messageId (400)', async () => {
    const res = await request(app).post('/abc/reactions').send({ emoji: '🔥' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid message id/i)
  })

  it('returns 404 when the message does not exist', async () => {
    mocks.prisma.message.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/100/reactions').send({ emoji: '👍' })
    expect(res.status).toBe(404)
  })

  it('returns 404 when caller is not a participant', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/100/reactions').send({ emoji: '👍' })
    expect(res.status).toBe(404)
  })

  it('upsert: reacting twice with the same emoji does NOT create duplicate', async () => {
    mocks.prisma.messageReaction.upsert.mockResolvedValue({
      id: 50,
      messageId: 100,
      userId: 42,
      emoji: '🎉',
      user: { id: 42, username: 'test_user' },
    })
    await request(app).post('/100/reactions').send({ emoji: '🎉' })
    await request(app).post('/100/reactions').send({ emoji: '🎉' })
    // Both calls go through upsert keyed by (messageId, userId, emoji) — dedup
    expect(mocks.prisma.messageReaction.upsert).toHaveBeenCalledTimes(2)
    const firstCall = mocks.prisma.messageReaction.upsert.mock.calls[0][0]
    expect(firstCall.where.messageId_userId_emoji).toEqual({
      messageId: 100,
      userId: 42,
      emoji: '🎉',
    })
  })

  it('broadcasts `reaction:add` to the conversation room', async () => {
    mocks.prisma.messageReaction.upsert.mockResolvedValue({
      id: 50,
      messageId: 100,
      userId: 42,
      emoji: '👍',
      user: { id: 42, username: 'test_user' },
    })
    await request(app).post('/100/reactions').send({ emoji: '👍' })
    expect(mocks.ioInstance.to).toHaveBeenCalledWith('conversation:1')
    expect(mocks.ioInstance.emit).toHaveBeenCalledWith(
      'reaction:add',
      expect.objectContaining({ messageId: 100 }),
    )
  })

  it('rate-limits POST reactions (429 after 60 in the window)', async () => {
    mocks.prisma.messageReaction.upsert.mockResolvedValue({
      id: 50,
      messageId: 100,
      userId: 42,
      emoji: '👍',
      user: { id: 42, username: 'test_user' },
    })
    mocks.writeCounter.count = 60
    const res = await request(app).post('/100/reactions').send({ emoji: '👍' })
    expect(res.status).toBe(429)
  })
})

/* ──────────────────────────────────────────────────────────────────── */
/* DELETE /:messageId/reactions/:emoji                                  */
/* ──────────────────────────────────────────────────────────────────── */
describe('messaging.reactions.deep — DELETE /:messageId/reactions/:emoji', () => {
  it('removes the reaction and returns 204', async () => {
    mocks.prisma.messageReaction.deleteMany.mockResolvedValue({ count: 1 })
    const res = await request(app).delete('/100/reactions/' + encodeURIComponent('👍'))
    expect(res.status).toBe(204)
    const call = mocks.prisma.messageReaction.deleteMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ messageId: 100, userId: 42, emoji: '👍' })
  })

  it('broadcasts `reaction:remove` on delete', async () => {
    mocks.prisma.messageReaction.deleteMany.mockResolvedValue({ count: 1 })
    await request(app).delete('/100/reactions/' + encodeURIComponent('👍'))
    expect(mocks.ioInstance.emit).toHaveBeenCalledWith(
      'reaction:remove',
      expect.objectContaining({ messageId: 100, emoji: '👍', userId: 42 }),
    )
  })

  it('A12: rejects non-numeric messageId on DELETE (400)', async () => {
    const res = await request(app).delete('/abc/reactions/' + encodeURIComponent('👍'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when caller is not a participant', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue(null)
    const res = await request(app).delete('/100/reactions/' + encodeURIComponent('👍'))
    expect(res.status).toBe(404)
  })
})
