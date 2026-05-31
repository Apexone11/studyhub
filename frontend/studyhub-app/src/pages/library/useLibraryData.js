import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { readJsonSafely } from '../../lib/http'
import { cache as swrCache } from '../../lib/useFetch'

export default function useLibraryData() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [usingCache, setUsingCache] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [endOfResults, setEndOfResults] = useState(false)

  // Extract query params
  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const sort = searchParams.get('sort') || 'relevance'
  const page = parseInt(searchParams.get('page') || '1', 10)
  const language = searchParams.get('language') || 'en'

  // Fetch books with SWR caching
  useEffect(() => {
    const controller = new AbortController()

    async function fetchBooks() {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (category) params.append('category', category)
      if (sort && sort !== 'relevance') params.append('sort', sort)
      if (page) params.append('page', page)
      if (language) params.append('language', language)

      const cacheKey = `/api/library/search?${params.toString()}`

      // Check SWR cache first
      const cached = swrCache.get(cacheKey)
      if (cached && cached.data) {
        setBooks(cached.data.books || [])
        setTotalCount(cached.data.totalCount || 0)
        setUsingCache(cached.data.source === 'cache')
        setUnavailable(cached.data.unavailable === true)
        setEndOfResults(Boolean(cached.data.endOfResults))
        setError('')
        // Serve the cached payload instantly, then revalidate in the
        // background regardless of age — the background fetch corrects any
        // staleness. (The age<TTL branch used to be byte-identical to the
        // else, so it was dead duplication; collapsed here.)
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
          signal: controller.signal,
        })

        if (!response.ok) {
          // readJsonSafely takes the Response (not a pre-read string) and is
          // async — the old `readJsonSafely(text)` lost the server message and
          // left `data` a pending Promise, so the error fell through to the
          // bare `HTTP <status>` fallback every time.
          const data = await readJsonSafely(response, {})
          if (response.status === 401 || response.status === 403) {
            throw new Error('Session expired. Books are still available -- try refreshing.')
          }
          throw new Error(data?.message || data?.error || `HTTP ${response.status}`)
        }

        const data = await response.json()
        if (controller.signal.aborted) return
        setBooks(data.books || [])
        setTotalCount(data.totalCount || 0)
        setUsingCache(data.source === 'cache')
        setUnavailable(data.unavailable === true)
        setEndOfResults(data.endOfResults === true)
        setError('')

        // Don't cache the empty end-of-results page — when the upstream cap
        // shifts (e.g. Google Books surfaces deeper results next week) we
        // want a stale cache entry to revalidate rather than gaslight the
        // user into thinking the catalog is permanently empty here.
        if (!data.endOfResults) {
          swrCache.set(cacheKey, { data, timestamp: Date.now() })
        }
      } catch (err) {
        if (err?.name === 'AbortError') return
        if (!isBackground) {
          // `err` is an Error here — its message already holds the
          // server-supplied text (see the !response.ok branch above), so
          // read `err.message` rather than `getApiErrorMessage(err)`, which
          // looks for `err.error` and would silently return undefined.
          const msg = err?.message || 'Could not load books. Please try again.'
          setError(msg)
          setBooks([])
          setTotalCount(0)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    fetchBooks()
    return () => controller.abort()
  }, [search, category, sort, page, language])

  // Prefetch next page (only when we don't already know it's empty)
  useEffect(() => {
    if (endOfResults) return undefined
    const nextPage = page + 1
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (category) params.append('category', category)
    if (sort && sort !== 'relevance') params.append('sort', sort)
    params.append('page', nextPage)
    if (language) params.append('language', language)

    const cacheKey = `/api/library/search?${params.toString()}`
    const cached = swrCache.get(cacheKey)

    if (!cached) {
      const controller = new AbortController()
      const timer = setTimeout(() => {
        fetch(`${API}/api/library/search?${params.toString()}`, {
          credentials: 'include',
          headers: authHeaders(),
          signal: controller.signal,
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            // Don't cache `endOfResults` responses — they'd suppress a real
            // retry once the upstream catalog grows. Mirror the rule in
            // fetchFromApi above.
            if (data && !data.endOfResults) {
              swrCache.set(cacheKey, { data, timestamp: Date.now() })
            }
          })
          .catch(() => {})
      }, 1000)

      return () => {
        clearTimeout(timer)
        controller.abort()
      }
    }
    return undefined
  }, [search, category, sort, page, language, endOfResults])

  // Helper functions to update query params
  const setSearch = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('search', value)
      else next.delete('search')
      next.set('page', '1')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const setCategory = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('category', value)
      else next.delete('category')
      next.set('page', '1')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const setSort = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('sort', value)
      else next.delete('sort')
      next.set('page', '1')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const setPage = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('page', value)
      else next.delete('page')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const setLanguage = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('language', value)
      else next.delete('language')
      next.set('page', '1')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  return {
    books,
    loading,
    error,
    usingCache,
    unavailable,
    endOfResults,
    page,
    totalCount,
    search,
    category,
    sort,
    language,
    setSearch,
    setCategory,
    setSort,
    setPage,
    setLanguage,
  }
}
