/**
 * CookieConsentBanner.test.jsx — coverage for the self-hosted consent
 * banner that replaced the Termly resource-blocker (Task #70).
 *
 * Pinned cases (per the handoff doc §"Component tests"):
 *   1. First visit (no consent stored) → banner renders.
 *   2. Repeat visit with choice='all' stored → banner does NOT render.
 *   3. Repeat visit with choice='essential' stored → banner does NOT render.
 *   4. Click "Accept all" → localStorage set + studyhub:consent-changed
 *      dispatched + banner hides.
 *   5. Click "Essential only" → localStorage set + banner hides (the
 *      essential branch should NOT trigger Clarity/Ads, but that gate
 *      lives in index.html — covered separately by the helper test).
 *   6. "Cookie settings" link routes to /cookies.
 *   7. Native shell (window.__SH_NATIVE__ === true) → banner does NOT
 *      render (mobile WebView never gets web analytics anyway).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CookieConsentBanner from './CookieConsentBanner'
import { COOKIE_CONSENT_STORAGE_KEY } from '../lib/cookieConsent'

function renderBanner() {
  return render(
    <MemoryRouter>
      <CookieConsentBanner />
    </MemoryRouter>,
  )
}

describe('CookieConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear()
    delete window.__SH_NATIVE__
  })

  afterEach(() => {
    delete window.__SH_NATIVE__
  })

  it('renders on first visit (no consent in localStorage)', () => {
    renderBanner()
    expect(screen.getByTestId('cookie-consent-banner')).toBeTruthy()
    expect(screen.getByTestId('cookie-consent-accept')).toBeTruthy()
    expect(screen.getByTestId('cookie-consent-essential')).toBeTruthy()
  })

  it("does NOT render when choice='all' is already stored", () => {
    localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({ choice: 'all', timestamp: '2026-04-28T00:00:00.000Z' }),
    )
    renderBanner()
    expect(screen.queryByTestId('cookie-consent-banner')).toBeNull()
  })

  it("does NOT render when choice='essential' is already stored", () => {
    localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({ choice: 'essential', timestamp: '2026-04-28T00:00:00.000Z' }),
    )
    renderBanner()
    expect(screen.queryByTestId('cookie-consent-banner')).toBeNull()
  })

  it('Accept all → persists choice + dispatches consent-changed + hides banner', () => {
    const handler = vi.fn()
    window.addEventListener('studyhub:consent-changed', handler)
    try {
      renderBanner()
      fireEvent.click(screen.getByTestId('cookie-consent-accept'))

      const stored = JSON.parse(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY))
      expect(stored.choice).toBe('all')

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].detail.choice).toBe('all')

      expect(screen.queryByTestId('cookie-consent-banner')).toBeNull()
    } finally {
      window.removeEventListener('studyhub:consent-changed', handler)
    }
  })

  it('Essential only → persists choice + hides banner', () => {
    renderBanner()
    fireEvent.click(screen.getByTestId('cookie-consent-essential'))

    const stored = JSON.parse(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY))
    expect(stored.choice).toBe('essential')

    expect(screen.queryByTestId('cookie-consent-banner')).toBeNull()
  })

  it('Cookie settings is a link to /cookies', () => {
    renderBanner()
    // Two settings entry points exist in the markup (the inline link in
    // the body copy + the standalone link in the actions row). Both go
    // to /cookies — assert at least one matches.
    const links = screen.getAllByRole('link', { name: /cookie settings/i })
    expect(links.length).toBeGreaterThanOrEqual(1)
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('/cookies')
    }
  })

  it('does NOT render in the Capacitor native shell', () => {
    window.__SH_NATIVE__ = true
    renderBanner()
    expect(screen.queryByTestId('cookie-consent-banner')).toBeNull()
  })
})
