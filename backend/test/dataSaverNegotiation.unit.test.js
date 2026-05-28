/**
 * dataSaverNegotiation.unit.test.js — server-side data-saver detection.
 *
 * Pins the three-signal contract:
 *   1. Explicit user pref `off` wins — even with Save-Data header.
 *   2. Explicit user pref `on` wins — no header needed.
 *   3. `auto` (or unloaded pref) honors the Save-Data header.
 *   4. ?lite=1 query param triggers via shouldReturnLite() (covers
 *      Safari, which doesn't send Save-Data).
 *
 * Wave-12.11.
 */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  isDataSaverRequest,
  isLiteQueryRequest,
  shouldReturnLite,
} = require('../src/lib/dataSaverNegotiation')

function makeReq({ user, header, query } = {}) {
  return {
    user: user || null,
    headers: header ? { 'save-data': header } : {},
    query: query || {},
  }
}

describe('isDataSaverRequest', () => {
  it('returns true when user pref is explicitly "on"', () => {
    expect(isDataSaverRequest(makeReq({ user: { dataSaverMode: 'on' } }))).toBe(true)
  })

  it('returns false when user pref is "off" even if header says on', () => {
    expect(isDataSaverRequest(makeReq({ user: { dataSaverMode: 'off' }, header: 'on' }))).toBe(
      false,
    )
  })

  it('returns true when user pref is "auto" AND Save-Data header is on', () => {
    expect(isDataSaverRequest(makeReq({ user: { dataSaverMode: 'auto' }, header: 'on' }))).toBe(
      true,
    )
  })

  it('returns false when user pref is "auto" and no header', () => {
    expect(isDataSaverRequest(makeReq({ user: { dataSaverMode: 'auto' } }))).toBe(false)
  })

  it('returns false on anonymous request with no header', () => {
    expect(isDataSaverRequest(makeReq())).toBe(false)
  })

  it('returns true on anonymous request with Save-Data: on (header-only fallback)', () => {
    expect(isDataSaverRequest(makeReq({ header: 'on' }))).toBe(true)
  })

  it('header is case-insensitive (browsers send both On and on)', () => {
    expect(isDataSaverRequest(makeReq({ header: 'ON' }))).toBe(true)
    expect(isDataSaverRequest(makeReq({ header: ' On ' }))).toBe(true)
  })

  it('handles malformed input safely (no req)', () => {
    expect(isDataSaverRequest(undefined)).toBe(false)
    expect(isDataSaverRequest(null)).toBe(false)
    expect(isDataSaverRequest({})).toBe(false)
  })
})

describe('isLiteQueryRequest', () => {
  it('recognises ?lite=1', () => {
    expect(isLiteQueryRequest(makeReq({ query: { lite: '1' } }))).toBe(true)
  })

  it('recognises ?lite=true', () => {
    expect(isLiteQueryRequest(makeReq({ query: { lite: 'true' } }))).toBe(true)
  })

  it('returns false for any other lite value', () => {
    expect(isLiteQueryRequest(makeReq({ query: { lite: '0' } }))).toBe(false)
    expect(isLiteQueryRequest(makeReq({ query: { lite: 'false' } }))).toBe(false)
    expect(isLiteQueryRequest(makeReq({ query: {} }))).toBe(false)
  })
})

describe('shouldReturnLite — OR of all three signals', () => {
  it('returns true for any single signal firing', () => {
    expect(shouldReturnLite(makeReq({ user: { dataSaverMode: 'on' } }))).toBe(true)
    expect(shouldReturnLite(makeReq({ header: 'on' }))).toBe(true)
    expect(shouldReturnLite(makeReq({ query: { lite: '1' } }))).toBe(true)
  })

  it('returns false when no signal fires', () => {
    expect(shouldReturnLite(makeReq())).toBe(false)
    expect(shouldReturnLite(makeReq({ user: { dataSaverMode: 'off' } }))).toBe(false)
  })
})
