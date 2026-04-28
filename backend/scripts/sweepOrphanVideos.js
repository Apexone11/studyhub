/**
 * sweepOrphanVideos.js — Reclaim R2 storage from abandoned video uploads.
 *
 * Two categories of waste:
 *
 *   1. Failed/stalled processing (no longer attached to anything):
 *      Video.status in ('processing','failed','blocked') AND createdAt
 *      older than STALE_THRESHOLD_MS. Anything still 'processing' after
 *      6 hours is dead — ffmpeg either crashed or the worker was killed
 *      mid-pipeline. 'failed' rows from before the in-pipeline cleanup
 *      shipped (V1) still have R2 bytes lingering. 'blocked' rows
 *      whose appeal window has lapsed without a pending VideoAppeal
 *      should also free their bytes.
 *
 *   2. Ready but never attached:
 *      Video.status = 'ready' AND createdAt older than UNATTACHED_THRESHOLD_MS
 *      AND no FeedPost references AND no AnnouncementMedia references.
 *      User uploaded, processing finished, then they navigated away
 *      without posting. Row + R2 bytes sit forever.
 *
 * Idempotent: each row is deleted at most once. Logs total bytes freed
 * so the dollar savings are visible in Railway logs.
 *
 * Usage (manual):
 *   DATABASE_URL=... node scripts/sweepOrphanVideos.js
 *
 * Usage (boot-time): scripts/start.js calls maybeSweepOrphanVideos() on
 * an interval when SWEEP_ORPHAN_VIDEOS_ON_START env flag is on.
 */
const path = require('node:path')
const { createPrismaClient } = require('../src/lib/prisma')
const { deleteVideoAssetRefs } = require('../src/modules/video/video.service')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000 // 6 hours
const UNATTACHED_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours
const STALE_STATUSES = ['processing', 'failed', 'blocked']
const SWEEP_BATCH_SIZE = 100

async function sweepStalledProcessing(prisma) {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS)

  // Pull the candidate set in one query: stale-status + old + UNATTACHED.
  // The unattached guard mirrors sweepUnattachedReadyVideos and is the
  // safety net against deleting bytes that are still referenced by a
  // FeedPost or AnnouncementMedia. Stale 'failed'/'blocked' rows that
  // still have post references get left alone — the post itself will
  // eventually free the row when it's deleted (FK is onDelete:SetNull,
  // so the row stops being referenced and the next sweep picks it up).
  // Pending VideoAppeals are also folded into this query as a relation
  // filter, eliminating the per-video N+1 lookup the old loop did.
  const candidates = await prisma.video.findMany({
    where: {
      status: { in: STALE_STATUSES },
      createdAt: { lt: cutoff },
      feedPosts: { none: {} },
      announcementMedia: { none: {} },
      OR: [{ status: { not: 'blocked' } }, { appeals: { none: { status: 'pending' } } }],
    },
    take: SWEEP_BATCH_SIZE,
    include: { captions: true },
  })

  let bytesFreed = 0
  let deleted = 0
  for (const video of candidates) {
    try {
      await deleteVideoAssetRefs(video)
      await prisma.video.delete({ where: { id: video.id } })
      bytesFreed += Number(video.fileSize || 0)
      deleted += 1
      console.log(
        `[sweepOrphanVideos] removed stalled video ${video.id} ` +
          `(status=${video.status}, age=${Math.round(
            (Date.now() - new Date(video.createdAt).getTime()) / 3600000,
          )}h, ${Math.round((video.fileSize || 0) / (1024 * 1024))} MB)`,
      )
    } catch (err) {
      console.error(`[sweepOrphanVideos] failed to remove video ${video.id}:`, err.message)
    }
  }

  return { deleted, bytesFreed }
}

async function sweepUnattachedReadyVideos(prisma) {
  const cutoff = new Date(Date.now() - UNATTACHED_THRESHOLD_MS)
  const candidates = await prisma.video.findMany({
    where: {
      status: 'ready',
      createdAt: { lt: cutoff },
      feedPosts: { none: {} },
      announcementMedia: { none: {} },
    },
    take: SWEEP_BATCH_SIZE,
    include: { captions: true },
  })

  let bytesFreed = 0
  let deleted = 0
  for (const video of candidates) {
    try {
      await deleteVideoAssetRefs(video)
      await prisma.video.delete({ where: { id: video.id } })
      bytesFreed += Number(video.fileSize || 0)
      deleted += 1
      console.log(
        `[sweepOrphanVideos] removed unattached ready video ${video.id} ` +
          `(age=${Math.round(
            (Date.now() - new Date(video.createdAt).getTime()) / 3600000,
          )}h, ${Math.round((video.fileSize || 0) / (1024 * 1024))} MB)`,
      )
    } catch (err) {
      console.error(`[sweepOrphanVideos] failed to remove video ${video.id}:`, err.message)
    }
  }

  return { deleted, bytesFreed }
}

async function sweepOrphanVideos(prismaArg) {
  const prisma = prismaArg || createPrismaClient()
  const ownsClient = !prismaArg

  try {
    const stalled = await sweepStalledProcessing(prisma)
    const unattached = await sweepUnattachedReadyVideos(prisma)

    const totalDeleted = stalled.deleted + unattached.deleted
    const totalBytes = stalled.bytesFreed + unattached.bytesFreed
    if (totalDeleted > 0) {
      console.log(
        `[sweepOrphanVideos] freed ${(totalBytes / (1024 * 1024)).toFixed(1)} MB across ` +
          `${totalDeleted} videos (${stalled.deleted} stalled, ${unattached.deleted} unattached).`,
      )
    }

    return { stalled, unattached, totalDeleted, totalBytes }
  } finally {
    if (ownsClient) await prisma.$disconnect()
  }
}

if (require.main === module) {
  sweepOrphanVideos()
    .then((result) => {
      if (result.totalDeleted === 0) {
        console.log('[sweepOrphanVideos] no orphan videos found.')
      }
      process.exit(0)
    })
    .catch((err) => {
      console.error('[sweepOrphanVideos] sweep failed:', err)
      process.exit(1)
    })
}

module.exports = {
  sweepOrphanVideos,
  STALE_THRESHOLD_MS,
  UNATTACHED_THRESHOLD_MS,
}
