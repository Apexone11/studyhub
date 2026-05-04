/**
 * scholar.save.controller.js — Save / unsave a paper to a BookShelf.
 *
 * Reuses existing BookShelf / ShelfBook tables. The `ShelfBook` row gets
 * `sourceType='paper'` + `paperId=<canonicalId>`. We treat the canonical
 * id as the synthetic `volumeId` so the existing unique index
 * `(shelfId, volumeId)` continues to enforce dedupe.
 */

const log = require('../../lib/logger')
const { captureError } = require('../../monitoring/sentry')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const prisma = require('../../lib/prisma')
const service = require('./scholar.service')
const { CANONICAL_ID_RE } = require('./scholar.constants')

const DEFAULT_SHELF_NAME = 'Saved papers'

async function _getOrCreateDefaultShelf(userId) {
  const existing = await prisma.bookShelf.findFirst({
    where: { userId, name: DEFAULT_SHELF_NAME },
  })
  if (existing) return existing
  return prisma.bookShelf.create({
    data: {
      userId,
      name: DEFAULT_SHELF_NAME,
      visibility: 'private',
      description: 'Papers saved from Scholar',
    },
  })
}

async function savePaper(req, res) {
  try {
    const { paperId, shelfId } = req.body || {}
    if (typeof paperId !== 'string' || !CANONICAL_ID_RE.test(paperId)) {
      return sendError(res, 400, 'Invalid paperId.', ERROR_CODES.BAD_REQUEST)
    }
    let resolvedShelfId = null
    if (shelfId !== undefined && shelfId !== null) {
      const sid = Number.parseInt(shelfId, 10)
      if (!Number.isInteger(sid) || sid < 1) {
        return sendError(res, 400, 'Invalid shelfId.', ERROR_CODES.BAD_REQUEST)
      }
      const shelf = await prisma.bookShelf.findUnique({
        where: { id: sid },
        select: { id: true, userId: true },
      })
      if (!shelf || shelf.userId !== req.user.userId) {
        return sendError(res, 404, 'Shelf not found.', ERROR_CODES.NOT_FOUND)
      }
      resolvedShelfId = shelf.id
    } else {
      const shelf = await _getOrCreateDefaultShelf(req.user.userId)
      resolvedShelfId = shelf.id
    }

    // Look up the paper to populate human-readable fields. Cache it
    // first if not already.
    const paper = await service.getPaperDetail(paperId)
    if (!paper) {
      return sendError(res, 404, 'Paper not found.', ERROR_CODES.NOT_FOUND)
    }

    const firstAuthor =
      Array.isArray(paper.authors) && paper.authors.length > 0
        ? paper.authors[0].name || 'Unknown'
        : 'Unknown'

    // Upsert by (shelfId, volumeId) — we map paperId → volumeId for unique-key reuse.
    const row = await prisma.shelfBook.upsert({
      where: { shelfId_volumeId: { shelfId: resolvedShelfId, volumeId: paperId } },
      create: {
        shelfId: resolvedShelfId,
        volumeId: paperId,
        title: (paper.title || 'Untitled').slice(0, 500),
        author: firstAuthor.slice(0, 500),
        coverUrl: null,
        sourceType: 'paper',
        paperId,
      },
      update: {
        title: (paper.title || 'Untitled').slice(0, 500),
        author: firstAuthor.slice(0, 500),
        sourceType: 'paper',
        paperId,
      },
    })
    res.status(201).json({ saved: true, shelfId: resolvedShelfId, id: row.id })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.save.failed' }, 'Scholar save failed')
    return sendError(res, 500, 'Failed to save paper.', ERROR_CODES.INTERNAL)
  }
}

async function unsavePaper(req, res) {
  try {
    const paperId = req.params.paperId
    if (typeof paperId !== 'string' || !CANONICAL_ID_RE.test(paperId)) {
      return sendError(res, 400, 'Invalid paperId.', ERROR_CODES.BAD_REQUEST)
    }
    // Delete every ShelfBook row that points at this paper for shelves owned by the user.
    const userShelves = await prisma.bookShelf.findMany({
      where: { userId: req.user.userId },
      select: { id: true },
    })
    if (userShelves.length === 0) {
      return res.status(204).end()
    }
    await prisma.shelfBook.deleteMany({
      where: {
        shelfId: { in: userShelves.map((s) => s.id) },
        OR: [{ paperId }, { volumeId: paperId }],
      },
    })
    res.status(204).end()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    log.error({ err, event: 'scholar.unsave.failed' }, 'Scholar unsave failed')
    return sendError(res, 500, 'Failed to remove paper from shelf.', ERROR_CODES.INTERNAL)
  }
}

module.exports = { savePaper, unsavePaper }
