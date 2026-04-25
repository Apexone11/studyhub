import { describe, it, expect } from 'vitest'
import { roleCopy, isSelfLearner } from './roleCopy'

describe('roleCopy', () => {
  it('returns community-flavored copy for Self-learners', () => {
    expect(roleCopy('composerTitle', 'other')).toBe('Share with the community')
    expect(roleCopy('emptyStateBody', 'other')).toMatch(/topics or creators/i)
    expect(roleCopy('browseSheetsHelper', 'other')).not.toMatch(/classmate/i)
  })

  it('keeps classmate copy for students', () => {
    expect(roleCopy('composerTitle', 'student')).toMatch(/classmates/i)
    expect(roleCopy('emptyStateBody', 'student')).toMatch(/classmates/i)
  })

  it('falls back to student copy for unknown accountType', () => {
    expect(roleCopy('composerTitle', 'unknown')).toBe(roleCopy('composerTitle', 'student'))
    expect(roleCopy('composerTitle', undefined)).toBe(roleCopy('composerTitle', 'student'))
  })

  it('returns empty string for unknown key', () => {
    expect(roleCopy('nonexistent', 'student')).toBe('')
  })

  it('isSelfLearner only matches "other"', () => {
    expect(isSelfLearner('other')).toBe(true)
    expect(isSelfLearner('student')).toBe(false)
    expect(isSelfLearner('teacher')).toBe(false)
    expect(isSelfLearner(undefined)).toBe(false)
  })

  // Phase 1 of the v2 design refresh — new dashboard + Top Contributors copy.
  describe('dashboardWelcomeContext', () => {
    it('students get course/notes/tests context', () => {
      expect(roleCopy('dashboardWelcomeContext', 'student')).toMatch(/courses/i)
      expect(roleCopy('dashboardWelcomeContext', 'student')).toMatch(/notes/i)
      expect(roleCopy('dashboardWelcomeContext', 'student')).toMatch(/practice tests/i)
    })

    it('teachers get course/announcements/materials context', () => {
      expect(roleCopy('dashboardWelcomeContext', 'teacher')).toMatch(/courses/i)
      expect(roleCopy('dashboardWelcomeContext', 'teacher')).toMatch(/announcements/i)
      expect(roleCopy('dashboardWelcomeContext', 'teacher')).toMatch(/materials/i)
    })

    it('Self-learners get interests/notes/learning-goals context, never classmates', () => {
      const copy = roleCopy('dashboardWelcomeContext', 'other')
      expect(copy).toMatch(/interests/i)
      expect(copy).toMatch(/learning goals/i)
      expect(copy).not.toMatch(/classmate/i)
      expect(copy).not.toMatch(/student/i)
    })
  })

  describe('dashboardHeroEyebrow', () => {
    it('students see SESSION READY', () => {
      expect(roleCopy('dashboardHeroEyebrow', 'student')).toBe('SESSION READY')
    })

    it('teachers see TEACHING READY', () => {
      expect(roleCopy('dashboardHeroEyebrow', 'teacher')).toBe('TEACHING READY')
    })

    it('Self-learners see LEARNING READY', () => {
      expect(roleCopy('dashboardHeroEyebrow', 'other')).toBe('LEARNING READY')
    })

    it('all eyebrows are short all-caps strings', () => {
      for (const acct of ['student', 'teacher', 'other']) {
        const copy = roleCopy('dashboardHeroEyebrow', acct)
        expect(copy).toBe(copy.toUpperCase())
        expect(copy.length).toBeLessThanOrEqual(20)
      }
    })
  })

  describe('topContributorsHeading', () => {
    it('students see a course-centric heading', () => {
      expect(roleCopy('topContributorsHeading', 'student')).toMatch(/courses/i)
    })

    it('teachers see a course-centric heading', () => {
      expect(roleCopy('topContributorsHeading', 'teacher')).toMatch(/courses/i)
    })

    it('Self-learners see a follow-centric heading (no courses/classmates)', () => {
      const copy = roleCopy('topContributorsHeading', 'other')
      expect(copy).toMatch(/follow/i)
      expect(copy).not.toMatch(/classmate/i)
      expect(copy).not.toMatch(/courses/i)
    })
  })

  describe('topContributorsEmpty', () => {
    it('students get a classmates empty-state hint', () => {
      expect(roleCopy('topContributorsEmpty', 'student')).toMatch(/classmate/i)
    })

    it('teachers get a students empty-state hint', () => {
      expect(roleCopy('topContributorsEmpty', 'teacher')).toMatch(/student/i)
    })

    it('Self-learners get a follow-based empty-state hint, never classmates', () => {
      const copy = roleCopy('topContributorsEmpty', 'other')
      expect(copy).toMatch(/follow/i)
      expect(copy).not.toMatch(/classmate/i)
    })
  })
})
