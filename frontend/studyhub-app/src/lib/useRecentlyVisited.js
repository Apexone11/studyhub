/**
 * useRecentlyVisited — generic localStorage-backed recently-visited
 * tracker. Powers the "Recently viewed" strip on /feed plus any future
 * surface that wants to surface a user's cross-surface recent activity.
 *
 * Each entry shape:
 *   { type, id, title, href, visitedAt }
 *
 * `type` is 'sheet' | 'note' | 'paper' | 'book' | 'group' (extensible).
 * Caller is responsible for calling `record(entry)` once per navigation
 * — usually inside the detail page's `useEffect`. The hook returns the
 * stable cross-tab list.
 *
 * Storage:
 *   - Single localStorage key (`studyhub.recentlyVisited`) — cross-tab
 *     storage events sync the in-memory copy automatically.
 *   - Capped at 20 entries (oldest dropped). Plenty for a horizontal
 *     strip + the user's own "did I look at this already" memory.
 *   - Per-user partitioning is NOT done at this layer because the
 *     localStorage key is per-browser-profile already; a shared device
 *     is the user's own problem (same as browser history).
 */
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'studyhub.recentlyVisited'
const MAX_ITEMS = 20
const MAX_TITLE_LEN = 120
const SYNC_EVENT = 'studyhub:recentlyVisited:change'

function readList() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.type === 'string' &&
        entry.id != null &&
        typeof entry.href === 'string',
    )
  } catch {
    return []
  }
}

function writeList(next) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_ITEMS)))
  } catch {
    /* Safari private mode + quota errors are non-fatal */
  }
}

function broadcastChange() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT))
  } catch {
    /* CustomEvent unsupported in some embedded contexts */
  }
}

/** Returns the latest list + a `record(entry)` writer. */
export function useRecentlyVisited() {
  const [items, setItems] = useState(() => readList())

  // Sync across tabs (`storage` event) and across in-page subscribers
  // (`SYNC_EVENT` we dispatch ourselves on every write).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onStorage = (e) => {
      // `storage` fires for every key in the origin (auth, toast queues,
      // anything). Only re-read when our key changed (or when `null` —
      // which signals a full localStorage.clear()).
      if (e && e.key !== null && e.key !== STORAGE_KEY) return
      setItems(readList())
    }
    const onSync = () => setItems(readList())
    window.addEventListener('storage', onStorage)
    window.addEventListener(SYNC_EVENT, onSync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(SYNC_EVENT, onSync)
    }
  }, [])

  const record = useCallback((entry) => {
    if (!entry || typeof entry.type !== 'string' || entry.id == null || !entry.href) return
    const normalized = {
      type: entry.type,
      id: String(entry.id),
      // Cap title length so a malformed / runaway title can't bloat
      // localStorage and crowd out other entries.
      title: String(entry.title || 'Untitled').slice(0, MAX_TITLE_LEN),
      href: entry.href,
      visitedAt: Date.now(),
    }
    const next = [
      normalized,
      ...readList().filter((e) => !(e.type === normalized.type && e.id === normalized.id)),
    ]
    writeList(next)
    broadcastChange()
  }, [])

  const clear = useCallback(() => {
    writeList([])
    broadcastChange()
  }, [])

  return { items, record, clear }
}

export default useRecentlyVisited
