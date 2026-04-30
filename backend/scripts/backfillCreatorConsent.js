#!/usr/bin/env node
/**
 * backfillCreatorConsent.js — one-shot, idempotent backfill that records
 * creator-responsibility consent for all existing users at the time the
 * Creator Audit feature ships. Without this, every existing user would hit
 * the consent modal the next time they tried to publish, blocking ongoing
 * use until they manually accepted.
 *
 * Strategy:
 *   - Only inserts a consent row for users who DON'T already have one.
 *   - Records the prior doc version (e.g. "pre-2026.04") so the next time
 *     the doc version bumps, the modal will reappear and force a fresh
 *     acknowledgement of the new terms — preserving the legal substance.
 *   - Sets `userAgent = 'backfill:2026-04-30'` and `ipAddress = null` so the
 *     audit trail is honest about the row's provenance.
 *
 * Safe to re-run: every operation is `upsert`-style on the unique userId.
 *
 * Usage:
 *   node backend/scripts/backfillCreatorConsent.js
 *   node backend/scripts/backfillCreatorConsent.js --dry-run
 */
const { PrismaClient } = require('@prisma/client')

const BACKFILL_DOC_VERSION = 'pre-2026.04'
const BACKFILL_USER_AGENT = 'backfill:2026-04-30'

async function main({ dryRun = false } = {}) {
  const prisma = new PrismaClient()
  let processed = 0
  let inserted = 0
  let skipped = 0
  try {
    const usersWithoutConsent = await prisma.user.findMany({
      where: { creatorAuditConsent: null },
      select: { id: true, username: true },
      orderBy: { id: 'asc' },
    })

    console.log(
      `[backfillCreatorConsent] ${usersWithoutConsent.length} users missing consent rows.`,
    )
    if (dryRun) {
      console.log('[backfillCreatorConsent] --dry-run: not inserting.')
      return
    }

    for (const user of usersWithoutConsent) {
      processed += 1
      try {
        await prisma.creatorAuditConsent.create({
          data: {
            userId: user.id,
            docVersion: BACKFILL_DOC_VERSION,
            acceptedAt: new Date(),
            acceptanceMethod: 'backfill',
            ipAddress: null,
            userAgent: BACKFILL_USER_AGENT,
          },
        })
        inserted += 1
      } catch (err) {
        // P2002 = unique constraint violation (raced with another writer).
        if (err?.code === 'P2002') {
          skipped += 1
          continue
        }
        throw err
      }
      // Progress every 100 users so an operator running this on a large
      // production user table sees the script is still alive.
      if (processed % 100 === 0) {
        console.log(
          `[backfillCreatorConsent] progress: processed=${processed}/${usersWithoutConsent.length}`,
        )
      }
    }
  } finally {
    console.log(
      `[backfillCreatorConsent] processed=${processed} inserted=${inserted} skipped=${skipped}`,
    )
    await prisma.$disconnect()
  }
}

const dryRun = process.argv.includes('--dry-run')
const prodConfirm = process.argv.includes('--prod-confirm')

// Guard: in production, require an explicit --prod-confirm flag so a
// developer who accidentally has a prod DATABASE_URL exported in their
// shell can't write backfill rows by typing the script name. This is the
// inverse of `assertLocalDatabase` (which blocks prod) — backfill IS meant
// for prod, but only when the operator opts in.
const looksLikeProd = /amazonaws|railway|supabase|render\.com|neon\.tech/i.test(
  process.env.DATABASE_URL || '',
)
if (looksLikeProd && !prodConfirm && !dryRun) {
  console.error(
    '[backfillCreatorConsent] Refusing to run against what looks like a production DATABASE_URL ' +
      'without --prod-confirm. Re-run with --prod-confirm to proceed, or --dry-run to preview.',
  )
  process.exit(2)
}

main({ dryRun }).catch((err) => {
  console.error('[backfillCreatorConsent] failed:', err)
  process.exit(1)
})
