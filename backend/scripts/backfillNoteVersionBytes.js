/**
 * Backfill bytesContent for existing NoteVersion rows.
 *
 * After migration 20260415000001_notes_hardening adds NoteVersion.bytesContent
 * (default 0), this script populates the actual byte length for every row
 * that still reads 0. Safe to re-run; only touches rows where bytesContent === 0.
 *
 * Usage:
 *   DATABASE_URL=... DIRECT_URL=... node scripts/backfillNoteVersionBytes.js
 */
const path = require('node:path')
const { createPrismaClient } = require('../src/lib/prisma')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const BATCH_SIZE = 500
const PROGRESS_EVERY = 1000

const prisma = createPrismaClient()

async function main() {
  let totalUpdated = 0
  let totalScanned = 0
  let lastLoggedAt = 0
  for (;;) {
    const rows = await prisma.noteVersion.findMany({
      where: { bytesContent: 0 },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
      select: { id: true, content: true },
    })
    if (rows.length === 0) break
    totalScanned += rows.length
    for (const row of rows) {
      const bytes = Buffer.byteLength(row.content ?? '', 'utf8')
      if (bytes === 0) continue
      await prisma.noteVersion.update({ where: { id: row.id }, data: { bytesContent: bytes } })
      totalUpdated += 1
      if (totalUpdated - lastLoggedAt >= PROGRESS_EVERY) {
        console.log(`[backfill] updated=${totalUpdated} scanned=${totalScanned}`)
        lastLoggedAt = totalUpdated
      }
    }
    if (rows.length < BATCH_SIZE) break
  }
  console.log(`[backfill] done. updated=${totalUpdated} scanned=${totalScanned}`)
}

main()
  .catch((err) => {
    console.error('[backfill] note-version-bytes failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
