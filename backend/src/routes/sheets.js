const express = require('express')
const rateLimit = require('express-rate-limit')
const { PrismaClient } = require('@prisma/client')
const requireAuth = require('../middleware/auth')
const { captureError } = require('../monitoring/sentry')
const { createNotification } = require('../lib/notify')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../lib/authTokens')

const router = express.Router()
const prisma = new PrismaClient()

const reactLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limit for posting comments: 10 per 5 min per IP
const commentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Too many comments. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Optional auth — attaches req.user if token present, but doesn't block
function optionalAuth(req, res, next) {
  const token = getAuthTokenFromRequest(req)
  if (!token) return next()
  try {
    req.user = verifyAuthToken(token)
  } catch {
    // Invalid token — proceed as unauthenticated
  }
  next()
}

// ── GET leaderboard (must be before /:id) ─────────────────────
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
      return res.json(contributors.map(u => ({
        username: u.username,
        avatarUrl: u.avatarUrl || null,
        count: u._count.studySheets,
      })))
    }

    const orderField = type === 'downloads' ? 'downloads' : 'stars'
    const sheets = await prisma.studySheet.findMany({
      select: {
        id: true,
        title: true,
        stars: true,
        downloads: true,
        author: { select: { id: true, username: true } },
        course: { select: { code: true } },
      },
      orderBy: { [orderField]: 'desc' },
      take: 5,
    })
    res.json(sheets)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET all sheets (with optional filters) ────────────────────
router.get('/', optionalAuth, async (req, res) => {
  const {
    courseId, schoolId, search,
    mine, starred,
    limit   = 20,
    offset  = 0,
    orderBy = 'createdAt',
  } = req.query

  try {
    const where = {}

    // mine=1 — only the authenticated user's own sheets
    if (mine === '1') {
      if (!req.user) return res.status(401).json({ error: 'Login required.' })
      where.userId = req.user.userId
    }

    if (courseId) where.courseId = parseInt(courseId)
    if (schoolId) where.course   = { schoolId: parseInt(schoolId) }
    if (search)   where.OR = [
      { title:   { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
    ]

    const ALLOWED_SORT = ['createdAt', 'stars', 'downloads', 'forks']
    const sortField = ALLOWED_SORT.includes(orderBy) ? orderBy : 'createdAt'

    // starred=1 — only sheets the user has starred (join via StarredSheet)
    if (starred === '1') {
      if (!req.user) return res.status(401).json({ error: 'Login required.' })
      const starredRecords = await prisma.starredSheet.findMany({
        where: { userId: req.user.userId },
        select: { sheetId: true },
        orderBy: { createdAt: 'desc' },
        take:  parseInt(limit),
        skip:  parseInt(offset),
      })
      const starredSheetIds = starredRecords.map(r => r.sheetId)
      const totalStarred = await prisma.starredSheet.count({ where: { userId: req.user.userId } })

      const sheets = await prisma.studySheet.findMany({
        where: { id: { in: starredSheetIds }, ...where },
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
        },
      })
      // Preserve order from starredRecords
      const ordered = starredSheetIds
        .map(sid => sheets.find(s => s.id === sid))
        .filter(Boolean)
        .map(s => ({ ...s, starred: true }))
      return res.json({ sheets: ordered, total: totalStarred, limit: parseInt(limit), offset: parseInt(offset) })
    }

    const [sheets, total] = await Promise.all([
      prisma.studySheet.findMany({
        where,
        include: {
          author: { select: { id: true, username: true } },
          course: { include: { school: true } },
        },
        orderBy: { [sortField]: 'desc' },
        take:    parseInt(limit),
        skip:    parseInt(offset),
      }),
      prisma.studySheet.count({ where }),
    ])

    // Attach starred flag for authenticated users
    let starredIds = new Set()
    if (req.user) {
      const starredRows = await prisma.starredSheet.findMany({
        where: { userId: req.user.userId, sheetId: { in: sheets.map(s => s.id) } },
        select: { sheetId: true }
      })
      starredIds = new Set(starredRows.map(s => s.sheetId))
    }

    const sheetsWithStarred = sheets.map(s => ({ ...s, starred: starredIds.has(s.id) }))
    res.json({ sheets: sheetsWithStarred, total, limit: parseInt(limit), offset: parseInt(offset) })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET single sheet ──────────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const sheet = await prisma.studySheet.findUnique({
      where:   { id: parseInt(req.params.id) },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } }
      }
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })

    let starred = false
    let userReaction = null
    const [likeCount, dislikeCount] = await Promise.all([
      prisma.reaction.count({ where: { sheetId: sheet.id, type: 'like' } }),
      prisma.reaction.count({ where: { sheetId: sheet.id, type: 'dislike' } }),
    ])

    if (req.user) {
      const [starRecord, reactionRecord] = await Promise.all([
        prisma.starredSheet.findUnique({
          where: { userId_sheetId: { userId: req.user.userId, sheetId: sheet.id } }
        }),
        prisma.reaction.findUnique({
          where: { userId_sheetId: { userId: req.user.userId, sheetId: sheet.id } }
        }),
      ])
      starred = !!starRecord
      userReaction = reactionRecord ? reactionRecord.type : null
    }

    res.json({ ...sheet, starred, reactions: { likes: likeCount, dislikes: dislikeCount, userReaction } })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── CREATE a sheet ────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { title, content, courseId, forkOf, description } = req.body

  if (!title?.trim())   return res.status(400).json({ error: 'Title is required.' })
  if (!content?.trim()) return res.status(400).json({ error: 'Content is required.' })
  if (!courseId)        return res.status(400).json({ error: 'Course is required.' })

  try {
    const sheet = await prisma.studySheet.create({
      data: {
        title:       title.trim(),
        description: description?.trim().slice(0, 300) || '',
        content:     content.trim(),
        courseId:    parseInt(courseId),
        userId:      req.user.userId,
        forkOf:      forkOf ? parseInt(forkOf) : null,
      },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } }
      }
    })
    res.status(201).json(sheet)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── FORK a sheet ──────────────────────────────────────────────
router.post('/:id/fork', requireAuth, async (req, res) => {
  try {
    const original = await prisma.studySheet.findUnique({
      where:   { id: parseInt(req.params.id) },
      include: { course: true },
    })
    if (!original) return res.status(404).json({ error: 'Sheet not found.' })

    const { title } = req.body
    const forkTitle = title?.trim() || `${original.title} (fork)`

    const forked = await prisma.studySheet.create({
      data: {
        title:       forkTitle,
        description: original.description || '',
        content:     original.content,
        courseId:    original.courseId,
        userId:      req.user.userId,
        forkOf:      original.id,
      },
      include: {
        author: { select: { id: true, username: true } },
        course: { include: { school: true } },
      },
    })

    await prisma.studySheet.update({
      where: { id: original.id },
      data:  { forks: { increment: 1 } },
    })

    await createNotification(prisma, {
      userId: original.userId,
      type: 'fork',
      message: `${req.user.username} forked your sheet "${original.title}".`,
      actorId: req.user.userId,
      sheetId: original.id,
    })

    res.status(201).json(forked)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    console.error(err)
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── STAR a sheet (toggle, per-user dedup) ─────────────────────
router.post('/:id/star', requireAuth, async (req, res) => {
  const sheetId = parseInt(req.params.id)
  const userId = req.user.userId

  try {
    const existing = await prisma.starredSheet.findUnique({
      where: { userId_sheetId: { userId, sheetId } }
    })

    let updatedSheet
    if (existing) {
      // Already starred — unstar
      await prisma.starredSheet.delete({ where: { userId_sheetId: { userId, sheetId } } })
      updatedSheet = await prisma.studySheet.update({
        where: { id: sheetId },
        data:  { stars: { decrement: 1 } }
      })
      return res.json({ stars: Math.max(0, updatedSheet.stars), starred: false })
    } else {
      // Not starred — star
      await prisma.starredSheet.create({ data: { userId, sheetId } })
      updatedSheet = await prisma.studySheet.update({
        where: { id: sheetId },
        data:  { stars: { increment: 1 } },
        include: { author: { select: { id: true } } },
      })
      await createNotification(prisma, {
        userId: updatedSheet.author.id,
        type: 'star',
        message: `${req.user.username} starred your sheet "${updatedSheet.title}".`,
        actorId: userId,
        sheetId,
      })
      return res.json({ stars: updatedSheet.stars, starred: true })
    }
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DOWNLOAD count ────────────────────────────────────────────
router.post('/:id/download', async (req, res) => {
  try {
    const sheet = await prisma.studySheet.update({
      where: { id: parseInt(req.params.id) },
      data:  { downloads: { increment: 1 } }
    })
    res.json({ downloads: sheet.downloads })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE a sheet (author or admin) ─────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: parseInt(req.params.id) }
    })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (sheet.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your sheet.' })
    }
    await prisma.studySheet.delete({ where: { id: parseInt(req.params.id) } })
    res.json({ message: 'Sheet deleted.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET comments on a sheet ───────────────────────────────────
router.get('/:id/comments', async (req, res) => {
  const sheetId = parseInt(req.params.id)
  const limit  = parseInt(req.query.limit  || '20')
  const offset = parseInt(req.query.offset || '0')

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
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST a comment ────────────────────────────────────────────
router.post('/:id/comments', requireAuth, commentLimiter, async (req, res) => {
  const sheetId = parseInt(req.params.id)
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''

  if (!content) return res.status(400).json({ error: 'Comment cannot be empty.' })
  if (content.length > 500) return res.status(400).json({ error: 'Comment must be 500 characters or fewer.' })

  try {
    const sheet = await prisma.studySheet.findUnique({ where: { id: sheetId }, select: { id: true } })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })

    const comment = await prisma.comment.create({
      data: { content, sheetId, userId: req.user.userId },
      include: { author: { select: { id: true, username: true } } }
    })

    const sheetForNotify = await prisma.studySheet.findUnique({ where: { id: sheetId }, select: { userId: true, title: true } })
    if (sheetForNotify) {
      await createNotification(prisma, {
        userId: sheetForNotify.userId,
        type: 'comment',
        message: `${req.user.username} commented on your sheet "${sheetForNotify.title}".`,
        actorId: req.user.userId,
        sheetId,
      })
    }

    res.status(201).json(comment)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── REACT to a sheet (like/dislike toggle) ────────────────────
router.post('/:id/react', requireAuth, reactLimiter, async (req, res) => {
  const sheetId = parseInt(req.params.id)
  const userId  = req.user.userId
  const { type } = req.body // 'like' | 'dislike' | null

  if (type !== null && type !== 'like' && type !== 'dislike') {
    return res.status(400).json({ error: 'Reaction type must be "like", "dislike", or null.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({ where: { id: sheetId }, select: { id: true } })
    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })

    const existing = await prisma.reaction.findUnique({
      where: { userId_sheetId: { userId, sheetId } }
    })

    if (!type || (existing && existing.type === type)) {
      // Remove reaction if posting null or same type
      if (existing) await prisma.reaction.delete({ where: { userId_sheetId: { userId, sheetId } } })
    } else if (existing) {
      // Change reaction type
      await prisma.reaction.update({ where: { userId_sheetId: { userId, sheetId } }, data: { type } })
    } else {
      // New reaction
      await prisma.reaction.create({ data: { userId, sheetId, type } })
    }

    const [likes, dislikes] = await Promise.all([
      prisma.reaction.count({ where: { sheetId, type: 'like' } }),
      prisma.reaction.count({ where: { sheetId, type: 'dislike' } }),
    ])

    const current = await prisma.reaction.findUnique({ where: { userId_sheetId: { userId, sheetId } } })
    res.json({ likes, dislikes, userReaction: current ? current.type : null })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── DELETE a comment (author or admin) ───────────────────────
router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: parseInt(req.params.commentId) }
    })
    if (!comment) return res.status(404).json({ error: 'Comment not found.' })
    if (comment.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your comment.' })
    }
    await prisma.comment.delete({ where: { id: comment.id } })
    res.json({ message: 'Comment deleted.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
