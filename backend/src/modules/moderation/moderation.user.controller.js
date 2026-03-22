const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { countActiveStrikes, hasActiveRestriction } = require('../../lib/moderationEngine')
const { appealLimiter } = require('./moderation.constants')

const router = express.Router()

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

/* POST /appeals — Submit an appeal */
router.post('/appeals', appealLimiter, async (req, res) => {
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
    const modCase = await prisma.moderationCase.findUnique({
      where: { id: caseId },
      select: { id: true, status: true },
    })
    if (!modCase) return res.status(404).json({ error: 'Moderation case not found.' })

    const linkedStrike = await prisma.strike.findFirst({
      where: { caseId, userId: req.user.userId, decayedAt: null },
      select: { id: true },
    })
    if (!linkedStrike) {
      return res.status(403).json({ error: 'You can only appeal cases linked to your own active strikes.' })
    }

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

module.exports = router
