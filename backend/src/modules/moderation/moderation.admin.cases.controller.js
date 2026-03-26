const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { issueStrike, reviewCase } = require('../../lib/moderationEngine')
const { isSuperAdmin } = require('../../lib/superAdmin')
const { PAGE_SIZE, parsePage } = require('./moderation.constants')

const router = express.Router()

/* GET /cases — List moderation cases with source/claim filters */
router.get('/cases', async (req, res) => {
  const status = req.query.status || 'pending'
  const source = req.query.source || ''
  const claimed = req.query.claimed || ''
  const page = parsePage(req.query.page)
  const skip = (page - 1) * PAGE_SIZE

  try {
    const where = status === 'all' ? {} : { status }
    if (source && source !== 'all') where.source = source
    if (claimed === 'mine') where.claimedByAdminId = req.user.userId
    else if (claimed === 'unclaimed') where.claimedByAdminId = null
    else if (claimed === 'any') where.claimedByAdminId = { not: null }

    const [cases, total] = await Promise.all([
      prisma.moderationCase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        include: {
          user: { select: { id: true, username: true } },
          reviewer: { select: { id: true, username: true } },
          reporter: { select: { id: true, username: true } },
          claimedBy: { select: { id: true, username: true } },
        },
      }),
      prisma.moderationCase.count({ where }),
    ])

    res.json({
      cases,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE) || 1,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* GET /cases/overview — Super admin dashboard stats */
router.get('/cases/overview', async (req, res) => {
  try {
    const [
      totalPending,
      totalBySource,
      claimedByAdmin,
      recentResolved,
    ] = await Promise.all([
      prisma.moderationCase.count({ where: { status: 'pending' } }),
      prisma.moderationCase.groupBy({
        by: ['source'],
        where: { status: 'pending' },
        _count: true,
      }),
      prisma.moderationCase.groupBy({
        by: ['claimedByAdminId'],
        where: {
          claimedByAdminId: { not: null },
          status: 'pending',
        },
        _count: true,
      }),
      prisma.moderationCase.findMany({
        where: { status: { in: ['confirmed', 'dismissed'] } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          contentType: true,
          status: true,
          source: true,
          updatedAt: true,
          reviewer: { select: { id: true, username: true } },
        },
      }),
    ])

    /* Resolve admin usernames for the groupBy results */
    const adminIds = claimedByAdmin
      .map((g) => g.claimedByAdminId)
      .filter(Boolean)
    const adminUsers = adminIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, username: true },
        })
      : []
    const adminMap = Object.fromEntries(adminUsers.map((u) => [u.id, u.username]))

    const claimedBreakdown = claimedByAdmin.map((g) => ({
      adminId: g.claimedByAdminId,
      adminUsername: adminMap[g.claimedByAdminId] || 'Unknown',
      pendingClaimed: g._count,
    }))

    const sourceBreakdown = Object.fromEntries(
      totalBySource.map((g) => [g.source, g._count]),
    )

    res.json({
      totalPending,
      sourceBreakdown,
      claimedBreakdown,
      recentResolved,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* GET /cases/:id — Single case with related strikes and appeals */
router.get('/cases/:id', async (req, res) => {
  const caseId = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(caseId)) return res.status(400).json({ error: 'Invalid case ID.' })

  try {
    const modCase = await prisma.moderationCase.findUnique({
      where: { id: caseId },
      include: {
        user: { select: { id: true, username: true } },
        reviewer: { select: { id: true, username: true } },
        reporter: { select: { id: true, username: true } },
        claimedBy: { select: { id: true, username: true } },
        strikes: {
          include: { user: { select: { id: true, username: true } } },
        },
        appeals: {
          include: {
            user: { select: { id: true, username: true } },
            reviewer: { select: { id: true, username: true } },
          },
        },
      },
    })

    if (!modCase) return res.status(404).json({ error: 'Case not found.' })
    res.json(modCase)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* POST /cases/:id/claim — Claim a case for triage */
router.post('/cases/:id/claim', async (req, res) => {
  const caseId = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(caseId)) return res.status(400).json({ error: 'Invalid case ID.' })

  try {
    const modCase = await prisma.moderationCase.findUnique({
      where: { id: caseId },
      select: { id: true, status: true, claimedByAdminId: true },
    })
    if (!modCase) return res.status(404).json({ error: 'Case not found.' })

    /* Already claimed by this admin — idempotent */
    if (modCase.claimedByAdminId === req.user.userId) {
      return res.json({ message: 'Already claimed by you.', caseId })
    }

    /* Claimed by another admin — super admin can override */
    if (modCase.claimedByAdminId !== null) {
      const isSuper = await isSuperAdmin(req.user.userId)
      if (!isSuper) {
        return res.status(409).json({
          error: 'This case is already claimed by another admin.',
          claimedByAdminId: modCase.claimedByAdminId,
        })
      }
    }

    await prisma.moderationCase.update({
      where: { id: caseId },
      data: { claimedByAdminId: req.user.userId, claimedAt: new Date() },
    })

    res.json({ message: 'Case claimed.', caseId })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* POST /cases/:id/unclaim — Release a claim */
router.post('/cases/:id/unclaim', async (req, res) => {
  const caseId = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(caseId)) return res.status(400).json({ error: 'Invalid case ID.' })

  try {
    const modCase = await prisma.moderationCase.findUnique({
      where: { id: caseId },
      select: { id: true, claimedByAdminId: true },
    })
    if (!modCase) return res.status(404).json({ error: 'Case not found.' })

    /* Only the claimer or super admin can unclaim */
    if (modCase.claimedByAdminId !== req.user.userId) {
      const isSuper = await isSuperAdmin(req.user.userId)
      if (!isSuper) {
        return res.status(403).json({ error: 'Only the claiming admin or super admin can release this claim.' })
      }
    }

    await prisma.moderationCase.update({
      where: { id: caseId },
      data: { claimedByAdminId: null, claimedAt: null },
    })

    res.json({ message: 'Claim released.', caseId })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* PATCH /cases/:id/review — Dismiss or confirm a case */
router.patch('/cases/:id/review', async (req, res) => {
  const caseId = Number.parseInt(req.params.id, 10)
  const action = String(req.body?.action || '').trim().toLowerCase()
  const reviewNote = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote.trim().slice(0, 500) : ''

  if (!Number.isFinite(caseId)) return res.status(400).json({ error: 'Invalid case ID.' })
  if (!['dismiss', 'confirm'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "dismiss" or "confirm".' })
  }

  try {
    const existing = await prisma.moderationCase.findUnique({
      where: { id: caseId },
      select: { id: true, status: true },
    })
    if (!existing) return res.status(404).json({ error: 'Case not found.' })

    const updated = await reviewCase({
      caseId,
      reviewedBy: req.user.userId,
      action,
      reviewNote,
    })

    res.json({
      message: action === 'dismiss' ? 'Case dismissed.' : 'Case confirmed.',
      case: updated,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* POST /strikes — Issue a strike to a user */
router.post('/strikes', async (req, res) => {
  const userId = Number.parseInt(req.body?.userId, 10)
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  const caseId = req.body?.caseId ? Number.parseInt(req.body.caseId, 10) : null

  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Valid userId is required.' })
  if (reason.length < 10) return res.status(400).json({ error: 'Reason must be at least 10 characters.' })
  if (reason.length > 1000) return res.status(400).json({ error: 'Reason must be 1000 characters or fewer.' })

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    /* Protect super admin from receiving strikes */
    if (await isSuperAdmin(userId)) {
      return res.status(403).json({ error: 'Cannot issue strikes to the super admin.', code: 'SUPER_ADMIN_PROTECTED' })
    }

    if (caseId) {
      const modCase = await prisma.moderationCase.findUnique({ where: { id: caseId }, select: { id: true } })
      if (!modCase) return res.status(404).json({ error: 'Moderation case not found.' })
    }

    const result = await issueStrike({ userId, reason, caseId })

    res.status(201).json({
      message: 'Strike issued.',
      strike: result.strike,
      activeStrikes: result.activeStrikes,
      restricted: result.restricted,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* GET /strikes — List strikes with optional userId filter */
router.get('/strikes', async (req, res) => {
  const page = parsePage(req.query.page)
  const skip = (page - 1) * PAGE_SIZE
  const where = {}

  if (req.query.userId) {
    const userId = Number.parseInt(req.query.userId, 10)
    if (Number.isFinite(userId)) where.userId = userId
  }

  try {
    const [strikes, total] = await Promise.all([
      prisma.strike.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        include: {
          user: { select: { id: true, username: true } },
          case: { select: { id: true, contentType: true, contentId: true } },
        },
      }),
      prisma.strike.count({ where }),
    ])

    res.json({
      strikes,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE) || 1,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
