const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const optionalAuth = require('../../core/auth/optionalAuth')
const { canReadSheet } = require('./sheets.service')
const { serializeSheet, fetchContributionCollections } = require('./sheets.serializer')
const { timedSection, logTiming } = require('../../lib/requestTiming')

const router = express.Router()

router.get('/:id', optionalAuth, async (req, res) => {
  req._timingStart = Date.now()
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })

  try {
    const mainSection = await timedSection('sheet-main', () =>
      prisma.studySheet.findUnique({
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
    )
    const sheet = mainSection.data

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })

    const userId = req.user?.userId
    const enrichSections = await Promise.all([
      timedSection('likes', () => prisma.reaction.count({ where: { sheetId, type: 'like' } })),
      timedSection('dislikes', () => prisma.reaction.count({ where: { sheetId, type: 'dislike' } })),
      timedSection('commentCount', () => prisma.comment.count({ where: { sheetId } })),
      timedSection('starred', () =>
        userId ? prisma.starredSheet.findUnique({ where: { userId_sheetId: { userId, sheetId } } }) : null
      ),
      timedSection('userReaction', () =>
        userId ? prisma.reaction.findUnique({ where: { userId_sheetId: { userId, sheetId } } }) : null
      ),
      timedSection('contributions', () => fetchContributionCollections(sheet, req.user || null)),
    ])

    const [likeSection, dislikeSection, commentSection, starredSection, reactionSection, contribSection] = enrichSections
    const allSections = [mainSection, ...enrichSections]

    const isOwner = req.user && (req.user.userId === sheet.userId || req.user.role === 'admin')
    logTiming(req, {
      sections: allSections,
      extra: { sheetId, isOwner: Boolean(isOwner) },
    })

    res.json({
      ...serializeSheet(sheet, {
        starred: Boolean(starredSection.data),
        commentCount: commentSection.data,
        reactions: {
          likes: likeSection.data,
          dislikes: dislikeSection.data,
          userReaction: reactionSection.data ? reactionSection.data.type : null,
        },
      }),
      ...contribSection.data,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
