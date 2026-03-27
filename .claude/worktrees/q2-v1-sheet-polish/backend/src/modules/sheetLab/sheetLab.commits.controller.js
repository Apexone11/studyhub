const express = require('express')
const requireAuth = require('../../middleware/auth')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { optionalAuth, canReadSheet, parsePositiveInt, computeChecksum } = require('./sheetLab.constants')
const { trackActivity } = require('../../lib/activityTracker')
const { checkAndAwardBadges } = require('../../lib/badges')

const router = express.Router()

// ── GET /api/sheets/:id/lab/commits — list all commits (paginated) ──

router.get('/:id/lab/commits', optionalAuth, async (req, res) => {
  const sheetId = parsePositiveInt(req.params.id, 0)
  if (!sheetId) return res.status(400).json({ error: 'Invalid sheet ID.' })

  const page = parsePositiveInt(req.query.page, 1)
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100)
  const skip = (page - 1) * limit

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, status: true, userId: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) {
      return res.status(404).json({ error: 'Sheet not found.' })
    }

    const [commits, total] = await Promise.all([
      prisma.sheetCommit.findMany({
        where: { sheetId },
        select: {
          id: true,
          message: true,
          kind: true,
          checksum: true,
          contentFormat: true,
          parentId: true,
          createdAt: true,
          author: { select: { id: true, username: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.sheetCommit.count({ where: { sheetId } }),
    ])

    res.json({
      commits,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/sheets/:id/lab/commits/:commitId — single commit with content ──

router.get('/:id/lab/commits/:commitId', optionalAuth, async (req, res) => {
  const sheetId = parsePositiveInt(req.params.id, 0)
  const commitId = parsePositiveInt(req.params.commitId, 0)
  if (!sheetId || !commitId) return res.status(400).json({ error: 'Invalid ID.' })

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, status: true, userId: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) {
      return res.status(404).json({ error: 'Sheet not found.' })
    }

    const commit = await prisma.sheetCommit.findFirst({
      where: { id: commitId, sheetId },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    if (!commit) return res.status(404).json({ error: 'Commit not found.' })

    res.json({
      commit: {
        id: commit.id,
        message: commit.message,
        content: commit.content,
        contentFormat: commit.contentFormat,
        checksum: commit.checksum,
        author: commit.author,
        createdAt: commit.createdAt,
        parentId: commit.parentId,
      },
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── POST /api/sheets/:id/lab/commits — create a new commit ──

router.post('/:id/lab/commits', requireAuth, async (req, res) => {
  const sheetId = parsePositiveInt(req.params.id, 0)
  if (!sheetId) return res.status(400).json({ error: 'Invalid sheet ID.' })

  const message = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 500) : ''

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, content: true, contentFormat: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: sheet.userId,
      message: 'Only the sheet owner can create commits.',
      targetType: 'sheet-lab',
      targetId: sheetId,
    })) return

    const latestCommit = await prisma.sheetCommit.findFirst({
      where: { sheetId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    const checksum = computeChecksum(sheet.content)

    const commit = await prisma.sheetCommit.create({
      data: {
        sheetId,
        userId: req.user.userId,
        message: message || 'Snapshot',
        content: sheet.content,
        contentFormat: sheet.contentFormat || 'markdown',
        checksum,
        parentId: latestCommit ? latestCommit.id : null,
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    trackActivity(prisma, req.user.userId, 'commits')
    checkAndAwardBadges(prisma, req.user.userId)

    res.status(201).json({
      commit: {
        id: commit.id,
        message: commit.message,
        content: commit.content,
        contentFormat: commit.contentFormat,
        checksum: commit.checksum,
        author: commit.author,
        createdAt: commit.createdAt,
        parentId: commit.parentId,
      },
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
