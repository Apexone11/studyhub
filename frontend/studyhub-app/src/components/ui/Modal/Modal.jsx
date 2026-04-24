import { forwardRef, useCallback, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

/**
 * Modal — dialog primitive with portal, focus trap, scroll lock.
 *
 * See `docs/internal/audits/2026-04-24-day2-primitives-plus-phase2-handoff.md`
 * Part A for the canonical spec.
 *
 * API:
 *
 *   open                 boolean  — required. When false, nothing renders.
 *   onClose              () => void — required.
 *   size                 "default" | "wide"   default "default"
 *   title                string | ReactNode   optional
 *   description          string | ReactNode   optional
 *   closeOnOverlayClick  boolean   default true
 *   closeOnEscape        boolean   default true
 *   initialFocusRef      Ref       optional — element to focus on open
 *   ariaLabel            string    required when no title is given
 *   children             body content
 *
 * Accessibility:
 *  - role="dialog", aria-modal="true".
 *  - aria-labelledby wired to the title when present, otherwise
 *    the caller MUST pass `ariaLabel`.
 *  - aria-describedby wired to the description when present.
 *  - Focus moves into the modal on open and is trapped with Tab /
 *    Shift+Tab wrapping the first/last focusable descendants.
 *  - On close, focus returns to whatever was focused before open.
 *  - Body scroll locks while open.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const CloseIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

export default function Modal({
  open,
  onClose,
  size = 'default',
  title,
  description,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  initialFocusRef,
  ariaLabel,
  children,
}) {
  const titleId = useId()
  const descId = useId()
  const modalRef = useRef(null)
  const previouslyFocusedRef = useRef(null)

  // Close on Escape — registered at document level so it fires even if
  // the user's focus is on the backdrop.
  useEffect(() => {
    if (!open || !closeOnEscape) return undefined
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeOnEscape, onClose])

  // Focus management: on open, remember the previously-focused element
  // and move focus into the modal. On close, restore focus to what was
  // focused before. Uses a layout effect-ish pattern via useEffect with
  // a microtask so the modal DOM is already painted.
  useEffect(() => {
    if (!open) return undefined
    previouslyFocusedRef.current = typeof document !== 'undefined' ? document.activeElement : null

    // Focus either the caller-supplied ref or the first focusable
    // element inside the modal, falling back to the modal container
    // itself (which has tabIndex=-1 so it can hold focus).
    const target =
      initialFocusRef?.current || modalRef.current?.querySelector(FOCUSABLE) || modalRef.current
    target?.focus?.()

    return () => {
      const prev = previouslyFocusedRef.current
      if (prev && typeof prev.focus === 'function') {
        prev.focus()
      }
    }
  }, [open, initialFocusRef])

  // Scroll lock on <body> while open.
  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Trap Tab inside the modal.
  const onKeyDown = useCallback((e) => {
    if (e.key !== 'Tab') return
    const root = modalRef.current
    if (!root) return
    const focusable = Array.from(root.querySelectorAll(FOCUSABLE)).filter(
      (el) => !el.hasAttribute('disabled'),
    )
    if (focusable.length === 0) {
      e.preventDefault()
      root.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  if (!open) return null
  if (typeof document === 'undefined') return null

  const onOverlayClick = (e) => {
    if (!closeOnOverlayClick) return
    if (e.target === e.currentTarget) onClose?.()
  }

  const hasTitle = Boolean(title)
  const hasDescription = Boolean(description)
  const modalClasses = [styles.modal, size === 'wide' && styles['modal--wide']]
    .filter(Boolean)
    .join(' ')
  const bodyClasses = [styles.body, !hasTitle && styles['body--noHeader']].filter(Boolean).join(' ')

  return createPortal(
    <div className={styles.overlay} onClick={onOverlayClick} role="presentation">
      <div
        ref={modalRef}
        className={modalClasses}
        role="dialog"
        aria-modal="true"
        aria-label={hasTitle ? undefined : ariaLabel}
        aria-labelledby={hasTitle ? titleId : undefined}
        aria-describedby={hasDescription ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {hasTitle || hasDescription ? (
          <header className={styles.header}>
            <div className={styles.headerText}>
              {hasTitle ? (
                <h2 id={titleId} className={styles.title}>
                  {title}
                </h2>
              ) : null}
              {hasDescription ? (
                <p id={descId} className={styles.description}>
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close dialog"
            >
              <CloseIcon />
            </button>
          </header>
        ) : (
          <button
            type="button"
            className={`${styles.closeBtn} ${styles['closeBtn--floating']}`}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <CloseIcon />
          </button>
        )}
        <div className={bodyClasses}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export const ModalFooter = forwardRef(function ModalFooter({ className, children, ...rest }, ref) {
  const classes = [styles.footer, className].filter(Boolean).join(' ')
  return (
    <div ref={ref} className={classes} {...rest}>
      {children}
    </div>
  )
})
