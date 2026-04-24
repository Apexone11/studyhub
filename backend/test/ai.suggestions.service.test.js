/**
 * ai.suggestions.service.test.js — Phase 3 service unit tests.
 *
 * Pins the contract that matters most for security:
 *   - PII in the input context never reaches Anthropic.
 *   - PII in the model's output never reaches the client (defense
 *     in depth — we tell the model not to emit PII, but verify too).
 *   - Quota is shared with Hub AI: when daily usage is at cap,
 *     fetchOrGenerate returns suggestion=null + quotaExhausted=true
 *     WITHOUT calling Anthropic.
 *   - validateModelOutput rejects malformed / hallucinated shapes.
 *   - dismissSuggestion enforces ownership via the gated updateMany.
 *
 * Mocks the AnthropicSDK + prisma via Module._load patching, same
 * pattern as plagiarism.unit.test.js + loginChallenge.service.unit.test.js.
 */

import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const servicePath = require.resolve('../src/modules/ai/ai.suggestions.service')

const mocks = vi.hoisted(() => {
  const messagesCreate = vi.fn()
  const prisma = {
    aiSuggestion: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  }
  const aiContext = {
    buildContext: vi.fn(),
    redactPII: vi.fn((text) => {
      // Reuse the real redaction logic for accuracy in the PII tests.
      if (typeof text !== 'string' || text.length === 0) return ''
      return text
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
        .replace(
          /(?<![\w-])(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}(?![\w-])/g,
          '[redacted-phone]',
        )
    }),
  }
  const aiService = {
    getDailyLimit: vi.fn(),
    getOrCreateUsage: vi.fn(),
    getClient: vi.fn(() => ({ messages: { create: messagesCreate } })),
    incrementUsage: vi.fn(),
  }
  const sentry = { captureError: vi.fn() }
  return { prisma, aiContext, aiService, sentry, messagesCreate }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/modules/ai/ai.context'), mocks.aiContext],
  [require.resolve('../src/modules/ai/ai.service'), mocks.aiService],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
])

const originalModuleLoad = Module._load
let service

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      const mocked = mockTargets.get(resolved)
      if (mocked) return mocked
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }
  delete require.cache[servicePath]
  service = require(servicePath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[servicePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.aiService.getDailyLimit.mockResolvedValue(30)
  mocks.aiService.getOrCreateUsage.mockResolvedValue({ messageCount: 0 })
})

function modelResponse(text) {
  return {
    content: [{ type: 'text', text }],
    usage: { output_tokens: 64 },
  }
}

const VALID_JSON =
  '{"text":"Review chapter 3 today.","ctaLabel":"Open in Hub AI","ctaAction":"open_chat"}'

describe('validateModelOutput', () => {
  it('accepts a well-formed object with one of the three allowed CTA actions', () => {
    expect(
      service.validateModelOutput({
        text: 'Hi.',
        ctaLabel: 'Go',
        ctaAction: 'open_chat',
      }),
    ).toEqual({ text: 'Hi.', ctaLabel: 'Go', ctaAction: 'open_chat' })

    for (const action of ['create_sheet', 'review_sheet']) {
      expect(
        service.validateModelOutput({ text: 'x', ctaLabel: 'y', ctaAction: action }),
      ).not.toBeNull()
    }
  })

  it('rejects unknown CTA actions (locks the allowlist)', () => {
    expect(
      service.validateModelOutput({
        text: 'x',
        ctaLabel: 'y',
        ctaAction: 'visit_external_url',
      }),
    ).toBeNull()
  })

  it('rejects missing or non-string fields', () => {
    expect(service.validateModelOutput({})).toBeNull()
    expect(service.validateModelOutput({ text: 'x' })).toBeNull()
    expect(
      service.validateModelOutput({ text: 1, ctaLabel: 'y', ctaAction: 'open_chat' }),
    ).toBeNull()
  })

  it('rejects oversize text or labels', () => {
    expect(
      service.validateModelOutput({
        text: 'x'.repeat(281),
        ctaLabel: 'y',
        ctaAction: 'open_chat',
      }),
    ).toBeNull()
    expect(
      service.validateModelOutput({
        text: 'x',
        ctaLabel: 'y'.repeat(41),
        ctaAction: 'open_chat',
      }),
    ).toBeNull()
  })

  it('rejects empty text or label after trim', () => {
    expect(
      service.validateModelOutput({ text: '   ', ctaLabel: 'y', ctaAction: 'open_chat' }),
    ).toBeNull()
    expect(
      service.validateModelOutput({ text: 'x', ctaLabel: '  ', ctaAction: 'open_chat' }),
    ).toBeNull()
  })
})

describe('isStale', () => {
  it('treats a null suggestion as stale', () => {
    expect(service.isStale(null)).toBe(true)
  })
  it('returns false for a suggestion generated 1 minute ago', () => {
    const fresh = { generatedAt: new Date(Date.now() - 60 * 1000) }
    expect(service.isStale(fresh)).toBe(false)
  })
  it('returns true for a suggestion older than the staleness window', () => {
    const old = { generatedAt: new Date(Date.now() - service.STALENESS_MS - 1000) }
    expect(service.isStale(old)).toBe(true)
  })
})

describe('generateSuggestion — PII redaction at I/O boundaries', () => {
  it('redacts PII from the context string sent to Anthropic (input boundary)', async () => {
    mocks.aiContext.buildContext.mockResolvedValueOnce(
      'Recent: emailed alice@example.com about chapter 3.',
    )
    mocks.messagesCreate.mockResolvedValueOnce(modelResponse(VALID_JSON))
    mocks.prisma.aiSuggestion.create.mockResolvedValueOnce({ id: 1 })

    await service.generateSuggestion({ id: 1, role: 'student' })

    expect(mocks.messagesCreate).toHaveBeenCalledTimes(1)
    const callArg = mocks.messagesCreate.mock.calls[0][0]
    const userContent = callArg.messages[0].content
    expect(userContent).not.toContain('alice@example.com')
    expect(userContent).toContain('[redacted-email]')
  })

  it('redacts PII from model output before persisting + returning (output boundary)', async () => {
    // Model misbehaves and emits a phone number despite being told not to.
    mocks.aiContext.buildContext.mockResolvedValueOnce('')
    mocks.messagesCreate.mockResolvedValueOnce(
      modelResponse(
        '{"text":"Call 123-456-7890 to schedule.","ctaLabel":"Call now","ctaAction":"open_chat"}',
      ),
    )
    mocks.prisma.aiSuggestion.create.mockImplementationOnce(({ data }) =>
      Promise.resolve({ id: 1, ...data }),
    )

    const created = await service.generateSuggestion({ id: 1 })

    expect(created.text).not.toContain('123-456-7890')
    expect(created.text).toContain('[redacted-phone]')
    // Persist call must use the REDACTED text, not the raw model output.
    const persistArg = mocks.prisma.aiSuggestion.create.mock.calls[0][0].data
    expect(persistArg.text).not.toContain('123-456-7890')
  })

  it('strips ```json``` code fences before parsing', async () => {
    mocks.aiContext.buildContext.mockResolvedValueOnce('')
    mocks.messagesCreate.mockResolvedValueOnce(modelResponse('```json\n' + VALID_JSON + '\n```'))
    mocks.prisma.aiSuggestion.create.mockResolvedValueOnce({ id: 1 })
    await expect(service.generateSuggestion({ id: 1 })).resolves.toBeTruthy()
  })

  it('throws on non-JSON model output', async () => {
    mocks.aiContext.buildContext.mockResolvedValueOnce('')
    mocks.messagesCreate.mockResolvedValueOnce(modelResponse('not json at all'))
    await expect(service.generateSuggestion({ id: 1 })).rejects.toThrow(/non-JSON/i)
    expect(mocks.prisma.aiSuggestion.create).not.toHaveBeenCalled()
  })

  it('throws on a JSON object that fails the validator', async () => {
    mocks.aiContext.buildContext.mockResolvedValueOnce('')
    mocks.messagesCreate.mockResolvedValueOnce(
      modelResponse('{"text":"x","ctaLabel":"y","ctaAction":"visit_url"}'),
    )
    await expect(service.generateSuggestion({ id: 1 })).rejects.toThrow(/malformed/i)
  })

  it('increments the shared daily usage counter (quota aggregation with Hub AI)', async () => {
    mocks.aiContext.buildContext.mockResolvedValueOnce('')
    mocks.messagesCreate.mockResolvedValueOnce(modelResponse(VALID_JSON))
    mocks.prisma.aiSuggestion.create.mockResolvedValueOnce({ id: 1 })

    await service.generateSuggestion({ id: 7 })

    expect(mocks.aiService.incrementUsage).toHaveBeenCalledWith(7, 64)
  })
})

describe('fetchOrGenerate — quota integration', () => {
  it('returns the existing suggestion when fresh, without calling Anthropic', async () => {
    const fresh = {
      id: 5,
      generatedAt: new Date(Date.now() - 60 * 1000),
      dismissedAt: null,
    }
    mocks.prisma.aiSuggestion.findFirst.mockResolvedValueOnce(fresh)
    const result = await service.fetchOrGenerate({ id: 1 })
    expect(result).toEqual({ suggestion: fresh, quotaExhausted: false })
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('returns quotaExhausted: true and skips the model call when daily cap is reached', async () => {
    mocks.prisma.aiSuggestion.findFirst.mockResolvedValueOnce(null)
    mocks.aiService.getDailyLimit.mockResolvedValueOnce(30)
    mocks.aiService.getOrCreateUsage.mockResolvedValueOnce({ messageCount: 30 })

    const result = await service.fetchOrGenerate({ id: 1 })

    expect(result).toEqual({ suggestion: null, quotaExhausted: true })
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
    expect(mocks.aiService.incrementUsage).not.toHaveBeenCalled()
  })

  it('regenerates when the existing suggestion is stale', async () => {
    const stale = {
      id: 5,
      generatedAt: new Date(Date.now() - service.STALENESS_MS - 60 * 1000),
      dismissedAt: null,
    }
    mocks.prisma.aiSuggestion.findFirst.mockResolvedValueOnce(stale)
    mocks.aiContext.buildContext.mockResolvedValueOnce('')
    mocks.messagesCreate.mockResolvedValueOnce(modelResponse(VALID_JSON))
    mocks.prisma.aiSuggestion.create.mockResolvedValueOnce({ id: 6 })

    const result = await service.fetchOrGenerate({ id: 1 })

    expect(result.quotaExhausted).toBe(false)
    expect(result.suggestion.id).toBe(6)
    expect(mocks.messagesCreate).toHaveBeenCalled()
  })
})

describe('dismissSuggestion — owner check', () => {
  it('returns true when the gated updateMany matched the row', async () => {
    mocks.prisma.aiSuggestion.updateMany.mockResolvedValueOnce({ count: 1 })
    await expect(service.dismissSuggestion(1, 42)).resolves.toBe(true)
    const callArg = mocks.prisma.aiSuggestion.updateMany.mock.calls[0][0]
    // userId in the where clause is the IDOR guard — without it,
    // any user could dismiss any suggestion by id.
    expect(callArg.where).toMatchObject({ id: 42, userId: 1, dismissedAt: null })
  })

  it('returns false when the suggestion does not belong to the caller (IDOR)', async () => {
    mocks.prisma.aiSuggestion.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(service.dismissSuggestion(1, 9999)).resolves.toBe(false)
  })

  it('returns false when the row exists but is already dismissed', async () => {
    mocks.prisma.aiSuggestion.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(service.dismissSuggestion(1, 42)).resolves.toBe(false)
  })
})
