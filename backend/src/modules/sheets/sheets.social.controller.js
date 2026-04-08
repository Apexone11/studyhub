const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const requireVerifiedEmail = require('../../core/auth/requireVerifiedEmail')
const { parsePositiveInt } = require('../../core/http/validate')
const { assertOwnerOrAdmin, sendForbidden } = require('../../lib/accessControl')
const { createNotification } = require('../../lib/notify')
const { notifyMentionedUsers } = require('../../lib/mentions')
const { SHEET_STATUS, AUTHOR_SELECT, reactLimiter, commentLimiter } = require('./sheets.constants')
const { canReadSheet } = require('./sheets.service')
const { getInitialModerationStatus } = require('../../lib/trustGate')
const { trackActivity } = require('../../lib/activityTracker')
const { timedSection, logTiming } = require('../../lib/requestTiming')
const { commentReactLimiter } = require('../../lib/rateLimiters')
const { normalizeCommentGifAttachments } = require('../../lib/commentGifAttachments')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')

const router = express.Router()

router.post('/:id/star', requireAuth, reactLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })
  const { userId } = req.user

  try {
    const existing = await prisma.starredSheet.findUnique({
      where: { userId_sheetId: { userId, sheetId } },
    })

    const visibility = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, status: true, title: true },
    })
    if (!visibility) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(visibility, req.user)) return res.status(404).json({ error: 'Sheet not found.' })
    if (visibility.status !== SHEET_STATUS.PUBLISHED) {
      return sendForbidden(res, 'You can only star published sheets.')
    }

    let createdStar = false

    if (existing) {
      try {
        await prisma.starredSheet.delete({
          where: { userId_sheetId: { userId, sheetId } },
        })
      } catch (error) {
        if (error?.code !== 'P2025') {
          throw error
        }
      }
    } else {
      try {
        await prisma.starredSheet.create({ data: { userId, sheetId } })
        createdStar = true
      } catch (error) {
        if (error?.code !== 'P2002') {
          throw error
        }
      }
    }

    const [starCount, currentStar] = await Promise.all([
      prisma.starredSheet.count({ where: { sheetId } }),
      prisma.starredSheet.findUnique({
        where: { userId_sheetId: { userId, sheetId } },
      }),
    ])

    await prisma.studySheet.update({
      where: { id: sheetId },
      data: { stars: starCount },
    })

    if (createdStar) {
      await createNotification(prisma, {
        userId: visibility.userId,
        type: 'star',
        message: `${req.user.username} starred your sheet "${visibility.title || 'sheet'}".`,
        actorId: userId,
        sheetId,
        linkPath: `/sheets/${sheetId}`,
      })
    }

    return res.json({ stars: starCount, starred: Boolean(currentStar) })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/comments', async (req, res) => {
  req._timingStart = Date.now()
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })
  const limit = parsePositiveInt(req.query.limit, 20)
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0)
  const sort = req.query.sort || 'newest' // 'newest', 'oldest', 'top'

  try {
    const sheetSection = await timedSection('sheet-lookup', () =>
      prisma.studySheet.findUnique({ where: { id: sheetId }, select: { id: true, status: true, userId: true } })
    )
    const sheet = sheetSection.data
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })

    let orderBy = { createdAt: 'desc' }
    if (sort === 'oldest') {
      orderBy = { createdAt: 'asc' }
    } else if (sort === 'top') {
      // Will handle custom sorting below
      orderBy = { createdAt: 'desc' }
    }

    const [commentsSection, countSection] = await Promise.all([
      timedSection('comments', () =>
        prisma.comment.findMany({
          where: { sheetId, parentId: null },
          include: {
            author: { select: AUTHOR_SELECT },
            reactions: {
              select: { userId: true, type: true },
            },
            attachments: {
              select: { id: true, url: true, type: true, name: true, createdAt: true },
            },
            replies: {
              include: {
                author: { select: AUTHOR_SELECT },
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
      timedSection('count', () => prisma.comment.count({ where: { sheetId, parentId: null } })),
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
      sections: [sheetSection, commentsSection, countSection],
      extra: { sheetId, commentCount: countSection.data },
    })

    res.json({ comments, total: countSection.data, limit, offset })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/comments', requireAuth, requireVerifiedEmail, commentLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })
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
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, title: true, status: true },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })

    // Validate parentId if provided (max 1 level deep)
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, sheetId: true, parentId: true },
      })
      if (!parentComment) return res.status(400).json({ error: 'Parent comment not found.' })
      if (parentComment.sheetId !== sheetId) return res.status(400).json({ error: 'Parent comment belongs to different sheet.' })
      if (parentComment.parentId !== null) return res.status(400).json({ error: 'Cannot reply to replies (max 1 level deep).' })
    }

    const moderationStatus = getInitialModerationStatus(req.user)
    const comment = await prisma.comment.create({
      data: {
        content,
        sheetId,
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
        author: { select: AUTHOR_SELECT },
        attachments: { select: { id: true, url: true, type: true, name: true } },
      },
    })

    trackActivity(prisma, req.user.userId, 'comments')

    // Only notify sheet author if it's a top-level comment
    if (!parentId) {
      await createNotification(prisma, {
        userId: sheet.userId,
        type: 'comment',
        message: `${req.user.username} commented on your sheet "${sheet.title}".`,
        actorId: req.user.userId,
        sheetId,
        linkPath: `/sheets/${sheetId}`,
      })

      await notifyMentionedUsers(prisma, {
        text: content,
        actorId: req.user.userId,
        actorUsername: req.user.username,
        excludeUserIds: [sheet.userId],
        message: `${req.user.username} mentioned you in a comment on "${sheet.title}".`,
        linkPath: `/sheets/${sheetId}`,
      })
    } else {
      // Notify parent comment author if it's a reply
      const parentCommentData = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { userId: true },
      })
      if (parentCommentData && parentCommentData.userId !== req.user.userId) {
        await createNotification(prisma, {
          userId: parentCommentData.userId,
          type: 'reply',
          message: `${req.user.username} replied to your comment.`,
          actorId: req.user.userId,
          linkPath: `/sheets/${sheetId}`,
        })
      }
    }

    res.status(201).json(comment)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/react', requireAuth, reactLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })
  const { userId } = req.user
  const { type } = req.body || {}

  if (type !== null && type !== 'like' && type !== 'dislike') {
    return res.status(400).json({ error: 'Reaction type must be "like", "dislike", or null.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, status: true },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.status !== SHEET_STATUS.PUBLISHED) {
      return sendForbidden(res, 'Reactions are disabled until the sheet is published.')
    }

    const existing = await prisma.reaction.findUnique({
      where: { userId_sheetId: { userId, sheetId } },
    })

    if (!type || (existing && existing.type === type)) {
      if (existing) {
        try {
          await prisma.reaction.delete({ where: { userId_sheetId: { userId, sheetId } } })
        } catch (error) {
          if (error?.code !== 'P2025') {
            throw error
          }
        }
      }
    } else {
      await prisma.reaction.upsert({
        where: { userId_sheetId: { userId, sheetId } },
        update: { type },
        create: { userId, sheetId, type },
      })
    }

    const [likes, dislikes, current] = await Promise.all([
      prisma.reaction.count({ where: { sheetId, type: 'like' } }),
      prisma.reaction.count({ where: { sheetId, type: 'dislike' } }),
      prisma.reaction.findUnique({
        where: { userId_sheetId: { userId, sheetId } },
      }),
    ])

    res.json({ likes, dislikes, userReaction: current ? current.type : null })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/comments/:commentId/react', requireAuth, commentReactLimiter, async (req, res) => {
  const commentId = Number.parseInt(req.params.commentId, 10)
  const { userId } = req.user
  const { type } = req.body || {}

  if (!type || (type !== 'like' && type !== 'dislike')) {
    return res.status(400).json({ error: 'Reaction type must be "like" or "dislike".' })
  }

  try {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, sheetId: true },
    })
    if (!comment) return res.status(404).json({ error: 'Comment not found.' })

    // Verify sheet is readable
    const sheet = await prisma.studySheet.findUnique({
      where: { id: comment.sheetId },
      select: { id: true, status: true, userId: true },
    })
    if (!sheet || !canReadSheet(sheet, req.user)) {
      return res.status(404).json({ error: 'Comment not found.' })
    }

    const existing = await prisma.commentReaction.findUnique({
      where: { userId_commentId: { userId, commentId } },
    })

    // Toggle logic: if same type, remove; if different, update; if none, create
    if (existing && existing.type === type) {
      await prisma.commentReaction.delete({
        where: { userId_commentId: { userId, commentId } },
      })
    } else if (existing) {
      await prisma.commentReaction.update({
        where: { userId_commentId: { userId, commentId } },
        data: { type },
      })
    } else {
      await prisma.commentReaction.create({
        data: { userId, commentId, type },
      })
    }

    // Get updated counts
    const [likes, dislikes, userReaction] = await Promise.all([
      prisma.commentReaction.count({ where: { commentId, type: 'like' } }),
      prisma.commentReaction.count({ where: { commentId, type: 'dislike' } }),
      prisma.commentReaction.findUnique({
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

router.delete('/:id/comments/:commentId', requireAuth, commentLimiter, async (req, res) => {
  const commentId = Number.parseInt(req.params.commentId, 10)

  try {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment) return res.status(404).json({ error: 'Comment not found.' })
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: comment.userId,
      message: 'Not your comment.',
      targetType: 'sheet-comment',
      targetId: commentId,
    })) return

    await prisma.comment.delete({ where: { id: comment.id } })
    res.json({ message: 'Comment deleted.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /:id/comments/:commentId ── edit comment content
router.patch('/:id/comments/:commentId', requireAuth, commentLimiter, async (req, res) => {
  try {
    const sheetId = Number(req.params.id)
    const commentId = Number(req.params.commentId)
    const { content } = req.body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return sendError(res, 400, 'Comment content is required.', ERROR_CODES.VALIDATION)
    }
    if (content.length > 500) {
      return sendError(res, 400, 'Comment must be 500 characters or fewer.', ERROR_CODES.VALIDATION)
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, sheetId: true, createdAt: true },
    })

    if (!comment || comment.sheetId !== sheetId) {
      return sendError(res, 404, 'Comment not found.', ERROR_CODES.NOT_FOUND)
    }
    if (comment.userId !== req.user.userId) {
      return sendError(res, 403, 'You can only edit your own comments.', ERROR_CODES.FORBIDDEN)
    }

    const fifteenMinutes = 15 * 60 * 1000
    if (Date.now() - new Date(comment.createdAt).getTime() > fifteenMinutes) {
      return sendError(res, 403, 'Can only edit comments within 15 minutes.', ERROR_CODES.FORBIDDEN)
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: {
        author: { select: AUTHOR_SELECT },
      },
    })

    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    sendError(res, 500, 'Failed to edit comment.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
