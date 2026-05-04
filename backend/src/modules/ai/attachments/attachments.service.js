/**
 * attachments.service.js — Hub AI v2 document upload orchestration.
 *
 * Flow:
 *   1. (route) multer buffers the upload (size + extension allowlist)
 *   2. service: stage-1 MIME magic-byte check (file-type)
 *   3. service: stage-2 structural validation (parsers.validateMimeStage2)
 *   4. service: PDF embedded-JS reject
 *   5. service: per-plan + per-day cap check
 *   6. service: atomic storage-quota increment-and-compare
 *   7. service: idempotency-key short-circuit
 *   8. service: opaque-key R2 upload
 *   9. service: DOCX/text → mammoth/utf8, NFKC, strip injections
 *  10. service: persist AiAttachment row + AiUploadIdempotency row
 *
 * Master plan refs:
 *   §4.3 storage + retention, §4.6 prompt-injection defenses,
 *   L3-HIGH-3 (atomic storage cap), L3-MED-1 (no PII in audit),
 *   L3-MED-2 (R2 keys = randomBytes(32)), L1-MED-8 (Idempotency-Key).
 */

const crypto = require('node:crypto')
const path = require('node:path')
const log = require('../../../lib/logger')
const prisma = require('../../../lib/prisma')
const { captureError } = require('../../../monitoring/sentry')
const { recordAudit } = require('../../../lib/auditLog')
const { getPlanConfig } = require('../../payments/payments.constants')
const { getUserPlan } = require('../../../lib/getUserPlan')
const r2Storage = require('../../../lib/r2Storage')
const {
  ALLOWED_FORMATS,
  ALLOWED_MIME_SET,
  REJECTED_MIME_SET,
  IDEMPOTENCY_TTL_MS,
  getDefaultRetentionMs,
  buildDocumentTagPair,
} = require('./attachments.constants')
const {
  hashFilename,
  validateMimeStage2,
  scanPdfForEmbeddedJs,
  estimatePdfPageCount,
  parseDocxText,
  sanitizeExtractedText,
  stripInjectionPhrases,
} = require('./attachments.parsers')

// Cloudflare R2 bucket dedicated to AI attachments. Separate from the
// public-image bucket (master plan L2-HIGH-4). The bucket env name is
// REQUIRED_IN_PRODUCTION via secretValidator.js.
const AI_BUCKET_ENV = 'R2_BUCKET_AI_ATTACHMENTS'

function getBucketName() {
  return process.env[AI_BUCKET_ENV] || ''
}

/**
 * Resolve a user's effective doc-upload plan caps. Admin tier bypasses
 * everything (founder-locked 2026-05-04: admin = unlimited messages
 * AND unlimited spend). Falls back to free-tier caps on plan resolve
 * failure (graceful degradation).
 */
async function resolveDocCaps(user) {
  if (user.role === 'admin') {
    return {
      planName: 'admin',
      isAdmin: true,
      maxBytes: Number.MAX_SAFE_INTEGER,
      maxPages: Number.MAX_SAFE_INTEGER,
      perDay: Number.MAX_SAFE_INTEGER,
      retentionMaxDays: Number.MAX_SAFE_INTEGER,
      totalStorageMaxBytes: Number.MAX_SAFE_INTEGER,
      tokenSubcap: Number.MAX_SAFE_INTEGER,
    }
  }
  const userId = user.id || user.userId
  let planName = 'free'
  try {
    planName = (await getUserPlan(userId)) || 'free'
  } catch {
    /* graceful degradation */
  }
  const cfg = getPlanConfig(planName)
  // Verified-but-free students get the donor-tier doc caps (mirrors
  // ai.constants.js DAILY_LIMITS verified branch).
  const verified = !!(user.isStaffVerified || user.emailVerified)
  const isFree = planName === 'free'
  const verifiedFreeUplift = isFree && verified ? getPlanConfig('donor') : null
  return {
    planName,
    isAdmin: false,
    maxBytes: verifiedFreeUplift?.aiDocumentMaxBytes ?? cfg.aiDocumentMaxBytes,
    maxPages: verifiedFreeUplift?.aiDocumentMaxPages ?? cfg.aiDocumentMaxPages,
    perDay: verifiedFreeUplift?.aiDocumentsPerDay ?? cfg.aiDocumentsPerDay,
    retentionMaxDays:
      verifiedFreeUplift?.aiDocumentRetentionMaxDays ?? cfg.aiDocumentRetentionMaxDays,
    totalStorageMaxBytes:
      verifiedFreeUplift?.aiDocumentTotalStorageMaxBytes ?? cfg.aiDocumentTotalStorageMaxBytes,
    tokenSubcap: verifiedFreeUplift?.aiDocumentDailyTokenSubcap ?? cfg.aiDocumentDailyTokenSubcap,
  }
}

/**
 * Match a declared MIME against the allowlist + return the format
 * descriptor (kind + parse strategy). Null on miss.
 */
function findFormat(mimeType) {
  if (REJECTED_MIME_SET.has(mimeType)) return null
  if (!ALLOWED_MIME_SET.has(mimeType)) return null
  return ALLOWED_FORMATS.find((f) => f.mime === mimeType) || null
}

/**
 * Stage-1 magic-byte detection via the `file-type` package.
 * `file-type` ≥ 17.x is ESM-only. Node's native `import()` works
 * inside a CommonJS file as long as it's used as an expression — the
 * cache below avoids re-importing on every upload.
 * Returns the detected MIME or null.
 */
let _fileTypePromise = null
function loadFileType() {
  if (!_fileTypePromise) {
    _fileTypePromise = import('file-type')
  }
  return _fileTypePromise
}
async function detectMimeMagic(buffer) {
  try {
    const fileType = await loadFileType()
    const result = await fileType.fileTypeFromBuffer(buffer.slice(0, 4096))
    return result?.mime || null
  } catch {
    return null
  }
}

/**
 * Atomic storage-quota increment-and-compare (master plan L3-HIGH-3).
 * Returns true if the quota row was advanced, false if it would exceed
 * the cap. Caller MUST roll back (via decrementStorageQuota) on any
 * downstream failure.
 */
async function tryReserveStorage({ userId, bytes, capBytes }) {
  // Insert-or-noop the quota row first so the UPDATE has something to
  // hit. We use a separate UPSERT instead of an `INSERT ... ON CONFLICT
  // DO UPDATE` because Prisma 6.x's $executeRaw doesn't allow
  // `RETURNING` on UPDATE WHERE conditions across all backends.
  await prisma.userAiStorageQuota.upsert({
    where: { userId },
    create: { userId, totalBytes: BigInt(0), cap: BigInt(capBytes) },
    update: {},
  })
  // Atomic UPDATE; 0 rows updated → cap exceeded.
  const rows = await prisma.$executeRaw`
    UPDATE "UserAiStorageQuota"
    SET "totalBytes" = "totalBytes" + ${BigInt(bytes)},
        "updatedAt" = NOW()
    WHERE "userId" = ${userId}
      AND "totalBytes" + ${BigInt(bytes)} <= "cap"
  `
  return rows > 0
}

async function decrementStorageQuota({ userId, bytes }) {
  try {
    await prisma.$executeRaw`
      UPDATE "UserAiStorageQuota"
      SET "totalBytes" = GREATEST(0, "totalBytes" - ${BigInt(bytes)}),
          "updatedAt" = NOW()
      WHERE "userId" = ${userId}
    `
  } catch (err) {
    captureError(err, { tags: { module: 'ai.attachments', action: 'decrementStorageQuota' } })
  }
}

/**
 * Per-day upload count (UTC).
 */
async function countTodayUploads(userId) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(today.getUTCDate() + 1)
  return prisma.aiAttachment.count({
    where: {
      userId,
      createdAt: { gte: today, lt: tomorrow },
      deletedAt: null,
    },
  })
}

/**
 * Idempotency-Key short-circuit. Returns the prior attachment row if
 * an idempotency record exists and is not expired; null otherwise.
 */
async function lookupIdempotency({ key, userId }) {
  if (!key) return null
  const row = await prisma.aiUploadIdempotency.findUnique({ where: { key } })
  if (!row) return null
  if (row.userId !== userId) {
    // Different user attempting to reuse a key — treat as a miss to
    // avoid cross-user leakage. Don't extend the row.
    return null
  }
  if (new Date(row.expiresAt) <= new Date()) return null
  if (!row.attachmentId) return null
  return prisma.aiAttachment.findUnique({ where: { id: row.attachmentId } })
}

async function persistIdempotency({ key, userId, attachmentId }) {
  if (!key) return
  await prisma.aiUploadIdempotency.upsert({
    where: { key },
    create: {
      key,
      userId,
      attachmentId,
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    },
    update: { attachmentId },
  })
}

/**
 * Generate an opaque random R2 key. 32 bytes hex = 64 chars. The key
 * is the SOLE identifier; do not embed userId, conversationId, or
 * fileName segments (avoids object-name leakage).
 */
function generateR2Key() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Run the pipeline. Returns the persisted AiAttachment row or throws.
 *
 * @param {object} params
 * @param {object} params.user        Authenticated user (must include id, role)
 * @param {Buffer} params.buffer      Raw file buffer (multer.memoryStorage)
 * @param {string} params.fileName    Original file name (sanitized at route)
 * @param {string} params.declaredMime MIME the client declared
 * @param {number} [params.conversationId]
 * @param {string} [params.idempotencyKey]
 */
async function uploadAttachment({
  user,
  buffer,
  fileName,
  declaredMime,
  conversationId,
  idempotencyKey,
}) {
  const userId = user.id || user.userId
  const fileNameHash = hashFilename(fileName)

  // 0. Idempotency-Key fast path.
  if (idempotencyKey) {
    const prior = await lookupIdempotency({ key: idempotencyKey, userId })
    if (prior) {
      log.info(
        {
          event: 'ai.upload.idempotency_hit',
          attachmentId: prior.id,
          userId,
          fileNameHash,
        },
        'Idempotency-Key hit; returning prior attachment',
      )
      return prior
    }
  }

  // 1. Stage-1 MIME magic.
  const detectedMime = await detectMimeMagic(buffer)
  // `file-type` returns null for text-y formats with no magic bytes;
  // we fall back to the declared MIME and run the byte-class validator
  // below. The declared MIME is what drives format dispatch.
  const format = findFormat(declaredMime)
  if (!format) {
    throw httpError(415, 'Unsupported file type.', 'UNSUPPORTED_MIME')
  }
  // If the magic-byte detection produced a different MIME than the
  // declared one, only allow it through when both map to the same
  // format kind (e.g., text/plain detected as application/octet-stream
  // is benign; PDF detected as ZIP is not).
  if (
    detectedMime &&
    detectedMime !== declaredMime &&
    !sameMimeFamily(detectedMime, declaredMime)
  ) {
    throw httpError(400, 'File contents do not match the declared type.', 'MIME_MISMATCH')
  }

  // 2. Stage-2 structural validation.
  const stage2 = validateMimeStage2(buffer, declaredMime)
  if (!stage2.ok) {
    throw httpError(400, `Stage-2 validation failed: ${stage2.reason}.`, 'BAD_STRUCTURE')
  }

  // 3. PDF embedded-JS reject.
  if (declaredMime === 'application/pdf') {
    const jsHit = scanPdfForEmbeddedJs(buffer)
    if (jsHit) {
      log.warn(
        {
          event: 'ai.upload.pdf_js_rejected',
          userId,
          fileNameHash,
          marker: jsHit,
        },
        'Rejected PDF with embedded JavaScript markers',
      )
      throw httpError(
        400,
        'This PDF contains scripts and was rejected for safety.',
        'PDF_SCRIPTS_FORBIDDEN',
      )
    }
  }

  // 4. Plan caps.
  const caps = await resolveDocCaps(user)
  if (buffer.length > caps.maxBytes) {
    throw httpError(413, `File exceeds ${caps.maxBytes} byte cap for plan.`, 'TOO_LARGE')
  }
  let pageCount = null
  if (declaredMime === 'application/pdf') {
    pageCount = estimatePdfPageCount(buffer)
    if (pageCount > caps.maxPages) {
      throw httpError(
        400,
        `PDF has ~${pageCount} pages; plan cap is ${caps.maxPages}.`,
        'TOO_MANY_PAGES',
      )
    }
  }
  if (!caps.isAdmin) {
    const todayCount = await countTodayUploads(userId)
    if (todayCount >= caps.perDay) {
      throw httpError(
        429,
        `Daily upload cap reached (${caps.perDay}). Resets at midnight UTC.`,
        'DAILY_UPLOAD_CAP',
      )
    }
  }

  // 5. Atomic storage reservation. Roll back on any failure below.
  const reserved = await tryReserveStorage({
    userId,
    bytes: buffer.length,
    capBytes: caps.totalStorageMaxBytes,
  })
  if (!reserved) {
    throw httpError(
      413,
      'You have hit your AI storage cap. Delete an older upload first.',
      'QUOTA_EXCEEDED',
    )
  }

  let parsedText = null
  let r2Key = null
  let attachment = null
  try {
    // 6. Format-specific text extraction.
    if (format.parse === 'docx_text') {
      const raw = await parseDocxText(buffer)
      const sanitized = sanitizeExtractedText(raw)
      const { cleaned, hits } = stripInjectionPhrases(sanitized)
      parsedText = cleaned
      if (hits.length) {
        log.warn(
          {
            event: 'ai.upload.injection_phrases_stripped',
            userId,
            fileNameHash,
            hitCount: hits.length,
          },
          'Stripped prompt-injection phrases from DOCX',
        )
      }
    } else if (format.parse === 'utf8_text') {
      const raw = buffer.toString('utf8')
      const sanitized = sanitizeExtractedText(raw)
      const { cleaned, hits } = stripInjectionPhrases(sanitized)
      parsedText = cleaned
      if (hits.length) {
        log.warn(
          {
            event: 'ai.upload.injection_phrases_stripped',
            userId,
            fileNameHash,
            hitCount: hits.length,
          },
          'Stripped prompt-injection phrases from text',
        )
      }
    }
    // PDF + image: no server-side text extraction; native model path.

    // 7. R2 upload. Bucket name resolved at call time so test envs
    // can override per-test. Service degrades gracefully when R2 is
    // unconfigured — we error out and the storage reservation is
    // rolled back below.
    if (!r2Storage.isR2Configured() || !getBucketName()) {
      throw httpError(503, 'AI document storage is not configured.', 'R2_NOT_CONFIGURED')
    }
    r2Key = generateR2Key()
    const r2Result = await uploadToBucket({
      key: r2Key,
      body: buffer,
      contentType: declaredMime,
    })

    // 8. Persist the attachment row.
    const expiresAt = new Date(Date.now() + getDefaultRetentionMs())
    attachment = await prisma.aiAttachment.create({
      data: {
        userId,
        conversationId: conversationId || null,
        r2Key,
        r2Etag: r2Result?.etag || null,
        mimeType: declaredMime,
        fileName: sanitizeDisplayFileName(fileName),
        fileNameHash,
        bytes: buffer.length,
        pageCount,
        expiresAt,
        extractedText: parsedText,
        extractedAt: parsedText ? new Date() : null,
      },
    })

    // 9. Idempotency record + audit log.
    if (idempotencyKey) {
      await persistIdempotency({
        key: idempotencyKey,
        userId,
        attachmentId: attachment.id,
      })
    }

    try {
      await recordAudit({
        event: 'ai.upload',
        actorId: userId,
        metadata: {
          attachmentId: attachment.id,
          fileNameHash,
          bytes: buffer.length,
          pageCount,
          mimeType: declaredMime,
        },
      })
    } catch {
      /* audit failure must not abort the upload */
    }

    log.info(
      {
        event: 'ai.upload.success',
        attachmentId: attachment.id,
        userId,
        bytes: buffer.length,
        pageCount,
        mimeType: declaredMime,
        fileNameHash,
      },
      'AI document upload complete',
    )

    return attachment
  } catch (err) {
    // Roll back storage reservation.
    await decrementStorageQuota({ userId, bytes: buffer.length })
    // If we wrote to R2 but failed afterwards, hard-delete the object
    // so we don't leak orphaned bytes.
    if (r2Key) {
      try {
        await deleteFromBucket(r2Key)
      } catch (cleanupErr) {
        captureError(cleanupErr, {
          tags: { module: 'ai.attachments', action: 'r2_cleanup_after_error' },
        })
      }
    }
    if (err.statusCode) throw err
    captureError(err, { tags: { module: 'ai.attachments', action: 'uploadAttachment' } })
    throw httpError(500, 'Failed to save attachment.', 'INTERNAL')
  }
}

/**
 * Soft-delete an attachment owned by the caller. The retention
 * sweeper will hard-delete the R2 object asynchronously. We also
 * decrement the storage quota immediately so the user can re-upload.
 */
async function softDeleteAttachment({ attachmentId, userId }) {
  const row = await prisma.aiAttachment.findUnique({ where: { id: attachmentId } })
  if (!row) return null
  if (row.userId !== userId) return null
  if (row.deletedAt) return row
  const updated = await prisma.aiAttachment.update({
    where: { id: attachmentId },
    data: { deletedAt: new Date() },
  })
  await decrementStorageQuota({ userId, bytes: row.bytes })
  return updated
}

/**
 * Extend a pinned attachment up to the per-plan max. Free tier
 * cannot pin (`retentionMaxDays = 0`).
 */
async function pinAttachment({ attachmentId, user }) {
  const userId = user.id || user.userId
  const row = await prisma.aiAttachment.findUnique({ where: { id: attachmentId } })
  if (!row) return null
  if (row.userId !== userId) return null
  if (row.deletedAt) return null
  const caps = await resolveDocCaps(user)
  if (!caps.isAdmin && caps.retentionMaxDays <= 0) {
    const err = new Error('Pinning is not available on the free plan.')
    err.statusCode = 403
    err.code = 'PLAN_DOES_NOT_SUPPORT_PIN'
    throw err
  }
  const days = Math.min(caps.retentionMaxDays, 365 * 10) // 10y is forever for admin
  const pinnedUntil = caps.isAdmin
    ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 100) // ~100y
    : new Date(Date.now() + 1000 * 60 * 60 * 24 * days)
  const expiresAt = new Date(Math.max(row.expiresAt.getTime(), pinnedUntil.getTime()))
  return prisma.aiAttachment.update({
    where: { id: attachmentId },
    data: { pinnedUntil, expiresAt },
  })
}

async function listAttachments({ userId, limit = 30, offset = 0 }) {
  const safeLimit = Math.min(Math.max(limit, 1), 100)
  const safeOffset = Math.max(offset, 0)
  const [rows, total] = await Promise.all([
    prisma.aiAttachment.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: safeOffset,
      take: safeLimit,
      select: {
        id: true,
        conversationId: true,
        mimeType: true,
        fileName: true,
        bytes: true,
        pageCount: true,
        expiresAt: true,
        pinnedUntil: true,
        extractedAt: true,
        createdAt: true,
      },
    }),
    prisma.aiAttachment.count({ where: { userId, deletedAt: null } }),
  ])
  return { attachments: rows, total }
}

/**
 * Build Anthropic content blocks for a list of attachments. PDFs use
 * the native document block (with `cache_control` ttl=1h per
 * L1-CRIT-2). Images use the existing vision block. DOCX/text are
 * appended as `<document_*>` salted XML wrappers in a single text
 * block (master plan §4.6 #2 + L1-LOW-2).
 *
 * Caller is responsible for verifying the user owns each attachment
 * and that none are soft-deleted before invoking this.
 *
 * @returns {Array} array of Anthropic content blocks; possibly empty
 */
async function buildAnthropicContentBlocks({ attachments, conversationId, includeTextWrapper }) {
  const blocks = []
  const textWrapperLines = []
  const tags = buildDocumentTagPair(String(conversationId || ''))
  for (const att of attachments) {
    if (att.mimeType === 'application/pdf') {
      // Native PDF document block. cache_control=ephemeral ttl=1h is
      // mandatory to keep doc-Q cost math correct (L1-CRIT-2).
      const buf = await downloadFromBucket(att.r2Key)
      blocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: buf.toString('base64'),
        },
        cache_control: { type: 'ephemeral', ttl: '1h' },
        citations: { enabled: true },
      })
    } else if (att.mimeType.startsWith('image/')) {
      const buf = await downloadFromBucket(att.r2Key)
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: att.mimeType,
          data: buf.toString('base64'),
        },
      })
    } else if (att.extractedText) {
      // Text-bearing formats — append to the salted wrapper.
      textWrapperLines.push(
        `Filename: ${hashFilename(att.fileName)} (${att.mimeType}, ${att.bytes} bytes)`,
      )
      textWrapperLines.push(att.extractedText)
      textWrapperLines.push('---')
    }
  }
  if (includeTextWrapper && textWrapperLines.length > 0) {
    blocks.push({
      type: 'text',
      text: `${tags.open}\n${textWrapperLines.join('\n')}\n${tags.close}`,
    })
  }
  return blocks
}

// ── R2 helpers ─────────────────────────────────────────────────────────────

async function uploadToBucket({ key, body, contentType }) {
  // Use the dedicated AI bucket. r2Storage.uploadObject targets the
  // env-default bucket; we pass an explicit client call so the bucket
  // env var is the contract, not a runtime guess.
  const bucket = getBucketName()
  if (!bucket) throw new Error('R2_BUCKET_AI_ATTACHMENTS not configured')
  // Reuse the underlying SDK by patching env at call time would be
  // brittle — do an explicit S3 send instead so the bucket is bound
  // per call.
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKey = process.env.R2_ACCESS_KEY_ID
  const secretKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKey || !secretKey) {
    throw new Error('R2 credentials not configured')
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  })
  const result = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Master plan L3-MED-2.
      CacheControl: 'private, no-store',
    }),
  )
  return { key, etag: result?.ETag || null }
}

async function downloadFromBucket(key) {
  const bucket = getBucketName()
  if (!bucket) throw new Error('R2_BUCKET_AI_ATTACHMENTS not configured')
  const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKey = process.env.R2_ACCESS_KEY_ID
  const secretKey = process.env.R2_SECRET_ACCESS_KEY
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  })
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const chunks = []
  for await (const chunk of res.Body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function deleteFromBucket(key) {
  const bucket = getBucketName()
  if (!bucket) return
  const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3')
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKey = process.env.R2_ACCESS_KEY_ID
  const secretKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKey || !secretKey) return
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  })
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

// ── Helpers ────────────────────────────────────────────────────────────────

function httpError(statusCode, message, code) {
  const err = new Error(message)
  err.statusCode = statusCode
  err.code = code
  return err
}

function sameMimeFamily(a, b) {
  // Treat any text/* as interchangeable with text/plain (file-type
  // doesn't have signatures for code-extension MIMEs).
  if (a === b) return true
  if (a.startsWith('text/') && b.startsWith('text/')) return true
  return false
}

function sanitizeDisplayFileName(name) {
  // Strip path components, control chars, and trim length. The raw
  // bytes are never stored or logged; this is purely for display.
  const base = path.basename(String(name || 'document'))
  // eslint-disable-next-line no-control-regex
  return base.replace(/[ -]/g, '').slice(0, 255)
}

module.exports = {
  resolveDocCaps,
  uploadAttachment,
  softDeleteAttachment,
  pinAttachment,
  listAttachments,
  buildAnthropicContentBlocks,
  // exported for sweeper + tests:
  deleteFromBucket,
  downloadFromBucket,
  uploadToBucket,
  decrementStorageQuota,
}
