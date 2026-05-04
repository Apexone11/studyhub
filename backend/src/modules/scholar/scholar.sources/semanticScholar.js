/**
 * semanticScholar.js — Adapter for the Semantic Scholar Graph API.
 *
 * Docs: https://api.semanticscholar.org/api-docs/graph
 * All outbound HTTP via safeFetch with the host allowlist.
 * Per-source token-bucket guards the 1 req/s free tier.
 */

const { safeFetch } = require('../../../lib/safeFetch')
const log = require('../../../lib/logger')
const rateBucket = require('../rateBucket')
const { HOSTS, ADAPTER_SOFT_TIMEOUT_MS } = require('../scholar.constants')

const SOURCE = 'semanticScholar'
const HOST = HOSTS.semanticScholar

const FIELDS = [
  'paperId',
  'externalIds',
  'title',
  'abstract',
  'venue',
  'year',
  'publicationDate',
  'authors.name',
  'authors.affiliations',
  'openAccessPdf',
  'citationCount',
  's2FieldsOfStudy',
].join(',')

function _headers() {
  const h = {}
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    h['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY
  }
  return h
}

function _normalize(p) {
  if (!p || typeof p !== 'object') return null
  const doi = p.externalIds?.DOI || null
  const arxivId = p.externalIds?.ArXiv || null
  const ssId = p.paperId || null
  const id = doi
    ? `doi:${doi.toLowerCase()}`
    : arxivId
      ? `arxiv:${arxivId}`
      : ssId
        ? `ss:${ssId.toLowerCase()}`
        : null
  if (!id) return null
  return {
    id,
    title: p.title || '',
    abstract: p.abstract || null,
    authors: Array.isArray(p.authors)
      ? p.authors.map((a) => ({
          name: a?.name || '',
          affiliation:
            Array.isArray(a?.affiliations) && a.affiliations.length > 0 ? a.affiliations[0] : null,
        }))
      : [],
    venue: p.venue || null,
    publishedAt: p.publicationDate || (p.year ? `${p.year}-01-01` : null),
    doi,
    arxivId,
    semanticScholarId: ssId,
    openAlexId: null,
    pubmedId: p.externalIds?.PubMed || null,
    license: null,
    openAccess: Boolean(p.openAccessPdf?.url),
    pdfExternalUrl: p.openAccessPdf?.url || null,
    citationCount: typeof p.citationCount === 'number' ? p.citationCount : 0,
    topics: Array.isArray(p.s2FieldsOfStudy)
      ? p.s2FieldsOfStudy.map((f) => f?.category || '').filter(Boolean)
      : [],
    source: SOURCE,
  }
}

async function search(query, opts = {}) {
  if (!rateBucket.take(SOURCE)) {
    return { source: SOURCE, results: [], throttled: true }
  }
  const limit = Math.min(50, Math.max(1, opts.limit || 20))
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    fields: FIELDS,
  })
  if (opts.from || opts.to) {
    const from = opts.from || ''
    const to = opts.to || ''
    params.set('year', `${from}-${to}`)
  }
  const url = `https://${HOST}/graph/v1/paper/search?${params.toString()}`
  const res = await safeFetch(url, {
    allowlist: [HOST],
    headers: _headers(),
    expect: 'json',
    timeoutMs: ADAPTER_SOFT_TIMEOUT_MS,
  })
  if (!res.ok) {
    log.warn(
      { event: 'scholar.adapter.error', source: SOURCE, error: res.error, status: res.status },
      'Semantic Scholar search failed',
    )
    return { source: SOURCE, results: [], error: res.error || 'http_error' }
  }
  const list = Array.isArray(res.body?.data) ? res.body.data : []
  return {
    source: SOURCE,
    results: list.map(_normalize).filter(Boolean),
  }
}

async function fetch(canonicalId) {
  if (!rateBucket.take(SOURCE)) {
    return { source: SOURCE, paper: null, throttled: true }
  }
  // Accept either ss:<id> or doi:<id>; map to S2's identifier scheme.
  let lookupId = canonicalId
  if (canonicalId.startsWith('ss:')) lookupId = canonicalId.slice(3)
  else if (canonicalId.startsWith('doi:')) lookupId = `DOI:${canonicalId.slice(4)}`
  else if (canonicalId.startsWith('arxiv:')) lookupId = `ARXIV:${canonicalId.slice(6)}`

  const url = `https://${HOST}/graph/v1/paper/${encodeURIComponent(lookupId)}?fields=${encodeURIComponent(FIELDS)}`
  const res = await safeFetch(url, {
    allowlist: [HOST],
    headers: _headers(),
    expect: 'json',
    timeoutMs: ADAPTER_SOFT_TIMEOUT_MS,
  })
  if (!res.ok) {
    return { source: SOURCE, paper: null, error: res.error || 'http_error' }
  }
  return { source: SOURCE, paper: _normalize(res.body) }
}

module.exports = { SOURCE, search, fetch, _normalize }
