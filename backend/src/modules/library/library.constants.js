/**
 * library.constants.js -- Configuration constants for the library module.
 */

const GUTENDEX_BASE = 'https://gutendex.com'
const OPENLIBRARY_BASE = 'https://openlibrary.org'
const OPENLIBRARY_COVERS = 'https://covers.openlibrary.org'

// Cache TTLs in milliseconds
const CACHE_TTL = {
  SEARCH: 60 * 60 * 1000, // 1 hour
  BOOK_DETAIL: 24 * 60 * 60 * 1000, // 24 hours
  COVER: 7 * 24 * 60 * 60 * 1000, // 7 days
}

const DEFAULT_PAGE_SIZE = 32 // Gutendex default
const MAX_SHELVES_PER_USER = 20
const MAX_BOOKMARKS_PER_BOOK = 50
const MAX_HIGHLIGHTS_PER_BOOK = 200

module.exports = {
  GUTENDEX_BASE,
  OPENLIBRARY_BASE,
  OPENLIBRARY_COVERS,
  CACHE_TTL,
  DEFAULT_PAGE_SIZE,
  MAX_SHELVES_PER_USER,
  MAX_BOOKMARKS_PER_BOOK,
  MAX_HIGHLIGHTS_PER_BOOK,
}
