/* ═══════════════════════════════════════════════════════════════════════════
 * toast.js — Toast notification utilities (non-component exports)
 *
 * Separated from Toast.jsx to satisfy react-refresh/only-export-components.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ── Global event bus ─────────────────────────────────────────────── */
export const toastListeners = new Set()

export function showToast(message, type = 'info', durationMs = 3500) {
  const id = Date.now() + Math.random()
  toastListeners.forEach((fn) => fn({ id, message, type, durationMs }))
  return id
}

export function useToast() {
  return {
    success: (msg, ms) => showToast(msg, 'success', ms),
    error: (msg, ms) => showToast(msg, 'error', ms),
    info: (msg, ms) => showToast(msg, 'info', ms),
  }
}
