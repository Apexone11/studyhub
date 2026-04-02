import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'

export default function useLibraryData() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [totalCount, setTotalCount] = useState(0)

  // Extract query params
  const search = searchParams.get('search') || ''
  const topic = searchParams.get('topic') || ''
  const sort = searchParams.get('sort') || 'popular'
  const page = parseInt(searchParams.get('page') || '1', 10)
  const languages = searchParams.get('languages') || 'en'

  // Fetch books
  useEffect(() => {
    async function fetchBooks() {
      try {
        setLoading(true)
        setError('')

        const params = new URLSearchParams()
        if (search) params.append('search', search)
        if (topic) params.append('topic', topic)
        if (sort) params.append('sort', sort)
        if (page) params.append('page', page)
        if (languages) params.append('languages', languages)

        const response = await fetch(`${API}/api/library/search?${params.toString()}`, {
          credentials: 'include',
          headers: authHeaders(),
        })

        if (!response.ok) {
          const data = readJsonSafely(await response.text())
          throw new Error(data?.message || `HTTP ${response.status}`)
        }

        const data = await response.json()
        setBooks(data.books || [])
        setTotalCount(data.totalCount || 0)
      } catch (err) {
        const msg = getApiErrorMessage(err)
        setError(msg)
        setBooks([])
        setTotalCount(0)
      } finally {
        setLoading(false)
      }
    }

    fetchBooks()
  }, [search, topic, sort, page, languages])

  // Helper functions to update query params
  const setSearch = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('search', value)
      else next.delete('search')
      next.set('page', '1') // Reset to page 1
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const setTopic = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('topic', value)
      else next.delete('topic')
      next.set('page', '1')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const setSort = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('sort', value)
      else next.delete('sort')
      next.set('page', '1')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const setPage = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('page', value)
      else next.delete('page')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const setLanguages = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('languages', value)
      else next.delete('languages')
      next.set('page', '1')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  return {
    books,
    loading,
    error,
    page,
    totalCount,
    search,
    topic,
    sort,
    languages,
    setSearch,
    setTopic,
    setSort,
    setPage,
    setLanguages,
  }
}
