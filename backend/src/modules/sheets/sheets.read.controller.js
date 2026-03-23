const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const optionalAuth = require('../../core/auth/optionalAuth')
const { canReadSheet } = require('./sheets.service')
const { serializeSheet, fetchContributionCollections } = require('./sheets.serializer')

const router = express.Router()

router.get('/:id', optionalAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
        htmlVersions: true,
        forkSource: {
          select: {
            id: true,
            title: true,
            userId: true,
            author: { select: { id: true, username: true } },
          },
        },
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })

    const userId = req.user?.userId
    const [likeCount, dislikeCount, commentCount, starredRow, reactionRow, contributionCollections] = await Promise.all([
      prisma.reaction.count({ where: { sheetId, type: 'like' } }),
      prisma.reaction.count({ where: { sheetId, type: 'dislike' } }),
      prisma.comment.count({ where: { sheetId } }),
      userId
        ? prisma.starredSheet.findUnique({
            where: { userId_sheetId: { userId, sheetId } },
          })
        : null,
      userId
        ? prisma.reaction.findUnique({
            where: { userId_sheetId: { userId, sheetId } },
          })
        : null,
      fetchContributionCollections(sheet, req.user || null),
    ])

    res.json({
      ...serializeSheet(sheet, {
        starred: Boolean(starredRow),
        commentCount,
        reactions: {
          likes: likeCount,
          dislikes: dislikeCount,
          userReaction: reactionRow ? reactionRow.type : null,
        },
      }),
      ...contributionCollections,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
