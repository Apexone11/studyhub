const express = require('express')
const rateLimit = require('express-rate-limit')
const fs = require('node:fs')
const path = require('node:path')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const { createNotification } = require('../lib/notify')
const { notifyMentionedUsers } = require('../lib/mentions')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../lib/authTokens')
const prisma = require('../lib/prisma')
const { cleanupAttachmentIfUnused, resolveAttachmentPath } = require('../lib/storage')

const router = express.Router()

const reactLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const sheetWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many sheet updates. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const commentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Too many comments. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const contributionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many contribution requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const contributionReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many contribution reviews. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const attachmentDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many attachment downloads. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

function optionalAuth(req, res, next) {
  const token = getAuthTokenFromRequest(req)
  if (!token) return next()
  try {
    req.user = verifyAuthToken(token)
  } catch {
    // Invalid token — proceed as unauthenticated.
  }
  next()
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function safeDownloadName(name, fallbackExt = '') {
  const ext = fallbackExt || path.extname(name || '')
  const base = String(name || 'studyhub-sheet')
    .replace(path.extname(String(name || '')), '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'studyhub-sheet'

  return `${base}${ext}`.toLowerCase()
}

function serializeContribution(contribution) {
  if (!contribution) return null

  return {
    id: contribution.id,
    status: contribution.status,
    message: contribution.message,
    createdAt: contribution.createdAt,
    updatedAt: contribution.updatedAt,
    reviewedAt: contribution.reviewedAt,
    proposer: contribution.proposer
      ? {
          id: contribution.proposer.id,
          username: contribution.proposer.username,
        }
      : null,
    reviewer: contribution.reviewer
      ? {
          id: contribution.reviewer.id,
          username: contribution.reviewer.username,
        }
      : null,
    forkSheet: contribution.forkSheet
      ? {
          id: contribution.forkSheet.id,
          title: contribution.forkSheet.title,
          updatedAt: contribution.forkSheet.updatedAt,
          author: contribution.forkSheet.author
            ? {
                id: contribution.forkSheet.author.id,
                username: contribution.forkSheet.author.username,
              }
            : null,
        }
      : null,
    targetSheetId: contribution.targetSheetId,
    forkSheetId: contribution.forkSheetId,
  }
}

function serializeSheet(sheet, { starred = false, reactions = null, commentCount = 0 } = {}) {
  const response = {
    ...sheet,
    starred,
    allowDownloads: sheet.allowDownloads !== false,
    hasAttachment: Boolean(sheet.attachmentUrl),
    attachmentName: sheet.attachmentName || null,
    attachmentUrl: null,
    commentCount,
  }

  if (reactions) {
    response.reactions = reactions
  }

  if (sheet.forkSource) {
    response.forkSource = {
      id: sheet.forkSource.id,
      title: sheet.forkSource.title,
      userId: sheet.forkSource.userId,
      author: sheet.forkSource.author
        ? {
            id: sheet.forkSource.author.id,
            username: sheet.forkSource.author.username,
          }
        : null,
    }
  }

  return response
}

async function fetchContributionCollections(sheet, currentUser) {
  const canReviewIncoming = currentUser && (currentUser.role === 'admin' || currentUser.userId === sheet.userId)
  const canSeeOutgoing = currentUser && (currentUser.role === 'admin' || currentUser.userId === sheet.userId)

  const [incomingContributions, outgoingContributions] = await Promise.all([
    canReviewIncoming
      ? prisma.sheetContribution.findMany({
          where: { targetSheetId: sheet.id },
          include: {
            proposer: { select: { id: true, username: true } },
            reviewer: { select: { id: true, username: true } },
            forkSheet: {
              select: {
                id: true,
                title: true,
                updatedAt: true,
                author: { select: { id: true, username: true } },
              },
            },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: 20,
        })
      : [],
    canSeeOutgoing
      ? prisma.sheetContribution.findMany({
          where: { forkSheetId: sheet.id },
          include: {
            proposer: { select: { id: true, username: true } },
            reviewer: { select: { id: true, username: true } },
            forkSheet: {
              select: {
                id: true,
                title: true,
                updatedAt: true,
                author: { select: { id: true, username: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [],
  ])

  return {
    incomingContributions: incomingContributions.map(serializeContribution),
    outgoingContributions: outgoingContributions.map(serializeContribution),
  }
}

router.get('/leaderboard', async (req, res) => {
  const type = req.query.type || 'stars'
  try {
    if (type === 'contributors') {
      const contributors = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          _count: { select: { studySheets: true } },
        },
        orderBy: { studySheets: { _count: 'desc' } },
        take: 5,
      })

      return res.json(contributors.map((user) => ({
        username: user.username,
        avatarUrl: user.avatarUrl || null,
        count: user._count.studySheets,
      })))
    }

    const orderField = type === 'downloads' ? 'downloads' : 'stars'
    const sheets = await prisma.studySheet.findMany({
      select: {
        id: true,
        title: true,
        stars: true,
        downloads: true,
        allowDownloads: true,
        author: { select: { id: true, username: true } },
        course: { select: { code: true } },
      },
      orderBy: { [orderField]: 'desc' },
      take: 5,
    })

    res.json(sheets)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.patch('/contributions/:contributionId', requireAuth, contributionReviewLimiter, async (req, res) => {
  const contributionId = Number.parseInt(req.params.contributionId, 10)
  const action = typeof req.body.action === 'string' ? req.body.action.trim().toLowerCase() : ''

  if (!Number.isInteger(contributionId)) {
    return res.status(400).json({ error: 'Contribution id must be an integer.' })
  }
  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "accept" or "reject".' })
  }

  try {
    const contribution = await prisma.sheetContribution.findUnique({
      where: { id: contributionId },
      include: {
        targetSheet: {
          select: { id: true, userId: true, title: true, attachmentUrl: true },
        },
        forkSheet: {
          select: {
            id: true,
            title: true,
            description: true,
            content: true,
            attachmentUrl: true,
            attachmentType: true,
            attachmentName: true,
            allowDownloads: true,
          },
        },
        proposer: { select: { id: true, username: true } },
      },
    })

    if (!contribution) {
      return res.status(404).json({ error: 'Contribution not found.' })
    }
    if (contribution.status !== 'pending') {
      return res.status(409).json({ error: 'This contribution has already been reviewed.' })
    }
    if (req.user.role !== 'admin' && req.user.userId !== contribution.targetSheet.userId) {
      return res.status(403).json({ error: 'Only the original author can review this contribution.' })
    }

    if (action === 'accept') {
      await prisma.studySheet.update({
        where: { id: contribution.targetSheetId },
        data: {
          description: contribution.forkSheet.description,
          content: contribution.forkSheet.content,
          attachmentUrl: contribution.forkSheet.attachmentUrl,
          attachmentType: contribution.forkSheet.attachmentType,
          attachmentName: contribution.forkSheet.attachmentName,
          allowDownloads: contribution.forkSheet.allowDownloads,
        },
      })

      if (contribution.targetSheet.attachmentUrl !== contribution.forkSheet.attachmentUrl) {
        await cleanupAttachmentIfUnused(prisma, contribution.targetSheet.attachmentUrl, {
          route: req.originalUrl,
          contributionId,
          targetSheetId: contribution.targetSheetId,
        })
      }
    }

    const updatedContribution = await prisma.sheetContribution.update({
      where: { id: contribution.id },
      data: {
        status: action === 'accept' ? 'accepted' : 'rejected',
        reviewerId: req.user.userId,
        reviewedAt: new Date(),
      },
      include: {
        proposer: { select: { id: true, username: true } },
        reviewer: { select: { id: true, username: true } },
        forkSheet: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
            author: { select: { id: true, username: true } },
          },
        },
      },
    })

    await createNotification(prisma, {
      userId: contribution.proposer.id,
      type: 'contribution',
      message: action === 'accept'
        ? `${req.user.username} accepted your contribution to "${contribution.targetSheet.title}".`
        : `${req.user.username} requested changes on your contribution to "${contribution.targetSheet.title}".`,
      actorId: req.user.userId,
      sheetId: contribution.targetSheet.id,
      linkPath: `/sheets/${contribution.targetSheet.id}`,
    })

    res.json({
      message: action === 'accept' ? 'Contribution accepted.' : 'Contribution rejected.',
      contribution: serializeContribution(updatedContribution),
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/', optionalAuth, async (req, res) => {
  const {
    courseId,
    schoolId,
    search,
    mine,
    starred,
    limit = 20,
    offset = 0,
    orderBy = 'createdAt',
  } = req.query

  try {
    const where = {}

    if (mine === '1') {
      if (!req.user) return res.status(401).json({ error: 'Login required.' })
      where.userId = req.user.userId
    }

    if (courseId) where.courseId = Number.parseInt(courseId, 10)
    if (schoolId) where.course = { schoolId: Number.parseInt(schoolId, 10) }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const allowedSort = ['createdAt', 'stars', 'downloads', 'forks', 'updatedAt']
    const sortField = allowedSort.includes(orderBy) ? orderBy : 'createdAt'
    const take = parsePositiveInt(limit, 20)
    const skip = Math.max(0, Number.parseInt(offset, 10) || 0)

    if (starred === '1') {
      if (!req.user) return res.status(401).json({ error: 'Login required.' })

      const starredRows = await prisma.starredSheet.findMany({
        where: { userId: req.user.userId },
        select: { sheetId: true },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      })
      const starredSheetIds = starredRows.map((row) => row.sheetId)
      const totalStarred = await prisma.starredSheet.count({ where: { userId: req.user.userId } })

      const sheets = await prisma.studySheet.findMany({
        where: { id: { in: starredSheetIds }, ...where },
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
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

      const comments = await prisma.comment.groupBy({
        by: ['sheetId'],
        where: { sheetId: { in: starredSheetIds } },
        _count: { _all: true },
      })
      const commentCountBySheetId = new Map(comments.map((row) => [row.sheetId, row._count._all]))

      const ordered = starredSheetIds
        .map((sheetId) => sheets.find((sheet) => sheet.id === sheetId))
        .filter(Boolean)
        .map((sheet) => serializeSheet(sheet, {
          starred: true,
          commentCount: commentCountBySheetId.get(sheet.id) || 0,
        }))

      return res.json({ sheets: ordered, total: totalStarred, limit: take, offset: skip })
    }

    const [sheets, total] = await Promise.all([
      prisma.studySheet.findMany({
        where,
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
          forkSource: {
            select: {
              id: true,
              title: true,
              userId: true,
              author: { select: { id: true, username: true } },
            },
          },
        },
        orderBy: { [sortField]: 'desc' },
        take,
        skip,
      }),
      prisma.studySheet.count({ where }),
    ])

    const sheetIds = sheets.map((sheet) => sheet.id)
    const [starredRows, commentRows] = await Promise.all([
      req.user
        ? prisma.starredSheet.findMany({
            where: { userId: req.user.userId, sheetId: { in: sheetIds } },
            select: { sheetId: true },
          })
        : [],
      sheetIds.length > 0
        ? prisma.comment.groupBy({
            by: ['sheetId'],
            where: { sheetId: { in: sheetIds } },
            _count: { _all: true },
          })
        : [],
    ])

    const starredIds = new Set(starredRows.map((row) => row.sheetId))
    const commentCountBySheetId = new Map(commentRows.map((row) => [row.sheetId, row._count._all]))

    res.json({
      sheets: sheets.map((sheet) => serializeSheet(sheet, {
        starred: starredIds.has(sheet.id),
        commentCount: commentCountBySheetId.get(sheet.id) || 0,
      })),
      total,
      limit: take,
      offset: skip,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/download', attachmentDownloadLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        title: true,
        content: true,
        allowDownloads: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!sheet.allowDownloads) {
      return res.status(403).json({ error: 'Downloads are disabled for this sheet.' })
    }

    await prisma.studySheet.update({
      where: { id: sheetId },
      data: { downloads: { increment: 1 } },
    })

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeDownloadName(sheet.title, '.md')}"`
    )
    res.send(sheet.content)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/attachment', attachmentDownloadLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        attachmentUrl: true,
        attachmentName: true,
        allowDownloads: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!sheet.attachmentUrl) return res.status(404).json({ error: 'Attachment not found.' })
    if (!sheet.allowDownloads) {
      return res.status(403).json({ error: 'Downloads are disabled for this sheet.' })
    }

    const localPath = resolveAttachmentPath(sheet.attachmentUrl)
    if (!localPath || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Attachment file is missing.' })
    }

    await prisma.studySheet.update({
      where: { id: sheetId },
      data: { downloads: { increment: 1 } },
    })

    res.download(localPath, safeDownloadName(sheet.attachmentName || path.basename(localPath), path.extname(localPath)))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id', optionalAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
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

    const [likeCount, dislikeCount, commentCount, starredRow, reactionRow, contributionCollections] = await Promise.all([
      prisma.reaction.count({ where: { sheetId, type: 'like' } }),
      prisma.reaction.count({ where: { sheetId, type: 'dislike' } }),
      prisma.comment.count({ where: { sheetId } }),
      req.user
        ? prisma.starredSheet.findUnique({
            where: { userId_sheetId: { userId: req.user.userId, sheetId } },
          })
        : null,
      req.user
        ? prisma.reaction.findUnique({
            where: { userId_sheetId: { userId: req.user.userId, sheetId } },
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

router.post('/', requireAuth, sheetWriteLimiter, async (req, res) => {
  const { title, content, courseId, forkOf, description, allowDownloads } = req.body || {}

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' })
  if (!content?.trim()) return res.status(400).json({ error: 'Content is required.' })
  if (!courseId) return res.status(400).json({ error: 'Course is required.' })

  try {
    const sheet = await prisma.studySheet.create({
      data: {
        title: title.trim().slice(0, 160),
        description: description?.trim().slice(0, 300) || '',
        content: content.trim(),
        courseId: Number.parseInt(courseId, 10),
        userId: req.user.userId,
        forkOf: forkOf ? Number.parseInt(forkOf, 10) : null,
        allowDownloads: allowDownloads !== false,
      },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
      },
    })

    res.status(201).json(serializeSheet(sheet))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.patch('/:id', requireAuth, sheetWriteLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  const { title, description, content, courseId, allowDownloads, removeAttachment } = req.body || {}

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        userId: true,
        attachmentUrl: true,
      },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your sheet.' })
    }

    const data = {}

    if (typeof title === 'string') {
      if (!title.trim()) return res.status(400).json({ error: 'Title is required.' })
      data.title = title.trim().slice(0, 160)
    }
    if (typeof description === 'string') {
      data.description = description.trim().slice(0, 300)
    }
    if (typeof content === 'string') {
      if (!content.trim()) return res.status(400).json({ error: 'Content is required.' })
      data.content = content.trim()
    }
    if (courseId) {
      data.courseId = Number.parseInt(courseId, 10)
    }
    if (typeof allowDownloads === 'boolean') {
      data.allowDownloads = allowDownloads
    }
    if (removeAttachment === true) {
      data.attachmentUrl = null
      data.attachmentType = null
      data.attachmentName = null
    }

    const updated = await prisma.studySheet.update({
      where: { id: sheetId },
      data,
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
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

    if (removeAttachment === true) {
      await cleanupAttachmentIfUnused(prisma, sheet.attachmentUrl, {
        route: req.originalUrl,
        sheetId,
      })
    }

    res.json(serializeSheet(updated))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/fork', requireAuth, sheetWriteLimiter, async (req, res) => {
  const originalId = Number.parseInt(req.params.id, 10)

  try {
    const original = await prisma.studySheet.findUnique({
      where: { id: originalId },
      select: {
        id: true,
        title: true,
        description: true,
        content: true,
        courseId: true,
        userId: true,
        attachmentUrl: true,
        attachmentType: true,
        attachmentName: true,
        allowDownloads: true,
      },
    })

    if (!original) return res.status(404).json({ error: 'Sheet not found.' })

    const forkTitle = typeof req.body.title === 'string' && req.body.title.trim()
      ? req.body.title.trim().slice(0, 160)
      : `${original.title} (fork)`

    const forked = await prisma.studySheet.create({
      data: {
        title: forkTitle,
        description: original.description || '',
        content: original.content,
        courseId: original.courseId,
        userId: req.user.userId,
        forkOf: original.id,
        attachmentUrl: original.attachmentUrl,
        attachmentType: original.attachmentType,
        attachmentName: original.attachmentName,
        allowDownloads: original.allowDownloads,
      },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
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

    await prisma.studySheet.update({
      where: { id: original.id },
      data: { forks: { increment: 1 } },
    })

    await createNotification(prisma, {
      userId: original.userId,
      type: 'fork',
      message: `${req.user.username} forked your sheet "${original.title}".`,
      actorId: req.user.userId,
      sheetId: original.id,
      linkPath: `/sheets/${original.id}`,
    })

    res.status(201).json(serializeSheet(forked))
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/contributions', requireAuth, contributionRateLimiter, async (req, res) => {
  const forkSheetId = Number.parseInt(req.params.id, 10)
  const message = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 500) : ''

  try {
    const forkSheet = await prisma.studySheet.findUnique({
      where: { id: forkSheetId },
      select: {
        id: true,
        title: true,
        userId: true,
        forkOf: true,
      },
    })

    if (!forkSheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!forkSheet.forkOf) {
      return res.status(400).json({ error: 'Only forked sheets can be contributed back.' })
    }
    if (forkSheet.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the fork owner can contribute changes.' })
    }

    const targetSheet = await prisma.studySheet.findUnique({
      where: { id: forkSheet.forkOf },
      select: { id: true, title: true, userId: true },
    })
    if (!targetSheet) return res.status(404).json({ error: 'Original sheet not found.' })
    if (targetSheet.userId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot contribute back to your own sheet.' })
    }

    const pending = await prisma.sheetContribution.findFirst({
      where: {
        targetSheetId: targetSheet.id,
        forkSheetId,
        status: 'pending',
      },
      select: { id: true },
    })
    if (pending) {
      return res.status(409).json({ error: 'This fork already has a pending contribution.' })
    }

    const contribution = await prisma.sheetContribution.create({
      data: {
        targetSheetId: targetSheet.id,
        forkSheetId,
        proposerId: req.user.userId,
        message,
      },
      include: {
        proposer: { select: { id: true, username: true } },
        reviewer: { select: { id: true, username: true } },
        forkSheet: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
            author: { select: { id: true, username: true } },
          },
        },
      },
    })

    await createNotification(prisma, {
      userId: targetSheet.userId,
      type: 'contribution',
      message: `${req.user.username} wants to contribute changes to "${targetSheet.title}".`,
      actorId: req.user.userId,
      sheetId: targetSheet.id,
      linkPath: `/sheets/${targetSheet.id}`,
    })

    res.status(201).json({ contribution: serializeContribution(contribution) })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/star', requireAuth, reactLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  const userId = req.user.userId

  try {
    const existing = await prisma.starredSheet.findUnique({
      where: { userId_sheetId: { userId, sheetId } },
    })

    if (existing) {
      await prisma.starredSheet.delete({
        where: { userId_sheetId: { userId, sheetId } },
      })

      const updatedSheet = await prisma.studySheet.update({
        where: { id: sheetId },
        data: { stars: { decrement: 1 } },
      })

      return res.json({ stars: Math.max(0, updatedSheet.stars), starred: false })
    }

    await prisma.starredSheet.create({ data: { userId, sheetId } })
    const updatedSheet = await prisma.studySheet.update({
      where: { id: sheetId },
      data: { stars: { increment: 1 } },
      include: { author: { select: { id: true } } },
    })

    await createNotification(prisma, {
      userId: updatedSheet.author.id,
      type: 'star',
      message: `${req.user.username} starred your sheet "${updatedSheet.title}".`,
      actorId: userId,
      sheetId,
      linkPath: `/sheets/${sheetId}`,
    })

    return res.json({ stars: updatedSheet.stars, starred: true })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/download', attachmentDownloadLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, allowDownloads: true },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!sheet.allowDownloads) {
      return res.status(403).json({ error: 'Downloads are disabled for this sheet.' })
    }

    const updated = await prisma.studySheet.update({
      where: { id: sheetId },
      data: { downloads: { increment: 1 } },
      select: { downloads: true },
    })

    res.json({ downloads: updated.downloads })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.delete('/:id', requireAuth, sheetWriteLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, attachmentUrl: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your sheet.' })
    }

    await prisma.studySheet.delete({ where: { id: sheetId } })
    await cleanupAttachmentIfUnused(prisma, sheet.attachmentUrl, {
      route: req.originalUrl,
      sheetId,
    })
    res.json({ message: 'Sheet deleted.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.get('/:id/comments', async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  const limit = parsePositiveInt(req.query.limit, 20)
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0)

  try {
    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { sheetId },
        include: { author: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.comment.count({ where: { sheetId } }),
    ])

    res.json({ comments, total, limit, offset })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

router.post('/:id/comments', requireAuth, commentLimiter, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''

  if (!content) return res.status(400).json({ error: 'Comment cannot be empty.' })
  if (content.length > 500) {
    return res.status(400).json({ error: 'Comment must be 500 characters or fewer.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, title: true },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })

    const comment = await prisma.comment.create({
      data: { content, sheetId, userId: req.user.userId },
      include: { author: { select: { id: true, username: true } } },
    })

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
  const userId = req.user.userId
  const { type } = req.body || {}

  if (type !== null && type !== 'like' && type !== 'dislike') {
    return res.status(400).json({ error: 'Reaction type must be "like", "dislike", or null.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true },
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })

    const existing = await prisma.reaction.findUnique({
      where: { userId_sheetId: { userId, sheetId } },
    })

    if (!type || (existing && existing.type === type)) {
      if (existing) {
        await prisma.reaction.delete({ where: { userId_sheetId: { userId, sheetId } } })
      }
    } else if (existing) {
      await prisma.reaction.update({
        where: { userId_sheetId: { userId, sheetId } },
        data: { type },
      })
    } else {
      await prisma.reaction.create({ data: { userId, sheetId, type } })
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
    if (comment.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your comment.' })
    }

    await prisma.comment.delete({ where: { id: comment.id } })
    res.json({ message: 'Comment deleted.' })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
