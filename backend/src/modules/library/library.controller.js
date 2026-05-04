/**
 * library.controller.js -- Handler functions for library routes.
 * Includes book search, book details, admin sync, shelves CRUD, reading progress,
 * and bookmarks management.
 */

const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { searchBooks, getBookDetail, syncPopularBooksToDB } = require('./library.service')
const { MAX_SHELVES_PER_USER } = require('./library.constants')
const { getUserPlan, isPro } = require('../../lib/getUserPlan')
const { getPlanConfig } = require('../payments/payments.constants')

const SHELF_VISIBILITY = new Set(['private', 'profile'])

function normalizeShelfVisibility(value) {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return SHELF_VISIBILITY.has(normalized) ? normalized : null
}

/**
 * GET /api/library/search
 * Search and browse books from Google Books API.
 */
async function searchBooksHandler(req, res) {
  const { search, category, page = 1, sort, language } = req.query

  try {
    const searchTerm = search || ''
    // Clamp pageNum to a sane upper bound. Google Books soft-caps deep
    // pagination around startIndex 200-400 anyway; without a cap, an
    // attacker can bloat the cap-discovery memo with absurd page numbers
    // (e.g. ?page=99999999) that never resolve to useful results.
    // CLAUDE.md A12: Number.parseInt + Number.isInteger.
    const MAX_PAGE_NUM = 200 // 200 * 20 = 4000 startIndex, well past any real cap
    const parsedPage = Number.parseInt(page, 10)
    const pageNum =
      Number.isInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, MAX_PAGE_NUM) : 1
    const filters = {}
    if (category) filters.category = category
    if (sort) filters.sort = sort
    if (language) filters.language = language

    const results = await searchBooks(searchTerm, pageNum, filters)

    const response = {
      books: results.results || [],
      totalCount: results.count || 0,
    }
    if (results._source === 'cache') response.source = 'cache'
    if (results._unavailable) response.unavailable = true
    if (results.endOfResults) {
      response.endOfResults = true
      response.lastReachablePage = results.lastReachablePage
    }
    res.json(response)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * GET /api/library/books/:volumeId
 * Get detailed information about a specific book from Google Books.
 */
async function getBookDetailsHandler(req, res) {
  const { volumeId } = req.params

  if (!volumeId || typeof volumeId !== 'string' || volumeId.length < 1) {
    return res.status(400).json({ error: 'Invalid volume ID.' })
  }

  try {
    const book = await getBookDetail(volumeId)

    if (!book) {
      return res.status(404).json({ error: 'Book not found.' })
    }

    res.json(book)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * POST /api/library/admin/sync-catalog
 * Trigger a sync of popular books to the CachedBook table.
 * Admin only.
 */
async function syncCatalogHandler(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' })
  }

  try {
    const synced = await syncPopularBooksToDB()
    res.json({ message: `Synced ${synced} books.`, synced })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Sync failed.' })
  }
}

/**
 * GET /api/library/shelves
 * List all shelves for the authenticated user.
 */
async function listShelvesHandler(req, res) {
  try {
    const includeBooks = req.query.includeBooks === 'true'
    const shelves = await prisma.bookShelf.findMany({
      where: { userId: req.user.userId },
      include: {
        _count: { select: { books: true } },
        ...(includeBooks ? { books: { orderBy: { addedAt: 'desc' }, take: 20 } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ shelves })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * POST /api/library/shelves
 * Create a new shelf.
 */
async function createShelfHandler(req, res) {
  const { name, description } = req.body
  const visibility = normalizeShelfVisibility(req.body?.visibility)

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Shelf name is required.' })
  }

  if (req.body?.visibility !== undefined && !visibility) {
    return res.status(400).json({ error: 'Shelf visibility must be private or profile.' })
  }

  try {
    const count = await prisma.bookShelf.count({
      where: { userId: req.user.userId },
    })

    if (count >= MAX_SHELVES_PER_USER) {
      return res.status(403).json({ error: `Maximum of ${MAX_SHELVES_PER_USER} shelves allowed.` })
    }

    const shelf = await prisma.bookShelf.create({
      data: {
        userId: req.user.userId,
        name: name.trim(),
        description: description ? description.trim() : null,
        visibility: visibility || 'private',
      },
    })

    res.status(201).json(shelf)
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A shelf with this name already exists.' })
    }
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * PATCH /api/library/shelves/:id
 * Update a shelf's name or description.
 */
async function updateShelfHandler(req, res) {
  const shelfId = parseInt(req.params.id, 10)
  const { name, description } = req.body
  const visibility = normalizeShelfVisibility(req.body?.visibility)

  if (!Number.isInteger(shelfId) || shelfId < 1) {
    return res.status(400).json({ error: 'Invalid shelf ID.' })
  }

  if (req.body?.visibility !== undefined && !visibility) {
    return res.status(400).json({ error: 'Shelf visibility must be private or profile.' })
  }

  try {
    const shelf = await prisma.bookShelf.findUnique({
      where: { id: shelfId },
    })

    if (!shelf) {
      return res.status(404).json({ error: 'Shelf not found.' })
    }

    if (shelf.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized.' })
    }

    const updated = await prisma.bookShelf.update({
      where: { id: shelfId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description ? description.trim() : null }),
        ...(visibility !== undefined && { visibility }),
      },
    })

    res.json(updated)
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A shelf with this name already exists.' })
    }
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * DELETE /api/library/shelves/:id
 * Delete a shelf (cascades to shelf books).
 */
async function deleteShelfHandler(req, res) {
  const shelfId = parseInt(req.params.id, 10)

  if (!Number.isInteger(shelfId) || shelfId < 1) {
    return res.status(400).json({ error: 'Invalid shelf ID.' })
  }

  try {
    const shelf = await prisma.bookShelf.findUnique({
      where: { id: shelfId },
    })

    if (!shelf) {
      return res.status(404).json({ error: 'Shelf not found.' })
    }

    if (shelf.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized.' })
    }

    await prisma.bookShelf.delete({
      where: { id: shelfId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * POST /api/library/shelves/:shelfId/books
 * Add a book to a shelf.
 */
async function addBookToShelfHandler(req, res) {
  const shelfId = parseInt(req.params.shelfId, 10)
  const { volumeId, title, author, coverUrl } = req.body

  if (!Number.isInteger(shelfId) || shelfId < 1) {
    return res.status(400).json({ error: 'Invalid shelf ID.' })
  }

  if (!volumeId || typeof volumeId !== 'string') {
    return res.status(400).json({ error: 'Invalid volume ID.' })
  }

  if (!title || typeof title !== 'string' || !author || typeof author !== 'string') {
    return res.status(400).json({ error: 'Title and author are required.' })
  }

  try {
    const shelf = await prisma.bookShelf.findUnique({
      where: { id: shelfId },
    })

    if (!shelf) {
      return res.status(404).json({ error: 'Shelf not found.' })
    }

    if (shelf.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized.' })
    }

    const shelfBook = await prisma.shelfBook.create({
      data: {
        shelfId,
        volumeId,
        title: title.trim(),
        author: author.trim(),
        coverUrl: coverUrl || null,
      },
    })

    res.status(201).json(shelfBook)
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'This book is already in the shelf.' })
    }
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * DELETE /api/library/shelves/:shelfId/books/:volumeId
 * Remove a book from a shelf.
 */
async function removeBookFromShelfHandler(req, res) {
  const shelfId = parseInt(req.params.shelfId, 10)
  const { volumeId } = req.params

  if (!Number.isInteger(shelfId) || shelfId < 1 || !volumeId) {
    return res.status(400).json({ error: 'Invalid shelf or volume ID.' })
  }

  try {
    const shelf = await prisma.bookShelf.findUnique({
      where: { id: shelfId },
    })

    if (!shelf) {
      return res.status(404).json({ error: 'Shelf not found.' })
    }

    if (shelf.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized.' })
    }

    await prisma.shelfBook.deleteMany({
      where: {
        shelfId,
        volumeId,
      },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * GET /api/library/reading-progress
 * Get all reading progress for the authenticated user.
 */
async function listReadingProgressHandler(req, res) {
  try {
    const progress = await prisma.readingProgress.findMany({
      where: { userId: req.user.userId },
      orderBy: { lastReadAt: 'desc' },
    })

    res.json(progress)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * GET /api/library/reading-progress/:volumeId
 * Get reading progress for a specific book.
 */
async function getReadingProgressHandler(req, res) {
  const { volumeId } = req.params

  if (!volumeId || typeof volumeId !== 'string') {
    return res.status(400).json({ error: 'Invalid volume ID.' })
  }

  try {
    const progress = await prisma.readingProgress.findUnique({
      where: {
        userId_volumeId: {
          userId: req.user.userId,
          volumeId,
        },
      },
    })

    if (!progress) return res.json(null)
    res.json(progress)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * PUT /api/library/reading-progress/:volumeId
 * Create or update reading progress for a book.
 */
async function upsertReadingProgressHandler(req, res) {
  const { volumeId } = req.params
  const { cfi, percentage } = req.body

  if (!volumeId || typeof volumeId !== 'string') {
    return res.status(400).json({ error: 'Invalid volume ID.' })
  }

  if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
    return res.status(400).json({ error: 'Percentage must be between 0 and 100.' })
  }

  try {
    const progress = await prisma.readingProgress.upsert({
      where: {
        userId_volumeId: {
          userId: req.user.userId,
          volumeId,
        },
      },
      update: {
        cfi: cfi || null,
        percentage,
        lastReadAt: new Date(),
      },
      create: {
        userId: req.user.userId,
        volumeId,
        cfi: cfi || null,
        percentage,
      },
    })

    res.json(progress)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * GET /api/library/bookmarks/:volumeId
 * Get bookmarks for a book (user's own).
 */
async function listBookmarksHandler(req, res) {
  const { volumeId } = req.params

  if (!volumeId || typeof volumeId !== 'string') {
    return res.status(400).json({ error: 'Invalid volume ID.' })
  }

  try {
    const bookmarks = await prisma.bookBookmark.findMany({
      where: {
        userId: req.user.userId,
        volumeId,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ bookmarks })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * POST /api/library/bookmarks
 * Create a bookmark.
 */
async function createBookmarkHandler(req, res) {
  const { volumeId, cfi, label, pageSnippet } = req.body

  if (!volumeId || typeof volumeId !== 'string') {
    return res.status(400).json({ error: 'Invalid volume ID.' })
  }

  if (!cfi || typeof cfi !== 'string') {
    return res.status(400).json({ error: 'CFI is required.' })
  }

  try {
    /* Check bookmark limit for free users (total across all books) */
    const userPlan = await getUserPlan(req.user.userId)
    // Derive limit from PLANS (Pro is `-1` = unlimited; free has a concrete
    // ceiling). Single source of truth replaces the local
    // MAX_BOOKMARKS_PER_USER_FREE constant.
    const planConfig = getPlanConfig(userPlan)
    const bookmarkLimit = planConfig.libraryBookmarks
    if (bookmarkLimit !== -1 && !isPro(userPlan)) {
      try {
        const totalCount = await prisma.bookBookmark.count({
          where: {
            userId: req.user.userId,
          },
        })

        if (totalCount >= bookmarkLimit) {
          return res.status(403).json({
            error: `Maximum of ${bookmarkLimit} bookmarks total allowed on your plan. Upgrade to Pro for unlimited bookmarks.`,
            code: 'BOOKMARK_LIMIT',
          })
        }
      } catch {
        // If quota check fails, gracefully degrade and allow the bookmark
      }
    }

    const bookmark = await prisma.bookBookmark.create({
      data: {
        userId: req.user.userId,
        volumeId,
        cfi,
        label: label ? label.trim() : null,
        pageSnippet: pageSnippet ? pageSnippet.trim() : null,
      },
    })

    res.status(201).json(bookmark)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * DELETE /api/library/bookmarks/:id
 * Delete a bookmark.
 */
async function deleteBookmarkHandler(req, res) {
  const bookmarkId = parseInt(req.params.id, 10)

  if (!Number.isInteger(bookmarkId) || bookmarkId < 1) {
    return res.status(400).json({ error: 'Invalid bookmark ID.' })
  }

  try {
    const bookmark = await prisma.bookBookmark.findUnique({
      where: { id: bookmarkId },
    })

    if (!bookmark) {
      return res.status(404).json({ error: 'Bookmark not found.' })
    }

    if (bookmark.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized.' })
    }

    await prisma.bookBookmark.delete({
      where: { id: bookmarkId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

module.exports = {
  searchBooksHandler,
  getBookDetailsHandler,
  syncCatalogHandler,
  listShelvesHandler,
  createShelfHandler,
  updateShelfHandler,
  deleteShelfHandler,
  addBookToShelfHandler,
  removeBookFromShelfHandler,
  listReadingProgressHandler,
  getReadingProgressHandler,
  upsertReadingProgressHandler,
  listBookmarksHandler,
  createBookmarkHandler,
  deleteBookmarkHandler,
}
