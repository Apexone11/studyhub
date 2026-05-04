/**
 * aiSpend.test.js — daily Anthropic spend ceiling.
 *
 * Master plan L5-CRIT-1 (atomic increment-and-compare) +
 * 2026-05-04 founder-locked rule (admin tier bypasses entirely).
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const targetPath = require.resolve('../src/modules/ai/ai.spendCeiling.js')

const mocks = vi.hoisted(() => ({
  prisma: {
    aiGlobalSpendDay: { upsert: vi.fn() },
    aiUsageLog: { findUnique: vi.fn(), upsert: vi.fn() },
    $executeRaw: vi.fn(),
  },
  attachmentsService: {
    resolveDocCaps: vi.fn(),
  },
  sentry: { captureError: vi.fn() },
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/modules/ai/attachments/attachments.service'), mocks.attachmentsService],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
])

const originalLoad = Module._load
let mod

beforeAll(() => {
  Module._load = function patched(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain)
    const mocked = mockTargets.get(resolved)
    if (mocked) return mocked
    return originalLoad.apply(this, arguments)
  }
  delete require.cache[targetPath]
  mod = require(targetPath)
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[targetPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.aiGlobalSpendDay.upsert.mockResolvedValue({})
})

describe('reserveSpend — admin bypass', () => {
  it('returns ok=true with admin: true and skips the cap check', async () => {
    const result = await mod.reserveSpend({
      user: { role: 'admin', userId: 1 },
      inputTokensEst: 100000,
      maxOutputTokens: 16384,
    })
    expect(result.ok).toBe(true)
    expect(result.admin).toBe(true)
    expect(mocks.prisma.aiGlobalSpendDay.upsert).not.toHaveBeenCalled()
    expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled()
  })
})

describe('reserveSpend — non-admin atomic UPDATE', () => {
  it('returns ok=true when the UPDATE advanced one row', async () => {
    mocks.prisma.$executeRaw.mockResolvedValueOnce(1)
    const result = await mod.reserveSpend({
      user: { role: 'student', id: 42 },
      inputTokensEst: 1000,
      maxOutputTokens: 1024,
    })
    expect(result.ok).toBe(true)
    expect(result.costEstCents).toBeGreaterThan(0)
    expect(mocks.prisma.aiGlobalSpendDay.upsert).toHaveBeenCalledTimes(1)
  })
  it('returns ok=false with reason ceiling_reached when 0 rows updated', async () => {
    mocks.prisma.$executeRaw.mockResolvedValueOnce(0)
    const result = await mod.reserveSpend({
      user: { role: 'student', id: 42 },
      inputTokensEst: 100,
      maxOutputTokens: 100,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('ceiling_reached')
  })
})

describe('checkUserTokenSubcap', () => {
  it('admin bypasses the per-user cap', async () => {
    const result = await mod.checkUserTokenSubcap({ user: { role: 'admin', id: 1 } })
    expect(result.ok).toBe(true)
    expect(result.admin).toBe(true)
  })
  it('returns ok=true when used < cap', async () => {
    mocks.attachmentsService.resolveDocCaps.mockResolvedValue({ tokenSubcap: 50_000 })
    mocks.prisma.aiUsageLog.findUnique.mockResolvedValue({
      tokensIn: 1000,
      tokensOut: 1000,
      documentTokens: 0,
    })
    const result = await mod.checkUserTokenSubcap({ user: { role: 'student', id: 7 } })
    expect(result.ok).toBe(true)
    expect(result.used).toBe(2000)
  })
  it('returns ok=false when used >= cap', async () => {
    mocks.attachmentsService.resolveDocCaps.mockResolvedValue({ tokenSubcap: 1000 })
    mocks.prisma.aiUsageLog.findUnique.mockResolvedValue({
      tokensIn: 600,
      tokensOut: 500,
      documentTokens: 0,
    })
    const result = await mod.checkUserTokenSubcap({ user: { role: 'student', id: 7 } })
    expect(result.ok).toBe(false)
  })
})
