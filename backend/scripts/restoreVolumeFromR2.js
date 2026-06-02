/**
 * restoreVolumeFromR2.js — disaster-recovery CLI for /data/uploads.
 *
 * Pairs with backend/src/lib/jobs/uploadVolumeBackup.js (the volume → R2
 * mirror). The restore logic — listing, traversal guards, skip-if-exists —
 * lives in src/lib/jobs/uploadVolumeRestore.js so the boot-time self-heal
 * and this manual CLI share exactly one implementation. This file is the
 * operator-facing wrapper: it parses flags, validates config, runs one pass,
 * and reports.
 *
 * When to run: the Railway volume is gone, corrupted, or replaced and the
 * boot-time restore didn't (or couldn't) cover it — e.g. you want a forced
 * overwrite or a dry-run audit. The DB rows still point at /uploads/...
 * paths; without the files every <img> 404s.
 *
 * Usage:
 *   # Inspect what would happen (no writes):
 *   node backend/scripts/restoreVolumeFromR2.js --dry-run
 *
 *   # Actual restore (writes new files only, skip-if-exists):
 *   node backend/scripts/restoreVolumeFromR2.js
 *
 *   # Wipe + repopulate (use ONLY after a volume reformat — --force
 *   # overwrites existing files and can replace live newer content with
 *   # stale backups):
 *   node backend/scripts/restoreVolumeFromR2.js --force
 *
 * Required env: R2_BUCKET_UPLOAD_BACKUP + R2_ACCOUNT_ID +
 *               R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY.
 *
 * Exit codes: 0 success, 1 missing config / R2 unavailable, 2 partial
 * failure (some objects could not be restored — log shows which).
 */
const path = require('node:path')

require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')

  const bucket = process.env.R2_BUCKET_UPLOAD_BACKUP
  if (!bucket) {
    console.error('FATAL: R2_BUCKET_UPLOAD_BACKUP is not set.')
    process.exit(1)
  }

  // Share the same credential check as the runtime app.
  const { isR2Configured } = require('../src/lib/r2Storage')
  if (!isR2Configured()) {
    console.error('FATAL: R2 credentials are not configured.')
    process.exit(1)
  }

  const { UPLOADS_DIR } = require('../src/lib/storage')
  const { runRestorePass } = require('../src/lib/jobs/uploadVolumeRestore')

  console.log(`Restoring from R2 bucket "${bucket}" → ${UPLOADS_DIR}`)
  console.log(
    `Mode: ${dryRun ? 'DRY RUN' : force ? 'FORCE (overwrite existing)' : 'SAFE (skip-if-exists)'}`,
  )

  const summary = await runRestorePass({ uploadsDir: UPLOADS_DIR, bucket, force, dryRun })

  console.log('')
  console.log('=== Restore summary ===')
  console.log(`Scanned:  ${summary.scanned}`)
  console.log(`Restored: ${summary.restored}`)
  console.log(`Skipped:  ${summary.skipped} (already on disk; use --force to overwrite)`)
  console.log(`Failed:   ${summary.failed}`)
  process.exit(summary.failed > 0 ? 2 : 0)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
