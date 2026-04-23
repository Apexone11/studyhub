/**
 * deriveDeviceKind — unit tests
 *
 * Classifies a user-agent into: "laptop" | "mobile" | "tablet" | "watch" | "unknown".
 * The heuristic lives in session.service.js and is consumed by the sessions
 * endpoint + session row rendering in SessionsTab.jsx.
 */
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { deriveDeviceKind, parseDeviceLabel } = require('../src/modules/auth/session.service')

describe('deriveDeviceKind', () => {
  it('returns "tablet" for iPad user-agent', () => {
    expect(
      deriveDeviceKind(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
      ),
    ).toBe('tablet')
  })

  it('returns "tablet" for Android without the Mobile token', () => {
    expect(
      deriveDeviceKind(
        'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('tablet')
  })

  it('returns "mobile" for iPhone', () => {
    expect(
      deriveDeviceKind(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
      ),
    ).toBe('mobile')
  })

  it('returns "mobile" for Android Mobile', () => {
    expect(
      deriveDeviceKind(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      ),
    ).toBe('mobile')
  })

  it('returns "watch" for Apple Watch UA', () => {
    expect(deriveDeviceKind('Mozilla/5.0 (Apple Watch; Watch OS 10_0)')).toBe('watch')
  })

  it('returns "laptop" for Windows desktop', () => {
    expect(
      deriveDeviceKind(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('laptop')
  })

  it('returns "laptop" for macOS', () => {
    expect(
      deriveDeviceKind(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      ),
    ).toBe('laptop')
  })

  it('returns "laptop" for Linux', () => {
    expect(
      deriveDeviceKind(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('laptop')
  })

  it('returns "laptop" for ChromeOS', () => {
    expect(
      deriveDeviceKind(
        'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('laptop')
  })

  it('returns "unknown" for empty UA', () => {
    expect(deriveDeviceKind('')).toBe('unknown')
  })

  it('returns "unknown" for null UA', () => {
    expect(deriveDeviceKind(null)).toBe('unknown')
  })
})

describe('parseDeviceLabel (regression sanity check)', () => {
  it('produces "Chrome on Windows" for Chrome/Windows UA', () => {
    expect(
      parseDeviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome on Windows')
  })

  it('returns "Unknown device" for empty UA', () => {
    expect(parseDeviceLabel('')).toBe('Unknown device')
  })
})
