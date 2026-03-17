import { describe, expect, it } from 'vitest'
import { computeHtmlChecksum, normalizeFindings } from '../src/lib/htmlDraftWorkflow'

describe('htmlDraftWorkflow helpers', () => {
  it('generates stable checksum for identical content', () => {
    const first = computeHtmlChecksum('<main>Hello</main>')
    const second = computeHtmlChecksum('<main>Hello</main>')
    const third = computeHtmlChecksum('<main>Hello there</main>')

    expect(first).toBe(second)
    expect(first).not.toBe(third)
  })

  it('merges policy + av findings into normalized list', () => {
    const findings = normalizeFindings(
      { ok: false, issues: ['Blocked tag found.'] },
      { status: 'infected', threat: 'Eicar-Test-Signature FOUND' },
    )

    expect(findings).toHaveLength(2)
    expect(findings[0].source).toBe('policy')
    expect(findings[1].source).toBe('av')
    expect(findings[1].severity).toBe('critical')
  })

  it('treats antivirus scanner errors as blocking findings', () => {
    const findings = normalizeFindings(
      { ok: true, issues: [] },
      { status: 'error', message: 'Scanner unavailable.' },
    )

    expect(findings).toHaveLength(1)
    expect(findings[0].source).toBe('av')
    expect(findings[0].severity).toBe('high')
  })
})