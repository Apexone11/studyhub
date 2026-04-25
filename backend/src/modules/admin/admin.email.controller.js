const express = require('express')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { PAGE_SIZE, parsePage, parseSuppressionStatus } = require('./admin.constants')

const router = express.Router()

// ── GET /api/admin/email-suppressions?status=active|inactive|all&page=1&q=mail ──
router.get('/email-suppressions', async (req, res) => {
  const page = parsePage(req.query.page)
  const status = parseSuppressionStatus(req.query.status)
  const query = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : ''

  const where = {}
  if (status === 'active') where.active = true
  if (status === 'inactive') where.active = false
  if (query) {
    where.email = {
      contains: query,
      mode: 'insensitive',
    }
  }

  try {
    const [suppressions, total] = await Promise.all([
      prisma.emailSuppression.findMany({
        where,
        orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.emailSuppression.count({ where }),
    ])

    return res.json({
      suppressions,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
      status,
      query,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

// ── PATCH /api/admin/email-suppressions/:id/unsuppress ───────────────────────
router.patch('/email-suppressions/:id/unsuppress', async (req, res) => {
  const suppressionId = parseInt(req.params.id, 10)
  if (!Number.isInteger(suppressionId)) {
    return res.status(400).json({ error: 'Suppression id must be an integer.' })
  }

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (reason.length < 8) {
    return res
      .status(400)
      .json({ error: 'Provide an unsuppress reason with at least 8 characters.' })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.emailSuppression.findUnique({
        where: { id: suppressionId },
      })

      if (!current) {
        return { notFound: true }
      }

      if (!current.active) {
        return { alreadyUnsuppressed: true, suppression: current }
      }

      const updated = await tx.emailSuppression.update({
        where: { id: suppressionId },
        data: { active: false },
      })

      await tx.emailSuppressionAudit.create({
        data: {
          suppressionId,
          action: 'manual-unsuppress',
          reason,
          performedByUserId: req.user.userId,
          context: {
            previousReason: current.reason,
            previousSourceEventType: current.sourceEventType,
            previousSourceEventId: current.sourceEventId,
          },
        },
      })

      return { suppression: updated }
    })

    if (result.notFound) {
      return res.status(404).json({ error: 'Suppression record not found.' })
    }

    if (result.alreadyUnsuppressed) {
      return res.status(400).json({ error: 'Suppression is already inactive.' })
    }

    return res.json({
      message: 'Recipient unsuppressed successfully.',
      suppression: result.suppression,
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

// ── GET /api/admin/email-suppressions/:id/audit?page=1 ───────────────────────
router.get('/email-suppressions/:id/audit', async (req, res) => {
  const suppressionId = parseInt(req.params.id, 10)
  if (!Number.isInteger(suppressionId)) {
    return res.status(400).json({ error: 'Suppression id must be an integer.' })
  }

  const page = parsePage(req.query.page)

  try {
    const suppression = await prisma.emailSuppression.findUnique({
      where: { id: suppressionId },
      select: { id: true, email: true, active: true },
    })

    if (!suppression) {
      return res.status(404).json({ error: 'Suppression record not found.' })
    }

    const [entries, total] = await Promise.all([
      prisma.emailSuppressionAudit.findMany({
        where: { suppressionId },
        orderBy: { createdAt: 'desc' },
        include: {
          performedBy: {
            select: { id: true, username: true },
          },
        },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.emailSuppressionAudit.count({ where: { suppressionId } }),
    ])

    return res.json({
      suppression,
      entries,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
    })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    return res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
