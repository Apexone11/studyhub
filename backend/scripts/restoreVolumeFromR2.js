/**
 * restoreVolumeFromR2.js — disaster-recovery for /data/uploads.
 *
 * Wave-12.11. Pairs with backend/src/lib/jobs/uploadVolumeBackup.js.
 *
 * When to run: the Railway volume is gone, corrupted, or replaced. The
 * DB rows still point at /uploads/... paths; without restoring the
 * files every <img> 404s. Run this on the new instance BEFORE flipping
 * traffic back on.
 *
 * What it does:
 *   1. Lists every object under the `upload-volume-backup/` prefix in
 *      R2_BUCKET_UPLOAD_BACKUP.
 *   2. For each one, writes the file back into UPLOADS_DIR preserving
 *      the original relative path (`avatars/123.jpg` etc.).
 *   3. Refuses to overwrite existing files by default. Pass --force
 *      to overwrite (use ONLY when the volume is intentionally being
 *      wiped + repopulated; otherwise you risk replacing live newer
 *      content with stale backups).
 *   4. Skips R2 listing pagination boundaries cleanly — handles the
 *      ContinuationToken pattern S3 returns for buckets > 1000 keys.
 *
 * Usage:
 *   # Inspect what would happen (no writes):
 *   node backend/scripts/restoreVolumeFromR2.js --dry-run
 *
 *   # Actual restore (writes new files only, skip-if-exists):
 *   node backend/scripts/restoreVolumeFromR2.js
 *
 *   # Wipe + repopulate (use after volume reformat):
 *   node backend/scripts/restoreVolumeFromR2.js --force
 *
 * Required env: R2_BUCKET_UPLOAD_BACKUP + R2_ACCOUNT_ID +
 *               R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY.
 *
 * Exit codes: 0 success, 1 missing config / R2 unavailable, 2 partial
 * failure (some objects could not be restored — report shows which).
 */
const fs = require('node:fs')
const path = require('node:path')
const { ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3')

require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { KEY_PREFIX } = require('../src/lib/jobs/uploadVolumeBackup')

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')

  const bucket = process.env.R2_BUCKET_UPLOAD_BACKUP
  if (!bucket) {
    console.error('FATAL: R2_BUCKET_UPLOAD_BACKUP is not set.')
    process.exit(1)
  }

  // Lazy-require the R2 client so we share the same singleton + config
  // checks as the runtime app.
  const { isR2Configured } = require('../src/lib/r2Storage')
  if (!isR2Configured()) {
    console.error('FATAL: R2 credentials are not configured.')
    process.exit(1)
  }

  // Build a dedicated S3 client for this script rather than reaching
  // into r2Storage internals. Same credentials, same endpoint — keeps
  // r2Storage's getClient() private and avoids tying script lifetimes
  // to the runtime singleton's connection pool.
  const { S3Client } = require('@aws-sdk/client-s3')
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })

  const { UPLOADS_DIR } = require('../src/lib/storage')
  console.log(`Restoring from R2 bucket "${bucket}" → ${UPLOADS_DIR}`)
  console.log(
    `Mode: ${dryRun ? 'DRY RUN' : force ? 'FORCE (overwrite existing)' : 'SAFE (skip-if-exists)'}`,
  )

  let restored = 0
  let skipped = 0
  let failed = 0
  let scanned = 0
  let continuationToken

  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: KEY_PREFIX,
        ContinuationToken: continuationToken,
      }),
    )

    for (const obj of list.Contents || []) {
      scanned += 1
      const relativePath = obj.Key.slice(KEY_PREFIX.length)
      const destination = path.join(UPLOADS_DIR, relativePath)

      if (fs.existsSync(destination) && !force) {
        skipped += 1
        continue
      }
      if (dryRun) {
        console.log(`[dry-run] would restore ${obj.Key} → ${destination}`)
        restored += 1
        continue
      }

      try {
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        const get = await client.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }))
        // The Body is a stream — collect to a buffer for the write.
        // For multi-GB videos a streaming pipe would be better; we
        // don't expect that volume here (avatars + small attachments).
        const chunks = []
        for await (const chunk of get.Body) chunks.push(chunk)
        fs.writeFileSync(destination, Buffer.concat(chunks))
        restored += 1
        if (restored % 100 === 0) {
          console.log(`Restored ${restored} files (skipped ${skipped}, failed ${failed})...`)
        }
      } catch (err) {
        console.error(`FAILED ${obj.Key}: ${err?.message || err}`)
        failed += 1
      }
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (continuationToken)

  console.log('')
  console.log('=== Restore summary ===')
  console.log(`Scanned:  ${scanned}`)
  console.log(`Restored: ${restored}`)
  console.log(`Skipped:  ${skipped} (already on disk; use --force to overwrite)`)
  console.log(`Failed:   ${failed}`)
  process.exit(failed > 0 ? 2 : 0)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
