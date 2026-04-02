import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'
import { cache as swrCache } from '../../lib/useFetch'

const SWR_TTL = 5 * 60 * 1000 // 5 minutes

export default function useLibraryData() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [usingCache, setUsingCache] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  // Extract query params
  const search = searchParams.get('search') || ''
  const topic = searchParams.get('topic') || ''
  const sort = searchParams.get('sort') || 'popular'
  const page = parseInt(searchParams.get('page') || '1', 10)
  const languages = searchParams.get('languages') || 'en'

  // Fetch books with SWR caching
  useEffect(() => {
    async function fetchBooks() {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (topic) params.append('topic', topic)
      // Only send sort for values Gutendex understands; 'popular' = default (omit)
      if (sort && sort !== 'popular') params.append('sort', sort)
      if (page) params.append('page', page)
      if (languages) params.append('languages', languages)

      const cacheKey = `/api/library/search?${params.toString()}`

      // Check SWR cache first
      const cached = swrCache.get(cacheKey)
      if (cached && cached.data) {
        setBooks(cached.data.books || [])
        setTotalCount(cached.data.totalCount || 0)
        setError('')

        // If cache is fresh, show cached data and fetch in background
        const age = Date.now() - cached.timestamp
        if (age < SWR_TTL) {
          setLoading(false)
          // Still fetch in background to keep fresh
          fetchFromApi(params, cacheKey, true)
          return
        }

        // Stale cache: show data, fetch to replace
        setLoading(false)
        fetchFromApi(params, cacheKey, true)
        return
      }

      // No cache: fetch normally with loading state
      setLoading(true)
      setError('')
      await fetchFromApi(params, cacheKey, false)
    }

    async function fetchFromApi(params, cacheKey, isBackground) {
      try {
        if (!isBackground) setLoading(true)

        const response = await fetch(`${API}/api/library/search?${params.toString()}`, {
          credentials: 'include',
          headers: authHeaders(),
        })

        if (!response.ok) {
          const text = await response.text()
          const data = readJsonSafely(text)
          // 401/403 with optionalAuth: Gutendex books are public, retry without auth
          if (response.status === 401 || response.status === 403) {
            throw new Error('Session expired. Books are still available -- try refreshing.')
          }
          throw new Error(data?.message || data?.error || `HTTP ${response.status}`)
        }

        const data = await response.json()
        setBooks(data.books || [])
        setTotalCount(data.totalCount || 0)
        setUsingCache(data.source === 'cache')
        setUnavailable(data.unavailable === true)
        setError('')

        // Update SWR cache
        swrCache.set(cacheKey, { data, timestamp: Date.now() })
      } catch (err) {
        // Only show error if this isn't a background refresh
        if (!isBackground) {
          const msg = getApiErrorMessage(err)
          setError(msg)
          setBooks([])
          setTotalCount(0)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchBooks()
  }, [search, topic, sort, page, languages])

  // Prefetch next page for instant pagination
  useEffect(() => {
    const nextPage = page + 1
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (topic) params.append('topic', topic)
    if (sort && sort !== 'popular') params.append('sort', sort)
    params.append('page', nextPage)
    if (languages) params.append('languages', languages)

    const cacheKey = `/api/library/search?${params.toString()}`
    const cached = swrCache.get(cacheKey)

    // Only prefetch if not already cached
    if (!cached) {
      const timer = setTimeout(() => {
        fetch(`${API}/api/library/search?${params.toString()}`, {
          credentials: 'include',
          headers: authHeaders(),
        })
          .then(res => (res.ok ? res.json() : null))
          .then(data => {
            if (data) {
              swrCache.set(cacheKey, { data, timestamp: Date.now() })
            }
          })
          .catch(() => {}) // Silent failure
      }, 1000) // 1 second delay to prioritize current page

      return () => clearTimeout(timer)
    }
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
    usingCache,
    unavailable,
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
