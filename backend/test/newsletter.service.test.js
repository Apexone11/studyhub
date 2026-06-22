/**
 * newsletter.service.test.js — unit coverage for the security-critical pure
 * logic of the Product-Updates newsletter (#291): HMAC unsubscribe tokens,
 * slug generation, and body sanitization. These paths don't touch the DB, so
 * they run without the Prisma test harness.
 */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  baseSlug,
  sanitizeBody,
} = require('../src/modules/newsletter/newsletter.service')

describe('newsletter unsubscribe tokens', () => {
  it('round-trips a valid token back to its userId', () => {
    const token = generateUnsubscribeToken(42)
    expect(verifyUnsubscribeToken(token)).toBe(42)
  })

  it('rejects tampered, malformed, and empty tokens', () => {
    const token = generateUnsubscribeToken(42)
    expect(verifyUnsubscribeToken(token + 'x')).toBeNull()
    expect(verifyUnsubscribeToken('42.deadbeef')).toBeNull()
    expect(verifyUnsubscribeToken('')).toBeNull()
    expect(verifyUnsubscribeToken('notatoken')).toBeNull()
    expect(verifyUnsubscribeToken(null)).toBeNull()
  })

  it("does not let one user's signature unsubscribe a different user", () => {
    const token = generateUnsubscribeToken(1)
    const sig = token.split('.')[1]
    expect(verifyUnsubscribeToken(`2.${sig}`)).toBeNull()
  })
})

describe('newsletter slug', () => {
  it('slugifies titles and falls back to "update"', () => {
    expect(baseSlug('Hello, World! New Feature')).toBe('hello-world-new-feature')
    expect(baseSlug('')).toBe('update')
    expect(baseSlug('   ')).toBe('update')
  })

  it('collapses repeated separators and trims leading/trailing dashes', () => {
    expect(baseSlug('Hello   ---  World!!!')).toBe('hello-world')
    expect(baseSlug('---Hello World---')).toBe('hello-world')
  })

  it('strips (does not transliterate) non-ASCII characters', () => {
    // baseSlug removes anything outside [a-z0-9-]; accents/emoji are dropped,
    // not normalized to ASCII (é -> '', not 'e').
    expect(baseSlug('Café 🚀 Update')).toBe('caf-update')
  })

  it('caps the slug length at 80 characters', () => {
    expect(baseSlug('word '.repeat(40)).length).toBeLessThanOrEqual(80)
  })
})

describe('newsletter sanitizeBody', () => {
  it('strips script tags and inline event handlers', () => {
    const clean = sanitizeBody('<p onclick="evil()">hi</p><script>alert(1)</script>')
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('onclick')
    expect(clean).toContain('hi')
  })

  it('keeps safe formatting and forces safe link rels', () => {
    const clean = sanitizeBody('<a href="https://example.com">x</a>')
    expect(clean).toContain('href="https://example.com"')
    expect(clean).toContain('rel="noopener noreferrer"')
  })
})
