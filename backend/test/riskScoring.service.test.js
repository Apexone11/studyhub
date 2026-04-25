/**
 * riskScoring.service — unit tests.
 *
 * Pure function scoreLogin() classifies a login attempt into
 * { score, band, signals } where band ∈ {"normal","notify","challenge"}.
 * Weights live in the module so they're tunable in one place.
 */
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { scoreLogin, WEIGHTS } = require('../src/modules/auth/riskScoring.service')

function ctx(overrides = {}) {
  return {
    deviceKnown: true,
    geo: null,
    recentSessions: [],
    uaFamilyChanged: false,
    anonymousIp: false,
    failedAttempts15m: 0,
    ...overrides,
  }
}

describe('scoreLogin — individual signals', () => {
  it('baseline known device returns 0 / normal', () => {
    const r = scoreLogin(ctx())
    expect(r.score).toBe(0)
    expect(r.band).toBe('normal')
    expect(r.signals).toEqual([])
  })

  it('unknown device adds +30 and lands in notify band', () => {
    const r = scoreLogin(ctx({ deviceKnown: false }))
    expect(r.score).toBe(WEIGHTS.UNKNOWN_DEVICE)
    expect(r.band).toBe('notify')
    expect(r.signals).toContain('unknown_device')
  })

  it('new country adds +40', () => {
    const r = scoreLogin(
      ctx({
        geo: { country: 'NG', region: 'LA', lat: 6.5, lon: 3.4 },
        recentSessions: [{ country: 'US', region: 'MD', createdAt: new Date() }],
      }),
    )
    expect(r.score).toBe(WEIGHTS.NEW_COUNTRY + WEIGHTS.NEW_REGION) // both trigger
    expect(r.signals).toContain('new_country')
    expect(r.signals).toContain('new_region')
  })

  it('new region alone (same country) adds +15', () => {
    const r = scoreLogin(
      ctx({
        geo: { country: 'US', region: 'CA', lat: 34.0, lon: -118.2 },
        recentSessions: [{ country: 'US', region: 'MD', createdAt: new Date() }],
      }),
    )
    expect(r.score).toBe(WEIGHTS.NEW_REGION)
    expect(r.signals).toContain('new_region')
    expect(r.signals).not.toContain('new_country')
  })

  it('anonymous IP adds +25', () => {
    const r = scoreLogin(ctx({ anonymousIp: true }))
    expect(r.score).toBe(WEIGHTS.ANON_IP)
    expect(r.signals).toContain('anonymous_ip')
  })

  it('UA family change adds +10', () => {
    const r = scoreLogin(ctx({ uaFamilyChanged: true }))
    expect(r.score).toBe(WEIGHTS.UA_FAMILY_CHANGE)
    expect(r.signals).toContain('ua_change')
  })

  it('3 failed attempts adds +20', () => {
    const r = scoreLogin(ctx({ failedAttempts15m: 3 }))
    expect(r.score).toBe(WEIGHTS.FAILED_ATTEMPTS)
    expect(r.signals).toContain('failed_attempts')
  })

  it('2 failed attempts does not add any weight', () => {
    const r = scoreLogin(ctx({ failedAttempts15m: 2 }))
    expect(r.score).toBe(0)
    expect(r.signals).not.toContain('failed_attempts')
  })
})

describe('scoreLogin — impossible travel', () => {
  it('Baltimore → Tokyo in 1 hour fires impossible_travel', () => {
    const r = scoreLogin(
      ctx({
        geo: { country: 'JP', region: 'TOK', lat: 35.68, lon: 139.76 },
        recentSessions: [
          {
            country: 'US',
            region: 'MD',
            lat: 39.29,
            lon: -76.61,
            createdAt: new Date(Date.now() - 60 * 60 * 1000),
          },
        ],
      }),
    )
    expect(r.signals).toContain('impossible_travel')
    expect(r.score).toBeGreaterThanOrEqual(WEIGHTS.IMPOSSIBLE_TRAVEL)
    expect(r.band).toBe('challenge')
  })

  it('Baltimore → Washington DC in 1 hour does NOT fire impossible_travel', () => {
    const r = scoreLogin(
      ctx({
        geo: { country: 'US', region: 'DC', lat: 38.9, lon: -77.04 },
        recentSessions: [
          {
            country: 'US',
            region: 'MD',
            lat: 39.29,
            lon: -76.61,
            createdAt: new Date(Date.now() - 60 * 60 * 1000),
          },
        ],
      }),
    )
    expect(r.signals).not.toContain('impossible_travel')
  })

  it('missing lat/lon on prior session is tolerated (no crash)', () => {
    const r = scoreLogin(
      ctx({
        geo: { country: 'US', region: 'MD', lat: 39.29, lon: -76.61 },
        recentSessions: [{ country: 'US', region: 'MD', createdAt: new Date() }],
      }),
    )
    expect(r.signals).not.toContain('impossible_travel')
  })
})

describe('scoreLogin — bands', () => {
  it('score ≥ 60 → challenge band', () => {
    const r = scoreLogin(
      ctx({
        deviceKnown: false,
        geo: { country: 'NG' },
        recentSessions: [{ country: 'US', region: 'MD' }],
      }),
    )
    expect(r.score).toBeGreaterThanOrEqual(60)
    expect(r.band).toBe('challenge')
  })

  it('30 ≤ score < 60 → notify band', () => {
    const r = scoreLogin(ctx({ deviceKnown: false }))
    expect(r.score).toBe(30)
    expect(r.band).toBe('notify')
  })

  it('score < 30 → normal band', () => {
    const r = scoreLogin(ctx({ uaFamilyChanged: true }))
    expect(r.score).toBeLessThan(30)
    expect(r.band).toBe('normal')
  })
})

describe('scoreLogin — first-time login (no history)', () => {
  it('does not fire new_country when user has no prior sessions', () => {
    const r = scoreLogin(
      ctx({
        deviceKnown: false,
        geo: { country: 'US', region: 'MD' },
        recentSessions: [],
      }),
    )
    // Only the unknown-device signal should fire. First-ever login shouldn't
    // be penalized for having "a new country" since there's nothing to compare.
    expect(r.signals).not.toContain('new_country')
    expect(r.signals).not.toContain('new_region')
    expect(r.score).toBe(WEIGHTS.UNKNOWN_DEVICE)
  })
})
