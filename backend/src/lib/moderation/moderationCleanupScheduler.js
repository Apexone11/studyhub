const prisma = require('../prisma')
const { logModerationEvent } = require('./moderationLogger')
const log = require('../logger')

let cleanupInterval = null

function startModerationCleanupScheduler() {
  if (process.env.NODE_ENV === 'test') return
  if (cleanupInterval) return

  const intervalMs = Number(process.env.MODERATION_CLEANUP_INTERVAL_MS) || 6 * 60 * 60 * 1000
  const graceDays = Number(process.env.MODERATION_GRACE_DAYS) || 30
  const dryRun = process.env.MODERATION_CLEANUP_DRY_RUN === 'true'
  const batchSize = 50

  async function runCleanup() {
    try {
      const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000)

      const snapshots = await prisma.moderationSnapshot.findMany({
        where: {
          restoredAt: null,
          permanentlyDeletedAt: null,
          createdAt: { lt: cutoff },
          case: {
            status: 'confirmed',
            contentPurged: false,
            appeals: { none: { status: 'pending' } },
          },
        },
        include: { case: true },
        take: batchSize,
      })

      if (snapshots.length === 0) return

      log.info(
        `[moderation-cleanup] Processing ${snapshots.length} expired snapshots${dryRun ? ' (dry run)' : ''}`,
      )

      const CONTENT_MODEL_MAP = {
        post: 'feedPost',
        feed_post: 'feedPost',
        sheet: 'studySheet',
        note: 'note',
        post_comment: 'feedPostComment',
        sheet_comment: 'comment',
        note_comment: 'noteComment',
      }

      for (const snap of snapshots) {
        try {
          const modelName = CONTENT_MODEL_MAP[snap.targetType]
          if (!modelName) continue

          if (dryRun) {
            log.info(
              `[moderation-cleanup] DRY RUN: would delete ${snap.targetType} #${snap.targetId} (case #${snap.caseId})`,
            )
            continue
          }

          const model = prisma[modelName]
          if (model) {
            await model.delete({ where: { id: snap.targetId } }).catch(() => {
              // Content may already be deleted
            })
          }

          await prisma.$transaction([
            prisma.moderationSnapshot.update({
              where: { id: snap.id },
              data: { permanentlyDeletedAt: new Date() },
            }),
            prisma.moderationCase.update({
              where: { id: snap.caseId },
              data: { contentPurged: true },
            }),
          ])

          if (snap.ownerId) {
            logModerationEvent({
              userId: snap.ownerId,
              action: 'content_purged',
              caseId: snap.caseId,
              contentType: snap.targetType,
              contentId: snap.targetId,
              reason: `Permanently deleted after ${graceDays}-day grace period`,
            })
          }

          log.info(
            `[moderation-cleanup] Purged ${snap.targetType} #${snap.targetId} (case #${snap.caseId})`,
          )
        } catch (err) {
          log.error({ err, snapshotId: snap.id }, '[moderation-cleanup] Failed to purge snapshot')
        }
      }
    } catch (err) {
      log.error({ err }, '[moderation-cleanup] Scheduler error')
    }
  }

  setTimeout(runCleanup, 30_000)
  cleanupInterval = setInterval(runCleanup, intervalMs)
  if (typeof cleanupInterval.unref === 'function') cleanupInterval.unref()
}

module.exports = { startModerationCleanupScheduler }
