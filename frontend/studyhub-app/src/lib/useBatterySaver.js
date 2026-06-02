/**
 * useBatterySaver — React hook returning the effective battery-saver state.
 *
 * Pairs with `useDataSaver` (same shape).
 *
 * The hook does TWO things:
 *   1. Returns the effective state for consumers (animation gates,
 *      Socket.io heartbeat tuning, etc.).
 *   2. Side-effect: writes `data-battery-saver="on"` on `<body>` so
 *      CSS rules in index.css that target the attribute can disable
 *      animations / transitions / will-change at the style layer.
 *
 * Resolution order:
 *   1. User preference `UserPreferences.batterySaverMode` (loaded via
 *      session context). 'on' / 'off' wins.
 *   2. `auto` → honor `prefers-reduced-motion: reduce` media query.
 *      (The Battery Status API is deprecated and removed from Chrome /
 *      Firefox / Safari — there's no way to read actual battery level
 *      from JS anymore. prefers-reduced-motion is the de-facto proxy
 *      every modern productivity app uses.)
 *
 * The hook returns `{ enabled, mode, source }` — same shape as
 * useDataSaver so consumers that want BOTH can treat them
 * symmetrically.
 */
import { useEffect, useState } from 'react'

const LOCAL_STORAGE_KEY = 'studyhub.prefs.batterySaver'
const BODY_DATA_ATTR = 'data-battery-saver'

function readStoredMode() {
  if (typeof localStorage === 'undefined') return 'auto'
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (raw === 'on' || raw === 'off' || raw === 'auto') return raw
  } catch {
    /* private mode / quota */
  }
  return 'auto'
}

export function setStoredBatterySaverMode(mode) {
  if (typeof localStorage === 'undefined') return
  try {
    if (mode === 'on' || mode === 'off' || mode === 'auto') {
      localStorage.setItem(LOCAL_STORAGE_KEY, mode)
    }
  } catch {
    /* ignore */
  }
}

function readReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function deriveState(mode) {
  if (mode === 'on') return { enabled: true, mode, source: 'user' }
  if (mode === 'off') return { enabled: false, mode, source: 'user' }
  const reduce = readReducedMotion()
  return { enabled: reduce, mode: 'auto', source: reduce ? 'platform' : 'none' }
}

function applyBodyAttribute(enabled) {
  if (typeof document === 'undefined') return
  if (enabled) {
    document.body.setAttribute(BODY_DATA_ATTR, 'on')
  } else {
    document.body.removeAttribute(BODY_DATA_ATTR)
  }
}

export default function useBatterySaver({ serverMode } = {}) {
  const initialMode = serverMode || readStoredMode()
  const [state, setState] = useState(() => deriveState(initialMode))

  // Side-effect: keep <body data-battery-saver="on"> in sync so CSS
  // rules in index.css can disable animations at the style layer.
  useEffect(() => {
    applyBodyAttribute(state.enabled)
  }, [state.enabled])

  // Listen for prefers-reduced-motion changes (user toggles OS setting
  // mid-session).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = () => {
      setState((current) => (current.mode === 'auto' ? deriveState('auto') : current))
    }
    // Modern browsers expose addEventListener on MediaQueryList; older
    // Safari needs the deprecated addListener fallback.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }
    mql.addListener(handler)
    return () => mql.removeListener(handler)
  }, [])

  // Re-derive on serverMode change.
  useEffect(() => {
    if (!serverMode) return
    setStoredBatterySaverMode(serverMode)
    setState(deriveState(serverMode))
  }, [serverMode])

  return state
}
