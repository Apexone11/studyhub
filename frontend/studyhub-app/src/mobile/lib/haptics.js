// src/mobile/lib/haptics.js
// Thin wrapper over @capacitor/haptics that degrades gracefully when the
// package is not installed. See spec §3.3.
//
// Gating order (fail-closed):
//   1. isNativePlatform() — no-op on web.
//   2. `reduceHaptics` user preference — read live from window.__SH_MOBILE_PREFS__
//      (set by the Accessibility settings tab). Honored immediately.
//   3. 80ms per-API throttle — prevents buzz fatigue on rapid taps.
//
// The @capacitor/haptics package is NOT currently in the dependency tree
// (CLAUDE.md "no new npm deps" rule). This wrapper dynamic-imports it on
// first call; if the import fails, every subsequent call is a silent no-op
// for the rest of the session. Once the dep is approved and installed, the
// wrapper lights up with zero call-site changes.

import { isNativePlatform } from '../../lib/mobile/detectMobile'

const THROTTLE_MS = 80

let _modPromise = null
let _modResolved = null
let _modUnavailable = false
let _warnedOnce = false

const _lastCall = {
  tap: 0,
  success: 0,
  warn: 0,
  select: 0,
}

function prefsReduceHaptics() {
  if (typeof window === 'undefined') return false
  const prefs = window.__SH_MOBILE_PREFS__
  return Boolean(prefs && prefs.reduceHaptics)
}

function shouldFire(api) {
  if (!isNativePlatform()) return false
  if (prefsReduceHaptics()) return false
  const now = Date.now()
  if (now - _lastCall[api] < THROTTLE_MS) return false
  _lastCall[api] = now
  return true
}

async function getMod() {
  if (_modUnavailable) return null
  if (_modResolved) return _modResolved
  if (_modPromise) return _modPromise
  // Hide the specifier from Vite's static import analyzer. The package
  // is intentionally absent until the dep is approved (CLAUDE.md rule);
  // the /* @vite-ignore */ hint + indirect specifier keeps the build green.
  const specifier = '@capacitor/haptics'
  _modPromise = import(/* @vite-ignore */ specifier)
    .then((mod) => {
      _modResolved = mod
      return mod
    })
    .catch(() => {
      _modUnavailable = true
      if (!_warnedOnce && typeof console !== 'undefined') {
        _warnedOnce = true
        console.info('[haptics] @capacitor/haptics not installed — haptics calls are no-ops.')
      }
      return null
    })
  return _modPromise
}

/** Light impact — default for button presses. */
export async function tap() {
  if (!shouldFire('tap')) return
  const mod = await getMod()
  if (!mod) return
  try {
    await mod.Haptics.impact({ style: mod.ImpactStyle.Light })
  } catch {
    /* ignore runtime errors on older devices */
  }
}

/** Success notification — medium — onboarding complete, first follower. */
export async function success() {
  if (!shouldFire('success')) return
  const mod = await getMod()
  if (!mod) return
  try {
    await mod.Haptics.notification({ type: mod.NotificationType.Success })
  } catch {
    /* ignore */
  }
}

/** Warning notification — account lockout, submit-error. */
export async function warn() {
  if (!shouldFire('warn')) return
  const mod = await getMod()
  if (!mod) return
  try {
    await mod.Haptics.notification({ type: mod.NotificationType.Warning })
  } catch {
    /* ignore */
  }
}

/** Selection change — segmented nav, tab switch, picker snap. */
export async function select() {
  if (!shouldFire('select')) return
  const mod = await getMod()
  if (!mod) return
  try {
    await mod.Haptics.selectionChanged()
  } catch {
    /* ignore */
  }
}

/** Test-only hook. */
export function __resetHapticsStateForTests() {
  _modPromise = null
  _modResolved = null
  _modUnavailable = false
  _warnedOnce = false
  Object.keys(_lastCall).forEach((k) => {
    _lastCall[k] = 0
  })
}

export default { tap, success, warn, select }
