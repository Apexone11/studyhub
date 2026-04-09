import { describe, expect, it } from 'vitest'
import {
  detectLossyConversion,
  sanitizeForTipTap,
  sanitizeOutput,
} from './editorSanitize'

describe('sanitizeOutput', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeOutput('')).toBe('')
    expect(sanitizeOutput(null)).toBe('')
    expect(sanitizeOutput(undefined)).toBe('')
    expect(sanitizeOutput('<p></p>')).toBe('')
  })

  it('strips script tags', () => {
    const result = sanitizeOutput('<p>safe</p><script>alert(1)</script>')
    expect(result).toContain('<p>safe</p>')
    expect(result).not.toContain('<script')
    expect(result).not.toContain('alert(1)')
  })

  it('allows TipTap tags to pass through', () => {
    const html = '<h1>Title</h1><p><strong>bold</strong> and <em>italic</em></p>'
    expect(sanitizeOutput(html)).toBe(html)
  })
})

describe('detectLossyConversion', () => {
  it('returns non-lossy for empty input', () => {
    expect(detectLossyConversion('')).toEqual({
      strippedTags: [],
      strippedAttributes: [],
      lossy: false,
    })
    expect(detectLossyConversion('   ')).toEqual({
      strippedTags: [],
      strippedAttributes: [],
      lossy: false,
    })
    expect(detectLossyConversion(null)).toEqual({
      strippedTags: [],
      strippedAttributes: [],
      lossy: false,
    })
  })

  it('returns non-lossy for clean TipTap-compatible HTML', () => {
    const html = '<h2>Heading</h2><p><strong>Bold</strong> text</p><ul><li>Item</li></ul>'
    const report = detectLossyConversion(html)
    expect(report.lossy).toBe(false)
    expect(report.strippedTags).toEqual([])
    expect(report.strippedAttributes).toEqual([])
  })

  it('flags script tags', () => {
    const report = detectLossyConversion('<p>hi</p><script>alert(1)</script>')
    expect(report.lossy).toBe(true)
    expect(report.strippedTags).toContain('script')
  })

  it('flags iframe tags', () => {
    const report = detectLossyConversion('<iframe src="x"></iframe><p>hi</p>')
    expect(report.lossy).toBe(true)
    expect(report.strippedTags).toContain('iframe')
  })

  it('flags inline event handler attributes', () => {
    const report = detectLossyConversion('<div onclick="evil()">hi</div>')
    expect(report.lossy).toBe(true)
    expect(report.strippedAttributes).toContain('div[onclick]')
  })

  it('flags inline style attributes', () => {
    const report = detectLossyConversion('<p style="color:red">text</p>')
    expect(report.lossy).toBe(true)
    expect(report.strippedAttributes).toContain('p[style]')
  })

  it('flags multiple stripped tags and sorts them alphabetically', () => {
    // Use tags that behave predictably in jsdom's HTML5 parser. <iframe>
    // is a raw-text element and would swallow following siblings, so we
    // pick form/details/article which all parse as independent elements.
    const html = '<div><form></form><details></details><article></article></div>'
    const report = detectLossyConversion(html)
    expect(report.lossy).toBe(true)
    expect(report.strippedTags).toEqual(['article', 'details', 'form'])
  })

  it('does not flag tables (Phase 3 added TipTap table extension)', () => {
    const html = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>'
    const report = detectLossyConversion(html)
    expect(report.lossy).toBe(false)
  })

  it('handles moderately nested HTML without errors (iterative walk)', () => {
    // The iterative walk uses an explicit stack, so it cannot blow the
    // call stack. 500 nesting levels is well above anything a real user
    // writes and keeps jsdom's DOMParser parse time reasonable.
    let deep = '<p>leaf</p>'
    for (let i = 0; i < 500; i += 1) {
      deep = `<div>${deep}</div>`
    }
    expect(() => detectLossyConversion(deep)).not.toThrow()
    expect(detectLossyConversion(deep).lossy).toBe(false)
  })
})

describe('sanitizeForTipTap', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeForTipTap('')).toBe('')
    expect(sanitizeForTipTap(null)).toBe('')
  })

  it('strips script tags entirely', () => {
    const result = sanitizeForTipTap('<p>keep</p><script>alert(1)</script>')
    expect(result).toContain('<p>keep</p>')
    expect(result).not.toContain('script')
    expect(result).not.toContain('alert')
  })

  it('strips inline event handlers but keeps the element', () => {
    const result = sanitizeForTipTap('<div onclick="x()">content</div>')
    expect(result).toContain('content')
    expect(result).not.toContain('onclick')
  })

  it('strips style attributes but keeps the element', () => {
    const result = sanitizeForTipTap('<p style="color:red">text</p>')
    expect(result).toContain('<p>text</p>')
    expect(result).not.toContain('style')
  })

  it('preserves href + target on links', () => {
    const result = sanitizeForTipTap('<a href="https://example.com" target="_blank">link</a>')
    expect(result).toContain('href="https://example.com"')
    expect(result).toContain('target="_blank"')
  })

  it('preserves table structure', () => {
    const html = '<table><tbody><tr><td>cell</td></tr></tbody></table>'
    const result = sanitizeForTipTap(html)
    expect(result).toContain('<table>')
    expect(result).toContain('<td>cell</td>')
  })
})
