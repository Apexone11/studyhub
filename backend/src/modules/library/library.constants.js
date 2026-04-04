/**
 * library.constants.js -- Configuration constants for the library module.
 * Uses Google Books API for search, metadata, and embedded viewer.
 */

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1'
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || ''

// Cache TTLs in milliseconds
const CACHE_TTL = {
  SEARCH: 60 * 60 * 1000, // 1 hour
  BOOK_DETAIL: 24 * 60 * 60 * 1000, // 24 hours
  COVER: 7 * 24 * 60 * 60 * 1000, // 7 days
}

const DEFAULT_PAGE_SIZE = 20 // Google Books max per request is 40
const MAX_SHELVES_PER_USER = 20
const MAX_BOOKMARKS_PER_USER_FREE = 50 // Free plan total bookmarks across all books
const MAX_HIGHLIGHTS_PER_BOOK = 200

// Google Books category mappings (for subject filter chips)
const CATEGORIES = [
  'Fiction',
  'Science',
  'History',
  'Philosophy',
  'Mathematics',
  'Poetry',
  'Drama',
  'Art',
  'Music',
  'Religion',
  'Biography & Autobiography',
  'Adventure',
  'Juvenile Fiction',
  'Law',
  'Medical',
]

module.exports = {
  GOOGLE_BOOKS_BASE,
  GOOGLE_BOOKS_API_KEY,
  CACHE_TTL,
  DEFAULT_PAGE_SIZE,
  MAX_SHELVES_PER_USER,
  MAX_BOOKMARKS_PER_USER_FREE,
  MAX_HIGHLIGHTS_PER_BOOK,
  CATEGORIES,
}
