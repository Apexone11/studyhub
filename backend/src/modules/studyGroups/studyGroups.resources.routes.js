/**
 * studyGroups.resources.routes.js — Group resources sub-router
 *
 * Shared Resources endpoints:
 * - GET/POST /api/study-groups/:id/resources
 * - PATCH/DELETE /api/study-groups/:id/resources/:resourceId
 */

const express = require('express')
const path = require('node:path')
const crypto = require('node:crypto')
const multer = require('multer')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { readLimiter, writeLimiter, groupMediaUploadLimiter } = require('../../lib/rateLimiters')
const { GROUP_MEDIA_DIR, buildGroupMediaUrl } = require('../../lib/storage')
const {
  parseId,
  requireGroupMember,
  isGroupAdmin,
  isMutedInGroup,
  validateTitle,
  validateDescription,
  validateResourceUrl,
} = require('./studyGroups.helpers')
const {
  getQuotaSnapshot,
  assertQuotaAvailable,
  incrementUsage,
} = require('./studyGroups.media.service')
const { checkUrl } = require('../../lib/linkSafety')

const router = express.Router({ mergeParams: true })

/* ── Multer config for group media uploads ─────────────────────────────
 * Local dev pushes files to backend/uploads/group-media via diskStorage.
 * Production R2 wiring lives behind an env flag (not shipped in this
 * chunk — the local path is the source of truth for now).
 */

const GROUP_MEDIA_MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const GROUP_MEDIA_ALLOWED_MIME = new Set([
  // images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  // video
  'video/mp4', 'video/webm', 'video/quicktime',
  // documents
  'application/pdf',
  'application/zip',
  'text/plain',
  'text/markdown',
])

function mediaKindForMime(mime) {
  if (typeof mime !== 'string') return 'file'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'file'
}

function safeMediaName(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase().slice(0, 10)
  const random = crypto.randomBytes(8).toString('hex')
  return `${Date.now()}-${random}${ext || ''}`
}

const groupMediaDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, GROUP_MEDIA_DIR),
  filename: (_req, file, cb) => cb(null, safeMediaName(file.originalname)),
})

const groupMediaUpload = multer({
  storage: groupMediaDiskStorage,
  limits: { fileSize: GROUP_MEDIA_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!GROUP_MEDIA_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Unsupported file type.'))
    }
    cb(null, true)
  },
})

/**
 * GET /:id/resources
 * List group resources (pinned first)
 */
router.get('/', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    const { limit = 50, offset = 0 } = req.query
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100)
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0)

    const [resources, total] = await Promise.all([
      prisma.groupResource.findMany({
        where: { groupId },
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
        },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        skip: offsetNum,
        take: limitNum,
      }),
      prisma.groupResource.count({ where: { groupId } }),
    ])

    const formatted = resources.map((r) => ({
      id: r.id,
      groupId: r.groupId,
      userId: r.userId,
      user: r.user,
      title: r.title,
      description: r.description,
      resourceType: r.resourceType,
      resourceUrl: r.resourceUrl,
      sheetId: r.sheetId,
      noteId: r.noteId,
      pinned: r.pinned,
      createdAt: r.createdAt,
    }))

    res.json({ resources: formatted, total, limit: limitNum, offset: offsetNum })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /:id/resources/media-quota
 * Returns the current user's weekly media-upload snapshot so the frontend
 * composer can show "3/5 this week" and the "resets in 2 days" hint.
 * Members-only — non-members get 404 (leakage avoidance, matches existing pattern).
 */
router.get('/media-quota', readLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) return res.status(400).json({ error: 'Invalid group ID.' })

    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) return res.status(404).json({ error: 'Not a member.' })

    const snapshot = await getQuotaSnapshot(req.user.userId, { role: req.user.role })
    res.json(snapshot)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /:id/resources/upload
 * Multer single-file upload. Enforces weekly quota BEFORE writing the file
 * and increments the counter AFTER the write completes. Returns the media
 * metadata the frontend can then pass to POST /:id/resources to attach it
 * to a named resource row.
 */
router.post('/upload', groupMediaUploadLimiter, requireAuth, (req, res) => {
  const handleMulter = groupMediaUpload.single('file')
  handleMulter(req, res, async (multerErr) => {
    if (multerErr instanceof multer.MulterError && multerErr.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Max 25 MB per upload.' })
    }
    if (multerErr) {
      return res.status(400).json({ error: multerErr.message || 'Upload failed.' })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided.' })
    }

    try {
      const groupId = parseId(req.params.id)
      if (groupId === null) {
        return res.status(400).json({ error: 'Invalid group ID.' })
      }

      const member = await requireGroupMember(groupId, req.user.userId)
      if (!member) {
        return res.status(404).json({ error: 'Not a member.' })
      }

      // Enforce quota BEFORE committing the usage increment. The file is
      // already on disk by this point (multer wrote it), so if quota is
      // exceeded we unlink it and 429.
      try {
        await assertQuotaAvailable(req.user.userId, { role: req.user.role })
      } catch (quotaErr) {
        if (quotaErr.status === 429) {
          // Best-effort cleanup — do not block the 429 on FS errors.
          try {
            const fs = require('node:fs')
            fs.unlinkSync(req.file.path)
          } catch { /* ignore */ }
          return res.status(429).json({
            error: quotaErr.message,
            code: quotaErr.code || 'RATE_LIMITED',
            ...(quotaErr.extra || {}),
          })
        }
        throw quotaErr
      }

      const url = buildGroupMediaUrl(path.basename(req.file.path))
      await incrementUsage(req.user.userId, groupId)

      res.status(201).json({
        url,
        mime: req.file.mimetype,
        bytes: req.file.size,
        kind: mediaKindForMime(req.file.mimetype),
        originalName: req.file.originalname,
      })
    } catch (err) {
      captureError(err, { route: req.originalUrl, method: req.method })
      res.status(500).json({ error: 'Server error.' })
    }
  })
})

/**
 * POST /:id/resources
 * Add a resource (members only)
 */
router.post('/', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    if (groupId === null) {
      return res.status(400).json({ error: 'Invalid group ID.' })
    }

    // Check membership
    const member = await requireGroupMember(groupId, req.user.userId)
    if (!member) {
      return res.status(404).json({ error: 'Not a member.' })
    }

    // Phase 5: muted users cannot create resources.
    if (await isMutedInGroup(groupId, req.user.userId)) {
      return res.status(403).json({ error: 'You are currently muted in this group and cannot post.' })
    }

    const {
      title,
      description = '',
      resourceType = 'link',
      resourceUrl,
      sheetId,
      noteId,
      // Phase 4: optional media metadata from /resources/upload
      mediaType,
      mediaUrl,
      mediaBytes,
      mediaMime,
    } = req.body

    // Validate title
    const validTitle = validateTitle(title)
    if (!validTitle) {
      return res.status(400).json({ error: 'Title required, max 200 chars.' })
    }

    // Validate description
    const validDesc = validateDescription(description)
    if (validDesc === null) {
      return res.status(400).json({ error: 'Description max 2000 chars.' })
    }

    // Validate resourceType — 'image' and 'video' added in Phase 4
    if (!['link', 'sheet', 'note', 'file', 'image', 'video'].includes(resourceType)) {
      return res.status(400).json({ error: 'Invalid resourceType.' })
    }

    // Validate URL if provided. Accept the internal /uploads/group-media/...
    // path that POST /upload returns, as well as external http(s) links.
    let validUrl = null
    if (resourceUrl) {
      if (String(resourceUrl).startsWith('/uploads/group-media/')) {
        validUrl = resourceUrl
      } else {
        validUrl = validateResourceUrl(resourceUrl)
        if (!validUrl) {
          return res.status(400).json({ error: 'Invalid resource URL. Must be a valid http or https URL.' })
        }
      }
    }

    // Phase 5 C.2: link safety check on external URLs.
    if (validUrl && !validUrl.startsWith('/uploads/')) {
      const linkCheck = checkUrl(validUrl)
      if (!linkCheck.safe) {
        return res.status(400).json({
          error: `This URL was flagged as unsafe: ${linkCheck.reason}. If you believe this is a mistake, contact support.`,
          code: 'UNSAFE_LINK',
        })
      }
    }

    // Phase 4: if the caller attached structured media metadata from
    // POST /upload, normalize it into the row. mediaType must match the
    // allowlist; mediaUrl can only be the internal /uploads/... path to
    // prevent arbitrary-URL injection via this field.
    const mediaData = {}
    if (mediaType !== undefined || mediaUrl !== undefined) {
      const allowedKinds = ['image', 'video', 'file', 'link']
      if (mediaType != null && !allowedKinds.includes(mediaType)) {
        return res.status(400).json({ error: 'Invalid mediaType.' })
      }
      if (mediaUrl != null) {
        if (typeof mediaUrl !== 'string' || !mediaUrl.startsWith('/uploads/group-media/')) {
          return res.status(400).json({ error: 'mediaUrl must be an /uploads/group-media/... path.' })
        }
        mediaData.mediaUrl = mediaUrl
      }
      if (mediaType != null) mediaData.mediaType = mediaType
      if (mediaBytes != null) mediaData.mediaBytes = Number.parseInt(mediaBytes, 10) || null
      if (mediaMime != null) mediaData.mediaMime = String(mediaMime).slice(0, 120)
    }

    const resource = await prisma.groupResource.create({
      data: {
        groupId,
        userId: req.user.userId,
        title: validTitle,
        description: validDesc,
        resourceType,
        resourceUrl: validUrl,
        sheetId: sheetId ? parseId(sheetId) : null,
        noteId: noteId ? parseId(noteId) : null,
        ...mediaData,
      },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.status(201).json({
      id: resource.id,
      groupId: resource.groupId,
      userId: resource.userId,
      user: resource.user,
      title: resource.title,
      description: resource.description,
      resourceType: resource.resourceType,
      resourceUrl: resource.resourceUrl,
      sheetId: resource.sheetId,
      noteId: resource.noteId,
      pinned: resource.pinned,
      mediaType: resource.mediaType,
      mediaUrl: resource.mediaUrl,
      mediaBytes: resource.mediaBytes,
      mediaMime: resource.mediaMime,
      createdAt: resource.createdAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /:id/resources/:resourceId
 * Update resource (author or admin)
 */
router.patch('/:resourceId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const resourceId = parseId(req.params.resourceId)

    if (groupId === null || resourceId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const resource = await prisma.groupResource.findUnique({
      where: { id: resourceId },
    })

    if (!resource || resource.groupId !== groupId) {
      return res.status(404).json({ error: 'Resource not found.' })
    }

    // Check permission (author or admin)
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (resource.userId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    const { title, description, resourceType, resourceUrl, pinned } = req.body
    const updates = {}

    if (title !== undefined) {
      const validTitle = validateTitle(title)
      if (!validTitle) {
        return res.status(400).json({ error: 'Title required, max 200 chars.' })
      }
      updates.title = validTitle
    }

    if (description !== undefined) {
      const validDesc = validateDescription(description)
      if (validDesc === null) {
        return res.status(400).json({ error: 'Description max 2000 chars.' })
      }
      updates.description = validDesc
    }

    if (resourceType !== undefined) {
      if (!['link', 'sheet', 'note', 'file', 'image', 'video'].includes(resourceType)) {
        return res.status(400).json({ error: 'Invalid resourceType.' })
      }
      updates.resourceType = resourceType
    }

    if (resourceUrl !== undefined) {
      // Validate URL the same way POST does — only /uploads/group-media/ or
      // valid http(s) links. Prevents javascript:, data:, or arbitrary URI injection.
      if (typeof resourceUrl !== 'string') {
        return res.status(400).json({ error: 'resourceUrl must be a string.' })
      }
      const isUploadPath = resourceUrl.startsWith('/uploads/group-media/')
      const isHttpUrl = resourceUrl.startsWith('https://') || resourceUrl.startsWith('http://')
      if (!isUploadPath && !isHttpUrl) {
        return res.status(400).json({ error: 'resourceUrl must be an /uploads/group-media/... path or a valid http(s) URL.' })
      }
      updates.resourceUrl = resourceUrl
    }

    if (pinned !== undefined && isAdmin) {
      updates.pinned = Boolean(pinned)
    }

    const updated = await prisma.groupResource.update({
      where: { id: resourceId },
      data: updates,
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.json({
      id: updated.id,
      groupId: updated.groupId,
      userId: updated.userId,
      user: updated.user,
      title: updated.title,
      description: updated.description,
      resourceType: updated.resourceType,
      resourceUrl: updated.resourceUrl,
      sheetId: updated.sheetId,
      noteId: updated.noteId,
      pinned: updated.pinned,
      createdAt: updated.createdAt,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * DELETE /:id/resources/:resourceId
 * Delete resource (author or admin)
 */
router.delete('/:resourceId', writeLimiter, requireAuth, async (req, res) => {
  try {
    const groupId = parseId(req.params.id)
    const resourceId = parseId(req.params.resourceId)

    if (groupId === null || resourceId === null) {
      return res.status(400).json({ error: 'Invalid IDs.' })
    }

    const resource = await prisma.groupResource.findUnique({
      where: { id: resourceId },
    })

    if (!resource || resource.groupId !== groupId) {
      return res.status(404).json({ error: 'Resource not found.' })
    }

    // Check permission (author or admin)
    const isAdmin = await isGroupAdmin(groupId, req.user.userId)
    if (resource.userId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized.' })
    }

    await prisma.groupResource.delete({
      where: { id: resourceId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
