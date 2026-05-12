/* ═══════════════════════════════════════════════════════════════════════════
 * searchModalRecent.js — localStorage helpers for the SearchModal recent-
 * searches list. All access is wrapped in try/catch so a quota-exceeded or
 * SecurityError (private-mode Safari) browser never crashes the search UX.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { RECENT_SEARCHES_KEY, RECENT_SEARCHES_MAX } from './searchModalConstants'

function safeLocalStorage() {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage || null
  } catch {
    return null
  }
}

/** Read the recent-searches array. Returns [] on any error. */
export function readRecentSearches() {
  const store = safeLocalStorage()
  if (!store) return []
  try {
    const raw = store.getItem(RECENT_SEARCHES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, RECENT_SEARCHES_MAX)
  } catch {
    return []
  }
}

/**
 * Prepend `query` to the recent-searches list, dedupe (case-insensitive),
 * and cap at RECENT_SEARCHES_MAX. No-op if `query` is empty or too short.
 */
export function pushRecentSearch(query) {
  const store = safeLocalStorage()
  if (!store) return
  const trimmed = (query || '').trim()
  if (trimmed.length < 2) return

  try {
    const current = readRecentSearches()
    const lowered = trimmed.toLowerCase()
    const next = [trimmed, ...current.filter((entry) => entry.toLowerCase() !== lowered)].slice(
      0,
      RECENT_SEARCHES_MAX,
    )
    store.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
  } catch {
    // localStorage quota or SecurityError — recent searches are non-critical.
  }
}

/** Wipe the recent-searches list. */
export function clearRecentSearches() {
  const store = safeLocalStorage()
  if (!store) return
  try {
    store.removeItem(RECENT_SEARCHES_KEY)
  } catch {
    // ignore
  }
}
