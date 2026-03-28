import { describe, expect, it } from 'vitest'
import {
  shouldAutoPublish,
  getInitialModerationStatus,
  meetsPromotionCriteria,
  TRUST_LEVELS,
} from '../src/lib/trustGate.js'

describe('trustGate', () => {
  describe('TRUST_LEVELS', () => {
    it('exports the three trust levels', () => {
      expect(TRUST_LEVELS).toEqual({ NEW: 'new', TRUSTED: 'trusted', RESTRICTED: 'restricted' })
    })
  })

  describe('shouldAutoPublish', () => {
    it('returns true for trusted users', () => {
      expect(shouldAutoPublish({ trustLevel: 'trusted' })).toBe(true)
    })
    it('returns true for admin users regardless of trust level', () => {
      expect(shouldAutoPublish({ trustLevel: 'new', role: 'admin' })).toBe(true)
    })
    it('returns false for new users', () => {
      expect(shouldAutoPublish({ trustLevel: 'new' })).toBe(false)
    })
    it('returns false for restricted users', () => {
      expect(shouldAutoPublish({ trustLevel: 'restricted' })).toBe(false)
    })
  })

  describe('getInitialModerationStatus', () => {
    it('returns clean for trusted users', () => {
      expect(getInitialModerationStatus({ trustLevel: 'trusted' })).toBe('clean')
    })
    it('returns clean for admins', () => {
      expect(getInitialModerationStatus({ trustLevel: 'new', role: 'admin' })).toBe('clean')
    })
    it('returns pending_review for new users', () => {
      expect(getInitialModerationStatus({ trustLevel: 'new' })).toBe('pending_review')
    })
    it('returns pending_review for restricted users', () => {
      expect(getInitialModerationStatus({ trustLevel: 'restricted' })).toBe('pending_review')
    })
  })

  describe('meetsPromotionCriteria', () => {
    it('promotes a user with email and clean record', () => {
      expect(meetsPromotionCriteria({
        hasEmail: true, confirmedViolations: 0, activeStrikes: 0, hasActiveRestriction: false,
      })).toBe(true)
    })
    it('rejects a user without email', () => {
      expect(meetsPromotionCriteria({
        hasEmail: false, confirmedViolations: 0, activeStrikes: 0, hasActiveRestriction: false,
      })).toBe(false)
    })
    it('rejects a user with confirmed violations', () => {
      expect(meetsPromotionCriteria({
        hasEmail: true, confirmedViolations: 1, activeStrikes: 0, hasActiveRestriction: false,
      })).toBe(false)
    })
    it('rejects a user with active strikes', () => {
      expect(meetsPromotionCriteria({
        hasEmail: true, confirmedViolations: 0, activeStrikes: 1, hasActiveRestriction: false,
      })).toBe(false)
    })
    it('rejects a user with active restriction', () => {
      expect(meetsPromotionCriteria({
        hasEmail: true, confirmedViolations: 0, activeStrikes: 0, hasActiveRestriction: true,
      })).toBe(false)
    })
  })
})
