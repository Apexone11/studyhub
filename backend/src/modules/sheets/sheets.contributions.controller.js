const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const requireAuth = require('../../core/auth/requireAuth')
const requireVerifiedEmail = require('../../core/auth/requireVerifiedEmail')
const { sendForbidden } = require('../../lib/accessControl')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { createNotification } = require('../../lib/notify')
const { validateHtmlForSubmission } = require('../../lib/html/htmlSecurity')
const { cleanupAttachmentIfUnused } = require('../../lib/storage')
const { computeLineDiff, addWordSegments } = require('../../lib/diff')
const {
  SHEET_STATUS,
  AUTHOR_SELECT,
  contributionRateLimiter,
  contributionReviewLimiter,
  diffLimiter,
} = require('./sheets.constants')
const { serializeContribution } = require('./sheets.serializer')
const { computeChecksum } = require('../sheetLab/sheetLab.constants')
const { trackActivity } = require('../../lib/activityTracker')
const { checkAndAwardBadges } = require('../../lib/badges')

const router = express.Router()

/**
 * Sanitize text by removing HTML tags and trimming
 */
function sanitizeText(text) {
  if (typeof text !== 'string') return ''
  return text.replace(/<[^>]*>/g, '').trim()
}

router.patch(
  '/contributions/:contributionId',
  contributionReviewLimiter,
  requireAuth,
  requireVerifiedEmail,
  async (req, res) => {
    const contributionId = Number.parseInt(req.params.contributionId, 10)
    const action = typeof req.body.action === 'string' ? req.body.action.trim().toLowerCase() : ''
    const reviewComment = sanitizeText(
      typeof req.body.reviewComment === 'string' ? req.body.reviewComment.slice(0, 1000) : '',
    )

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
            select: { id: true, userId: true, title: true, content: true, attachmentUrl: true },
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
          proposer: { select: AUTHOR_SELECT },
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

      // Conflict detection: check if target sheet has diverged since contribution was created
      let hasConflict = false
      if (action === 'accept' && contribution.baseChecksum) {
        const currentChecksum = computeChecksum(contribution.targetSheet.content || '')
        hasConflict = currentChecksum !== contribution.baseChecksum
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

        // Create a merge commit on the target sheet
        const latestCommit = await prisma.sheetCommit.findFirst({
          where: { sheetId: contribution.targetSheetId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })

        await prisma.sheetCommit.create({
          data: {
            sheetId: contribution.targetSheetId,
            userId: req.user.userId,
            kind: 'merge',
            message: `Merged contribution from ${contribution.proposer.username} (reviewed by ${req.user.username})`,
            content: contribution.forkSheet.content,
            contentFormat: contribution.forkSheet.contentFormat || 'markdown',
            checksum: computeChecksum(contribution.forkSheet.content),
            parentId: latestCommit ? latestCommit.id : null,
          },
        })
      }

      const updatedContribution = await prisma.sheetContribution.update({
        where: { id: contribution.id },
        data: {
          status: action === 'accept' ? 'accepted' : 'rejected',
          reviewerId: req.user.userId,
          reviewedAt: new Date(),
          reviewComment,
        },
        include: {
          proposer: { select: AUTHOR_SELECT },
          reviewer: { select: AUTHOR_SELECT },
          forkSheet: {
            select: {
              id: true,
              title: true,
              updatedAt: true,
              author: { select: AUTHOR_SELECT },
            },
          },
        },
      })

      trackActivity(prisma, req.user.userId, 'reviews')
      checkAndAwardBadges(prisma, req.user.userId)

      await createNotification(prisma, {
        userId: contribution.proposer.id,
        type: 'contribution',
        message:
          action === 'accept'
            ? `${req.user.username} accepted your contribution to "${contribution.targetSheet.title}".`
            : `${req.user.username} requested changes on your contribution to "${contribution.targetSheet.title}".`,
        actorId: req.user.userId,
        sheetId: contribution.targetSheet.id,
        linkPath: `/sheets/${contribution.targetSheet.id}`,
      })

      const responseData = {
        message: action === 'accept' ? 'Contribution accepted.' : 'Contribution rejected.',
        contribution: serializeContribution(updatedContribution),
      }
      if (hasConflict) {
        responseData.conflictWarning =
          'The target sheet was modified since this contribution was submitted. The merge overwrote those changes.'
      }
      res.json(responseData)
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      res.status(500).json({ error: 'Server error.' })
    }
  },
)

router.post(
  '/:id/contributions',
  requireAuth,
  requireVerifiedEmail,
  contributionRateLimiter,
  async (req, res) => {
    const forkSheetId = Number.parseInt(req.params.id, 10)
    const message = sanitizeText(
      typeof req.body.message === 'string' ? req.body.message.slice(0, 500) : '',
    )

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
        select: { id: true, title: true, userId: true, content: true },
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
          baseChecksum: computeChecksum(targetSheet.content || ''),
        },
        include: {
          proposer: { select: AUTHOR_SELECT },
          reviewer: { select: AUTHOR_SELECT },
          forkSheet: {
            select: {
              id: true,
              title: true,
              updatedAt: true,
              author: { select: AUTHOR_SELECT },
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
  },
)

router.get('/contributions/:contributionId/diff', requireAuth, diffLimiter, async (req, res) => {
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
      contribution.forkSheet.content || '',
    )
    addWordSegments(diff.hunks)

    // Check for potential conflicts (target sheet changed since contribution was created)
    let hasConflict = false
    if (contribution.baseChecksum) {
      const currentChecksum = computeChecksum(contribution.targetSheet.content || '')
      hasConflict = currentChecksum !== contribution.baseChecksum
    }

    res.json({ diff, hasConflict })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── Hunk-level review comments ─────────────────────────────────────────────
//
// Backing table: ContributionComment (migration 20260408000001). Only the
// proposer, target-sheet owner, and admins can read or write comments for a
// given contribution. Non-participants receive 404 to avoid leaking existence.

const MAX_COMMENT_BODY = 1000

function loadCommentContext(contributionId) {
  return prisma.sheetContribution.findUnique({
    where: { id: contributionId },
    select: {
      id: true,
      proposerId: true,
      targetSheetId: true,
      targetSheet: { select: { id: true, userId: true, title: true } },
    },
  })
}

function canAccessContribution(contribution, user) {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.userId === contribution.proposerId) return true
  if (user.userId === contribution.targetSheet.userId) return true
  return false
}

function serializeComment(comment) {
  return {
    id: comment.id,
    contributionId: comment.contributionId,
    hunkIndex: comment.hunkIndex,
    lineOffset: comment.lineOffset,
    side: comment.side,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: comment.author || null,
  }
}

router.get('/contributions/:contributionId/comments', requireAuth, async (req, res) => {
  const contributionId = Number.parseInt(req.params.contributionId, 10)
  if (!Number.isInteger(contributionId)) {
    return sendError(res, 400, 'Invalid contribution id.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const contribution = await loadCommentContext(contributionId)
    if (!contribution) {
      return sendError(res, 404, 'Contribution not found.', ERROR_CODES.NOT_FOUND)
    }
    if (!canAccessContribution(contribution, req.user)) {
      // 404 (not 403) so non-participants cannot probe for contribution ids.
      return sendError(res, 404, 'Contribution not found.', ERROR_CODES.NOT_FOUND)
    }

    const comments = await prisma.contributionComment.findMany({
      where: { contributionId },
      include: { author: { select: AUTHOR_SELECT } },
      orderBy: [{ hunkIndex: 'asc' }, { lineOffset: 'asc' }, { createdAt: 'asc' }],
    })

    return res.json({ comments: comments.map(serializeComment) })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

router.post(
  '/contributions/:contributionId/comments',
  requireAuth,
  requireVerifiedEmail,
  contributionReviewLimiter,
  async (req, res) => {
    const contributionId = Number.parseInt(req.params.contributionId, 10)
    if (!Number.isInteger(contributionId)) {
      return sendError(res, 400, 'Invalid contribution id.', ERROR_CODES.BAD_REQUEST)
    }

    const hunkIndex = Number.parseInt(req.body?.hunkIndex, 10)
    const lineOffset = Number.parseInt(req.body?.lineOffset, 10)
    const side = typeof req.body?.side === 'string' ? req.body.side.trim().toLowerCase() : 'new'
    const body = sanitizeText(
      typeof req.body?.body === 'string' ? req.body.body.slice(0, MAX_COMMENT_BODY) : '',
    )

    if (!Number.isInteger(hunkIndex) || hunkIndex < 0) {
      return sendError(
        res,
        400,
        'hunkIndex must be a non-negative integer.',
        ERROR_CODES.VALIDATION,
      )
    }
    if (!Number.isInteger(lineOffset) || lineOffset < 0) {
      return sendError(
        res,
        400,
        'lineOffset must be a non-negative integer.',
        ERROR_CODES.VALIDATION,
      )
    }
    if (!['old', 'new'].includes(side)) {
      return sendError(res, 400, 'side must be "old" or "new".', ERROR_CODES.VALIDATION)
    }
    if (!body) {
      return sendError(res, 400, 'Comment body is required.', ERROR_CODES.VALIDATION)
    }

    try {
      const contribution = await loadCommentContext(contributionId)
      if (!contribution) {
        return sendError(res, 404, 'Contribution not found.', ERROR_CODES.NOT_FOUND)
      }
      if (!canAccessContribution(contribution, req.user)) {
        return sendError(res, 404, 'Contribution not found.', ERROR_CODES.NOT_FOUND)
      }

      const created = await prisma.contributionComment.create({
        data: {
          contributionId,
          userId: req.user.userId,
          hunkIndex,
          lineOffset,
          side,
          body,
        },
        include: { author: { select: AUTHOR_SELECT } },
      })

      // Notify the other party (proposer <-> target owner). Admins acting as
      // neither do not trigger a notification.
      const ownerId = contribution.targetSheet.userId
      const proposerId = contribution.proposerId
      let recipientId = null
      if (req.user.userId === proposerId) recipientId = ownerId
      else if (req.user.userId === ownerId) recipientId = proposerId

      if (recipientId && recipientId !== req.user.userId) {
        await createNotification(prisma, {
          userId: recipientId,
          type: 'contribution_comment',
          message: `${req.user.username} commented on the contribution for "${contribution.targetSheet.title}".`,
          actorId: req.user.userId,
          sheetId: contribution.targetSheet.id,
          linkPath: `/sheets/${contribution.targetSheet.id}?tab=reviews`,
        }).catch((notifyError) => {
          captureError(notifyError, {
            route: req.originalUrl,
            method: req.method,
            contributionId,
          })
        })
      }

      trackActivity(prisma, req.user.userId, 'contribution_comment')

      return res.status(201).json({ comment: serializeComment(created) })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

router.delete(
  '/contributions/:contributionId/comments/:commentId',
  requireAuth,
  async (req, res) => {
    const contributionId = Number.parseInt(req.params.contributionId, 10)
    const commentId = Number.parseInt(req.params.commentId, 10)
    if (!Number.isInteger(contributionId) || !Number.isInteger(commentId)) {
      return sendError(res, 400, 'Invalid id.', ERROR_CODES.BAD_REQUEST)
    }

    try {
      const comment = await prisma.contributionComment.findUnique({
        where: { id: commentId },
        select: { id: true, userId: true, contributionId: true },
      })
      if (!comment || comment.contributionId !== contributionId) {
        return sendError(res, 404, 'Comment not found.', ERROR_CODES.NOT_FOUND)
      }

      const isAuthor = req.user.userId === comment.userId
      const isAdmin = req.user.role === 'admin'
      if (!isAuthor && !isAdmin) {
        return sendError(res, 404, 'Comment not found.', ERROR_CODES.NOT_FOUND)
      }

      await prisma.contributionComment.delete({ where: { id: commentId } })
      return res.json({ message: 'Comment deleted.' })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

module.exports = router
