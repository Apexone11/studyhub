/* ═══════════════════════════════════════════════════════════════════════════
 * clipboard.js — Clipboard utility with safe fallback + toast
 *
 * Loop M20 (2026-05-13). Replaces ad-hoc `navigator.clipboard.writeText`
 * call sites with a single helper that:
 *
 *   - Prefers the async Clipboard API (`navigator.clipboard.writeText`).
 *   - Falls back to a hidden `<textarea>` + `document.execCommand('copy')`
 *     when the async API is unavailable (older Safari, non-secure
 *     context, file:// origin, etc.). The fallback is the textarea
 *     pattern documented on MDN and used by every major web app.
 *   - Returns a Promise<boolean> — `true` when the copy succeeded,
 *     `false` when both paths failed. Callers can decide between a
 *     success toast / haptic and a manual-copy fallback prompt.
 *
 * Optional second arg controls whether a "Copied!" toast fires on
 * success. Default `true`. Disable when the caller wants its own toast
 * copy (e.g., "Citation copied to clipboard").
 *
 * Never throws — callers do not need a try/catch wrapper.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { showToast } from './toast'

/**
 * Copy `text` to the system clipboard.
 *
 * @param {string} text - The text to copy. Treated as `String(text)`.
 * @param {object} [opts]
 * @param {boolean} [opts.toast=true] - Show a "Copied!" toast on success.
 * @param {string} [opts.toastMessage] - Override the success toast copy.
 * @param {string} [opts.errorMessage] - Override the failure toast copy.
 *   Empty string disables the failure toast.
 * @returns {Promise<boolean>} true on success.
 */
export async function copyToClipboard(text, opts = {}) {
  const value = String(text ?? '')
  if (!value) return false

  const { toast = true, toastMessage = 'Copied!', errorMessage = 'Could not copy' } = opts

  // Path 1 — async Clipboard API. Requires a secure context (https / localhost)
  // and a user gesture in most browsers. Safe to call on every browser that
  // exposes it; rejection is caught below.
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      if (toast) showToast(toastMessage, 'success', 1800)
      return true
    } catch {
      // Fall through to execCommand path.
    }
  }

  // Path 2 — legacy hidden-textarea fallback. Works on http:// origins and
  // browsers that don't yet support `navigator.clipboard` (older Safari,
  // ancient Edge). The textarea is placed off-screen but inside the document
  // so `execCommand('copy')` reads from a real selection.
  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    try {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '-1000px'
      ta.style.left = '-1000px'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      ta.setSelectionRange(0, value.length)
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) {
        if (toast) showToast(toastMessage, 'success', 1800)
        return true
      }
    } catch {
      // Fall through to failure path.
    }
  }

  if (toast && errorMessage) showToast(errorMessage, 'error', 2500)
  return false
}

/**
 * `true` when the clipboard write API is at all reachable. Useful when a
 * caller wants to gate UI on availability (e.g., hide a "Copy" button on
 * a non-secure context).
 */
export function isClipboardAvailable() {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) return true
  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') return true
  return false
}
