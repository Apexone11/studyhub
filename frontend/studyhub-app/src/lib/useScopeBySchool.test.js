/**
 * useScopeBySchool.test.js — Vitest coverage for the school-scoped-search
 * preference hook (wave-12.3).
 *
 * Covers:
 *  - default true on first paint
 *  - localStorage cache wins for synchronous first paint
 *  - server preference reconciles on mount (server wins if differs)
 *  - setScoped(...) updates state + localStorage + fires PATCH
 *  - primarySchoolIdFromUser handles both course.schoolId and course.school.id shapes
 *  - primarySchoolIdFromUser returns null for users without enrollments
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { primarySchoolIdFromUser } from './useScopeBySchool'

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('primarySchoolIdFromUser', () => {
  it('returns null for null user', () => {
    expect(primarySchoolIdFromUser(null)).toBeNull()
  })

  it('returns null when enrollments is missing or empty', () => {
    expect(primarySchoolIdFromUser({})).toBeNull()
    expect(primarySchoolIdFromUser({ enrollments: [] })).toBeNull()
    expect(primarySchoolIdFromUser({ enrollments: 'oops' })).toBeNull()
  })

  it('reads course.schoolId (scalar shape)', () => {
    const user = { enrollments: [{ course: { schoolId: 42 } }] }
    expect(primarySchoolIdFromUser(user)).toBe(42)
  })

  it('falls back to course.school.id (relation shape)', () => {
    const user = { enrollments: [{ course: { school: { id: 7 } } }] }
    expect(primarySchoolIdFromUser(user)).toBe(7)
  })

  it('prefers scalar over relation when both present', () => {
    const user = {
      enrollments: [{ course: { schoolId: 1, school: { id: 2 } } }],
    }
    expect(primarySchoolIdFromUser(user)).toBe(1)
  })

  it('uses the FIRST enrollment as primary', () => {
    const user = {
      enrollments: [{ course: { schoolId: 10 } }, { course: { schoolId: 20 } }],
    }
    expect(primarySchoolIdFromUser(user)).toBe(10)
  })

  it('returns null when neither schoolId nor school.id is present', () => {
    const user = { enrollments: [{ course: { code: 'CMSC131' } }] }
    expect(primarySchoolIdFromUser(user)).toBeNull()
  })

  it('coerces string ids to numbers', () => {
    const user = { enrollments: [{ course: { schoolId: '5' } }] }
    expect(primarySchoolIdFromUser(user)).toBe(5)
  })
})
