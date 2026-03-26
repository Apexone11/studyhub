const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { countActiveStrikes, restoreContent } = require('../../lib/moderationEngine')
const { createNotification } = require('../../lib/notify')
const { PAGE_SIZE, parsePage } = require('./moderation.constants')
const { logModerationEvent } = require('../../lib/moderationLogger')

const router = express.Router()

/* GET /restrictions — List user restrictions */
router.get('/restrictions', async (req, res) => {
  const page = parsePage(req.query.page)
  const skip = (page - 1) * PAGE_SIZE

  try {
    const [restrictions, total] = await Promise.all([
      prisma.userRestriction.findMany({
        orderBy: { startsAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        include: { user: { select: { id: true, username: true } } },
      }),
      prisma.userRestriction.count(),
    ])

    res.json({
      restrictions,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE) || 1,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* PATCH /restrictions/:id/lift — Lift a restriction */
router.patch('/restrictions/:id/lift', async (req, res) => {
  const restrictionId = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(restrictionId)) return res.status(400).json({ error: 'Invalid restriction ID.' })

  try {
    const existing = await prisma.userRestriction.findUnique({
      where: { id: restrictionId },
      select: { id: true, userId: true, endsAt: true },
    })
    if (!existing) return res.status(404).json({ error: 'Restriction not found.' })

    if (existing.endsAt && existing.endsAt <= new Date()) {
      return res.json({ message: 'Restriction was already expired.', restriction: existing })
    }

    const updated = await prisma.userRestriction.update({
      where: { id: restrictionId },
      data: { endsAt: new Date() },
      include: { user: { select: { id: true, username: true } } },
    })

    logModerationEvent({ userId: existing.userId, action: 'restriction_lifted', performedBy: req.user.userId })

    try {
      await createNotification(prisma, {
        userId: existing.userId,
        type: 'moderation',
        message: 'Your account restriction has been lifted.',
        actorId: null,
        performerUserId: req.user.userId,
      })
    } catch { /* non-fatal */ }

    res.json({ message: 'Restriction lifted.', restriction: updated })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* GET /appeals — List appeals with status filter */
router.get('/appeals', async (req, res) => {
  const status = req.query.status || 'pending'
  const page = parsePage(req.query.page)
  const skip = (page - 1) * PAGE_SIZE

  try {
    const where = status === 'all' ? {} : { status }
    const [appeals, total] = await Promise.all([
      prisma.appeal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        include: {
          user: { select: { id: true, username: true } },
          case: { select: { id: true, contentType: true, contentId: true, category: true } },
          reviewer: { select: { id: true, username: true } },
        },
      }),
      prisma.appeal.count({ where }),
    ])

    res.json({
      appeals,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE) || 1,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* PATCH /appeals/:id/review — Approve or reject an appeal */
router.patch('/appeals/:id/review', async (req, res) => {
  const appealId = Number.parseInt(req.params.id, 10)
  const action = String(req.body?.action || '').trim().toLowerCase()
  const reviewNote = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote.trim().slice(0, 500) : ''

  if (!Number.isFinite(appealId)) return res.status(400).json({ error: 'Invalid appeal ID.' })
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "approve" or "reject".' })
  }

  try {
    const appeal = await prisma.appeal.findUnique({
      where: { id: appealId },
      include: { case: { select: { id: true } } },
    })
    if (!appeal) return res.status(404).json({ error: 'Appeal not found.' })
    if (appeal.status !== 'pending') {
      return res.status(400).json({ error: 'This appeal has already been reviewed.' })
    }

    if (action === 'approve') {
      const updated = await prisma.appeal.update({
        where: { id: appealId },
        data: { status: 'approved', reviewedBy: req.user.userId, reviewNote },
      })

      if (appeal.caseId) {
        await prisma.moderationCase.update({
          where: { id: appeal.caseId },
          data: { status: 'reversed', reviewedBy: req.user.userId, reviewNote: 'Reversed via approved appeal.' },
        }).catch((err) => captureError(err, { context: 'appeal-case-dismiss', appealId }))

        /* Restore taken-down content */
        await restoreContent(appeal.caseId)
          .catch((err) => captureError(err, { context: 'appeal-restore', appealId }))
      }

      await prisma.strike.updateMany({
        where: { caseId: appeal.caseId, userId: appeal.userId, decayedAt: null },
        data: { decayedAt: new Date() },
      }).catch((err) => captureError(err, { context: 'appeal-strike-decay', appealId }))

      const activeStrikes = await countActiveStrikes(appeal.userId)
      if (activeStrikes < 4) {
        await prisma.userRestriction.updateMany({
          where: {
            userId: appeal.userId,
            type: 'full',
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
          data: { endsAt: new Date() },
        }).catch((err) => captureError(err, { context: 'appeal-restriction-lift', appealId }))
      }

      logModerationEvent({ userId: appeal.userId, action: 'appeal_approved', caseId: appeal.caseId, appealId: appeal.id, performedBy: req.user.userId })
      logModerationEvent({ userId: appeal.userId, action: 'strike_decayed', caseId: appeal.caseId, appealId: appeal.id, performedBy: req.user.userId })

      try {
        await createNotification(prisma, {
          userId: appeal.userId,
          type: 'moderation',
          message: 'Your appeal has been approved. The strike has been removed.',
          actorId: null,
          linkPath: '/settings?tab=moderation',
          performerUserId: req.user.userId,
        })
      } catch { /* non-fatal */ }

      return res.json({ message: 'Appeal approved. Strike decayed.', appeal: updated })
    }

    const updated = await prisma.appeal.update({
      where: { id: appealId },
      data: { status: 'rejected', reviewedBy: req.user.userId, reviewNote },
    })

    logModerationEvent({ userId: appeal.userId, action: 'appeal_rejected', caseId: appeal.caseId, appealId: appeal.id, performedBy: req.user.userId })

    try {
      await createNotification(prisma, {
        userId: appeal.userId,
        type: 'moderation',
        message: 'Your appeal has been reviewed and was not approved.',
        actorId: null,
        linkPath: '/settings?tab=account',
        performerUserId: req.user.userId,
      })
    } catch { /* non-fatal */ }

    res.json({ message: 'Appeal rejected.', appeal: updated })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
