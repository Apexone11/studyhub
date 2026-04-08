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

  it('merges classifier findings + av findings into normalized list', () => {
    const classifierResult = {
      tier: 1,
      findings: [
        { category: 'suspicious-tag', severity: 'medium', message: 'HTML contains flagged tags: script.' },
      ],
    }
    const findings = normalizeFindings(
      classifierResult,
      { status: 'infected', threat: 'Eicar-Test-Signature FOUND' },
    )

    expect(findings).toHaveLength(2)
    expect(findings[0].source).toBe('suspicious-tag')
    expect(findings[1].source).toBe('av')
    expect(findings[1].severity).toBe('critical')
  })

  it('treats antivirus scanner errors as medium-severity findings', () => {
    const classifierResult = { tier: 0, findings: [] }
    const findings = normalizeFindings(
      classifierResult,
      { status: 'error', message: 'Scanner unavailable.' },
    )

    expect(findings).toHaveLength(1)
    expect(findings[0].source).toBe('av')
    expect(findings[0].severity).toBe('medium')
  })

  it('handles classifier-only findings without AV result', () => {
    const classifierResult = {
      tier: 2,
      findings: [
        { category: 'obfuscation', severity: 'high', message: 'Heavy String.fromCharCode usage.' },
        { category: 'js-risk', severity: 'high', message: 'eval() call detected' },
      ],
    }
    const findings = normalizeFindings(classifierResult, null)

    expect(findings).toHaveLength(2)
    expect(findings[0].source).toBe('obfuscation')
    expect(findings[1].source).toBe('js-risk')
  })

  it('handles clean result with clean AV', () => {
    const classifierResult = { tier: 0, findings: [] }
    const findings = normalizeFindings(classifierResult, { status: 'clean' })

    expect(findings).toHaveLength(0)
  })
})
