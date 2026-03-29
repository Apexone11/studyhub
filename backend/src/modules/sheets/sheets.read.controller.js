const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const optionalAuth = require('../../core/auth/optionalAuth')
const { AUTHOR_SELECT } = require('./sheets.constants')
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
          author: { select: AUTHOR_SELECT },
          course: { include: { school: true } },
          htmlVersions: true,
          forkSource: {
            select: {
              id: true,
              title: true,
              userId: true,
              author: { select: AUTHOR_SELECT },
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
        userId ? prisma.starredSheet.findUnique({ where: { userId_sheetId: { userId, sheetId } }, select: { userId: true } }) : null
      ),
      timedSection('userReaction', () =>
        userId ? prisma.reaction.findUnique({ where: { userId_sheetId: { userId, sheetId } }, select: { type: true } }) : null
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

/* ── GET /:id/readme — lightweight readme extras (contributors + latest commit) ── */
const readmeLimiter = require('express-rate-limit')({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

router.get('/:id/readme', readmeLimiter, optionalAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) return res.status(400).json({ error: 'Invalid sheet id.' })

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true, userId: true, status: true, visibility: true, courseId: true,
        author: { select: AUTHOR_SELECT },
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) return res.status(404).json({ error: 'Sheet not found.' })

    /* Fetch contributors (unique users from accepted contributions) and latest commit in parallel */
    const [acceptedContributions, latestCommit, forkCount] = await Promise.all([
      prisma.sheetContribution.findMany({
        where: { targetSheetId: sheetId, status: 'accepted' },
        select: { proposer: { select: AUTHOR_SELECT } },
        orderBy: { reviewedAt: 'desc' },
        take: 20,
      }),
      prisma.sheetCommit.findFirst({
        where: { sheetId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          message: true,
          checksum: true,
          createdAt: true,
          author: { select: AUTHOR_SELECT },
        },
      }),
      prisma.studySheet.count({ where: { forkOf: sheetId } }),
    ])

    /* Deduplicate contributors by user ID, include sheet author first */
    const seen = new Set()
    const contributors = []

    /* Author is always the first contributor */
    if (sheet.author) {
      seen.add(sheet.author.id)
      contributors.push(sheet.author)
    }

    for (const contrib of acceptedContributions) {
      if (contrib.proposer && !seen.has(contrib.proposer.id)) {
        seen.add(contrib.proposer.id)
        contributors.push(contrib.proposer)
      }
    }

    res.json({
      contributors,
      latestCommit: latestCommit
        ? {
            id: latestCommit.id,
            message: latestCommit.message,
            checksum: latestCommit.checksum ? latestCommit.checksum.slice(0, 7) : null,
            createdAt: latestCommit.createdAt,
            author: latestCommit.author,
          }
        : null,
      forkCount,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
