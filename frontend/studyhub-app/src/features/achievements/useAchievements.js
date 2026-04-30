/**
 * useAchievements — read hooks for the gallery, detail page, and stats.
 */
import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'

// Inline auth header helper — matches the per-page pattern used elsewhere
// (feedConstants.js, adminConstants.js, profileConstants.js). Cookies carry
// the session; we just send Content-Type.
function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

/**
 * Fetch a user's gallery + stats. If `username` is null/undefined, fetches
 * the catalog only (anonymous browse).
 */
export function useUserAchievements(username) {
  const [data, setData] = useState({ items: [], stats: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = username
        ? `${API}/api/achievements/users/${encodeURIComponent(username)}`
        : `${API}/api/achievements`
      const r = await fetch(url, {
        credentials: 'include',
        headers: authHeaders(),
      })
      if (!r.ok) {
        throw new Error(`Failed (${r.status})`)
      }
      const body = await r.json()
      setData({ items: body.items || [], stats: body.stats || null })
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => {
    reload()
  }, [reload])

  return { ...data, loading, error, reload }
}

/**
 * Fetch the viewer's own stats — used by LevelChip on every authenticated page.
 */
export function useMyStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await fetch(`${API}/api/achievements/stats`, {
          credentials: 'include',
          headers: authHeaders(),
        })
        if (!r.ok) return
        const body = await r.json()
        if (!cancelled) setStats(body.stats || null)
      } catch {
        /* leave null */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { stats, loading }
}

/**
 * Fetch a user's pinned-6 strip data. Public.
 */
export function usePinnedAchievements(username) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!username) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const r = await fetch(
        `${API}/api/achievements/users/${encodeURIComponent(username)}/pinned`,
        { credentials: 'include', headers: authHeaders() },
      )
      if (!r.ok) {
        setItems([])
        return
      }
      const body = await r.json()
      setItems(body.items || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => {
    reload()
  }, [reload])

  return { items, loading, reload }
}

/**
 * Fetch one achievement's detail (catalog row + global stats + recent unlockers).
 */
export function useAchievementDetail(slug) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!slug) return
      setLoading(true)
      setError(null)
      try {
        const r = await fetch(`${API}/api/achievements/${encodeURIComponent(slug)}`, {
          credentials: 'include',
          headers: authHeaders(),
        })
        if (!r.ok) throw new Error(`Failed (${r.status})`)
        const body = await r.json()
        if (!cancelled) setData(body.achievement)
      } catch (e) {
        if (!cancelled) setError(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [slug])

  return { data, loading, error }
}

/**
 * Pin / unpin an achievement. Returns a toggle function.
 */
export async function pinAchievement(slug) {
  const r = await fetch(`${API}/api/achievements/pin`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to pin')
  }
  return true
}

export async function unpinAchievement(slug) {
  const r = await fetch(`${API}/api/achievements/pin/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to unpin')
  }
  return true
}
