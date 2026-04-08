const express = require('express')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { createNotification } = require('../../lib/notify')
const { notifyMentionedUsers } = require('../../lib/mentions')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { isModerationEnabled, scanContent } = require('../../lib/moderation/moderationEngine')
const { parsePositiveInt } = require('../../core/http/validate')
const { reactLimiter, commentLimiter, feedWriteLimiter } = require('./feed.constants')
const { reactionSummary } = require('./feed.service')
const { getInitialModerationStatus } = require('../../lib/trustGate')
const { timedSection, logTiming } = require('../../lib/requestTiming')
const { runAbuseChecks } = require('../../lib/abuseDetection')
const { commentReactLimiter } = require('../../lib/rateLimiters')
const { normalizeCommentGifAttachments } = require('../../lib/commentGifAttachments')
const requireAuth = require('../../core/auth/requireAuth')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')

const router = express.Router()

router.get('/posts/:id/comments', async (req, res) => {
  req._timingStart = Date.now()
  const postId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Invalid post id.' })
  const limit = parsePositiveInt(req.query.limit, 20)
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0)
  const sort = req.query.sort || 'newest' // 'newest', 'oldest', 'top'

  try {
    let orderBy = { createdAt: 'desc' }
    if (sort === 'oldest') {
      orderBy = { createdAt: 'asc' }
    } else if (sort === 'top') {
      // Will handle custom sorting below
      orderBy = { createdAt: 'desc' }
    }

    const [commentsSection, countSection] = await Promise.all([
      timedSection('comments', () =>
        prisma.feedPostComment.findMany({
          where: { postId, parentId: null },
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } },
            reactions: {
              select: { userId: true, type: true },
            },
            attachments: {
              select: { id: true, url: true, type: true, name: true, createdAt: true },
            },
            replies: {
              include: {
                author: { select: { id: true, username: true, avatarUrl: true } },
                reactions: {
                  select: { userId: true, type: true },
                },
                attachments: {
                  select: { id: true, url: true, type: true, name: true, createdAt: true },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy,
          take: limit,
          skip: offset,
        })
      ),
      timedSection('count', () =>
        prisma.feedPostComment.count({ where: { postId, parentId: null } })
      ),
    ])

    const formatComment = (comment) => {
      const likes = comment.reactions.filter((r) => r.type === 'like').length
      const dislikes = comment.reactions.filter((r) => r.type === 'dislike').length
      const userReaction = req.user
        ? comment.reactions.find((r) => r.userId === req.user.userId)?.type || null
        : null

      const formattedReplies = (comment.replies || []).map(formatComment)

      return {
        ...comment,
        reactions: undefined,
        replies: formattedReplies,
        _count: { reactions: likes + dislikes },
        reactionCounts: { like: likes, dislike: dislikes },
        userReaction,
        replyCount: formattedReplies.length,
      }
    }

    const comments = commentsSection.data.map(formatComment)

    // For "top" sort, sort by net likes (likes - dislikes) descending
    if (sort === 'top') {
      comments.sort((a, b) => {
        const netA = a.reactionCounts.like - a.reactionCounts.dislike
        const netB = b.reactionCounts.like - b.reactionCounts.dislike
        if (netB !== netA) return netB - netA
        return b.createdAt - a.createdAt
      })
    }

    logTiming(req, {
      sections: [commentsSection, countSection],
      extra: { postId, commentCount: countSection.data },
    })

    res.json({ comments, total: countSection.data, limit, offset })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/posts/:id/comments', requireAuth, commentLimiter, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Invalid post id.' })
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''
  const parentId = req.body.parentId ? Number.parseInt(req.body.parentId, 10) : null
  const attachmentValidation = normalizeCommentGifAttachments(req.body.attachments)

  if (attachmentValidation.error) {
    return sendError(res, 400, attachmentValidation.error, ERROR_CODES.BAD_REQUEST)
  }

  const { attachments } = attachmentValidation

  if (!content && attachments.length === 0) return res.status(400).json({ error: 'Comment cannot be empty.' })
  if (content.length > 500) {
    return res.status(400).json({ error: 'Comment must be 500 characters or fewer.' })
  }

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: postId },
      include: { author: { select: { id: true, username: true } } },
    })
    if (!post) return res.status(404).json({ error: 'Post not found.' })

    // Validate parentId if provided (max 1 level deep)
    if (parentId) {
      const parentComment = await prisma.feedPostComment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true, parentId: true },
      })
      if (!parentComment) return res.status(400).json({ error: 'Parent comment not found.' })
      if (parentComment.postId !== postId) return res.status(400).json({ error: 'Parent comment belongs to different post.' })
      if (parentComment.parentId !== null) return res.status(400).json({ error: 'Cannot reply to replies (max 1 level deep).' })
    }

    const moderationStatus = getInitialModerationStatus(req.user)
    const comment = await prisma.feedPostComment.create({
      data: {
        content,
        postId,
        userId: req.user.userId,
        parentId: parentId || null,
        moderationStatus,
        attachments: attachments.length > 0 ? {
          create: attachments.map((att) => ({
            url: att.url,
            type: att.type,
            name: att.name || '',
          })),
        } : undefined,
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        attachments: { select: { id: true, url: true, type: true, name: true } },
      },
    })

    // Only notify post author if it's a top-level comment
    if (!parentId) {
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
    } else {
      // Notify parent comment author if it's a reply
      const parentCommentData = await prisma.feedPostComment.findUnique({
        where: { id: parentId },
        select: { userId: true },
      })
      if (parentCommentData && parentCommentData.userId !== req.user.userId) {
        await createNotification(prisma, {
          userId: parentCommentData.userId,
          type: 'reply',
          message: `${req.user.username} replied to your comment.`,
          actorId: req.user.userId,
          linkPath: `/feed?post=${postId}`,
        })
      }
    }

    res.status(201).json(comment)

    /* Async content moderation — fire-and-forget after response is sent */
    if (isModerationEnabled()) {
      void scanContent({ contentType: 'feed_comment', contentId: comment.id, text: content, userId: req.user.userId })
    }

    /* Abuse detection (fire-and-forget) */
    void runAbuseChecks({
      userId: req.user.userId,
      actionType: 'comment_create',
      contentType: 'feed_comment',
      contentId: comment.id,
      text: content,
    })
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

router.post('/posts/:id/comments/:commentId/react', requireAuth, commentReactLimiter, async (req, res) => {
  const commentId = Number.parseInt(req.params.commentId, 10)
  const { userId } = req.user
  const { type } = req.body || {}

  if (!type || (type !== 'like' && type !== 'dislike')) {
    return res.status(400).json({ error: 'Reaction type must be "like" or "dislike".' })
  }

  try {
    const comment = await prisma.feedPostComment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true },
    })
    if (!comment) return res.status(404).json({ error: 'Comment not found.' })

    const existing = await prisma.feedPostCommentReaction.findUnique({
      where: { userId_commentId: { userId, commentId } },
    })

    // Toggle logic: if same type, remove; if different, update; if none, create
    if (existing && existing.type === type) {
      await prisma.feedPostCommentReaction.delete({
        where: { userId_commentId: { userId, commentId } },
      })
    } else if (existing) {
      await prisma.feedPostCommentReaction.update({
        where: { userId_commentId: { userId, commentId } },
        data: { type },
      })
    } else {
      await prisma.feedPostCommentReaction.create({
        data: { userId, commentId, type },
      })
    }

    // Get updated counts
    const [likes, dislikes, userReaction] = await Promise.all([
      prisma.feedPostCommentReaction.count({ where: { commentId, type: 'like' } }),
      prisma.feedPostCommentReaction.count({ where: { commentId, type: 'dislike' } }),
      prisma.feedPostCommentReaction.findUnique({
        where: { userId_commentId: { userId, commentId } },
      }),
    ])

    res.json({
      reactionCounts: { like: likes, dislike: dislikes },
      userReaction: userReaction ? userReaction.type : null,
    })
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

// ── PATCH /posts/:id/comments/:commentId ── edit comment content
router.patch('/posts/:id/comments/:commentId', requireAuth, commentLimiter, async (req, res) => {
  try {
    const postId = Number(req.params.id)
    const commentId = Number(req.params.commentId)
    const { content } = req.body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return sendError(res, 400, 'Comment content is required.', ERROR_CODES.VALIDATION)
    }
    if (content.length > 500) {
      return sendError(res, 400, 'Comment must be 500 characters or fewer.', ERROR_CODES.VALIDATION)
    }

    const comment = await prisma.feedPostComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, postId: true, createdAt: true },
    })

    if (!comment || comment.postId !== postId) {
      return sendError(res, 404, 'Comment not found.', ERROR_CODES.NOT_FOUND)
    }
    if (comment.userId !== req.user.userId) {
      return sendError(res, 403, 'You can only edit your own comments.', ERROR_CODES.FORBIDDEN)
    }

    const fifteenMinutes = 15 * 60 * 1000
    if (Date.now() - new Date(comment.createdAt).getTime() > fifteenMinutes) {
      return sendError(res, 403, 'Can only edit comments within 15 minutes.', ERROR_CODES.FORBIDDEN)
    }

    const updated = await prisma.feedPostComment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Failed to edit comment.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
