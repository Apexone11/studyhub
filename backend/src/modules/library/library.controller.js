/**
 * library.controller.js -- Handler functions for library routes.
 * Includes book search, book details, admin sync, shelves CRUD, reading progress,
 * bookmarks, and highlights management.
 */

const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { searchBooks, getBookDetail, syncPopularBooksToDB } = require('./library.service')
const {
  MAX_SHELVES_PER_USER,
  MAX_BOOKMARKS_PER_BOOK,
  MAX_HIGHLIGHTS_PER_BOOK,
} = require('./library.constants')

/**
 * GET /api/library/search
 * Search and browse books from Google Books API.
 */
async function searchBooksHandler(req, res) {
  const { search, category, page = 1, sort, language } = req.query

  try {
    const searchTerm = search || ''
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
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
    const shelves = await prisma.bookShelf.findMany({
      where: { userId: req.user.userId },
      include: {
        _count: { select: { books: true } },
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

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Shelf name is required.' })
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

    const updated = await prisma.bookShelf.update({
      where: { id: shelfId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description ? description.trim() : null }),
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
    const count = await prisma.bookBookmark.count({
      where: {
        userId: req.user.userId,
        volumeId,
      },
    })

    if (count >= MAX_BOOKMARKS_PER_BOOK) {
      return res
        .status(403)
        .json({ error: `Maximum of ${MAX_BOOKMARKS_PER_BOOK} bookmarks per book allowed.` })
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

/**
 * GET /api/library/highlights/:volumeId
 * Get user's highlights for a book.
 */
async function listHighlightsHandler(req, res) {
  const { volumeId } = req.params

  if (!volumeId || typeof volumeId !== 'string') {
    return res.status(400).json({ error: 'Invalid volume ID.' })
  }

  try {
    const highlights = await prisma.bookHighlight.findMany({
      where: {
        userId: req.user.userId,
        volumeId,
      },
      orderBy: { createdAt: 'asc' },
    })

    res.json({ highlights })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * POST /api/library/highlights
 * Create a highlight.
 */
async function createHighlightHandler(req, res) {
  const { volumeId, cfi, text, color, note, shared } = req.body

  if (!volumeId || typeof volumeId !== 'string') {
    return res.status(400).json({ error: 'Invalid volume ID.' })
  }

  if (!cfi || typeof cfi !== 'string' || !text || typeof text !== 'string') {
    return res.status(400).json({ error: 'CFI and text are required.' })
  }

  try {
    const count = await prisma.bookHighlight.count({
      where: {
        userId: req.user.userId,
        volumeId,
      },
    })

    if (count >= MAX_HIGHLIGHTS_PER_BOOK) {
      return res
        .status(403)
        .json({ error: `Maximum of ${MAX_HIGHLIGHTS_PER_BOOK} highlights per book allowed.` })
    }

    const highlight = await prisma.bookHighlight.create({
      data: {
        userId: req.user.userId,
        volumeId,
        cfi,
        text: text.trim(),
        color: color || '#FFEB3B',
        note: note ? note.trim() : null,
        shared: shared === true,
      },
    })

    res.status(201).json(highlight)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * PATCH /api/library/highlights/:id
 * Update a highlight (note, color, shared).
 */
async function updateHighlightHandler(req, res) {
  const highlightId = parseInt(req.params.id, 10)
  const { note, color, shared } = req.body

  if (!Number.isInteger(highlightId) || highlightId < 1) {
    return res.status(400).json({ error: 'Invalid highlight ID.' })
  }

  try {
    const highlight = await prisma.bookHighlight.findUnique({
      where: { id: highlightId },
    })

    if (!highlight) {
      return res.status(404).json({ error: 'Highlight not found.' })
    }

    if (highlight.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized.' })
    }

    const updated = await prisma.bookHighlight.update({
      where: { id: highlightId },
      data: {
        ...(note !== undefined && { note: note ? note.trim() : null }),
        ...(color !== undefined && { color }),
        ...(shared !== undefined && { shared: shared === true }),
      },
    })

    res.json(updated)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * DELETE /api/library/highlights/:id
 * Delete a highlight.
 */
async function deleteHighlightHandler(req, res) {
  const highlightId = parseInt(req.params.id, 10)

  if (!Number.isInteger(highlightId) || highlightId < 1) {
    return res.status(400).json({ error: 'Invalid highlight ID.' })
  }

  try {
    const highlight = await prisma.bookHighlight.findUnique({
      where: { id: highlightId },
    })

    if (!highlight) {
      return res.status(404).json({ error: 'Highlight not found.' })
    }

    if (highlight.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized.' })
    }

    await prisma.bookHighlight.delete({
      where: { id: highlightId },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
}

/**
 * GET /api/library/highlights/:volumeId/social
 * Get shared highlights from other users (excluding blocked users).
 */
async function getSocialHighlightsHandler(req, res) {
  const { volumeId } = req.params

  if (!volumeId || typeof volumeId !== 'string') {
    return res.status(400).json({ error: 'Invalid volume ID.' })
  }

  try {
    let blockedIds = []
    try {
      blockedIds = await getBlockedUserIds(prisma, req.user.userId)
    } catch {
      blockedIds = []
    }

    const highlights = await prisma.bookHighlight.findMany({
      where: {
        volumeId,
        shared: true,
        userId: {
          notIn: [...blockedIds, req.user.userId],
        },
      },
      include: {
        user: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    res.json(highlights)
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
  listHighlightsHandler,
  createHighlightHandler,
  updateHighlightHandler,
  deleteHighlightHandler,
  getSocialHighlightsHandler,
}
