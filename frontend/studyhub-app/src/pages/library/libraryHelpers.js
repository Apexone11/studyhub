// Library helper functions for Google Books data and formatting

/**
 * Get cover image URL from a normalized book object.
 * Upgrades HTTP to HTTPS for Google Books image links.
 * @param {object} book - Normalized book object
 * @returns {string|null} Cover image URL or null
 */
export function getBookCover(book) {
  if (!book || !book.coverUrl) return null
  // Google Books sometimes returns http:// URLs -- upgrade to https
  return book.coverUrl.replace('http://', 'https://')
}

/**
 * Get formatted author names from book.
 * Google Books returns authors as a string array (not objects with .name).
 * @param {object} book - Normalized book object
 * @returns {string} Comma-separated author names or "Unknown Author"
 */
export function getAuthorNames(book) {
  if (!book || !book.authors || book.authors.length === 0) {
    return 'Unknown Author'
  }
  // Google Books authors are already plain strings
  return book.authors.join(', ')
}

/**
 * Format page count to human-readable string
 * @param {number} count - Page count
 * @returns {string} Formatted string
 */
export function formatPageCount(count) {
  if (!count || count <= 0) return 'Unknown length'
  return `${count} pages`
}

/**
 * Get the Google Books preview/read link for a book.
 * @param {object} book - Normalized book object
 * @returns {string|null} Preview link or null
 */
export function getPreviewLink(book) {
  if (!book) return null
  return book.previewLink || null
}

/**
 * Get the Google Books web reader link.
 * @param {object} book - Normalized book object
 * @returns {string|null} Web reader link or null
 */
export function getWebReaderLink(book) {
  if (!book) return null
  return book.webReaderLink || null
}

/**
 * Check if a book has preview content available for the embedded viewer.
 * @param {object} book - Normalized book object
 * @returns {boolean}
 */
export function hasPreview(book) {
  if (!book) return false
  return book.embeddable === true && book.viewability !== 'NO_PAGES'
}

/**
 * Truncate text at word boundary.
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated text with ellipsis if needed
 */
export function truncateText(text, maxLen = 100) {
  if (!text || text.length <= maxLen) return text
  const truncated = text.substring(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...'
}
