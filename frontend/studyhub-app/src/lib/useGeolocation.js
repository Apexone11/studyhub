/**
 * useGeolocation — permission-aware wrapper around navigator.geolocation.
 *
 * Returns `{ coords, status, request, error }` where:
 *   - `coords` is `{ lat, lng }` once granted, `null` otherwise.
 *   - `status` is one of:
 *       'idle'         — hook mounted, hasn't asked yet
 *       'requesting'   — request in flight
 *       'granted'      — got coords
 *       'denied'       — user blocked
 *       'unavailable'  — browser doesn't support, or we ran in SSR
 *       'timeout'      — request hung past 10s
 *       'error'        — other failure (lookup with `error`)
 *   - `request()` triggers the prompt. Idempotent — calling again while a
 *     request is in flight or already-granted is a no-op.
 *   - `error` carries the GeolocationPositionError-style code/message.
 *
 * Design choices:
 *   - Does NOT auto-request on mount. The /my-courses page (and any
 *     other caller) decides when to ask, with a user-visible "Use my
 *     location" affordance. Auto-asking is the #1 reason browsers add
 *     friction to geolocation requests.
 *   - Caches the grant in sessionStorage so navigating between pages
 *     within the same session doesn't re-prompt. Cleared on tab close —
 *     we never persist coords to localStorage or the server.
 *   - High accuracy is OFF — we only need ~city-level for sorting
 *     schools by distance. High accuracy spins the GPS radio on mobile
 *     and is a battery + privacy cost the founder didn't ask for.
 *   - 10 s timeout. Browser default is no timeout, which means a stalled
 *     request can leave the UI in `requesting` indefinitely.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const SESSION_KEY = 'studyhub.geolocation.session'
const TIMEOUT_MS = 10_000
const MAX_AGE_MS = 5 * 60 * 1000 // browser may return cached coords up to 5 min old

function readCachedSession() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng)
    ) {
      return { lat: parsed.lat, lng: parsed.lng }
    }
    return null
  } catch {
    return null
  }
}

function writeCachedSession(coords) {
  if (typeof sessionStorage === 'undefined' || !coords) return
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(coords))
  } catch {
    /* Safari private mode + quota errors are non-fatal */
  }
}

export function useGeolocation() {
  const [coords, setCoords] = useState(() => readCachedSession())
  const [status, setStatus] = useState(() => (readCachedSession() ? 'granted' : 'idle'))
  const [error, setError] = useState(null)
  const inFlightRef = useRef(false)

  // If the cached session was created on a previous mount and the user
  // explicitly revoked permission in the browser, the next `request()`
  // call will still fail — we handle that in the callback below.

  const request = useCallback(() => {
    if (inFlightRef.current) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
      return
    }
    if (status === 'granted' && coords) return

    inFlightRef.current = true
    setStatus('requesting')
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        inFlightRef.current = false
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        setCoords(next)
        setStatus('granted')
        writeCachedSession(next)
      },
      (err) => {
        inFlightRef.current = false
        setError(err)
        // err.code: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
        if (err && err.code === 1) setStatus('denied')
        else if (err && err.code === 3) setStatus('timeout')
        else setStatus('error')
      },
      {
        enableHighAccuracy: false,
        timeout: TIMEOUT_MS,
        maximumAge: MAX_AGE_MS,
      },
    )
  }, [status, coords])

  // If the cached session is present, surface 'granted' on first render
  // without prompting. The hook doesn't re-validate the permission on
  // every mount — the next request() call will surface a fresh denial
  // if the user revoked in Chrome's site settings.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
    }
  }, [])

  return { coords, status, request, error }
}

export default useGeolocation
