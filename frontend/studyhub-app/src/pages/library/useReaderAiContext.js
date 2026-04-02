/**
 * useReaderAiContext.js -- Captures current reader state for AI context.
 *
 * This hook extracts the currently visible text from an epub.js rendition
 * and provides book metadata for passing to the Hub AI assistant.
 *
 * Used by BookReaderPage to enrich AI context with reading-specific information.
 */

import { useCallback } from 'react'

/**
 * Builds reader context for AI from the current book and rendition.
 *
 * @param {object} book - Book data object with { id, title, author, subjects }
 * @param {object} rendition - epub.js rendition instance (from BookReaderPage)
 * @returns {object} Reader context object for passing to AI
 */
export function useReaderAiContext(book, rendition) {
  const getReaderContext = useCallback(() => {
    if (!book) {
      return {
        bookTitle: null,
        bookAuthor: null,
        bookSubjects: null,
        currentText: null,
      }
    }

    let currentText = null

    // Extract currently visible text from the epub.js rendition
    if (rendition && rendition.getContents) {
      try {
        const contents = rendition.getContents()
        if (contents && Array.isArray(contents)) {
          const textArray = contents.map((content) => {
            try {
              return content.innerText || ''
            } catch {
              return ''
            }
          })
          currentText = textArray.join('\n').trim()
        }
      } catch (err) {
        console.warn('[Reader AI Context] Failed to extract current text:', err?.message || err)
      }
    }

    return {
      bookTitle: book.title || null,
      bookAuthor: book.author || null,
      bookSubjects: book.subjects ? book.subjects.join(', ') : null,
      currentText,
    }
  }, [book, rendition])

  return getReaderContext
}
