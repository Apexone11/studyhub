/**
 * streaks.js — User streak and weekly activity tracking
 *
 * Provides functions to calculate consecutive study days and weekly activity summaries.
 */
const { captureError } = require('../monitoring/sentry')

/**
 * Get the current date at midnight UTC
 * @returns {Date}
 */
function getTodayDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/**
 * Get the date of the start of the current week (Monday)
 * @returns {Date}
 */
function getWeekStartDate() {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) // Adjust when day is Sunday
  return new Date(today.getFullYear(), today.getMonth(), diff)
}

/**
 * Calculate user's current study streak (consecutive days with any activity)
 * Returns current streak, longest streak, last active date, and whether today is active
 *
 * @param {PrismaClient} prisma
 * @param {number} userId
 * @returns {Promise<{currentStreak: number, longestStreak: number, lastActiveDate: Date|null, todayActive: boolean}>}
 */
async function getUserStreak(prisma, userId) {
  try {
    const activities = await prisma.userDailyActivity.findMany({
      where: { userId },
      select: { date: true, commits: true, sheets: true, reviews: true, comments: true },
      orderBy: { date: 'desc' },
      take: 366, // Up to 1 year of data
    })

    if (activities.length === 0) {
      return { currentStreak: 0, longestStreak: 0, lastActiveDate: null, todayActive: false }
    }

    const today = getTodayDate()
    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0
    let lastActiveDate = null

    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i]
      const activityDate = new Date(activity.date)
      const totalActivity =
        activity.commits + activity.sheets + activity.reviews + activity.comments

      if (totalActivity > 0) {
        if (!lastActiveDate) {
          lastActiveDate = activityDate
        }
        tempStreak++
      } else {
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak
        }
        tempStreak = 0
      }

      // Check if this is the first day we're processing
      if (i === 0 && totalActivity > 0) {
        // If the most recent activity is today, we're starting from today
        if (activityDate.getTime() === today.getTime()) {
          currentStreak = 1
        } else {
          // Check if the streak is still alive (yesterday was active)
          const yesterday = new Date(today)
          yesterday.setDate(yesterday.getDate() - 1)
          if (activityDate.getTime() === yesterday.getTime()) {
            currentStreak = 1
          }
        }
      } else if (i > 0 && totalActivity > 0 && currentStreak > 0) {
        // We're in an ongoing streak
        const prevActivity = activities[i - 1]
        const prevDate = new Date(prevActivity.date)
        const expectedPrevDate = new Date(activityDate)
        expectedPrevDate.setDate(expectedPrevDate.getDate() + 1)

        if (prevDate.getTime() === expectedPrevDate.getTime()) {
          currentStreak++
        }
      }
    }

    if (tempStreak > longestStreak) {
      longestStreak = tempStreak
    }

    const todayActive = lastActiveDate && lastActiveDate.getTime() === today.getTime()

    return {
      currentStreak,
      longestStreak,
      lastActiveDate,
      todayActive,
    }
  } catch (error) {
    captureError(error, { source: 'getUserStreak', userId })
    return { currentStreak: 0, longestStreak: 0, lastActiveDate: null, todayActive: false }
  }
}

/**
 * Get weekly activity summary (current week: Mon-Sun)
 * Returns days active, total actions, goal progress, and daily breakdown
 *
 * @param {PrismaClient} prisma
 * @param {number} userId
 * @param {number} weeklyGoal - Default to 5 days active per week
 * @returns {Promise<{daysActive: number, totalActions: number, goal: number, goalMet: boolean, dailyBreakdown: Array}>}
 */
async function getWeeklyActivity(prisma, userId, weeklyGoal = 5) {
  try {
    const weekStart = getWeekStartDate()
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const activities = await prisma.userDailyActivity.findMany({
      where: {
        userId,
        date: {
          gte: weekStart,
          lt: weekEnd,
        },
      },
      orderBy: { date: 'asc' },
    })

    let daysActive = 0
    let totalActions = 0
    const dailyBreakdown = []

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + i)

      const activity = activities.find((a) => {
        const aDate = new Date(a.date)
        return aDate.getTime() === date.getTime()
      })

      if (activity) {
        const total = activity.commits + activity.sheets + activity.reviews + activity.comments
        if (total > 0) {
          daysActive++
        }
        totalActions += total
        dailyBreakdown.push({
          date: date.toISOString().split('T')[0],
          commits: activity.commits,
          sheets: activity.sheets,
          reviews: activity.reviews,
          comments: activity.comments,
          total,
        })
      } else {
        dailyBreakdown.push({
          date: date.toISOString().split('T')[0],
          commits: 0,
          sheets: 0,
          reviews: 0,
          comments: 0,
          total: 0,
        })
      }
    }

    return {
      daysActive,
      totalActions,
      goal: weeklyGoal,
      goalMet: daysActive >= weeklyGoal,
      dailyBreakdown,
    }
  } catch (error) {
    captureError(error, { source: 'getWeeklyActivity', userId })
    return {
      daysActive: 0,
      totalActions: 0,
      goal: weeklyGoal,
      goalMet: false,
      dailyBreakdown: [],
    }
  }
}

module.exports = { getUserStreak, getWeeklyActivity }
