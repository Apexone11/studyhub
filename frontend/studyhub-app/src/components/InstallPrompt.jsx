/* ═══════════════════════════════════════════════════════════════════════════
 * InstallPrompt.jsx — One-time PWA "Add to Home Screen" affordance.
 *
 * Behavior:
 *   - Listens for the Chrome/Edge/Samsung `beforeinstallprompt` event and
 *     stashes the deferred prompt so we can fire it from our own UI button
 *     instead of the browser's mini-infobar.
 *   - Shows a compact, dismissable card on phone-class viewports
 *     (`max-width: 640px`) that have NOT already installed
 *     (`display-mode: standalone`) and have NOT already dismissed.
 *   - On iOS Safari the `beforeinstallprompt` event is never fired by the
 *     platform — Apple gates A2HS behind the share sheet. We detect iOS +
 *     non-standalone and render a small instructional toast instead.
 *   - Dismissal is sticky for 30 days (localStorage key
 *     `studyhub.pwaInstallDismissedAt`). The user can also accept/reject
 *     the native prompt directly, in which case Chrome won't refire it.
 *   - Suppressed inside the Capacitor native shell (`window.__SH_NATIVE__`),
 *     on `/login`, `/register`, `/onboarding`, and on the Hub AI page where
 *     the floating bubble already owns the bottom-right.
 *
 * Why a custom card instead of just letting the browser show its own:
 *   - Chrome's mini-infobar is gone since Chrome 76. Without a custom UI,
 *     mobile users get NO install affordance at all unless they dig into
 *     the kebab menu. The card recovers that affordance.
 *   - We can match StudyHub's design tokens (var(--sh-*)) and only show
 *     it on viewports where home-screen install is actually meaningful.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

const DISMISS_KEY = 'studyhub.pwaInstallDismissedAt'
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000
const PHONE_BREAKPOINT_PX = 640

const SUPPRESSED_ROUTES = new Set(['/login', '/register', '/onboarding', '/ai'])

/** Heuristic: phone-class viewport (matches CSS `(max-width: 640px)`). */
function isPhoneClass() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(`(max-width: ${PHONE_BREAKPOINT_PX}px)`).matches
}

/** Already-installed test. Most reliable cross-platform signal. */
function isStandalone() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS uses navigator.standalone instead of display-mode media query.
  if (typeof navigator !== 'undefined' && navigator.standalone === true) return true
  return false
}

/** iOS Safari detection (the only place we need the share-sheet fallback). */
function isIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isAppleDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ identifies as Mac; disambiguate via touch points.
    (ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document)
  if (!isAppleDevice) return false
  // Only Safari supports A2HS — Chrome / Firefox / Edge on iOS share the
  // WebKit engine but do not surface the share-sheet install option.
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

function isCapacitorNative() {
  if (typeof window === 'undefined') return false
  return window.__SH_NATIVE__ === true
}

function isRecentlyDismissed() {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number.parseInt(raw, 10)
    if (!Number.isInteger(ts)) return false
    return Date.now() - ts < DISMISS_TTL_MS
  } catch {
    return false
  }
}

function recordDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* private mode — best effort */
  }
}

export default function InstallPrompt() {
  const location = useLocation()
  const deferredPromptRef = useRef(null)
  const [variant, setVariant] = useState(null) // 'native' | 'ios' | null
  const [closing, setClosing] = useState(false)

  // Listen for `beforeinstallprompt`. Fires once per page session per origin
  // on Chrome/Edge/Samsung Internet. Stash the event so we can fire it later
  // from our card's "Install" button.
  useEffect(() => {
    if (isCapacitorNative()) return undefined
    if (isStandalone()) return undefined
    if (isRecentlyDismissed()) return undefined

    function handleBeforeInstall(event) {
      // Block Chrome from showing its own (deprecated) mini-infobar so
      // ours is the only install affordance the user sees.
      event.preventDefault()
      deferredPromptRef.current = event
      if (isPhoneClass()) setVariant('native')
    }

    function handleInstalled() {
      // User completed the install. Tear down the card and forget the
      // stashed prompt — Chrome won't refire it post-install anyway.
      deferredPromptRef.current = null
      setVariant(null)
      recordDismissal()
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    // iOS fallback — never gets beforeinstallprompt. Show a one-time
    // share-sheet hint after a short delay so it doesn't pop on first paint.
    let iosTimer = null
    if (isIos() && isPhoneClass()) {
      iosTimer = window.setTimeout(() => {
        if (!isStandalone() && !isRecentlyDismissed()) setVariant('ios')
      }, 4000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
      if (iosTimer) window.clearTimeout(iosTimer)
    }
  }, [])

  if (!variant) return null
  if (SUPPRESSED_ROUTES.has(location.pathname)) return null

  async function handleInstall() {
    const prompt = deferredPromptRef.current
    if (!prompt) {
      // No deferred prompt (e.g., we're on iOS) — there's nothing to fire.
      // Closing the card is the only outcome.
      setClosing(true)
      window.setTimeout(() => setVariant(null), 200)
      return
    }
    try {
      prompt.prompt()
      const choice = await prompt.userChoice
      if (choice && choice.outcome === 'dismissed') {
        recordDismissal()
      }
    } catch {
      /* user gesture lost or browser refused — silent */
    } finally {
      deferredPromptRef.current = null
      setClosing(true)
      window.setTimeout(() => setVariant(null), 200)
    }
  }

  function handleDismiss() {
    recordDismissal()
    setClosing(true)
    window.setTimeout(() => setVariant(null), 200)
  }

  const isIosVariant = variant === 'ios'

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="install-prompt-title"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 9000,
        maxWidth: 480,
        margin: '0 auto',
        background: 'var(--sh-surface)',
        color: 'var(--sh-text)',
        border: '1px solid var(--sh-border)',
        borderRadius: 14,
        padding: '12px 14px',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        opacity: closing ? 0 : 1,
        transform: closing ? 'translateY(8px)' : 'translateY(0)',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
      }}
    >
      <img
        src="/icon-256.png"
        alt=""
        width="40"
        height="40"
        style={{
          borderRadius: 10,
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.12)',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          id="install-prompt-title"
          style={{
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.25,
            marginBottom: 2,
          }}
        >
          Install StudyHub
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--sh-muted-text, var(--sh-slate-500))',
            lineHeight: 1.4,
          }}
        >
          {isIosVariant
            ? 'Tap the share icon, then "Add to Home Screen" for a faster, full-screen experience.'
            : 'Add to your home screen for faster access and a full-screen experience.'}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {!isIosVariant && (
            <button
              type="button"
              onClick={handleInstall}
              style={{
                background: 'var(--sh-brand, #2563eb)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Install
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              color: 'var(--sh-muted-text, var(--sh-slate-600))',
              border: '1px solid var(--sh-border)',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isIosVariant ? 'Got it' : 'Not now'}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--sh-muted-text, var(--sh-slate-500))',
          fontSize: 18,
          lineHeight: 1,
          padding: 4,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        x
      </button>
    </div>
  )
}
