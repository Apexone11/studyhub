import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from './session-context'
import { API } from '../config'

const STORAGE_KEY = 'studyhub.continuity.studyStatus'

const STUDY_STATUSES = [
  { value: 'to-review', label: 'To review', color: 'var(--sh-warning)' },
  { value: 'studying', label: 'Studying', color: 'var(--sh-brand)' },
  { value: 'done', label: 'Done', color: 'var(--sh-success)' },
]

// ── localStorage helpers (guest fallback) ─────────────────────────────────

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocal(statuses) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses))
  } catch {
    /* quota exceeded or private browsing */
  }
}

function clearLocal() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

// ── Backend API helpers ───────────────────────────────────────────────────

async function fetchAllStatuses() {
  const res = await fetch(`${API}/api/study-status`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch study statuses')
  const data = await res.json()
  return data.statuses || {}
}

async function fetchBatchStatuses(sheetIds) {
  if (!sheetIds || sheetIds.length === 0) return {}
  const res = await fetch(`${API}/api/study-status/batch?ids=${sheetIds.join(',')}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to fetch batch statuses')
  const data = await res.json()
  return data.statuses || {}
}

async function putStatus(sheetId, status) {
  const res = await fetch(`${API}/api/study-status/${sheetId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: status || null }),
  })
  if (!res.ok) throw new Error('Failed to update study status')
}

async function syncLocalToBackend(localEntries) {
  const res = await fetch(`${API}/api/study-status/sync`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: localEntries }),
  })
  if (!res.ok) throw new Error('Failed to sync study statuses')
  const data = await res.json()
  return data.statuses || {}
}

// ── Shared state for authenticated users ──────────────────────────────────

let _serverStatuses = {}
let _serverLoaded = false
let _serverLoadPromise = null
const _listeners = new Set()

function notifyListeners() {
  for (const fn of _listeners) fn()
}

function resetServerState() {
  _serverStatuses = {}
  _serverLoaded = false
  _serverLoadPromise = null
  notifyListeners()
}

async function loadFromServer() {
  if (_serverLoadPromise) return _serverLoadPromise
  _serverLoadPromise = (async () => {
    try {
      // Check if there's local data to migrate
      const local = readLocal()
      const localKeys = Object.keys(local)
      if (localKeys.length > 0) {
        // Sync local -> server, then clear local
        _serverStatuses = await syncLocalToBackend(local)
        clearLocal()
      } else {
        _serverStatuses = await fetchAllStatuses()
      }
      _serverLoaded = true
      notifyListeners()
    } catch {
      // Fall back to local on network error
      _serverStatuses = readLocal()
      _serverLoaded = true
      notifyListeners()
    }
  })()
  return _serverLoadPromise
}

// ── Hook: single sheet status ─────────────────────────────────────────────

/**
 * Get or set a study-status marker for a single sheet.
 * Syncs with backend for authenticated users, falls back to localStorage for guests.
 */
export function useStudyStatus(sheetId) {
  const { user } = useSession()
  const isAuth = Boolean(user)
  const [localStatuses, setLocalStatuses] = useState(readLocal)
  const [, forceRender] = useState(0)
  const isAuthRef = useRef(isAuth)

  useEffect(() => {
    isAuthRef.current = isAuth
  }, [isAuth])

  // Subscribe to server state changes
  useEffect(() => {
    if (!isAuth) return
    const onUpdate = () => forceRender((n) => n + 1)
    _listeners.add(onUpdate)
    if (!_serverLoaded) loadFromServer()
    return () => _listeners.delete(onUpdate)
  }, [isAuth])

  // Cross-tab sync for guests
  useEffect(() => {
    if (isAuth) return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setLocalStatuses(readLocal())
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [isAuth])

  const statuses = isAuth ? _serverStatuses : localStatuses
  const entry = sheetId ? statuses[sheetId] || null : null

  const setStatus = useCallback(
    (status, sheet) => {
      if (!sheetId) return
      if (isAuthRef.current) {
        // Optimistic update + fire request
        if (!status) {
          delete _serverStatuses[sheetId]
        } else {
          _serverStatuses[sheetId] = {
            status,
            title: sheet?.title || _serverStatuses[sheetId]?.title || '',
            courseCode: sheet?.course?.code || _serverStatuses[sheetId]?.courseCode || null,
            updatedAt: new Date().toISOString(),
          }
        }
        _serverStatuses = { ..._serverStatuses }
        notifyListeners()
        putStatus(sheetId, status).catch(() => {
          // Revert on failure by re-fetching
          loadFromServer()
        })
      } else {
        // Guest: localStorage only
        setLocalStatuses((prev) => {
          const next = { ...prev }
          if (!status) {
            delete next[sheetId]
          } else {
            next[sheetId] = {
              status,
              title: sheet?.title || prev[sheetId]?.title || '',
              courseCode: sheet?.course?.code || prev[sheetId]?.courseCode || null,
              updatedAt: new Date().toISOString(),
            }
          }
          writeLocal(next)
          return next
        })
      }
    },
    [sheetId],
  )

  return {
    studyStatus: entry?.status || null,
    studyStatusEntry: entry,
    setStudyStatus: setStatus,
    STUDY_STATUSES,
  }
}

// ── Hook: all statuses (dashboard) ────────────────────────────────────────

/**
 * Read all study statuses -- for dashboard display and nudges.
 */
export function useAllStudyStatuses() {
  const { user } = useSession()
  const isAuth = Boolean(user)
  const [localStatuses, setLocalStatuses] = useState(readLocal)
  const [, forceRender] = useState(0)

  // Subscribe to server state changes
  useEffect(() => {
    if (!isAuth) return
    const onUpdate = () => forceRender((n) => n + 1)
    _listeners.add(onUpdate)
    if (!_serverLoaded) loadFromServer()
    return () => _listeners.delete(onUpdate)
  }, [isAuth])

  // Cross-tab sync for guests
  useEffect(() => {
    if (isAuth) return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setLocalStatuses(readLocal())
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [isAuth])

  const statuses = isAuth ? _serverStatuses : localStatuses

  const refresh = useCallback(() => {
    if (isAuth) {
      _serverLoadPromise = null
      loadFromServer()
    } else {
      setLocalStatuses(readLocal())
    }
  }, [isAuth])

  const entries = useMemo(
    () => Object.entries(statuses).map(([id, entry]) => ({ id: Number(id), ...entry })),
    [statuses],
  )
  const toReview = useMemo(() => entries.filter((e) => e.status === 'to-review'), [entries])
  const studying = useMemo(() => entries.filter((e) => e.status === 'studying'), [entries])
  const done = useMemo(() => entries.filter((e) => e.status === 'done'), [entries])

  return {
    statuses,
    counts: { toReview: toReview.length, studying: studying.length, done: done.length },
    toReview,
    studying,
    done,
    refreshStatuses: refresh,
    STUDY_STATUSES,
  }
}

// ── Hook: batch status lookup for card lists ──────────────────────────────

/**
 * Fetch study statuses for a list of sheet IDs.
 * Returns a map of sheetId -> status string.
 */
export function useStudyStatusBatch(sheetIds) {
  const { user } = useSession()
  const isAuth = Boolean(user)
  const [serverVersion, setServerVersion] = useState(0)
  const [fetchedMap, setFetchedMap] = useState({})
  const idsKey = sheetIds?.join(',') || ''

  // Subscribe to server state changes so we re-derive
  useEffect(() => {
    if (!isAuth) return
    const onUpdate = () => setServerVersion((n) => n + 1)
    _listeners.add(onUpdate)
    if (!_serverLoaded) loadFromServer()
    return () => _listeners.delete(onUpdate)
  }, [isAuth])

  // Fetch batch from backend when server state isn't loaded yet
  useEffect(() => {
    if (!isAuth || !sheetIds || sheetIds.length === 0 || _serverLoaded) return
    let cancelled = false
    fetchBatchStatuses(sheetIds)
      .then((result) => {
        if (!cancelled) setFetchedMap(result)
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [isAuth, idsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derive map from loaded server state or fetched batch.
  // serverVersion triggers re-renders when server state changes.
  void serverVersion
  if (!isAuth || !sheetIds || sheetIds.length === 0) return {}
  if (_serverLoaded) {
    const map = {}
    for (const id of sheetIds) {
      if (_serverStatuses[id]) {
        map[id] = _serverStatuses[id].status
      }
    }
    return map
  }
  return fetchedMap
}

/**
 * Reset server state on logout. Called from session.js.
 */
export function clearStudyStatusCache() {
  resetServerState()
}

export { STUDY_STATUSES }
