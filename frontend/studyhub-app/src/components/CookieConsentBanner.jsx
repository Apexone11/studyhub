/**
 * CookieConsentBanner — self-hosted replacement for the Termly
 * resource-blocker that was being aggressively stripped by Chrome
 * incognito / Brave / Safari / Firefox-strict third-party-cookie
 * blocking. By owning the consent prompt + the analytics-loading
 * gate ourselves we get a banner that actually persists the user's
 * choice and only fires Microsoft Clarity + Google Ads after explicit
 * "Accept all" (founder decision A — Task #70 handoff §"Founder
 * decision LOCKED").
 *
 * Behavior contract (must match the test suite):
 *   - Reads `readConsent()` once on mount via lazy useState init. If
 *     a valid consent record exists → render nothing.
 *   - First visit → render bottom-anchored bar with three actions:
 *     "Cookie settings" (link to /cookies), "Essential only", "Accept all".
 *   - Clicking either accept button calls `writeConsent(...)` which
 *     persists the choice and dispatches `studyhub:consent-changed`
 *     on `window`. The index.html analytics loaders listen for that
 *     event and fire Clarity + Google Ads if-and-only-if the choice
 *     is 'all'.
 *   - Capacitor native shell (`window.__SH_NATIVE__ === true`)
 *     short-circuits to render nothing — native users don't see web
 *     analytics anyway and the banner would clip the WebView chrome.
 *   - Escape key behaves as "Essential only" (least-privilege default
 *     for an explicit dismiss) — the banner is non-modal, so we don't
 *     trap focus, but the keyboard accelerator must be handled
 *     globally while the banner is rendered.
 *
 * Accessibility:
 *   - role="dialog" + aria-labelledby + aria-describedby. Non-modal
 *     (page stays scrollable / interactive) so we do NOT trap focus.
 *   - All three actions are real <button>s in keyboard tab order.
 *   - Cookie settings link uses <Link to="/cookies"> so router state
 *     is preserved.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { readConsent, writeConsent } from '../lib/cookieConsent'
import styles from './CookieConsentBanner.module.css'

function isNativeShell() {
  return typeof window !== 'undefined' && window.__SH_NATIVE__ === true
}

/**
 * Fallback used when localStorage.setItem throws (Safari Private mode,
 * storage extensions, disk full). `writeConsent` returns null in that
 * case and the persistent `studyhub:consent-changed` event never
 * fires, so analytics would never load. We dispatch the same event
 * payload manually here so this-session analytics still load — the
 * choice just won't be remembered after reload, which is the most
 * we can do without writable storage.
 */
function dispatchInSessionConsent(choice) {
  try {
    window.dispatchEvent(
      new CustomEvent('studyhub:consent-changed', {
        detail: { choice, timestamp: new Date().toISOString(), persisted: false },
      }),
    )
  } catch {
    /* CustomEvent constructor unavailable — extremely old browser, give up */
  }
}

export default function CookieConsentBanner() {
  // Lazy-init: skip on native, otherwise render only when no valid
  // consent has been recorded. Reading once at mount is correct —
  // changes within the same session come from this component itself
  // (via writeConsent) and we close the banner explicitly via the
  // `dismissed` setter.
  const [dismissed, setDismissed] = useState(() => {
    if (isNativeShell()) return true
    return readConsent() !== null
  })
  // True after a writeConsent returned null AND the user clicked
  // "Dismiss anyway" on the inline failure note. The banner stays
  // mounted on the first failed click so the user can see what
  // happened, retry, or dismiss explicitly. Without this two-step,
  // a Safari-Private user would click "Accept all" → silent drop →
  // assume the button is broken.
  const [persistFailed, setPersistFailed] = useState(false)

  /**
   * Apply a consent choice with proper failure handling. Returns true
   * if the banner should dismiss (success), false otherwise (storage
   * failure — keep banner visible with inline error so the user can
   * retry or dismiss-anyway).
   */
  function applyChoice(choice) {
    const result = writeConsent(choice)
    if (result !== null) {
      setDismissed(true)
      return true
    }
    // Persistence failed. Keep banner visible, show inline error, and
    // dispatch an in-session event so analytics can still fire for
    // THIS session at the user's request.
    setPersistFailed(true)
    dispatchInSessionConsent(choice)
    return false
  }

  // Escape key → "Essential only" (least-privilege default, matches
  // the spec's accessibility requirement). Listener is attached only
  // when the banner is actually rendered.
  useEffect(() => {
    if (dismissed) return undefined
    function handleKey(event) {
      if (event.key !== 'Escape') return
      applyChoice('essential')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [dismissed])

  if (dismissed) return null

  const handleAcceptAll = () => applyChoice('all')
  const handleEssential = () => applyChoice('essential')
  const handleDismissAnyway = () => setDismissed(true)

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-body"
      className={styles.banner}
      data-testid="cookie-consent-banner"
    >
      <h2 id="cookie-consent-title" className={styles.title}>
        Cookies on StudyHub
      </h2>
      <p id="cookie-consent-body" className={styles.body}>
        We use essential cookies to keep you signed in and the site working. With your permission we
        also use analytics to understand which features help students study smarter. You can change
        your choice anytime from <Link to="/cookies">Cookie settings</Link>.
      </p>
      {persistFailed ? (
        <div
          role="alert"
          className={styles.persistError}
          data-testid="cookie-consent-persist-error"
        >
          We couldn&apos;t save your choice — your browser may be in private mode or has storage
          disabled. We&apos;ll honor your selection for this session, but we&apos;ll need to ask
          again next time.{' '}
          <button type="button" onClick={handleDismissAnyway} className={styles.dismissAnyway}>
            Dismiss anyway
          </button>
        </div>
      ) : null}
      <div className={styles.actions}>
        <Link to="/cookies" className={styles.settingsLink}>
          Cookie settings
        </Link>
        <button
          type="button"
          onClick={handleEssential}
          className={`${styles.btn} ${styles.btnSecondary}`}
          data-testid="cookie-consent-essential"
        >
          Essential only
        </button>
        <button
          type="button"
          onClick={handleAcceptAll}
          className={`${styles.btn} ${styles.btnPrimary}`}
          data-testid="cookie-consent-accept"
        >
          Accept all
        </button>
      </div>
    </div>
  )
}
