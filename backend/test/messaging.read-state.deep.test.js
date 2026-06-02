/**
 * messaging.read-state.deep.test.js — read receipts + unread counts.
 *
 * Pins:
 *   - POST /conversations/:id/read updates lastReadAt and returns unreadCount=0
 *   - Non-participants are 403'd from marking read
 *   - GET /unread-total computes per-conversation unread = messages with createdAt > lastReadAt
 *   - Unread count excludes messages authored by current user
 *   - Unread count excludes soft-deleted messages
 *   - Idempotent: repeated reads keep unreadCount=0 (LastReadAt updates harmlessly)
 *   - Graceful degradation when count throws
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
      update: vi.fn(),
      delete: vi.fn(),
    },
    conversation: { findUnique: vi.fn(), findFirst: vi.fn() },
    message: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    userFollow: { findUnique: vi.fn() },
    $transaction: vi.fn((fn) => fn(prisma)),
  }
  const ioInstance = { to: vi.fn().mockReturnThis(), emit: vi.fn() }
  return {
    state,
    prisma,
    ioInstance,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId, username: state.username, role: state.role }
      next()
    }),
    sentry: { captureError: vi.fn() },
    socketio: { getIO: vi.fn(() => ioInstance), getOnlineUsers: vi.fn(() => []) },
    rateLimiters: {
      readLimiter: (_req, _res, next) => next(),
      messagingWriteLimiter: (_req, _res, next) => next(),
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
  mocks.socketio.getIO.mockReturnValue(mocks.ioInstance)
  mocks.ioInstance.to.mockReturnThis()
})

describe('messaging.read-state.deep — POST /conversations/:id/read', () => {
  it('updates lastReadAt and returns zero unreadCount', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      conversationId: 5,
      userId: 42,
      lastReadAt: new Date('2026-01-01'),
    })
    mocks.prisma.conversationParticipant.update.mockResolvedValue({})
    const res = await request(app).post('/conversations/5/read')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ conversationId: 5, unreadCount: 0 })
    const updateCall = mocks.prisma.conversationParticipant.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({
      conversationId_userId: { conversationId: 5, userId: 42 },
    })
    expect(updateCall.data.lastReadAt).toBeInstanceOf(Date)
  })

  it('rejects non-participants (403)', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/conversations/5/read')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/not a participant/i)
  })

  it('rejects invalid conversation ID (400)', async () => {
    const res = await request(app).post('/conversations/notanumber/read')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid conversation id/i)
  })

  it('idempotent: repeated reads keep returning unreadCount=0', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      conversationId: 5,
      userId: 42,
      lastReadAt: null,
    })
    mocks.prisma.conversationParticipant.update.mockResolvedValue({})
    const a = await request(app).post('/conversations/5/read')
    const b = await request(app).post('/conversations/5/read')
    expect(a.body.unreadCount).toBe(0)
    expect(b.body.unreadCount).toBe(0)
    expect(mocks.prisma.conversationParticipant.update).toHaveBeenCalledTimes(2)
  })
})

/* ──────────────────────────────────────────────────────────────────── */
/* GET /unread-total — computed unread count                            */
/* ──────────────────────────────────────────────────────────────────── */
describe('messaging.read-state.deep — GET /unread-total', () => {
  it('sums unread counts across all active conversations', async () => {
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
      { conversationId: 1, lastReadAt: new Date('2026-01-01') },
      { conversationId: 2, lastReadAt: new Date('2026-02-01') },
    ])
    mocks.prisma.message.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2)
    const res = await request(app).get('/unread-total')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(5)
  })

  it('excludes messages from the current user from unread count', async () => {
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
      { conversationId: 1, lastReadAt: new Date('2026-01-01') },
    ])
    mocks.prisma.message.count.mockResolvedValue(4)
    await request(app).get('/unread-total')
    const callArgs = mocks.prisma.message.count.mock.calls[0][0]
    expect(callArgs.where.senderId.not).toBe(42)
  })

  it('excludes deleted messages from unread count', async () => {
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
      { conversationId: 1, lastReadAt: new Date('2026-01-01') },
    ])
    mocks.prisma.message.count.mockResolvedValue(2)
    await request(app).get('/unread-total')
    const callArgs = mocks.prisma.message.count.mock.calls[0][0]
    expect(callArgs.where.deletedAt).toBe(null)
  })

  it('treats missing lastReadAt as epoch zero', async () => {
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
      { conversationId: 1, lastReadAt: null },
    ])
    mocks.prisma.message.count.mockResolvedValue(7)
    await request(app).get('/unread-total')
    const callArgs = mocks.prisma.message.count.mock.calls[0][0]
    expect(callArgs.where.createdAt.gt).toEqual(new Date(0))
  })

  it('gracefully returns 0 when message.count throws (degraded path)', async () => {
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([
      { conversationId: 1, lastReadAt: new Date('2026-01-01') },
    ])
    mocks.prisma.message.count.mockRejectedValue(new Error('db down'))
    const res = await request(app).get('/unread-total')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(0)
  })

  it('returns 0 when user has no active conversations', async () => {
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([])
    const res = await request(app).get('/unread-total')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(0)
    expect(mocks.prisma.message.count).not.toHaveBeenCalled()
  })

  it('only counts active, non-archived conversation memberships', async () => {
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([])
    await request(app).get('/unread-total')
    const callArgs = mocks.prisma.conversationParticipant.findMany.mock.calls[0][0]
    expect(callArgs.where).toMatchObject({ status: 'active', archived: false })
  })
})
