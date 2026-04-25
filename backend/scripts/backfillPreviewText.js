#!/usr/bin/env node
/**
 * backfillPreviewText.js
 *
 * One-time-but-restartable backfill: walk every StudySheet row whose
 * previewText is NULL, extract it from `content`, write back. Batched
 * at 100 rows. Restart-safe — the WHERE filter on `previewText IS NULL`
 * means an interrupted run picks up exactly where it stopped.
 *
 * Run on local seed data: `npm --prefix backend run backfill:previewText`.
 * Run on prod: same command, executed as a separate ops step AFTER the
 * deploy lands the previewText column + new code (founder decision #2 in
 * docs/internal/audits/2026-04-24-phase4-sheets-grid-school-scoping-handoff.md).
 *
 * Performance note: rows are updated SEQUENTIALLY inside each batch.
 * Default Prisma connection pool is 10; Promise.all over a 100-row batch
 * would create connection pressure on prod (10k+ sheets) without
 * meaningful parallelism. The work itself is sub-millisecond CPU + one
 * indexed UPDATE per row.
 */

const prisma = require('../src/core/db/prisma')
const { extractPreviewText } = require('../src/lib/sheets/extractPreviewText')

const BATCH_SIZE = 100

async function backfillPreviewText() {
  let processed = 0
  let updated = 0
  while (true) {
    const batch = await prisma.studySheet.findMany({
      where: { previewText: null },
      take: BATCH_SIZE,
      select: { id: true, content: true },
    })
    if (batch.length === 0) break

    for (const sheet of batch) {
      const preview = extractPreviewText(sheet.content)
      // Skip rows where extraction returns null (empty content). Those
      // rows stay NULL — they have nothing to preview. Counting them as
      // "processed" but not "updated" so the log distinguishes the two.
      if (preview !== null) {
        await prisma.studySheet.update({
          where: { id: sheet.id },
          data: { previewText: preview },
        })
        updated++
      }
      processed++
    }
    console.log(`[backfill] processed=${processed} updated=${updated}`)
  }
  console.log(`[backfill] done — processed=${processed} updated=${updated}`)
}

if (require.main === module) {
  backfillPreviewText()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill] fatal:', err)
      process.exit(1)
    })
}

module.exports = { backfillPreviewText }
