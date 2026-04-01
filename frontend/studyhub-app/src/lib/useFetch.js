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
      if (transform) result = transform(result)
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
  }, [path, skip, transform])

  useEffect(() => {
    mountedRef.current = true
    fetchData()
    return () => { mountedRef.current = false }
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}
