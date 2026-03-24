const express = require('express')
const fs = require('node:fs')
const path = require('node:path')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { notifyMentionedUsers } = require('../../lib/mentions')
const { assertOwnerOrAdmin, sendForbidden } = require('../../lib/accessControl')
const { cleanupAttachmentIfUnused, resolveAttachmentPath } = require('../../lib/storage')
const { sendAttachmentPreview } = require('../../lib/attachmentPreview')
const { isModerationEnabled, scanContent } = require('../../lib/moderationEngine')
const requireAuth = require('../../middleware/auth')
const { feedWriteLimiter, attachmentDownloadLimiter } = require('./feed.constants')
const { formatFeedPostDetail, safeDownloadName } = require('./feed.service')

const router = express.Router()

router.post('/posts', feedWriteLimiter, async (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''
  const courseId = req.body.courseId ? Number.parseInt(req.body.courseId, 10) : null
  const allowDownloads = req.body.allowDownloads !== false

  if (!content) return res.status(400).json({ error: 'Post content is required.' })
  if (content.length > 2000) {
    return res.status(400).json({ error: 'Post content must be 2000 characters or fewer.' })
  }

  try {
    const post = await prisma.feedPost.create({
      data: {
        content,
        userId: req.user.userId,
        courseId: courseId || null,
        allowDownloads,
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        course: { select: { id: true, code: true } },
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
      void scanContent({ contentType: 'feed_post', contentId: post.id, text: content, userId: req.user.userId })
    }
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
        attachmentUrl: true,
        attachmentName: true,
        allowDownloads: true,
      },
    })

    if (!post) return res.status(404).json({ error: 'Post not found.' })
    if (!post.attachmentUrl) return res.status(404).json({ error: 'Attachment not found.' })
    if (!post.allowDownloads) {
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

router.get('/posts/:id/attachment/preview', requireAuth, attachmentDownloadLimiter, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Invalid post id.' })

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        attachmentUrl: true,
        attachmentName: true,
        attachmentType: true,
        allowDownloads: true,
      },
    })

    if (!post) return res.status(404).json({ error: 'Post not found.' })
    if (!post.attachmentUrl) return res.status(404).json({ error: 'Attachment not found.' })
    if (!post.allowDownloads) {
      return sendForbidden(res, 'Downloads are disabled for this post.')
    }

    const localPath = resolveAttachmentPath(post.attachmentUrl)
    if (!localPath || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Attachment file is missing.' })
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
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: post.userId,
      message: 'Not your post.',
      targetType: 'feed-post',
      targetId: postId,
    })) return

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
