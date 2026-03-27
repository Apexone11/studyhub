const express = require('express')
const prisma = require('../../lib/prisma')
const { captureError } = require('../../monitoring/sentry')
const { optionalAuth, canReadSheet, parsePositiveInt } = require('./sheetLab.constants')

const router = express.Router()

const FORK_SELECT = {
  id: true,
  title: true,
  status: true,
  forkOf: true,
  rootSheetId: true,
  stars: true,
  forks: true,
  updatedAt: true,
  createdAt: true,
  author: { select: { id: true, username: true, avatarUrl: true } },
}

/**
 * GET /api/sheets/:id/lab/lineage
 *
 * Returns the full fork tree rooted at this sheet's ultimate ancestor.
 * Each node contains: id, title, owner, status, forks count, updatedAt.
 * The response also flags which node is the "current" sheet (the one the user is viewing).
 */
router.get('/:id/lab/lineage', optionalAuth, async (req, res) => {
  const sheetId = parsePositiveInt(req.params.id, 0)
  if (!sheetId) return res.status(400).json({ error: 'Invalid sheet ID.' })

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, forkOf: true, rootSheetId: true, status: true, userId: true },
    })

    if (!sheet) return res.status(404).json({ error: 'Sheet not found.' })
    if (!canReadSheet(sheet, req.user || null)) {
      return res.status(404).json({ error: 'Sheet not found.' })
    }

    // Resolve the root — either via rootSheetId, forkOf chain, or self if it's the root.
    const rootId = sheet.rootSheetId || sheet.forkOf || sheet.id

    // Fetch root sheet
    const root = await prisma.studySheet.findUnique({
      where: { id: rootId },
      select: FORK_SELECT,
    })

    if (!root) {
      // Root was deleted — treat the current sheet as the root
      const fallback = await prisma.studySheet.findUnique({
        where: { id: sheetId },
        select: FORK_SELECT,
      })
      return res.json({
        root: formatNode(fallback, sheetId),
        currentSheetId: sheetId,
      })
    }

    // Fetch all sheets in this lineage (forks of root + forks of forks).
    // We query all sheets whose rootSheetId matches, plus direct forks of root.
    const allForks = await prisma.studySheet.findMany({
      where: {
        OR: [
          { rootSheetId: rootId },
          { forkOf: rootId },
        ],
      },
      select: FORK_SELECT,
      orderBy: { createdAt: 'asc' },
    })

    // Build the tree in memory.
    const nodeMap = new Map()
    nodeMap.set(root.id, { ...formatNode(root, sheetId), children: [] })

    for (const fork of allForks) {
      if (!nodeMap.has(fork.id)) {
        nodeMap.set(fork.id, { ...formatNode(fork, sheetId), children: [] })
      }
    }

    // Wire parent → children
    for (const fork of allForks) {
      const parentId = fork.forkOf
      const child = nodeMap.get(fork.id)
      const parent = parentId ? nodeMap.get(parentId) : null
      if (parent && child) {
        parent.children.push(child)
      }
    }

    const rootNode = nodeMap.get(root.id)

    res.json({
      root: rootNode,
      currentSheetId: sheetId,
      totalForks: allForks.length,
    })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

function formatNode(sheet, currentSheetId) {
  return {
    id: sheet.id,
    title: sheet.title,
    status: sheet.status,
    forkOf: sheet.forkOf || null,
    stars: sheet.stars || 0,
    forks: sheet.forks || 0,
    updatedAt: sheet.updatedAt,
    createdAt: sheet.createdAt,
    author: sheet.author
      ? { id: sheet.author.id, username: sheet.author.username, avatarUrl: sheet.author.avatarUrl || null }
      : null,
    isCurrent: sheet.id === currentSheetId,
  }
}

module.exports = router
