/**
 * streaks.test.js — getUserStreak prefers the denormalized UserStreak row.
 *
 * The legacy O(366) scan in lib/streaks.js
 * now reads `UserStreak.findUnique` first and short-circuits when a row
 * exists. The scan path remains in place for users created before the
 * streak table was seeded.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/monitoring/sentry', () => ({ captureError: vi.fn() }))

const { getUserStreak } = await import('../src/lib/streaks.js')

function makePrisma({ userStreakRow, activities = [] }) {
  return {
    userStreak: {
      findUnique: vi.fn(async () => userStreakRow || null),
    },
    userDailyActivity: {
      findMany: vi.fn(async () => activities),
    },
  }
}

describe('getUserStreak (denormalized fast path)', () => {
  it('returns the UserStreak row when currentStreak > 0 without scanning activity', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const prisma = makePrisma({
      userStreakRow: {
        userId: 42,
        currentStreak: 7,
        longestStreak: 14,
        lastActiveDate: today,
      },
    })

    const result = await getUserStreak(prisma, 42)

    expect(result.currentStreak).toBe(7)
    expect(result.longestStreak).toBe(14)
    expect(result.todayActive).toBe(true)
    expect(prisma.userStreak.findUnique).toHaveBeenCalledTimes(1)
    expect(prisma.userDailyActivity.findMany).not.toHaveBeenCalled()
  })

  it('falls back to the legacy activity scan when no UserStreak row exists', async () => {
    const prisma = makePrisma({
      userStreakRow: null,
      activities: [],
    })

    const result = await getUserStreak(prisma, 42)

    expect(result.currentStreak).toBe(0)
    expect(result.longestStreak).toBe(0)
    expect(result.lastActiveDate).toBeNull()
    expect(prisma.userDailyActivity.findMany).toHaveBeenCalledTimes(1)
  })

  it('falls back to the legacy scan when the denormalized counter is zero', async () => {
    // currentStreak=0 means the daily sweeper reset the row. The scan
    // result is authoritative until the next bump.
    const prisma = makePrisma({
      userStreakRow: {
        userId: 42,
        currentStreak: 0,
        longestStreak: 5,
        lastActiveDate: new Date('2026-01-01'),
      },
      activities: [],
    })

    const result = await getUserStreak(prisma, 42)

    expect(prisma.userDailyActivity.findMany).toHaveBeenCalled()
    expect(result.currentStreak).toBe(0)
  })

  it('reports todayActive=false when the UserStreak row is older than today', async () => {
    const yesterday = new Date()
    yesterday.setHours(0, 0, 0, 0)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const prisma = makePrisma({
      userStreakRow: {
        userId: 42,
        currentStreak: 3,
        longestStreak: 10,
        lastActiveDate: yesterday,
      },
    })

    const result = await getUserStreak(prisma, 42)

    expect(result.currentStreak).toBe(3)
    expect(result.todayActive).toBe(false)
  })

  it('falls back to the legacy scan when lastActiveDate is older than yesterday', async () => {
    // If the 04:00 UTC sweeper failed to run (or hasn't run yet on a fresh
    // deploy), a stale UserStreak row can still carry a positive
    // currentStreak. Returning it would lie to the user. Bot-review fix
    // (2026-05-13, Codex P1) — the fast path must validate freshness;
    // anything older than yesterday falls back to the authoritative scan.
    const threeDaysAgo = new Date()
    threeDaysAgo.setHours(0, 0, 0, 0)
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3)
    const prisma = makePrisma({
      userStreakRow: {
        userId: 42,
        currentStreak: 9,
        longestStreak: 14,
        lastActiveDate: threeDaysAgo,
      },
      activities: [], // scan returns "no activity" → currentStreak=0
    })

    const result = await getUserStreak(prisma, 42)

    expect(prisma.userDailyActivity.findMany).toHaveBeenCalledTimes(1)
    expect(result.currentStreak).toBe(0)
    expect(result.lastActiveDate).toBeNull()
  })
})
