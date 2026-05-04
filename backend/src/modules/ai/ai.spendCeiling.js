/**
 * ai.spendCeiling.js — Daily Anthropic spend ceiling.
 *
 * Master plan L5-CRIT-1 + L3-HIGH-5. Atomic UPDATE-and-compare on
 * AiGlobalSpendDay so a traffic burst can't blow the daily budget.
 * Admin tier bypasses the ceiling entirely (founder-locked 2026-05-04).
 *
 * Per-user daily token sub-cap also lives here (50K free, 200K
 * verified, 500K pro, NO sub-cap for admin).
 */

const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const { captureError } = require('../../monitoring/sentry')
const {
  getDailySpendCeilingCents,
  estimateCostCents,
} = require('./attachments/attachments.constants')
const { resolveDocCaps } = require('./attachments/attachments.service')

function todayUtcDate() {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/**
 * Pre-flight check + atomic increment on AiGlobalSpendDay. Returns
 * { ok, costEstCents, spentCents, ceilingCents }. Caller must reject
 * with 429 if !ok.
 *
 * Admin tier short-circuits with `ok: true` and the ceiling check is
 * not performed.
 */
async function reserveSpend({ user, inputTokensEst, maxOutputTokens }) {
  if (user.role === 'admin') {
    return { ok: true, costEstCents: 0, ceilingCents: Infinity, admin: true }
  }
  const ceilingCents = getDailySpendCeilingCents()
  const estCost = estimateCostCents({ inputTokensEst, maxOutputTokens })
  const date = todayUtcDate()

  // Ensure the row exists. UPSERT-and-noop (Prisma upsert handles the
  // race if two requests arrive on the same blank day).
  try {
    await prisma.aiGlobalSpendDay.upsert({
      where: { date },
      create: {
        date,
        tokensIn: BigInt(0),
        tokensOut: BigInt(0),
        documentTokens: BigInt(0),
        costUsdCents: 0,
        requestCount: 0,
      },
      update: {},
    })
  } catch (err) {
    captureError(err, { tags: { module: 'ai.spendCeiling', action: 'upsertRow' } })
    // Fail-closed in production; fail-open in dev/test where tables
    // may be missing.
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, reason: 'ceiling_check_failed' }
    }
    return { ok: true, costEstCents: estCost, ceilingCents }
  }

  // Atomic increment-and-compare. 0 rows updated → cap exceeded.
  let rows = 0
  try {
    rows = await prisma.$executeRaw`
      UPDATE "AiGlobalSpendDay"
      SET "costUsdCents" = "costUsdCents" + ${estCost},
          "requestCount" = "requestCount" + 1
      WHERE "date" = ${date}
        AND "costUsdCents" + ${estCost} <= ${ceilingCents}
    `
  } catch (err) {
    captureError(err, { tags: { module: 'ai.spendCeiling', action: 'increment' } })
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, reason: 'ceiling_check_failed' }
    }
    return { ok: true, costEstCents: estCost, ceilingCents }
  }
  if (rows === 0) {
    log.warn(
      { event: 'ai.cost.daily_ceiling_breach', estCost, ceilingCents },
      'Daily Anthropic spend ceiling reached',
    )
    return { ok: false, reason: 'ceiling_reached', costEstCents: estCost, ceilingCents }
  }
  return { ok: true, costEstCents: estCost, ceilingCents }
}

/**
 * Decrement the reserved spend if the actual cost came in lower
 * than the estimate (or the request was aborted before consuming
 * tokens). Errors are captured but never re-thrown.
 */
async function refundSpendDelta({ estCents, actualCents }) {
  const delta = estCents - Math.max(0, actualCents || 0)
  if (delta <= 0) return
  try {
    const date = todayUtcDate()
    await prisma.$executeRaw`
      UPDATE "AiGlobalSpendDay"
      SET "costUsdCents" = GREATEST(0, "costUsdCents" - ${delta})
      WHERE "date" = ${date}
    `
  } catch (err) {
    captureError(err, { tags: { module: 'ai.spendCeiling', action: 'refundSpendDelta' } })
  }
}

/**
 * Per-user daily token sub-cap check. Returns { ok, used, cap }.
 * Admin tier bypasses (founder-locked). Free / verified / pro caps
 * pulled from the same plan config the AI service already uses.
 */
async function checkUserTokenSubcap({ user }) {
  if (user.role === 'admin') {
    return { ok: true, admin: true, used: 0, cap: Number.MAX_SAFE_INTEGER }
  }
  const userId = user.id || user.userId
  const caps = await resolveDocCaps(user)
  const date = todayUtcDate()
  try {
    const row = await prisma.aiUsageLog.findUnique({
      where: { userId_date: { userId, date } },
      select: { tokensIn: true, tokensOut: true, documentTokens: true },
    })
    const used = (row?.tokensIn || 0) + (row?.tokensOut || 0) + (row?.documentTokens || 0)
    return {
      ok: used < caps.tokenSubcap,
      used,
      cap: caps.tokenSubcap,
    }
  } catch (err) {
    captureError(err, { tags: { module: 'ai.spendCeiling', action: 'checkUserTokenSubcap' } })
    return { ok: true, used: 0, cap: caps.tokenSubcap, degraded: true }
  }
}

/**
 * Record the actual usage from a completed Anthropic call. Updates
 * AiGlobalSpendDay (real numbers, not estimates) AND the per-user
 * AiUsageLog row.
 */
async function recordActualUsage({
  userId,
  tokensIn = 0,
  tokensOut = 0,
  documentTokens = 0,
  costCents = 0,
  documentCount = 0,
  cacheReadInputTokens = 0,
  cacheCreationInputTokens = 0,
}) {
  const date = todayUtcDate()
  try {
    await prisma.$executeRaw`
      UPDATE "AiGlobalSpendDay"
      SET "tokensIn" = "tokensIn" + ${BigInt(tokensIn)},
          "tokensOut" = "tokensOut" + ${BigInt(tokensOut)},
          "documentTokens" = "documentTokens" + ${BigInt(documentTokens)}
      WHERE "date" = ${date}
    `
  } catch (err) {
    captureError(err, { tags: { module: 'ai.spendCeiling', action: 'recordActualUsage.global' } })
  }
  try {
    await prisma.aiUsageLog.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        messageCount: 1,
        tokenCount: tokensIn + tokensOut,
        documentCount,
        tokensIn,
        tokensOut,
        documentTokens,
        costUsdCents: costCents,
      },
      update: {
        messageCount: { increment: 1 },
        tokenCount: { increment: tokensIn + tokensOut },
        documentCount: { increment: documentCount },
        tokensIn: { increment: tokensIn },
        tokensOut: { increment: tokensOut },
        documentTokens: { increment: documentTokens },
        costUsdCents: { increment: costCents },
      },
    })
  } catch (err) {
    captureError(err, { tags: { module: 'ai.spendCeiling', action: 'recordActualUsage.user' } })
  }
  log.info(
    {
      event: 'ai.cost.message_complete',
      userId,
      tokensIn,
      tokensOut,
      documentTokens,
      costCents,
      cacheReadInputTokens,
      cacheCreationInputTokens,
    },
    'Anthropic call complete',
  )
}

module.exports = {
  reserveSpend,
  refundSpendDelta,
  checkUserTokenSubcap,
  recordActualUsage,
}
