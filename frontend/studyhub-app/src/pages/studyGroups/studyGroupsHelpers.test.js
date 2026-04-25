/**
 * studyGroupsHelpers.test.js — Vitest coverage for the pure helpers used by
 * GroupListView and friends. Focus: getGroupListSubtitle (Design Refresh v2
 * Week 2). Keeping the role branches honest so the bug where an undefined
 * `user` reference slipped into render cannot recur silently.
 */
import { describe, it, expect } from 'vitest'
import {
  getGroupListSubtitle,
  getPrivacyLabel,
  getMemberInitials,
  formatDuration,
  truncateText,
} from './studyGroupsHelpers'

describe('getGroupListSubtitle', () => {
  it('returns the "your groups" copy when mineOnly is true, regardless of role', () => {
    const copy = 'The groups you are in. Tap one to see what is new since last visit.'
    expect(getGroupListSubtitle({ mineOnly: true, accountType: null })).toBe(copy)
    expect(getGroupListSubtitle({ mineOnly: true, accountType: 'student' })).toBe(copy)
    expect(getGroupListSubtitle({ mineOnly: true, accountType: 'teacher' })).toBe(copy)
    expect(getGroupListSubtitle({ mineOnly: true, accountType: 'other' })).toBe(copy)
  })

  it('returns the unauthenticated copy when no accountType is provided', () => {
    expect(getGroupListSubtitle({ mineOnly: false, accountType: null })).toBe(
      'Find classmates to study with. Public groups open to anyone.',
    )
    expect(getGroupListSubtitle({ mineOnly: false, accountType: undefined })).toBe(
      'Find classmates to study with. Public groups open to anyone.',
    )
    expect(getGroupListSubtitle({ mineOnly: false })).toBe(
      'Find classmates to study with. Public groups open to anyone.',
    )
  })

  it('returns the teacher copy for accountType teacher', () => {
    expect(getGroupListSubtitle({ mineOnly: false, accountType: 'teacher' })).toBe(
      'Groups for your students. Create one to seed discussion.',
    )
  })

  it('returns the self-learner copy for accountType other', () => {
    expect(getGroupListSubtitle({ mineOnly: false, accountType: 'other' })).toBe(
      'Topic groups across the network. No course required.',
    )
  })

  it('returns the student copy for accountType student', () => {
    expect(getGroupListSubtitle({ mineOnly: false, accountType: 'student' })).toBe(
      'Better grades usually hide in these rooms. Start or join one.',
    )
  })

  it('falls back to the student copy for unexpected authenticated roles', () => {
    // We want the helper to be safe against future role-model drift — a
    // stray role string should never produce an empty subtitle.
    expect(getGroupListSubtitle({ mineOnly: false, accountType: 'wizard' })).toBe(
      'Better grades usually hide in these rooms. Start or join one.',
    )
  })

  it('is safe when called with no arguments at all', () => {
    expect(getGroupListSubtitle()).toBe(
      'Find classmates to study with. Public groups open to anyone.',
    )
  })
})

describe('getPrivacyLabel', () => {
  it('returns the display label for known privacy values', () => {
    expect(getPrivacyLabel('public')).toBe('Public')
    expect(getPrivacyLabel('private')).toBe('Private')
    expect(getPrivacyLabel('invite_only')).toBe('Invite Only')
  })

  it('returns the raw string for unknown values', () => {
    expect(getPrivacyLabel('secret-society')).toBe('secret-society')
  })
})

describe('getMemberInitials', () => {
  it('returns the first two characters uppercased', () => {
    expect(getMemberInitials('abdul')).toBe('AB')
    expect(getMemberInitials('zo')).toBe('ZO')
  })

  it('returns XX for empty/missing usernames', () => {
    expect(getMemberInitials('')).toBe('XX')
    expect(getMemberInitials(null)).toBe('XX')
    expect(getMemberInitials(undefined)).toBe('XX')
  })
})

describe('formatDuration', () => {
  it('formats a sub-hour duration', () => {
    expect(formatDuration(45)).toBe('45m')
  })

  it('formats an exact-hour duration', () => {
    expect(formatDuration(120)).toBe('2h')
  })

  it('formats an hours+minutes duration', () => {
    expect(formatDuration(90)).toBe('1h 30m')
  })

  it('returns 0m for zero, negative, or missing input', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(-15)).toBe('0m')
    expect(formatDuration(null)).toBe('0m')
    expect(formatDuration(undefined)).toBe('0m')
  })
})

describe('truncateText', () => {
  it('returns the original string when under the limit', () => {
    expect(truncateText('hello', 10)).toBe('hello')
  })

  it('truncates with an ellipsis when over the limit', () => {
    expect(truncateText('hello world', 5)).toBe('hello...')
  })

  it('returns an empty string for null/undefined input', () => {
    expect(truncateText(null, 5)).toBe('')
    expect(truncateText(undefined, 5)).toBe('')
  })
})
