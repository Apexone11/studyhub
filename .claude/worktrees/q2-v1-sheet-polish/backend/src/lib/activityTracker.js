/**
 * activityTracker.js — Increment daily activity counters for the contribution graph.
 *
 * Usage: await trackActivity(prisma, userId, 'commits')
 * Valid fields: commits, sheets, reviews, comments
 */
const { captureError } = require('../monitoring/sentry')

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
}

module.exports = { trackActivity }
