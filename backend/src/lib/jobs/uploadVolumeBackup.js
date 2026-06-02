/**
 * uploadVolumeBackup.js — daily mirror of /data/uploads to R2.
 *
 * Closes the gap documented in RUNBOOK_DB_RESTORE.md "What's NOT
 * backed up: Uploaded files (avatars, attachments, school logos)".
 * A Railway volume is a single point of failure: if the
 * disk corrupts or the instance is rebuilt, every user-uploaded image
 * is gone forever and the DB row points at a 404.
 *
 * Fix: walk the volume nightly, upload anything R2 doesn't already
 * have to a dedicated bucket. R2 has built-in geo-replicated
 * redundancy, so even if Railway loses the volume the photos survive.
 *
 * The mirror is one-way (volume → R2) and additive — we don't delete
 * R2 objects when the source file is removed locally. That's
 * intentional: a misfire on the production volume (admin moderation
 * tool, disk corruption) shouldn't propagate to the backup. Manual
 * cleanup of orphans can be a follow-on chore.
 *
 * Configuration:
 *   R2_BUCKET_UPLOAD_BACKUP — R2 bucket name. When unset, the job
 *     no-ops (graceful degrade — dev environments without R2 don't
 *     crash). Production should ALWAYS set this.
 *   UPLOAD_BACKUP_INTERVAL_MS — defaults to 24h. Tests can shorten.
 *   UPLOAD_BACKUP_RATE_LIMIT_PER_SEC — uploads/sec ceiling, default
 *     10. R2 has generous limits but we don't want to saturate
 *     Railway egress.
 *
 * Recovery path (when the volume is lost): run
 * `node scripts/restoreVolumeFromR2.js` from a shell with R2 creds
 * configured. The script walks the bucket and writes each object back
 * to the configured UPLOADS_DIR.
 */
const fs = require('node:fs')
const path = require('node:path')
const log = require('../logger')
const { uploadObject, objectExists, isR2Configured } = require('../r2Storage')

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24h
const DEFAULT_RATE_LIMIT_PER_SEC = 10
const KEY_PREFIX = 'upload-volume-backup/'

/**
 * Walk a directory recursively, yielding absolute file paths.
 */
function* walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return
  const stack = [rootDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      log.warn({ event: 'upload_backup.readdir_failed', dir, err: err?.message }, 'readdir failed')
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile()) {
        yield full
      }
      // Symlinks / other types: skip. We don't want to follow a
      // symlink out of the uploads tree.
    }
  }
}

/**
 * Convert an absolute volume path into a stable R2 key. The key is
 * relative to UPLOADS_DIR so the restore script can write back to
 * the same layout regardless of where UPLOADS_DIR is mounted on the
 * restored host.
 */
function fileToKey(uploadsDir, filePath) {
  const relative = path.relative(uploadsDir, filePath).split(path.sep).join('/')
  return `${KEY_PREFIX}${relative}`
}

/**
 * Mirror one file to R2 if it isn't already there. Returns 'uploaded',
 * 'skipped' (already present), or 'failed'.
 *
 * Streams the file rather than buffering it: video uploads can be
 * hundreds of MB, and `fs.readFileSync` would force the whole file
 * into Node's heap. AWS SDK v3 supports a ReadStream Body — the
 * underlying http client consumes it incrementally. Buffering would
 * be an OOM risk on Railway hobby tiers (default 512 MB).
 */
async function mirrorFile(uploadsDir, filePath, bucketOverride) {
  const key = fileToKey(uploadsDir, filePath)
  try {
    if (await objectExists(key, bucketOverride)) return 'skipped'
    // Stat first so the SDK can send a correct Content-Length header
    // without buffering the file to compute it. Required when Body
    // is a stream — without ContentLength, AWS SDK falls back to
    // chunked transfer encoding which some R2 endpoints reject for
    // large objects.
    const stats = fs.statSync(filePath)
    const body = fs.createReadStream(filePath)
    await uploadObject(key, body, {
      bucket: bucketOverride,
      cacheControl: 'private, no-store',
      contentLength: stats.size,
    })
    return 'uploaded'
  } catch (err) {
    log.warn(
      { event: 'upload_backup.mirror_failed', key, err: err?.message || String(err) },
      'mirror failed',
    )
    return 'failed'
  }
}

/**
 * One full pass through the uploads volume. Throttled so we don't
 * saturate the egress bandwidth or hit R2 burst caps.
 */
async function runBackupPass({ uploadsDir, bucket, rateLimitPerSec = DEFAULT_RATE_LIMIT_PER_SEC }) {
  const start = Date.now()
  let scanned = 0
  let uploaded = 0
  let skipped = 0
  let failed = 0
  const minIntervalMs = Math.max(1, Math.floor(1000 / rateLimitPerSec))
  let lastUploadAt = 0

  for (const filePath of walkFiles(uploadsDir)) {
    scanned += 1
    const result = await mirrorFile(uploadsDir, filePath, bucket)
    if (result === 'uploaded') {
      uploaded += 1
      // Throttle: ensure at least `minIntervalMs` between uploads.
      const elapsed = Date.now() - lastUploadAt
      if (elapsed < minIntervalMs) {
        await new Promise((resolve) => setTimeout(resolve, minIntervalMs - elapsed))
      }
      lastUploadAt = Date.now()
    } else if (result === 'skipped') {
      skipped += 1
    } else {
      failed += 1
    }
  }

  const durationMs = Date.now() - start
  log.info(
    {
      event: 'upload_backup.pass_complete',
      scanned,
      uploaded,
      skipped,
      failed,
      durationMs,
    },
    'upload-volume → R2 mirror pass complete',
  )
  return { scanned, uploaded, skipped, failed, durationMs }
}

/**
 * Background scheduler. Called from index.js after boot. Wraps
 * runBackupPass in runWithHeartbeat so success/failure/slow events
 * land in Sentry + pino like every other job (CLAUDE.md A10).
 *
 * No-ops gracefully when R2 isn't configured (dev environments) or
 * when R2_BUCKET_UPLOAD_BACKUP is missing (opt-in for production).
 */
function startUploadVolumeBackup({ uploadsDir }) {
  const bucket = process.env.R2_BUCKET_UPLOAD_BACKUP
  if (!bucket) {
    log.warn(
      { event: 'upload_backup.disabled', reason: 'R2_BUCKET_UPLOAD_BACKUP not set' },
      'upload-volume backup disabled — set R2_BUCKET_UPLOAD_BACKUP to enable',
    )
    return null
  }
  if (!isR2Configured()) {
    log.warn(
      { event: 'upload_backup.disabled', reason: 'R2 client unconfigured' },
      'upload-volume backup disabled — R2 client not configured',
    )
    return null
  }

  const intervalMs =
    Number.parseInt(process.env.UPLOAD_BACKUP_INTERVAL_MS, 10) || DEFAULT_INTERVAL_MS
  const rateLimitPerSec =
    Number.parseInt(process.env.UPLOAD_BACKUP_RATE_LIMIT_PER_SEC, 10) || DEFAULT_RATE_LIMIT_PER_SEC

  log.info(
    {
      event: 'upload_backup.scheduled',
      bucket,
      uploadsDir,
      intervalMs,
      rateLimitPerSec,
    },
    'upload-volume backup scheduled',
  )

  const runPass = () => {
    // Lazy-require to avoid a boot-time require cycle through the
    // job runner.
    const { runWithHeartbeat } = require('./heartbeat')
    void runWithHeartbeat(
      'upload_volume_backup',
      () => runBackupPass({ uploadsDir, bucket, rateLimitPerSec }),
      { slaMs: intervalMs / 2 },
    )
  }

  // First pass shortly after boot rather than a full interval later. A
  // short-lived container (frequent redeploys) could otherwise be torn
  // down before its first nightly pass ever fired, so a freshly-uploaded
  // photo would never reach R2 and would be lost on the next deploy.
  // Default 2 min: long enough for boot to settle (and for the boot
  // restore to finish first), short enough to bound the loss window.
  const firstPassDelayMs =
    Number.parseInt(process.env.UPLOAD_BACKUP_FIRST_PASS_DELAY_MS, 10) || 2 * 60 * 1000
  const firstPass = setTimeout(runPass, firstPassDelayMs)
  firstPass.unref()

  const handle = setInterval(runPass, intervalMs)
  handle.unref()
  return handle
}

module.exports = {
  startUploadVolumeBackup,
  runBackupPass,
  fileToKey,
  walkFiles,
  KEY_PREFIX,
}
