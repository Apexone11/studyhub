import { useState, useEffect, useCallback, useRef } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'

export default function useBookReader(gutenbergId) {
  const [book, setBook] = useState(null)
  const [bookmarks, setBookmarks] = useState([])
  const [highlights, setHighlights] = useState([])
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const debounceTimerRef = useRef(null)

  // Fetch initial data on mount
  useEffect(() => {
    if (!gutenbergId) {
      setLoading(false)
      return
    }

    async function fetchData() {
      try {
        setLoading(true)
        setError('')

        // Fetch book details
        const bookResponse = await fetch(
          `${API}/api/library/books/${gutenbergId}`,
          {
            credentials: 'include',
            headers: authHeaders(),
          }
        )

        if (!bookResponse.ok) {
          const data = readJsonSafely(await bookResponse.text())
          throw new Error(data?.message || `HTTP ${bookResponse.status}`)
        }

        const bookData = await bookResponse.json()
        setBook(bookData)

        // Fetch bookmarks
        try {
          const bookmarksResponse = await fetch(
            `${API}/api/library/bookmarks/${gutenbergId}`,
            {
              credentials: 'include',
              headers: authHeaders(),
            }
          )

          if (bookmarksResponse.ok) {
            const bookmarksData = await bookmarksResponse.json()
            setBookmarks(bookmarksData.bookmarks || [])
          }
        } catch (err) {
          console.error('Error fetching bookmarks:', err)
        }

        // Fetch highlights
        try {
          const highlightsResponse = await fetch(
            `${API}/api/library/highlights/${gutenbergId}`,
            {
              credentials: 'include',
              headers: authHeaders(),
            }
          )

          if (highlightsResponse.ok) {
            const highlightsData = await highlightsResponse.json()
            setHighlights(highlightsData.highlights || [])
          }
        } catch (err) {
          console.error('Error fetching highlights:', err)
        }

        // Fetch reading progress
        try {
          const progressResponse = await fetch(
            `${API}/api/library/reading-progress/${gutenbergId}`,
            {
              credentials: 'include',
              headers: authHeaders(),
            }
          )

          if (progressResponse.ok) {
            const progressData = await progressResponse.json()
            setProgress(progressData)
          }
        } catch (err) {
          console.error('Error fetching progress:', err)
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
  }, [gutenbergId])

  // Save progress with debounce
  const saveProgress = useCallback(
    async (cfi, percentage) => {
      if (!gutenbergId || !cfi) return

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      // Set new debounce timer
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const response = await fetch(
            `${API}/api/library/reading-progress/${gutenbergId}`,
            {
              method: 'PUT',
              credentials: 'include',
              headers: authHeaders(),
              body: JSON.stringify({ cfi, percentage }),
            }
          )

          if (response.ok) {
            const progressData = await response.json()
            setProgress(progressData)
          }
        } catch (err) {
          console.error('Error saving progress:', err)
        }
      }, 5000) // 5 second debounce
    },
    [gutenbergId]
  )

  // Add bookmark
  const addBookmark = useCallback(
    async (cfi, label, pageSnippet) => {
      if (!gutenbergId || !cfi) return null

      try {
        const response = await fetch(`${API}/api/library/bookmarks`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify({
            gutenbergId,
            cfi,
            label,
            pageSnippet,
          }),
        })

        if (!response.ok) {
          const data = readJsonSafely(await response.text())
          throw new Error(data?.message || `HTTP ${response.status}`)
        }

        const newBookmark = await response.json()
        setBookmarks((prev) => [...prev, newBookmark])
        return newBookmark
      } catch (err) {
        console.error('Error adding bookmark:', err)
        return null
      }
    },
    [gutenbergId]
  )

  // Remove bookmark
  const removeBookmark = useCallback(async (bookmarkId) => {
    try {
      const response = await fetch(
        `${API}/api/library/bookmarks/${bookmarkId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: authHeaders(),
        }
      )

      if (!response.ok) {
        const data = readJsonSafely(await response.text())
        throw new Error(data?.message || `HTTP ${response.status}`)
      }

      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId))
      return true
    } catch (err) {
      console.error('Error removing bookmark:', err)
      return false
    }
  }, [])

  // Add highlight
  const addHighlight = useCallback(
    async (cfi, text, color) => {
      if (!gutenbergId || !cfi || !text) return null

      try {
        const response = await fetch(`${API}/api/library/highlights`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify({
            gutenbergId,
            cfi,
            text,
            color,
          }),
        })

        if (!response.ok) {
          const data = readJsonSafely(await response.text())
          throw new Error(data?.message || `HTTP ${response.status}`)
        }

        const newHighlight = await response.json()
        setHighlights((prev) => [...prev, newHighlight])
        return newHighlight
      } catch (err) {
        console.error('Error adding highlight:', err)
        return null
      }
    },
    [gutenbergId]
  )

  // Update highlight
  const updateHighlight = useCallback(async (highlightId, updates) => {
    try {
      const response = await fetch(
        `${API}/api/library/highlights/${highlightId}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify(updates),
        }
      )

      if (!response.ok) {
        const data = readJsonSafely(await response.text())
        throw new Error(data?.message || `HTTP ${response.status}`)
      }

      const updatedHighlight = await response.json()
      setHighlights((prev) =>
        prev.map((h) => (h.id === highlightId ? updatedHighlight : h))
      )
      return updatedHighlight
    } catch (err) {
      console.error('Error updating highlight:', err)
      return null
    }
  }, [])

  // Remove highlight
  const removeHighlight = useCallback(async (highlightId) => {
    try {
      const response = await fetch(
        `${API}/api/library/highlights/${highlightId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: authHeaders(),
        }
      )

      if (!response.ok) {
        const data = readJsonSafely(await response.text())
        throw new Error(data?.message || `HTTP ${response.status}`)
      }

      setHighlights((prev) => prev.filter((h) => h.id !== highlightId))
      return true
    } catch (err) {
      console.error('Error removing highlight:', err)
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
    highlights,
    progress,
    loading,
    error,
    saveProgress,
    addBookmark,
    removeBookmark,
    addHighlight,
    updateHighlight,
    removeHighlight,
  }
}
