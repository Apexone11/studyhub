/**
 * video.routes.js — Video upload, streaming, and management API
 *
 * Endpoints:
 *   POST   /api/video/upload/init     — Start a new video upload (returns uploadId + videoId)
 *   POST   /api/video/upload/chunk    — Upload a chunk of the video
 *   POST   /api/video/upload/complete — Finalize upload and trigger processing
 *   POST   /api/video/upload/abort    — Cancel an in-progress upload
 *   GET    /api/video/:id             — Get video details (metadata, variants, status)
 *   GET    /api/video/:id/stream      — Get signed streaming URL for a quality variant
 *   DELETE /api/video/:id             — Delete a video and all associated R2 assets
 *   POST   /api/video/:id/captions    — Upload a VTT caption file
 *   DELETE /api/video/:id/captions/:language — Remove a caption track
 *   GET    /api/video/media/:key      — Proxy R2 media (fallback when no public URL configured)
 */

const express = require('express')
const multer = require('multer')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const r2 = require('../../lib/r2Storage')
const {
  processVideo,
  deleteVideoAssets,
  regenerateThumbnailFromFrame,
  replaceThumbnailFromUpload,
} = require('./video.service')
const { scanBufferWithClamAv } = require('../../lib/clamav')
const {
  VIDEO_DURATION_LIMITS,
  VIDEO_SIZE_LIMITS,
  MAX_CAPTION_SIZE,
  MIN_CHUNK_SIZE,
  CHUNK_SIZE,
  ALLOWED_VIDEO_MIMES,
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_CAPTION_MIMES,
  ALLOWED_CAPTION_EXTENSIONS,
  MAX_CAPTION_LANGUAGES,
  VIDEO_STATUS,
  VIDEO_SIGNATURES,
} = require('./video.constants')

const router = express.Router()

// ── Server-side chunk buffer ────────────────────────────────────────────
// Frontend sends 2 MB chunks (to fit under Railway HTTP/2 proxy limits).
// R2/S3 multipart requires >= 5 MB per part (except the last one).
// We buffer incoming chunks in memory and only flush to R2 when we have
// enough data for a valid part.
const uploadBuffers = new Map() // key: uploadId -> { buffer, r2Parts, r2PartNumber }

function getOrCreateBuffer(uploadId) {
  if (!uploadBuffers.has(uploadId)) {
    uploadBuffers.set(uploadId, {
      buffer: Buffer.alloc(0),
      r2Parts: [],
      r2PartNumber: 1,
      lastTouched: Date.now(),
    })
  }
  const state = uploadBuffers.get(uploadId)
  state.lastTouched = Date.now()
  return state
}

function clearBuffer(uploadId) {
  uploadBuffers.delete(uploadId)
}

// Flush buffered data to R2 as a single part when >= MIN_CHUNK_SIZE (5 MB)
async function flushBufferIfReady(r2Key, uploadId, state, force = false) {
  if (state.buffer.length === 0) return
  if (!force && state.buffer.length < MIN_CHUNK_SIZE) return

  const part = await r2.uploadPart(r2Key, uploadId, state.r2PartNumber, state.buffer)
  state.r2Parts.push(part)
  state.r2PartNumber++
  state.buffer = Buffer.alloc(0)
  state.lastTouched = Date.now()
}

// Per-buffer TTL sweep. Previously this `clear()`'d the entire Map when
// >100 buffers existed, which silently killed any in-flight upload
// during a busy hour. The sweep now only evicts entries idle for longer
// than BUFFER_TTL_MS so active uploads are never disturbed.
const BUFFER_TTL_MS = 30 * 60 * 1000
const BUFFER_SWEEP_INTERVAL_MS = 5 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [uploadId, state] of uploadBuffers.entries()) {
    if (now - (state.lastTouched || 0) > BUFFER_TTL_MS) {
      uploadBuffers.delete(uploadId)
    }
  }
}, BUFFER_SWEEP_INTERVAL_MS).unref?.()

// Multer for caption uploads only (small files, memory storage)
const captionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CAPTION_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = '.' + (file.originalname.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_CAPTION_MIMES.has(file.mimetype) && !ALLOWED_CAPTION_EXTENSIONS.has(ext)) {
      return cb(new Error('Only .vtt caption files are allowed.'))
    }
    cb(null, true)
  },
})

// ── Rate limiters ────────────────────────────────────────────────────────
// Import centralized limiters
const {
  videoUploadInitLimiter,
  videoUploadChunkLimiter,
  videoThumbnailLimiter,
  readLimiter,
} = require('../../lib/rateLimiters')

// Thumbnail uploads accept jpg/png images up to 2 MB. Memory storage
// is fine because the helper hands the buffer straight to R2 — we
// never write to disk.
const MAX_THUMBNAIL_UPLOAD_BYTES = 2 * 1024 * 1024
const ALLOWED_THUMBNAIL_MIMES = new Set(['image/jpeg', 'image/png'])
const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_THUMBNAIL_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_THUMBNAIL_MIMES.has(file.mimetype)) {
      // statusCode + code on the Error so the route handler can map this
      // user-input failure to a 4xx instead of letting the global error
      // handler treat it as a 500.
      const err = new Error('Only JPG and PNG images are allowed for thumbnails.')
      err.statusCode = 400
      err.code = 'INVALID_THUMBNAIL_MIME'
      return cb(err)
    }
    cb(null, true)
  },
})

/**
 * Wrap multer's middleware so MIME / file-size errors come back to the
 * client as proper 4xx responses instead of being caught by the global
 * 500 handler. Multer surfaces its own file-size error with
 * `code === 'LIMIT_FILE_SIZE'`; our fileFilter above already attaches
 * `statusCode = 400` for the MIME case.
 */
function thumbnailUploadHandler(req, res, next) {
  thumbnailUpload.single('file')(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Thumbnail must be 2 MB or smaller.', code: err.code })
    }
    if (Number.isInteger(err.statusCode) && err.statusCode < 500) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code })
    }
    return res.status(400).json({ error: err.message || 'Invalid thumbnail upload.' })
  })
}

// Magic-byte check — never trust client-provided MIME alone.
// JPEG files start with FF D8 FF; PNG with the 8-byte PNG signature.
function detectImageContentType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// Upload Flow: init -> chunk(s) -> complete
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/video/upload/init
 * Initialize a chunked video upload.
 * Creates a Video record (status=processing) and an R2 multipart upload.
 *
 * Body: { fileName, fileSize, mimeType }
 * Returns: { videoId, uploadId, r2Key, chunkSize }
 */
router.post('/upload/init', requireAuth, videoUploadInitLimiter, async (req, res) => {
  try {
    const { fileName, fileSize, mimeType } = req.body || {}

    // Validate inputs
    if (!fileName || !fileSize || !mimeType) {
      return res.status(400).json({ error: 'fileName, fileSize, and mimeType are required.' })
    }

    if (!ALLOWED_VIDEO_MIMES.has(mimeType)) {
      return res.status(400).json({ error: 'Unsupported video format. Allowed: MP4, WebM, MOV.' })
    }

    const ext = '.' + (fileName.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_VIDEO_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: 'Unsupported file extension.' })
    }

    // Determine user's subscription plan and get tier-based limits
    const { getUserPlan: getVideoPlan } = require('../../lib/getUserPlan')
    let userPlan = 'free'
    try {
      userPlan = await getVideoPlan(req.user.userId)
    } catch {
      // Graceful degradation
    }

    // Check if user has made a donation (upgrade free to donor)
    if (userPlan === 'free') {
      try {
        const donation = await prisma.donation.findFirst({
          where: { userId: req.user.userId },
          select: { id: true },
        })
        if (donation) userPlan = 'donor'
      } catch {
        // Graceful degradation
      }
    }

    // Admin override
    if (req.user.role === 'admin') {
      userPlan = 'admin'
    }

    const maxDuration = VIDEO_DURATION_LIMITS[userPlan] || VIDEO_DURATION_LIMITS.free
    const maxSize = VIDEO_SIZE_LIMITS[userPlan] || VIDEO_SIZE_LIMITS.free

    if (fileSize > maxSize) {
      return res.status(400).json({
        error: `Video must be under ${(maxSize / (1024 * 1024 * 1024)).toFixed(1)} GB for your plan.`,
      })
    }

    if (!r2.isR2Configured()) {
      return res.status(503).json({ error: 'Video storage is not configured.' })
    }

    // Generate a unique R2 key and create the multipart upload
    const r2Key = r2.generateVideoKey(req.user.userId, fileName)
    const uploadId = await r2.createMultipartUpload(r2Key, mimeType)

    // Create the Video record in the database
    const video = await prisma.video.create({
      data: {
        userId: req.user.userId,
        r2Key,
        status: VIDEO_STATUS.PROCESSING,
        fileSize,
        mimeType,
      },
    })

    res.status(201).json({
      videoId: video.id,
      uploadId,
      r2Key,
      chunkSize: MIN_CHUNK_SIZE,
      maxDuration,
      maxSize,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to initialize upload.' })
  }
})

/**
 * POST /api/video/upload/chunk
 * Upload a single chunk of a video.
 *
 * Frontend sends 2 MB chunks to stay under Railway HTTP/2 proxy limits.
 * The server buffers them and flushes to R2 in >= 5 MB parts (S3/R2 requirement).
 *
 * Headers:
 *   x-upload-id   — R2 multipart upload ID
 *   x-r2-key      — R2 object key
 *   x-part-number — Chunk number (1-based, from frontend)
 *   x-video-id    — Video record ID
 *
 * Body: Raw binary chunk data
 * Returns: { received: true, buffered: <bytes>, partNumber }
 *
 * Note: express.raw() middleware is applied at the app level in index.js
 * to ensure binary data is not parsed as JSON before reaching this handler.
 */
router.post('/upload/chunk', requireAuth, videoUploadChunkLimiter, async (req, res) => {
  try {
    const uploadId = req.headers['x-upload-id']
    const r2Key = req.headers['x-r2-key']
    const partNumber = parseInt(req.headers['x-part-number'], 10)
    const videoId = parseInt(req.headers['x-video-id'], 10)

    if (!uploadId || !r2Key || isNaN(partNumber) || isNaN(videoId)) {
      return res.status(400).json({ error: 'Missing required upload headers.' })
    }

    // Validate chunk size
    if (
      req.headers['content-length'] &&
      parseInt(req.headers['content-length']) > CHUNK_SIZE + 1024
    ) {
      return res.status(413).json({ error: 'Chunk exceeds maximum size.' })
    }

    // Verify ownership
    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video || video.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Video not found.' })
    }

    const chunkBuffer = req.body
    if (!chunkBuffer || !Buffer.isBuffer(chunkBuffer) || chunkBuffer.length === 0) {
      console.error(
        '[video:chunk] Empty or unparsed body. Content-Type:',
        req.headers['content-type'],
        'Body type:',
        typeof chunkBuffer,
        'Is Buffer:',
        Buffer.isBuffer(chunkBuffer),
      )
      return res
        .status(400)
        .json({ error: 'Empty chunk. Ensure Content-Type: application/octet-stream is set.' })
    }

    // For the first chunk, validate magic bytes
    if (partNumber === 1) {
      const isValid = validateVideoSignature(chunkBuffer)
      if (!isValid) {
        clearBuffer(uploadId)
        await r2.abortMultipartUpload(r2Key, uploadId)
        await prisma.video.update({
          where: { id: videoId },
          data: { status: VIDEO_STATUS.FAILED },
        })
        return res
          .status(400)
          .json({ error: 'File content does not match a supported video format.' })
      }
    }

    // Append to server-side buffer
    const state = getOrCreateBuffer(uploadId)
    state.buffer = Buffer.concat([state.buffer, chunkBuffer])

    // Flush to R2 if buffer >= 5 MB
    await flushBufferIfReady(r2Key, uploadId, state)

    res.json({ received: true, buffered: state.buffer.length, partNumber })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to upload chunk.' })
  }
})

/**
 * POST /api/video/upload/complete
 * Finalize a chunked upload and trigger background processing.
 * Flushes any remaining buffered data to R2, then completes the multipart upload.
 *
 * Body: { videoId, uploadId, r2Key }
 * Returns: { video }
 */
router.post('/upload/complete', requireAuth, async (req, res) => {
  try {
    const { videoId, uploadId, r2Key } = req.body || {}

    if (!videoId || !uploadId || !r2Key) {
      return res.status(400).json({ error: 'videoId, uploadId, and r2Key are required.' })
    }

    // Verify ownership
    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video || video.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Video not found.' })
    }

    // Flush any remaining buffered data to R2 (last part can be < 5 MB)
    const state = getOrCreateBuffer(uploadId)
    await flushBufferIfReady(r2Key, uploadId, state, true) // force=true for final flush
    const parts = state.r2Parts
    clearBuffer(uploadId)

    if (parts.length === 0) {
      return res.status(400).json({ error: 'No data was uploaded.' })
    }

    // Complete the multipart upload in R2
    await r2.completeMultipartUpload(r2Key, uploadId, parts)

    // ClamAV scan on the first 5MB (heuristic scan — full scan would require downloading)
    try {
      const { body } = await r2.getObject(r2Key)
      const chunks = []
      let totalRead = 0
      for await (const chunk of body) {
        chunks.push(chunk)
        totalRead += chunk.length
        if (totalRead >= 5 * 1024 * 1024) break // Read up to 5MB for scanning
      }
      // Destroy the rest of the stream
      if (body.destroy) body.destroy()

      const scanBuffer = Buffer.concat(chunks)
      const scanResult = await scanBufferWithClamAv(scanBuffer)
      if (scanResult && scanResult.status === 'infected') {
        // Delete the uploaded file and mark as failed
        await r2.deleteObject(r2Key)
        await prisma.video.update({ where: { id: videoId }, data: { status: VIDEO_STATUS.FAILED } })
        return res.status(400).json({ error: 'File failed security scan.' })
      }
      // Fail-CLOSED in production when the scanner is unreachable.
      // Without this, a transient ClamAV outage silently bypasses the
      // AV gate. Dev still passes through (scanner often missing
      // locally) and CLAMAV_DISABLED=true short-circuits to 'clean'
      // upstream.
      if (scanResult && scanResult.status === 'error' && process.env.NODE_ENV === 'production') {
        await r2.deleteObject(r2Key)
        await prisma.video.update({ where: { id: videoId }, data: { status: VIDEO_STATUS.FAILED } })
        captureError(new Error(`ClamAV scanner error: ${scanResult.message}`), {
          context: 'video-clamav-scan',
          videoId,
        })
        return res.status(503).json({ error: 'Security scanner unavailable. Please retry.' })
      }
    } catch (scanErr) {
      captureError(scanErr, { context: 'video-clamav-scan', videoId })
      // Catch-all also fail-CLOSED in production.
      if (process.env.NODE_ENV === 'production') {
        try {
          await r2.deleteObject(r2Key)
          await prisma.video.update({
            where: { id: videoId },
            data: { status: VIDEO_STATUS.FAILED },
          })
        } catch (cleanupErr) {
          captureError(cleanupErr, { context: 'video-clamav-cleanup', videoId })
        }
        return res.status(503).json({ error: 'Security scanner unavailable. Please retry.' })
      }
    }

    // Return the video immediately, then process in background
    const updated = await prisma.video.findUnique({ where: { id: videoId } })

    res.json({
      video: formatVideoResponse(updated),
      message: 'Upload complete. Video is being processed.',
    })

    // Fire-and-forget: Start background processing
    processVideo(videoId).catch((err) => {
      captureError(err, { context: 'video-process-bg', videoId })
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to complete upload.' })
  }
})

/**
 * POST /api/video/upload/abort
 * Cancel an in-progress upload. Cleans up R2 multipart and marks video as failed.
 *
 * Body: { videoId, uploadId, r2Key }
 */
router.post('/upload/abort', requireAuth, async (req, res) => {
  try {
    const { videoId, uploadId, r2Key } = req.body || {}

    if (!videoId || !uploadId || !r2Key) {
      return res.status(400).json({ error: 'videoId, uploadId, and r2Key are required.' })
    }

    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video || video.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Video not found.' })
    }

    clearBuffer(uploadId)
    await r2.abortMultipartUpload(r2Key, uploadId)
    await prisma.video.delete({ where: { id: videoId } })

    res.json({ message: 'Upload cancelled.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to abort upload.' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Video Read & Stream
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/video/:id
 * Get video details including metadata, variants, and processing status.
 */
router.get('/:id', readLimiter, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10)
    if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID.' })

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        captions: { select: { id: true, language: true, label: true } },
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    if (!video) return res.status(404).json({ error: 'Video not found.' })

    res.json(formatVideoResponse(video))
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /api/video/:id/stream?quality=720p
 * Get a signed streaming URL for a specific quality variant.
 * Defaults to highest available quality if not specified.
 */
router.get('/:id/stream', readLimiter, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10)
    if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID.' })

    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video) return res.status(404).json({ error: 'Video not found.' })
    if (video.status !== VIDEO_STATUS.READY) {
      return res.status(409).json({ error: 'Video is still processing.' })
    }

    // Enforce download protection -- owners can always stream their own videos
    if (video.downloadable === false) {
      const requesterId = req.user?.userId || null
      if (requesterId !== video.userId) {
        return res.status(403).json({ error: 'Downloads are disabled for this video.' })
      }
    }

    const quality = req.query.quality || null
    const variants = video.variants || {}

    // Determine which R2 key to stream
    let streamKey = null
    if (quality && variants[quality]) {
      streamKey = variants[quality].key
    } else {
      // Default: highest available quality
      const priorities = ['1080p', '720p', '360p', 'original']
      for (const q of priorities) {
        if (variants[q]?.key) {
          streamKey = variants[q].key
          break
        }
      }
    }

    if (!streamKey) streamKey = video.r2Key // Fallback to original

    const url = await r2.getSignedDownloadUrl(streamKey, 3600)
    res.json({ url, quality: quality || 'auto' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /api/video/media/*path
 * Proxy route for serving R2 media when no public URL is configured.
 * Streams the object from R2 directly to the client.
 * Note: Express 5 / path-to-regexp v8 uses *name for wildcard params.
 */
router.get('/media/*path', readLimiter, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.path || '')
    if (!key) return res.status(400).json({ error: 'Missing media key.' })

    const { body, contentType, contentLength } = await r2.getObject(key)

    res.set('Content-Type', contentType || 'application/octet-stream')
    if (contentLength) res.set('Content-Length', String(contentLength))
    res.set('Cache-Control', 'public, max-age=86400') // 24h cache

    body.pipe(res)
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
      return res.status(404).json({ error: 'Media not found.' })
    }
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Video Update (metadata + downloadable toggle)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PATCH /api/video/:id
 * Update video metadata (title, description, downloadable).
 * Only the video owner can update.
 */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10)
    if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID.' })

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { userId: true },
    })

    if (!video) return res.status(404).json({ error: 'Video not found.' })
    if (video.userId !== req.user.userId) {
      return res.status(403).json({ error: 'You can only edit your own videos.' })
    }

    const updates = {}
    if (req.body.title !== undefined) updates.title = String(req.body.title).slice(0, 200)
    if (req.body.description !== undefined)
      updates.description = String(req.body.description).slice(0, 2000)
    if (req.body.downloadable !== undefined) {
      if (typeof req.body.downloadable === 'boolean') updates.downloadable = req.body.downloadable
      else if (req.body.downloadable === 'true') updates.downloadable = true
      else if (req.body.downloadable === 'false') updates.downloadable = false
      else return res.status(400).json({ error: 'Invalid downloadable value.' })
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' })
    }

    const updated = await prisma.video.update({
      where: { id: videoId },
      data: updates,
    })

    res.json(formatVideoResponse(updated))
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Video Delete
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DELETE /api/video/:id
 * Delete a video and all associated R2 assets (variants, thumbnail, manifest, captions).
 * Only the video owner or an admin can delete.
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10)
    if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID.' })

    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video) return res.status(404).json({ error: 'Video not found.' })

    if (video.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this video.' })
    }

    // Delete R2 assets in background
    deleteVideoAssets(videoId).catch((err) => {
      captureError(err, { context: 'video-delete-assets-bg', videoId })
    })

    // Delete database record (cascades to captions)
    await prisma.video.delete({ where: { id: videoId } })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/video/:id/appeal
 * Submit an appeal for a blocked video (plagiarism detection).
 * Body: { reason }
 */
router.post('/:id/appeal', requireAuth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10)
    if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID.' })

    const { reason } = req.body || {}
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a reason (at least 10 characters).' })
    }

    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video) return res.status(404).json({ error: 'Video not found.' })
    if (video.userId !== req.user.userId) {
      return res.status(403).json({ error: 'You can only appeal your own videos.' })
    }
    if (video.status !== 'blocked') {
      return res.status(400).json({ error: 'Only blocked videos can be appealed.' })
    }

    // Check for existing pending appeal
    const existingAppeal = await prisma.videoAppeal.findFirst({
      where: { videoId, status: 'pending' },
    })
    if (existingAppeal) {
      return res.status(409).json({ error: 'An appeal is already pending for this video.' })
    }

    // Find the original video this was flagged against
    const original = await prisma.video.findFirst({
      where: {
        contentHash: video.contentHash,
        userId: { not: video.userId },
        status: VIDEO_STATUS.READY,
      },
    })

    if (!original) {
      return res.status(400).json({ error: 'Could not find the original video for appeal.' })
    }

    const appeal = await prisma.videoAppeal.create({
      data: {
        videoId,
        uploaderId: req.user.userId,
        originalVideoId: original.id,
        reason: reason.trim().slice(0, 1000),
      },
    })

    res.json({ appeal, message: 'Appeal submitted. An admin will review it.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to submit appeal.' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Thumbnail editor
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PATCH /api/video/:id/thumbnail
 *
 * Two modes:
 *   - JSON body { frameTimestamp: <number> } — re-extract a frame
 *     from the source video at that second (capped to duration). Runs
 *     ffmpeg server-side; idempotent because we always overwrite the
 *     existing thumbnailR2Key.
 *   - multipart/form-data with `file` (≤ 2 MB jpg/png) — upload a
 *     custom image. Magic-byte validated server-side; multer's MIME
 *     check is a soft gate that doesn't replace real signature checks.
 *
 * Owner-only. Rate-limited to 15/min/user. Both flows leave the public
 * thumbnail URL stable (we overwrite the same R2 key) so any feed card
 * already showing the old thumbnail just refreshes with the new image.
 */
router.patch(
  '/:id/thumbnail',
  requireAuth,
  videoThumbnailLimiter,
  thumbnailUploadHandler,
  async (req, res) => {
    try {
      const videoId = parseInt(req.params.id, 10)
      if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID.' })

      const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: { id: true, userId: true, status: true },
      })
      if (!video) return res.status(404).json({ error: 'Video not found.' })
      if (video.userId !== req.user.userId) {
        return res.status(403).json({ error: 'You can only edit your own video thumbnails.' })
      }

      let thumbKey
      if (req.file && req.file.buffer) {
        const detected = detectImageContentType(req.file.buffer)
        if (!detected) {
          return res.status(400).json({ error: 'Uploaded file is not a valid JPG or PNG image.' })
        }
        thumbKey = await replaceThumbnailFromUpload(videoId, req.file.buffer, detected)
      } else {
        const ts = Number(req.body?.frameTimestamp)
        if (!Number.isFinite(ts) || ts < 0) {
          return res.status(400).json({
            error: 'frameTimestamp must be a non-negative number, or upload an image file.',
          })
        }
        thumbKey = await regenerateThumbnailFromFrame(videoId, ts)
      }

      const updated = await prisma.video.findUnique({
        where: { id: videoId },
        include: {
          captions: { select: { id: true, language: true, label: true } },
          user: { select: { id: true, username: true, avatarUrl: true } },
        },
      })

      res.json({
        ...formatVideoResponse(updated),
        // Public URL is identical to the existing one (we overwrote the
        // same key); include a cache-busting query param so the client
        // re-fetches the new image without a hard reload.
        thumbnailUrl: updated.thumbnailR2Key
          ? `${r2.getPublicUrl(updated.thumbnailR2Key)}?v=${Date.now()}`
          : null,
        thumbnailR2Key: thumbKey,
      })
    } catch (err) {
      const status = Number.isInteger(err.statusCode) ? err.statusCode : 500
      if (status >= 500) {
        captureError(err, { route: req.originalUrl, method: req.method })
      }
      res.status(status).json({ error: err.message || 'Failed to update thumbnail.' })
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════════
// Captions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/video/:id/captions
 * Upload a VTT caption file for a video.
 *
 * Form data: file (VTT), language (e.g. "en"), label (e.g. "English")
 */
router.post('/:id/captions', requireAuth, captionUpload.single('file'), async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10)
    if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID.' })

    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video || video.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Video not found.' })
    }

    const { language, label } = req.body || {}
    if (!language || !label) {
      return res.status(400).json({ error: 'language and label are required.' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'VTT file is required.' })
    }

    // Check caption limit
    const existingCount = await prisma.videoCaption.count({ where: { videoId } })
    if (existingCount >= MAX_CAPTION_LANGUAGES) {
      return res
        .status(400)
        .json({ error: `Maximum ${MAX_CAPTION_LANGUAGES} caption tracks per video.` })
    }

    // Upload VTT to R2
    const vttKey = r2.generateCaptionKey(video.r2Key, language)
    await r2.uploadObject(vttKey, req.file.buffer, { contentType: 'text/vtt' })

    // Upsert caption record
    const caption = await prisma.videoCaption.upsert({
      where: { videoId_language: { videoId, language } },
      create: { videoId, language, label, vttR2Key: vttKey },
      update: { label, vttR2Key: vttKey },
    })

    res.status(201).json(caption)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /api/video/:id/captions/:language
 * Remove a caption track.
 */
router.delete('/:id/captions/:language', requireAuth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10)
    const { language } = req.params

    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video || video.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Video not found.' })
    }

    const caption = await prisma.videoCaption.findUnique({
      where: { videoId_language: { videoId, language } },
    })
    if (!caption) return res.status(404).json({ error: 'Caption not found.' })

    // Delete from R2
    await r2.deleteObject(caption.vttR2Key)

    // Delete record
    await prisma.videoCaption.delete({
      where: { videoId_language: { videoId, language } },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate the first bytes of a buffer against known video file signatures.
 */
function validateVideoSignature(buffer) {
  if (!buffer || buffer.length < 12) return false

  for (const sig of VIDEO_SIGNATURES) {
    // Check using the custom check function if provided
    if (sig.check && sig.check(buffer)) return true

    // Check static byte sequence
    if (sig.bytes) {
      let match = true
      for (let i = 0; i < sig.bytes.length; i++) {
        if (buffer[sig.offset + i] !== sig.bytes[i]) {
          match = false
          break
        }
      }
      if (match) return true
    }
  }

  return false
}

/**
 * Format a Video record for API response.
 * Resolves R2 keys to public URLs.
 */
function formatVideoResponse(video) {
  if (!video) return null

  const variants = {}
  if (video.variants && typeof video.variants === 'object') {
    for (const [quality, info] of Object.entries(video.variants)) {
      variants[quality] = {
        url: info.key ? r2.getPublicUrl(info.key) : null,
        width: info.width,
        height: info.height,
      }
    }
  }

  return {
    id: video.id,
    userId: video.userId,
    user: video.user || undefined,
    title: video.title,
    description: video.description,
    status: video.status,
    duration: video.duration,
    width: video.width,
    height: video.height,
    fileSize: video.fileSize,
    mimeType: video.mimeType,
    thumbnailUrl: video.thumbnailR2Key ? r2.getPublicUrl(video.thumbnailR2Key) : null,
    hlsManifestUrl: video.hlsManifestR2Key ? r2.getPublicUrl(video.hlsManifestR2Key) : null,
    variants,
    captions: video.captions || [],
    processingStep: video.processingStep || null,
    processingProgress: video.processingProgress || 0,
    downloadable: video.downloadable !== false,
    contentHash: video.contentHash || null,
    watermarkPosition: video.watermarkPosition || null,
    createdAt: video.createdAt,
  }
}

module.exports = router
