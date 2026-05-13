/**
 * useScholarShortcuts — window-level keydown hook for Scholar pages.
 *
 * Attaches a single `keydown` listener while the hook is mounted and
 * dispatches to caller-supplied callbacks based on the key pressed.
 * Cleans up on unmount.
 *
 * CRITICAL: every binding is gated on `!isTypingInInput(event.target)`
 * so a user typing in the search box, an annotation textarea, or any
 * `contenteditable` surface never has their keystrokes intercepted.
 *
 * Bindings (all single-key except `Cmd/Ctrl+K`):
 *   ?          → onOpenShortcuts
 *   s          → onSave
 *   a          → onAnnotate
 *   c          → onCite
 *   g          → onGenerateSheet
 *   / or Cmd/Ctrl+K → onFocusSearch
 *   j          → onNextResult
 *   k          → onPrevResult
 *   r          → onToggleReadingMode
 *   Escape     → onCloseOverlay
 *
 * Each callback is optional — only bindings with a non-null callback
 * invoke `preventDefault()`. Unhandled keys pass through.
 *
 * The callbacks ref pattern keeps the keydown listener stable so we
 * don't re-attach on every parent re-render (React Compiler-friendly).
 */
import { useEffect, useRef } from 'react'

/**
 * Returns true when the keydown target is a text-entry surface or
 * has explicitly opted out of shortcuts.
 *
 * @param {EventTarget | null} target
 */
export function isTypingInInput(target) {
  if (!target || typeof target !== 'object') return false
  const el = /** @type {HTMLElement} */ (target)
  if (el.getAttribute && el.getAttribute('data-shortcuts-disabled') === 'true') return true
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable === true) return true
  // contenteditable=true on an ancestor still puts us in typing mode.
  // The browser sets `isContentEditable` on every descendant element,
  // so the above check covers nested spans inside an editable host.
  return false
}

/**
 * @param {{
 *   onOpenShortcuts?: () => void,
 *   onSave?: () => void,
 *   onAnnotate?: () => void,
 *   onCite?: () => void,
 *   onGenerateSheet?: () => void,
 *   onFocusSearch?: () => void,
 *   onNextResult?: () => void,
 *   onPrevResult?: () => void,
 *   onToggleReadingMode?: () => void,
 *   onCloseOverlay?: () => void,
 *   enabled?: boolean,
 * }} handlers
 */
export default function useScholarShortcuts(handlers) {
  // Keep the latest handlers in a ref so the window listener stays
  // referentially stable across renders. This avoids the
  // attach/detach churn that would otherwise happen every time the
  // parent re-renders with new closures. Ref assignment lives inside
  // an effect so we don't touch refs during render (react-hooks/refs).
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    if (handlers && handlers.enabled === false) return undefined

    const handleKeyDown = (event) => {
      // Skip when typing — never intercept text entry.
      if (isTypingInInput(event.target)) return

      // Allow modifier-free Escape to flow through to native UA
      // behaviour only if no overlay handler is registered.
      const current = handlersRef.current || {}

      // Cmd/Ctrl+K opens the search regardless of which side of the
      // keyboard. Modifier+other-key combinations otherwise pass
      // through (Cmd+R reload, Cmd+S browser save, etc.).
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (typeof current.onFocusSearch === 'function') {
          event.preventDefault()
          current.onFocusSearch()
        }
        return
      }

      // Any other modifier combination is reserved for the browser /
      // OS — don't capture it.
      if (event.metaKey || event.ctrlKey || event.altKey) return

      // event.key reports the produced character. `?` is shift-/ on
      // US layouts, which `event.key` resolves to `?` directly.
      const key = event.key

      switch (key) {
        case '?':
          if (typeof current.onOpenShortcuts === 'function') {
            event.preventDefault()
            current.onOpenShortcuts()
          }
          return
        case '/':
          if (typeof current.onFocusSearch === 'function') {
            event.preventDefault()
            current.onFocusSearch()
          }
          return
        case 'Escape':
          if (typeof current.onCloseOverlay === 'function') {
            // Don't preventDefault — let the browser's native
            // Escape behaviour (e.g. closing a native datepicker)
            // still run if the parent doesn't handle it.
            current.onCloseOverlay()
          }
          return
        default:
          break
      }

      // Single-letter bindings — case-insensitive for ergonomics
      // (caps lock shouldn't make `S` stop saving).
      switch (key.toLowerCase()) {
        case 's':
          if (typeof current.onSave === 'function') {
            event.preventDefault()
            current.onSave()
          }
          return
        case 'a':
          if (typeof current.onAnnotate === 'function') {
            event.preventDefault()
            current.onAnnotate()
          }
          return
        case 'c':
          if (typeof current.onCite === 'function') {
            event.preventDefault()
            current.onCite()
          }
          return
        case 'g':
          if (typeof current.onGenerateSheet === 'function') {
            event.preventDefault()
            current.onGenerateSheet()
          }
          return
        case 'j':
          if (typeof current.onNextResult === 'function') {
            event.preventDefault()
            current.onNextResult()
          }
          return
        case 'k':
          if (typeof current.onPrevResult === 'function') {
            event.preventDefault()
            current.onPrevResult()
          }
          return
        case 'r':
          if (typeof current.onToggleReadingMode === 'function') {
            event.preventDefault()
            current.onToggleReadingMode()
          }
          return
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // We intentionally depend only on `enabled` — handler identity
    // changes are absorbed by the ref, keeping the listener stable.
  }, [handlers])
}
