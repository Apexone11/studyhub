/**
 * safeSanitize.test.js — regression coverage for the sanitize-html
 * `<xmp>` bypass disclosed in 2026-05. PoC from the advisory must
 * produce no live markup after going through safeSanitize.
 */
import { describe, expect, it } from 'vitest'
import safeSanitize from '../src/lib/html/safeSanitize'

describe('safeSanitize — xmp/raw-text bypass mitigation', () => {
  it('drops <xmp><script>...</script></xmp> contents entirely', () => {
    const dirty = '<xmp><script>alert(1)</script></xmp>'
    const clean = safeSanitize(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('alert(1)')
  })

  it('drops <xmp><img onerror></xmp> contents entirely', () => {
    const dirty = '<xmp><img src=x onerror=alert(1)></xmp>'
    const clean = safeSanitize(dirty)
    expect(clean).not.toContain('<img')
    expect(clean).not.toContain('onerror')
  })

  it('drops <xmp><svg><script>...</script></svg></xmp> contents entirely', () => {
    const dirty = '<xmp><svg><script>alert(1)</script></svg></xmp>'
    const clean = safeSanitize(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('<svg')
  })

  it('drops <noscript> contents (parser-class siblings of xmp)', () => {
    const clean = safeSanitize('<noscript><script>alert(1)</script></noscript>')
    expect(clean).not.toContain('<script')
  })

  it('drops <iframe> contents', () => {
    const clean = safeSanitize('<iframe src="evil"></iframe>')
    expect(clean).not.toContain('<iframe')
  })

  it('preserves benign text outside disallowed tags', () => {
    const clean = safeSanitize('Hello <xmp>evil</xmp> world')
    expect(clean).toContain('Hello')
    expect(clean).toContain('world')
    expect(clean).not.toContain('evil')
  })

  it('respects caller-supplied allowedTags', () => {
    const clean = safeSanitize('<p>hi</p><xmp><script>alert(1)</script></xmp>', {
      allowedTags: ['p'],
      allowedAttributes: {},
    })
    expect(clean).toContain('<p>hi</p>')
    expect(clean).not.toContain('<script')
  })

  it('merges (not replaces) caller-supplied nonTextTags', () => {
    // Caller adds a custom tag; safe defaults must still kick in for xmp.
    const clean = safeSanitize('<xmp><script>x</script></xmp><foo>bar</foo>', {
      allowedTags: [],
      allowedAttributes: {},
      nonTextTags: ['foo'],
    })
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('bar')
  })
})
