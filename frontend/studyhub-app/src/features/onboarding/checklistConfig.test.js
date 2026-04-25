/**
 * checklistConfig.test.js — Vitest coverage for the per-role Getting
 * Started checklist. Keeps the default-to-student fallback honest and
 * verifies testFn semantics for each role.
 */
import { describe, it, expect } from 'vitest'
import { checklistFor, completionCount, CHECKLIST_BY_ROLE } from './checklistConfig'

describe('checklistFor', () => {
  it('returns the student list for accountType student', () => {
    const list = checklistFor('student')
    expect(list).toBe(CHECKLIST_BY_ROLE.student)
    expect(list.length).toBe(5)
  })

  it('returns the teacher list for accountType teacher', () => {
    const list = checklistFor('teacher')
    expect(list).toBe(CHECKLIST_BY_ROLE.teacher)
    expect(list.length).toBe(5)
  })

  it('returns the self-learner list for accountType other', () => {
    const list = checklistFor('other')
    expect(list).toBe(CHECKLIST_BY_ROLE.other)
    expect(list.length).toBe(5)
  })

  it('falls back to the student list for unknown accountType', () => {
    expect(checklistFor('wizard')).toBe(CHECKLIST_BY_ROLE.student)
    expect(checklistFor(null)).toBe(CHECKLIST_BY_ROLE.student)
    expect(checklistFor(undefined)).toBe(CHECKLIST_BY_ROLE.student)
  })
})

describe('completionCount', () => {
  it('returns 0 for an empty state object', () => {
    expect(completionCount('student', {})).toBe(0)
    expect(completionCount('teacher', {})).toBe(0)
    expect(completionCount('other', {})).toBe(0)
  })

  it('returns the right count as items complete (student)', () => {
    const state = {
      hasSchool: true,
      hasMajor: true,
      courseFollowCount: 3,
      starCount: 1,
      examCount: 0,
      groupMembershipCount: 0,
    }
    // set_school_major + follow_3_courses + star_a_sheet
    expect(completionCount('student', state)).toBe(3)
  })

  it('returns full completion when every flag is set (teacher)', () => {
    const state = {
      teacherVerified: true,
      publishedMaterialCount: 2,
      sectionCount: 1,
      scheduledSessionCount: 1,
      problemQueuePostCount: 1,
    }
    expect(completionCount('teacher', state)).toBe(5)
  })

  it('tolerates null/undefined state', () => {
    expect(completionCount('student', null)).toBe(0)
    expect(completionCount('student', undefined)).toBe(0)
  })
})
