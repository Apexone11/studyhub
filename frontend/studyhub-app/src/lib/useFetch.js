/**
 * useFetch -- shared data-fetching hook that eliminates boilerplate.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useFetch('/api/users/me/streak')
 *   const { data, loading, error } = useFetch(url, { skip: !userId })
 *   const { data, loading, error } = useFetch('/api/courses', { swr: 5 * 60 * 1000 })
 *
 * Options:
 *   - skip: boolean - Skip fetching (default: false)
 *   - transform: function - Transform response data (default: identity)
 *   - initialData: any - Initial data value (default: null)
 *   - swr: number - Stale-while-revalidate time in ms (default: 0, no caching)
 *   - cacheKey: string - Custom cache key (default: path)
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { API } from '../config'

// Module-level in-memory cache: { data, timestamp }
export const cache = new Map()

/**
 * Clear fetch cache entries.
 * @param {string|null} cacheKey - If provided, clear only this key. If null, clear all.
 */
export function clearFetchCache(cacheKey = null) {
  if (cacheKey) {
    cache.delete(cacheKey)
  } else {
    cache.clear()
  }
}

export default function useFetch(path, options = {}) {
  const { skip = false, transform, initialData = null, swr = 0, cacheKey: customCacheKey } = options
  const cacheKeyToUse = customCacheKey || path
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  // Use a ref for the transform function so it never triggers re-fetches.
  // Inline arrow functions create a new reference every render; putting
  // them in the useCallback deps caused an infinite fetch loop.
  const transformRef = useRef(transform)
  transformRef.current = transform

  const fetchData = useCallback(async () => {
    if (skip) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}${path}`, { credentials: 'include' })
      if (!res.ok) {
        const msg = await res.text().catch(() => 'Request failed')
        throw new Error(msg)
      }
      let result = await res.json()
      if (transformRef.current) result = transformRef.current(result)
      if (mountedRef.current) {
        setData(result)
        setError(null)
        // Update cache if SWR is enabled
        if (swr > 0) {
          cache.set(cacheKeyToUse, { data: result, timestamp: Date.now() })
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || 'Request failed')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [path, skip, swr, cacheKeyToUse])

  useEffect(() => {
    mountedRef.current = true

    // Check cache on mount if SWR is enabled
    if (!skip && swr > 0) {
      const cached = cache.get(cacheKeyToUse)
      const now = Date.now()

      if (cached) {
        const ageMs = now - cached.timestamp
        if (ageMs < swr) {
          // Cache is fresh: return cached data with no loading state, but still fetch in background
          setData(cached.data)
          setError(null)
          setLoading(false)
          // Still fetch in background to keep it fresh for next time
          fetchData()
          return () => { mountedRef.current = false }
        } else {
          // Cache is stale: show cached data immediately, fetch in background to replace it
          setData(cached.data)
          setError(null)
          setLoading(false)
          fetchData()
          return () => { mountedRef.current = false }
        }
      }
    }

    // No cache or SWR disabled: fetch normally
    fetchData()
    return () => { mountedRef.current = false }
  }, [fetchData, skip, swr, cacheKeyToUse])

  return { data, loading, error, refetch: fetchData }
}
