import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  getLeaderboard,
  calculateActivityScore,
  ACTIVITY_WEIGHTS,
} = require('../src/lib/leaderboard')

/*
 * Unit tests for the campus leaderboard.
 *
 * The perf-critical contract (the fix this file guards) is:
 *   GET /api/feed/leaderboard?period=alltime is PUBLIC. It must NOT hydrate
 *   every user who ever had activity. The aggregate is scored + sliced to the
 *   top-N FIRST, and only those N userIds are passed to user.findMany. A
 *   regression that hydrates all aggregated ids would call findMany with the
 *   full id list — these tests assert findMany only ever sees <= limit ids.
 *
 * Also asserted:
 *   - ranking semantics (score order + 1-based rank) are preserved,
 *   - the 'alltime' query is date-bounded (rolling window), never an empty
 *     where clause that scans the whole table.
 */

function makeRow(userId, sums) {
  return {
    userId,
    _sum: {
      commits: sums.commits || 0,
      sheets: sums.sheets || 0,
      reviews: sums.reviews || 0,
      comments: sums.comments || 0,
    },
  }
}

function buildPrisma({ aggregated, users }) {
  const groupBy = vi.fn().mockResolvedValue(aggregated)
  const findMany = vi.fn().mockImplementation(({ where }) => {
    const ids = new Set(where.id.in)
    return Promise.resolve(users.filter((u) => ids.has(u.id)))
  })
  return {
    prisma: {
      userDailyActivity: { groupBy },
      user: { findMany },
    },
    groupBy,
    findMany,
  }
}

describe('leaderboard scoring', () => {
  it('weights activity types per the documented spec', () => {
    expect(ACTIVITY_WEIGHTS).toEqual({ commits: 2, sheets: 5, reviews: 3, comments: 1 })
    expect(calculateActivityScore({ commits: 1, sheets: 1, reviews: 1, comments: 1 })).toBe(11)
    expect(calculateActivityScore({})).toBe(0)
  })
})

describe('getLeaderboard', () => {
  it('hydrates ONLY the top-N users, not every aggregated row (perf guard)', async () => {
    // 50 users had activity but the caller wants the top 3.
    const aggregated = []
    const users = []
    for (let i = 1; i <= 50; i += 1) {
      aggregated.push(makeRow(i, { commits: i }))
      users.push({ id: i, username: `u${i}`, avatarUrl: null })
    }
    const { prisma, groupBy, findMany } = buildPrisma({ aggregated, users })

    const result = await getLeaderboard(prisma, 'alltime', 3)

    expect(result).toHaveLength(3)
    // The single user.findMany call must receive at most `limit` ids — never
    // the full aggregated id list.
    expect(findMany).toHaveBeenCalledTimes(1)
    const idsRequested = findMany.mock.calls[0][0].where.id.in
    expect(idsRequested).toHaveLength(3)
    // The top scorers (highest commits) are user 50, 49, 48.
    expect(new Set(idsRequested)).toEqual(new Set([50, 49, 48]))
    // groupBy still aggregates once.
    expect(groupBy).toHaveBeenCalledTimes(1)
  })

  it('preserves descending score order and assigns 1-based ranks', async () => {
    const aggregated = [
      makeRow(1, { commits: 1 }), // score 2
      makeRow(2, { sheets: 4 }), // score 20
      makeRow(3, { reviews: 2 }), // score 6
    ]
    const users = [
      { id: 1, username: 'alice', avatarUrl: null },
      { id: 2, username: 'bob', avatarUrl: '/b.png' },
      { id: 3, username: 'carol', avatarUrl: null },
    ]
    const { prisma } = buildPrisma({ aggregated, users })

    const result = await getLeaderboard(prisma, 'weekly', 20)

    expect(result.map((r) => r.userId)).toEqual([2, 3, 1])
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3])
    expect(result[0]).toMatchObject({
      userId: 2,
      username: 'bob',
      avatarUrl: '/b.png',
      score: 20,
      breakdown: { commits: 0, sheets: 4, reviews: 0, comments: 0 },
    })
  })

  it("date-bounds the 'alltime' query instead of an empty where clause", async () => {
    const { prisma, groupBy } = buildPrisma({ aggregated: [], users: [] })

    await getLeaderboard(prisma, 'alltime', 20)

    const where = groupBy.mock.calls[0][0].where
    expect(where.date).toBeDefined()
    expect(where.date.gte).toBeInstanceOf(Date)
    expect(where.date.lt).toBeInstanceOf(Date)
    // Rolling window is bounded — start is in the past, well before now.
    expect(where.date.gte.getTime()).toBeLessThan(where.date.lt.getTime())
  })

  it('drops aggregated rows whose user no longer exists', async () => {
    const aggregated = [makeRow(1, { sheets: 2 }), makeRow(2, { sheets: 1 })]
    // User 1 was deleted; only user 2 hydrates.
    const users = [{ id: 2, username: 'bob', avatarUrl: null }]
    const { prisma } = buildPrisma({ aggregated, users })

    const result = await getLeaderboard(prisma, 'monthly', 20)

    expect(result.map((r) => r.userId)).toEqual([2])
    expect(result[0].rank).toBe(1)
  })

  it('returns [] and swallows errors (public endpoint must not 500)', async () => {
    const prisma = {
      userDailyActivity: { groupBy: vi.fn().mockRejectedValue(new Error('db down')) },
      user: { findMany: vi.fn() },
    }
    const result = await getLeaderboard(prisma, 'alltime', 20)
    expect(result).toEqual([])
  })
})
