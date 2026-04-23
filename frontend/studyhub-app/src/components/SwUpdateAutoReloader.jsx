// src/components/SwUpdateAutoReloader.jsx
//
// Silent auto-reload: when the service worker reports a new app version,
// wait for the next "safe moment" (route change, tab return, or long
// idle) and do a full `window.location.reload()` so the browser picks
// up the new bundle. No banner, no click required — matches the pattern
// used by Facebook / Instagram / GitHub, where you never think about
// deploys as a user.
//
// Safe-moment rules (any one triggers a reload):
//   1. The user navigates between routes in the SPA. Route transitions
//      would drop component state anyway, so a hard reload at that
//      moment is indistinguishable from a soft transition.
//   2. The tab transitions hidden → visible. If the user came back to
//      the tab, they just mentally "returned" to the site; freshening
//      it is expected and unintrusive.
//   3. More than `MAX_DEFER_MS` has elapsed since the update was
//      flagged. Guarantees that a user sitting on a single page with no
//      navigation still picks up fixes within 30 minutes.
//
// Grace period: we never reload within `INITIAL_GRACE_MS` of the update
// being flagged. That guards against race conditions where a user is
// mid-click when the SW activates — we give the click a moment to
// complete first, then reload on the NEXT safe moment.

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  hasReloadBeenTriggered,
  isSwUpdateAvailable,
  markReloadTriggered,
  swUpdatePendingAgeMs,
} from '../lib/swUpdateState'

const INITIAL_GRACE_MS = 2000
const MAX_DEFER_MS = 30 * 60 * 1000

function safeReload() {
  if (hasReloadBeenTriggered()) return
  if (
    typeof window === 'undefined' ||
    !window.location ||
    typeof window.location.reload !== 'function'
  ) {
    return
  }
  markReloadTriggered()
  window.location.reload()
}

/**
 * Attempts a reload if an update is pending and the grace period has
 * elapsed. Returns true when a reload was triggered (or had already
 * been triggered this page-load).
 */
function maybeReload() {
  if (!isSwUpdateAvailable()) return false
  if (swUpdatePendingAgeMs() < INITIAL_GRACE_MS) return false
  safeReload()
  return true
}

export default function SwUpdateAutoReloader() {
  const location = useLocation()
  const mountedAtPathRef = useRef(location.pathname)

  // Route-change trigger. The first render on mount should NOT reload —
  // we compare against the mount-time path, and only reload on a
  // subsequent pathname change.
  useEffect(() => {
    if (location.pathname === mountedAtPathRef.current) return
    mountedAtPathRef.current = location.pathname
    maybeReload()
  }, [location.pathname])

  // Visibility trigger + long-idle fallback.
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined

    function handleVisibility() {
      if (document.visibilityState === 'visible') maybeReload()
    }
    function handleFocus() {
      maybeReload()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)

    // Long-idle fallback: even without navigation or focus events, reload
    // after 30 min so a user parked on one screen still picks up fixes.
    const idleCheckTimer = setInterval(() => {
      if (isSwUpdateAvailable() && swUpdatePendingAgeMs() >= MAX_DEFER_MS) {
        safeReload()
      }
    }, 60 * 1000)

    // NOTE: we deliberately do NOT subscribe to subscribeSwUpdate here.
    // An earlier revision did — it scheduled a reload ~2s after the SW
    // flagged an update if the tab was visible — but that contradicted
    // this component's own contract (the three safe-moment rules in the
    // header comment) and could interrupt a user mid-action. The three
    // documented triggers (route change / tab return / 30-min idle) are
    // authoritative. A user sitting on a single page gets their reload
    // from the idle timer above; anyone actively navigating picks it up
    // from the location-change effect.

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      clearInterval(idleCheckTimer)
    }
  }, [])

  return null
}
