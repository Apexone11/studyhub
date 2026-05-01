const express = require('express')
const multer = require('multer')
const path = require('node:path')
const { readLimiter } = require('../../lib/rateLimiters')
const { sendForbidden } = require('../../lib/accessControl')
const requireAuth = require('../../middleware/auth')
const originAllowlist = require('../../middleware/originAllowlist')
const requireTrustedOrigin = originAllowlist()
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const r2 = require('../../lib/r2Storage')
const {
  signatureMatchesExpectedFromBuffer,
  validateMagicBytesFromBuffer,
} = require('../../lib/fileSignatures')

const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const router = express.Router()

router.use(readLimiter)

// ── Constants ──────────────────────────────────────────────────
const MAX_BODY_LENGTH = 25000
const MAX_TITLE_LENGTH = 200
const MAX_IMAGES = 5
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB per image
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

// Multer for announcement image uploads (memory storage -> R2)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: MAX_IMAGES },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ALLOWED_IMAGE_MIMES.has(file.mimetype) && ALLOWED_IMAGE_EXTENSIONS.has(ext)) cb(null, true)
    else cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed.'))
  },
})

// Media include clause reused across queries
const mediaInclude = {
  media: {
    select: {
      id: true,
      type: true,
      url: true,
      position: true,
      videoId: true,
      fileName: true,
      fileSize: true,
      width: true,
      height: true,
      video: {
        select: {
          id: true,
          title: true,
          status: true,
          duration: true,
          width: true,
          height: true,
          thumbnailR2Key: true,
          variants: true,
          r2Key: true,
        },
      },
    },
    orderBy: { position: 'asc' },
  },
}

// ── GET /api/announcements — public ──────────────────────────
router.get('/', async (req, res) => {
  try {
    const announcements = await prisma.announcement.findMany({
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        ...mediaInclude,
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    })
    res.json(announcements)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── POST /api/announcements — admin only ──────────────────────
router.post('/', requireAuth, requireTrustedOrigin, async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendForbidden(res, 'Admin access required.')
  }

  const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : ''
  const pinned = !!req.body.pinned
  const videoId = req.body.videoId ? Number.parseInt(req.body.videoId, 10) : null

  if (!title) return sendError(res, 400, 'Title is required.', ERROR_CODES.BAD_REQUEST)
  if (!body) return sendError(res, 400, 'Body is required.', ERROR_CODES.BAD_REQUEST)
  if (title.length > MAX_TITLE_LENGTH) {
    return sendError(
      res,
      400,
      `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`,
      ERROR_CODES.BAD_REQUEST,
    )
  }
  if (body.length > MAX_BODY_LENGTH) {
    return res
      .status(400)
      .json({ error: `Body must be ${MAX_BODY_LENGTH.toLocaleString()} characters or fewer.` })
  }

  try {
    // If attaching a video, verify it exists
    if (videoId) {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: { id: true, status: true },
      })
      if (!video) return sendError(res, 404, 'Video not found.', ERROR_CODES.NOT_FOUND)
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        body,
        pinned,
        authorId: req.user.userId,
        // If a video is attached, create a media record for it
        ...(videoId
          ? {
              media: {
                create: {
                  type: 'video',
                  url: '',
                  videoId,
                  position: 0,
                },
              },
            }
          : {}),
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        ...mediaInclude,
      },
    })
    res.status(201).json(announcement)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── POST /api/announcements/:id/images — upload images (admin only) ───
router.post(
  '/:id/images',
  requireAuth,
  requireTrustedOrigin,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return sendForbidden(res, 'Admin access required.')
    }
    next()
  },
  imageUpload.array('images', MAX_IMAGES),
  async (req, res) => {
    const announcementId = parseInt(req.params.id, 10)
    if (isNaN(announcementId))
      return sendError(res, 400, 'Invalid announcement ID.', ERROR_CODES.BAD_REQUEST)

    try {
      const announcement = await prisma.announcement.findUnique({
        where: { id: announcementId },
        select: { id: true },
      })
      if (!announcement)
        return sendError(res, 404, 'Announcement not found.', ERROR_CODES.NOT_FOUND)

      const files = req.files || []
      if (files.length === 0)
        return sendError(res, 400, 'No images provided.', ERROR_CODES.BAD_REQUEST)

      // Check existing media count
      const existingCount = await prisma.announcementMedia.count({
        where: { announcementId },
      })
      if (existingCount + files.length > MAX_IMAGES) {
        return res
          .status(400)
          .json({ error: `Maximum ${MAX_IMAGES} media items per announcement.` })
      }

      const mediaRecords = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        if (!signatureMatchesExpectedFromBuffer(file.buffer, Array.from(ALLOWED_IMAGE_MIMES)).ok) {
          return sendError(
            res,
            400,
            'Image contents do not match a supported image format.',
            ERROR_CODES.BAD_REQUEST,
          )
        }
        const magic = validateMagicBytesFromBuffer(file.buffer, file.mimetype)
        if (!magic.valid) {
          return sendError(
            res,
            400,
            'Image file signature does not match its declared type.',
            ERROR_CODES.BAD_REQUEST,
          )
        }

        // Upload to R2
        if (!r2.isR2Configured()) {
          return sendError(res, 503, 'File storage is not configured.', ERROR_CODES.INTERNAL)
        }

        const r2Key = r2.generateAnnouncementImageKey(announcementId, file.originalname)
        await r2.uploadObject(r2Key, file.buffer, file.mimetype)

        const url = r2.getPublicUrl(r2Key)

        const record = await prisma.announcementMedia.create({
          data: {
            announcementId,
            type: 'image',
            url,
            position: existingCount + i,
            fileName: file.originalname,
            fileSize: file.size,
          },
        })
        mediaRecords.push(record)
      }

      res.status(201).json({ media: mediaRecords })
    } catch (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 400, 'Each image must be under 10 MB.', ERROR_CODES.BAD_REQUEST)
      }
      captureError(err, { route: req.originalUrl, method: req.method })
      sendError(res, 500, 'Failed to upload images.', ERROR_CODES.INTERNAL)
    }
  },
)

// ── DELETE /api/announcements/:id/media/:mediaId — remove a media item (admin) ─
router.delete('/:id/media/:mediaId', requireAuth, requireTrustedOrigin, async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendForbidden(res, 'Admin access required.')
  }

  const announcementId = parseInt(req.params.id, 10)
  const mediaId = parseInt(req.params.mediaId, 10)
  if (isNaN(announcementId) || isNaN(mediaId)) {
    return sendError(res, 400, 'Invalid ID.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const media = await prisma.announcementMedia.findUnique({
      where: { id: mediaId },
      select: { id: true, announcementId: true, url: true, type: true },
    })
    if (!media || media.announcementId !== announcementId) {
      return sendError(res, 404, 'Media not found.', ERROR_CODES.NOT_FOUND)
    }

    // Try to delete from R2 if it's an image with a URL
    if (media.type === 'image' && media.url && r2.isR2Configured()) {
      const key = r2.extractObjectKeyFromUrl(media.url)
      try {
        if (key) await r2.deleteObject(key)
      } catch {
        /* best effort */
      }
    }

    await prisma.announcementMedia.delete({ where: { id: mediaId } })
    res.json({ message: 'Media removed.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── POST /api/announcements/:id/video — attach video (admin only) ─────
router.post('/:id/video', requireAuth, requireTrustedOrigin, async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendForbidden(res, 'Admin access required.')
  }

  const announcementId = parseInt(req.params.id, 10)
  const videoId = req.body.videoId ? parseInt(req.body.videoId, 10) : null

  if (isNaN(announcementId))
    return sendError(res, 400, 'Invalid announcement ID.', ERROR_CODES.BAD_REQUEST)
  if (!videoId) return sendError(res, 400, 'videoId is required.', ERROR_CODES.BAD_REQUEST)

  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true },
    })
    if (!announcement) return sendError(res, 404, 'Announcement not found.', ERROR_CODES.NOT_FOUND)

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    })
    if (!video) return sendError(res, 404, 'Video not found.', ERROR_CODES.NOT_FOUND)

    // Check if this announcement already has a video
    const existingVideo = await prisma.announcementMedia.findFirst({
      where: { announcementId, type: 'video' },
    })
    if (existingVideo) {
      return sendError(
        res,
        400,
        'Announcement already has a video. Remove it first.',
        ERROR_CODES.BAD_REQUEST,
      )
    }

    const maxPos = await prisma.announcementMedia.aggregate({
      where: { announcementId },
      _max: { position: true },
    })

    const record = await prisma.announcementMedia.create({
      data: {
        announcementId,
        type: 'video',
        url: '',
        videoId,
        position: (maxPos._max.position ?? -1) + 1,
      },
      include: {
        video: {
          select: {
            id: true,
            title: true,
            status: true,
            duration: true,
            width: true,
            height: true,
            thumbnailR2Key: true,
            variants: true,
            r2Key: true,
          },
        },
      },
    })

    res.status(201).json(record)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

// ── DELETE /api/announcements/:id — admin only ───────────────
router.delete('/:id', requireAuth, requireTrustedOrigin, async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendForbidden(res, 'Admin access required.')
  }

  const announcementId = parseInt(req.params.id, 10)
  if (isNaN(announcementId)) return sendError(res, 400, 'Invalid ID.', ERROR_CODES.BAD_REQUEST)

  try {
    // Clean up R2 images before deleting
    if (r2.isR2Configured()) {
      const mediaItems = await prisma.announcementMedia.findMany({
        where: { announcementId, type: 'image' },
        select: { url: true },
      })
      for (const item of mediaItems) {
        if (item.url) {
          const key = r2.extractObjectKeyFromUrl(item.url)
          try {
            if (key) await r2.deleteObject(key)
          } catch {
            /* best effort */
          }
        }
      }
    }

    // Cascade will delete AnnouncementMedia rows
    await prisma.announcement.delete({ where: { id: announcementId } })
    res.json({ message: 'Announcement deleted.' })
  } catch (err) {
    if (err.code === 'P2025')
      return sendError(res, 404, 'Announcement not found.', ERROR_CODES.NOT_FOUND)
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
