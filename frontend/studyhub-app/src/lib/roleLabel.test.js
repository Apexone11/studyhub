import { describe, it, expect } from 'vitest'
import { roleLabel, ACCOUNT_TYPE_OPTIONS } from './roleLabel'

describe('roleLabel', () => {
  it('maps known account types to human labels', () => {
    expect(roleLabel('student')).toBe('Student')
    expect(roleLabel('teacher')).toBe('Teacher')
    expect(roleLabel('other')).toBe('Self-learner')
  })

  it('never returns "Other" or "Member" for any input', () => {
    for (const input of ['student', 'teacher', 'other', undefined, null, '', 'unknown']) {
      const label = roleLabel(input)
      expect(label).not.toBe('Other')
      expect(label).not.toBe('Member')
    }
  })

  it('falls back to Student for unknown values', () => {
    expect(roleLabel('unknown')).toBe('Student')
    expect(roleLabel(undefined)).toBe('Student')
  })

  it('ACCOUNT_TYPE_OPTIONS exposes the three chips with Self-learner label', () => {
    expect(ACCOUNT_TYPE_OPTIONS).toHaveLength(3)
    const other = ACCOUNT_TYPE_OPTIONS.find((o) => o.value === 'other')
    expect(other.label).toBe('Self-learner')
    const labels = ACCOUNT_TYPE_OPTIONS.map((o) => o.label)
    expect(labels).not.toContain('Other')
    expect(labels).not.toContain('Member')
  })
})
