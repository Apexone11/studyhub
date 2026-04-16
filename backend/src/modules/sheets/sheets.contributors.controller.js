const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const optionalAuth = require('../../core/auth/optionalAuth')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { AUTHOR_SELECT, SHEET_STATUS } = require('./sheets.constants')
const { canReadSheet } = require('./sheets.service')

const router = express.Router()

function parseSheetId(raw) {
  const value = Number.parseInt(raw, 10)
  return Number.isInteger(value) && value > 0 ? value : null
}

/**
 * Resolves the lineage root for a sheet. The root is the oldest ancestor that
 * every fork in the tree shares, computed from `rootSheetId` when present and
 * otherwise from `forkOf`/`id` as a fallback.
 */
function resolveRootId(sheet) {
  return sheet.rootSheetId || sheet.forkOf || sheet.id
}

/**
 * GET /api/sheets/:id/contributors
 *
 * Returns the top contributors for a sheet's entire lineage (root + all forks).
 * A "contribution" is any SheetCommit authored by a user on any sheet that
 * shares the same rootSheetId as the requested sheet, excluding `fork_base`
 * commits (those are synthetic markers created when a fork is opened).
 */
router.get('/:id/contributors', optionalAuth, async (req, res) => {
  const sheetId = parseSheetId(req.params.id)
  if (!sheetId) {
    return sendError(res, 400, 'Invalid sheet id.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, status: true, rootSheetId: true, forkOf: true },
    })
    if (!sheet) return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    if (!canReadSheet(sheet, req.user || null)) {
      return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    }

    const rootId = resolveRootId(sheet)

    const lineageSheets = await prisma.studySheet.findMany({
      where: { OR: [{ id: rootId }, { rootSheetId: rootId }, { forkOf: rootId }] },
      select: { id: true },
    })
    const sheetIds = lineageSheets.map((s) => s.id)
    if (sheetIds.length === 0) {
      return res.json({ contributors: [], rootSheetId: rootId, lineageSize: 0 })
    }

    // Count non-fork_base commits grouped by author across the lineage.
    // Prisma 6 requires the `NOT: [{ field: value }]` array form, and
    // `orderBy: { _count: { <field>: ... } }` must use a concrete column
    // (the `_all` pseudo-field was removed in Prisma 6.19).
    const grouped = await prisma.sheetCommit.groupBy({
      by: ['userId'],
      where: {
        sheetId: { in: sheetIds },
        NOT: [{ kind: 'fork_base' }],
      },
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 12,
    })

    const userIds = grouped.map((row) => row.userId).filter((id) => id != null)
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: AUTHOR_SELECT,
        })
      : []
    const userMap = new Map(users.map((u) => [u.id, u]))

    const contributors = grouped
      .map((row) => ({
        user: userMap.get(row.userId) || null,
        commits: row._count.userId,
      }))
      .filter((entry) => entry.user)

    return res.json({
      contributors,
      rootSheetId: rootId,
      lineageSize: sheetIds.length,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

/**
 * GET /api/sheets/:id/fork-tree
 *
 * Returns the full fork lineage as a nested tree rooted at the earliest
 * ancestor of the requested sheet. Only published sheets are included, and
 * the node matching the requested id is flagged with `isCurrent: true`.
 * Unreadable sheets return 404 (matches the sheets.read pattern).
 */
router.get('/:id/fork-tree', optionalAuth, async (req, res) => {
  const sheetId = parseSheetId(req.params.id)
  if (!sheetId) {
    return sendError(res, 400, 'Invalid sheet id.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, status: true, rootSheetId: true, forkOf: true },
    })
    if (!sheet) return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    if (!canReadSheet(sheet, req.user || null)) {
      return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    }

    const rootId = resolveRootId(sheet)

    const nodes = await prisma.studySheet.findMany({
      where: {
        OR: [{ id: rootId }, { rootSheetId: rootId }, { forkOf: rootId }],
        status: SHEET_STATUS.PUBLISHED,
      },
      select: {
        id: true,
        title: true,
        status: true,
        forkOf: true,
        rootSheetId: true,
        forks: true,
        stars: true,
        createdAt: true,
        author: { select: AUTHOR_SELECT },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (nodes.length === 0) {
      return res.json({ root: null, count: 0 })
    }

    // Build an id -> node map, then stitch children under their parent. The
    // "root" is the node whose id equals rootId (or, if rootId is not itself
    // published, the earliest node in the result set).
    const byId = new Map()
    for (const node of nodes) {
      byId.set(node.id, {
        ...node,
        isCurrent: node.id === sheetId,
        children: [],
      })
    }
    for (const node of byId.values()) {
      if (node.forkOf && byId.has(node.forkOf)) {
        byId.get(node.forkOf).children.push(node)
      }
    }

    const root = byId.get(rootId) || nodes.map((n) => byId.get(n.id)).find((n) => !n.forkOf) || null

    return res.json({ root, count: nodes.length })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
