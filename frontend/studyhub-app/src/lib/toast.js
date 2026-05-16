/* ═══════════════════════════════════════════════════════════════════════════
 * toast.js — Toast notification utilities (non-component exports)
 *
 * Separated from Toast.jsx to satisfy react-refresh/only-export-components.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ── Global event bus ─────────────────────────────────────────────── */
export const toastListeners = new Set()

// Per-type default durations chosen to match Linear/GitHub cadence:
// - Success: 2.5s. The user just saw their action complete; lingering
//   noise is friction.
// - Info: 3.5s. Slightly longer because it usually carries an
//   actionable hint ("Discarded — no changes made").
// - Error: 6s. Nielsen's research says users need ~5s to read novel
//   error copy. We round up so a glance-away user still catches it.
//   Callers needing "block the user until they acknowledge" (e.g.,
//   payment failures, security flags) can pass `0` to disable
//   auto-dismiss entirely; the Toast component honors 0 as "manual
//   dismiss only" (see components/Toast.jsx).
const DEFAULT_DURATIONS = {
  success: 2500,
  info: 3500,
  error: 6000,
}

export function showToast(message, type = 'info', durationMs) {
  const id = Date.now() + Math.random()
  // Explicit `undefined` opts into the type default. Callers can still
  // pass 0 to force "manual dismiss only" or a positive number to override.
  const resolvedDuration =
    durationMs === undefined ? (DEFAULT_DURATIONS[type] ?? DEFAULT_DURATIONS.info) : durationMs
  toastListeners.forEach((fn) => fn({ id, message, type, durationMs: resolvedDuration }))
  return id
}

export function useToast() {
  return {
    success: (msg, ms) => showToast(msg, 'success', ms),
    error: (msg, ms) => showToast(msg, 'error', ms),
    info: (msg, ms) => showToast(msg, 'info', ms),
  }
}
