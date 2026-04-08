import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'studyhub.continuity.recentlyViewed'
const MAX_ENTRIES = 10
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function readEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Auto-prune entries older than 30 days
    const cutoff = Date.now() - MAX_AGE_MS
    const fresh = parsed.filter((e) => {
      if (!e.viewedAt) return false
      return new Date(e.viewedAt).getTime() > cutoff
    })
    if (fresh.length !== parsed.length) writeEntries(fresh)
    return fresh
  } catch {
    return []
  }
}

function writeEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch { /* quota exceeded or private browsing — silently ignore */ }
}

/**
 * Track and retrieve recently viewed sheets.
 * Storage: localStorage (client-only, private to user).
 *
 * Each entry: { id, title, courseCode, authorUsername, viewedAt }
 */
export function recordSheetView(sheet) {
  if (!sheet?.id || !sheet?.title) return
  const entry = {
    id: sheet.id,
    title: sheet.title,
    courseCode: sheet.course?.code || null,
    authorUsername: sheet.author?.username || null,
    viewedAt: new Date().toISOString(),
  }
  const entries = readEntries().filter((e) => e.id !== sheet.id)
  entries.unshift(entry)
  writeEntries(entries.slice(0, MAX_ENTRIES))
}

/**
 * Remove a single entry by sheet ID (e.g. when the sheet has been deleted).
 * Safe to call from anywhere — no-ops if the entry does not exist.
 */
export function removeRecentlyViewedEntry(sheetId) {
  const entries = readEntries().filter((e) => e.id !== sheetId)
  writeEntries(entries)
}

export function useRecentlyViewed() {
  const [entries, setEntries] = useState(readEntries)

  const refresh = useCallback(() => {
    setEntries(readEntries())
  }, [])

  const removeEntry = useCallback((sheetId) => {
    removeRecentlyViewedEntry(sheetId)
    setEntries((prev) => prev.filter((e) => e.id !== sheetId))
  }, [])

  // Refresh on mount and when tab becomes visible (cross-tab sync)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refresh])

  return { recentlyViewed: entries, refreshRecentlyViewed: refresh, removeEntry }
}
