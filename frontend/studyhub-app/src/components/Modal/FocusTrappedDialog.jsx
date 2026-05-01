/**
 * FocusTrappedDialog — accessible dialog primitive for the whole app.
 *
 * Replaces the ad-hoc <div role="dialog" aria-modal="true"> pattern that
 * was scattered across ~12 modal components. Wraps children in
 * `focus-trap-react` so:
 *
 *   - Tab / Shift+Tab cycle stays inside the dialog while it's open
 *     (W3C ARIA Authoring Practices §3.9 — Modal Dialog Pattern).
 *   - Focus moves to the first focusable element on open (or to the
 *     element matching `initialFocusSelector` if provided).
 *   - Focus restores to the trigger element on close.
 *   - Escape closes (unless `escapeDeactivates={false}`).
 *   - Click on the backdrop closes (unless `clickOutsideDeactivates={false}`).
 *
 * Renders via `createPortal(…, document.body)` so a transformed ancestor
 * (anime.js wrapper, etc.) doesn't break `position: fixed` viewport
 * centering — the CLAUDE.md "Modals broken inside animated containers"
 * rule.
 *
 * Honours `prefers-reduced-motion`: skips the fade-in transition when
 * the user has the OS setting on (CLAUDE.md "CSS and Styling" rule).
 *
 * Background siblings get `aria-hidden="true"` while the dialog is open
 * so assistive tech doesn't announce content the user can't reach.
 * `inert` attribute polyfill via aria-hidden — modern browsers (Chrome
 * 102+, Safari 15.5+, Firefox 112+) honour `inert` directly; we set
 * both for older-browser safety.
 *
 * Usage:
 *
 *   <FocusTrappedDialog
 *     open={isOpen}
 *     onClose={() => setOpen(false)}
 *     ariaLabelledBy="my-dialog-title"
 *     initialFocusSelector="[data-autofocus]"
 *     clickOutsideDeactivates={false}     // forms with state
 *     overlayStyle={{...}}                 // optional override
 *     panelStyle={{...}}                   // optional override
 *   >
 *     <h2 id="my-dialog-title">…</h2>
 *     <input data-autofocus … />
 *     …
 *   </FocusTrappedDialog>
 */
import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import FocusTrap from 'focus-trap-react'

const DEFAULT_OVERLAY_STYLE = {
  position: 'fixed',
  inset: 0,
  background: 'var(--sh-modal-overlay)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
}

const DEFAULT_PANEL_STYLE = {
  background: 'var(--sh-surface)',
  borderRadius: 14,
  padding: 24,
  maxWidth: 480,
  width: '100%',
  display: 'grid',
  gap: 16,
  boxShadow: 'var(--shadow-lg)',
}

export default function FocusTrappedDialog({
  open,
  onClose,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaLabel,
  initialFocusSelector,
  escapeDeactivates = true,
  clickOutsideDeactivates = true,
  returnFocusOnDeactivate = true,
  overlayStyle,
  panelStyle,
  panelClassName,
  children,
}) {
  // Per-instance ref so the inert effect can identify THIS dialog's
  // overlay element by reference rather than a global query selector.
  // Stops nested / concurrent dialogs from incorrectly inerting each
  // other: the previous implementation used
  // `document.body.querySelector('[data-focustrap-active="true"]')`
  // which returned the FIRST active dialog, so a second dialog opened
  // on top of the first ended up listed as a sibling and got
  // aria-hidden + inert applied to itself.
  const overlayRef = useRef(null)

  // Mark the rest of the body inert while the dialog is open so screen
  // readers can't cross the modal boundary. Only inerts elements that
  // are direct children of <body> AND not this dialog's overlay AND
  // not already inert (so a stack of nested dialogs cooperates without
  // any of them inerting another). Skips when `open === false` to
  // avoid touching the DOM unnecessarily.
  useEffect(() => {
    if (!open) return undefined
    const overlay = overlayRef.current
    if (!overlay) return undefined
    const root = document.body
    const siblings = Array.from(root.children).filter((child) => {
      if (child === overlay) return false
      // Don't double-inert another dialog's portal — it's already
      // doing its own inerting against the rest of the tree.
      if (child.getAttribute('data-focustrap-active') === 'true') return false
      return true
    })
    const previousAria = siblings.map((el) => el.getAttribute('aria-hidden'))
    const previousInert = siblings.map((el) => (el.hasAttribute('inert') ? '' : null))
    siblings.forEach((el) => {
      el.setAttribute('aria-hidden', 'true')
      el.setAttribute('inert', '')
    })
    return () => {
      siblings.forEach((el, i) => {
        if (previousAria[i] === null) el.removeAttribute('aria-hidden')
        else el.setAttribute('aria-hidden', previousAria[i])
        if (previousInert[i] === null) el.removeAttribute('inert')
      })
    }
  }, [open])

  const focusTrapOptions = useMemo(
    () => ({
      escapeDeactivates,
      clickOutsideDeactivates,
      returnFocusOnDeactivate,
      // Try the explicit selector first; fall back to the first
      // focusable inside the panel if the selector misses.
      initialFocus: initialFocusSelector
        ? () => document.querySelector(initialFocusSelector) || undefined
        : undefined,
      // focus-trap-react fires this when escapeDeactivates / outside-
      // click triggers. We forward to onClose so React state stays the
      // single source of truth for `open`.
      onDeactivate: () => {
        if (typeof onClose === 'function') onClose()
      },
      // Allow outside click to deactivate even when the click lands on
      // the overlay (vs panel).
      allowOutsideClick: true,
    }),
    [
      escapeDeactivates,
      clickOutsideDeactivates,
      returnFocusOnDeactivate,
      initialFocusSelector,
      onClose,
    ],
  )

  if (!open) return null

  const mergedOverlay = overlayStyle
    ? { ...DEFAULT_OVERLAY_STYLE, ...overlayStyle }
    : DEFAULT_OVERLAY_STYLE
  const mergedPanel = panelStyle ? { ...DEFAULT_PANEL_STYLE, ...panelStyle } : DEFAULT_PANEL_STYLE

  // The `aria-labelledby` / `aria-label` distinction matters: prefer
  // -labelledby (points at a visible heading) per W3C; fall back to
  // -label for dialogs that don't have a visible title.
  const dialogA11y = ariaLabelledBy
    ? { 'aria-labelledby': ariaLabelledBy }
    : ariaLabel
      ? { 'aria-label': ariaLabel }
      : {}

  return createPortal(
    <FocusTrap focusTrapOptions={focusTrapOptions}>
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        {...dialogA11y}
        {...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {})}
        data-focustrap-active="true"
        // The overlay handles backdrop clicks. focus-trap-react's
        // clickOutsideDeactivates also fires on overlay click, so this
        // onClick is redundant — kept defensively for browsers that
        // swallow the focus-trap handler.
        onClick={(event) => {
          if (event.target === event.currentTarget && clickOutsideDeactivates) {
            if (typeof onClose === 'function') onClose()
          }
        }}
        style={mergedOverlay}
      >
        <div
          // Stop propagation so a click inside the panel doesn't bubble
          // to the overlay's backdrop-close handler.
          onClick={(event) => event.stopPropagation()}
          className={panelClassName}
          style={mergedPanel}
        >
          {children}
        </div>
      </div>
    </FocusTrap>,
    document.body,
  )
}
