import { describe, it, expect } from 'vitest'
import {
  computeContentHash,
  isRevisionConflict,
  shouldCreateAutoVersion,
} from '../src/modules/notes/notes.concurrency.js'

describe('notes.concurrency', () => {
  it('computeContentHash produces stable sha256 for same input', () => {
    const a = computeContentHash('hello world')
    const b = computeContentHash('hello world')
    expect(a).toBe(b)
    expect(a).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('computeContentHash differs for different input', () => {
    expect(computeContentHash('a')).not.toBe(computeContentHash('b'))
  })

  it('computeContentHash handles null and undefined as empty', () => {
    const empty = computeContentHash('')
    expect(computeContentHash(null)).toBe(empty)
    expect(computeContentHash(undefined)).toBe(empty)
  })

  it('isRevisionConflict returns true when baseRevision < current', () => {
    expect(isRevisionConflict(10, 12)).toBe(true)
    expect(isRevisionConflict(12, 12)).toBe(false)
    expect(isRevisionConflict(13, 12)).toBe(false)
  })

  it('isRevisionConflict coerces strings to numbers', () => {
    expect(isRevisionConflict('5', 7)).toBe(true)
    expect(isRevisionConflict('7', '7')).toBe(false)
  })

  it('shouldCreateAutoVersion true if last AUTO version older than 5 min', () => {
    const now = new Date('2026-04-15T12:00:00Z')
    const sixMinAgo = new Date(now.getTime() - 6 * 60 * 1000)
    expect(shouldCreateAutoVersion({ lastAutoVersionAt: sixMinAgo, now })).toBe(true)
  })

  it('shouldCreateAutoVersion false if last AUTO less than 5 min', () => {
    const now = new Date('2026-04-15T12:00:00Z')
    const fourMinAgo = new Date(now.getTime() - 4 * 60 * 1000)
    expect(shouldCreateAutoVersion({ lastAutoVersionAt: fourMinAgo, now })).toBe(false)
  })

  it('shouldCreateAutoVersion true when no prior AUTO version', () => {
    expect(shouldCreateAutoVersion({ lastAutoVersionAt: null, now: new Date() })).toBe(true)
    expect(shouldCreateAutoVersion({ lastAutoVersionAt: undefined, now: new Date() })).toBe(true)
  })

  it('shouldCreateAutoVersion accepts ISO string for lastAutoVersionAt', () => {
    const now = new Date('2026-04-15T12:00:00Z')
    expect(shouldCreateAutoVersion({ lastAutoVersionAt: '2026-04-15T11:50:00Z', now })).toBe(true)
    expect(shouldCreateAutoVersion({ lastAutoVersionAt: '2026-04-15T11:58:00Z', now })).toBe(false)
  })
})
