/**
 * aiAttachmentSweeper.js — Two-phase retention sweeper for Hub AI v2
 * document uploads. Master plan §4.3 + L5-CRIT-4.
 *
 * Phase 1 — mark expired rows (`expiresAt < NOW() AND deletedAt IS NULL`)
 * via cursor-based batch (LIMIT 500 / iteration). Free up storage
 * quota when we soft-delete.
 *
 * Phase 2 — drain soft-deleted rows to R2 at <=10 deletes/sec, no DB
 * transaction wrapping the R2 round-trip. Hard-delete row only after
 * R2 delete succeeds. Skipping the DB tx keeps a single S3 outage
 * from rolling back hours of progress.
 *
 * Cadence: every 6h via runWithHeartbeat (CLAUDE.md A10) wired in
 * src/index.js. SLA: 10 minutes.
 */

const prisma = require('../prisma')
const log = require('../logger')
const { captureError } = require('../../monitoring/sentry')
const attachmentsService = require('../../modules/ai/attachments/attachments.service')

const MARK_BATCH_SIZE = 500
const HARD_DELETE_BATCH_SIZE = 100
const HARD_DELETE_RATE_PER_SECOND = 10
const HARD_DELETE_INTERVAL_MS = 1000 / HARD_DELETE_RATE_PER_SECOND

/**
 * Phase 1 — mark expired rows soft-deleted. Runs cursor-based to
 * avoid loading the entire expired set into memory.
 */
async function markExpiredAttachments() {
  let lastId = 0
  let totalMarked = 0
  for (;;) {
    const batch = await prisma.aiAttachment.findMany({
      where: {
        deletedAt: null,
        expiresAt: { lt: new Date() },
        id: { gt: lastId },
      },
      orderBy: { id: 'asc' },
      take: MARK_BATCH_SIZE,
      select: { id: true, userId: true, bytes: true },
    })
    if (batch.length === 0) break
    const ids = batch.map((r) => r.id)
    await prisma.aiAttachment.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    })
    // Decrement storage quotas (per-user). We aggregate by userId so
    // each user only takes one UPDATE.
    const byUser = new Map()
    for (const row of batch) {
      byUser.set(row.userId, (byUser.get(row.userId) || 0) + row.bytes)
    }
    for (const [userId, bytes] of byUser.entries()) {
      try {
        await attachmentsService.decrementStorageQuota({ userId, bytes })
      } catch (err) {
        captureError(err, {
          tags: { module: 'ai.attachmentSweeper', action: 'decrementStorageQuota' },
        })
      }
    }
    totalMarked += batch.length
    lastId = batch[batch.length - 1].id
    if (batch.length < MARK_BATCH_SIZE) break
  }
  return totalMarked
}

/**
 * Phase 2 — drain soft-deleted rows to R2. Rate-limited at
 * HARD_DELETE_RATE_PER_SECOND with no DB tx around R2 round-trip.
 */
async function drainSoftDeletedToR2() {
  // Prisma 6.19+ rejects `field: { not: null }` with "Argument `not` must
  // not be null". Use the array-form NOT clause per CLAUDE.md "Common Bugs".
  const rows = await prisma.aiAttachment.findMany({
    where: { NOT: [{ deletedAt: null }] },
    orderBy: { id: 'asc' },
    take: HARD_DELETE_BATCH_SIZE,
    select: { id: true, r2Key: true },
  })
  let ok = 0
  let failed = 0
  for (const row of rows) {
    try {
      await attachmentsService.deleteFromBucket(row.r2Key)
      // R2 delete succeeded — hard-delete the row.
      await prisma.aiAttachment.delete({ where: { id: row.id } })
      ok += 1
    } catch (err) {
      failed += 1
      captureError(err, {
        tags: { module: 'ai.attachmentSweeper', action: 'hardDelete' },
        extra: { attachmentId: row.id },
      })
    }
    // Rate-limit at <=10/sec so a 5000-row backlog doesn't hammer R2.
    await sleep(HARD_DELETE_INTERVAL_MS)
  }
  return { ok, failed }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Top-level sweep run. Logs structured outcome regardless of phase
 * failure so an aggregator alert can fire on persistently-rising
 * failure counts.
 */
async function sweepAiAttachments() {
  const phase1 = await markExpiredAttachments().catch((err) => {
    captureError(err, { tags: { module: 'ai.attachmentSweeper', action: 'phase1' } })
    return 0
  })
  const phase2 = await drainSoftDeletedToR2().catch((err) => {
    captureError(err, { tags: { module: 'ai.attachmentSweeper', action: 'phase2' } })
    return { ok: 0, failed: 0 }
  })
  log.info(
    {
      event: 'ai.attachment_sweep.complete',
      marked: phase1,
      hardDeleted: phase2.ok,
      hardDeleteFailures: phase2.failed,
    },
    'AI attachment sweep complete',
  )
  return { marked: phase1, ...phase2 }
}

module.exports = {
  sweepAiAttachments,
  markExpiredAttachments,
  drainSoftDeletedToR2,
}
