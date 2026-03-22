const express = require('express')
const requireAuth = require('../../middleware/auth')
const { assertOwnerOrAdmin } = require('../../lib/accessControl')
const { captureError } = require('../../monitoring/sentry')
const { computeLineDiff, addWordSegments, generateChangeSummary } = require('../../lib/diff')
const prisma = require('../../lib/prisma')
const { optionalAuth, canReadSheet, parsePositiveInt, computeChecksum } = require('./sheetLab.constants')

const router = express.Router()

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

    const latestCommit = await prisma.sheetCommit.findFirst({
      where: { sheetId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    const checksum = computeChecksum(targetCommit.content)

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
    addWordSegments(diff.hunks)

    res.json({ diff })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/sheets/:id/lab/auto-summary — generate change summary for snapshot ──

router.get('/:id/lab/auto-summary', requireAuth, async (req, res) => {
  const sheetId = parsePositiveInt(req.params.id, 0)
  if (!sheetId) return res.status(400).json({ error: 'Invalid sheet ID.' })

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, content: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!assertOwnerOrAdmin({
      res,
      user: req.user,
      ownerId: sheet.userId,
      message: 'Only the sheet owner can get the auto-summary.',
      targetType: 'sheet-lab',
      targetId: sheetId,
    })) return

    const latestCommit = await prisma.sheetCommit.findFirst({
      where: { sheetId },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    })

    const previousContent = latestCommit ? latestCommit.content : ''
    const summary = generateChangeSummary(previousContent, sheet.content)

    res.json({ summary })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/sheets/:id/lab/restore-preview/:commitId — diff preview before restore ──

router.get('/:id/lab/restore-preview/:commitId', requireAuth, async (req, res) => {
  const sheetId = parsePositiveInt(req.params.id, 0)
  const commitId = parsePositiveInt(req.params.commitId, 0)
  if (!sheetId || !commitId) return res.status(400).json({ error: 'Invalid ID.' })

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
      message: 'Only the sheet owner can preview restores.',
      targetType: 'sheet-lab',
      targetId: sheetId,
    })) return

    const targetCommit = await prisma.sheetCommit.findFirst({
      where: { id: commitId, sheetId },
      select: { id: true, content: true, message: true, createdAt: true },
    })

    if (!targetCommit) return res.status(404).json({ error: 'Commit not found.' })

    const diff = computeLineDiff(sheet.content, targetCommit.content)
    addWordSegments(diff.hunks)

    res.json({
      diff,
      commit: {
        id: targetCommit.id,
        message: targetCommit.message,
        createdAt: targetCommit.createdAt,
      },
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
