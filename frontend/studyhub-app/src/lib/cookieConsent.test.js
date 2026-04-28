/**
 * cookieConsent.test.js — coverage for the cookie consent helper that
 * Task #70's banner + the index.html analytics gate both depend on.
 *
 * Pinned cases:
 *   1. readConsent() returns null when nothing is stored.
 *   2. readConsent() returns the parsed object on a valid record.
 *   3. readConsent() returns null on malformed JSON (graceful — banner
 *      should re-prompt rather than crash on a corrupted key).
 *   4. writeConsent('all') persists the value AND dispatches
 *      `studyhub:consent-changed` so the index.html loader can fire
 *      analytics in-session.
 *   5. hasAnalyticsConsent() returns true ONLY when choice === 'all'.
 *
 * Bonus: validates writeConsent rejects unknown choice strings (the
 * function returns null without persisting, so a future dropdown
 * adding 'analytics-only' can't slip through and silently get treated
 * as essential by readers that haven't been updated yet).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readConsent,
  writeConsent,
  hasAnalyticsConsent,
  COOKIE_CONSENT_STORAGE_KEY,
} from './cookieConsent'

describe('cookieConsent helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('readConsent returns null when storage is empty', () => {
    expect(readConsent()).toBeNull()
  })

  it('readConsent returns the parsed object on a valid record', () => {
    const value = { choice: 'all', timestamp: '2026-04-28T12:00:00.000Z' }
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(value))
    expect(readConsent()).toEqual(value)
  })

  it('readConsent returns null on malformed JSON without throwing', () => {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, '{not-valid-json')
    expect(readConsent()).toBeNull()
  })

  it("writeConsent('all') persists the value AND dispatches studyhub:consent-changed", () => {
    const handler = vi.fn()
    window.addEventListener('studyhub:consent-changed', handler)
    try {
      const stored = writeConsent('all')
      expect(stored).toMatchObject({ choice: 'all' })
      expect(stored.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)

      const persisted = JSON.parse(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY))
      expect(persisted).toEqual(stored)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].detail).toEqual(stored)
    } finally {
      window.removeEventListener('studyhub:consent-changed', handler)
    }
  })

  it('hasAnalyticsConsent returns true only for choice "all"', () => {
    expect(hasAnalyticsConsent()).toBe(false)
    writeConsent('essential')
    expect(hasAnalyticsConsent()).toBe(false)
    writeConsent('all')
    expect(hasAnalyticsConsent()).toBe(true)
  })

  // Bonus — defensive: reject unknown choices so a future bug can't
  // silently treat 'analytics-only' as if it were 'all' (or vice versa)
  // for readers that haven't been updated.
  it('writeConsent ignores unknown choice strings (returns null, no event)', () => {
    const handler = vi.fn()
    window.addEventListener('studyhub:consent-changed', handler)
    try {
      const result = writeConsent('analytics-only')
      expect(result).toBeNull()
      expect(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBeNull()
      expect(handler).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('studyhub:consent-changed', handler)
    }
  })
})
