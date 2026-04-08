/**
 * library.service.js -- Service layer for Google Books API search, detail, and caching.
 */

const {
  GOOGLE_BOOKS_BASE,
  GOOGLE_BOOKS_API_KEY,
  CACHE_TTL,
  DEFAULT_PAGE_SIZE,
} = require('./library.constants')
const cache = require('./library.cache')
const { captureError } = require('../../monitoring/sentry')
const sanitizeHtml = require('sanitize-html')

const BOOK_DESCRIPTION_TRANSFORM = sanitizeHtml.simpleTransform(
  'a',
  { rel: 'noopener noreferrer', target: '_blank' },
  true,
)

function sanitizeBookDescription(description) {
  if (!description || typeof description !== 'string') return null

  const sanitized = sanitizeHtml(description, {
    allowedTags: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'a'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: BOOK_DESCRIPTION_TRANSFORM,
    },
  }).trim()

  return sanitized || null
}

function createHttpStatusError(message, statusCode) {
  const error = new Error(message)
  error.status = statusCode
  error.statusCode = statusCode
  return error
}

/** Fetch with a timeout. Rejects if the response takes longer than `ms`. */
function fetchWithTimeout(url, ms = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

/** Fetch with one automatic retry on network/timeout failure. */
async function fetchWithRetry(url, ms = 10000) {
  try {
    return await fetchWithTimeout(url, ms)
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'ECONNRESET' || err.code === 'ENOTFOUND') {
      return fetchWithTimeout(url, ms)
    }
    throw err
  }
}

/**
 * Transform a Google Books volume item into our normalized book format.
 * @param {object} item - Google Books API volume item
 * @returns {object} Normalized book object
 */
function normalizeVolume(item) {
  if (!item) return null
  const info = item.volumeInfo || {}
  const accessInfo = item.accessInfo || {}
  return {
    volumeId: item.id,
    title: info.title || 'Untitled',
    authors: info.authors || [],
    categories: info.categories || [],
    language: info.language || 'en',
    pageCount: info.pageCount || 0,
    coverUrl: info.imageLinks
      ? info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || null
      : null,
    previewLink: info.previewLink || null,
    description: sanitizeBookDescription(info.description),
    publishedDate: info.publishedDate || null,
    averageRating: info.averageRating || null,
    ratingsCount: info.ratingsCount || 0,
    publisher: info.publisher || null,
    // Access info for the embedded viewer
    viewability: accessInfo.viewability || 'NO_PAGES',
    embeddable: accessInfo.embeddable || false,
    webReaderLink: accessInfo.webReaderLink || null,
  }
}

/**
 * Search for books on Google Books API.
 * @param {string} query - Search term (title, author, etc.)
 * @param {number} page - Page number (1-indexed)
 * @param {object} filters - Optional filters (category, sort, language)
 * @returns {Promise<object>} Search results
 */
async function searchBooks(query, page = 1, filters = {}) {
  const cacheKey = `search:${query || ''}:${page}:${JSON.stringify(filters)}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  try {
    const params = new URLSearchParams()

    // Build the query string
    let q = query && query.trim() ? query.trim() : ''
    if (filters.category) {
      q = q ? `${q}+subject:${filters.category}` : `subject:${filters.category}`
    }
    // If no query and no category, search for general popular books
    if (!q) q = 'subject:fiction'
    params.append('q', q)

    // Pagination: Google Books uses startIndex (0-indexed) and maxResults
    const startIndex = (page - 1) * DEFAULT_PAGE_SIZE
    params.append('startIndex', startIndex)
    params.append('maxResults', DEFAULT_PAGE_SIZE)

    // Sort: Google Books supports 'relevance' (default) or 'newest'
    if (filters.sort === 'newest') {
      params.append('orderBy', 'newest')
    } else {
      params.append('orderBy', 'relevance')
    }

    // Language restriction
    if (filters.language && filters.language !== 'all') {
      params.append('langRestrict', filters.language)
    }

    // Filter to only show books (not magazines)
    params.append('printType', 'books')

    // Prefer books with preview available
    if (filters.previewOnly) {
      params.append('filter', 'partial')
    }

    if (GOOGLE_BOOKS_API_KEY) {
      params.append('key', GOOGLE_BOOKS_API_KEY)
    }

    const url = `${GOOGLE_BOOKS_BASE}/volumes?${params.toString()}`
    const response = await fetchWithRetry(url)

    if (!response.ok) {
      captureError(createHttpStatusError(`Google Books search failed: ${response.status}`, response.status), {
        context: 'searchBooks',
        query,
        page,
        statusCode: response.status,
      })
      const fallback = await searchCachedBooks(query, page, filters)
      if (fallback && fallback.results && fallback.results.length > 0) {
        fallback._source = 'cache'
        return fallback
      }
      return { results: [], count: 0, _unavailable: true }
    }

    const data = await response.json()
    const results = (data.items || []).map(normalizeVolume)
    const totalCount = data.totalItems || 0

    const result = { results, count: totalCount }
    cache.set(cacheKey, result, CACHE_TTL.SEARCH)
    return result
  } catch (err) {
    captureError(err, { context: 'searchBooks', query, page })
    const fallback = await searchCachedBooks(query, page, filters)
    if (fallback && fallback.results && fallback.results.length > 0) {
      fallback._source = 'cache'
      return fallback
    }
    return { results: [], count: 0, _unavailable: true }
  }
}

/**
 * Get detailed information about a single book from Google Books API.
 * @param {string} volumeId - Google Books volume ID
 * @returns {Promise<object|null>} Book details or null on error
 */
async function getBookDetail(volumeId) {
  const cacheKey = `book:${volumeId}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  try {
    const params = new URLSearchParams()
    if (GOOGLE_BOOKS_API_KEY) {
      params.append('key', GOOGLE_BOOKS_API_KEY)
    }

    const url = `${GOOGLE_BOOKS_BASE}/volumes/${volumeId}?${params.toString()}`
    const response = await fetchWithRetry(url)

    if (!response.ok) {
      captureError(createHttpStatusError(`Google Books detail fetch failed: ${response.status}`, response.status), {
        context: 'getBookDetail',
        volumeId,
        statusCode: response.status,
      })
      return await getCachedBookDetail(volumeId)
    }

    const data = await response.json()
    const book = normalizeVolume(data)

    cache.set(cacheKey, book, CACHE_TTL.BOOK_DETAIL)
    return book
  } catch (err) {
    captureError(err, { context: 'getBookDetail', volumeId })
    return await getCachedBookDetail(volumeId)
  }
}

/**
 * Get a single book from the CachedBook database table (fallback when Google Books is down).
 * @param {string} volumeId
 * @returns {Promise<object|null>}
 */
async function getCachedBookDetail(volumeId) {
  const prismaClient = require('../../lib/prisma')
  try {
    const book = await prismaClient.cachedBook.findUnique({
      where: { volumeId },
    })
    if (!book) return null
    return {
      volumeId: book.volumeId,
      title: book.title,
      authors: book.authors,
      categories: book.categories,
      language: book.language,
      pageCount: book.pageCount,
      coverUrl: book.coverUrl,
      previewLink: book.previewLink,
      description: sanitizeBookDescription(book.description),
      publishedDate: book.publishedDate,
      _source: 'cache',
    }
  } catch (err) {
    captureError(err, { context: 'getCachedBookDetail', volumeId })
    return null
  }
}

/**
 * Search cached books from the database (fallback when Google Books is slow/down).
 */
async function searchCachedBooks(query, page = 1, filters = {}) {
  const prismaClient = require('../../lib/prisma')
  const pageSize = DEFAULT_PAGE_SIZE
  const skip = (page - 1) * pageSize

  const where = {}
  if (query && query.trim()) {
    where.title = { contains: query.trim(), mode: 'insensitive' }
  }
  if (filters.language && filters.language !== 'all') {
    where.language = filters.language
  }
  if (filters.category) {
    where.categories = { string_contains: filters.category }
  }

  const orderBy = filters.sort === 'newest' ? { publishedDate: 'desc' } : { pageCount: 'desc' }

  try {
    const [books, count] = await Promise.all([
      prismaClient.cachedBook.findMany({ where, orderBy, skip, take: pageSize }),
      prismaClient.cachedBook.count({ where }),
    ])

    return {
      results: books.map((b) => ({
        volumeId: b.volumeId,
        title: b.title,
        authors: b.authors,
        categories: b.categories,
        language: b.language,
        pageCount: b.pageCount,
        coverUrl: b.coverUrl,
        previewLink: b.previewLink,
        description: sanitizeBookDescription(b.description),
        publishedDate: b.publishedDate,
      })),
      count,
    }
  } catch (err) {
    captureError(err, { context: 'searchCachedBooks' })
    return null
  }
}

/**
 * Sync popular books from Google Books to the CachedBook table.
 * Called periodically or on admin trigger.
 * Fetches books across popular categories to build a local cache.
 */
async function syncPopularBooksToDB(maxPages = 3) {
  const prismaClient = require('../../lib/prisma')
  let synced = 0

  const categoriesToSync = [
    'Fiction',
    'Science',
    'History',
    'Biography & Autobiography',
    'Mathematics',
    'Philosophy',
  ]

  for (const category of categoriesToSync) {
    for (let page = 0; page < maxPages; page++) {
      try {
        const params = new URLSearchParams()
        params.append('q', `subject:${category}`)
        params.append('startIndex', page * DEFAULT_PAGE_SIZE)
        params.append('maxResults', DEFAULT_PAGE_SIZE)
        params.append('orderBy', 'relevance')
        params.append('langRestrict', 'en')
        params.append('printType', 'books')
        if (GOOGLE_BOOKS_API_KEY) {
          params.append('key', GOOGLE_BOOKS_API_KEY)
        }

        const url = `${GOOGLE_BOOKS_BASE}/volumes?${params.toString()}`
        const response = await fetchWithTimeout(url, 10000)
        if (!response.ok) continue
        const data = await response.json()
        if (!data.items || data.items.length === 0) break

        for (const item of data.items) {
          try {
            const book = normalizeVolume(item)
            if (!book || !book.volumeId) continue

            await prismaClient.cachedBook.upsert({
              where: { volumeId: book.volumeId },
              update: {
                title: book.title,
                authors: book.authors || [],
                categories: book.categories || [],
                language: book.language || 'en',
                pageCount: book.pageCount || 0,
                coverUrl: book.coverUrl,
                previewLink: book.previewLink,
                description: book.description,
                publishedDate: book.publishedDate,
                syncedAt: new Date(),
              },
              create: {
                volumeId: book.volumeId,
                title: book.title,
                authors: book.authors || [],
                categories: book.categories || [],
                language: book.language || 'en',
                pageCount: book.pageCount || 0,
                coverUrl: book.coverUrl,
                previewLink: book.previewLink,
                description: book.description,
                publishedDate: book.publishedDate,
              },
            })
            synced++
          } catch {
            // Skip individual book upsert errors
          }
        }

        // Delay between pages to respect rate limits
        await new Promise((r) => setTimeout(r, 500))
      } catch {
        // Continue on page fetch errors
      }
    }
  }

  // Operational log -- allowed by ESLint no-console rule
  console.warn(`[Library] Synced ${synced} books to CachedBook table`)
  return synced
}

/**
 * Pre-warm the cache with popular books on server startup.
 * Lighter version of syncPopularBooksToDB -- just fills the in-memory cache.
 */
async function preloadPopularBooks() {
  const prismaClient = require('../../lib/prisma')
  let fetched = 0

  const categoriesToPreload = ['Fiction', 'Science', 'History']
  for (const category of categoriesToPreload) {
    try {
      const params = new URLSearchParams()
      params.append('q', `subject:${category}`)
      params.append('startIndex', 0)
      params.append('maxResults', DEFAULT_PAGE_SIZE)
      params.append('orderBy', 'relevance')
      params.append('langRestrict', 'en')
      params.append('printType', 'books')
      if (GOOGLE_BOOKS_API_KEY) {
        params.append('key', GOOGLE_BOOKS_API_KEY)
      }

      const url = `${GOOGLE_BOOKS_BASE}/volumes?${params.toString()}`
      const response = await fetchWithTimeout(url, 15000)
      if (!response.ok) continue
      const data = await response.json()

      const results = (data.items || []).map(normalizeVolume)
      const cacheKey = `search:subject:${category}:1:${JSON.stringify({ category })}`
      cache.set(cacheKey, { results, count: data.totalItems || 0 }, CACHE_TTL.SEARCH * 24)

      // Also persist to CachedBook table
      for (const book of results) {
        try {
          if (!book || !book.volumeId) continue
          await prismaClient.cachedBook.upsert({
            where: { volumeId: book.volumeId },
            update: {
              title: book.title,
              authors: book.authors || [],
              categories: book.categories || [],
              language: book.language || 'en',
              pageCount: book.pageCount || 0,
              coverUrl: book.coverUrl,
              previewLink: book.previewLink,
              description: book.description,
              publishedDate: book.publishedDate,
              syncedAt: new Date(),
            },
            create: {
              volumeId: book.volumeId,
              title: book.title,
              authors: book.authors || [],
              categories: book.categories || [],
              language: book.language || 'en',
              pageCount: book.pageCount || 0,
              coverUrl: book.coverUrl,
              previewLink: book.previewLink,
              description: book.description,
              publishedDate: book.publishedDate,
            },
          })
          fetched++
        } catch {
          // Skip individual book errors
        }
      }

      await new Promise((r) => setTimeout(r, 500))
    } catch {
      // Silent failure -- preloading is best-effort
    }
  }
  // Operational log -- allowed by ESLint no-console rule
  console.warn(`[Library] Popular books cache pre-warmed (${fetched} books synced to DB)`)
}

module.exports = {
  searchBooks,
  getBookDetail,
  getCachedBookDetail,
  preloadPopularBooks,
  syncPopularBooksToDB,
  searchCachedBooks,
  normalizeVolume,
}
