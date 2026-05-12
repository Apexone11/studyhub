/**
 * streakService.js — UserStreak row maintenance.
 *
 * `getUserStreak()` in lib/streaks.js scans UserDailyActivity to
 * derive the current run. That works for read paths but is too
 * heavy to call on every write. This module owns the denormalized
 * UserStreak counter — increment on any "active" action (sheet
 * create, note create, commit, comment), reset when the daily
 * sweeper sees lastActiveDate older than yesterday.
 *
 * Rules:
 *   - Calling on the same UTC day is a no-op (already counted).
 *   - lastActiveDate === yesterday → currentStreak += 1.
 *   - lastActiveDate < yesterday   → currentStreak = 1 (reset).
 *   - lastActiveDate is null       → currentStreak = 1 (first action).
 *
 * Errors never bubble — the caller is mid-create and a streak
 * write failure must not abort the user-visible action. Failures
 * route through `captureError` so they remain visible in Sentry.
 */
const { captureError } = require('../monitoring/sentry')

/**
 * Return midnight UTC for the given moment (default: now).
 * UserStreak.lastActiveDate is stored as PostgreSQL DATE, so we
 * key by UTC day to avoid one-off bumps from local-time DST.
 */
function utcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function daysBetween(a, b) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY)
}

/**
 * Bump the user's streak for today's action.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} userId
 * @returns {Promise<{currentStreak:number,longestStreak:number,lastActiveDate:Date}|null>}
 */
async function bumpStreak(prisma, userId) {
  if (!Number.isInteger(userId) || userId < 1) return null

  try {
    const today = utcDay()
    const existing = await prisma.userStreak.findUnique({ where: { userId } })

    if (!existing) {
      const row = await prisma.userStreak.create({
        data: {
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastActiveDate: today,
        },
      })
      return row
    }

    const last = existing.lastActiveDate ? new Date(existing.lastActiveDate) : null
    if (last) {
      const diff = daysBetween(today, last)
      if (diff <= 0) {
        // Already counted today (or, defensively, a future-dated row
        // we can't trust). Don't double-increment.
        return existing
      }

      let nextStreak
      if (diff === 1) {
        nextStreak = existing.currentStreak + 1
      } else {
        nextStreak = 1 // gap of >=2 days resets the run
      }

      const longest = Math.max(existing.longestStreak, nextStreak)
      const row = await prisma.userStreak.update({
        where: { userId },
        data: {
          currentStreak: nextStreak,
          longestStreak: longest,
          lastActiveDate: today,
        },
      })
      return row
    }

    // Row exists but lastActiveDate is null (defensive — never written
    // by the create path but possible after a manual reset).
    const row = await prisma.userStreak.update({
      where: { userId },
      data: {
        currentStreak: 1,
        longestStreak: Math.max(existing.longestStreak, 1),
        lastActiveDate: today,
      },
    })
    return row
  } catch (error) {
    captureError(error, { source: 'streakService.bumpStreak', userId })
    return null
  }
}

/**
 * Reset stale streaks: any row whose lastActiveDate is older than
 * yesterday means the user missed yesterday, so their run is over.
 *
 * Returns a count of rows reset. Called from the daily sweeper.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Date} [now]
 * @returns {Promise<number>}
 */
async function resetStaleStreaks(prisma, now = new Date()) {
  const today = utcDay(now)
  const yesterday = new Date(today)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)

  try {
    const result = await prisma.userStreak.updateMany({
      where: {
        currentStreak: { gt: 0 },
        OR: [{ lastActiveDate: null }, { lastActiveDate: { lt: yesterday } }],
      },
      data: { currentStreak: 0 },
    })
    return result.count || 0
  } catch (error) {
    captureError(error, { source: 'streakService.resetStaleStreaks' })
    return 0
  }
}

module.exports = {
  bumpStreak,
  resetStaleStreaks,
  utcDay,
}
