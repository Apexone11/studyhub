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
const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const BATCH_SIZE = 100

function hasPreviewTextFieldInClient() {
  const fields = prisma?._runtimeDataModel?.models?.StudySheet?.fields
  if (!Array.isArray(fields)) return false
  return fields.some((field) => field?.name === 'previewText')
}

async function backfillPreviewText() {
  let processed = 0
  let updated = 0
  let cursorId = 0
  const previewFieldSupported = hasPreviewTextFieldInClient()
  if (!previewFieldSupported) {
    throw new Error(
      'Prisma Client is missing StudySheet.previewText. Run `npm --prefix backend run db:migrate` and `cd backend && npx prisma generate`, then rerun backfill:previewText.',
    )
  }
  while (true) {
    const batch = await prisma.studySheet.findMany({
      where: {
        previewText: null,
        id: { gt: cursorId },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, content: true },
    })
    if (batch.length === 0) break

    cursorId = batch[batch.length - 1].id
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
