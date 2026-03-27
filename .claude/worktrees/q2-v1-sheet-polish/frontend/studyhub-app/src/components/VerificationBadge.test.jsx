import { describe, it, expect } from 'vitest'
import { getVerificationType } from './verificationUtils'

describe('getVerificationType', () => {
  it('returns null for null user', () => {
    expect(getVerificationType(null)).toBe(null)
  })

  it('returns null for user with no verification', () => {
    expect(getVerificationType({ isStaffVerified: false, emailVerified: false })).toBe(null)
  })

  it('returns "email" for email-verified user', () => {
    expect(getVerificationType({ isStaffVerified: false, emailVerified: true })).toBe('email')
  })

  it('returns "staff" for staff-verified user', () => {
    expect(getVerificationType({ isStaffVerified: true, emailVerified: false })).toBe('staff')
  })

  it('returns "staff" when both staff and email verified (staff overrides)', () => {
    expect(getVerificationType({ isStaffVerified: true, emailVerified: true })).toBe('staff')
  })

  it('returns null for empty object', () => {
    expect(getVerificationType({})).toBe(null)
  })
})
