const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const requireVerifiedEmail = require('../../core/auth/requireVerifiedEmail')
const { sendForbidden } = require('../../lib/accessControl')
const { createNotification } = require('../../lib/notify')
const { validateHtmlForSubmission } = require('../../lib/htmlSecurity')
const { cleanupAttachmentIfUnused } = require('../../lib/storage')
const { computeLineDiff, addWordSegments } = require('../../lib/diff')
const { SHEET_STATUS, contributionRateLimiter, contributionReviewLimiter } = require('./sheets.constants')
const { serializeContribution } = require('./sheets.serializer')

const router = express.Router()

router.patch('/contributions/:contributionId', contributionReviewLimiter, requireAuth, requireVerifiedEmail, async (req, res) => {
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
            contentFormat: true,
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
      return sendForbidden(res, 'Only the original author can review this contribution.')
    }

    if (action === 'accept') {
      if (contribution.forkSheet.contentFormat === 'html') {
        const validation = validateHtmlForSubmission(contribution.forkSheet.content)
        if (!validation.ok) {
          return res.status(400).json({ error: validation.issues[0], issues: validation.issues })
        }
      }

      await prisma.studySheet.update({
        where: { id: contribution.targetSheetId },
        data: {
          description: contribution.forkSheet.description,
          content: contribution.forkSheet.content,
          contentFormat: contribution.forkSheet.contentFormat || 'markdown',
          status: SHEET_STATUS.PUBLISHED,
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

router.post('/:id/contributions', requireAuth, requireVerifiedEmail, contributionRateLimiter, async (req, res) => {
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
      return sendForbidden(res, 'Only the fork owner can contribute changes.')
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

router.get('/contributions/:contributionId/diff', requireAuth, async (req, res) => {
  const contributionId = Number.parseInt(req.params.contributionId, 10)
  if (!Number.isInteger(contributionId)) {
    return res.status(400).json({ error: 'Invalid contribution ID.' })
  }

  try {
    const contribution = await prisma.sheetContribution.findUnique({
      where: { id: contributionId },
      include: {
        targetSheet: { select: { id: true, userId: true, content: true } },
        forkSheet: { select: { id: true, content: true } },
      },
    })

    if (!contribution) return res.status(404).json({ error: 'Contribution not found.' })

    const isTargetOwner = req.user.userId === contribution.targetSheet.userId
    const isProposer = req.user.userId === contribution.proposerId
    const isAdmin = req.user.role === 'admin'
    if (!isTargetOwner && !isProposer && !isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this contribution diff.' })
    }

    const diff = computeLineDiff(
      contribution.targetSheet.content || '',
      contribution.forkSheet.content || ''
    )
    addWordSegments(diff.hunks)

    res.json({ diff })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
