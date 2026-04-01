/**
 * useFetch -- shared data-fetching hook that eliminates boilerplate.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useFetch('/api/users/me/streak')
 *   const { data, loading, error } = useFetch(url, { skip: !userId })
 *
 * Options:
 *   - skip: boolean - Skip fetching (default: false)
 *   - transform: function - Transform response data (default: identity)
 *   - initialData: any - Initial data value (default: null)
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { API } from '../config'

export default function useFetch(path, options = {}) {
  const { skip = false, transform, initialData = null } = options
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
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || 'Request failed')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [path, skip])

  useEffect(() => {
    mountedRef.current = true
    fetchData()
    return () => { mountedRef.current = false }
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}
