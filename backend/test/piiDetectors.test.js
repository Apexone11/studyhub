import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { detectPii, luhnValid } = require('../src/lib/piiDetectors')

describe('detectPii', () => {
  it('detects emails without returning matched text', () => {
    const result = detectPii('Email jane.student@example.edu before publishing.')

    expect(result.counts.email).toBe(1)
    expect(result.findings[0]).toEqual({ kind: 'email', offsetStart: 6, offsetEnd: 30 })
    expect(result.findings[0]).not.toHaveProperty('text')
  })

  it('detects labeled student IDs, SSNs, phones, and valid credit cards', () => {
    const result = detectPii(
      'student id: 123456789, SSN 123-45-6789, phone 202-555-0101, card 4111 1111 1111 1111',
    )

    expect(result.counts.student_id).toBe(1)
    expect(result.counts.ssn).toBe(1)
    expect(result.counts.phone_us).toBe(1)
    expect(result.counts.credit_card).toBe(1)
  })

  it('does not treat arbitrary long numbers or non-Luhn card-like strings as PII', () => {
    const result = detectPii('Course section 123456789 and card 4111 1111 1111 1112 are examples.')

    expect(result.counts.student_id || 0).toBe(0)
    expect(result.counts.credit_card || 0).toBe(0)
  })

  it('sorts findings by their offsets', () => {
    const result = detectPii('Call 202-555-0101 or email a@example.edu')

    expect(result.findings.map((finding) => finding.kind)).toEqual(['phone_us', 'email'])
  })
})

describe('luhnValid', () => {
  it('validates credit-card candidates with the Luhn checksum', () => {
    expect(luhnValid('4111 1111 1111 1111')).toBe(true)
    expect(luhnValid('4111 1111 1111 1112')).toBe(false)
  })
})
