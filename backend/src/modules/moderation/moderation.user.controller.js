const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { countActiveStrikes, hasActiveRestriction } = require('../../lib/moderationEngine')
const { createNotification } = require('../../lib/notify')
const { classifyReportPriority, classifyAppealPriority, REPEAT_OFFENDER_CASE_WINDOW_MS } = require('../../lib/notificationPolicy')
const { appealLimiter, reportLimiter, REASON_CATEGORIES, APPEAL_REASON_CATEGORIES } = require('./moderation.constants')

const router = express.Router()

/* ── Reportable content types and their Prisma models ────────── */
const REPORTABLE_TYPES = {
  sheet: 'studySheet',
  note: 'note',
  post: 'feedPost',
  sheet_comment: 'comment',
  post_comment: 'feedPostComment',
  note_comment: 'noteComment',
  user: 'user',
}

/* GET /my-status — Combined moderation summary for the current user */
router.get('/my-status', async (req, res) => {
  try {
    const userId = req.user.userId

    const [restricted, activeStrikesCount, restriction, cases, strikes, appeals] = await Promise.all([
      hasActiveRestriction(userId),
      countActiveStrikes(userId),
      prisma.userRestriction.findFirst({
        where: {
          userId,
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        select: { id: true, type: true, reason: true, startsAt: true, endsAt: true },
        orderBy: { startsAt: 'desc' },
      }),
      prisma.moderationCase.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          contentType: true,
          contentId: true,
          status: true,
          reasonCategory: true,
          excerpt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.strike.findMany({
        where: { userId },
        orderBy: { issuedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          reason: true,
          issuedAt: true,
          expiresAt: true,
          decayedAt: true,
          caseId: true,
        },
      }),
      prisma.appeal.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          caseId: true,
          reasonCategory: true,
          status: true,
          reason: true,
          reviewNote: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ])

    res.json({
      restricted,
      activeStrikes: activeStrikesCount,
      restriction: restriction || null,
      cases,
      strikes,
      appeals,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* GET /my-strikes — User's own strikes and restriction status */
router.get('/my-strikes', async (req, res) => {
  try {
    const strikes = await prisma.strike.findMany({
      where: { userId: req.user.userId },
      orderBy: { issuedAt: 'desc' },
      take: 50,
      include: {
        case: { select: { id: true, contentType: true, category: true } },
      },
    })

    const restricted = await hasActiveRestriction(req.user.userId)
    const activeCount = await countActiveStrikes(req.user.userId)

    res.json({ strikes, activeStrikes: activeCount, restricted })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* GET /my-appeals — User's own appeals */
router.get('/my-appeals', async (req, res) => {
  try {
    const appeals = await prisma.appeal.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        case: { select: { id: true, contentType: true, category: true } },
        reviewer: { select: { id: true, username: true } },
      },
    })

    res.json({ appeals })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* POST /reports — Submit a user report */
router.post('/reports', reportLimiter, async (req, res) => {
  const targetType = String(req.body?.targetType || '').trim()
  const targetId = Number.parseInt(req.body?.targetId, 10)
  const reasonCategory = String(req.body?.reasonCategory || '').trim()
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : ''

  if (!REPORTABLE_TYPES[targetType]) {
    return res.status(400).json({ error: `Invalid targetType. Must be one of: ${Object.keys(REPORTABLE_TYPES).join(', ')}` })
  }
  if (!Number.isFinite(targetId)) {
    return res.status(400).json({ error: 'Valid targetId is required.' })
  }
  if (!REASON_CATEGORIES.includes(reasonCategory)) {
    return res.status(400).json({ error: `Invalid reasonCategory. Must be one of: ${REASON_CATEGORIES.join(', ')}` })
  }

  try {
    /* Verify target exists */
    const modelName = REPORTABLE_TYPES[targetType]
    const target = await prisma[modelName].findUnique({
      where: { id: targetId },
      select: { id: true, ...(modelName !== 'user' ? { userId: true } : {}) },
    })
    if (!target) {
      return res.status(404).json({ error: 'The content you are reporting was not found.' })
    }

    /* Prevent self-reporting */
    const contentOwnerId = modelName === 'user' ? targetId : target.userId
    if (contentOwnerId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot report your own content.' })
    }

    /* Prevent duplicate pending reports from the same user on the same target */
    const existingReport = await prisma.moderationCase.findFirst({
      where: {
        contentType: targetType,
        contentId: targetId,
        reporterUserId: req.user.userId,
        source: 'user_report',
        status: 'pending',
      },
      select: { id: true },
    })
    if (existingReport) {
      return res.status(409).json({ error: 'You have already reported this content.' })
    }

    /* Build excerpt from the target content */
    let excerpt = ''
    if (modelName !== 'user') {
      const contentRecord = await prisma[modelName].findUnique({
        where: { id: targetId },
        select: { content: true, ...(modelName === 'studySheet' ? { title: true } : modelName === 'note' ? { title: true } : {}) },
      })
      if (contentRecord) {
        const parts = [contentRecord.title, contentRecord.content].filter(Boolean)
        excerpt = parts.join(' ').slice(0, 400)
      }
    }

    const modCase = await prisma.moderationCase.create({
      data: {
        contentType: targetType,
        contentId: targetId,
        userId: contentOwnerId,
        status: 'pending',
        source: 'user_report',
        reporterUserId: req.user.userId,
        reasonCategory,
        excerpt,
        evidence: note ? { reportNote: note } : null,
      },
    })

    /* Notify admins with smart priority classification */
    try {
      const [admins, actorStrikes, actorRecentCases] = await Promise.all([
        prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } }),
        prisma.strike.count({ where: { userId: contentOwnerId, active: true } }),
        prisma.moderationCase.count({
          where: {
            userId: contentOwnerId,
            createdAt: { gte: new Date(Date.now() - REPEAT_OFFENDER_CASE_WINDOW_MS) },
          },
        }),
      ])

      const isPublicTarget = targetType === 'sheet'
        ? !!(await prisma.studySheet.findUnique({ where: { id: targetId }, select: { status: true } }))?.status === 'published'
        : targetType === 'note'
          ? !!(await prisma.note.findUnique({ where: { id: targetId }, select: { isShared: true } }))?.isShared
          : false

      const reportPriority = classifyReportPriority({
        reasonCategory,
        targetType,
        isPublicTarget,
        actorActiveStrikes: actorStrikes,
        actorRecentCases: actorRecentCases,
      })

      for (const admin of admins) {
        void createNotification(prisma, {
          userId: admin.id,
          type: 'moderation',
          message: `New user report: ${reasonCategory.replace(/_/g, ' ')} on ${targetType.replace(/_/g, ' ')}`,
          actorId: null,
          linkPath: '/admin?tab=moderation',
          priority: reportPriority,
          dedupKey: `report-${targetType}-${targetId}`,
        })
      }
    } catch { /* notification failures are non-fatal */ }

    res.status(201).json({ message: 'Report submitted. We will review it shortly.', caseId: modCase.id })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* POST /appeals — Submit an appeal
 *
 * Eligibility (any of):
 *   - Case status is 'confirmed' AND user is the content owner (userId on case)
 *   - User has an active (non-decayed) strike linked to this case
 * Guards:
 *   - One pending appeal per case per user
 *   - Rate limited (appealLimiter)
 *   - Reason: 20–2000 chars
 *   - Optional reasonCategory from APPEAL_REASON_CATEGORIES
 */
router.post('/appeals', appealLimiter, async (req, res) => {
  const caseId = Number.parseInt(req.body?.caseId, 10)
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  const reasonCategory = typeof req.body?.reasonCategory === 'string' ? req.body.reasonCategory.trim() : null

  if (!Number.isFinite(caseId)) return res.status(400).json({ error: 'Valid caseId is required.' })
  if (reason.length < 20) {
    return res.status(400).json({ error: 'Appeal reason must be at least 20 characters.' })
  }
  if (reason.length > 2000) {
    return res.status(400).json({ error: 'Appeal reason must be 2000 characters or fewer.' })
  }
  if (reasonCategory && !APPEAL_REASON_CATEGORIES.includes(reasonCategory)) {
    return res.status(400).json({ error: 'Invalid appeal reason category.' })
  }

  try {
    const modCase = await prisma.moderationCase.findUnique({
      where: { id: caseId },
      select: { id: true, status: true, userId: true },
    })
    if (!modCase) return res.status(404).json({ error: 'Moderation case not found.' })

    /* Eligibility: content owner on confirmed case OR has active strike */
    const isContentOwner = modCase.userId === req.user.userId
    const isConfirmedCase = modCase.status === 'confirmed'
    const linkedStrike = await prisma.strike.findFirst({
      where: { caseId, userId: req.user.userId, decayedAt: null },
      select: { id: true },
    })

    if (!(isContentOwner && isConfirmedCase) && !linkedStrike) {
      return res.status(403).json({ error: 'You can only appeal confirmed cases on your content or cases linked to your active strikes.' })
    }

    /* Prevent duplicate pending appeals */
    const existingAppeal = await prisma.appeal.findFirst({
      where: { caseId, userId: req.user.userId, status: 'pending' },
      select: { id: true },
    })
    if (existingAppeal) {
      return res.status(409).json({ error: 'You already have a pending appeal for this case.' })
    }

    const appeal = await prisma.appeal.create({
      data: {
        caseId,
        userId: req.user.userId,
        reasonCategory: reasonCategory || null,
        reason,
      },
    })

    res.status(201).json({ message: 'Appeal submitted.', appeal })

    /* Notify admins about the new appeal */
    try {
      const appealPriority = classifyAppealPriority({ reasonCategory })
      const admins = await prisma.user.findMany({
        where: { role: 'admin' },
        select: { id: true },
      })
      for (const admin of admins) {
        void createNotification(prisma, {
          userId: admin.id,
          type: 'moderation',
          message: `New appeal submitted for case #${caseId}${reasonCategory ? ` (${reasonCategory.replace(/_/g, ' ')})` : ''}.`,
          actorId: req.user.userId,
          linkPath: '/admin?tab=moderation',
          priority: appealPriority,
          dedupKey: `appeal-${caseId}`,
        })
      }
    } catch { /* notification failures are non-fatal */ }
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
