const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { issueStrike, reviewCase } = require('../../lib/moderationEngine')
const { PAGE_SIZE, parsePage } = require('./moderation.constants')

const router = express.Router()

/* GET /cases — List moderation cases */
router.get('/cases', async (req, res) => {
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
