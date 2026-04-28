/**
 * courses.test.js — Vitest coverage for the helper functions in
 * courses.js. Pinned to common + edge inputs because the helpers feed
 * every flat course-dropdown surface in the SPA (Notes editor, sheets
 * upload, AI Sheet Setup, study-groups create/edit).
 *
 * Covers:
 *   - flattenSchoolsToCourses: dedup-by-id, code disambiguation when
 *     two schools share a course code, tolerates non-array input
 *   - enrolledSchoolIdsFromUser: shape parsing for /api/auth/me
 *     enrollments[], the schoolId vs school.id fallback, dedupe
 *   - partitionCoursesBySchool: primary/other split, alphabetical
 *     stable sort, empty enrollments, nulls
 */
import { describe, it, expect } from 'vitest'
import {
  flattenSchoolsToCourses,
  enrolledSchoolIdsFromUser,
  partitionCoursesBySchool,
} from './courses'

describe('flattenSchoolsToCourses', () => {
  it('returns [] when input is not an array', () => {
    expect(flattenSchoolsToCourses(null)).toEqual([])
    expect(flattenSchoolsToCourses(undefined)).toEqual([])
    expect(flattenSchoolsToCourses({})).toEqual([])
    expect(flattenSchoolsToCourses('CHEM101')).toEqual([])
  })

  it('flattens schools into a single course list with school context', () => {
    const out = flattenSchoolsToCourses([
      {
        id: 1,
        name: 'Goucher',
        short: 'GOU',
        courses: [{ id: 10, code: 'CHEM101', name: 'Chem' }],
      },
      { id: 2, name: 'UMBC', short: 'UMBC', courses: [{ id: 20, code: 'CMSC131', name: 'CS' }] },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: 10, code: 'CHEM101', schoolId: 1, schoolName: 'Goucher' })
    expect(out[1]).toMatchObject({ id: 20, code: 'CMSC131', schoolId: 2, schoolName: 'UMBC' })
  })

  it('dedupes by course id (same course under multiple school groupings)', () => {
    const out = flattenSchoolsToCourses([
      { id: 1, name: 'Goucher', courses: [{ id: 99, code: 'BIO110', name: 'Bio' }] },
      { id: 2, name: 'UMBC', courses: [{ id: 99, code: 'BIO110', name: 'Bio' }] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(99)
    // First-occurrence wins, so the school context comes from school 1
    expect(out[0].schoolName).toBe('Goucher')
  })

  it('disambiguates same-code-different-id by suffixing the school name', () => {
    const out = flattenSchoolsToCourses([
      { id: 1, name: 'Goucher', courses: [{ id: 10, code: 'CHEM101' }] },
      { id: 2, name: 'UMBC', courses: [{ id: 11, code: 'CHEM101' }] },
    ])
    expect(out).toHaveLength(2)
    const codes = out.map((c) => c.code).sort()
    expect(codes).toEqual(['CHEM101 (Goucher)', 'CHEM101 (UMBC)'])
  })

  it('does NOT suffix when only one course has a given code', () => {
    const out = flattenSchoolsToCourses([
      { id: 1, name: 'Goucher', courses: [{ id: 10, code: 'CHEM101' }] },
    ])
    expect(out[0].code).toBe('CHEM101')
  })

  it('skips courses with null/undefined ids (would otherwise collide in the dedup map)', () => {
    const out = flattenSchoolsToCourses([
      {
        id: 1,
        name: 'Goucher',
        courses: [
          { id: null, code: 'IGNORED' },
          { id: 10, code: 'KEPT' },
        ],
      },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].code).toBe('KEPT')
  })
})

describe('enrolledSchoolIdsFromUser', () => {
  it('returns [] when user is missing or has no enrollments array', () => {
    expect(enrolledSchoolIdsFromUser(null)).toEqual([])
    expect(enrolledSchoolIdsFromUser(undefined)).toEqual([])
    expect(enrolledSchoolIdsFromUser({})).toEqual([])
    expect(enrolledSchoolIdsFromUser({ enrollments: 'not-an-array' })).toEqual([])
  })

  it('reads course.school.id when present', () => {
    const ids = enrolledSchoolIdsFromUser({
      enrollments: [{ course: { school: { id: 1 } } }, { course: { school: { id: 2 } } }],
    })
    expect(ids.sort()).toEqual(['1', '2'])
  })

  it('falls back to course.schoolId when school relation is absent', () => {
    const ids = enrolledSchoolIdsFromUser({
      enrollments: [{ course: { schoolId: 5 } }, { course: { school: { id: 7 } } }],
    })
    expect(ids.sort()).toEqual(['5', '7'])
  })

  it('dedupes when the user is enrolled in multiple courses at the same school', () => {
    const ids = enrolledSchoolIdsFromUser({
      enrollments: [
        { course: { school: { id: 3 } } },
        { course: { school: { id: 3 } } },
        { course: { school: { id: 3 } } },
      ],
    })
    expect(ids).toEqual(['3'])
  })

  it('coerces ids to strings for direct use in partitionCoursesBySchool', () => {
    const ids = enrolledSchoolIdsFromUser({
      enrollments: [{ course: { school: { id: 42 } } }],
    })
    expect(ids[0]).toBe('42')
    expect(typeof ids[0]).toBe('string')
  })

  it('skips enrollments missing both school relation and schoolId', () => {
    const ids = enrolledSchoolIdsFromUser({
      enrollments: [
        { course: {} },
        { course: { school: null } },
        { course: { school: { id: 9 } } },
      ],
    })
    expect(ids).toEqual(['9'])
  })
})

describe('partitionCoursesBySchool', () => {
  const courses = [
    { id: 1, code: 'CHEM101', schoolId: 10 },
    { id: 2, code: 'BIO110', schoolId: 20 },
    { id: 3, code: 'AAAA001', schoolId: 10 },
    { id: 4, code: 'ZZZZZ', schoolId: 20 },
  ]

  it('splits courses into primary (enrolled) vs other', () => {
    const { primary, other } = partitionCoursesBySchool(courses, ['10'])
    expect(primary.map((c) => c.id).sort()).toEqual([1, 3])
    expect(other.map((c) => c.id).sort()).toEqual([2, 4])
  })

  it('accepts numeric enrolledSchoolIds (string-coerces)', () => {
    const { primary } = partitionCoursesBySchool(courses, [10])
    expect(primary.map((c) => c.id).sort()).toEqual([1, 3])
  })

  it("puts everything in 'other' when enrolledSchoolIds is empty", () => {
    const { primary, other } = partitionCoursesBySchool(courses, [])
    expect(primary).toEqual([])
    expect(other).toHaveLength(4)
  })

  it('treats null/undefined enrolledSchoolIds the same as empty', () => {
    expect(partitionCoursesBySchool(courses, null).primary).toEqual([])
    expect(partitionCoursesBySchool(courses, undefined).primary).toEqual([])
  })

  it('treats null/undefined courses the same as empty', () => {
    expect(partitionCoursesBySchool(null, ['10'])).toEqual({ primary: [], other: [] })
    expect(partitionCoursesBySchool(undefined, ['10'])).toEqual({ primary: [], other: [] })
  })

  it('sorts each bucket by code, case-insensitive locale-aware', () => {
    const { primary, other } = partitionCoursesBySchool(
      [
        { id: 1, code: 'cmsc101', schoolId: 10 },
        { id: 2, code: 'AAAA999', schoolId: 10 },
        { id: 3, code: 'BBB123', schoolId: 20 },
        { id: 4, code: 'aaa100', schoolId: 20 },
      ],
      ['10'],
    )
    expect(primary.map((c) => c.code)).toEqual(['AAAA999', 'cmsc101'])
    expect(other.map((c) => c.code)).toEqual(['aaa100', 'BBB123'])
  })

  it('skips null/undefined entries in the courses array', () => {
    const { primary, other } = partitionCoursesBySchool(
      [null, undefined, { id: 1, code: 'CHEM101', schoolId: 10 }],
      ['10'],
    )
    expect(primary).toHaveLength(1)
    expect(other).toEqual([])
  })

  it('puts a course with no schoolId into "other" regardless of enrollments', () => {
    const { primary, other } = partitionCoursesBySchool(
      [{ id: 1, code: 'X', schoolId: null }],
      ['10'],
    )
    expect(primary).toEqual([])
    expect(other).toHaveLength(1)
  })
})
