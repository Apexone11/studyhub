/**
 * geo.haversine.test.js — Vitest coverage for the great-circle helper
 * added 2026-05-16 (wave-12.2). Used by the schools-nearby sort + the
 * feed algorithm v2 "nearby-school" signal.
 */
import { describe, it, expect } from 'vitest'

const { distanceKm } = require('../src/lib/geo/haversine')

describe('distanceKm — haversine great-circle distance', () => {
  it('returns ~0 for two identical points', () => {
    expect(distanceKm(38.9072, -77.0369, 38.9072, -77.0369)).toBeCloseTo(0, 3)
  })

  it('Baltimore <-> Washington DC is ~56 km', () => {
    // Baltimore (39.2904, -76.6122) -> DC (38.9072, -77.0369)
    const d = distanceKm(39.2904, -76.6122, 38.9072, -77.0369)
    expect(d).toBeGreaterThan(50)
    expect(d).toBeLessThan(65)
  })

  it('UMD College Park <-> UMBC Catonsville is ~37 km', () => {
    // UMD (38.9869, -76.9426) -> UMBC (39.2557, -76.7115)
    const d = distanceKm(38.9869, -76.9426, 39.2557, -76.7115)
    expect(d).toBeGreaterThan(30)
    expect(d).toBeLessThan(45)
  })

  it('UVA Charlottesville <-> Virginia Tech Blacksburg is ~190 km', () => {
    // UVA (38.0356, -78.5034) -> VT (37.2284, -80.4234)
    const d = distanceKm(38.0356, -78.5034, 37.2284, -80.4234)
    expect(d).toBeGreaterThan(170)
    expect(d).toBeLessThan(210)
  })

  it('is symmetric (a→b === b→a)', () => {
    const a = distanceKm(38.9072, -77.0369, 38.0356, -78.5034)
    const b = distanceKm(38.0356, -78.5034, 38.9072, -77.0369)
    expect(a).toBeCloseTo(b, 6)
  })

  it('returns null when any coordinate is null', () => {
    expect(distanceKm(null, -77, 38, -77)).toBeNull()
    expect(distanceKm(38, null, 38, -77)).toBeNull()
    expect(distanceKm(38, -77, null, -77)).toBeNull()
    expect(distanceKm(38, -77, 38, null)).toBeNull()
  })

  it('returns null when any coordinate is non-finite', () => {
    expect(distanceKm(NaN, -77, 38, -77)).toBeNull()
    expect(distanceKm(38, Infinity, 38, -77)).toBeNull()
    expect(distanceKm(38, -77, 38, 'oops')).toBeNull()
  })

  it('handles antipodal points (~20,000 km) without blowing up', () => {
    // Roughly antipodal: (0, 0) <-> (0, 180)
    const d = distanceKm(0, 0, 0, 180)
    expect(d).toBeGreaterThan(19000)
    expect(d).toBeLessThan(21000)
  })
})
