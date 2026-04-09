/**
 * Unit tests for studyGroups.media.service — weekly quota logic.
 *
 * Mocks prisma + getUserPlan so tests run without a database. Covers:
 *   - Week boundary computation (Monday 00:00 UTC)
 *   - Free plan quota snapshot (5/week)
 *   - Pro plan quota snapshot (100/week)
 *   - Admin role short-circuit (unlimited)
 *   - Over-quota throws a 429-shaped error
 *   - Graceful degradation when Prisma throws
 *   - incrementUsage upserts and bumps count
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const servicePath = require.resolve('../src/modules/studyGroups/studyGroups.media.service')

const mocks = vi.hoisted(() => ({
  prisma: {
    groupMediaUsage: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  getUserPlan: vi.fn(),
  captureError: vi.fn(),
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/getUserPlan'), {
    getUserPlan: mocks.getUserPlan,
    isPro: (plan) => plan === 'pro_monthly' || plan === 'pro_yearly',
  }],
  [require.resolve('../src/monitoring/sentry'), { captureError: mocks.captureError }],
])

const originalLoad = Module._load
let service

beforeAll(() => {
  Module._load = function patched(requestId, parent, isMain) {
    const resolved = Module._resolveFilename(requestId, parent, isMain)
    if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    return originalLoad.apply(this, arguments)
  }
  delete require.cache[servicePath]
  service = require(servicePath)
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[servicePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUserPlan.mockResolvedValue('free')
  mocks.prisma.groupMediaUsage.findUnique.mockResolvedValue(null)
  mocks.prisma.groupMediaUsage.upsert.mockResolvedValue({})
})

describe('getWeekStart', () => {
  it('returns the Monday of the ISO week containing the reference date', () => {
    // 2026-04-09 is a Thursday (UTC). Monday of that week is 2026-04-06.
    const thursday = new Date('2026-04-09T15:30:00.000Z')
    const monday = service.getWeekStart(thursday)
    expect(monday.getUTCFullYear()).toBe(2026)
    expect(monday.getUTCMonth()).toBe(3) // April
    expect(monday.getUTCDate()).toBe(6)
    expect(monday.getUTCHours()).toBe(0)
    expect(monday.getUTCMinutes()).toBe(0)
  })

  it('returns the same Monday when given the Monday itself', () => {
    const monday = new Date('2026-04-06T00:00:00.000Z')
    const result = service.getWeekStart(monday)
    expect(result.toISOString()).toBe('2026-04-06T00:00:00.000Z')
  })

  it('wraps Sunday back to the previous Monday', () => {
    // 2026-04-12 is a Sunday.
    const sunday = new Date('2026-04-12T18:00:00.000Z')
    const monday = service.getWeekStart(sunday)
    expect(monday.getUTCDate()).toBe(6) // previous Monday
  })
})

describe('getNextWeekStart', () => {
  it('returns Monday of the following week', () => {
    const thursday = new Date('2026-04-09T15:30:00.000Z')
    const next = service.getNextWeekStart(thursday)
    expect(next.getUTCDate()).toBe(13)
  })
})

describe('getQuotaSnapshot', () => {
  it('returns unlimited for admin role regardless of plan', async () => {
    const snapshot = await service.getQuotaSnapshot(42, { role: 'admin' })
    expect(snapshot.unlimited).toBe(true)
    expect(snapshot.plan).toBe('admin')
    expect(snapshot.quota).toBe(-1)
    // Admin path short-circuits — plan lookup and DB read must be skipped.
    expect(mocks.getUserPlan).not.toHaveBeenCalled()
    expect(mocks.prisma.groupMediaUsage.findUnique).not.toHaveBeenCalled()
  })

  it('returns free plan quota 5 with used=0 for a new user', async () => {
    mocks.getUserPlan.mockResolvedValue('free')
    mocks.prisma.groupMediaUsage.findUnique.mockResolvedValue(null)

    const snapshot = await service.getQuotaSnapshot(42, { role: 'student' })
    expect(snapshot.plan).toBe('free')
    expect(snapshot.quota).toBe(5)
    expect(snapshot.used).toBe(0)
    expect(snapshot.remaining).toBe(5)
    expect(snapshot.unlimited).toBe(false)
    expect(snapshot.resetsAt).toMatch(/T00:00:00/)
  })

  it('returns pro plan quota 100', async () => {
    mocks.getUserPlan.mockResolvedValue('pro_monthly')
    const snapshot = await service.getQuotaSnapshot(42, { role: 'student' })
    expect(snapshot.quota).toBe(100)
  })

  it('subtracts used count from quota for remaining', async () => {
    mocks.getUserPlan.mockResolvedValue('free')
    mocks.prisma.groupMediaUsage.findUnique.mockResolvedValue({ count: 3, weekStart: new Date() })
    const snapshot = await service.getQuotaSnapshot(42, { role: 'student' })
    expect(snapshot.used).toBe(3)
    expect(snapshot.remaining).toBe(2)
  })

  it('clamps remaining to zero when used exceeds quota', async () => {
    mocks.getUserPlan.mockResolvedValue('free')
    mocks.prisma.groupMediaUsage.findUnique.mockResolvedValue({ count: 99, weekStart: new Date() })
    const snapshot = await service.getQuotaSnapshot(42, { role: 'student' })
    expect(snapshot.remaining).toBe(0)
  })

  it('degrades gracefully when Prisma throws (returns 0 used)', async () => {
    mocks.getUserPlan.mockResolvedValue('free')
    mocks.prisma.groupMediaUsage.findUnique.mockRejectedValue(new Error('relation does not exist'))
    const snapshot = await service.getQuotaSnapshot(42, { role: 'student' })
    expect(snapshot.used).toBe(0)
    expect(snapshot.remaining).toBe(5)
    expect(mocks.captureError).toHaveBeenCalled()
  })

  it('degrades to free plan when getUserPlan throws', async () => {
    mocks.getUserPlan.mockRejectedValue(new Error('subscription table missing'))
    const snapshot = await service.getQuotaSnapshot(42, { role: 'student' })
    expect(snapshot.plan).toBe('free')
    expect(snapshot.quota).toBe(5)
  })
})

describe('assertQuotaAvailable', () => {
  it('returns the snapshot when under quota', async () => {
    mocks.getUserPlan.mockResolvedValue('free')
    mocks.prisma.groupMediaUsage.findUnique.mockResolvedValue({ count: 2, weekStart: new Date() })
    const snapshot = await service.assertQuotaAvailable(42, { role: 'student' })
    expect(snapshot.remaining).toBe(3)
  })

  it('throws a 429-shaped error when over quota', async () => {
    mocks.getUserPlan.mockResolvedValue('free')
    mocks.prisma.groupMediaUsage.findUnique.mockResolvedValue({ count: 5, weekStart: new Date() })

    await expect(
      service.assertQuotaAvailable(42, { role: 'student' }),
    ).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      extra: expect.objectContaining({
        quota: 5,
        used: 5,
        plan: 'free',
      }),
    })
  })

  it('admin role bypasses quota entirely', async () => {
    const snapshot = await service.assertQuotaAvailable(42, { role: 'admin' })
    expect(snapshot.unlimited).toBe(true)
  })
})

describe('incrementUsage', () => {
  it('upserts the current-week row for the user', async () => {
    await service.incrementUsage(42, 17)
    expect(mocks.prisma.groupMediaUsage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_weekStart: expect.objectContaining({ userId: 42 }) },
        update: { count: { increment: 1 }, groupId: 17 },
        create: expect.objectContaining({ userId: 42, groupId: 17, count: 1 }),
      }),
    )
  })

  it('swallows Prisma errors so a stale DB does not 500 the upload response', async () => {
    mocks.prisma.groupMediaUsage.upsert.mockRejectedValue(new Error('table not found'))
    await expect(service.incrementUsage(42, 17)).resolves.toBeUndefined()
    expect(mocks.captureError).toHaveBeenCalled()
  })
})
