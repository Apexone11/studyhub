/**
 * crossref.js — Adapter for the CrossRef REST API.
 *
 * Docs: https://api.crossref.org/swagger-ui/index.html
 * CrossRef encourages a polite User-Agent with a contact email.
 */

const { safeFetch } = require('../../../lib/safeFetch')
const log = require('../../../lib/logger')
const rateBucket = require('../rateBucket')
const { HOSTS, ADAPTER_SOFT_TIMEOUT_MS } = require('../scholar.constants')

const SOURCE = 'crossref'
const HOST = HOSTS.crossref

// Copilot fix: don't ship a personal email as the default fallback.
// The role address is operator-controlled and lives in `support@`. If
// the env var is set we always prefer that. Set CROSSREF_USER_AGENT in
// Railway for prod; the fallback is only for local dev / CI.
const DEFAULT_UA = 'StudyHub/2.2 (mailto:support@getstudyhub.org)'

function _ua() {
  return process.env.CROSSREF_USER_AGENT || DEFAULT_UA
}

function _normalize(item) {
  if (!item || typeof item !== 'object') return null
  const doi = (item.DOI || '').toLowerCase() || null
  if (!doi) return null
  const id = `doi:${doi}`
  const titleArr = Array.isArray(item.title) ? item.title : []
  const containerArr = Array.isArray(item['container-title']) ? item['container-title'] : []
  const authors = Array.isArray(item.author) ? item.author : []
  let publishedAt = null
  const issued = item.issued?.['date-parts']
  if (Array.isArray(issued) && Array.isArray(issued[0])) {
    const [y, m = 1, d = 1] = issued[0]
    if (typeof y === 'number') {
      const mm = String(m).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      publishedAt = `${y}-${mm}-${dd}`
    }
  }
  return {
    id,
    title: titleArr[0] || '',
    abstract: typeof item.abstract === 'string' ? item.abstract : null,
    authors: authors.map((a) => ({
      name: [a?.given, a?.family].filter(Boolean).join(' ').trim() || a?.name || '',
      affiliation:
        Array.isArray(a?.affiliation) && a.affiliation.length > 0
          ? a.affiliation[0]?.name || null
          : null,
    })),
    venue: containerArr[0] || null,
    publishedAt,
    doi,
    arxivId: null,
    semanticScholarId: null,
    openAlexId: null,
    pubmedId: null,
    license:
      Array.isArray(item.license) && item.license.length > 0
        ? item.license[0]?.URL || item.license[0]?.['content-version'] || null
        : null,
    openAccess: false, // CrossRef does not assert OA; Unpaywall does.
    pdfExternalUrl: null,
    citationCount:
      typeof item['is-referenced-by-count'] === 'number' ? item['is-referenced-by-count'] : 0,
    topics: Array.isArray(item.subject) ? item.subject.slice(0, 5) : [],
    source: SOURCE,
  }
}

async function search(query, opts = {}) {
  if (!rateBucket.take(SOURCE)) {
    return { source: SOURCE, results: [], throttled: true }
  }
  const limit = Math.min(50, Math.max(1, opts.limit || 20))
  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: String(limit),
  })
  const filters = []
  if (opts.from) filters.push(`from-pub-date:${opts.from}-01-01`)
  if (opts.to) filters.push(`until-pub-date:${opts.to}-12-31`)
  if (filters.length > 0) params.set('filter', filters.join(','))
  const url = `https://${HOST}/works?${params.toString()}`
  const res = await safeFetch(url, {
    allowlist: [HOST],
    headers: { 'user-agent': _ua() },
    expect: 'json',
    timeoutMs: ADAPTER_SOFT_TIMEOUT_MS,
  })
  if (!res.ok) {
    log.warn(
      { event: 'scholar.adapter.error', source: SOURCE, error: res.error, status: res.status },
      'CrossRef search failed',
    )
    return { source: SOURCE, results: [], error: res.error || 'http_error' }
  }
  const list = Array.isArray(res.body?.message?.items) ? res.body.message.items : []
  return {
    source: SOURCE,
    results: list.map(_normalize).filter(Boolean),
  }
}

async function fetch(canonicalId) {
  if (!rateBucket.take(SOURCE)) {
    return { source: SOURCE, paper: null, throttled: true }
  }
  if (!canonicalId.startsWith('doi:')) {
    return { source: SOURCE, paper: null, error: 'unsupported_id' }
  }
  const doi = canonicalId.slice(4)
  const url = `https://${HOST}/works/${encodeURIComponent(doi)}`
  const res = await safeFetch(url, {
    allowlist: [HOST],
    headers: { 'user-agent': _ua() },
    expect: 'json',
    timeoutMs: ADAPTER_SOFT_TIMEOUT_MS,
  })
  if (!res.ok) {
    return { source: SOURCE, paper: null, error: res.error || 'http_error' }
  }
  return { source: SOURCE, paper: _normalize(res.body?.message) }
}

module.exports = { SOURCE, search, fetch, _normalize }
