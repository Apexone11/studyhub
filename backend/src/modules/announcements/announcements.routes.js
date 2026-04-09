const express = require('express')
const multer = require('multer')
const { readLimiter } = require('../../lib/rateLimiters')
const { sendForbidden } = require('../../lib/accessControl')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const { cached, invalidate } = require('../../lib/redis')
const prisma = require('../../lib/prisma')
const r2 = require('../../lib/r2Storage')

const router = express.Router()

router.use(readLimiter)

// ── Constants ──────────────────────────────────────────────────
const MAX_BODY_LENGTH = 25000
const MAX_TITLE_LENGTH = 200
const MAX_IMAGES = 5
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB per image
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// Multer for announcement image uploads (memory storage -> R2)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: MAX_IMAGES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_IMAGE_MIMES.has(file.mimetype)) cb(null, true)
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
    // Phase 6: Redis cache 15min -- announcements change rarely
    const announcements = await cached('announcements:list', () =>
      prisma.announcement.findMany({
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
          ...mediaInclude,
        },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 20,
      }),
      900,
    )
    res.json(announcements)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/announcements — admin only ──────────────────────
router.post('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendForbidden(res, 'Admin access required.')
  }

  const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : ''
  const pinned = !!req.body.pinned
  const videoId = req.body.videoId ? Number.parseInt(req.body.videoId, 10) : null

  if (!title) return res.status(400).json({ error: 'Title is required.' })
  if (!body) return res.status(400).json({ error: 'Body is required.' })
  if (title.length > MAX_TITLE_LENGTH) {
    return res.status(400).json({ error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.` })
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
      if (!video) return res.status(404).json({ error: 'Video not found.' })
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
    await invalidate('announcements:list')
    res.status(201).json(announcement)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/announcements/:id/images — upload images (admin only) ───
router.post(
  '/:id/images',
  requireAuth,
  (req, res, next) => {
    if (req.user.role !== 'admin') {
      return sendForbidden(res, 'Admin access required.')
    }
    next()
  },
  imageUpload.array('images', MAX_IMAGES),
  async (req, res) => {
    const announcementId = parseInt(req.params.id, 10)
    if (isNaN(announcementId)) return res.status(400).json({ error: 'Invalid announcement ID.' })

    try {
      const announcement = await prisma.announcement.findUnique({
        where: { id: announcementId },
        select: { id: true },
      })
      if (!announcement) return res.status(404).json({ error: 'Announcement not found.' })

      const files = req.files || []
      if (files.length === 0) return res.status(400).json({ error: 'No images provided.' })

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

        // Upload to R2
        if (!r2.isR2Configured()) {
          return res.status(503).json({ error: 'File storage is not configured.' })
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
        return res.status(400).json({ error: 'Each image must be under 10 MB.' })
      }
      captureError(err, { route: req.originalUrl, method: req.method })
      res.status(500).json({ error: 'Failed to upload images.' })
    }
  },
)

// ── DELETE /api/announcements/:id/media/:mediaId — remove a media item (admin) ─
router.delete('/:id/media/:mediaId', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendForbidden(res, 'Admin access required.')
  }

  const announcementId = parseInt(req.params.id, 10)
  const mediaId = parseInt(req.params.mediaId, 10)
  if (isNaN(announcementId) || isNaN(mediaId)) {
    return res.status(400).json({ error: 'Invalid ID.' })
  }

  try {
    const media = await prisma.announcementMedia.findUnique({
      where: { id: mediaId },
      select: { id: true, announcementId: true, url: true, type: true },
    })
    if (!media || media.announcementId !== announcementId) {
      return res.status(404).json({ error: 'Media not found.' })
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
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/announcements/:id/video — attach video (admin only) ─────
router.post('/:id/video', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendForbidden(res, 'Admin access required.')
  }

  const announcementId = parseInt(req.params.id, 10)
  const videoId = req.body.videoId ? parseInt(req.body.videoId, 10) : null

  if (isNaN(announcementId)) return res.status(400).json({ error: 'Invalid announcement ID.' })
  if (!videoId) return res.status(400).json({ error: 'videoId is required.' })

  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true },
    })
    if (!announcement) return res.status(404).json({ error: 'Announcement not found.' })

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    })
    if (!video) return res.status(404).json({ error: 'Video not found.' })

    // Check if this announcement already has a video
    const existingVideo = await prisma.announcementMedia.findFirst({
      where: { announcementId, type: 'video' },
    })
    if (existingVideo) {
      return res.status(400).json({ error: 'Announcement already has a video. Remove it first.' })
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
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE /api/announcements/:id — admin only ───────────────
router.delete('/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return sendForbidden(res, 'Admin access required.')
  }

  const announcementId = parseInt(req.params.id, 10)
  if (isNaN(announcementId)) return res.status(400).json({ error: 'Invalid ID.' })

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
    await invalidate('announcements:list')
    res.json({ message: 'Announcement deleted.' })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Announcement not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
