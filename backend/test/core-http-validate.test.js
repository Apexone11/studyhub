/**
 * core-http-validate.test.js — unit tests for backend/src/core/http/validate.js
 *
 * Distinct from validate.test.js (which covers the Zod-based lib/validate.js).
 * Pins:
 *  - parseBoundedInt clamps to the cap (DoS guard, 2026-05-14 P1-C).
 *  - parseRouteId strictly rejects partial-numeric ids ("12abc") that
 *    Number.parseInt would silently accept (CLAUDE.md A12 / Codex P2).
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parsePositiveInt, parseBoundedInt, parseRouteId } = require('../src/core/http/validate')

describe('parseBoundedInt', () => {
  it('returns the fallback when value is missing/invalid (clamped to max)', () => {
    expect(parseBoundedInt(undefined, 20, 100)).toBe(20)
    expect(parseBoundedInt('abc', 20, 100)).toBe(20)
    expect(parseBoundedInt('-5', 20, 100)).toBe(20)
    expect(parseBoundedInt('0', 20, 100)).toBe(20)
  })

  it('returns the parsed value when within bounds', () => {
    expect(parseBoundedInt('50', 20, 100)).toBe(50)
    expect(parseBoundedInt('1', 20, 100)).toBe(1)
    expect(parseBoundedInt('100', 20, 100)).toBe(100)
  })

  it('clamps values above max DOWN to max (the DoS guard)', () => {
    expect(parseBoundedInt('500', 20, 100)).toBe(100)
    expect(parseBoundedInt('999999999', 20, 100)).toBe(100)
    expect(parseBoundedInt('51', 20, 50)).toBe(50)
  })

  it('clamps an over-large fallback down to max', () => {
    expect(parseBoundedInt(undefined, 500, 100)).toBe(100)
  })

  it('throws if max is not a positive integer (catches caller typos)', () => {
    expect(() => parseBoundedInt('10', 20, 0)).toThrow()
    expect(() => parseBoundedInt('10', 20, -1)).toThrow()
    expect(() => parseBoundedInt('10', 20, Infinity)).toThrow()
    expect(() => parseBoundedInt('10', 20, 1.5)).toThrow()
  })
})

describe('parseRouteId', () => {
  it('accepts pure positive-integer strings', () => {
    expect(parseRouteId('1')).toBe(1)
    expect(parseRouteId('42')).toBe(42)
    expect(parseRouteId('1000000')).toBe(1000000)
  })

  it('accepts a numeric input directly', () => {
    expect(parseRouteId(7)).toBe(7)
  })

  it('REJECTS partial-numeric ids that Number.parseInt would accept', () => {
    // Number.parseInt('12abc', 10) === 12, so a plain parse would wrongly accept it.
    expect(parseRouteId('12abc')).toBeNull()
    expect(parseRouteId('007abc')).toBeNull()
    expect(parseRouteId('1 ')).toBeNull()
    expect(parseRouteId(' 1')).toBeNull()
  })

  it('rejects hex / scientific / float / sign-prefixed forms', () => {
    expect(parseRouteId('0x10')).toBeNull()
    expect(parseRouteId('1e3')).toBeNull()
    expect(parseRouteId('12.5')).toBeNull()
    expect(parseRouteId('+1')).toBeNull()
    expect(parseRouteId('-1')).toBeNull()
  })

  it('rejects zero, empty, and non-string/number inputs', () => {
    expect(parseRouteId('0')).toBeNull()
    expect(parseRouteId('')).toBeNull()
    expect(parseRouteId(null)).toBeNull()
    expect(parseRouteId(undefined)).toBeNull()
    expect(parseRouteId({})).toBeNull()
    expect(parseRouteId([])).toBeNull()
  })

  it('rejects digit runs that exceed MAX_SAFE_INTEGER (precision loss)', () => {
    expect(parseRouteId('99999999999999999999')).toBeNull()
  })
})

describe('parsePositiveInt (legacy, still used by non-list callers)', () => {
  it('still parses positive ints with a fallback (unchanged behavior)', () => {
    expect(parsePositiveInt('5', 1)).toBe(5)
    expect(parsePositiveInt('abc', 1)).toBe(1)
    expect(parsePositiveInt('-3', 1)).toBe(1)
  })
})
