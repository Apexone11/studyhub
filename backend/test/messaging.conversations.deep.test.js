/**
 * messaging.conversations.deep.test.js — deep coverage for conversation CRUD.
 *
 * Pins:
 *   - A13 type allowlist ('dm' | 'group')
 *   - participantIds validation
 *   - DM dedup (existing DM returned, not duplicated)
 *   - Pagination on GET
 *   - PATCH name / avatar boundaries (handled in DB schema, route forwards)
 *   - DELETE: DM archives; group leaves (cascade-delete from membership)
 *   - 403 vs 404 boundaries on non-participant access
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
  mocks.state.username = 'test_user'
  mocks.blockFilter.getBlockedUserIds.mockResolvedValue([])
  mocks.blockFilter.isBlockedEitherWay.mockResolvedValue(false)
  mocks.socketio.getIO.mockReturnValue(mocks.ioInstance)
  mocks.ioInstance.to.mockReturnThis()
})

/* ──────────────────────────────────────────────────────────────────── */
/* POST /conversations                                                  */
/* ──────────────────────────────────────────────────────────────────── */
describe('messaging.conversations.deep — POST /conversations', () => {
  it('A13: rejects invalid conversation `type` not in {dm, group}', async () => {
    const res = await request(app)
      .post('/conversations')
      .send({ participantIds: [99], type: 'channel' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid conversation type/i)
  })

  it('A13: accepts type=dm', async () => {
    mocks.prisma.conversation.findFirst.mockResolvedValue(null)
    mocks.userFollow_findUnique = mocks.prisma.userFollow.findUnique.mockResolvedValue(null)
    mocks.prisma.conversation.create.mockResolvedValue({
      id: 7,
      type: 'dm',
      participants: [],
    })
    const res = await request(app)
      .post('/conversations')
      .send({ participantIds: [99], type: 'dm' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBe(7)
  })

  it('A13: accepts type=group with name', async () => {
    mocks.prisma.conversation.create.mockResolvedValue({
      id: 8,
      type: 'group',
      name: 'Study Squad',
      participants: [],
    })
    const res = await request(app)
      .post('/conversations')
      .send({ participantIds: [99, 100], type: 'group', name: 'Study Squad' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBe(8)
  })

  it('rejects when participantIds is missing (400)', async () => {
    const res = await request(app).post('/conversations').send({ type: 'dm' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/participant/i)
  })

  it('rejects when participantIds is empty array (400)', async () => {
    const res = await request(app).post('/conversations').send({ participantIds: [], type: 'dm' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/participant/i)
  })

  it('rejects when participantIds is not an array (400)', async () => {
    const res = await request(app)
      .post('/conversations')
      .send({ participantIds: 'not-array', type: 'dm' })
    expect(res.status).toBe(400)
  })

  it('DM dedup: returns existing DM instead of creating a duplicate', async () => {
    mocks.prisma.conversation.findFirst.mockResolvedValue({
      id: 11,
      type: 'dm',
    })
    mocks.prisma.conversationParticipant.update.mockResolvedValue({})
    mocks.prisma.conversation.findUnique.mockResolvedValue({
      id: 11,
      type: 'dm',
      participants: [{ user: { id: 42 } }, { user: { id: 99 } }],
    })
    const res = await request(app)
      .post('/conversations')
      .send({ participantIds: [99], type: 'dm' })
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(11)
    expect(mocks.prisma.conversation.create).not.toHaveBeenCalled()
  })

  it('returns 403 when creating DM with a blocked user', async () => {
    mocks.blockFilter.getBlockedUserIds.mockResolvedValue([99])
    const res = await request(app)
      .post('/conversations')
      .send({ participantIds: [99], type: 'dm' })
    expect(res.status).toBe(403)
  })
})

/* ──────────────────────────────────────────────────────────────────── */
/* GET /conversations                                                   */
/* ──────────────────────────────────────────────────────────────────── */
describe('messaging.conversations.deep — GET /conversations (pagination)', () => {
  it('honors limit and offset from query string', async () => {
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([])
    await request(app).get('/conversations?limit=5&offset=10')
    const callArgs = mocks.prisma.conversationParticipant.findMany.mock.calls[0][0]
    expect(callArgs.take).toBe(5)
    expect(callArgs.skip).toBe(10)
  })

  it('caps limit at 100', async () => {
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([])
    await request(app).get('/conversations?limit=500')
    const callArgs = mocks.prisma.conversationParticipant.findMany.mock.calls[0][0]
    expect(callArgs.take).toBe(100)
  })

  it('clamps negative offset to 0', async () => {
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([])
    await request(app).get('/conversations?offset=-10')
    const callArgs = mocks.prisma.conversationParticipant.findMany.mock.calls[0][0]
    expect(callArgs.skip).toBe(0)
  })

  it('only returns active, non-archived conversations', async () => {
    mocks.prisma.conversationParticipant.findMany.mockResolvedValue([])
    await request(app).get('/conversations')
    const callArgs = mocks.prisma.conversationParticipant.findMany.mock.calls[0][0]
    expect(callArgs.where).toMatchObject({ status: 'active', archived: false })
  })
})

/* ──────────────────────────────────────────────────────────────────── */
/* PATCH /conversations/:id                                             */
/* ──────────────────────────────────────────────────────────────────── */
describe('messaging.conversations.deep — PATCH /conversations/:id', () => {
  it('returns 404 when user is not a participant', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue(null)
    const res = await request(app).patch('/conversations/5').send({ name: 'new' })
    expect(res.status).toBe(404)
  })

  it('returns 403 when non-admin tries to rename a group', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: 42,
      conversationId: 5,
      role: 'member',
    })
    mocks.prisma.conversation.findUnique.mockResolvedValue({ id: 5, type: 'group' })
    const res = await request(app).patch('/conversations/5').send({ name: 'spam' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/admin access required/i)
  })

  it('allows admin to update name + avatarUrl on a group', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: 42,
      conversationId: 5,
      role: 'admin',
    })
    mocks.prisma.conversation.findUnique
      .mockResolvedValueOnce({ id: 5, type: 'group' })
      .mockResolvedValueOnce({ id: 5, type: 'group', name: 'New', avatarUrl: 'https://a/x.png' })
    mocks.prisma.conversation.update.mockResolvedValue({})
    const res = await request(app)
      .patch('/conversations/5')
      .send({ name: 'New', avatarUrl: 'https://a/x.png' })
    expect(res.status).toBe(200)
    const updateCall = mocks.prisma.conversation.update.mock.calls[0][0]
    expect(updateCall.data.name).toBe('New')
    expect(updateCall.data.avatarUrl).toBe('https://a/x.png')
  })

  it('lets user update their own muted / archived flags on a DM', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: 42,
      conversationId: 5,
      role: 'member',
    })
    mocks.prisma.conversation.findUnique
      .mockResolvedValueOnce({ id: 5, type: 'dm' })
      .mockResolvedValueOnce({ id: 5, type: 'dm' })
    mocks.prisma.conversationParticipant.update.mockResolvedValue({})
    const res = await request(app).patch('/conversations/5').send({ muted: true, archived: true })
    expect(res.status).toBe(200)
    const updateCall = mocks.prisma.conversationParticipant.update.mock.calls[0][0]
    expect(updateCall.data).toMatchObject({ muted: true, archived: true })
  })
})

/* ──────────────────────────────────────────────────────────────────── */
/* DELETE /conversations/:id                                            */
/* ──────────────────────────────────────────────────────────────────── */
describe('messaging.conversations.deep — DELETE /conversations/:id', () => {
  it('DM: archives for current user, does NOT delete conversation for others', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: 42,
      conversationId: 5,
    })
    mocks.prisma.conversation.findUnique.mockResolvedValue({ id: 5, type: 'dm' })
    mocks.prisma.conversationParticipant.update.mockResolvedValue({})
    const res = await request(app).delete('/conversations/5')
    expect(res.status).toBe(204)
    // Should call update (archive), not delete
    expect(mocks.prisma.conversationParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archived: true } }),
    )
    expect(mocks.prisma.conversationParticipant.delete).not.toHaveBeenCalled()
    expect(mocks.prisma.conversation.delete).not.toHaveBeenCalled()
  })

  it('Group: deletes only the participant row (leave), preserves conversation', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: 42,
      conversationId: 5,
    })
    mocks.prisma.conversation.findUnique.mockResolvedValue({ id: 5, type: 'group' })
    mocks.prisma.conversationParticipant.delete.mockResolvedValue({})
    const res = await request(app).delete('/conversations/5')
    expect(res.status).toBe(204)
    expect(mocks.prisma.conversationParticipant.delete).toHaveBeenCalled()
    expect(mocks.prisma.conversation.delete).not.toHaveBeenCalled()
  })

  it('returns 404 when user is not a participant', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue(null)
    const res = await request(app).delete('/conversations/5')
    expect(res.status).toBe(404)
  })
})

/* ──────────────────────────────────────────────────────────────────── */
/* GET /conversations/:id                                               */
/* ──────────────────────────────────────────────────────────────────── */
describe('messaging.conversations.deep — GET /conversations/:id', () => {
  it('returns 400 on non-numeric ID', async () => {
    const res = await request(app).get('/conversations/abc')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid conversation id/i)
  })

  it('returns 404 when user is not a participant', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/conversations/5')
    expect(res.status).toBe(404)
  })

  it('returns conversation when user is a participant', async () => {
    mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: 42,
      conversationId: 5,
    })
    mocks.prisma.conversation.findUnique.mockResolvedValue({
      id: 5,
      type: 'dm',
      participants: [],
    })
    const res = await request(app).get('/conversations/5')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(5)
  })
})
