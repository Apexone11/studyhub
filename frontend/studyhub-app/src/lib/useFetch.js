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

// Cache expiry constants
const MAX_CACHE_SIZE = 50
const CACHE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes
const SWEEP_INTERVAL_MS = 60 * 1000 // 1 minute
let sweepTimer = null

/** Evict stale entries and enforce size cap. */
export function sweepCache() {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_MAX_AGE_MS) cache.delete(key)
  }
  // Enforce size cap: evict oldest entries first
  if (cache.size > MAX_CACHE_SIZE) {
    const sorted = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    const excess = cache.size - MAX_CACHE_SIZE
    for (let i = 0; i < excess; i++) cache.delete(sorted[i][0])
  }
}

/** Start the sweep timer lazily on first SWR cache hit. */
function ensureSweepRunning() {
  if (!sweepTimer) {
    sweepTimer = setInterval(sweepCache, SWEEP_INTERVAL_MS)
  }
}

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

      if (cached) {
        ensureSweepRunning()
        // Return cached data immediately (fresh or stale), revalidate in background
        setData(cached.data)
        setError(null)
        setLoading(false)
        fetchData()
        return () => { mountedRef.current = false }
      }
    }

    // No cache or SWR disabled: fetch normally
    fetchData()
    return () => { mountedRef.current = false }
  }, [fetchData, skip, swr, cacheKeyToUse])

  return { data, loading, error, refetch: fetchData }
}
