/* ═══════════════════════════════════════════════════════════════════════════
 * share.js — Native Web Share with copy-link fallback
 *
 * Loop M20 (2026-05-13). Wraps `navigator.share()` so every share
 * button in the app — sheet share, note share, profile share,
 * achievement share, feed-post share — follows the same pattern:
 *
 *   1. On a browser that supports `navigator.share` (most mobile
 *      browsers, plus Safari on macOS / iPadOS), open the OS share
 *      sheet. Users can pick Messages / Mail / AirDrop / WhatsApp /
 *      etc.
 *
 *   2. On a desktop browser without share support, fall back to
 *      copying the URL to the clipboard and toasting "Link copied".
 *
 * `navigator.share()` MUST be invoked synchronously inside the user
 * gesture handler — wrapping it in a `setTimeout` or awaiting a fetch
 * before calling it will throw `NotAllowedError`. The caller is
 * therefore expected to invoke `webShare()` directly from a
 * `click`/`pointerup`/`keydown(Enter)` handler.
 *
 * Returns a Promise<{method:'share'|'copy'|'none', ok:boolean}> for
 * telemetry. Callers may discard the result.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { copyToClipboard } from './clipboard'
import { success as hapticSuccess } from './haptics'

/**
 * @param {object} payload
 * @param {string} payload.url - Absolute URL to share. Required.
 * @param {string} [payload.title] - Optional title hint to the share sheet.
 * @param {string} [payload.text] - Optional body text passed to the share sheet.
 * @param {object} [opts]
 * @param {boolean} [opts.haptic=true] - Vibrate on success.
 * @param {string} [opts.copyToast='Link copied'] - Toast text on copy fallback.
 * @returns {Promise<{method:'share'|'copy'|'none', ok:boolean}>}
 */
export async function webShare(payload, opts = {}) {
  const { url, title, text } = payload || {}
  if (!url || typeof url !== 'string') return { method: 'none', ok: false }

  const { haptic = true, copyToast = 'Link copied' } = opts

  // Path 1 — native share sheet.
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      // canShare is optional; not all share-supporting browsers expose it.
      if (typeof navigator.canShare === 'function') {
        const shareable = { url }
        if (title) shareable.title = title
        if (text) shareable.text = text
        if (!navigator.canShare(shareable)) throw new Error('canShare returned false')
      }
      const data = { url }
      if (title) data.title = title
      if (text) data.text = text
      await navigator.share(data)
      if (haptic) hapticSuccess()
      return { method: 'share', ok: true }
    } catch (err) {
      // AbortError = user dismissed the share sheet. That's a user
      // choice, not a failure — bail without falling back to copy
      // (copying would feel like the share button is "broken").
      if (err && err.name === 'AbortError') {
        return { method: 'share', ok: false }
      }
      // Anything else falls through to the clipboard path.
    }
  }

  // Path 2 — copy to clipboard.
  const ok = await copyToClipboard(url, { toastMessage: copyToast })
  if (ok && haptic) hapticSuccess()
  return { method: 'copy', ok }
}

/** `true` when `navigator.share()` is usable. */
export function isWebShareAvailable() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}
