/**
 * useSheetsViewMode — Phase 4 Day 3 Sheets Grid/List view selector.
 *
 * Persistence rules:
 *   1. URL `?view=grid` or `?view=list` wins. Sharing a link forces the
 *      receiver into the sender's view regardless of their localStorage.
 *   2. localStorage `studyhub.sheets.viewMode` is read on mount only and
 *      written when the user toggles. localStorage is the per-user
 *      preference between sessions; it doesn't override the URL.
 *   3. Default for new users is `list` per the locked decision.
 *
 * Scope:
 *   The hook only handles the view dimension. The Grid/List toggle is
 *   gated behind `design_v2_sheets_grid` upstream — when the flag is
 *   off, callers should ignore the returned `viewMode` and render the
 *   list path unconditionally.
 */
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const STORAGE_KEY = 'studyhub.sheets.viewMode'
const DEFAULT_VIEW_MODE = 'list'
const VALID_VIEW_MODES = new Set(['grid', 'list'])

function readStoredViewMode() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return VALID_VIEW_MODES.has(value) ? value : null
  } catch {
    return null
  }
}

function writeStoredViewMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* localStorage unavailable */
  }
}

export default function useSheetsViewMode() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlMode = searchParams.get('view')
  const urlOverride = VALID_VIEW_MODES.has(urlMode) ? urlMode : null

  const [storedMode, setStoredMode] = useState(() => readStoredViewMode() || DEFAULT_VIEW_MODE)

  const viewMode = urlOverride || storedMode

  // Persist the URL-driven choice to localStorage so a subsequent
  // refresh that drops the `?view=` param still respects the linked
  // view. This is a write to an external system (localStorage), not a
  // React state update, which is the legal use of an effect.
  useEffect(() => {
    if (urlOverride) writeStoredViewMode(urlOverride)
  }, [urlOverride])

  const setViewMode = useCallback(
    (nextMode) => {
      if (!VALID_VIEW_MODES.has(nextMode)) return
      setStoredMode(nextMode)
      writeStoredViewMode(nextMode)
      // Strip ?view= from the URL once the user picks a mode through
      // the toggle: localStorage now holds their preference, so the
      // URL is no longer load-bearing. Leaving it would freeze sharing
      // links in a stale state.
      const next = new URLSearchParams(searchParams)
      if (next.has('view')) {
        next.delete('view')
        setSearchParams(next, { replace: true })
      }
    },
    [searchParams, setSearchParams],
  )

  return { viewMode, setViewMode }
}
