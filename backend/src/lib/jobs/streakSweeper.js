/**
 * streakSweeper.js — Daily reset of stale UserStreak rows.
 *
 * The streak counter is bumped at activity sites (sheet create,
 * note create, sheetLab commit, comment via activityTracker). Once
 * a user misses a day, the counter must drop back to 0 so the UI
 * doesn't keep showing yesterday's number. Doing that lazily at
 * read time would mean every profile page load runs a write —
 * a sweeper at 04:00 UTC is cheaper and bounds the staleness to
 * one day.
 *
 * Wrapped in runWithHeartbeat per CLAUDE.md A10 so the on-call
 * sees `job.start` / `job.success` / `job.failure` events. SLA
 * is 60s — the underlying UPDATE is a single indexed query.
 */
const prisma = require('../prisma')
const log = require('../logger')
const { resetStaleStreaks } = require('../streakService')

/**
 * Reset every UserStreak whose lastActiveDate is older than
 * yesterday (or null). Returns the number of rows reset.
 */
async function runStreakSweep() {
  const resetCount = await resetStaleStreaks(prisma)
  log.info(
    { event: 'streak.sweep.complete', resetCount },
    `Streak sweep reset ${resetCount} stale rows`,
  )
  return resetCount
}

module.exports = { runStreakSweep }
