import { describe, expect, it } from 'vitest'
import { normalizeContentFormat, validateHtmlForSubmission } from '../src/lib/htmlSecurity'

describe('htmlSecurity', () => {
  it('normalizes content format with markdown default', () => {
    expect(normalizeContentFormat('html')).toBe('html')
    expect(normalizeContentFormat('HTML')).toBe('html')
    expect(normalizeContentFormat('markdown')).toBe('markdown')
    expect(normalizeContentFormat('unknown')).toBe('markdown')
    expect(normalizeContentFormat('')).toBe('markdown')
  })

  it('allows safe html payloads', () => {
    const result = validateHtmlForSubmission('<main><h1>StudyHub</h1><p>Safe content.</p></main>')
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('blocks script, iframe, inline handlers, and dangerous urls', () => {
    const blockedCases = [
      '<script>alert(1)</script>',
      '<iframe src="https://evil.example"></iframe>',
      '<img src="x" onerror="alert(1)" />',
      '<a href="javascript:alert(1)">click</a>',
      '<iframe src="data:text/html;base64,SGk="></iframe>',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
      '<base href="https://evil.example/">',
    ]

    for (const html of blockedCases) {
      const result = validateHtmlForSubmission(html)
      expect(result.ok).toBe(false)
      expect(result.issues.length).toBeGreaterThan(0)
    }
  })

  it('blocks empty and oversized html payloads', () => {
    expect(validateHtmlForSubmission('   ').ok).toBe(false)

    const oversized = `<div>${'x'.repeat(350001)}</div>`
    const oversizedResult = validateHtmlForSubmission(oversized)
    expect(oversizedResult.ok).toBe(false)
    expect(oversizedResult.issues.join(' ')).toMatch(/350,000/i)
  })
})
