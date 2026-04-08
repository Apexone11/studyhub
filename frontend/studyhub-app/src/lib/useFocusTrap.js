/* ═══════════════════════════════════════════════════════════════════════════
 * useFocusTrap.js — Accessible focus trapping hook for modals and panels
 *
 * Features:
 *   - Traps Tab/Shift+Tab focus within the container
 *   - Closes on Escape key (optional)
 *   - Auto-focuses the first focusable element (or a specified initialFocusRef)
 *   - Restores focus to the previously focused element on close
 *   - Locks body scroll while active
 *
 * Usage:
 *   const trapRef = useFocusTrap({ active: isOpen, onClose: handleClose })
 *   <div ref={trapRef} role="dialog" aria-modal="true">...</div>
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useCallback } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

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
  const previousFocusRef = useRef(null)

  const handleKeyDown = useCallback((e) => {
    if (!containerRef.current) return

    // Escape key
    if (e.key === 'Escape' && escapeCloses && onClose) {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      return
    }

    // Tab trapping
    if (e.key === 'Tab') {
      const focusable = containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        // Shift+Tab: if on first element, wrap to last
        if (document.activeElement === first || !containerRef.current.contains(document.activeElement)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === last || !containerRef.current.contains(document.activeElement)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
  }, [escapeCloses, onClose])

  useEffect(() => {
    if (!active) return

    // Save current focus to restore later
    previousFocusRef.current = document.activeElement

    // Lock body scroll using a shared counter so concurrent focus traps
    // do not restore scroll prematurely when one unmounts while others remain.
    if (lockScroll && typeof document !== 'undefined') {
      const body = document.body
      if (body.__focusTrapScrollLockCount == null) {
        body.__focusTrapScrollLockCount = 0
      }
      if (body.__focusTrapScrollLockCount === 0) {
        body.__focusTrapPrevOverflow = body.style.overflow
        body.style.overflow = 'hidden'
      }
      body.__focusTrapScrollLockCount += 1
    }

    // Focus initial element after a tick (allows portal rendering)
    const focusTimer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
      } else if (containerRef.current) {
        const first = containerRef.current.querySelector(FOCUSABLE_SELECTOR)
        if (first) first.focus()
      }
    }, 50)

    // Attach keydown listener
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)

      // Restore body scroll only when the last active focus trap unmounts
      if (lockScroll && typeof document !== 'undefined') {
        const body = document.body
        if (body.__focusTrapScrollLockCount != null && body.__focusTrapScrollLockCount > 0) {
          body.__focusTrapScrollLockCount -= 1
          if (body.__focusTrapScrollLockCount === 0) {
            body.style.overflow = body.__focusTrapPrevOverflow || ''
            delete body.__focusTrapPrevOverflow
            delete body.__focusTrapScrollLockCount
          }
        }
      }

      // Restore previous focus
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [active, handleKeyDown, lockScroll, initialFocusRef])

  return containerRef
}
