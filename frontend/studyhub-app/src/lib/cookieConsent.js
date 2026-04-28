/**
 * cookieConsent.js — single source of truth for the user's cookie
 * consent state.
 *
 * Used by:
 *   - components/CookieConsentBanner.jsx (read on mount, write on click)
 *   - index.html analytics loaders (read + listen for the
 *     `studyhub:consent-changed` event so they fire the moment consent
 *     flips from `null`/`'essential'` to `'all'` without polling)
 *
 * Key shape: `{ choice: 'all' | 'essential', timestamp: ISO8601 }`. The
 * `studyhub.cookieConsent` localStorage key is namespaced like the rest
 * of the app's persistent state (`studyhub.continuity.*`,
 * `studyhub.pendingReferral`, etc.). DO NOT rename — the index.html
 * analytics loaders read this exact key by string and a rename would
 * silently break the consent gate.
 *
 * Every read is wrapped in try/catch — Safari Private and certain
 * extensions throw on `localStorage.getItem` ("SecurityError"), which
 * we treat as "no consent set" so the banner shows again on next paint.
 */

const STORAGE_KEY = 'studyhub.cookieConsent'

/**
 * Returns the parsed consent object, or null if no valid consent has
 * been stored. Malformed JSON or unrecognized `choice` values fall
 * back to null so the banner re-prompts.
 */
export function readConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.choice === 'all' || parsed?.choice === 'essential') return parsed
    return null
  } catch {
    return null
  }
}

/**
 * Persists the consent choice and broadcasts a `studyhub:consent-changed`
 * CustomEvent so any listener (analytics loaders in index.html, runtime
 * telemetry, etc.) can react synchronously without polling. Returns the
 * stored value, or null on storage failure.
 *
 * `choice` MUST be one of 'all' | 'essential'. Callers should not pass
 * other values; future granular consent (analytics-only, etc.) belongs
 * in a separate API surface so existing readers don't accidentally
 * accept partial consent as 'all'.
 */
export function writeConsent(choice) {
  if (choice !== 'all' && choice !== 'essential') return null
  try {
    const value = { choice, timestamp: new Date().toISOString() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent('studyhub:consent-changed', { detail: value }))
    return value
  } catch {
    return null
  }
}

/**
 * True only when the user explicitly accepted ALL cookies. The
 * Microsoft Clarity + Google Ads loaders gate on this exact predicate;
 * anything other than 'all' is treated as denial.
 */
export function hasAnalyticsConsent() {
  return readConsent()?.choice === 'all'
}

/**
 * Storage key exported for tests + the index.html string-comparison
 * loader. Do not import this into product code — call `readConsent` /
 * `writeConsent` instead so future schema changes only land in one
 * file.
 */
export const COOKIE_CONSENT_STORAGE_KEY = STORAGE_KEY
