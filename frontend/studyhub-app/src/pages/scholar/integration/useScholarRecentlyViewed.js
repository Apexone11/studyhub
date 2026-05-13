/**
 * useScholarRecentlyViewed — localStorage-backed recently-viewed Scholar
 * papers list, capped at 10 entries, most-recent first.
 *
 * Why localStorage and not the server: this is a per-device convenience
 * surface (like a browser's "recently visited"), so we keep it client-only
 * to avoid a server round-trip on every paper open. Wrapped in try/catch
 * because Safari private mode and some embedded webviews throw on every
 * localStorage write.
 *
 * Item shape: `{ id, title, firstAuthor, year, venue, viewedAt }`.
 *
 * Returns `{ items, add, remove, clear }`. `add(item)` dedupes by `id`,
 * promotes the entry to the front, and truncates to 10.
 */
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'studyhub.scholar.recentlyViewed'
const MAX_ITEMS = 10

function safeRead() {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((it) => it && typeof it === 'object' && typeof it.id === 'string')
      .slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

function safeWrite(next) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Safari private mode + storage-full both throw here; the in-memory
    // state still updates so the current session works, we just won't
    // persist across reloads. Silent is correct.
  }
}

export function useScholarRecentlyViewed() {
  const [items, setItems] = useState(() => safeRead())

  // Sync state across tabs and across components mounted on the same
  // page. The `storage` event only fires in OTHER tabs, so we also
  // listen for an in-page custom event we dispatch on every write.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onChange = () => setItems(safeRead())
    window.addEventListener('storage', onChange)
    window.addEventListener('studyhub:scholar:recentlyViewed', onChange)
    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener('studyhub:scholar:recentlyViewed', onChange)
    }
  }, [])

  const persist = useCallback((next) => {
    safeWrite(next)
    setItems(next)
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('studyhub:scholar:recentlyViewed'))
      } catch {
        // CustomEvent unsupported in some embedded contexts. Best effort only.
      }
    }
  }, [])

  const add = useCallback(
    (item) => {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id) {
        return
      }
      const entry = {
        id: item.id,
        title: typeof item.title === 'string' ? item.title.slice(0, 240) : '',
        firstAuthor: typeof item.firstAuthor === 'string' ? item.firstAuthor.slice(0, 120) : '',
        year:
          typeof item.year === 'number' || (typeof item.year === 'string' && item.year)
            ? item.year
            : null,
        venue: typeof item.venue === 'string' ? item.venue.slice(0, 160) : '',
        viewedAt: Date.now(),
      }
      const current = safeRead()
      const deduped = current.filter((it) => it.id !== entry.id)
      const next = [entry, ...deduped].slice(0, MAX_ITEMS)
      persist(next)
    },
    [persist],
  )

  const remove = useCallback(
    (id) => {
      if (typeof id !== 'string' || !id) return
      const current = safeRead()
      const next = current.filter((it) => it.id !== id)
      persist(next)
    },
    [persist],
  )

  const clear = useCallback(() => {
    persist([])
  }, [persist])

  return { items, add, remove, clear }
}

export default useScholarRecentlyViewed
