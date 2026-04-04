/**
 * library.routes.js -- Express router for the library module.
 * Handles book search (Google Books API), shelves CRUD, reading progress,
 * bookmarks, and highlights. Volume IDs are Google Books string IDs.
 */

const express = require('express')
const requireAuth = require('../../middleware/auth')
const { captureError } = require('../../monitoring/sentry')
const prisma = require('../../lib/prisma')
const { getBlockedUserIds } = require('../../lib/social/blockFilter')
const { getAuthTokenFromRequest, verifyAuthToken } = require('../../lib/authTokens')
const { libraryWriteLimiter } = require('../../lib/rateLimiters')

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
  listHighlightsHandler,
  createHighlightHandler,
  updateHighlightHandler,
  deleteHighlightHandler,
  getSocialHighlightsHandler,
} = require('./library.controller')

const { searchBooks, getBookDetail, syncPopularBooksToDB } = require('./library.service')
const {
  MAX_SHELVES_PER_USER,
  MAX_BOOKMARKS_PER_USER_FREE,
  MAX_HIGHLIGHTS_PER_BOOK,
} = require('./library.constants')

/**
 * Optional auth -- sets req.user if a valid token is present, otherwise
 * proceeds as unauthenticated.
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

// ── BOOK BROWSING & SEARCH ──────────────────────────────────────────────────

/**
 * GET /api/library/search
 * Search and browse books from Google Books API.
 * Query params: search, category, page, sort, language
 */
router.get('/search', optionalAuth, searchBooksHandler)

/**
 * GET /api/library/books/:volumeId
 * Get detailed information about a specific book from Google Books.
 */
router.get('/books/:volumeId', optionalAuth, getBookDetailsHandler)

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
router.put('/reading-progress/:volumeId', requireAuth, libraryWriteLimiter, upsertReadingProgressHandler)

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

// ── HIGHLIGHTS ──────────────────────────────────────────────────────────────

/**
 * GET /api/library/highlights/:volumeId
 * Get user's highlights for a book.
 */
router.get('/highlights/:volumeId', requireAuth, listHighlightsHandler)

/**
 * POST /api/library/highlights
 * Create a highlight.
 * Body: { volumeId, cfi, text, color?, note?, shared? }
 */
router.post('/highlights', requireAuth, libraryWriteLimiter, createHighlightHandler)

/**
 * PATCH /api/library/highlights/:id
 * Update a highlight (note, color, shared).
 */
router.patch('/highlights/:id', requireAuth, libraryWriteLimiter, updateHighlightHandler)

/**
 * DELETE /api/library/highlights/:id
 * Delete a highlight.
 */
router.delete('/highlights/:id', requireAuth, libraryWriteLimiter, deleteHighlightHandler)

/**
 * GET /api/library/highlights/:volumeId/social
 * Get shared highlights from other users (excluding blocked users).
 */
router.get('/highlights/:volumeId/social', requireAuth, getSocialHighlightsHandler)

module.exports = router
