/**
 * useScopeBySchool — read/write the user's school-scoped-search preference.
 *
 * Default ON — the founder's intent is that course pickers in Notes /
 * Sheets / AI Sheet Setup show only the user's primary school's courses
 * by default. The user can flip the toggle per-picker (saves to the
 * server so cross-device behavior is consistent).
 *
 * Returns `{ scoped, setScoped, primarySchoolId, isHydrating }` where:
 *   - `scoped`           — boolean. Defaults to `true` for safety.
 *   - `setScoped(next)`  — flips the toggle + persists to the server.
 *   - `primarySchoolId`  — int or null, derived from the session user's
 *                          first enrollment. Course pickers use this to
 *                          pre-filter when `scoped === true`.
 *   - `isHydrating`      — true on the first render while we resolve the
 *                          server value. Callers can render a skeleton.
 *
 * Storage:
 *   - First paint reads from `localStorage` for synchronous availability.
 *   - On mount we fetch `/api/settings/preferences` and reconcile —
 *     server wins if it differs from local (covers cross-device flips).
 *   - On `setScoped`, we update local + fire-and-forget a PATCH so the
 *     next page load on any device matches.
 *
 * Why not put scope inside `useSession` directly? Because session-context
 * loads at app boot and we don't want to block initial render on a
 * preferences read. This hook is opt-in per page that cares about scope.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../config'
import { useSession } from './session-context'

const STORAGE_KEY = 'studyhub.prefs.scopeBySchool'

function readLocal() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'true') return true
    if (raw === 'false') return false
    return null
  } catch {
    return null
  }
}

function writeLocal(value) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
  } catch {
    /* Safari private mode + quota errors are non-fatal */
  }
}

// Resolve the user's primary school id from the session shape. Matches
// the dual-shape handling in lib/courses.js (`course.schoolId` ?? `course.school.id`).
export function primarySchoolIdFromUser(user) {
  if (!user || !Array.isArray(user.enrollments) || user.enrollments.length === 0) return null
  const first = user.enrollments[0]?.course
  if (!first) return null
  const id = first.schoolId ?? first.school?.id ?? null
  if (id == null) return null
  return Number(id)
}

export function useScopeBySchool() {
  const { user } = useSession()
  // Synchronous first paint: localStorage wins so the picker doesn't
  // flash unscoped → scoped after the prefs fetch.
  const [scoped, setScopedState] = useState(() => {
    const local = readLocal()
    return local == null ? true : local
  })
  const [isHydrating, setIsHydrating] = useState(true)
  // Tracks whether the user flipped the toggle locally before the
  // initial reconcile fetch resolved. Without this, a slow GET
  // /api/settings/preferences race-overwrites the user's fresh flip
  // with the stale server value (the PATCH they fired is also in
  // flight — server wins eventually but during the current page session
  // the toggle visibly reverts). Local-flip-during-hydration wins.
  const userFlippedDuringHydrationRef = useRef(false)

  // Reconcile with server on mount.
  useEffect(() => {
    if (!user) {
      setIsHydrating(false)
      return undefined
    }
    userFlippedDuringHydrationRef.current = false
    let cancelled = false
    fetch(`${API}/api/settings/preferences`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        if (userFlippedDuringHydrationRef.current) return
        if (data && typeof data.scopeBySchool === 'boolean') {
          // Server wins — flip local if they differ.
          if (data.scopeBySchool !== scoped) {
            setScopedState(data.scopeBySchool)
            writeLocal(data.scopeBySchool)
          }
        }
      })
      .catch(() => {
        /* Graceful: the local value remains authoritative on network failure */
      })
      .finally(() => {
        if (!cancelled) setIsHydrating(false)
      })
    return () => {
      cancelled = true
    }
    // We intentionally do not list `scoped` — we only want to reconcile
    // once per user change, not on every local flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const setScoped = useCallback(
    (next) => {
      const boolNext = Boolean(next)
      setScopedState(boolNext)
      writeLocal(boolNext)
      // Tell the in-flight reconcile to skip — user's local flip wins
      // over whatever the server returns mid-hydration.
      userFlippedDuringHydrationRef.current = true
      if (!user) return
      // Fire-and-forget persistence. The local + state update is
      // optimistic; a failed PATCH leaves local right and re-syncs from
      // the server on the next page load.
      fetch(`${API}/api/settings/preferences`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopeBySchool: boolNext }),
      }).catch(() => {
        /* Already updated locally — server retry is the user's next flip */
      })
    },
    [user],
  )

  return {
    scoped,
    setScoped,
    primarySchoolId: primarySchoolIdFromUser(user),
    isHydrating,
  }
}

export default useScopeBySchool
