/**
 * library.service.js -- Service layer for book search, detail enrichment, and cover retrieval.
 */

const { GUTENDEX_BASE, OPENLIBRARY_BASE, OPENLIBRARY_COVERS, CACHE_TTL } = require('./library.constants')
const cache = require('./library.cache')
const { captureError } = require('../../monitoring/sentry')

/** Fetch with a timeout. Rejects if the response takes longer than `ms`. */
function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

/**
 * Search for books on Gutendex.
 * @param {string} query - Search term (title, author, etc.)
 * @param {number} page - Page number (1-indexed)
 * @param {object} filters - Optional filters (topic, sort, languages, etc.)
 * @returns {Promise<object|null>} Search results or null on error
 */
async function searchBooks(query, page = 1, filters = {}) {
  const cacheKey = `search:${query || ''}:${page}:${JSON.stringify(filters)}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  try {
    const params = new URLSearchParams()
    if (query && query.trim()) params.append('search', query.trim())
    if (filters.topic) params.append('topic', filters.topic)
    // Gutendex only accepts 'ascending' or 'descending'; 'popular' = default (omit)
    if (filters.sort && (filters.sort === 'ascending' || filters.sort === 'descending')) {
      params.append('sort', filters.sort)
    }
    if (filters.languages) params.append('languages', filters.languages)
    params.append('page', page)

    const url = `${GUTENDEX_BASE}/books/?${params.toString()}`
    const response = await fetchWithTimeout(url)

    if (!response.ok) {
      console.warn(`Gutendex search failed: ${response.status}`)
      return null
    }

    const data = await response.json()
    cache.set(cacheKey, data, CACHE_TTL.SEARCH)
    return data
  } catch (err) {
    captureError(err, { context: 'searchBooks', query, page })
    return null
  }
}

/**
 * Get detailed information about a single book from Gutendex.
 * Enriches with Open Library description if available.
 * @param {number} gutenbergId - Project Gutenberg book ID
 * @returns {Promise<object|null>} Book details or null on error
 */
async function getBookDetail(gutenbergId) {
  const cacheKey = `book:${gutenbergId}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  try {
    // Get basic book info from Gutendex
    const gutendexUrl = `${GUTENDEX_BASE}/books/${gutenbergId}/`
    const gutendexResponse = await fetchWithTimeout(gutendexUrl)

    if (!gutendexResponse.ok) {
      console.warn(`Gutendex book fetch failed: ${gutendexResponse.status}`)
      return null
    }

    const bookData = await gutendexResponse.json()

    // Enrich with Open Library but don't let it block/fail the response
    let enriched = bookData
    try {
      enriched = await enrichBookWithOpenLibrary(bookData)
    } catch {
      // Graceful degradation - return Gutendex data without enrichment
    }

    cache.set(cacheKey, enriched, CACHE_TTL.BOOK_DETAIL)
    return enriched
  } catch (err) {
    captureError(err, { context: 'getBookDetail', gutenbergId })
    return null
  }
}

/**
 * Enrich a book with Open Library metadata (description, cover, etc.).
 * @param {object} book - Gutendex book object
 * @returns {Promise<object>} Enriched book object
 */
async function enrichBookWithOpenLibrary(book) {
  try {
    if (!book.title || !book.authors || book.authors.length === 0) {
      return book
    }

    const title = encodeURIComponent(book.title)
    const author = book.authors.length > 0 ? encodeURIComponent(book.authors[0].name) : ''

    const searchUrl = `${OPENLIBRARY_BASE}/search.json?q=${title}&author=${author}&limit=1`
    const searchResponse = await fetchWithTimeout(searchUrl, 3000)

    if (!searchResponse.ok) {
      return book
    }

    const searchData = await searchResponse.json()

    if (!searchData.docs || searchData.docs.length === 0) {
      return book
    }

    const firstDoc = searchData.docs[0]
    const workKey = firstDoc.key

    if (!workKey) {
      return book
    }

    // Fetch the full work document for description
    const workUrl = `${OPENLIBRARY_BASE}${workKey}.json`
    const workResponse = await fetchWithTimeout(workUrl, 3000)

    if (workResponse.ok) {
      const workData = await workResponse.json()
      if (workData.description) {
        book.description = typeof workData.description === 'string' ? workData.description : workData.description.value
      }
    }

    return book
  } catch {
    // Graceful degradation: just return the original book if enrichment fails
    return book
  }
}

/**
 * Get the cover URL for a book.
 * Tries Gutendex first, then falls back to Open Library.
 * @param {number} gutenbergId - Project Gutenberg book ID
 * @param {string} size - Cover size for Open Library (small, medium, large)
 * @returns {Promise<string|null>} Cover URL or null
 */
async function getBookCoverUrl(gutenbergId, size = 'medium') {
  try {
    // Try Gutendex first
    const book = await getBookDetail(gutenbergId)
    if (book && book.formats && book.formats['image/jpeg']) {
      return book.formats['image/jpeg']
    }

    // Fall back to Open Library
    if (book && book.title && book.authors && book.authors.length > 0) {
      const title = encodeURIComponent(book.title)
      const author = encodeURIComponent(book.authors[0].name)

      const searchUrl = `${OPENLIBRARY_BASE}/search.json?q=${title}&author=${author}&limit=1`
      const searchResponse = await fetchWithTimeout(searchUrl, 3000)

      if (searchResponse.ok) {
        const searchData = await searchResponse.json()
        if (searchData.docs && searchData.docs.length > 0) {
          const firstDoc = searchData.docs[0]
          if (firstDoc.cover_id) {
            return `${OPENLIBRARY_COVERS}/b/id/${firstDoc.cover_id}-${size}.jpg`
          }
        }
      }
    }

    return null
  } catch (err) {
    captureError(err, { context: 'getBookCoverUrl', gutenbergId, size })
    return null
  }
}

module.exports = {
  searchBooks,
  getBookDetail,
  getBookCoverUrl,
}
