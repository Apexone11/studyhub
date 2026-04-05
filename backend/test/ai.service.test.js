/**
 * ai.service.test.js -- Unit tests for Hub AI service layer.
 * Tests conversation CRUD, rate limiting, title generation,
 * and streaming behavior with mocked Prisma + Anthropic SDK.
 *
 * Uses Module._load patching (established project pattern) to intercept
 * CJS requires before the service module loads.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const servicePath = require.resolve('../src/modules/ai/ai.service')

const mocks = vi.hoisted(() => {
  const prisma = {
    aiConversation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    aiMessage: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    aiUsageLog: {
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    studySheet: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    note: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  }

  // Mock Anthropic streaming.
  // NOTE: Do not use vi.fn() for mockStream methods here -- restoreMocks: true
  // in vitest config will strip the mock implementation after each test.
  // Instead we use plain functions that delegate to mutable holders.
  const mockStream = {
    _iteratorFn: null,
    _finalMessageFn: null,
    [Symbol.asyncIterator]() { return mockStream._iteratorFn ? mockStream._iteratorFn() : ({ next: () => Promise.resolve({ done: true }) }) },
    abort() {},
    finalMessage() { return mockStream._finalMessageFn ? mockStream._finalMessageFn() : Promise.resolve({ usage: { input_tokens: 0, output_tokens: 0 } }) },
  }

  /** Mutable holder -- tests set streamImpl to control what stream() does. */
  let streamImpl = () => mockStream

  const mockAnthropicInstance = {
    messages: {
      // Use a getter so calls always go through the latest streamImpl,
      // even after restoreMocks / clearMocks.
      get stream() {
        return streamImpl
      },
    },
  }

  // Record stream calls for assertion via this spy array.
  const streamCalls = []

  // Must be a regular function (not arrow) so it works with `new`.
  function AnthropicClass() { return mockAnthropicInstance }

  return {
    prisma,
    mockStream,
    mockAnthropicInstance,
    streamCalls,
    /** Set the stream implementation and start recording calls. */
    setStreamImpl(fn) {
      streamCalls.length = 0
      streamImpl = (...args) => {
        streamCalls.push(args)
        return fn(...args)
      }
    },
    /** Reset to default (returns mockStream). */
    resetStream() {
      streamCalls.length = 0
      streamImpl = (...args) => {
        streamCalls.push(args)
        return mockStream
      }
    },
    AnthropicClass,
    sentry: { captureError: vi.fn() },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [
    require.resolve('@anthropic-ai/sdk'),
    { default: mocks.AnthropicClass, __esModule: true },
  ],
])

const originalModuleLoad = Module._load

let aiService

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests'

  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[servicePath]
  // Clear context cache too.
  delete require.cache[require.resolve('../src/modules/ai/ai.context')]
  aiService = require('../src/modules/ai/ai.service')
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[servicePath]
  delete require.cache[require.resolve('../src/modules/ai/ai.context')]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resetStream()
  // Reset mockStream helpers for each test.
  mocks.mockStream._iteratorFn = null
  mocks.mockStream._finalMessageFn = null
})

// ── Helpers ────────────────────────────────────────────────────────

function makeMockRes() {
  const chunks = []
  return {
    write: vi.fn((data) => chunks.push(data)),
    end: vi.fn(),
    chunks,
    getEvents() {
      return chunks
        .map((c) => {
          const match = c.match(/^data: (.+)\n\n$/)
          return match ? JSON.parse(match[1]) : null
        })
        .filter(Boolean)
    },
  }
}

const baseUser = {
  id: 1,
  userId: 1,
  role: 'student',
  emailVerified: false,
  isStaffVerified: false,
}

// ── Tests ──────────────────────────────────────────────────────────

describe('getDailyLimit', () => {
  it('returns 30 for regular users', async () => {
    expect(await aiService.getDailyLimit({ role: 'student' })).toBe(30)
  })

  it('returns 60 for verified users', async () => {
    expect(await aiService.getDailyLimit({ role: 'student', emailVerified: true })).toBe(60)
  })

  it('returns 60 for staff-verified users', async () => {
    expect(await aiService.getDailyLimit({ role: 'student', isStaffVerified: true })).toBe(60)
  })

  it('returns 200 for admins', async () => {
    expect(await aiService.getDailyLimit({ role: 'admin' })).toBe(200)
  })

  it('admin limit takes precedence over verified status', async () => {
    expect(await aiService.getDailyLimit({ role: 'admin', emailVerified: true })).toBe(200)
  })
})

describe('getOrCreateUsage', () => {
  it('calls upsert with correct composite key and zeroed defaults', async () => {
    const mockUsage = { userId: 1, date: new Date(), messageCount: 5, tokenCount: 1000 }
    mocks.prisma.aiUsageLog.upsert.mockResolvedValue(mockUsage)

    const result = await aiService.getOrCreateUsage(1)

    expect(mocks.prisma.aiUsageLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_date: expect.objectContaining({ userId: 1 }) },
        create: expect.objectContaining({ userId: 1, messageCount: 0, tokenCount: 0 }),
        update: {},
      })
    )
    expect(result).toEqual(mockUsage)
  })
})

describe('listConversations', () => {
  it('returns conversations with count and total', async () => {
    const mockConvs = [
      { id: 1, title: 'Test', model: 'claude-sonnet-4-20250514', createdAt: new Date(), updatedAt: new Date(), _count: { messages: 3 } },
    ]
    mocks.prisma.aiConversation.findMany.mockResolvedValue(mockConvs)
    mocks.prisma.aiConversation.count.mockResolvedValue(1)

    const result = await aiService.listConversations(1, { limit: 10, offset: 0 })

    expect(result.conversations).toEqual(mockConvs)
    expect(result.total).toBe(1)
    expect(mocks.prisma.aiConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 1 },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 10,
      })
    )
  })

  it('uses default limit and offset', async () => {
    mocks.prisma.aiConversation.findMany.mockResolvedValue([])
    mocks.prisma.aiConversation.count.mockResolvedValue(0)

    await aiService.listConversations(1)

    expect(mocks.prisma.aiConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 30 })
    )
  })
})

describe('getConversation', () => {
  it('uses findFirst with userId filter (ownership check)', async () => {
    mocks.prisma.aiConversation.findFirst.mockResolvedValue({ id: 5, userId: 1, messages: [] })

    const result = await aiService.getConversation(5, 1)

    expect(mocks.prisma.aiConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, userId: 1 },
      })
    )
    expect(result).toBeTruthy()
  })

  it('returns null for non-owned conversation', async () => {
    mocks.prisma.aiConversation.findFirst.mockResolvedValue(null)

    const result = await aiService.getConversation(5, 999)
    expect(result).toBeNull()
  })
})

describe('createConversation', () => {
  it('creates conversation with userId and optional title', async () => {
    const mockConv = { id: 10, title: 'My Chat', model: 'claude-sonnet-4-20250514', createdAt: new Date(), updatedAt: new Date() }
    mocks.prisma.aiConversation.create.mockResolvedValue(mockConv)

    const result = await aiService.createConversation(1, 'My Chat')

    expect(mocks.prisma.aiConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: 1, title: 'My Chat' },
      })
    )
    expect(result).toEqual(mockConv)
  })

  it('creates conversation with null title when omitted', async () => {
    mocks.prisma.aiConversation.create.mockResolvedValue({ id: 11 })

    await aiService.createConversation(1)

    expect(mocks.prisma.aiConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: 1, title: null },
      })
    )
  })
})

describe('deleteConversation', () => {
  it('verifies ownership then deletes', async () => {
    const conv = { id: 5, userId: 1 }
    mocks.prisma.aiConversation.findFirst.mockResolvedValue(conv)
    mocks.prisma.aiConversation.delete.mockResolvedValue(conv)

    const result = await aiService.deleteConversation(5, 1)

    expect(mocks.prisma.aiConversation.findFirst).toHaveBeenCalledWith({ where: { id: 5, userId: 1 } })
    expect(mocks.prisma.aiConversation.delete).toHaveBeenCalledWith({ where: { id: 5 } })
    expect(result).toEqual(conv)
  })

  it('returns null if conversation not owned by user', async () => {
    mocks.prisma.aiConversation.findFirst.mockResolvedValue(null)

    const result = await aiService.deleteConversation(5, 999)

    expect(result).toBeNull()
    expect(mocks.prisma.aiConversation.delete).not.toHaveBeenCalled()
  })
})

describe('renameConversation', () => {
  it('verifies ownership then updates title', async () => {
    mocks.prisma.aiConversation.findFirst.mockResolvedValue({ id: 5, userId: 1 })
    mocks.prisma.aiConversation.update.mockResolvedValue({ id: 5, title: 'New Title' })

    const result = await aiService.renameConversation(5, 1, 'New Title')

    expect(result).toEqual({ id: 5, title: 'New Title' })
    expect(mocks.prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: { title: 'New Title' },
      })
    )
  })

  it('returns null if conversation not found', async () => {
    mocks.prisma.aiConversation.findFirst.mockResolvedValue(null)

    const result = await aiService.renameConversation(5, 999, 'Title')

    expect(result).toBeNull()
    expect(mocks.prisma.aiConversation.update).not.toHaveBeenCalled()
  })
})

describe('streamMessage', () => {
  it('sends error if conversation not found', async () => {
    mocks.prisma.aiConversation.findFirst.mockResolvedValue(null)
    const res = makeMockRes()

    await aiService.streamMessage({
      user: baseUser,
      conversationId: 999,
      content: 'hello',
      res,
    })

    const events = res.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
    expect(events[0].message).toContain('not found')
    expect(res.end).toHaveBeenCalled()
  })

  it('sends rate-limited error when daily limit is reached', async () => {
    mocks.prisma.aiConversation.findFirst.mockResolvedValue({ id: 1, userId: 1 })
    mocks.prisma.aiUsageLog.upsert.mockResolvedValue({ userId: 1, messageCount: 30, tokenCount: 5000 })
    const res = makeMockRes()

    await aiService.streamMessage({
      user: baseUser,
      conversationId: 1,
      content: 'hello',
      res,
    })

    const events = res.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
    expect(events[0].code).toBe('RATE_LIMITED')
    expect(res.end).toHaveBeenCalled()
  })

  it('auto-titles conversation on first message', async () => {
    // Mock context builder dependencies
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    mocks.prisma.aiConversation.findFirst.mockResolvedValue({ id: 1, userId: 1, title: null })
    mocks.prisma.aiUsageLog.upsert.mockResolvedValue({ userId: 1, messageCount: 0, tokenCount: 0 })
    mocks.prisma.aiMessage.create.mockResolvedValue({ id: 100 })
    mocks.prisma.aiMessage.count.mockResolvedValue(1) // first message
    mocks.prisma.aiConversation.update.mockResolvedValue({})
    mocks.prisma.aiMessage.findMany.mockResolvedValue([{ role: 'user', content: 'What is photosynthesis?' }])

    // Mock async iterator for streaming
    const streamEvents = [
      { type: 'content_block_delta', delta: { text: 'Photo' } },
      { type: 'content_block_delta', delta: { text: 'synthesis is...' } },
    ]
    let idx = 0
    mocks.mockStream._iteratorFn = () => ({
      next: () => {
        if (idx < streamEvents.length) {
          return Promise.resolve({ value: streamEvents[idx++], done: false })
        }
        return Promise.resolve({ done: true })
      },
    })
    mocks.mockStream._finalMessageFn = () => Promise.resolve({
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const res = makeMockRes()

    await aiService.streamMessage({
      user: baseUser,
      conversationId: 1,
      content: 'What is photosynthesis?',
      res,
    })

    const events = res.getEvents()
    const titleEvent = events.find((e) => e.type === 'title')
    expect(titleEvent).toBeTruthy()
    expect(titleEvent.title).toBe('What is photosynthesis?')

    const deltas = events.filter((e) => e.type === 'delta')
    expect(deltas).toHaveLength(2)
    expect(deltas[0].text).toBe('Photo')
    expect(deltas[1].text).toBe('synthesis is...')

    const doneEvent = events.find((e) => e.type === 'done')
    expect(doneEvent).toBeTruthy()
    expect(doneEvent.tokenCount).toBe(150)
  })

  it('truncates long titles to ~60 characters', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    mocks.prisma.aiConversation.findFirst.mockResolvedValue({ id: 1, userId: 1, title: null })
    mocks.prisma.aiUsageLog.upsert.mockResolvedValue({ userId: 1, messageCount: 0, tokenCount: 0 })
    mocks.prisma.aiMessage.create.mockResolvedValue({ id: 100 })
    mocks.prisma.aiMessage.count.mockResolvedValue(1)
    mocks.prisma.aiConversation.update.mockResolvedValue({})

    const longMessage = 'This is a very long message that should definitely be truncated because it exceeds sixty characters by a wide margin'
    mocks.prisma.aiMessage.findMany.mockResolvedValue([{ role: 'user', content: longMessage }])

    // Default iterator (no events) and finalMessage are already set by beforeEach.
    mocks.mockStream._finalMessageFn = () => Promise.resolve({ usage: { input_tokens: 10, output_tokens: 5 } })

    const res = makeMockRes()

    await aiService.streamMessage({
      user: baseUser,
      conversationId: 1,
      content: longMessage,
      res,
    })

    const titleEvent = res.getEvents().find((e) => e.type === 'title')
    expect(titleEvent).toBeTruthy()
    expect(titleEvent.title.length).toBeLessThanOrEqual(60)
    expect(titleEvent.title).toMatch(/\.\.\.$/)
  })

  it('uses MAX_OUTPUT_TOKENS_SHEET for sheet-generation requests', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    mocks.prisma.aiConversation.findFirst.mockResolvedValue({ id: 1, userId: 1, model: null })
    mocks.prisma.aiUsageLog.upsert.mockResolvedValue({ userId: 1, messageCount: 0, tokenCount: 0 })
    mocks.prisma.aiMessage.create.mockResolvedValue({ id: 100 })
    mocks.prisma.aiMessage.count.mockResolvedValue(1)
    mocks.prisma.aiConversation.update.mockResolvedValue({})
    mocks.prisma.aiMessage.findMany.mockResolvedValue([{ role: 'user', content: 'Create a study sheet for biology' }])

    // Default iterator (no events) and finalMessage are already set by beforeEach.
    mocks.mockStream._finalMessageFn = () => Promise.resolve({ usage: { input_tokens: 10, output_tokens: 5 } })

    const res = makeMockRes()

    await aiService.streamMessage({
      user: baseUser,
      conversationId: 1,
      content: 'Create a study sheet for biology',
      res,
    })

    expect(mocks.streamCalls).toHaveLength(1)
    expect(mocks.streamCalls[0][0]).toEqual(
      expect.objectContaining({
        max_tokens: 16384,
      })
    )
  })

  it('uses MAX_OUTPUT_TOKENS_QA for regular questions', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    mocks.prisma.aiConversation.findFirst.mockResolvedValue({ id: 1, userId: 1, model: null })
    mocks.prisma.aiUsageLog.upsert.mockResolvedValue({ userId: 1, messageCount: 0, tokenCount: 0 })
    mocks.prisma.aiMessage.create.mockResolvedValue({ id: 100 })
    mocks.prisma.aiMessage.count.mockResolvedValue(1)
    mocks.prisma.aiConversation.update.mockResolvedValue({})
    mocks.prisma.aiMessage.findMany.mockResolvedValue([{ role: 'user', content: 'What is gravity?' }])

    // Default iterator (no events) and finalMessage are already set by beforeEach.
    mocks.mockStream._finalMessageFn = () => Promise.resolve({ usage: { input_tokens: 10, output_tokens: 5 } })

    const res = makeMockRes()

    await aiService.streamMessage({
      user: baseUser,
      conversationId: 1,
      content: 'What is gravity?',
      res,
    })

    expect(mocks.streamCalls).toHaveLength(1)
    expect(mocks.streamCalls[0][0]).toEqual(
      expect.objectContaining({
        max_tokens: 2048,
      })
    )
  })

  it('fetches conversation history in desc order then reverses to chronological', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    mocks.prisma.aiConversation.findFirst.mockResolvedValue({ id: 1, userId: 1, model: null })
    mocks.prisma.aiUsageLog.upsert.mockResolvedValue({ userId: 1, messageCount: 2, tokenCount: 500 })
    mocks.prisma.aiMessage.create.mockResolvedValue({ id: 100 })
    mocks.prisma.aiMessage.count.mockResolvedValue(3)

    // Simulate DB returning messages in desc order
    mocks.prisma.aiMessage.findMany.mockResolvedValue([
      { role: 'user', content: 'third' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'first' },
    ])

    // Default iterator (no events) and finalMessage are already set by beforeEach.
    mocks.mockStream._finalMessageFn = () => Promise.resolve({ usage: { input_tokens: 10, output_tokens: 5 } })

    const res = makeMockRes()

    await aiService.streamMessage({
      user: baseUser,
      conversationId: 1,
      content: 'third',
      res,
    })

    // Verify findMany was called with desc ordering
    expect(mocks.prisma.aiMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      })
    )

    // The messages passed to Claude should be in chronological (asc) order
    expect(mocks.streamCalls).toHaveLength(1)
    const streamCall = mocks.streamCalls[0][0]
    expect(streamCall.messages[0].content).toBe('first')
    expect(streamCall.messages[1].content).toBe('second')
    expect(streamCall.messages[2].content).toBe('third')
  })

  it('builds multi-part content for image messages', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.studySheet.findMany.mockResolvedValue([])
    mocks.prisma.note.findMany.mockResolvedValue([])

    mocks.prisma.aiConversation.findFirst.mockResolvedValue({ id: 1, userId: 1, model: null })
    mocks.prisma.aiUsageLog.upsert.mockResolvedValue({ userId: 1, messageCount: 0, tokenCount: 0 })
    mocks.prisma.aiMessage.create.mockResolvedValue({ id: 100 })
    mocks.prisma.aiMessage.count.mockResolvedValue(1)
    mocks.prisma.aiConversation.update.mockResolvedValue({})
    mocks.prisma.aiMessage.findMany.mockResolvedValue([{ role: 'user', content: 'What is this?' }])

    // Default iterator (no events) and finalMessage are already set by beforeEach.
    mocks.mockStream._finalMessageFn = () => Promise.resolve({ usage: { input_tokens: 10, output_tokens: 5 } })

    const res = makeMockRes()

    await aiService.streamMessage({
      user: baseUser,
      conversationId: 1,
      content: 'What is this?',
      images: [{ base64: 'abc123', mediaType: 'image/png' }],
      res,
    })

    expect(mocks.streamCalls).toHaveLength(1)
    const streamCall = mocks.streamCalls[0][0]
    const lastMsg = streamCall.messages[streamCall.messages.length - 1]
    expect(Array.isArray(lastMsg.content)).toBe(true)
    expect(lastMsg.content[0]).toEqual({ type: 'text', text: 'What is this?' })
    expect(lastMsg.content[1]).toEqual(
      expect.objectContaining({
        type: 'image',
        source: expect.objectContaining({ type: 'base64', media_type: 'image/png' }),
      })
    )
  })
})

describe('getUsageStats', () => {
  it('returns formatted usage stats', async () => {
    mocks.prisma.aiUsageLog.upsert.mockResolvedValue({ userId: 1, messageCount: 10, tokenCount: 2000 })

    const stats = await aiService.getUsageStats(baseUser)

    expect(stats.messagesUsed).toBe(10)
    expect(stats.messagesLimit).toBe(30)
    expect(stats.messagesRemaining).toBe(20)
    expect(stats.tokensUsed).toBe(2000)
    expect(stats.resetsAt).toBeTruthy()
  })

  it('clamps remaining to 0 when over limit', async () => {
    mocks.prisma.aiUsageLog.upsert.mockResolvedValue({ userId: 1, messageCount: 35, tokenCount: 5000 })

    const stats = await aiService.getUsageStats(baseUser)

    expect(stats.messagesRemaining).toBe(0)
  })
})
