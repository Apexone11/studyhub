/* ═══════════════════════════════════════════════════════════════════════════
 * battery.js — Battery Status hook (best-effort, deprecated API)
 *
 * Loop M20 (2026-05-13). Wraps `navigator.getBattery()` so the AI bubble
 * and other long-running surfaces can hint to the user when their
 * battery is critically low (<20%) — "Your AI conversation will keep
 * working but you might want to save your work soon."
 *
 * The Battery Status API was deprecated and removed from most browsers
 * for fingerprinting reasons; only Chrome on Android still exposes it.
 * That is OK for us — battery low is the one signal where the platform
 * that DOES expose it (Android Chrome users) overlaps perfectly with
 * the platform that benefits most from the hint (phones on the go).
 * Every other browser falls back to the safe default of
 * `{ supported: false, low: false }` and no hint renders.
 *
 * Returns a reactive value via `useBattery()` (level + charging +
 * `low` boolean), plus a one-shot promise variant for telemetry use.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'

const LOW_THRESHOLD = 0.2 // 20%

const INITIAL_STATE = {
  supported: false,
  level: null, // 0..1 or null
  charging: null, // boolean or null
  low: false,
}

/**
 * One-shot. Returns a snapshot of the current battery state, or the
 * unsupported defaults when `navigator.getBattery` is missing.
 *
 * @returns {Promise<{supported:boolean, level:?number, charging:?boolean, low:boolean}>}
 */
export async function readBattery() {
  if (typeof navigator === 'undefined' || typeof navigator.getBattery !== 'function') {
    return { ...INITIAL_STATE }
  }
  try {
    const b = await navigator.getBattery()
    const level = typeof b.level === 'number' ? b.level : null
    const charging = typeof b.charging === 'boolean' ? b.charging : null
    return {
      supported: true,
      level,
      charging,
      low: level !== null && level < LOW_THRESHOLD && charging === false,
    }
  } catch {
    return { ...INITIAL_STATE }
  }
}

/**
 * React hook. Subscribes to `levelchange` + `chargingchange` so the
 * `low` boolean flips reactively when the battery state changes
 * (user plugs in / hits the threshold). Cleans up on unmount.
 */
export function useBattery() {
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof navigator.getBattery !== 'function') {
      return undefined
    }
    let battery = null
    let mounted = true

    function recompute() {
      if (!mounted || !battery) return
      const level = typeof battery.level === 'number' ? battery.level : null
      const charging = typeof battery.charging === 'boolean' ? battery.charging : null
      setState({
        supported: true,
        level,
        charging,
        low: level !== null && level < LOW_THRESHOLD && charging === false,
      })
    }

    navigator
      .getBattery()
      .then((b) => {
        if (!mounted) return
        battery = b
        recompute()
        b.addEventListener?.('levelchange', recompute)
        b.addEventListener?.('chargingchange', recompute)
      })
      .catch(() => {
        // Silently leave the unsupported defaults in place.
      })

    return () => {
      mounted = false
      if (battery) {
        battery.removeEventListener?.('levelchange', recompute)
        battery.removeEventListener?.('chargingchange', recompute)
      }
    }
  }, [])

  return state
}
