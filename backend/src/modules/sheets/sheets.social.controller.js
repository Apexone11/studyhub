const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const requireVerifiedEmail = require('../../core/auth/requireVerifiedEmail')
const { parsePositiveInt } = require('../../core/http/validate')
const { assertOwnerOrAdmin, sendForbidden } = require('../../lib/accessControl')
const { createNotification } = require('../../lib/notify')
const { notifyMentionedUsers } = require('../../lib/mentions')
const { SHEET_STATUS, reactLimiter, commentLimiter } = require('./sheets.constants')
const { canReadSheet } = require('./sheets.service')
const { trackActivity } = require('../../lib/activityTracker')
const { timedSection, logTiming } = require('../../lib/requestTiming')

const router = express.Router()

router.post('/:id/star', requireAuth, reactLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })
  const userId = req.user.userId

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

  try {
    const sheetSection = await timedSection('sheet-lookup', () =>
      prisma.studySheet.findUnique({ where: { id: sheetId }, select: { id: true, status: true, userId: true } })
    )
    const sheet = sheetSection.data
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })

    const [commentsSection, countSection] = await Promise.all([
      timedSection('comments', () =>
        prisma.comment.findMany({
          where: { sheetId, moderationStatus: 'clean' },
          include: { author: { select: { id: true, username: true } } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        })
      ),
      timedSection('count', () => prisma.comment.count({ where: { sheetId, moderationStatus: 'clean' } })),
    ])

    logTiming(req, {
      sections: [sheetSection, commentsSection, countSection],
      extra: { sheetId, commentCount: countSection.data },
    })

    res.json({ comments: commentsSection.data, total: countSection.data, limit, offset })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/comments', requireAuth, requireVerifiedEmail, commentLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''

  if (!content) return res.status(400).json({ error: 'Comment cannot be empty.' })
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

    const comment = await prisma.comment.create({
      data: { content, sheetId, userId: req.user.userId },
      include: { author: { select: { id: true, username: true } } },
    })

    trackActivity(prisma, req.user.userId, 'comments')

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

    res.status(201).json(comment)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/react', requireAuth, reactLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })
  const userId = req.user.userId
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

module.exports = router
