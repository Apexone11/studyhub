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
 * Loop M17 (2026-05-13) — mobile polish. The `mobileLayout` prop flips
 * the panel into a bottom-sheet (auto / default), fullscreen (crop
 * modals), or stays centered (confirm dialogs, achievement celebration)
 * at phone widths (≤ 767px). On bottom-sheet mode the user can swipe
 * the panel down to dismiss. Desktop layout is unchanged.
 *
 * Usage:
 *
 *   <FocusTrappedDialog
 *     open={isOpen}
 *     onClose={() => setOpen(false)}
 *     ariaLabelledBy="my-dialog-title"
 *     initialFocusSelector="[data-autofocus]"
 *     clickOutsideDeactivates={false}     // forms with state
 *     mobileLayout="centered"             // M17 — opt out of bottom-sheet
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
import useBottomSheetOnMobile from '../../lib/useBottomSheetOnMobile'

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
  // W3C ARIA distinguishes `dialog` (general) from `alertdialog`
  // (urgent — confirm/destroy/legal-enforce flows). Caller picks; we
  // default to the common case. Added 2026-05-27 for the modal-focus-
  // trap migration so LegalAcceptanceEnforcementModal preserves its
  // pre-migration alertdialog semantic.
  role = 'dialog',
  // Loop M17 — mobile layout strategy on phone widths (<= 767px).
  //   'auto' (default): content-heavy dialogs slide up as a bottom-sheet.
  //   'centered'      : stay centered (use for confirms and celebrations).
  //   'fullscreen'    : take over the whole viewport (crop modals).
  // Desktop layout is unchanged regardless of value.
  mobileLayout = 'auto',
  // Disable swipe-down-to-dismiss for modals carrying unsaved state.
  disableSwipeDismiss = false,
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
      // jsdom's getBoundingClientRect returns zeros for every element,
      // so focus-trap's default `displayCheck: 'full'` reports "no
      // tabbable nodes" inside a dialog whose buttons are visibly there
      // in real browsers. Relax the check only in Vitest. Production /
      // dev builds keep the strict default that filters out elements
      // hidden by CSS.
      tabbableOptions:
        import.meta.env && import.meta.env.MODE === 'test' ? { displayCheck: 'none' } : undefined,
    }),
    [
      escapeDeactivates,
      clickOutsideDeactivates,
      returnFocusOnDeactivate,
      initialFocusSelector,
      onClose,
    ],
  )

  // Loop M17 — mobile bottom-sheet / fullscreen flip. Inert on desktop.
  const sheet = useBottomSheetOnMobile({
    onDismiss: clickOutsideDeactivates ? onClose : undefined,
    disabled: disableSwipeDismiss || mobileLayout === 'centered',
  })

  // Loop M17 — keep the focused input visible above the soft keyboard.
  useEffect(() => {
    if (!open || !sheet.isMobile) return undefined
    const handleFocusIn = (event) => {
      const t = event.target
      if (!t || typeof t.scrollIntoView !== 'function') return
      const tag = t.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return
      requestAnimationFrame(() => {
        try {
          t.scrollIntoView({ block: 'center', behavior: sheet.reducedMotion ? 'auto' : 'smooth' })
        } catch {
          /* older Safari */
        }
      })
    }
    document.addEventListener('focusin', handleFocusIn)
    return () => document.removeEventListener('focusin', handleFocusIn)
  }, [open, sheet.isMobile, sheet.reducedMotion])

  if (!open) return null

  const fullscreenMobile = sheet.isMobile && mobileLayout === 'fullscreen'
  const bottomSheetMobile = sheet.isMobile && mobileLayout === 'auto'

  const overlayMobileExtra = fullscreenMobile
    ? { alignItems: 'stretch', justifyContent: 'stretch', padding: 0 }
    : bottomSheetMobile
      ? sheet.overlayMobileFlip
      : null
  const panelMobileExtra = fullscreenMobile
    ? {
        width: '100vw',
        maxWidth: '100vw',
        minWidth: 0,
        height: '100vh',
        maxHeight: '100vh',
        borderRadius: 0,
      }
    : bottomSheetMobile
      ? sheet.panelMobileFlip
      : null

  const mergedOverlay = {
    ...DEFAULT_OVERLAY_STYLE,
    ...(overlayStyle || null),
    ...(overlayMobileExtra || null),
  }
  const mergedPanel = {
    ...DEFAULT_PANEL_STYLE,
    ...(panelStyle || null),
    ...(panelMobileExtra || null),
  }

  // The `aria-labelledby` / `aria-label` distinction matters: prefer
  // -labelledby (points at a visible heading) per W3C; fall back to
  // -label for dialogs that don't have a visible title.
  const dialogA11y = ariaLabelledBy
    ? { 'aria-labelledby': ariaLabelledBy }
    : ariaLabel
      ? { 'aria-label': ariaLabel }
      : {}

  // Compose className: caller's value + entrance-animation hook.
  const panelClasses = []
  if (panelClassName) panelClasses.push(panelClassName)
  if (bottomSheetMobile) panelClasses.push('sh-bottom-sheet-enter')

  return createPortal(
    <FocusTrap focusTrapOptions={focusTrapOptions}>
      <div
        ref={overlayRef}
        role={role}
        aria-modal="true"
        {...dialogA11y}
        {...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {})}
        data-focustrap-active="true"
        className={bottomSheetMobile ? 'sh-bottom-sheet-overlay-enter' : undefined}
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
          ref={bottomSheetMobile ? sheet.setPanelRef : undefined}
          // Stop propagation so a click inside the panel doesn't bubble
          // to the overlay's backdrop-close handler.
          onClick={(event) => event.stopPropagation()}
          {...(bottomSheetMobile ? sheet.swipeHandlers : null)}
          className={panelClasses.length ? panelClasses.join(' ') : undefined}
          style={{
            ...mergedPanel,
            position: bottomSheetMobile ? 'relative' : mergedPanel.position,
          }}
        >
          {bottomSheetMobile ? sheet.dragHandleNode : null}
          {children}
        </div>
      </div>
    </FocusTrap>,
    document.body,
  )
}
