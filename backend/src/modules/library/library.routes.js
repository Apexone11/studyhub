/**
 * library.routes.js -- Express router for the library module.
 * Handles book search (Google Books API), shelves CRUD, reading progress,
 * and bookmarks. Volume IDs are Google Books string IDs.
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const optionalAuth = require('../../core/auth/optionalAuth')
const { libraryWriteLimiter, libraryReadLimiter } = require('../../lib/rateLimiters')
const { cacheControl } = require('../../lib/cacheControl')

const {
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
} = require('./library.controller')

const router = express.Router()

// ── BOOK BROWSING & SEARCH ──────────────────────────────────────────────────

/**
 * GET /api/library/search
 * Search and browse books from Google Books API.
 * Query params: search, category, page, sort, language
 *
 * 5-min browser cache. Google Books results are stable on the timescale
 * of minutes and the upstream API is slow + rate-limited, so caching at
 * the browser level saves both Google Books quota and our compute.
 * Private (no shared CDN cache) per the Cloudflare/Vary caveat documented
 * in courses.schools.controller.js.
 */
router.get(
  '/search',
  cacheControl(300, { staleWhileRevalidate: 600 }),
  libraryReadLimiter,
  optionalAuth,
  searchBooksHandler,
)

/**
 * GET /api/library/books/:volumeId
 * Get detailed information about a specific book from Google Books.
 *
 * 10-min browser cache. Volume metadata changes very rarely (it's
 * Google Books data keyed by an immutable volume ID).
 */
router.get(
  '/books/:volumeId',
  cacheControl(600, { staleWhileRevalidate: 1800 }),
  libraryReadLimiter,
  optionalAuth,
  getBookDetailsHandler,
)

// ── ADMIN OPERATIONS ───────────────────────────────────────────────────────

/**
 * POST /api/library/admin/sync-catalog
 * Trigger a sync of popular books to the CachedBook table.
 * Admin only.
 */
router.post('/admin/sync-catalog', requireAuth, syncCatalogHandler)

// ── SHELVES CRUD ────────────────────────────────────────────────────────────

/**
 * GET /api/library/shelves
 * List all shelves for the authenticated user.
 */
router.get('/shelves', requireAuth, listShelvesHandler)

/**
 * POST /api/library/shelves
 * Create a new shelf.
 * Body: { name, description? }
 */
router.post('/shelves', requireAuth, libraryWriteLimiter, createShelfHandler)

/**
 * PATCH /api/library/shelves/:id
 * Update a shelf's name or description.
 */
router.patch('/shelves/:id', requireAuth, libraryWriteLimiter, updateShelfHandler)

/**
 * DELETE /api/library/shelves/:id
 * Delete a shelf (cascades to shelf books).
 */
router.delete('/shelves/:id', requireAuth, libraryWriteLimiter, deleteShelfHandler)

/**
 * POST /api/library/shelves/:shelfId/books
 * Add a book to a shelf.
 * Body: { volumeId, title, author, coverUrl? }
 */
router.post('/shelves/:shelfId/books', requireAuth, libraryWriteLimiter, addBookToShelfHandler)

/**
 * DELETE /api/library/shelves/:shelfId/books/:volumeId
 * Remove a book from a shelf.
 */
router.delete(
  '/shelves/:shelfId/books/:volumeId',
  requireAuth,
  libraryWriteLimiter,
  removeBookFromShelfHandler,
)

// ── READING PROGRESS ────────────────────────────────────────────────────────

/**
 * GET /api/library/reading-progress
 * Get all reading progress for the authenticated user.
 */
router.get('/reading-progress', requireAuth, listReadingProgressHandler)

/**
 * GET /api/library/reading-progress/:volumeId
 * Get reading progress for a specific book.
 */
router.get('/reading-progress/:volumeId', requireAuth, getReadingProgressHandler)

/**
 * PUT /api/library/reading-progress/:volumeId
 * Create or update reading progress for a book.
 * Body: { cfi?, percentage }
 */
router.put(
  '/reading-progress/:volumeId',
  requireAuth,
  libraryWriteLimiter,
  upsertReadingProgressHandler,
)

// ── BOOKMARKS ───────────────────────────────────────────────────────────────

/**
 * GET /api/library/bookmarks/:volumeId
 * Get bookmarks for a book (user's own).
 */
router.get('/bookmarks/:volumeId', requireAuth, listBookmarksHandler)

/**
 * POST /api/library/bookmarks
 * Create a bookmark.
 * Body: { volumeId, cfi, label?, pageSnippet? }
 */
router.post('/bookmarks', requireAuth, libraryWriteLimiter, createBookmarkHandler)

/**
 * DELETE /api/library/bookmarks/:id
 * Delete a bookmark.
 */
router.delete('/bookmarks/:id', requireAuth, libraryWriteLimiter, deleteBookmarkHandler)

module.exports = router
