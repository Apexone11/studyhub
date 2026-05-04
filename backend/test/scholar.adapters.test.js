/**
 * scholar.adapters.test.js — Adapter normalization coverage.
 *
 * Verifies each adapter parses its canonical upstream response shape
 * into the unified ScholarPaper internal shape.
 */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const semanticScholar = require('../src/modules/scholar/scholar.sources/semanticScholar')
const openAlex = require('../src/modules/scholar/scholar.sources/openAlex')
const crossref = require('../src/modules/scholar/scholar.sources/crossref')
const arxiv = require('../src/modules/scholar/scholar.sources/arxiv')
const unpaywall = require('../src/modules/scholar/scholar.sources/unpaywall')

describe('scholar/sources/semanticScholar._normalize', () => {
  it('maps S2 paper fields to canonical shape', () => {
    const raw = {
      paperId: 'AbCdEf0123456789AbCdEf0123456789',
      externalIds: { DOI: '10.1234/example', ArXiv: '2401.12345' },
      title: 'Example Paper',
      abstract: 'An abstract.',
      venue: 'Nature',
      year: 2024,
      publicationDate: '2024-04-15',
      authors: [
        { name: 'Alice Cooper', affiliations: ['MIT'] },
        { name: 'Bob Marley', affiliations: [] },
      ],
      openAccessPdf: { url: 'https://arxiv.org/pdf/2401.12345.pdf' },
      citationCount: 42,
      s2FieldsOfStudy: [{ category: 'Computer Science' }],
    }
    const out = semanticScholar._normalize(raw)
    expect(out.id).toBe('doi:10.1234/example')
    expect(out.doi).toBe('10.1234/example')
    expect(out.arxivId).toBe('2401.12345')
    expect(out.authors[0].name).toBe('Alice Cooper')
    expect(out.authors[0].affiliation).toBe('MIT')
    expect(out.openAccess).toBe(true)
    expect(out.pdfExternalUrl).toContain('arxiv.org')
    expect(out.citationCount).toBe(42)
    expect(out.topics).toContain('Computer Science')
    expect(out.source).toBe('semanticScholar')
  })

  it('returns null when no id can be derived', () => {
    expect(semanticScholar._normalize({})).toBeNull()
    expect(semanticScholar._normalize(null)).toBeNull()
  })
})

describe('scholar/sources/openAlex', () => {
  it('reconstructs an inverted abstract index', () => {
    // "the quick fox" — positions 0,1,2
    const idx = { the: [0], quick: [1], fox: [2] }
    expect(openAlex._reconstructAbstract(idx)).toBe('the quick fox')
  })

  it('normalizes a Work object', () => {
    const raw = {
      id: 'https://openalex.org/W12345',
      doi: 'https://doi.org/10.1111/test',
      title: 'OA Title',
      abstract_inverted_index: { hello: [0], world: [1] },
      authorships: [
        { author: { display_name: 'Carol' }, institutions: [{ display_name: 'Yale' }] },
      ],
      primary_location: { source: { display_name: 'JOAR' }, license: 'cc-by' },
      best_oa_location: { pdf_url: 'https://oa.example/p.pdf', license: 'cc-by' },
      publication_date: '2023-01-15',
      publication_year: 2023,
      cited_by_count: 12,
      open_access: { is_oa: true },
      concepts: [{ display_name: 'Biology' }],
    }
    const out = openAlex._normalize(raw)
    expect(out.id).toBe('doi:10.1111/test')
    expect(out.openAccess).toBe(true)
    expect(out.license).toBe('cc-by')
    expect(out.abstract).toBe('hello world')
    expect(out.authors[0].name).toBe('Carol')
    expect(out.authors[0].affiliation).toBe('Yale')
    expect(out.venue).toBe('JOAR')
  })
})

describe('scholar/sources/crossref._normalize', () => {
  it('parses a CrossRef item', () => {
    const item = {
      DOI: '10.0001/foo',
      title: ['CrossRef Title'],
      'container-title': ['Journal of Foo'],
      author: [{ given: 'Alan', family: 'Turing', affiliation: [{ name: 'Bletchley' }] }],
      issued: { 'date-parts': [[1950, 10, 1]] },
      'is-referenced-by-count': 9000,
      subject: ['Math'],
    }
    const out = crossref._normalize(item)
    expect(out.id).toBe('doi:10.0001/foo')
    expect(out.title).toBe('CrossRef Title')
    expect(out.venue).toBe('Journal of Foo')
    expect(out.authors[0].name).toBe('Alan Turing')
    expect(out.authors[0].affiliation).toBe('Bletchley')
    expect(out.publishedAt).toBe('1950-10-01')
    expect(out.citationCount).toBe(9000)
    expect(out.topics).toContain('Math')
  })

  it('returns null without a DOI', () => {
    expect(crossref._normalize({ title: ['x'] })).toBeNull()
  })
})

describe('scholar/sources/arxiv._parseEntry', () => {
  it('extracts arxiv metadata from an Atom entry', () => {
    const entry = `
      <entry>
        <id>http://arxiv.org/abs/2401.12345v2</id>
        <title>An arXiv Paper</title>
        <summary>Some abstract text.</summary>
        <published>2024-01-30T00:00:00Z</published>
        <author><name>First Author</name></author>
        <author><name>Second Author</name></author>
        <link title="pdf" type="application/pdf" href="http://arxiv.org/pdf/2401.12345v2.pdf"/>
      </entry>`
    const out = arxiv._parseEntry(entry)
    expect(out.id).toBe('arxiv:2401.12345v2')
    expect(out.arxivId).toBe('2401.12345v2')
    expect(out.title).toBe('An arXiv Paper')
    expect(out.authors).toHaveLength(2)
    expect(out.authors[0].name).toBe('First Author')
    expect(out.pdfExternalUrl).toContain('arxiv.org/pdf')
  })
})

describe('scholar/sources/unpaywall._normalize', () => {
  it('maps an Unpaywall record', () => {
    const raw = {
      doi: '10.5555/oa',
      is_oa: true,
      best_oa_location: {
        url_for_pdf: 'https://oa.example/file.pdf',
        license: 'cc-by-nc',
        host_type: 'repository',
      },
      published_date: '2022-06-01',
    }
    const out = unpaywall._normalize(raw)
    expect(out.doi).toBe('10.5555/oa')
    expect(out.openAccess).toBe(true)
    expect(out.pdfExternalUrl).toContain('file.pdf')
    expect(out.license).toBe('cc-by-nc')
  })

  it('rejects malformed DOI', () => {
    expect(unpaywall._normalize({ doi: 'not-a-doi' })).toBeNull()
    expect(unpaywall._normalize(null)).toBeNull()
  })
})
