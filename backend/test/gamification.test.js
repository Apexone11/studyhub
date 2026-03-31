import { describe, expect, it, beforeEach, vi } from 'vitest'
import { getUserStreak, getWeeklyActivity } from '../src/lib/streaks.js'
import { getLeaderboard, calculateActivityScore, ACTIVITY_WEIGHTS } from '../src/lib/leaderboard.js'

describe('Gamification System', () => {
  // ────────────────────────────────────────────────────────────────
  // Streaks Tests
  // ────────────────────────────────────────────────────────────────

  describe('getUserStreak', () => {
    let mockPrisma

    beforeEach(() => {
      mockPrisma = {
        userDailyActivity: {
          findMany: vi.fn(),
        },
      }
    })

    it('should return 0 streak when no activity exists', async () => {
      mockPrisma.userDailyActivity.findMany.mockResolvedValue([])

      const result = await getUserStreak(mockPrisma, 1)

      expect(result).toEqual({
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
        todayActive: false,
      })
    })

    it('should calculate current streak correctly', async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      const twoDaysAgo = new Date(yesterday)
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 1)

      mockPrisma.userDailyActivity.findMany.mockResolvedValue([
        { date: today, commits: 1, sheets: 0, reviews: 0, comments: 0 },
        { date: yesterday, commits: 1, sheets: 0, reviews: 0, comments: 0 },
        { date: twoDaysAgo, commits: 1, sheets: 0, reviews: 0, comments: 0 },
      ])

      const result = await getUserStreak(mockPrisma, 1)

      expect(result.currentStreak).toBe(3)
      expect(result.longestStreak).toBeGreaterThanOrEqual(3)
      expect(result.todayActive).toBe(true)
    })

    it('should track longest streak separately from current', async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const activities = [
        // Current streak: 2 days
        { date: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000), commits: 1, sheets: 0, reviews: 0, comments: 0 },
        { date: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000), commits: 1, sheets: 0, reviews: 0, comments: 0 },
        // Gap day
        { date: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000), commits: 0, sheets: 0, reviews: 0, comments: 0 },
        // Previous streak: 5 days
        { date: new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000), commits: 1, sheets: 0, reviews: 0, comments: 0 },
        { date: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000), commits: 1, sheets: 0, reviews: 0, comments: 0 },
        { date: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000), commits: 1, sheets: 0, reviews: 0, comments: 0 },
        { date: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000), commits: 1, sheets: 0, reviews: 0, comments: 0 },
        { date: new Date(today.getTime() - 8 * 24 * 60 * 60 * 1000), commits: 1, sheets: 0, reviews: 0, comments: 0 },
      ]

      mockPrisma.userDailyActivity.findMany.mockResolvedValue(activities)

      const result = await getUserStreak(mockPrisma, 1)

      expect(result.currentStreak).toBeLessThanOrEqual(2)
      expect(result.longestStreak).toBe(5)
    })

    it('should count any non-zero activity as active', async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      mockPrisma.userDailyActivity.findMany.mockResolvedValue([
        { date: today, commits: 0, sheets: 0, reviews: 1, comments: 0 },
        { date: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000), commits: 0, sheets: 1, reviews: 0, comments: 0 },
        { date: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000), commits: 0, sheets: 0, reviews: 0, comments: 2 },
      ])

      const result = await getUserStreak(mockPrisma, 1)

      expect(result.currentStreak).toBe(3)
      expect(result.todayActive).toBe(true)
    })
  })

  describe('getWeeklyActivity', () => {
    let mockPrisma

    beforeEach(() => {
      mockPrisma = {
        userDailyActivity: {
          findMany: vi.fn(),
        },
      }
    })

    it('should return zero activity when no records exist', async () => {
      mockPrisma.userDailyActivity.findMany.mockResolvedValue([])

      const result = await getWeeklyActivity(mockPrisma, 1, 5)

      expect(result).toHaveProperty('daysActive', 0)
      expect(result).toHaveProperty('totalActions', 0)
      expect(result).toHaveProperty('goal', 5)
      expect(result).toHaveProperty('goalMet', false)
      expect(result.dailyBreakdown).toHaveLength(7)
    })

    it('should count days with any activity', async () => {
      const today = new Date()
      const weekStart = new Date(today)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1) // Monday
      weekStart.setHours(0, 0, 0, 0)

      const monday = new Date(weekStart)
      const tuesday = new Date(weekStart)
      tuesday.setDate(tuesday.getDate() + 1)

      mockPrisma.userDailyActivity.findMany.mockResolvedValue([
        { date: monday, commits: 2, sheets: 1, reviews: 0, comments: 0 },
        { date: tuesday, commits: 0, sheets: 0, reviews: 1, comments: 0 },
      ])

      const result = await getWeeklyActivity(mockPrisma, 1, 5)

      expect(result.daysActive).toBe(2)
      expect(result.totalActions).toBe(4)
    })

    it('should check goal achievement', async () => {
      const today = new Date()
      const weekStart = new Date(today)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1) // Monday
      weekStart.setHours(0, 0, 0, 0)

      const activities = []
      for (let i = 0; i < 5; i++) {
        const date = new Date(weekStart)
        date.setDate(date.getDate() + i)
        activities.push({ date, commits: 1, sheets: 0, reviews: 0, comments: 0 })
      }

      mockPrisma.userDailyActivity.findMany.mockResolvedValue(activities)

      const result = await getWeeklyActivity(mockPrisma, 1, 5)

      expect(result.daysActive).toBe(5)
      expect(result.goalMet).toBe(true)
    })
  })

  // ────────────────────────────────────────────────────────────────
  // Leaderboard Tests
  // ────────────────────────────────────────────────────────────────

  describe('calculateActivityScore', () => {
    it('should calculate score with correct weights', () => {
      const activity = {
        commits: 10,
        sheets: 2,
        reviews: 5,
        comments: 20,
      }

      const score = calculateActivityScore(activity)

      // 10*2 + 2*5 + 5*3 + 20*1 = 20 + 10 + 15 + 20 = 65
      expect(score).toBe(65)
    })

    it('should handle missing fields as zero', () => {
      const activity = {
        commits: 5,
        sheets: undefined,
        reviews: 3,
      }

      const score = calculateActivityScore(activity)

      // 5*2 + 0*5 + 3*3 + 0*1 = 10 + 0 + 9 + 0 = 19
      expect(score).toBe(19)
    })

    it('should use correct weights', () => {
      expect(ACTIVITY_WEIGHTS.commits).toBe(2)
      expect(ACTIVITY_WEIGHTS.sheets).toBe(5)
      expect(ACTIVITY_WEIGHTS.reviews).toBe(3)
      expect(ACTIVITY_WEIGHTS.comments).toBe(1)
    })
  })

  describe('getLeaderboard', () => {
    let mockPrisma

    beforeEach(() => {
      mockPrisma = {
        userDailyActivity: {
          groupBy: vi.fn(),
        },
        user: {
          findMany: vi.fn(),
        },
      }
    })

    it('should return empty array when no activity exists', async () => {
      mockPrisma.userDailyActivity.groupBy.mockResolvedValue([])
      mockPrisma.user.findMany.mockResolvedValue([])

      const result = await getLeaderboard(mockPrisma, 'weekly', 20)

      expect(result).toEqual([])
    })

    it('should rank users by score', async () => {
      mockPrisma.userDailyActivity.groupBy.mockResolvedValue([
        {
          userId: 1,
          _sum: { commits: 10, sheets: 2, reviews: 5, comments: 10 },
        },
        {
          userId: 2,
          _sum: { commits: 5, sheets: 5, reviews: 3, comments: 5 },
        },
      ])

      mockPrisma.user.findMany.mockResolvedValue([
        { id: 1, username: 'alice', avatarUrl: 'url1' },
        { id: 2, username: 'bob', avatarUrl: 'url2' },
      ])

      const result = await getLeaderboard(mockPrisma, 'weekly', 20)

      expect(result).toHaveLength(2)
      expect(result[0].rank).toBe(1)
      expect(result[1].rank).toBe(2)
      expect(result[0].score).toBeGreaterThan(result[1].score)
    })

    it('should respect limit parameter', async () => {
      const users = []
      for (let i = 1; i <= 25; i++) {
        users.push({
          userId: i,
          _sum: { commits: i, sheets: 1, reviews: 1, comments: 1 },
        })
      }

      mockPrisma.userDailyActivity.groupBy.mockResolvedValue(users)

      const userRecords = users.map((u) => ({
        id: u.userId,
        username: `user${u.userId}`,
        avatarUrl: null,
      }))

      mockPrisma.user.findMany.mockResolvedValue(userRecords)

      const result = await getLeaderboard(mockPrisma, 'weekly', 10)

      expect(result).toHaveLength(10)
    })

    it('should include breakdown in response', async () => {
      mockPrisma.userDailyActivity.groupBy.mockResolvedValue([
        {
          userId: 1,
          _sum: { commits: 10, sheets: 2, reviews: 5, comments: 10 },
        },
      ])

      mockPrisma.user.findMany.mockResolvedValue([
        { id: 1, username: 'alice', avatarUrl: null },
      ])

      const result = await getLeaderboard(mockPrisma, 'weekly', 20)

      expect(result[0]).toHaveProperty('breakdown')
      expect(result[0].breakdown).toEqual({
        commits: 10,
        sheets: 2,
        reviews: 5,
        comments: 10,
      })
    })
  })
})
