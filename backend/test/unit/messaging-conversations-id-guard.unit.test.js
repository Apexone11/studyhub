/**
 * wave-12.19 regression — A12 integer guards on
 * `messaging.conversations.routes.js` for the three top-level :id endpoints
 * (GET, PATCH, DELETE).
 *
 * Before wave-12.19:
 *   - GET /:id and DELETE /:id used `parseInt + isNaN`, which accepts
 *     '0', negatives, and floats; PATCH /:id had NO guard at all.
 * After wave-12.19:
 *   - All three use `Number.parseInt(req.params.id, 10)` +
 *     `Number.isInteger(id) && id >= 1`, matching CLAUDE.md A12.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const conversationsRoutePath =
  require.resolve('../../src/modules/messaging/messaging.conversations.routes')

const mocks = vi.hoisted(() => {
  const authState = {
    user: { userId: 1, username: 'beta_student1', role: 'user' },
  }

  const prisma = {
    conversation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    conversationParticipant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    message: {
      count: vi.fn(),
    },
  }

  return {
    authState,
    prisma,
    requireAuth: vi.fn((req, res, next) => {
      if (!authState.user) {
        return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
      }
      req.user = authState.user
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    rateLimiters: {
      readLimiter: (_req, _res, next) => next(),
      messagingWriteLimiter: (_req, _res, next) => next(),
    },
    blockFilter: {
      getBlockedUserIds: vi.fn(async () => []),
    },
    messagingHelpers: {
      areMutualFollowers: vi.fn(async () => true),
      formatConversationItem: (cp) => cp,
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), mocks.prisma],
  [require.resolve('../../src/middleware/auth'), mocks.requireAuth],
  [require.resolve('../../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../../src/lib/social/blockFilter'), mocks.blockFilter],
  [require.resolve('../../src/modules/messaging/messaging.helpers'), mocks.messagingHelpers],
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

  delete require.cache[conversationsRoutePath]
  const conversationsRouterModule = require(conversationsRoutePath)
  const conversationsRouter = conversationsRouterModule.default || conversationsRouterModule

  app = express()
  app.use(express.json())
  // Real mount in index.js is /api/messages, with this sub-router at /conversations.
  app.use('/api/messages/conversations', conversationsRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[conversationsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.authState.user = { userId: 1, username: 'beta_student1', role: 'user' }

  // Default: a happy-path participant + conversation lookup so the only
  // 400s we observe come from the integer-guard, not downstream auth/404.
  mocks.prisma.conversationParticipant.findUnique.mockResolvedValue({
    id: 100,
    conversationId: 123,
    userId: 1,
    role: 'admin',
    archived: false,
    muted: false,
  })
  mocks.prisma.conversation.findUnique.mockResolvedValue({
    id: 123,
    type: 'dm',
    name: null,
    participants: [],
  })
  mocks.prisma.conversation.update.mockResolvedValue({ id: 123 })
  mocks.prisma.conversationParticipant.update.mockResolvedValue({
    id: 100,
    conversationId: 123,
    userId: 1,
  })
  mocks.prisma.conversationParticipant.delete.mockResolvedValue({ id: 100 })
})

describe('GET /api/messages/conversations/:id — A12 integer guard', () => {
  it('returns 400 for a non-numeric id ("abc")', async () => {
    const res = await request(app).get('/api/messages/conversations/abc')

    expect(res.status).toBe(400)
    // Must short-circuit BEFORE any prisma lookup.
    expect(mocks.prisma.conversationParticipant.findUnique).not.toHaveBeenCalled()
  })

  it('returns 400 for a negative id ("-1")', async () => {
    const res = await request(app).get('/api/messages/conversations/-1')

    expect(res.status).toBe(400)
  })

  it('returns 400 for "0" (Number.isInteger passes but `< 1` must reject)', async () => {
    const res = await request(app).get('/api/messages/conversations/0')

    expect(res.status).toBe(400)
  })

  it('does NOT 400 for a valid integer id (passes through to handler)', async () => {
    const res = await request(app).get('/api/messages/conversations/123')

    expect(res.status).not.toBe(400)
    expect(mocks.prisma.conversationParticipant.findUnique).toHaveBeenCalledTimes(1)
  })
})

describe('PATCH /api/messages/conversations/:id — A12 integer guard (new in wave-12.19)', () => {
  it('returns 400 for a non-numeric id ("abc") — guard was previously absent', async () => {
    const res = await request(app).patch('/api/messages/conversations/abc').send({ muted: true })

    expect(res.status).toBe(400)
    expect(mocks.prisma.conversationParticipant.findUnique).not.toHaveBeenCalled()
  })

  it('does NOT 400 for a valid integer id (passes through to handler)', async () => {
    const res = await request(app).patch('/api/messages/conversations/123').send({ muted: true })

    expect(res.status).not.toBe(400)
    expect(mocks.prisma.conversationParticipant.findUnique).toHaveBeenCalledTimes(1)
  })
})

describe('DELETE /api/messages/conversations/:id — A12 integer guard', () => {
  it('returns 400 for a non-numeric id ("abc")', async () => {
    const res = await request(app).delete('/api/messages/conversations/abc')

    expect(res.status).toBe(400)
    expect(mocks.prisma.conversationParticipant.findUnique).not.toHaveBeenCalled()
  })

  it('does NOT 400 for a valid integer id (passes through to handler)', async () => {
    const res = await request(app).delete('/api/messages/conversations/123')

    expect(res.status).not.toBe(400)
    expect(mocks.prisma.conversationParticipant.findUnique).toHaveBeenCalledTimes(1)
  })
})
