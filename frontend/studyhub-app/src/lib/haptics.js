/* ═══════════════════════════════════════════════════════════════════════════
 * haptics.js — Tiny haptic feedback helper
 *
 * Loop M20 (2026-05-13). Wraps the Web Vibration API
 * (`navigator.vibrate(ms)`) with two safety nets:
 *
 *   1. Respects `prefers-reduced-motion: reduce` — users who have asked
 *      the OS to dial back motion get no haptic buzz either. The
 *      Vibration API is officially a motion effect under the
 *      "Accessibility for Motion-Sensitive Users" guidance (MDN +
 *      WCAG 2.3.3). Honoring this is non-negotiable.
 *
 *   2. SSR-safe: every read of `navigator` / `window` is gated.
 *
 * The Vibration API is only implemented on Android Chrome/Firefox and a
 * few minor browsers — iOS Safari and desktop Safari/Firefox/Chrome are
 * all no-ops. That's the correct default behavior for those platforms,
 * so we silently swallow it.
 *
 * Use the named exports (`tap`, `success`, `error`) for the common
 * patterns instead of calling `vibrate()` directly — they encode the
 * length we've standardised on. If a new pattern is needed, add it
 * here rather than sprinkling raw integers around the codebase.
 * ═══════════════════════════════════════════════════════════════════════════ */

function reducedMotion() {
  if (typeof window === 'undefined') return true
  try {
    if (
      typeof document !== 'undefined' &&
      document.documentElement?.dataset?.reducedMotion === 'on'
    ) {
      return true
    }
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
  } catch {
    /* opaque platform */
  }
  return false
}

/**
 * Low-level: vibrate for `pattern` ms (or a pattern array). No-op when
 * the API is missing, the user prefers reduced motion, or the page is
 * hidden (vibrating a backgrounded tab is a UX anti-pattern).
 *
 * @param {number|number[]} pattern - duration in ms, or alternating on/off pattern.
 * @returns {boolean} true if the underlying API was called.
 */
export function vibrate(pattern) {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.vibrate !== 'function') return false
  if (reducedMotion()) return false
  if (typeof document !== 'undefined' && document.hidden) return false
  try {
    return navigator.vibrate(pattern) === true
  } catch {
    return false
  }
}

/** Soft 10ms tap — use for input focus, like-button toggles, etc. */
export function tap() {
  return vibrate(10)
}

/**
 * Standard 50ms gentle success buzz. Use for: form submit success,
 * message sent, follow toggle, copy success, share success.
 */
export function success() {
  return vibrate(50)
}

/** Sharper error pattern — two short pulses. Use sparingly. */
export function error() {
  return vibrate([30, 60, 30])
}

/**
 * `true` when the Vibration API exists AND the user hasn't asked for
 * reduced motion. Useful when a UI wants to show a "haptic feedback"
 * toggle that's only meaningful on platforms that support it.
 */
export function isHapticsAvailable() {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.vibrate !== 'function') return false
  if (reducedMotion()) return false
  return true
}
