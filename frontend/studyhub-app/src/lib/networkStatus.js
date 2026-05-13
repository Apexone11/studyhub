/* ═══════════════════════════════════════════════════════════════════════════
 * networkStatus.js — Online/offline + slow-connection detection
 *
 * Two surfaces:
 *
 *   1) `isOffline()` / `useOnlineStatus()` — wraps `navigator.onLine` plus the
 *      browser `online`/`offline` events. Used by `fetchWithRetry` (to short-
 *      circuit retries when we know the device is offline) and by feature
 *      surfaces that want to render an offline-aware UI (e.g. queue a message
 *      send instead of attempting it).
 *
 *   2) `isSlowConnection()` / `useSlowNetwork()` — wraps the Network
 *      Information API (`navigator.connection.effectiveType` +
 *      `saveData`). Returns `true` when the user is on `slow-2g`, `2g`, or
 *      has explicitly opted into data-saver mode. Used to suppress autoplay
 *      video (heaviest first-paint cost on mobile) and to surface a one-time
 *      heads-up toast.
 *
 *      Browser support note: Safari does NOT expose `navigator.connection`.
 *      Treating "absent" as "fast" is the safe default — we'd rather not
 *      degrade a fine connection than wrongly tag every iPhone user as slow.
 *
 * Both surfaces are SSR-safe: reading `navigator` is gated on
 * `typeof navigator !== 'undefined'`.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g'])

/**
 * Returns the active NetworkInformation object, or null when the API is
 * unavailable (Safari/Firefox-on-desktop have no `navigator.connection`).
 */
function getConnection() {
  if (typeof navigator === 'undefined') return null
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null
}

/**
 * `true` when the browser believes the device is offline.
 *
 * `navigator.onLine === false` is authoritative for "no network at all";
 * `true` can be a false positive (captive portal, VPN dropped, etc.) — but
 * combined with our `fetchWithRetry` 5xx/network-error handling that's
 * acceptable: a request will fail naturally and the retry path takes over.
 */
export function isOffline() {
  if (typeof navigator === 'undefined') return false
  return navigator.onLine === false
}

/**
 * `true` when the active connection looks slow (2g/slow-2g or save-data on).
 * Safe-default `false` when the Network Information API isn't present.
 */
export function isSlowConnection() {
  const conn = getConnection()
  if (!conn) return false
  if (conn.saveData === true) return true
  if (typeof conn.effectiveType === 'string' && SLOW_EFFECTIVE_TYPES.has(conn.effectiveType)) {
    return true
  }
  return false
}

/**
 * React hook — reactive `isOffline` boolean that re-renders on
 * `online`/`offline` events.
 */
export function useOnlineStatus() {
  const [offline, setOffline] = useState(() => isOffline())

  useEffect(() => {
    function handleOnline() {
      setOffline(false)
    }
    function handleOffline() {
      setOffline(true)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return offline
}

/**
 * React hook — reactive `isSlowConnection` boolean. Re-renders when the
 * NetworkInformation object fires a `change` event (e.g., user switches
 * from Wi-Fi to cellular). When the API isn't available, returns `false`
 * permanently and never subscribes.
 */
export function useSlowNetwork() {
  const [slow, setSlow] = useState(() => isSlowConnection())

  useEffect(() => {
    const conn = getConnection()
    if (!conn || typeof conn.addEventListener !== 'function') return undefined

    function handleChange() {
      setSlow(isSlowConnection())
    }
    conn.addEventListener('change', handleChange)
    return () => {
      conn.removeEventListener('change', handleChange)
    }
  }, [])

  return slow
}

/**
 * Subscribe to `online` events. Returns an unsubscribe function. Used by
 * the offline message queue to flush when connectivity returns without
 * pulling React state into the queue module.
 */
export function onReconnect(handler) {
  if (typeof window === 'undefined') return () => {}
  function fn() {
    if (!isOffline()) handler()
  }
  window.addEventListener('online', fn)
  return () => window.removeEventListener('online', fn)
}
