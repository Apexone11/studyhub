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

  // Escape key → "Essential only" (least-privilege default, matches
  // the spec's accessibility requirement). Listener is attached only
  // when the banner is actually rendered.
  useEffect(() => {
    if (dismissed) return undefined
    function handleKey(event) {
      if (event.key !== 'Escape') return
      writeConsent('essential')
      setDismissed(true)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [dismissed])

  if (dismissed) return null

  const handleAcceptAll = () => {
    writeConsent('all')
    setDismissed(true)
  }
  const handleEssential = () => {
    writeConsent('essential')
    setDismissed(true)
  }

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
