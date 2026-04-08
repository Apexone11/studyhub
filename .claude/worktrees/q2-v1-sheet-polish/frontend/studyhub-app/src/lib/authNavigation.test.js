import { describe, expect, it } from 'vitest'
import { getAuthenticatedHomePath } from './authNavigation'

describe('getAuthenticatedHomePath', () => {
  it('returns /login for null user', () => {
    expect(getAuthenticatedHomePath(null)).toBe('/login')
  })

  it('returns /feed for student users', () => {
    expect(getAuthenticatedHomePath({ role: 'student', twoFaEnabled: false })).toBe('/feed')
  })

  it('returns /admin for admins with 2FA enabled', () => {
    expect(getAuthenticatedHomePath({ role: 'admin', twoFaEnabled: true })).toBe('/admin')
  })

  it('returns /admin for admins without 2FA enabled', () => {
    expect(getAuthenticatedHomePath({ role: 'admin', twoFaEnabled: false })).toBe('/admin')
  })

  it('returns /feed for unexpected role values', () => {
    expect(getAuthenticatedHomePath({ role: 'teacher', twoFaEnabled: true })).toBe('/feed')
  })
})
