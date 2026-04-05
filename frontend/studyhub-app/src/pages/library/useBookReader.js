import { useState, useEffect, useCallback, useRef } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'

/**
 * useBookReader -- Manages reading state for the Google Books embedded viewer.
 * Handles book data, bookmarks, and reading progress.
 *
 * Note: Highlighting is not supported because the Google Books iframe is
 * cross-origin and we cannot access its DOM content.
 */
export default function useBookReader(volumeId) {
  const [book, setBook] = useState(null)
  const [bookmarks, setBookmarks] = useState([])
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bookmarkError, setBookmarkError] = useState('')

  const debounceTimerRef = useRef(null)

  // Fetch initial data on mount
  useEffect(() => {
    if (!volumeId) {
      setLoading(false)
      return
    }

    async function fetchData() {
      try {
        setLoading(true)
        setError('')

        // Fetch book details
        const bookResponse = await fetch(`${API}/api/library/books/${volumeId}`, {
          credentials: 'include',
          headers: authHeaders(),
        })

        if (!bookResponse.ok) {
          const data = readJsonSafely(await bookResponse.text())
          throw new Error(data?.message || `HTTP ${bookResponse.status}`)
        }

        const bookData = await bookResponse.json()
        setBook(bookData)

        // Fetch bookmarks
        try {
          const bookmarksResponse = await fetch(`${API}/api/library/bookmarks/${volumeId}`, {
            credentials: 'include',
            headers: authHeaders(),
          })

          if (bookmarksResponse.ok) {
            const bookmarksData = await bookmarksResponse.json()
            setBookmarks(bookmarksData.bookmarks || [])
          }
        } catch {
          // Silent failure -- bookmarks are non-critical
        }

        // Fetch reading progress
        try {
          const progressResponse = await fetch(`${API}/api/library/reading-progress/${volumeId}`, {
            credentials: 'include',
            headers: authHeaders(),
          })

          if (progressResponse.ok) {
            const progressData = await progressResponse.json()
            setProgress(progressData)
          }
        } catch {
          // Silent failure -- progress is non-critical
        }
      } catch (err) {
        const msg = getApiErrorMessage(err)
        setError(msg)
        setBook(null)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [volumeId])

  // Save progress with debounce
  const saveProgress = useCallback(
    async (cfi, percentage) => {
      if (!volumeId) return

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(async () => {
        try {
          const response = await fetch(`${API}/api/library/reading-progress/${volumeId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify({ cfi: cfi || 'page', percentage }),
          })

          if (response.ok) {
            const progressData = await response.json()
            setProgress(progressData)
          }
        } catch {
          // Silent failure -- progress save is best-effort
        }
      }, 5000)
    },
    [volumeId],
  )

  // Add bookmark
  const addBookmark = useCallback(
    async (label, pageSnippet) => {
      if (!volumeId) return null
      setBookmarkError('')

      try {
        const response = await fetch(`${API}/api/library/bookmarks`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify({
            volumeId,
            cfi: `page-${Date.now()}`,
            label: label || 'Bookmark',
            pageSnippet: pageSnippet || '',
          }),
        })

        if (!response.ok) {
          const data = readJsonSafely(await response.text())
          const msg = data?.error || data?.message || `HTTP ${response.status}`
          setBookmarkError(msg)
          return null
        }

        const newBookmark = await response.json()
        setBookmarks((prev) => [...prev, newBookmark])
        setBookmarkError('')
        return newBookmark
      } catch {
        setBookmarkError('Failed to save bookmark')
        return null
      }
    },
    [volumeId],
  )

  // Remove bookmark
  const removeBookmark = useCallback(async (bookmarkId) => {
    try {
      const response = await fetch(`${API}/api/library/bookmarks/${bookmarkId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      })

      if (response.ok) {
        setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId))
        return true
      }
      return false
    } catch {
      return false
    }
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  return {
    book,
    bookmarks,
    progress,
    loading,
    error,
    bookmarkError,
    saveProgress,
    addBookmark,
    removeBookmark,
  }
}
