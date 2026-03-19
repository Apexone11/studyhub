const express = require('express')
const crypto = require('node:crypto')
const requireAuth = require('../middleware/auth')
const { assertOwnerOrAdmin } = require('../lib/accessControl')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../lib/authTokens')
const { captureError } = require('../monitoring/sentry')
const { computeLineDiff } = require('../lib/diff')
const prisma = require('../lib/prisma')

const router = express.Router()

const SHEET_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
}

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

function canReadSheet(sheet, user) {
  if (sheet.status === SHEET_STATUS.PUBLISHED) return true
  return Boolean(user && (user.role === 'admin' || user.userId === sheet.userId))
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content || '', 'utf8').digest('hex')
}

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

    // Find the latest commit for this sheet to set as parent
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

// ── POST /api/sheets/:id/lab/restore/:commitId — restore to a commit ──

router.post('/:id/lab/restore/:commitId', requireAuth, async (req, res) => {
  const sheetId = parsePositiveInt(req.params.id, 0)
  const commitId = parsePositiveInt(req.params.commitId, 0)
  if (!sheetId || !commitId) return res.status(400).json({ error: 'Invalid ID.' })

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, title: true, userId: true, content: true, contentFormat: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: sheet.userId,
      message: 'Only the sheet owner can restore commits.',
      targetType: 'sheet-lab',
      targetId: sheetId,
    })) return

    const targetCommit = await prisma.sheetCommit.findFirst({
      where: { id: commitId, sheetId },
    })

    if (!targetCommit) return res.status(404).json({ error: 'Commit not found.' })

    // Find the latest commit to set as parent for the new restore commit
    const latestCommit = await prisma.sheetCommit.findFirst({
      where: { sheetId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    const checksum = computeChecksum(targetCommit.content)

    // Create a new commit recording the restore, and update the sheet in a transaction
    const [newCommit, updatedSheet] = await prisma.$transaction([
      prisma.sheetCommit.create({
        data: {
          sheetId,
          userId: req.user.userId,
          message: `Restored to commit #${commitId}`,
          content: targetCommit.content,
          contentFormat: targetCommit.contentFormat,
          checksum,
          parentId: latestCommit ? latestCommit.id : null,
        },
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
        },
      }),
      prisma.studySheet.update({
        where: { id: sheetId },
        data: {
          content: targetCommit.content,
          contentFormat: targetCommit.contentFormat,
        },
        select: { id: true, title: true, content: true, contentFormat: true },
      }),
    ])

    res.json({
      commit: {
        id: newCommit.id,
        message: newCommit.message,
        content: newCommit.content,
        contentFormat: newCommit.contentFormat,
        checksum: newCommit.checksum,
        author: newCommit.author,
        createdAt: newCommit.createdAt,
        parentId: newCommit.parentId,
      },
      sheet: updatedSheet,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/sheets/:id/lab/diff/:commitIdA/:commitIdB — diff between two commits ──

router.get('/:id/lab/diff/:commitIdA/:commitIdB', optionalAuth, async (req, res) => {
  const sheetId = parsePositiveInt(req.params.id, 0)
  const commitIdA = parsePositiveInt(req.params.commitIdA, 0)
  const commitIdB = parsePositiveInt(req.params.commitIdB, 0)
  if (!sheetId || !commitIdA || !commitIdB) {
    return res.status(400).json({ error: 'Invalid ID.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, status: true, userId: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) {
      return res.status(404).json({ error: 'Sheet not found.' })
    }

    const [commitA, commitB] = await Promise.all([
      prisma.sheetCommit.findFirst({
        where: { id: commitIdA, sheetId },
        select: { id: true, content: true },
      }),
      prisma.sheetCommit.findFirst({
        where: { id: commitIdB, sheetId },
        select: { id: true, content: true },
      }),
    ])

    if (!commitA || !commitB) {
      return res.status(404).json({ error: 'One or both commits not found.' })
    }

    const diff = computeLineDiff(commitA.content, commitB.content)

    res.json({ diff })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
