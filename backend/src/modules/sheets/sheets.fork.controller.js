const express = require('express')
const crypto = require('node:crypto')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const requireVerifiedEmail = require('../../core/auth/requireVerifiedEmail')
const { createNotification } = require('../../lib/notify')
const { isModerationEnabled, scanContent } = require('../../lib/moderation/moderationEngine')
const { SHEET_STATUS, AUTHOR_SELECT, sheetWriteLimiter } = require('./sheets.constants')
const { serializeSheet } = require('./sheets.serializer')
const { getUserTier } = require('../../lib/getUserPlan')
const { PLANS } = require('../payments/payments.constants')

const router = express.Router()

function computeChecksum(content) {
  return crypto
    .createHash('sha256')
    .update(content || '', 'utf8')
    .digest('hex')
}

router.post('/:id/fork', requireAuth, requireVerifiedEmail, sheetWriteLimiter, async (req, res) => {
  const originalId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(originalId)) {
    return res.status(400).json({ error: 'Sheet id must be an integer.' })
  }

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
        status: true,
        forkOf: true,
        rootSheetId: true,
        attachmentUrl: true,
        attachmentType: true,
        attachmentName: true,
        allowDownloads: true,
      },
    })

    if (!original) return res.status(404).json({ error: 'Sheet not found.' })
    if (original.status !== SHEET_STATUS.PUBLISHED) {
      return res.status(403).json({ error: 'Only published sheets can be forked.' })
    }
    if (original.userId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot fork your own sheet.' })
    }

    // ── Idempotent: return existing fork if user already forked this sheet ──
    const existingFork = await prisma.studySheet.findFirst({
      where: {
        forkOf: original.id,
        userId: req.user.userId,
      },
      include: {
        author: { select: AUTHOR_SELECT },
        course: { include: { school: true } },
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

    if (existingFork) {
      return res.status(200).json(serializeSheet(existingFork))
    }

    // ── Upload quota check (forks count toward monthly limit) ──
    try {
      const tier = await getUserTier(req.user.userId)
      const tierConfig = PLANS[tier] || PLANS.free
      const limit = tierConfig.uploadsPerMonth
      if (limit !== -1) {
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)
        const uploadsThisMonth = await prisma.studySheet.count({
          where: { userId: req.user.userId, createdAt: { gte: startOfMonth } },
        })
        if (uploadsThisMonth >= limit) {
          return res.status(403).json({
            error: `You have reached your monthly upload limit (${limit}). Upgrade to Pro for unlimited uploads.`,
            code: 'UPLOAD_LIMIT',
          })
        }
      }
    } catch {
      // Graceful degradation: allow fork if plan check fails
    }

    // ── Resolve root sheet id: trace back to the ultimate original ──
    const rootSheetId = original.rootSheetId || original.forkOf || original.id

    const forkTitle =
      typeof req.body.title === 'string' && req.body.title.trim()
        ? req.body.title.trim().slice(0, 160)
        : `${original.title} (fork)`

    // ── Create fork as DRAFT + initial fork_base commit in one transaction ──
    const checksum = computeChecksum(original.content)

    const [forked] = await prisma.$transaction([
      prisma.studySheet.create({
        data: {
          title: forkTitle,
          description: original.description || '',
          content: original.content,
          contentFormat: original.contentFormat || 'markdown',
          status: SHEET_STATUS.DRAFT,
          courseId: original.courseId,
          userId: req.user.userId,
          forkOf: original.id,
          rootSheetId,
          attachmentUrl: original.attachmentUrl,
          attachmentType: original.attachmentType,
          attachmentName: original.attachmentName,
          allowDownloads: original.allowDownloads,
        },
        include: {
          author: { select: AUTHOR_SELECT },
          course: { include: { school: true } },
          forkSource: {
            select: {
              id: true,
              title: true,
              userId: true,
              author: { select: AUTHOR_SELECT },
            },
          },
        },
      }),
      // Increment fork count on original within the transaction
      prisma.studySheet.update({
        where: { id: original.id },
        data: { forks: { increment: 1 } },
      }),
    ])

    // Create fork_base commit (initial snapshot of forked content)
    await prisma.sheetCommit.create({
      data: {
        sheetId: forked.id,
        userId: req.user.userId,
        kind: 'fork_base',
        message: `Forked from "${original.title}"`,
        content: original.content,
        contentFormat: original.contentFormat || 'markdown',
        checksum,
      },
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
      const textToScan =
        `${forkTitle} ${original.description || ''} ${original.contentFormat === 'markdown' ? original.content : ''}`.trim()
      if (textToScan) {
        void scanContent({
          contentType: 'sheet',
          contentId: forked.id,
          text: textToScan,
          userId: req.user.userId,
        })
      }
    }
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
