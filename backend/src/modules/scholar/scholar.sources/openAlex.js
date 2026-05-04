/**
 * openAlex.js — Adapter for the OpenAlex API.
 *
 * Docs: https://docs.openalex.org/
 * NOTE: Polite-pool was removed Feb 13 2026 (L1-CRIT-1). New deployments
 * MUST send `?api_key=<OPENALEX_API_KEY>` for sustained use.
 */

const { safeFetch } = require('../../../lib/safeFetch')
const log = require('../../../lib/logger')
const rateBucket = require('../rateBucket')
const { HOSTS, ADAPTER_SOFT_TIMEOUT_MS } = require('../scholar.constants')

const SOURCE = 'openAlex'
const HOST = HOSTS.openAlex

function _normalize(p) {
  if (!p || typeof p !== 'object') return null
  const doi = (p.doi || '').replace(/^https?:\/\/doi\.org\//i, '') || null
  const oaId = p.id ? p.id.replace(/^https?:\/\/openalex\.org\//i, '') : null
  // Copilot fix: OpenAlex Work IDs are `W` + digits (e.g., W4231234567),
  // NOT 32-64 hex. The earlier `ss:` reuse failed CANONICAL_ID_RE for
  // every OpenAlex-only record. Use the dedicated `oa:` namespace.
  const id = doi ? `doi:${doi.toLowerCase()}` : oaId ? `oa:${oaId}` : null
  if (!id) return null

  const authorships = Array.isArray(p.authorships) ? p.authorships : []
  const license = p.primary_location?.license || p.best_oa_location?.license || p.license || null
  const openAccess = Boolean(p.open_access?.is_oa)
  const pdfUrl = p.best_oa_location?.pdf_url || p.primary_location?.pdf_url || null

  return {
    id,
    title: p.title || p.display_name || '',
    abstract: _reconstructAbstract(p.abstract_inverted_index),
    authors: authorships.map((a) => ({
      name: a?.author?.display_name || '',
      affiliation:
        Array.isArray(a?.institutions) && a.institutions.length > 0
          ? a.institutions[0].display_name || null
          : null,
    })),
    venue: p.primary_location?.source?.display_name || p.host_venue?.display_name || null,
    publishedAt: p.publication_date || (p.publication_year ? `${p.publication_year}-01-01` : null),
    doi,
    arxivId: null,
    semanticScholarId: null,
    openAlexId: oaId,
    pubmedId: p.ids?.pmid ? String(p.ids.pmid).replace(/^https?:\/\/.*\/(pubmed|pmc)\//, '') : null,
    license,
    openAccess,
    pdfExternalUrl: pdfUrl,
    citationCount: typeof p.cited_by_count === 'number' ? p.cited_by_count : 0,
    topics: Array.isArray(p.concepts)
      ? p.concepts
          .slice(0, 5)
          .map((c) => c?.display_name || '')
          .filter(Boolean)
      : [],
    source: SOURCE,
  }
}

// OpenAlex returns abstracts as inverted indexes ({word: [positions]});
// reconstruct in O(n) on token count. Bounded to 4000 chars defensively.
function _reconstructAbstract(idx) {
  if (!idx || typeof idx !== 'object') return null
  const positions = []
  for (const word of Object.keys(idx)) {
    const pos = idx[word]
    if (!Array.isArray(pos)) continue
    for (const p of pos) {
      if (typeof p === 'number' && p >= 0 && p < 10000) {
        positions[p] = word
      }
    }
  }
  const text = positions.filter(Boolean).join(' ')
  return text.length > 4000 ? text.slice(0, 4000) : text || null
}

function _withApiKey(params) {
  const key = process.env.OPENALEX_API_KEY
  if (key) params.set('api_key', key)
  return params
}

async function search(query, opts = {}) {
  if (!rateBucket.take(SOURCE)) {
    return { source: SOURCE, results: [], throttled: true }
  }
  const limit = Math.min(50, Math.max(1, opts.limit || 20))
  const params = new URLSearchParams({
    search: query,
    'per-page': String(limit),
  })
  if (opts.from) params.set('filter', `from_publication_date:${opts.from}-01-01`)
  if (opts.to) {
    const existing = params.get('filter') || ''
    const range = `to_publication_date:${opts.to}-12-31`
    params.set('filter', existing ? `${existing},${range}` : range)
  }
  _withApiKey(params)
  const url = `https://${HOST}/works?${params.toString()}`
  const res = await safeFetch(url, {
    allowlist: [HOST],
    expect: 'json',
    timeoutMs: ADAPTER_SOFT_TIMEOUT_MS,
  })
  if (!res.ok) {
    log.warn(
      { event: 'scholar.adapter.error', source: SOURCE, error: res.error, status: res.status },
      'OpenAlex search failed',
    )
    return { source: SOURCE, results: [], error: res.error || 'http_error' }
  }
  const list = Array.isArray(res.body?.results) ? res.body.results : []
  return {
    source: SOURCE,
    results: list.map(_normalize).filter(Boolean),
  }
}

async function fetch(canonicalId) {
  if (!rateBucket.take(SOURCE)) {
    return { source: SOURCE, paper: null, throttled: true }
  }
  let lookupPath = ''
  if (canonicalId.startsWith('doi:')) {
    lookupPath = `doi:${canonicalId.slice(4)}`
  } else if (canonicalId.startsWith('oa:')) {
    // OpenAlex Work IDs start with `W` + digits. New canonical namespace
    // per Copilot fix; replaces the prior `ss:` reuse which collided
    // with the Semantic Scholar id space.
    lookupPath = canonicalId.slice(3)
  } else if (canonicalId.startsWith('ss:')) {
    // Backward-compat for any rows persisted under the old namespace
    // before the fix landed. New rows use `oa:`.
    lookupPath = canonicalId.slice(3)
  } else {
    return { source: SOURCE, paper: null, error: 'unsupported_id' }
  }
  const params = new URLSearchParams()
  _withApiKey(params)
  const url = `https://${HOST}/works/${encodeURIComponent(lookupPath)}${params.toString() ? `?${params.toString()}` : ''}`
  const res = await safeFetch(url, {
    allowlist: [HOST],
    expect: 'json',
    timeoutMs: ADAPTER_SOFT_TIMEOUT_MS,
  })
  if (!res.ok) {
    return { source: SOURCE, paper: null, error: res.error || 'http_error' }
  }
  return { source: SOURCE, paper: _normalize(res.body) }
}

module.exports = { SOURCE, search, fetch, _normalize, _reconstructAbstract }
