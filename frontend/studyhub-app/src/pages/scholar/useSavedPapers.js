/**
 * useSavedPapers.js — shared save/unsave state for PaperCards outside the
 * Saved page (search results, landing discover grids, topic lists).
 *
 * Read path: `/api/library/shelves?includeBooks=true` — the same source
 * ScholarSavedPage falls back to (there is no GET /api/scholar/saved on
 * the backend; saves persist as ShelfBook rows with sourceType='paper').
 * The cacheKey matches ScholarSavedPage's ('scholar-saved:shelves') so
 * both surfaces share one SWR entry and one network request.
 *
 * Write path: POST /api/scholar/save · DELETE /api/scholar/save/:paperId.
 * Per CLAUDE.md A4 there is NO optimistic flip — the local override map is
 * only written after the server confirms, hydrated from the response body
 * where the endpoint echoes one.
 */
import { useCallback, useMemo, useState } from 'react'
import useFetch, { cache as fetchCache, clearFetchCache } from '../../lib/useFetch'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { showToast } from '../../lib/toast'

const SAVED_CACHE_PREFIX = 'scholar-saved:'

/**
 * Drop every Scholar saved-list SWR entry (Saved page grids + the shared
 * shelves entry) so the next visit refetches fresh membership.
 */
export function invalidateScholarSavedCache() {
  for (const key of [...fetchCache.keys()]) {
    if (typeof key === 'string' && key.startsWith(SAVED_CACHE_PREFIX)) {
      clearFetchCache(key)
    }
  }
}

export default function useSavedPapers() {
  const { data, refetch } = useFetch('/api/library/shelves?includeBooks=true', {
    swr: 30000,
    cacheKey: 'scholar-saved:shelves',
  })

  // Server-confirmed membership changes made in this session. Overrides
  // win over the (possibly stale) shelves payload until the refetch lands.
  const [overrides, setOverrides] = useState(() => new Map())
  const [saving, setSaving] = useState(() => new Set())

  const savedIds = useMemo(() => {
    const ids = new Set()
    const shelves = Array.isArray(data?.shelves) ? data.shelves : []
    for (const shelf of shelves) {
      const books = Array.isArray(shelf.books) ? shelf.books : []
      for (const b of books) {
        if (b.sourceType !== 'paper') continue
        const id = b.paperId || b.volumeId
        if (id) ids.add(id)
      }
    }
    for (const [id, isSaved] of overrides) {
      if (isSaved) ids.add(id)
      else ids.delete(id)
    }
    return ids
  }, [data, overrides])

  const toggleSave = useCallback(
    async (paper) => {
      const paperId = paper?.id
      if (!paperId || saving.has(paperId)) return
      const wasSaved = savedIds.has(paperId)
      setSaving((prev) => new Set(prev).add(paperId))
      try {
        const res = wasSaved
          ? await fetch(`${API}/api/scholar/save/${encodeURIComponent(paperId)}`, {
              method: 'DELETE',
              credentials: 'include',
              headers: authHeaders(),
            })
          : await fetch(`${API}/api/scholar/save`, {
              method: 'POST',
              credentials: 'include',
              headers: authHeaders(),
              body: JSON.stringify({ paperId }),
            })
        if (!res.ok) {
          let message = wasSaved ? 'Couldn’t remove this paper.' : 'Couldn’t save this paper.'
          try {
            const body = await res.json()
            if (body?.error) message = body.error
          } catch {
            // Non-JSON error body — keep the generic message.
          }
          throw new Error(message)
        }
        // Hydrate from the persisted value: POST echoes { saved: true };
        // DELETE replies 204, meaning the row is gone.
        let persisted = !wasSaved
        if (!wasSaved) {
          const body = await res.json().catch(() => null)
          persisted = body?.saved ?? true
        } else {
          persisted = false
        }
        setOverrides((prev) => new Map(prev).set(paperId, persisted))
        invalidateScholarSavedCache()
        refetch?.()
        showToast(persisted ? 'Saved to your papers' : 'Removed from saved', 'success')
      } catch (err) {
        showToast(err?.message || 'Something went wrong — try again.', 'error')
      } finally {
        setSaving((prev) => {
          const next = new Set(prev)
          next.delete(paperId)
          return next
        })
      }
    },
    [savedIds, saving, refetch],
  )

  return { savedIds, saving, toggleSave }
}
