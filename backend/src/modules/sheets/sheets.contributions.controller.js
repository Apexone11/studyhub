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
const {
  checkAndAwardBadgesLegacy: checkAndAwardBadges,
  emitAchievementEvent,
  EVENT_KINDS,
} = require('../achievements')
const { withPreviewText } = require('../../lib/sheets/applyContentUpdate')
const { isBlockedEitherWay } = require('../../lib/social/blockFilter')

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
      return sendError(res, 400, 'Contribution id must be an integer.', ERROR_CODES.BAD_REQUEST)
    }
    if (!['accept', 'reject'].includes(action)) {
      return sendError(res, 400, 'Action must be "accept" or "reject".', ERROR_CODES.VALIDATION)
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
        return sendError(res, 404, 'Contribution not found.', ERROR_CODES.NOT_FOUND)
      }
      if (contribution.status !== 'pending') {
        return sendError(
          res,
          409,
          'This contribution has already been reviewed.',
          ERROR_CODES.CONFLICT,
        )
      }
      if (req.user.role !== 'admin' && req.user.userId !== contribution.targetSheet.userId) {
        return sendForbidden(res, 'Only the original author can review this contribution.')
      }

      // Block-filter on the review path too — if the proposer blocked the
      // reviewer (or vice versa) between submit and review, the maintainer
      // should not be able to act on it. Admins bypass for moderation
      // purposes. Wrapped per the same fail-open pattern as the submit path.
      if (req.user.role !== 'admin') {
        try {
          if (await isBlockedEitherWay(prisma, req.user.userId, contribution.proposerId)) {
            return sendError(res, 404, 'Contribution not found.', ERROR_CODES.NOT_FOUND)
          }
        } catch {
          /* graceful degrade */
        }
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
            return sendError(res, 400, validation.issues[0], ERROR_CODES.VALIDATION, {
              issues: validation.issues,
            })
          }
        }

        await prisma.studySheet.update({
          where: { id: contribution.targetSheetId },
          data: {
            description: contribution.forkSheet.description,
            // withPreviewText keeps the Sheets Grid card preview in sync
            // with the merged-in body — see applyContentUpdate.js docstring.
            ...withPreviewText(contribution.forkSheet.content),
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

      // Achievements V2 — emit typed review/contribution events. The reviewer
      // always gets REVIEW_SUBMIT; if the review landed within 24h of the
      // contribution being created, REVIEW_FAST fires too (fast-reviewer
      // badge). On accept the proposer gets CONTRIBUTION_ACCEPT, and
      // CONTRIBUTION_PERFECT fires when there is no review comment (proxy
      // for "zero requested changes" per the perfect-pr badge spec).
      // Reject has no corresponding EVENT_KINDS entry in the engine today;
      // the rejection notification still fires below.
      const reviewedAt = new Date()
      const submittedAt = contribution.createdAt
      const isFastReview =
        submittedAt instanceof Date &&
        reviewedAt.getTime() - submittedAt.getTime() <= 24 * 60 * 60 * 1000
      void emitAchievementEvent(prisma, req.user.userId, EVENT_KINDS.REVIEW_SUBMIT, {
        contributionId: contribution.id,
        sheetId: contribution.targetSheet.id,
        action,
      })
      if (isFastReview) {
        void emitAchievementEvent(prisma, req.user.userId, EVENT_KINDS.REVIEW_FAST, {
          contributionId: contribution.id,
          sheetId: contribution.targetSheet.id,
        })
      }
      if (action === 'accept') {
        void emitAchievementEvent(
          prisma,
          contribution.proposer.id,
          EVENT_KINDS.CONTRIBUTION_ACCEPT,
          {
            contributionId: contribution.id,
            sheetId: contribution.targetSheet.id,
            reviewerId: req.user.userId,
          },
        )
        // perfect-pr — accepted with zero requested changes (no review comment).
        if (!reviewComment) {
          void emitAchievementEvent(
            prisma,
            contribution.proposer.id,
            EVENT_KINDS.CONTRIBUTION_PERFECT,
            {
              contributionId: contribution.id,
              sheetId: contribution.targetSheet.id,
              reviewerId: req.user.userId,
            },
          )
        }
      } else {
        // Rejection isn't a dead end — it's a checkpoint in an iterative
        // workflow. The proposer should be tracked for "iterate-and-improve"
        // badges (re-submit after revision, recovery PR streaks, etc).
        // Powers the future "Iterator" badge family without changing
        // existing behaviour today (criteria is opt-in per badge).
        void emitAchievementEvent(
          prisma,
          contribution.proposer.id,
          EVENT_KINDS.CONTRIBUTION_REVISION_REQUESTED,
          {
            contributionId: contribution.id,
            sheetId: contribution.targetSheet.id,
            reviewerId: req.user.userId,
            hasFeedback: Boolean(reviewComment),
          },
        )
      }

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
      sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
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
          createdAt: true,
        },
      })

      if (!forkSheet) return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
      if (!forkSheet.forkOf) {
        return sendError(
          res,
          400,
          'Only forked sheets can be contributed back.',
          ERROR_CODES.BAD_REQUEST,
        )
      }
      if (forkSheet.userId !== req.user.userId && req.user.role !== 'admin') {
        return sendForbidden(res, 'Only the fork owner can contribute changes.')
      }

      const targetSheet = await prisma.studySheet.findUnique({
        where: { id: forkSheet.forkOf },
        select: { id: true, title: true, userId: true, content: true },
      })
      if (!targetSheet) {
        return sendError(res, 404, 'Original sheet not found.', ERROR_CODES.NOT_FOUND)
      }
      if (targetSheet.userId === req.user.userId) {
        return sendError(
          res,
          400,
          'You cannot contribute back to your own sheet.',
          ERROR_CODES.BAD_REQUEST,
        )
      }

      // Block-filter: if either party blocked the other, the contribute-back
      // path is closed. Bidirectional per CLAUDE.md "Block/Mute System."
      // Wrapped in try-catch so a transient block-table outage doesn't
      // close every contribution path — fail-open here is the right call
      // (other read paths use the same try-catch graceful-degradation
      // pattern with `getBlockedUserIds`).
      try {
        if (await isBlockedEitherWay(prisma, req.user.userId, targetSheet.userId)) {
          // 404 (not 403) so the existence of the target is not confirmed
          // to a blocked user — matches the "blocked users see nothing"
          // bidirectional rule.
          return sendError(res, 404, 'Original sheet not found.', ERROR_CODES.NOT_FOUND)
        }
      } catch {
        /* graceful degrade — block check failure must not break the workflow */
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
        return sendError(
          res,
          409,
          'This fork already has a pending contribution.',
          ERROR_CODES.CONFLICT,
        )
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

      // Achievements V2 — emit CONTRIBUTION_SUBMIT for the proposer. If the
      // contribution was opened within an hour of forking, also fire
      // CONTRIBUTION_QUICKDRAW (quickdraw badge spec).
      const submittedAt = new Date()
      void emitAchievementEvent(prisma, req.user.userId, EVENT_KINDS.CONTRIBUTION_SUBMIT, {
        contributionId: contribution.id,
        sheetId: targetSheet.id,
        forkSheetId,
      })
      if (
        forkSheet.createdAt instanceof Date &&
        submittedAt.getTime() - forkSheet.createdAt.getTime() <= 60 * 60 * 1000
      ) {
        void emitAchievementEvent(prisma, req.user.userId, EVENT_KINDS.CONTRIBUTION_QUICKDRAW, {
          contributionId: contribution.id,
          sheetId: targetSheet.id,
          forkSheetId,
        })
      }

      res.status(201).json({ contribution: serializeContribution(contribution) })
    } catch (error) {
      captureError(error, { route: req.originalUrl, method: req.method })
      sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
    }
  },
)

router.get('/contributions/:contributionId/diff', requireAuth, diffLimiter, async (req, res) => {
  const contributionId = Number.parseInt(req.params.contributionId, 10)
  if (!Number.isInteger(contributionId)) {
    return sendError(res, 400, 'Invalid contribution ID.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const contribution = await prisma.sheetContribution.findUnique({
      where: { id: contributionId },
      include: {
        targetSheet: { select: { id: true, userId: true, content: true } },
        forkSheet: { select: { id: true, content: true } },
      },
    })

    if (!contribution) {
      return sendError(res, 404, 'Contribution not found.', ERROR_CODES.NOT_FOUND)
    }

    const isTargetOwner = req.user.userId === contribution.targetSheet.userId
    const isProposer = req.user.userId === contribution.proposerId
    const isAdmin = req.user.role === 'admin'
    if (!isTargetOwner && !isProposer && !isAdmin) {
      return sendError(
        res,
        403,
        'You do not have access to this contribution diff.',
        ERROR_CODES.FORBIDDEN,
      )
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
    sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
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
