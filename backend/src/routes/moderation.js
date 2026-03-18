/* ═══════════════════════════════════════════════════════════════════════════
 * moderation.js — Admin + user-facing moderation endpoints
 *
 * Two routers exported:
 *   adminRouter → mounted at /api/admin/moderation (requireAuth + requireAdmin)
 *   userRouter  → mounted at /api/moderation (requireAuth only)
 *
 * Admin endpoints: cases CRUD, strike issuance, appeal review, restriction management
 * User endpoints:  view own strikes/appeals, submit appeal
 * ═══════════════════════════════════════════════════════════════════════════ */
const express = require('express')
const rateLimit = require('express-rate-limit')
const requireAuth = require('../middleware/auth')
const requireAdmin = require('../middleware/requireAdmin')
const { captureError } = require('../monitoring/sentry')
const prisma = require('../lib/prisma')
const {
  issueStrike,
  reviewCase,
  countActiveStrikes,
  hasActiveRestriction,
} = require('../lib/moderationEngine')

const PAGE_SIZE = 20

/** Parse a page number from a query param, defaulting to 1. */
function parsePage(value) {
  const page = Number.parseInt(value, 10)
  return Number.isFinite(page) && page > 0 && page <= 10000 ? page : 1
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ADMIN ROUTER — /api/admin/moderation
 * ═══════════════════════════════════════════════════════════════════════════ */
const adminRouter = express.Router()
adminRouter.use(requireAuth)
adminRouter.use(requireAdmin)

/* ── GET /cases — List moderation cases ──────────────────────────────────── */
adminRouter.get('/cases', async (req, res) => {
  const status = req.query.status || 'pending'
  const page = parsePage(req.query.page)
  const skip = (page - 1) * PAGE_SIZE

  try {
    const where = status === 'all' ? {} : { status }
    const [cases, total] = await Promise.all([
      prisma.moderationCase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        include: {
          user: { select: { id: true, username: true } },
          reviewer: { select: { id: true, username: true } },
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

/* ── GET /cases/:id — Single case with related strikes and appeals ──────── */
adminRouter.get('/cases/:id', async (req, res) => {
  const caseId = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(caseId)) return res.status(400).json({ error: 'Invalid case ID.' })

  try {
    const modCase = await prisma.moderationCase.findUnique({
      where: { id: caseId },
      include: {
        user: { select: { id: true, username: true } },
        reviewer: { select: { id: true, username: true } },
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

/* ── PATCH /cases/:id/review — Dismiss or confirm a case ────────────────── */
adminRouter.patch('/cases/:id/review', async (req, res) => {
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

/* ── POST /strikes — Issue a strike to a user ────────────────────────────── */
adminRouter.post('/strikes', async (req, res) => {
  const userId = Number.parseInt(req.body?.userId, 10)
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  const caseId = req.body?.caseId ? Number.parseInt(req.body.caseId, 10) : null

  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Valid userId is required.' })
  if (reason.length < 10) return res.status(400).json({ error: 'Reason must be at least 10 characters.' })
  if (reason.length > 1000) return res.status(400).json({ error: 'Reason must be 1000 characters or fewer.' })

  try {
    /* Verify user exists */
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    /* Verify caseId exists if provided */
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

/* ── GET /strikes — List strikes with optional userId filter ─────────────── */
adminRouter.get('/strikes', async (req, res) => {
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

/* ── GET /restrictions — List user restrictions ──────────────────────────── */
adminRouter.get('/restrictions', async (req, res) => {
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

/* ── PATCH /restrictions/:id/lift — Lift a restriction ───────────────────── */
adminRouter.patch('/restrictions/:id/lift', async (req, res) => {
  const restrictionId = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(restrictionId)) return res.status(400).json({ error: 'Invalid restriction ID.' })

  try {
    const existing = await prisma.userRestriction.findUnique({
      where: { id: restrictionId },
      select: { id: true, userId: true, endsAt: true },
    })
    if (!existing) return res.status(404).json({ error: 'Restriction not found.' })

    /* Already lifted */
    if (existing.endsAt && existing.endsAt <= new Date()) {
      return res.json({ message: 'Restriction was already expired.', restriction: existing })
    }

    const updated = await prisma.userRestriction.update({
      where: { id: restrictionId },
      data: { endsAt: new Date() },
      include: { user: { select: { id: true, username: true } } },
    })

    /* Notify the user */
    try {
      await require('../lib/notify').createNotification(prisma, {
        userId: existing.userId,
        type: 'moderation',
        message: 'Your account restriction has been lifted.',
        actorId: null,
      })
    } catch { /* non-fatal */ }

    res.json({ message: 'Restriction lifted.', restriction: updated })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* ── GET /appeals — List appeals with status filter ──────────────────────── */
adminRouter.get('/appeals', async (req, res) => {
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

/* ── PATCH /appeals/:id/review — Approve or reject an appeal ─────────────── */
adminRouter.patch('/appeals/:id/review', async (req, res) => {
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
      /* Update appeal status */
      const updated = await prisma.appeal.update({
        where: { id: appealId },
        data: { status: 'approved', reviewedBy: req.user.userId, reviewNote },
      })

      /* Dismiss the linked case */
      if (appeal.caseId) {
        await prisma.moderationCase.update({
          where: { id: appeal.caseId },
          data: { status: 'dismissed', reviewedBy: req.user.userId, reviewNote: 'Dismissed via approved appeal.' },
        }).catch((err) => captureError(err, { context: 'appeal-case-dismiss', appealId }))
      }

      /* Decay the linked strike (find strike by caseId and userId) */
      await prisma.strike.updateMany({
        where: { caseId: appeal.caseId, userId: appeal.userId, decayedAt: null },
        data: { decayedAt: new Date() },
      }).catch((err) => captureError(err, { context: 'appeal-strike-decay', appealId }))

      /* Check if user should have restriction lifted (re-count active strikes) */
      const activeStrikes = await countActiveStrikes(appeal.userId)
      if (activeStrikes < 4) {
        /* Lift any auto-imposed full restrictions */
        await prisma.userRestriction.updateMany({
          where: {
            userId: appeal.userId,
            type: 'full',
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
          data: { endsAt: new Date() },
        }).catch((err) => captureError(err, { context: 'appeal-restriction-lift', appealId }))
      }

      /* Notify the user */
      try {
        await require('../lib/notify').createNotification(prisma, {
          userId: appeal.userId,
          type: 'moderation',
          message: 'Your appeal has been approved. The strike has been removed.',
          actorId: null,
        })
      } catch { /* non-fatal */ }

      return res.json({ message: 'Appeal approved. Strike decayed.', appeal: updated })
    }

    /* Reject */
    const updated = await prisma.appeal.update({
      where: { id: appealId },
      data: { status: 'rejected', reviewedBy: req.user.userId, reviewNote },
    })

    /* Notify the user */
    try {
      await require('../lib/notify').createNotification(prisma, {
        userId: appeal.userId,
        type: 'moderation',
        message: 'Your appeal has been reviewed and was not approved.',
        actorId: null,
      })
    } catch { /* non-fatal */ }

    res.json({ message: 'Appeal rejected.', appeal: updated })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* ═══════════════════════════════════════════════════════════════════════════
 * USER ROUTER — /api/moderation (authenticated, non-admin)
 * ═══════════════════════════════════════════════════════════════════════════ */
const userRouter = express.Router()
userRouter.use(requireAuth)

const appealLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many appeal submissions. Please try again later.' },
})

/* ── GET /my-strikes — User's own strikes and restriction status ─────────── */
userRouter.get('/my-strikes', async (req, res) => {
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

/* ── GET /my-appeals — User's own appeals ────────────────────────────────── */
userRouter.get('/my-appeals', async (req, res) => {
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

/* ── POST /appeals — Submit an appeal ────────────────────────────────────── */
userRouter.post('/appeals', appealLimiter, async (req, res) => {
  const caseId = Number.parseInt(req.body?.caseId, 10)
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''

  if (!Number.isFinite(caseId)) return res.status(400).json({ error: 'Valid caseId is required.' })
  if (reason.length < 20) {
    return res.status(400).json({ error: 'Appeal reason must be at least 20 characters.' })
  }
  if (reason.length > 2000) {
    return res.status(400).json({ error: 'Appeal reason must be 2000 characters or fewer.' })
  }

  try {
    /* Verify the case exists */
    const modCase = await prisma.moderationCase.findUnique({
      where: { id: caseId },
      select: { id: true, status: true },
    })
    if (!modCase) return res.status(404).json({ error: 'Moderation case not found.' })

    /* Verify user has a strike linked to this case */
    const linkedStrike = await prisma.strike.findFirst({
      where: { caseId, userId: req.user.userId, decayedAt: null },
      select: { id: true },
    })
    if (!linkedStrike) {
      return res.status(403).json({ error: 'You can only appeal cases linked to your own active strikes.' })
    }

    /* Check for existing pending appeal by this user on this case */
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
        reason,
      },
    })

    res.status(201).json({ message: 'Appeal submitted.', appeal })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/* ── Exports ─────────────────────────────────────────────────────────────── */
module.exports = { adminRouter, userRouter }
