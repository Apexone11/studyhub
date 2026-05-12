/**
 * activityTracker.js — Increment daily activity counters for the contribution graph.
 *
 * Usage: await trackActivity(prisma, userId, 'commits')
 * Valid fields: commits, sheets, reviews, comments
 *
 * Side effect: every successful call also bumps the user's
 * UserStreak row (idempotent per-UTC-day) so retention can be
 * tracked without a separate fan-out at each call site.
 */
const { captureError } = require('../monitoring/sentry')
const { bumpStreak } = require('./streakService')

const VALID_FIELDS = new Set(['commits', 'sheets', 'reviews', 'comments'])

function todayDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

async function trackActivity(prisma, userId, field, amount = 1) {
  if (!VALID_FIELDS.has(field)) return
  if (!userId || amount < 1) return

  try {
    const date = todayDate()

    await prisma.userDailyActivity.upsert({
      where: { userId_date: { userId, date } },
      update: { [field]: { increment: amount } },
      create: { userId, date, [field]: amount },
    })
  } catch (error) {
    // Non-critical — log but don't break the caller
    captureError(error, { source: 'trackActivity', userId, field })
  }

  // Streak bump is best-effort and intentionally separate from the
  // activity upsert: a streak-row failure must not roll back the
  // contribution-graph increment, and vice versa.
  await bumpStreak(prisma, userId)
}

module.exports = { trackActivity }
