import { describe, expect, it } from 'vitest'
import {
  classifyReportPriority,
  classifyAppealPriority,
  classifyEnforcementPriority,
  HIGH_SEVERITY_CATEGORIES,
  HIGH_IMPACT_SURFACES,
  REPEAT_OFFENDER_STRIKE_THRESHOLD,
  REPEAT_OFFENDER_CASE_THRESHOLD,
  PLAGIARISM_EMAIL_SIMILARITY,
} from '../src/lib/notificationPolicy'

describe('notificationPolicy', () => {
  describe('classifyReportPriority', () => {
    describe('high-severity categories → high', () => {
      it.each([...HIGH_SEVERITY_CATEGORIES])('%s → high', (category) => {
        expect(classifyReportPriority({ reasonCategory: category })).toBe('high')
      })
    })

    describe('high-impact surfaces → high', () => {
      it.each([...HIGH_IMPACT_SURFACES])('%s → high', (surface) => {
        expect(classifyReportPriority({ targetType: surface, reasonCategory: 'spam' })).toBe('high')
      })
    })

    it('public sheet → high', () => {
      expect(classifyReportPriority({
        targetType: 'sheet',
        reasonCategory: 'spam',
        isPublicTarget: true,
      })).toBe('high')
    })

    it('public note → high', () => {
      expect(classifyReportPriority({
        targetType: 'note',
        reasonCategory: 'spam',
        isPublicTarget: true,
      })).toBe('high')
    })

    it('private sheet → medium', () => {
      expect(classifyReportPriority({
        targetType: 'sheet',
        reasonCategory: 'spam',
        isPublicTarget: false,
      })).toBe('medium')
    })

    describe('repeat offender signals', () => {
      it(`≥${REPEAT_OFFENDER_STRIKE_THRESHOLD} active strikes → high`, () => {
        expect(classifyReportPriority({
          reasonCategory: 'spam',
          targetType: 'sheet',
          actorActiveStrikes: REPEAT_OFFENDER_STRIKE_THRESHOLD,
        })).toBe('high')
      })

      it(`< ${REPEAT_OFFENDER_STRIKE_THRESHOLD} strikes → medium`, () => {
        expect(classifyReportPriority({
          reasonCategory: 'spam',
          targetType: 'sheet',
          actorActiveStrikes: REPEAT_OFFENDER_STRIKE_THRESHOLD - 1,
        })).toBe('medium')
      })

      it(`≥${REPEAT_OFFENDER_CASE_THRESHOLD} recent cases → high`, () => {
        expect(classifyReportPriority({
          reasonCategory: 'spam',
          targetType: 'sheet',
          actorRecentCases: REPEAT_OFFENDER_CASE_THRESHOLD,
        })).toBe('high')
      })
    })

    describe('system confidence (auto-detection)', () => {
      it('auto-detected + tier 2 → high', () => {
        expect(classifyReportPriority({
          reasonCategory: 'other',
          targetType: 'sheet',
          autoDetected: true,
          htmlRiskTier: 2,
        })).toBe('high')
      })

      it('auto-detected + tier 1 → medium', () => {
        expect(classifyReportPriority({
          reasonCategory: 'other',
          targetType: 'sheet',
          autoDetected: true,
          htmlRiskTier: 1,
        })).toBe('medium')
      })
    })

    describe('plagiarism', () => {
      it(`≥${PLAGIARISM_EMAIL_SIMILARITY * 100}% similarity + public → high`, () => {
        expect(classifyReportPriority({
          reasonCategory: 'plagiarism',
          targetType: 'sheet',
          isPublicTarget: true,
          similarity: PLAGIARISM_EMAIL_SIMILARITY,
        })).toBe('high')
      })

      it('high similarity but private → medium', () => {
        expect(classifyReportPriority({
          reasonCategory: 'plagiarism',
          targetType: 'sheet',
          isPublicTarget: false,
          similarity: PLAGIARISM_EMAIL_SIMILARITY,
        })).toBe('medium')
      })

      it('low similarity on public target → medium (plagiarism branch)', () => {
        /* Note: public sheets already escalate via the surface check,
         * so we test with a private target to isolate plagiarism logic */
        expect(classifyReportPriority({
          reasonCategory: 'plagiarism',
          targetType: 'sheet',
          isPublicTarget: false,
          similarity: 0.7,
        })).toBe('medium')
      })
    })

    it('default with no signals → medium', () => {
      expect(classifyReportPriority({
        reasonCategory: 'other',
        targetType: 'sheet',
      })).toBe('medium')
    })

    it('handles missing context gracefully', () => {
      expect(classifyReportPriority()).toBe('medium')
      expect(classifyReportPriority({})).toBe('medium')
    })
  })

  describe('classifyAppealPriority', () => {
    it('any appeal → high', () => {
      expect(classifyAppealPriority({ reasonCategory: 'false_positive' })).toBe('high')
    })

    it('not_me appeal → high', () => {
      expect(classifyAppealPriority({ reasonCategory: 'not_me' })).toBe('high')
    })

    it('handles empty context', () => {
      expect(classifyAppealPriority()).toBe('high')
      expect(classifyAppealPriority({})).toBe('high')
    })
  })

  describe('classifyEnforcementPriority', () => {
    it('confirm with restriction → high', () => {
      expect(classifyEnforcementPriority({
        action: 'confirm',
        triggeredRestriction: true,
      })).toBe('high')
    })

    it('confirm without restriction → medium', () => {
      expect(classifyEnforcementPriority({
        action: 'confirm',
        triggeredRestriction: false,
      })).toBe('medium')
    })

    it('dismiss → medium', () => {
      expect(classifyEnforcementPriority({ action: 'dismiss' })).toBe('medium')
    })

    it('approve_appeal → medium', () => {
      expect(classifyEnforcementPriority({ action: 'approve_appeal' })).toBe('medium')
    })

    it('handles empty context', () => {
      expect(classifyEnforcementPriority()).toBe('medium')
      expect(classifyEnforcementPriority({})).toBe('medium')
    })
  })
})
