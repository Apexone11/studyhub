/**
 * uploadVolumeRestore.js — re-hydrate UPLOADS_DIR from the R2 mirror.
 *
 * Pairs with uploadVolumeBackup.js (the volume → R2 mirror) and
 * scripts/restoreVolumeFromR2.js (the manual DR CLI). This module is the
 * shared core both the CLI and the boot-time self-heal call, so the
 * traversal guards, key handling, and S3 client setup live in exactly one
 * place instead of drifting between two copies.
 *
 * Why boot-time restore exists: on a PaaS the uploads directory only
 * survives a redeploy when it sits on a persistent volume. If the volume is
 * detached, remounted, or the service is rebuilt on ephemeral disk, every
 * avatar/cover file vanishes while the DB rows still point at /uploads/... —
 * platform-wide broken images. Pulling missing objects back from R2 on each
 * boot turns that from a manual incident into self-healing. Skip-if-exists
 * means a healthy persistent volume pays only the R2 LIST cost (no
 * downloads), so the pass is safe to run on every boot.
 */
const fs = require('node:fs')
const path = require('node:path')
const { ListObjectsV2Command, GetObjectCommand, S3Client } = require('@aws-sdk/client-s3')
const log = require('../logger')
const { isR2Configured } = require('../r2Storage')
const { KEY_PREFIX } = require('./uploadVolumeBackup')

function buildClient() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

/**
 * R2 is external storage. A compromised credential or a misconfigured bucket
 * policy could inject a key like 'upload-volume-backup/../../etc/cron.d/x'
 * that path.join would resolve outside UPLOADS_DIR. Reject any relative path
 * that is absolute or contains a '..' segment. Kept byte-for-byte in step
 * with the guard in scripts/restoreVolumeFromR2.js on purpose.
 */
function isSafeRelativePath(relativePath) {
  if (!relativePath) return false
  if (relativePath.startsWith('/') || relativePath.startsWith('\\')) return false
  if (path.isAbsolute(relativePath)) return false
  if (relativePath.split(/[\\/]/).includes('..')) return false
  return true
}

function resolvesWithinRoot(destination, root) {
  const resolvedDest = path.resolve(destination)
  const resolvedRoot = path.resolve(root)
  return resolvedDest === resolvedRoot || resolvedDest.startsWith(resolvedRoot + path.sep)
}

// Stream the R2 object straight to disk instead of buffering it. The uploads
// tree includes group-media and attachment videos (hundreds of MB); buffering
// a whole object into memory would spike Node's heap and can OOM-kill the
// process on a 512 MB Railway instance mid-boot — the same reason
// uploadVolumeBackup streams on the way up.
function streamToFile(body, destination) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(destination)
    body.on('error', reject)
    writeStream.on('error', reject)
    writeStream.on('finish', resolve)
    body.pipe(writeStream)
  })
}

/**
 * One full restore pass: list every object under KEY_PREFIX and write any
 * that is missing locally (or all of them when force=true) back into
 * uploadsDir, preserving the relative layout. Returns counts; a per-object
 * failure is tallied in `failed` and never aborts the pass. `client` is
 * injectable for tests.
 */
async function runRestorePass({ uploadsDir, bucket, force = false, dryRun = false, client } = {}) {
  const s3 = client || buildClient()
  let scanned = 0
  let restored = 0
  let skipped = 0
  let failed = 0
  let continuationToken

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: KEY_PREFIX,
        ContinuationToken: continuationToken,
      }),
    )

    for (const obj of list.Contents || []) {
      scanned += 1
      const relativePath = obj.Key.slice(KEY_PREFIX.length)

      if (!isSafeRelativePath(relativePath)) {
        log.warn(
          { event: 'upload_restore.refused_unsafe_key', key: obj.Key },
          'refused unsafe R2 key (traversal attempt)',
        )
        failed += 1
        continue
      }

      const destination = path.join(uploadsDir, relativePath)
      if (!resolvesWithinRoot(destination, uploadsDir)) {
        log.warn(
          { event: 'upload_restore.refused_escape', key: obj.Key },
          'refused key escaping uploads dir',
        )
        failed += 1
        continue
      }

      if (fs.existsSync(destination) && !force) {
        skipped += 1
        continue
      }
      if (dryRun) {
        restored += 1
        continue
      }

      // Stream to a temp sibling, then atomically rename. A mid-write kill
      // (OOM, container eviction during a long restore) must not leave a
      // truncated file behind: skip-if-exists would then permanently skip it
      // and the image would stay broken until a manual --force run. A rename
      // within one filesystem is atomic, so the destination only ever appears
      // as a complete file.
      const tmpDestination = `${destination}.tmp`
      try {
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }))
        await streamToFile(get.Body, tmpDestination)
        fs.renameSync(tmpDestination, destination)
        restored += 1
      } catch (err) {
        try {
          fs.rmSync(tmpDestination, { force: true })
        } catch {
          // best-effort cleanup of the partial temp file
        }
        log.warn(
          { event: 'upload_restore.object_failed', key: obj.Key, err: err?.message || String(err) },
          'restore failed for object',
        )
        failed += 1
      }
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (continuationToken)

  return { scanned, restored, skipped, failed }
}

/**
 * Boot restore policy: ON in production when R2 is configured, OFF in dev.
 * UPLOAD_RESTORE_ON_BOOT=true|false is an explicit override / kill switch.
 */
function isRestoreOnBootEnabled() {
  const flag = process.env.UPLOAD_RESTORE_ON_BOOT
  if (flag === 'true') return true
  if (flag === 'false') return false
  return process.env.NODE_ENV === 'production'
}

/**
 * Fire a non-blocking, skip-if-exists restore pass just after boot. Never
 * blocks the server from listening (scheduled on a timer, unref'd). Wrapped
 * in runWithHeartbeat so success/failure/SLA lands in pino + Sentry like
 * every other background job (CLAUDE.md A10). No-ops when disabled or when
 * R2 isn't configured — and warns loudly in the latter case, because an
 * unconfigured backup means lost uploads cannot self-heal.
 */
function restoreOnBoot({ uploadsDir }) {
  if (!isRestoreOnBootEnabled()) {
    log.info(
      { event: 'upload_restore.disabled', reason: 'UPLOAD_RESTORE_ON_BOOT' },
      'boot restore disabled',
    )
    return null
  }

  const bucket = process.env.R2_BUCKET_UPLOAD_BACKUP
  if (!bucket || !isR2Configured()) {
    log.warn(
      {
        event: 'upload_restore.skipped',
        reason: !bucket ? 'R2_BUCKET_UPLOAD_BACKUP not set' : 'R2 client unconfigured',
      },
      'boot restore skipped — R2 backup not configured; uploads lost on redeploy cannot self-heal',
    )
    return null
  }

  log.info({ event: 'upload_restore.scheduled', bucket, uploadsDir }, 'boot restore scheduled')

  const handle = setTimeout(() => {
    // Lazy-require to avoid a boot-time require cycle through the job runner.
    const { runWithHeartbeat } = require('./heartbeat')
    void runWithHeartbeat(
      'upload_volume_restore',
      async () => {
        const summary = await runRestorePass({ uploadsDir, bucket, force: false })
        log.info(
          { event: 'upload_restore.pass_complete', ...summary },
          'boot restore pass complete',
        )
        return summary
      },
      { slaMs: 10 * 60 * 1000 },
    )
  }, 0)
  handle.unref()
  return handle
}

module.exports = {
  runRestorePass,
  restoreOnBoot,
  isRestoreOnBootEnabled,
  isSafeRelativePath,
}
