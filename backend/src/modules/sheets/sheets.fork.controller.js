const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const requireVerifiedEmail = require('../../core/auth/requireVerifiedEmail')
const { createNotification } = require('../../lib/notify')
const { isModerationEnabled, scanContent } = require('../../lib/moderationEngine')
const { SHEET_STATUS, sheetWriteLimiter } = require('./sheets.constants')
const { serializeSheet } = require('./sheets.serializer')

const router = express.Router()

router.post('/:id/fork', requireAuth, requireVerifiedEmail, sheetWriteLimiter, async (req, res) => {
  const originalId = Number.parseInt(req.params.id, 10)

  try {
    const original = await prisma.studySheet.findUnique({
      where: { id: originalId },
      select: {
        id: true,
        title: true,
        description: true,
        content: true,
        contentFormat: true,
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
        contentFormat: original.contentFormat || 'markdown',
        status: SHEET_STATUS.PUBLISHED,
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

    /* Async content moderation — scan forked content under new author */
    if (isModerationEnabled()) {
      const textToScan = `${forkTitle} ${original.description || ''} ${original.contentFormat === 'markdown' ? original.content : ''}`.trim()
      if (textToScan) {
        void scanContent({ contentType: 'sheet', contentId: forked.id, text: textToScan, userId: req.user.userId })
      }
    }
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
