/* ═══════════════════════════════════════════════════════════════════════════
 * useFocusTrap.js — Accessible focus trapping hook for modals and panels
 *
 * As of 2026-05-01 this hook is a thin adapter over the
 * `focus-trap` library (the same engine that powers
 * `components/Modal/FocusTrappedDialog`). Both APIs ship in this repo
 * to cover two ergonomics:
 *
 *   - `useFocusTrap({ active })`  → return a ref you attach to a div
 *     you already render. Used by chat panels and pre-built modals
 *     (SearchModal, ConfirmDialog, ReportModal, ChatPanel,
 *     LegalAcceptanceEnforcementModal).
 *   - `<FocusTrappedDialog open ariaLabelledBy="…" />` → the primitive
 *     wraps everything for you (overlay + panel + portal + ARIA).
 *     Used for the 9 modals migrated 2026-05-01.
 *
 * Both share a single battle-tested engine — no more bespoke
 * `addEventListener('keydown', …)` Tab-cycling logic, no more
 * accidental focus escape, no more divergence between the two
 * implementations.
 *
 * Features (unchanged from the original API contract):
 *   - Traps Tab/Shift+Tab focus within the container.
 *   - Closes on Escape key (optional, default true).
 *   - Auto-focuses the first focusable element (or `initialFocusRef`).
 *   - Restores focus to the previously focused element on close.
 *   - Locks body scroll while active (counted across concurrent
 *     traps so nested modals don't unlock prematurely).
 *
 * Usage (unchanged):
 *   const trapRef = useFocusTrap({ active: isOpen, onClose: handleClose })
 *   <div ref={trapRef} role="dialog" aria-modal="true">…</div>
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from 'react'
import { createFocusTrap } from 'focus-trap'

/**
 * @param {object}  options
 * @param {boolean} options.active         — whether the trap is active
 * @param {Function} [options.onClose]     — called when Escape is pressed
 * @param {boolean} [options.escapeCloses] — whether Escape closes (default: true)
 * @param {boolean} [options.lockScroll]   — whether to lock body scroll (default: true)
 * @param {React.RefObject} [options.initialFocusRef] — ref to focus on open
 * @returns {React.RefObject} — attach to the container element
 */
export function useFocusTrap({
  active,
  onClose,
  escapeCloses = true,
  lockScroll = true,
  initialFocusRef,
} = {}) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!active) return undefined
    const container = containerRef.current
    if (!container) return undefined

    // Body-scroll lock — counted so concurrent traps don't restore
    // overflow until the last one unmounts.
    if (lockScroll && typeof document !== 'undefined') {
      const { body } = document
      if (body.__focusTrapScrollLockCount == null) {
        body.__focusTrapScrollLockCount = 0
      }
      if (body.__focusTrapScrollLockCount === 0) {
        body.__focusTrapPrevOverflow = body.style.overflow
        body.style.overflow = 'hidden'
      }
      body.__focusTrapScrollLockCount += 1
    }

    // Tracks whether the active deactivation was user-driven (Escape /
    // outside-click intercept) vs programmatic (parent set open=false
    // and the cleanup function ran trap.deactivate()). focus-trap
    // calls onDeactivate in BOTH cases — without this guard, onClose
    // would fire twice on Escape, and once again during unmount, with
    // every duplicate triggering the parent's state setter.
    let userDrivenDeactivation = false
    const trap = createFocusTrap(container, {
      // Escape — when escapeCloses is true, fire onClose AND let the
      // trap deactivate. When false, ignore the key.
      escapeDeactivates: (event) => {
        if (!escapeCloses) return false
        // Only mark user-driven when this is actually an Escape press.
        // Other deactivation paths (programmatic, outside-click) leave
        // the flag false so onDeactivate stays silent.
        if (event && event.key === 'Escape') userDrivenDeactivation = true
        return true
      },
      onDeactivate: () => {
        if (userDrivenDeactivation && typeof onClose === 'function') onClose()
        userDrivenDeactivation = false
      },
      // Initial focus: explicit ref → first focusable inside container
      // → container itself (with tabIndex=-1) as a last resort.
      initialFocus: () => initialFocusRef?.current || undefined,
      // Don't fight the existing scroll-lock; the hook owns body
      // overflow.
      preventScroll: false,
      // Restore focus to whatever was focused before activation.
      returnFocusOnDeactivate: true,
      // Allow clicks outside the trapped region without auto-
      // deactivating. Consumers control closeOnOverlayClick at their
      // own JSX level.
      clickOutsideDeactivates: false,
      allowOutsideClick: true,
      // If the container has no focusable children, focus the
      // container itself rather than throwing.
      fallbackFocus: container,
    })

    try {
      trap.activate()
    } catch {
      // focus-trap throws if the container has nothing focusable AND
      // no fallbackFocus — guarded above, but stay defensive.
    }

    return () => {
      try {
        trap.deactivate()
      } catch {
        /* trap may already be torn down */
      }

      if (lockScroll && typeof document !== 'undefined') {
        const { body } = document
        if (body.__focusTrapScrollLockCount != null && body.__focusTrapScrollLockCount > 0) {
          body.__focusTrapScrollLockCount -= 1
          if (body.__focusTrapScrollLockCount === 0) {
            body.style.overflow = body.__focusTrapPrevOverflow || ''
            delete body.__focusTrapPrevOverflow
            delete body.__focusTrapScrollLockCount
          }
        }
      }
    }
  }, [active, escapeCloses, lockScroll, onClose, initialFocusRef])

  return containerRef
}
