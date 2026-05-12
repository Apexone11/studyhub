import { describe, expect, it } from 'vitest'
import { classifyLinkUrl, isValidHttpsUrl } from './socialLinks'

describe('classifyLinkUrl', () => {
  it('returns null for empty or non-string values', () => {
    expect(classifyLinkUrl('')).toBeNull()
    expect(classifyLinkUrl(null)).toBeNull()
    expect(classifyLinkUrl(undefined)).toBeNull()
    expect(classifyLinkUrl(123)).toBeNull()
  })

  it('rejects http urls', () => {
    expect(classifyLinkUrl('http://github.com/user')).toBeNull()
  })

  it('rejects javascript: and data: urls', () => {
    expect(classifyLinkUrl('javascript:alert(1)')).toBeNull()
    expect(classifyLinkUrl('data:text/html,<script>')).toBeNull()
  })

  it('classifies github as trusted', () => {
    const out = classifyLinkUrl('https://github.com/torvalds')
    expect(out?.trusted).toBe(true)
    expect(out?.kind).toBe('github')
    expect(out?.host).toBe('github.com')
  })

  it('strips www. prefix from host for matching', () => {
    const out = classifyLinkUrl('https://www.linkedin.com/in/alice')
    expect(out?.trusted).toBe(true)
    expect(out?.kind).toBe('linkedin')
  })

  it('matches wildcard subdomain entries', () => {
    const out = classifyLinkUrl('https://alice.github.io/portfolio')
    expect(out?.trusted).toBe(true)
    expect(out?.kind).toBe('website')
    expect(out?.host).toBe('alice.github.io')
  })

  it('marks unknown https domains as untrusted', () => {
    const out = classifyLinkUrl('https://example.com/foo')
    expect(out?.trusted).toBe(false)
    expect(out?.kind).toBe('website')
    expect(out?.host).toBe('example.com')
  })
})

describe('isValidHttpsUrl', () => {
  it('returns true for trusted https urls', () => {
    expect(isValidHttpsUrl('https://github.com/x')).toBe(true)
  })
  it('returns true for untrusted https urls', () => {
    expect(isValidHttpsUrl('https://example.com')).toBe(true)
  })
  it('returns false for http', () => {
    expect(isValidHttpsUrl('http://example.com')).toBe(false)
  })
  it('returns false for nonsense', () => {
    expect(isValidHttpsUrl('not-a-url')).toBe(false)
  })
})
