/**
 * Sheet activity feed — union of commits, contributions, and comments
 * sorted by date. GET /api/sheets/:id/activity?page=1&limit=20
 */
const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const { optionalAuth, canReadSheet, parsePositiveInt } = require('../sheetLab/sheetLab.constants')
const { AUTHOR_SELECT } = require('./sheets.constants')
const { sheetActivityLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

router.get('/:id/activity', sheetActivityLimiter, optionalAuth, async (req, res) => {
  const sheetId = parsePositiveInt(req.params.id)
  const page = parsePositiveInt(req.query.page, 1)
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 50)

  if (!sheetId) {
    return res.status(400).json({ error: 'Sheet ID must be a positive integer.' })
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, status: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user)) {
      return res.status(403).json({ error: 'You do not have access to this sheet.' })
    }

    // Parallel fetch: commits, contributions, comments
    const [commits, contributions, comments] = await Promise.all([
      prisma.sheetCommit.findMany({
        where: { sheetId },
        select: {
          id: true,
          message: true,
          kind: true,
          checksum: true,
          createdAt: true,
          author: { select: AUTHOR_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        take: 100, // Fetch enough to merge-sort
      }),
      prisma.sheetContribution.findMany({
        where: { targetSheetId: sheetId },
        select: {
          id: true,
          status: true,
          message: true,
          createdAt: true,
          reviewedAt: true,
          proposer: { select: AUTHOR_SELECT },
          reviewer: { select: AUTHOR_SELECT },
          forkSheet: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.comment.findMany({
        where: { sheetId },
        select: {
          id: true,
          content: true,
          createdAt: true,
          author: { select: AUTHOR_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])

    // Normalize into unified activity items
    const items = []

    for (const c of commits) {
      items.push({
        type: 'commit',
        id: `commit-${c.id}`,
        date: c.createdAt,
        actor: c.author,
        message: c.message || 'Snapshot',
        meta: { kind: c.kind, checksum: c.checksum ? c.checksum.slice(0, 7) : null },
      })
    }

    for (const c of contributions) {
      // "Opened" event
      items.push({
        type: 'contribution_opened',
        id: `contrib-open-${c.id}`,
        date: c.createdAt,
        actor: c.proposer,
        message: c.message || 'Contribution submitted',
        meta: { contributionId: c.id, forkTitle: c.forkSheet?.title },
      })
      // "Reviewed" event (if reviewed)
      if (c.reviewedAt && c.reviewer) {
        items.push({
          type: c.status === 'accepted' ? 'contribution_merged' : 'contribution_rejected',
          id: `contrib-review-${c.id}`,
          date: c.reviewedAt,
          actor: c.reviewer,
          message: c.status === 'accepted'
            ? `Merged contribution from ${c.proposer?.username || 'unknown'}`
            : `Rejected contribution from ${c.proposer?.username || 'unknown'}`,
          meta: { contributionId: c.id },
        })
      }
    }

    for (const c of comments) {
      items.push({
        type: 'comment',
        id: `comment-${c.id}`,
        date: c.createdAt,
        actor: c.author,
        message: c.content ? (c.content.length > 120 ? c.content.slice(0, 120) + '...' : c.content) : '',
        meta: { commentId: c.id },
      })
    }

    // Sort by date descending
    items.sort((a, b) => new Date(b.date) - new Date(a.date))

    // Paginate
    const total = items.length
    const totalPages = Math.ceil(total / limit)
    const offset = (page - 1) * limit
    const paged = items.slice(offset, offset + limit)

    res.json({ items: paged, total, page, totalPages })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
