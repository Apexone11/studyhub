const express = require('express')
const fs = require('node:fs')
const path = require('node:path')
// archiver v8 dropped the callable factory (`archiver('zip', …)`) in favor
// of format subclasses; ZipArchive wires the zip module in its constructor.
const { ZipArchive } = require('archiver')
const prisma = require('../../lib/prisma')
const log = require('../../lib/logger')
const { ERROR_CODES, sendError } = require('../../middleware/errorEnvelope')
const { captureError } = require('../../monitoring/sentry')
const { notifyMentionedUsers } = require('../../lib/mentions')
const { assertOwnerOrAdmin, sendForbidden } = require('../../lib/accessControl')
const { cleanupAttachmentIfUnused, resolveAttachmentPath } = require('../../lib/storage')
const { sendAttachmentPreview } = require('../../lib/attachmentPreview')
const { isModerationEnabled, scanContent } = require('../../lib/moderation/moderationEngine')
const requireAuth = require('../../middleware/auth')
const { feedWriteLimiter, attachmentDownloadLimiter } = require('./feed.constants')
const { feedZipLimiter } = require('../../lib/rateLimiters')
const { formatFeedPostDetail, safeDownloadName } = require('./feed.service')
const { getInitialModerationStatus } = require('../../lib/trustGate')
const { runAbuseChecks } = require('../../lib/abuseDetection')
const { VIDEO_STATUS } = require('../video/video.constants')

const router = express.Router()

// Parse an optional FK from req.body, returning either a positive int or
// null. Throws a tagged Error on garbage input so the route returns a
// clean 400 instead of a 500 from a downstream FK violation (CLAUDE.md
// A12 — Number.parseInt + Number.isInteger guard pattern).
// Ceiling shared with the upload route: a post can carry at most this many
// attachments, so a zip request can never name more than this.
const MAX_POST_ATTACHMENTS = 5

// "notes.pdf" + 1 -> "notes (1).pdf"
function appendNameSuffix(name, index) {
  const ext = path.extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  return `${base} (${index})${ext}`
}

function parseOptionalFk(raw, fieldName) {
  if (raw == null || raw === '') return null
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    const err = new Error(`Invalid ${fieldName}.`)
    err.statusCode = 400
    throw err
  }
  return parsed
}

router.post('/posts', feedWriteLimiter, async (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''
  const allowDownloads = req.body.allowDownloads !== false
  let courseId
  let videoId
  try {
    courseId = parseOptionalFk(req.body.courseId, 'courseId')
    videoId = parseOptionalFk(req.body.videoId, 'videoId')
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message })
  }

  // Content is required unless a video is attached
  if (!content && !videoId) return res.status(400).json({ error: 'Post content is required.' })
  if (content.length > 2000) {
    return res.status(400).json({ error: 'Post content must be 2000 characters or fewer.' })
  }

  try {
    // If a videoId is provided, verify ownership AND that processing
    // succeeded. Posting a still-processing video lands a feed card that
    // never plays; posting a failed/blocked video leaks a broken card to
    // followers. Both are blocked here with a clear reason so the
    // composer can surface the right message.
    if (videoId) {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: { userId: true, status: true },
      })
      if (!video) return res.status(404).json({ error: 'Video not found.' })
      if (video.userId !== req.user.userId) {
        return res.status(403).json({ error: 'You do not own this video.' })
      }
      if (video.status === VIDEO_STATUS.PROCESSING) {
        return res
          .status(409)
          .json({ error: 'Video is still processing. Wait until it turns ready, then post.' })
      }
      if (video.status === VIDEO_STATUS.FAILED) {
        return res.status(409).json({ error: 'Video processing failed. Remove it and try again.' })
      }
      if (video.status === VIDEO_STATUS.BLOCKED) {
        return res.status(409).json({ error: 'This video was blocked and cannot be posted.' })
      }
    }

    const moderationStatus = getInitialModerationStatus(req.user)
    const post = await prisma.feedPost.create({
      data: {
        content: content || '',
        userId: req.user.userId,
        courseId: courseId || null,
        allowDownloads,
        videoId: videoId || null,
        moderationStatus,
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        course: { select: { id: true, code: true } },
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
            hlsManifestR2Key: true,
            r2Key: true,
          },
        },
      },
    })

    await notifyMentionedUsers(prisma, {
      text: content,
      actorId: req.user.userId,
      actorUsername: req.user.username,
      message: `${req.user.username} mentioned you in a post.`,
      linkPath: `/feed?post=${post.id}`,
    })

    res.status(201).json(formatFeedPostDetail(post, 0, [], []))

    /* Async content moderation — fire-and-forget after response is sent */
    if (isModerationEnabled()) {
      void scanContent({
        contentType: 'feed_post',
        contentId: post.id,
        text: content,
        userId: req.user.userId,
      })
    }

    /* Abuse detection — rate anomaly, duplicate, new-account checks (fire-and-forget) */
    void runAbuseChecks({
      userId: req.user.userId,
      actionType: 'post_create',
      contentType: 'feed_post',
      contentId: post.id,
      text: content,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/posts/:id', async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Invalid post id.' })

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        course: { select: { id: true, code: true } },
        attachments: {
          orderBy: { position: 'asc' },
          select: { id: true, name: true, type: true, sizeBytes: true, position: true },
        },
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
            hlsManifestR2Key: true,
            r2Key: true,
          },
        },
      },
    })
    if (!post) return res.status(404).json({ error: 'Post not found.' })

    const [commentCount, reactionRows, currentReactions] = await Promise.all([
      prisma.feedPostComment.count({ where: { postId } }),
      prisma.feedPostReaction.groupBy({
        by: ['postId', 'type'],
        where: { postId },
        _count: { _all: true },
      }),
      prisma.feedPostReaction.findMany({
        where: { userId: req.user.userId, postId },
        select: { postId: true, type: true },
      }),
    ])

    res.json(formatFeedPostDetail(post, commentCount, reactionRows, currentReactions))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/posts/:id/attachment', requireAuth, attachmentDownloadLimiter, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Invalid post id.' })

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        userId: true,
        moderationStatus: true,
        attachmentUrl: true,
        attachmentName: true,
        allowDownloads: true,
      },
    })

    if (!post) return res.status(404).json({ error: 'Post not found.' })
    if (!post.attachmentUrl) return res.status(404).json({ error: 'Attachment not found.' })
    const isOwnerOrAdmin =
      req.user && (req.user.userId === post.userId || req.user.role === 'admin')
    if (!isOwnerOrAdmin && !post.allowDownloads) {
      return sendForbidden(res, 'Downloads are disabled for this post.')
    }

    const localPath = resolveAttachmentPath(post.attachmentUrl)
    if (!localPath || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Attachment file is missing.' })
    }

    res.download(localPath, safeDownloadName(post.attachmentName || path.basename(localPath)))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get(
  '/posts/:id/attachment/preview',
  requireAuth,
  attachmentDownloadLimiter,
  async (req, res) => {
    const postId = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Invalid post id.' })

    try {
      const post = await prisma.feedPost.findUnique({
        where: { id: postId },
        select: {
          id: true,
          userId: true,
          moderationStatus: true,
          attachmentUrl: true,
          attachmentName: true,
          attachmentType: true,
        },
      })

      if (!post) return res.status(404).json({ error: 'Post not found.' })
      if (!post.attachmentUrl)
        return res.status(404).json({ error: 'No attachment found.', kind: 'none' })

      const localPath = resolveAttachmentPath(post.attachmentUrl)
      if (!localPath || !fs.existsSync(localPath)) {
        return res.status(404).json({ error: 'Attachment file not found.', kind: 'missing' })
      }

      await sendAttachmentPreview({
        res,
        localPath,
        attachmentName: post.attachmentName || path.basename(localPath),
        attachmentType: post.attachmentType || '',
      })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      res.status(500).json({ error: 'Server error.' })
    }
  },
)

// ── Per-attachment routes (multi-attachment posts) ─────────────────────
// Path shape /attachment/:attachmentId/{preview,download} never collides
// with the legacy /attachment and /attachment/preview routes above (they
// have fewer path segments), so registration order doesn't matter.

async function loadPostAttachment(req, res) {
  const postId = Number.parseInt(req.params.id, 10)
  const attachmentId = Number.parseInt(req.params.attachmentId, 10)
  if (
    !Number.isInteger(postId) ||
    postId < 1 ||
    !Number.isInteger(attachmentId) ||
    attachmentId < 1
  ) {
    res.status(400).json({ error: 'Invalid id.' })
    return null
  }
  const post = await prisma.feedPost.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, moderationStatus: true, allowDownloads: true },
  })
  if (!post) {
    res.status(404).json({ error: 'Post not found.' })
    return null
  }
  const attachment = await prisma.feedPostAttachment.findFirst({
    where: { id: attachmentId, postId },
    select: { id: true, url: true, type: true, name: true },
  })
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found.' })
    return null
  }
  const localPath = resolveAttachmentPath(attachment.url)
  if (!localPath || !fs.existsSync(localPath)) {
    res.status(404).json({ error: 'Attachment file is missing.', kind: 'missing' })
    return null
  }
  return { post, attachment, localPath }
}

router.get(
  '/posts/:id/attachment/:attachmentId/preview',
  requireAuth,
  attachmentDownloadLimiter,
  async (req, res) => {
    try {
      const loaded = await loadPostAttachment(req, res)
      if (!loaded) return
      await sendAttachmentPreview({
        res,
        localPath: loaded.localPath,
        attachmentName: loaded.attachment.name || path.basename(loaded.localPath),
        attachmentType: loaded.attachment.type || '',
      })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      res.status(500).json({ error: 'Server error.' })
    }
  },
)

router.get(
  '/posts/:id/attachment/:attachmentId/download',
  requireAuth,
  attachmentDownloadLimiter,
  async (req, res) => {
    try {
      const loaded = await loadPostAttachment(req, res)
      if (!loaded) return
      const isOwnerOrAdmin =
        req.user && (req.user.userId === loaded.post.userId || req.user.role === 'admin')
      if (!isOwnerOrAdmin && !loaded.post.allowDownloads) {
        return sendForbidden(res, 'Downloads are disabled for this post.')
      }
      res.download(
        loaded.localPath,
        safeDownloadName(loaded.attachment.name || path.basename(loaded.localPath)),
      )
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      res.status(500).json({ error: 'Server error.' })
    }
  },
)

// POST /posts/:id/attachments/zip — bundle a chosen subset of a post's
// attachments. One file streams directly; two or more are archived. Zip
// entries use STORE (level 0): PDFs and images are already compressed, so
// deflating them burns CPU for ~0% gain.
const ZIP_TOTAL_MAX_BYTES = 60 * 1024 * 1024

// `requireAuth` is already applied router-wide before this controller mounts
// (feed.routes.js), and is repeated here for the same reason the sibling
// attachment routes repeat it: the limiter below keys on req.user, so the
// dependency should be visible at the route rather than inferred from the
// mount order.
router.post('/posts/:id/attachments/zip', requireAuth, feedZipLimiter, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(postId) || postId < 1) {
    return sendError(res, 400, 'Invalid post id.', ERROR_CODES.BAD_REQUEST)
  }

  const rawIds = req.body?.attachmentIds
  if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > MAX_POST_ATTACHMENTS) {
    return sendError(
      res,
      400,
      `Select between 1 and ${MAX_POST_ATTACHMENTS} attachments.`,
      ERROR_CODES.BAD_REQUEST,
    )
  }
  const attachmentIds = []
  for (const raw of rawIds) {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isInteger(parsed) || parsed < 1) {
      return sendError(res, 400, 'Invalid attachment id.', ERROR_CODES.BAD_REQUEST)
    }
    attachmentIds.push(parsed)
  }

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, allowDownloads: true },
    })
    if (!post) return res.status(404).json({ error: 'Post not found.' })

    const isOwnerOrAdmin =
      req.user && (req.user.userId === post.userId || req.user.role === 'admin')
    if (!isOwnerOrAdmin && !post.allowDownloads) {
      return sendForbidden(res, 'Downloads are disabled for this post.')
    }

    // Scoping the query by postId is what stops an id from another post
    // being smuggled into the bundle.
    const rows = await prisma.feedPostAttachment.findMany({
      where: { id: { in: attachmentIds }, postId },
      orderBy: { position: 'asc' },
      select: { id: true, url: true, name: true, sizeBytes: true },
    })

    const files = []
    let totalBytes = 0
    for (const row of rows) {
      const localPath = resolveAttachmentPath(row.url)
      if (!localPath || !fs.existsSync(localPath)) continue
      const bytes = row.sizeBytes > 0 ? row.sizeBytes : fs.statSync(localPath).size
      totalBytes += bytes
      files.push({ localPath, name: safeDownloadName(row.name || path.basename(localPath)) })
    }

    if (files.length === 0) {
      return res.status(404).json({ error: 'No downloadable attachments found.' })
    }
    if (totalBytes > ZIP_TOTAL_MAX_BYTES) {
      return sendError(
        res,
        413,
        'That selection is too large to bundle. Download the files individually.',
        ERROR_CODES.BAD_REQUEST,
      )
    }
    if (files.length === 1) {
      return res.download(files[0].localPath, files[0].name)
    }

    const archive = new ZipArchive({ zlib: { level: 0 } })
    let failed = false
    archive.on('error', (err) => {
      failed = true
      log.error(
        { event: 'feed.zip_failed', postId, fileCount: files.length, err: err.message },
        'Attachment bundle failed mid-stream',
      )
      res.destroy()
    })

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="post-${postId}-attachments.zip"`)
    archive.pipe(res)

    // Two files can legitimately share a display name; zip readers handle
    // duplicates inconsistently, so disambiguate before appending.
    const usedNames = new Map()
    for (const file of files) {
      const seen = usedNames.get(file.name) || 0
      usedNames.set(file.name, seen + 1)
      const entryName = seen === 0 ? file.name : appendNameSuffix(file.name, seen)
      archive.file(file.localPath, { name: entryName })
    }
    await archive.finalize()

    if (!failed) {
      log.info(
        { event: 'feed.zip_created', postId, fileCount: files.length, totalBytes },
        'Attachment bundle streamed',
      )
    }
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    if (!res.headersSent) res.status(500).json({ error: 'Server error.' })
  }
})

router.delete('/posts/:id', feedWriteLimiter, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Invalid post id.' })

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, attachmentUrl: true },
    })
    if (!post) return res.status(404).json({ error: 'Post not found.' })
    if (
      !assertOwnerOrAdmin({
        res,
        user: req.user,
        ownerId: post.userId,
        message: 'Not your post.',
        targetType: 'feed-post',
        targetId: postId,
      })
    )
      return

    await prisma.feedPost.delete({ where: { id: postId } })
    await cleanupAttachmentIfUnused(prisma, post.attachmentUrl, {
      route: req.originalUrl,
      postId,
    })
    res.json({ message: 'Post deleted.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
