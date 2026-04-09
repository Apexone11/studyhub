/**
 * studyGroups.media.service.js — weekly media-upload quota for study groups.
 *
 * A "media upload" is any file pushed through POST /resources/upload or
 * embedded as a discussion post attachment. Quotas are plan-gated:
 *
 *   free, donor, unknown plan → 5 uploads / ISO week
 *   pro_monthly, pro_yearly   → 100 uploads / ISO week
 *   admin (platform role)     → unlimited
 *
 * The counter lives in GroupMediaUsage (migration 20260409000001). Each
 * row is keyed on (userId, weekStart) where weekStart is the Monday of
 * the current ISO week at 00:00 UTC. `incrementUsage` upserts the row
 * and bumps `count`; `assertQuotaAvailable` reads the current row and
 * throws a 429 if the user is over budget.
 *
 * All DB calls are wrapped in try/catch so missing tables (migration not
 * yet deployed to a stale env) degrade gracefully — the user keeps the
 * feature rather than getting a 500 wall. Admins bypass quotas entirely
 * so support workflows stay unblocked.
 */

const prisma = require('../../lib/prisma')
const { getUserPlan, isPro } = require('../../lib/getUserPlan')
const { captureError } = require('../../monitoring/sentry')

// Plan → weekly upload cap. `admin` platform role is handled separately
// via an early-exit in assertQuotaAvailable (no quota).
const GROUP_MEDIA_WEEKLY_QUOTA = Object.freeze({
  free: 5,
  donor: 5,
  pro_monthly: 100,
  pro_yearly: 100,
})

const DEFAULT_QUOTA = GROUP_MEDIA_WEEKLY_QUOTA.free

function resolveQuotaForPlan(plan) {
  if (Object.prototype.hasOwnProperty.call(GROUP_MEDIA_WEEKLY_QUOTA, plan)) {
    return GROUP_MEDIA_WEEKLY_QUOTA[plan]
  }
  return DEFAULT_QUOTA
}

/**
 * Returns the Monday 00:00 UTC of the ISO week containing `reference`.
 * Exported so tests can pin the week boundary deterministically.
 */
function getWeekStart(reference = new Date()) {
  const date = new Date(Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate(),
  ))
  // getUTCDay: 0 = Sunday, 1 = Monday ... 6 = Saturday.
  // Shift so Monday is the start: Sunday (0) → -6 days, Monday (1) → 0, etc.
  const dayOfWeek = date.getUTCDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7
  date.setUTCDate(date.getUTCDate() - daysSinceMonday)
  return date
}

function getNextWeekStart(reference = new Date()) {
  const week = getWeekStart(reference)
  const next = new Date(week)
  next.setUTCDate(next.getUTCDate() + 7)
  return next
}

/**
 * Look up the current week's usage row for a user. Returns null on
 * missing row OR on DB error — callers treat either case as "0 used".
 */
async function loadCurrentUsage(userId, reference = new Date()) {
  try {
    const weekStart = getWeekStart(reference)
    const row = await prisma.groupMediaUsage.findUnique({
      where: {
        userId_weekStart: { userId, weekStart },
      },
      select: { count: true, weekStart: true },
    })
    return row
  } catch (error) {
    captureError(error, { location: 'studyGroups.media.service/loadCurrentUsage', userId })
    return null
  }
}

/**
 * Compute the quota snapshot the frontend displays in the composer:
 *   { plan, quota, used, remaining, resetsAt, unlimited }
 * Never throws — graceful degradation means the UI always gets a
 * usable shape even if the DB is unreachable.
 */
async function getQuotaSnapshot(userId, { role } = {}) {
  if (role === 'admin') {
    return {
      plan: 'admin',
      quota: -1,
      used: 0,
      remaining: -1,
      resetsAt: getNextWeekStart().toISOString(),
      unlimited: true,
    }
  }

  let plan = 'free'
  try {
    plan = await getUserPlan(userId)
  } catch (error) {
    captureError(error, { location: 'studyGroups.media.service/getQuotaSnapshot/plan', userId })
  }

  const quota = resolveQuotaForPlan(plan)
  const row = await loadCurrentUsage(userId)
  const used = row?.count || 0
  const remaining = Math.max(0, quota - used)

  return {
    plan,
    quota,
    used,
    remaining,
    resetsAt: getNextWeekStart().toISOString(),
    unlimited: false,
  }
}

/**
 * Throw a quota-exceeded error if the user is over budget. Returns the
 * quota snapshot on success so callers can embed it in the 201 response.
 *
 * Throws an object shaped like:
 *   { status: 429, code: 'RATE_LIMITED', message, extra: { quota, used, resetsAt } }
 * Route handlers catch this and call sendError or res.status(...).json(...).
 */
async function assertQuotaAvailable(userId, { role } = {}) {
  const snapshot = await getQuotaSnapshot(userId, { role })
  if (snapshot.unlimited) return snapshot
  if (snapshot.remaining > 0) return snapshot

  const err = new Error(
    `Weekly media upload quota reached (${snapshot.used}/${snapshot.quota}). Upgrade to Pro for a 100/week cap.`,
  )
  err.status = 429
  err.code = 'RATE_LIMITED'
  err.extra = {
    quota: snapshot.quota,
    used: snapshot.used,
    plan: snapshot.plan,
    resetsAt: snapshot.resetsAt,
  }
  throw err
}

/**
 * Bump the current-week counter by one. Called AFTER a successful upload
 * so failed uploads don't burn quota. Graceful-degradation on DB error.
 */
async function incrementUsage(userId, groupId) {
  try {
    const weekStart = getWeekStart()
    await prisma.groupMediaUsage.upsert({
      where: { userId_weekStart: { userId, weekStart } },
      update: { count: { increment: 1 }, groupId: groupId || null },
      create: {
        userId,
        groupId: groupId || null,
        weekStart,
        count: 1,
      },
    })
  } catch (error) {
    captureError(error, { location: 'studyGroups.media.service/incrementUsage', userId, groupId })
  }
}

module.exports = {
  GROUP_MEDIA_WEEKLY_QUOTA,
  resolveQuotaForPlan,
  getWeekStart,
  getNextWeekStart,
  getQuotaSnapshot,
  assertQuotaAvailable,
  incrementUsage,
  // Re-exports so tests can mock them without importing from storage
  isPro,
}
