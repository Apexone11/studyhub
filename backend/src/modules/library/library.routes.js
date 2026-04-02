/**
 * library.routes.js -- Express router for the library module.
 * Handles book search, shelves CRUD, reading progress, bookmarks, and highlights.
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../../lib/authTokens')
const { libraryWriteLimiter } = require('../../lib/rateLimiters')

const { searchBooks, getBookDetail, syncPopularBooksToDB } = require('./library.service')
const { MAX_SHELVES_PER_USER, MAX_BOOKMARKS_PER_BOOK, MAX_HIGHLIGHTS_PER_BOOK } = require('./library.constants')

/**
 * Optional auth -- sets req.user if a valid token is present, otherwise
 * proceeds as unauthenticated. Used for public-access endpoints like book
 * search and detail where auth is optional but enriches the response.
 */
function optionalAuth(req, res, next) {
  const token = getAuthTokenFromRequest(req)
  if (!token) return next()
  try {
    req.user = verifyAuthToken(token)
  } catch {
    // Invalid/expired token -- proceed as unauthenticated
  }
  next()
}

const router = express.Router()

/**
 * GET /api/library/covers/:id
 * Proxy a book cover image from Gutendex with caching.
 * No auth required. Serves images with long Cache-Control headers.
 */
router.get('/covers/:id', async (req, res) => {
  const gutenbergId = parseInt(req.params.id, 10)
  if (!Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid book ID.' })
  }

  try {
    const coverUrl = `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.cover.medium.jpg`
    const response = await fetch(coverUrl, {
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      return res.status(404).json({ error: 'Cover not found.' })
    }

    // Forward the image with aggressive cache headers
    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=604800, immutable')
    res.set('X-Cover-Source', 'gutenberg-proxy')

    // Stream the response body
    const arrayBuffer = await response.arrayBuffer()
    res.send(Buffer.from(arrayBuffer))
  } catch (err) {
    captureError(err, { context: 'coverProxy', gutenbergId })
    res.status(502).json({ error: 'Failed to fetch cover.' })
  }
})

/**
 * GET /api/library/books/:id/epub
 * Proxy an EPUB file from Project Gutenberg to avoid CORS issues.
 * Streams the file directly to the client. No auth required (public domain books).
 */
router.get('/books/:id/epub', async (req, res) => {
  const gutenbergId = parseInt(req.params.id, 10)
  if (!Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid book ID.' })
  }

  try {
    // Try the most common Gutenberg EPUB URL patterns
    const urls = [
      `https://www.gutenberg.org/ebooks/${gutenbergId}.epub3.images`,
      `https://www.gutenberg.org/ebooks/${gutenbergId}.epub.images`,
      `https://www.gutenberg.org/ebooks/${gutenbergId}.epub.noimages`,
      `https://www.gutenberg.org/ebooks/${gutenbergId}.epub3.noimages`,
    ]

    let epubResponse = null
    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(15000), // 15-second timeout per attempt
        })
        if (resp.ok) {
          const contentType = resp.headers.get('content-type') || ''
          // Accept EPUB or octet-stream content types
          if (
            contentType.includes('epub') ||
            contentType.includes('octet-stream') ||
            contentType === ''
          ) {
            epubResponse = resp
            break
          }
        }
      } catch {
        continue
      }
    }

    if (!epubResponse) {
      return res.status(404).json({ error: 'EPUB not available for this book.' })
    }

    res.setHeader('Content-Type', 'application/epub+zip')
    res.setHeader('Content-Disposition', `attachment; filename="book-${gutenbergId}.epub"`)
    res.setHeader('Cache-Control', 'public, max-age=86400') // Cache for 1 day

    // Stream the response body to the client with a 50 MB size limit
    const MAX_EPUB_SIZE = 50 * 1024 * 1024
    const reader = epubResponse.body.getReader()
    let totalBytes = 0
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          res.end()
          return
        }
        totalBytes += value.byteLength
        if (totalBytes > MAX_EPUB_SIZE) {
          reader.cancel()
          if (!res.headersSent) {
            res.status(413).json({ error: 'EPUB file too large.' })
          } else {
            res.end()
          }
          return
        }
        res.write(value)
      }
    }
    await pump()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to fetch EPUB.' })
    }
  }
})

// ── BOOK BROWSING & SEARCH ──────────────────────────────────────────────────

/**
 * GET /api/library/search
 * Search and browse books from Gutendex.
 * Query params: search, topic, page, sort, languages
 */
router.get('/search', optionalAuth, async (req, res) => {
  const { search, topic, page = 1, sort, languages } = req.query

  try {
    const searchTerm = search || ''
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const filters = {}
    if (topic) filters.topic = topic
    if (sort) filters.sort = sort
    if (languages) filters.languages = languages

    const results = await searchBooks(searchTerm, pageNum, filters)

    // Normalize Gutendex response shape for the frontend
    // searchBooks always returns a valid object (never null) with graceful fallback
    const response = {
      books: results.results || [],
      totalCount: results.count || 0,
      next: results.next || null,
      previous: results.previous || null,
    }
    // Signal to frontend when results came from local cache (Gutendex was unavailable)
    if (results._source === 'cache') response.source = 'cache'
    // Signal when both Gutendex AND cache are unavailable
    if (results._unavailable) response.unavailable = true
    res.json(response)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * GET /api/library/books/:id
 * Get detailed information about a specific book.
 */
router.get('/books/:id', optionalAuth, async (req, res) => {
  const gutenbergId = parseInt(req.params.id, 10)

  if (!Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid book ID.' })
  }

  try {
    const book = await getBookDetail(gutenbergId)

    if (!book) {
      return res.status(404).json({ error: 'Book not found.' })
    }

    res.json(book)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── ADMIN OPERATIONS ───────────────────────────────────────────────────────

/**
 * POST /api/library/admin/sync-catalog
 * Trigger a sync of popular books to the CachedBook table.
 * Admin only.
 */
router.post('/admin/sync-catalog', requireAuth, async (req, res) => {
  // Check admin role
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
})

// ── SHELVES CRUD ────────────────────────────────────────────────────────────

/**
 * GET /api/library/shelves
 * List all shelves for the authenticated user.
 */
router.get('/shelves', requireAuth, async (req, res) => {
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
})

/**
 * POST /api/library/shelves
 * Create a new shelf.
 * Body: { name, description? }
 */
router.post('/shelves', requireAuth, libraryWriteLimiter, async (req, res) => {
  const { name, description } = req.body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Shelf name is required.' })
  }

  try {
    // Check shelf count limit
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
      // Unique constraint violation: shelf name already exists for this user
      return res.status(409).json({ error: 'A shelf with this name already exists.' })
    }

    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PATCH /api/library/shelves/:id
 * Update a shelf's name or description.
 * Body: { name?, description? }
 */
router.patch('/shelves/:id', requireAuth, libraryWriteLimiter, async (req, res) => {
  const shelfId = parseInt(req.params.id, 10)
  const { name, description } = req.body

  if (!Number.isInteger(shelfId) || shelfId < 1) {
    return res.status(400).json({ error: 'Invalid shelf ID.' })
  }

  try {
    // Verify ownership
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
})

/**
 * DELETE /api/library/shelves/:id
 * Delete a shelf (cascades to shelf books).
 */
router.delete('/shelves/:id', requireAuth, libraryWriteLimiter, async (req, res) => {
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
})

/**
 * POST /api/library/shelves/:shelfId/books
 * Add a book to a shelf.
 * Body: { gutenbergId, title, author, coverUrl? }
 */
router.post('/shelves/:shelfId/books', requireAuth, libraryWriteLimiter, async (req, res) => {
  const shelfId = parseInt(req.params.shelfId, 10)
  const { gutenbergId, title, author, coverUrl } = req.body

  if (!Number.isInteger(shelfId) || shelfId < 1) {
    return res.status(400).json({ error: 'Invalid shelf ID.' })
  }

  if (!Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid book ID.' })
  }

  if (!title || typeof title !== 'string' || !author || typeof author !== 'string') {
    return res.status(400).json({ error: 'Title and author are required.' })
  }

  try {
    // Verify shelf ownership
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
        gutenbergId,
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
})

/**
 * DELETE /api/library/shelves/:shelfId/books/:gutenbergId
 * Remove a book from a shelf.
 */
router.delete('/shelves/:shelfId/books/:gutenbergId', requireAuth, libraryWriteLimiter, async (req, res) => {
  const shelfId = parseInt(req.params.shelfId, 10)
  const gutenbergId = parseInt(req.params.gutenbergId, 10)

  if (!Number.isInteger(shelfId) || shelfId < 1 || !Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid shelf or book ID.' })
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
        gutenbergId,
      },
    })

    res.status(204).send()
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── READING PROGRESS ────────────────────────────────────────────────────────

/**
 * GET /api/library/reading-progress
 * Get all reading progress for the authenticated user.
 */
router.get('/reading-progress', requireAuth, async (req, res) => {
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
})

/**
 * GET /api/library/reading-progress/:gutenbergId
 * Get reading progress for a specific book.
 */
router.get('/reading-progress/:gutenbergId', requireAuth, async (req, res) => {
  const gutenbergId = parseInt(req.params.gutenbergId, 10)

  if (!Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid book ID.' })
  }

  try {
    const progress = await prisma.readingProgress.findUnique({
      where: {
        userId_gutenbergId: {
          userId: req.user.userId,
          gutenbergId,
        },
      },
    })

    if (!progress) return res.json(null)
    res.json(progress)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * PUT /api/library/reading-progress/:gutenbergId
 * Create or update reading progress for a book.
 * Body: { cfi?, percentage }
 */
router.put('/reading-progress/:gutenbergId', requireAuth, libraryWriteLimiter, async (req, res) => {
  const gutenbergId = parseInt(req.params.gutenbergId, 10)
  const { cfi, percentage } = req.body

  if (!Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid book ID.' })
  }

  if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
    return res.status(400).json({ error: 'Percentage must be between 0 and 100.' })
  }

  try {
    const progress = await prisma.readingProgress.upsert({
      where: {
        userId_gutenbergId: {
          userId: req.user.userId,
          gutenbergId,
        },
      },
      update: {
        cfi: cfi || null,
        percentage,
        lastReadAt: new Date(),
      },
      create: {
        userId: req.user.userId,
        gutenbergId,
        cfi: cfi || null,
        percentage,
      },
    })

    res.json(progress)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

// ── BOOKMARKS ───────────────────────────────────────────────────────────────

/**
 * GET /api/library/bookmarks/:gutenbergId
 * Get bookmarks for a book (user's own).
 */
router.get('/bookmarks/:gutenbergId', requireAuth, async (req, res) => {
  const gutenbergId = parseInt(req.params.gutenbergId, 10)

  if (!Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid book ID.' })
  }

  try {
    const bookmarks = await prisma.bookBookmark.findMany({
      where: {
        userId: req.user.userId,
        gutenbergId,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ bookmarks })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/library/bookmarks
 * Create a bookmark.
 * Body: { gutenbergId, cfi, label?, pageSnippet? }
 */
router.post('/bookmarks', requireAuth, libraryWriteLimiter, async (req, res) => {
  const { gutenbergId, cfi, label, pageSnippet } = req.body

  if (!Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid book ID.' })
  }

  if (!cfi || typeof cfi !== 'string') {
    return res.status(400).json({ error: 'CFI is required.' })
  }

  try {
    // Check bookmark count limit
    const count = await prisma.bookBookmark.count({
      where: {
        userId: req.user.userId,
        gutenbergId,
      },
    })

    if (count >= MAX_BOOKMARKS_PER_BOOK) {
      return res.status(403).json({ error: `Maximum of ${MAX_BOOKMARKS_PER_BOOK} bookmarks per book allowed.` })
    }

    const bookmark = await prisma.bookBookmark.create({
      data: {
        userId: req.user.userId,
        gutenbergId,
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
})

/**
 * DELETE /api/library/bookmarks/:id
 * Delete a bookmark.
 */
router.delete('/bookmarks/:id', requireAuth, libraryWriteLimiter, async (req, res) => {
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
})

// ── HIGHLIGHTS ──────────────────────────────────────────────────────────────

/**
 * GET /api/library/highlights/:gutenbergId
 * Get user's highlights for a book.
 */
router.get('/highlights/:gutenbergId', requireAuth, async (req, res) => {
  const gutenbergId = parseInt(req.params.gutenbergId, 10)

  if (!Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid book ID.' })
  }

  try {
    const highlights = await prisma.bookHighlight.findMany({
      where: {
        userId: req.user.userId,
        gutenbergId,
      },
      orderBy: { createdAt: 'asc' },
    })

    res.json({ highlights })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

/**
 * POST /api/library/highlights
 * Create a highlight.
 * Body: { gutenbergId, cfi, text, color?, note?, shared? }
 */
router.post('/highlights', requireAuth, libraryWriteLimiter, async (req, res) => {
  const { gutenbergId, cfi, text, color, note, shared } = req.body

  if (!Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid book ID.' })
  }

  if (!cfi || typeof cfi !== 'string' || !text || typeof text !== 'string') {
    return res.status(400).json({ error: 'CFI and text are required.' })
  }

  try {
    // Check highlight count limit
    const count = await prisma.bookHighlight.count({
      where: {
        userId: req.user.userId,
        gutenbergId,
      },
    })

    if (count >= MAX_HIGHLIGHTS_PER_BOOK) {
      return res.status(403).json({ error: `Maximum of ${MAX_HIGHLIGHTS_PER_BOOK} highlights per book allowed.` })
    }

    const highlight = await prisma.bookHighlight.create({
      data: {
        userId: req.user.userId,
        gutenbergId,
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
})

/**
 * PATCH /api/library/highlights/:id
 * Update a highlight (note, color, shared).
 * Body: { note?, color?, shared? }
 */
router.patch('/highlights/:id', requireAuth, libraryWriteLimiter, async (req, res) => {
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
})

/**
 * DELETE /api/library/highlights/:id
 * Delete a highlight.
 */
router.delete('/highlights/:id', requireAuth, libraryWriteLimiter, async (req, res) => {
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
})

/**
 * GET /api/library/highlights/:gutenbergId/social
 * Get shared highlights from other users (excluding blocked users).
 */
router.get('/highlights/:gutenbergId/social', requireAuth, async (req, res) => {
  const gutenbergId = parseInt(req.params.gutenbergId, 10)

  if (!Number.isInteger(gutenbergId) || gutenbergId < 1) {
    return res.status(400).json({ error: 'Invalid book ID.' })
  }

  try {
    // Get blocked user IDs
    let blockedIds = []
    try {
      blockedIds = await getBlockedUserIds(prisma, req.user.userId)
    } catch {
      // Graceful degradation: proceed without block filtering
      blockedIds = []
    }

    const highlights = await prisma.bookHighlight.findMany({
      where: {
        gutenbergId,
        shared: true,
        userId: {
          notIn: [...blockedIds, req.user.userId], // Exclude blocked users and self
        },
      },
      include: {
        user: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit results for performance
    })

    res.json(highlights)
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})

module.exports = router
