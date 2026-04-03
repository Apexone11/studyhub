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
const { processVideo, deleteVideoAssets } = require('./video.service')
const { scanBufferWithClamAv } = require('../../lib/clamav')
const {
  MAX_VIDEO_SIZE,
  VIDEO_DURATION_LIMITS,
  VIDEO_SIZE_LIMITS,
  MAX_CAPTION_SIZE,
  MIN_CHUNK_SIZE,
  ALLOWED_VIDEO_MIMES,
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_CAPTION_MIMES,
  ALLOWED_CAPTION_EXTENSIONS,
  MAX_CAPTION_LANGUAGES,
  VIDEO_STATUS,
  VIDEO_SIGNATURES,
} = require('./video.constants')

const router = express.Router()

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
  readLimiter,
} = require('../../lib/rateLimiters')

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
    let userPlan = 'free'

    // Check active subscription
    try {
      const sub = await prisma.subscription.findUnique({
        where: { userId: req.user.userId },
        select: { plan: true, status: true },
      })
      if (sub && sub.status === 'active') {
        userPlan = sub.plan
      }
    } catch (e) {
      // Graceful degradation: treat as free on error
    }

    // Check if user has made a donation (upgrade free to donor)
    if (userPlan === 'free') {
      try {
        const donation = await prisma.donation.findFirst({
          where: { userId: req.user.userId },
        })
        if (donation) {
          userPlan = 'donor'
        }
      } catch (e) {
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
 * The frontend sends each chunk as a raw binary body with metadata in headers.
 *
 * Headers:
 *   x-upload-id   — R2 multipart upload ID
 *   x-r2-key      — R2 object key
 *   x-part-number — Chunk number (1-based)
 *   x-video-id    — Video record ID
 *
 * Body: Raw binary chunk data
 * Returns: { ETag, PartNumber }
 */
router.post(
  '/upload/chunk',
  requireAuth,
  videoUploadChunkLimiter,
  express.raw({ type: '*/*', limit: '12mb' }),
  async (req, res) => {
    try {
      const uploadId = req.headers['x-upload-id']
      const r2Key = req.headers['x-r2-key']
      const partNumber = parseInt(req.headers['x-part-number'], 10)
      const videoId = parseInt(req.headers['x-video-id'], 10)

      if (!uploadId || !r2Key || isNaN(partNumber) || isNaN(videoId)) {
        return res.status(400).json({ error: 'Missing required upload headers.' })
      }

      // Verify ownership
      const video = await prisma.video.findUnique({ where: { id: videoId } })
      if (!video || video.userId !== req.user.userId) {
        return res.status(404).json({ error: 'Video not found.' })
      }

      const chunkBuffer = req.body
      if (!chunkBuffer || chunkBuffer.length === 0) {
        return res.status(400).json({ error: 'Empty chunk.' })
      }

      // For the first chunk, validate magic bytes
      if (partNumber === 1) {
        const isValid = validateVideoSignature(chunkBuffer)
        if (!isValid) {
          // Abort the multipart upload
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

      // Upload the chunk to R2
      const part = await r2.uploadPart(r2Key, uploadId, partNumber, chunkBuffer)

      res.json(part)
    } catch (err) {
      captureError(err, { route: req.originalUrl, method: req.method })
      res.status(500).json({ error: 'Failed to upload chunk.' })
    }
  },
)

/**
 * POST /api/video/upload/complete
 * Finalize a chunked upload and trigger background processing.
 *
 * Body: { videoId, uploadId, r2Key, parts: [{ ETag, PartNumber }] }
 * Returns: { video }
 */
router.post('/upload/complete', requireAuth, async (req, res) => {
  try {
    const { videoId, uploadId, r2Key, parts } = req.body || {}

    if (!videoId || !uploadId || !r2Key || !Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ error: 'videoId, uploadId, r2Key, and parts are required.' })
    }

    // Verify ownership
    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video || video.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Video not found.' })
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
    } catch (scanErr) {
      // ClamAV scan failure is non-fatal (may not be configured in dev)
      captureError(scanErr, { context: 'video-clamav-scan', videoId })
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
    createdAt: video.createdAt,
  }
}

module.exports = router
