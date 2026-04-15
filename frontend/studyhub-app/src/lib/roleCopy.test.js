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
})
