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
 *   - revalidateOnFocus: boolean - Refetch when the tab regains focus
 *     (default: true when `swr > 0`, false otherwise). Throttled to at
 *     most one refetch per `FOCUS_REVALIDATE_THROTTLE_MS` per cacheKey
 *     so rapid tab-switching doesn't hammer the backend.
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

// Focus-revalidation throttle: if the user blurs-and-refocuses repeatedly
// we don't want to refetch the same endpoint dozens of times. Track the
// last refetch timestamp per cacheKey and skip if within this window.
const FOCUS_REVALIDATE_THROTTLE_MS = 10 * 1000
const lastFocusRefetchAt = new Map()

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
  const {
    skip = false,
    transform,
    initialData = null,
    swr = 0,
    cacheKey: customCacheKey,
    revalidateOnFocus,
  } = options
  const cacheKeyToUse = customCacheKey || path
  // Default: opt into focus-revalidation when the caller already opted
  // into caching (swr > 0). Non-caching fetches are usually one-shots
  // (e.g., page-load stats) where a focus refetch is wasted work.
  const shouldRevalidateOnFocus =
    typeof revalidateOnFocus === 'boolean' ? revalidateOnFocus : swr > 0
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
        return () => {
          mountedRef.current = false
        }
      }
    }

    // No cache or SWR disabled: fetch normally
    fetchData()
    return () => {
      mountedRef.current = false
    }
  }, [fetchData, skip, swr, cacheKeyToUse])

  // Revalidate when the tab regains focus. This is the behavior modern
  // apps rely on (GitHub, Notion, Linear): you switch tabs, come back,
  // and the page you were on reflects the latest state without a hard
  // refresh. Only active when the caller opted into SWR (or explicitly
  // enabled the flag) to avoid refetch storms on one-shot endpoints.
  useEffect(() => {
    if (skip || !shouldRevalidateOnFocus || typeof window === 'undefined') return undefined

    function handleFocus() {
      if (!mountedRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const last = lastFocusRefetchAt.get(cacheKeyToUse) || 0
      if (Date.now() - last < FOCUS_REVALIDATE_THROTTLE_MS) return
      lastFocusRefetchAt.set(cacheKeyToUse, Date.now())
      fetchData()
    }

    window.addEventListener('focus', handleFocus)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleFocus)
    }
    return () => {
      window.removeEventListener('focus', handleFocus)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleFocus)
      }
    }
  }, [fetchData, skip, shouldRevalidateOnFocus, cacheKeyToUse])

  return { data, loading, error, refetch: fetchData }
}
