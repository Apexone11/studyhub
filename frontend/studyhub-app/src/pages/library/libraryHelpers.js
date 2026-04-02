// Library helper functions for book data and formatting
import { API } from '../../config'

/**
 * Format download count to human-readable string
 * @param {number} count - Download count
 * @returns {string} Formatted string like "1.2K downloads" or "5 downloads"
 */
export function formatDownloads(count) {
  if (!count) return '0 downloads'
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K downloads`
  }
  return `${count} downloads`
}

/**
 * Extract cover image URL from Gutendex book object
 * @param {object} book - Gutendex book object
 * @returns {string|null} Cover image URL or null
 */
export function getBookCover(book) {
  if (!book || !book.formats) return null
  return book.formats['image/jpeg'] || null
}

/**
 * Get EPUB URL from backend proxy to avoid CORS issues with Gutenberg
 * @param {object} book - Gutendex book object
 * @returns {string|null} Backend proxy EPUB URL or null if book has no ID
 */
export function getEpubUrl(book) {
  if (!book || !book.id) return null
  // Use our backend proxy to avoid CORS issues with Gutenberg
  return `${API}/api/library/books/${book.id}/epub`
}

/**
 * Extract plain text download URL from book formats
 * @param {object} book - Gutendex book object
 * @returns {string|null} Plain text URL or null
 */
export function getPlainTextUrl(book) {
  if (!book || !book.formats) return null
  return (
    book.formats['text/plain; charset=utf-8'] ||
    book.formats['text/plain'] ||
    null
  )
}

/**
 * Get formatted author names from book
 * @param {object} book - Gutendex book object
 * @returns {string} Comma-separated author names or "Unknown Author"
 */
export function getAuthorNames(book) {
  if (!book || !book.authors || book.authors.length === 0) {
    return 'Unknown Author'
  }
  return book.authors
    .map((author) => author.name)
    .join(', ')
}

/**
 * Truncate text at word boundary
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated text with ellipsis if needed
 */
export function truncateText(text, maxLen = 100) {
  if (!text || text.length <= maxLen) return text
  const truncated = text.substring(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 0
    ? truncated.substring(0, lastSpace) + '...'
    : truncated + '...'
}
