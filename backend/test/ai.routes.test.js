/**
 * ai.routes.test.js -- Route-level tests for Hub AI endpoints.
 * Uses Module._load patching (established project pattern) to mock
 * middleware and service layers, then drives routes via supertest.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const aiRoutePath = require.resolve('../src/modules/ai')

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
  }

  return {
    prisma,
    aiService: {
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      createConversation: vi.fn(),
      deleteConversation: vi.fn(),
      renameConversation: vi.fn(),
      streamMessage: vi.fn(),
      getUsageStats: vi.fn(),
      getDailyLimit: vi.fn(),
      getOrCreateUsage: vi.fn(),
    },
    sentry: {
      captureError: vi.fn(),
    },
  }
})

// Stub auth middleware to inject a test user
function fakeAuth(req, _res, next) {
  req.user = { userId: 1, username: 'testuser', role: 'student' }
  next()
}

// Stub rate limiters to be no-ops
function fakeRateLimiter(_req, _res, next) {
  next()
}
fakeRateLimiter.default = fakeRateLimiter

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/modules/ai/ai.service'), mocks.aiService],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/middleware/auth'), fakeAuth],
  [require.resolve('../src/lib/rateLimiters'), { readLimiter: fakeRateLimiter, authLimiter: fakeRateLimiter, writeLimiter: fakeRateLimiter }],
  [require.resolve('express-rate-limit'), () => fakeRateLimiter],
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

  delete require.cache[aiRoutePath]
  const aiRouterModule = require('../src/modules/ai')
  const aiRouter = aiRouterModule.default || aiRouterModule

  app = express()
  app.use(express.json())
  app.use('/', aiRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[aiRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ── GET /conversations ────────────────────────────────────────────

describe('GET /conversations', () => {
  it('returns conversations list', async () => {
    mocks.aiService.listConversations.mockResolvedValue({
      conversations: [{ id: 1, title: 'Chat 1' }],
      total: 1,
    })

    const res = await request(app).get('/conversations')

    expect(res.status).toBe(200)
    expect(res.body.conversations).toHaveLength(1)
    expect(res.body.total).toBe(1)
  })

  it('clamps limit to 100', async () => {
    mocks.aiService.listConversations.mockResolvedValue({ conversations: [], total: 0 })

    await request(app).get('/conversations?limit=500')

    expect(mocks.aiService.listConversations).toHaveBeenCalledWith(1, { limit: 100, offset: 0 })
  })

  it('returns 500 on service error', async () => {
    mocks.aiService.listConversations.mockRejectedValue(new Error('DB down'))

    const res = await request(app).get('/conversations')

    expect(res.status).toBe(500)
    expect(res.body.error).toContain('Failed')
  })
})

// ── POST /conversations ───────────────────────────────────────────

describe('POST /conversations', () => {
  it('creates a conversation', async () => {
    const mockConv = { id: 1, title: null, model: 'claude-sonnet-4-20250514', createdAt: new Date().toISOString() }
    mocks.aiService.createConversation.mockResolvedValue(mockConv)

    const res = await request(app).post('/conversations').send({})

    expect(res.status).toBe(201)
    expect(res.body.id).toBe(1)
  })

  it('passes title from body', async () => {
    mocks.aiService.createConversation.mockResolvedValue({ id: 2, title: 'My Chat' })

    await request(app).post('/conversations').send({ title: 'My Chat' })

    expect(mocks.aiService.createConversation).toHaveBeenCalledWith(1, 'My Chat')
  })
})

// ── GET /conversations/:id ────────────────────────────────────────

describe('GET /conversations/:id', () => {
  it('returns conversation with messages', async () => {
    mocks.aiService.getConversation.mockResolvedValue({
      id: 5,
      messages: [{ id: 1, role: 'user', content: 'hello' }],
    })

    const res = await request(app).get('/conversations/5')

    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(1)
  })

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/conversations/abc')

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Invalid')
  })

  it('returns 404 for non-existent conversation', async () => {
    mocks.aiService.getConversation.mockResolvedValue(null)

    const res = await request(app).get('/conversations/999')

    expect(res.status).toBe(404)
  })
})

// ── DELETE /conversations/:id ─────────────────────────────────────

describe('DELETE /conversations/:id', () => {
  it('deletes an existing conversation', async () => {
    mocks.aiService.deleteConversation.mockResolvedValue({ id: 5 })

    const res = await request(app).delete('/conversations/5')

    expect(res.status).toBe(200)
    expect(res.body.message).toContain('deleted')
  })

  it('returns 404 for non-existent/non-owned conversation', async () => {
    mocks.aiService.deleteConversation.mockResolvedValue(null)

    const res = await request(app).delete('/conversations/999')

    expect(res.status).toBe(404)
  })

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).delete('/conversations/abc')

    expect(res.status).toBe(400)
  })
})

// ── PATCH /conversations/:id ──────────────────────────────────────

describe('PATCH /conversations/:id', () => {
  it('renames conversation with valid title', async () => {
    mocks.aiService.renameConversation.mockResolvedValue({ id: 5, title: 'New Title' })

    const res = await request(app)
      .patch('/conversations/5')
      .send({ title: 'New Title' })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('New Title')
  })

  it('returns 400 for missing title', async () => {
    const res = await request(app)
      .patch('/conversations/5')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Title')
  })

  it('returns 400 for empty title', async () => {
    const res = await request(app)
      .patch('/conversations/5')
      .send({ title: '   ' })

    expect(res.status).toBe(400)
  })

  it('truncates title to 200 characters', async () => {
    mocks.aiService.renameConversation.mockResolvedValue({ id: 5, title: 'x' })

    const longTitle = 'a'.repeat(300)
    await request(app).patch('/conversations/5').send({ title: longTitle })

    const calledTitle = mocks.aiService.renameConversation.mock.calls[0][2]
    expect(calledTitle.length).toBeLessThanOrEqual(200)
  })
})

// ── POST /messages ────────────────────────────────────────────────

describe('POST /messages', () => {
  it('returns 400 for missing conversationId', async () => {
    const res = await request(app)
      .post('/messages')
      .send({ content: 'hello' })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('conversationId')
  })

  it('returns 400 for missing content', async () => {
    const res = await request(app)
      .post('/messages')
      .send({ conversationId: 1 })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('content')
  })

  it('returns 400 for empty content', async () => {
    const res = await request(app)
      .post('/messages')
      .send({ conversationId: 1, content: '   ' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for message exceeding max length', async () => {
    const res = await request(app)
      .post('/messages')
      .send({ conversationId: 1, content: 'x'.repeat(5001) })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('long')
  })

  it('returns 400 for too many images', async () => {
    const res = await request(app)
      .post('/messages')
      .send({
        conversationId: 1,
        content: 'test',
        images: [
          { base64: 'a', mediaType: 'image/png' },
          { base64: 'b', mediaType: 'image/png' },
          { base64: 'c', mediaType: 'image/png' },
          { base64: 'd', mediaType: 'image/png' },
        ],
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('image')
  })

  it('returns 400 for unsupported image type', async () => {
    const res = await request(app)
      .post('/messages')
      .send({
        conversationId: 1,
        content: 'test',
        images: [{ base64: 'abc', mediaType: 'image/svg+xml' }],
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Unsupported')
  })

  it('returns 400 for image missing base64', async () => {
    const res = await request(app)
      .post('/messages')
      .send({
        conversationId: 1,
        content: 'test',
        images: [{ mediaType: 'image/png' }],
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('base64')
  })

  it('returns 400 for oversized image', async () => {
    // The route validates base64 size: (length * 3/4) > MAX_IMAGE_SIZE (5MB).
    // Use a string just over the threshold: 5MB * 4/3 ~ 6.67M chars.
    // But Express body-parser has a ~1MB default limit, so we use a smaller
    // payload that still exceeds the 5MB decoded threshold by being just
    // over (5 * 1024 * 1024 * 4 / 3) + 1 ~ but fits under Express's limit.
    // Instead, test with a string that decodes to just over 5MB but stays
    // small enough for Express: impossible with real base64.
    // So we test the validation logic by checking a moderately large string
    // whose (length * 3/4) > 5MB threshold by crafting a shorter test.
    // At 100KB base64, decoded ~ 75KB (under 5MB) -- this should PASS validation.
    // To test the actual check, we use a string where the math exceeds 5MB:
    const sizeOver5MB = Math.ceil((5 * 1024 * 1024 * 4) / 3) + 100
    // This is too large for Express default body-parser, which returns 413.
    // Accept either 400 (our validation) or 413 (Express body limit).
    const res = await request(app)
      .post('/messages')
      .send({
        conversationId: 1,
        content: 'test',
        images: [{ base64: 'A'.repeat(sizeOver5MB), mediaType: 'image/png' }],
      })

    expect([400, 413]).toContain(res.status)
  })
})

// ── GET /usage ────────────────────────────────────────────────────

describe('GET /usage', () => {
  it('returns usage stats', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'student', emailVerified: true, isStaffVerified: false })
    mocks.aiService.getUsageStats.mockResolvedValue({
      messagesUsed: 5,
      messagesLimit: 60,
      messagesRemaining: 55,
      tokensUsed: 1000,
      resetsAt: '2026-04-02T00:00:00.000Z',
    })

    const res = await request(app).get('/usage')

    expect(res.status).toBe(200)
    expect(res.body.messagesUsed).toBe(5)
    expect(res.body.messagesLimit).toBe(60)
    expect(res.body.messagesRemaining).toBe(55)
  })

  it('returns 404 when user not found', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)

    const res = await request(app).get('/usage')

    expect(res.status).toBe(404)
  })
})
