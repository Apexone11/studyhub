import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'

export default function useBookDetail(gutenbergId) {
  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shelves, setShelves] = useState([])
  const [progress, setProgress] = useState(null)

  // Fetch book details and related data
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

        // Fetch user shelves
        try {
          const shelvesResponse = await fetch(`${API}/api/library/shelves`, {
            credentials: 'include',
            headers: authHeaders(),
          })

          if (shelvesResponse.ok) {
            const shelvesData = await shelvesResponse.json()
            setShelves(shelvesData.shelves || [])
          }
        } catch (err) {
          // Gracefully handle shelf fetching errors
          console.error('Error fetching shelves:', err)
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
          // Gracefully handle progress fetching errors
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

  const addToShelf = useCallback(
    async (shelfId) => {
      if (!gutenbergId) return

      try {
        const response = await fetch(
          `${API}/api/library/shelves/${shelfId}/books`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify({ gutenbergId }),
          }
        )

        if (!response.ok) {
          const data = readJsonSafely(await response.text())
          throw new Error(data?.message || `HTTP ${response.status}`)
        }

        return true
      } catch (err) {
        console.error('Error adding to shelf:', err)
        return false
      }
    },
    [gutenbergId]
  )

  const removeFromShelf = useCallback(
    async (shelfId) => {
      if (!gutenbergId) return

      try {
        const response = await fetch(
          `${API}/api/library/shelves/${shelfId}/books/${gutenbergId}`,
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

        return true
      } catch (err) {
        console.error('Error removing from shelf:', err)
        return false
      }
    },
    [gutenbergId]
  )

  const createShelf = useCallback(async (name) => {
    try {
      const response = await fetch(`${API}/api/library/shelves`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      })

      if (!response.ok) {
        const data = readJsonSafely(await response.text())
        throw new Error(data?.message || `HTTP ${response.status}`)
      }

      const newShelf = await response.json()
      setShelves((prev) => [...prev, newShelf])
      return newShelf
    } catch (err) {
      console.error('Error creating shelf:', err)
      return null
    }
  }, [])

  return {
    book,
    loading,
    error,
    shelves,
    progress,
    addToShelf,
    removeFromShelf,
    createShelf,
  }
}
