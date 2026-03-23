const express = require('express')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { createNotification } = require('../../lib/notify')
const { notifyMentionedUsers } = require('../../lib/mentions')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { isModerationEnabled, scanContent } = require('../../lib/moderationEngine')
const { parsePositiveInt } = require('../../core/http/validate')
const { reactLimiter, commentLimiter, feedWriteLimiter } = require('./feed.constants')
const { reactionSummary } = require('./feed.service')

const router = express.Router()

router.get('/posts/:id/comments', async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Invalid post id.' })
  const limit = parsePositiveInt(req.query.limit, 20)
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0)

  try {
    const [comments, total] = await Promise.all([
      prisma.feedPostComment.findMany({
        where: { postId },
        include: { author: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.feedPostComment.count({ where: { postId } }),
    ])

    res.json({ comments, total, limit, offset })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/posts/:id/comments', commentLimiter, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Invalid post id.' })
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''

  if (!content) return res.status(400).json({ error: 'Comment cannot be empty.' })
  if (content.length > 500) {
    return res.status(400).json({ error: 'Comment must be 500 characters or fewer.' })
  }

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      include: { author: { select: { id: true, username: true } } },
    })
    if (!post) return res.status(404).json({ error: 'Post not found.' })

    const comment = await prisma.feedPostComment.create({
      data: { content, postId, userId: req.user.userId },
      include: { author: { select: { id: true, username: true } } },
    })

    await createNotification(prisma, {
      userId: post.userId,
      type: 'comment',
      message: `${req.user.username} commented on your post.`,
      actorId: req.user.userId,
      linkPath: `/feed?post=${postId}`,
    })

    await notifyMentionedUsers(prisma, {
      text: content,
      actorId: req.user.userId,
      actorUsername: req.user.username,
      excludeUserIds: [post.userId],
      message: `${req.user.username} mentioned you in a comment on a post.`,
      linkPath: `/feed?post=${postId}`,
    })

    res.status(201).json(comment)

    /* Async content moderation — fire-and-forget after response is sent */
    if (isModerationEnabled()) {
      void scanContent({ contentType: 'feed_comment', contentId: comment.id, text: content, userId: req.user.userId })
    }
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/posts/:id/react', reactLimiter, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Invalid post id.' })
  const { type } = req.body || {}

  if (type !== null && type !== 'like' && type !== 'dislike') {
    return res.status(400).json({ error: 'Reaction type must be "like", "dislike", or null.' })
  }

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      select: { id: true },
    })
    if (!post) return res.status(404).json({ error: 'Post not found.' })

    const existing = await prisma.feedPostReaction.findUnique({
      where: { userId_postId: { userId: req.user.userId, postId } },
    })

    if (!type || (existing && existing.type === type)) {
      if (existing) {
        try {
          await prisma.feedPostReaction.delete({
            where: { userId_postId: { userId: req.user.userId, postId } },
          })
        } catch (error) {
          if (error?.code !== 'P2025') throw error
        }
      }
    } else if (existing) {
      await prisma.feedPostReaction.update({
        where: { userId_postId: { userId: req.user.userId, postId } },
        data: { type },
      })
    } else {
      await prisma.feedPostReaction.create({
        data: { userId: req.user.userId, postId, type },
      })
    }

    const [reactionRows, currentReactions] = await Promise.all([
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

    res.json(reactionSummary(reactionRows, 'postId', postId, currentReactions, 'postId'))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.delete('/posts/:id/comments/:commentId', feedWriteLimiter, async (req, res) => {
  const commentId = Number.parseInt(req.params.commentId, 10)
  if (!Number.isInteger(commentId)) return res.status(400).json({ error: 'Invalid comment id.' })

  try {
    const comment = await prisma.feedPostComment.findUnique({ where: { id: commentId } })
    if (!comment) return res.status(404).json({ error: 'Comment not found.' })
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: comment.userId,
      message: 'Not your comment.',
      targetType: 'feed-comment',
      targetId: commentId,
    })) return

    await prisma.feedPostComment.delete({ where: { id: commentId } })
    res.json({ message: 'Comment deleted.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
