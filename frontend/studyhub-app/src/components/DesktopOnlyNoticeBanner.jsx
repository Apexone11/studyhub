/**
 * DesktopOnlyNoticeBanner — one-time, dismissible banner shown to
 * browser visitors on a phone or tablet, letting them know that a few
 * StudyHub surfaces (HTML editor, admin pages) are easier on a laptop.
 *
 * Mount once near the toast container in `App.jsx` so the banner is
 * visible on every authenticated route without per-page wiring. The
 * banner itself is render-gated:
 *   - `deviceClass` must be 'phone' or 'tablet'.
 *   - The dismissed flag in localStorage
 *     (`studyhub.deviceBanner.dismissed.v1`) must be unset.
 *
 * Storage:
 *   - Persisted dismissal is stored under
 *     `studyhub.deviceBanner.dismissed.v1`. The `.v1` suffix lets us
 *     re-engage every previously-dismissed user if the copy or the
 *     feature matrix changes in a way that warrants re-prompting; bump
 *     the suffix instead of writing a migration.
 *
 * Animation:
 *   - Slide-down on mount, slide-up on dismiss. Both gated on the
 *     shared `useReducedMotion` hook so OS-level + in-app
 *     "reduce motion" toggles are honored.
 *
 * Accessibility:
 *   - `role="status"` so screen readers announce the banner without
 *     interrupting the user (it is informational, not modal).
 *   - The dismiss button is a real `<button>` with `aria-label` and a
 *     44×44 minimum touch target per WCAG 2.1 SC 2.5.5.
 *
 * Visual:
 *   - Token-based colors (`var(--sh-info-*)` for the info palette).
 *     Warm but explicitly not alarming — this is a hint, not an error.
 *   - Top-anchored, full width on mobile.
 *
 * Loop M1 (2026-05-13).
 */
import { useState } from 'react'
import { DEVICE_CLASS_PHONE, DEVICE_CLASS_TABLET, useDeviceClass } from '../lib/useDeviceClass'
import useReducedMotion from '../lib/useReducedMotion'

const DISMISS_STORAGE_KEY = 'studyhub.deviceBanner.dismissed.v1'
const SLIDE_OUT_DURATION_MS = 220

function readPersistedDismissal() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(DISMISS_STORAGE_KEY) === 'true'
  } catch {
    // Safari Private mode or storage extension blocked us. Default to
    // "not dismissed" so the user can still see and dismiss the
    // banner this session, but it will re-appear next visit — that is
    // the right least-surprising fallback.
    return false
  }
}

function writePersistedDismissal() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, 'true')
  } catch {
    /* see note in readPersistedDismissal — non-fatal */
  }
}

export default function DesktopOnlyNoticeBanner() {
  const { deviceClass } = useDeviceClass()
  const reducedMotion = useReducedMotion()

  // Lazy-init from storage so first render already reflects the
  // persisted state — no flash of banner for users who have dismissed
  // it on a previous visit.
  const [dismissed, setDismissed] = useState(readPersistedDismissal)
  // `closing` lets us play the slide-up animation before unmounting.
  // When reduced-motion is on, we skip the closing state entirely.
  // We deliberately don't reset this in an effect when device class
  // flips back — once dismiss starts, the unmount completes within
  // SLIDE_OUT_DURATION_MS and `dismissed` takes over the early-return
  // below, so a stuck `closing=true` is unreachable.
  const [closing, setClosing] = useState(false)

  const isMobileClass = deviceClass === DEVICE_CLASS_PHONE || deviceClass === DEVICE_CLASS_TABLET

  if (dismissed || !isMobileClass) return null

  const deviceLabel = deviceClass === DEVICE_CLASS_PHONE ? 'phone' : 'tablet'

  function handleDismiss() {
    writePersistedDismissal()
    if (reducedMotion) {
      setDismissed(true)
      return
    }
    // Play the slide-up, then unmount. A single setTimeout is fine —
    // if the component unmounts (route change) the timeout will fire
    // into nothing.
    setClosing(true)
    window.setTimeout(() => setDismissed(true), SLIDE_OUT_DURATION_MS)
  }

  const animationName = reducedMotion ? 'none' : closing ? 'sh-banner-up' : 'sh-banner-down'

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="desktop-only-notice-banner"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        padding: '10px 14px',
        background: 'var(--sh-info-bg)',
        color: 'var(--sh-info-text)',
        borderBottom: '1px solid var(--sh-info-border)',
        boxShadow: '0 4px 10px -8px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
        lineHeight: 1.4,
        fontFamily: 'inherit',
        animation: `${animationName} ${SLIDE_OUT_DURATION_MS}ms ease-out`,
        animationFillMode: 'both',
      }}
    >
      <style>{`
        @keyframes sh-banner-down {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes sh-banner-up {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(-100%); opacity: 0; }
        }
      `}</style>
      <p style={{ margin: 0, flex: 1, color: 'var(--sh-info-text)' }}>
        You&apos;re on {deviceLabel}. Most StudyHub features work great here — a few like the HTML
        editor and admin tools are easier on a laptop. Tap to dismiss.
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss device notice"
        data-testid="desktop-only-notice-dismiss"
        style={{
          minWidth: 44,
          minHeight: 44,
          width: 44,
          height: 44,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: '1px solid var(--sh-info-border)',
          borderRadius: 10,
          color: 'var(--sh-info-text)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontWeight: 700,
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        {/* Token-free glyph (multiplication sign U+00D7) keeps the
            close button accessible without depending on the icon
            library. The actual semantic close action is in
            `aria-label`. */}
        &#215;
      </button>
    </div>
  )
}
