/**
 * scholar.cite.test.js — Citation exporter coverage.
 */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cite = require('../src/modules/scholar/scholar.cite.controller')
const { sanitizeFilename } = require('../src/modules/scholar/scholar.constants')

const SAMPLE_PAPER = {
  id: 'doi:10.1234/example',
  title: 'A Study of Gravity',
  authors: [{ name: 'Isaac Newton' }, { name: 'Albert Einstein' }],
  venue: 'Physics Today',
  publishedAt: '1687-07-05',
  doi: '10.1234/example',
  abstract: 'On the principles of natural philosophy.',
}

describe('scholar.cite/_escapeBibtex', () => {
  it('escapes LaTeX-active characters', () => {
    const out = cite._escapeBibtex('Cost: 50% off & free $1 #now')
    expect(out).toContain('\\%')
    expect(out).toContain('\\&')
    expect(out).toContain('\\$')
    expect(out).toContain('\\#')
  })

  it('strips backslash-letter sequences (kills \\input{})', () => {
    const evil = '\\input{/etc/passwd}'
    const out = cite._escapeBibtex(evil)
    // After escaping `\` then stripping any remaining `\X` we should not see the raw command.
    expect(out).not.toMatch(/\\input/)
    // Literal text input is harmless — only a leading backslash makes it a command.
  })

  it('strips \\write18 attempts', () => {
    const evil = '\\write18{rm -rf /}'
    const out = cite._escapeBibtex(evil)
    expect(out).not.toMatch(/\\write18/)
  })
})

describe('scholar.cite/_bibtex', () => {
  it('emits a syntactically valid @article entry', () => {
    const out = cite._bibtex(SAMPLE_PAPER)
    expect(out).toMatch(/^@article\{[a-z0-9]+/)
    expect(out).toContain('Isaac Newton')
    expect(out).toContain('Albert Einstein')
    expect(out).toContain('A Study of Gravity')
    expect(out).toContain('10.1234/example')
  })

  it('escapes injected LaTeX in title', () => {
    const evilPaper = { ...SAMPLE_PAPER, title: 'Title \\input{/etc/passwd}' }
    const out = cite._bibtex(evilPaper)
    expect(out).not.toMatch(/\\input\{/)
  })
})

describe('scholar.cite/_ris', () => {
  it('emits standard RIS tags', () => {
    const out = cite._ris(SAMPLE_PAPER)
    expect(out).toContain('TY  - JOUR')
    expect(out).toContain('AU  - Isaac Newton')
    expect(out).toContain('AU  - Albert Einstein')
    expect(out).toContain('TI  - A Study of Gravity')
    expect(out).toContain('JO  - Physics Today')
    expect(out).toContain('PY  - 1687')
    expect(out).toContain('DO  - 10.1234/example')
    expect(out).toContain('ER  - ')
  })
})

describe('scholar.cite/_cslJson', () => {
  it('emits a valid CSL JSON object', () => {
    const out = cite._cslJson(SAMPLE_PAPER)
    const parsed = JSON.parse(out)
    expect(parsed.type).toBe('article-journal')
    expect(parsed.title).toBe('A Study of Gravity')
    expect(parsed.author).toHaveLength(2)
    expect(parsed.author[0]).toHaveProperty('family')
    expect(parsed.author[0]).toHaveProperty('given')
    expect(parsed.DOI).toBe('10.1234/example')
  })
})

describe('scholar.cite/_apa', () => {
  it('escapes HTML in authors and title', () => {
    const evil = {
      ...SAMPLE_PAPER,
      title: '<script>alert(1)</script>',
      authors: [{ name: '<img onerror=x>' }],
    }
    const out = cite._apa(evil)
    expect(out).not.toContain('<script>')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;script&gt;')
  })
})

describe('scholar.cite filename sanitization', () => {
  it('replaces unsafe chars and caps length', () => {
    expect(sanitizeFilename('foo/bar:baz?')).toBe('foo_bar_baz')
    expect(sanitizeFilename(null)).toBe('paper')
    expect(sanitizeFilename('')).toBe('paper')
    const long = 'a'.repeat(500)
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(80)
  })

  it('rejects path traversal characters', () => {
    expect(sanitizeFilename('../../../etc/passwd')).not.toContain('/')
    expect(sanitizeFilename('..\\..\\windows\\system32')).not.toContain('\\')
  })
})
