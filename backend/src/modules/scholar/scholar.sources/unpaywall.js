/**
 * unpaywall.js — Adapter for the Unpaywall API.
 *
 * Docs: https://unpaywall.org/products/api
 * Polite-pool email REQUIRED — append `?email=${UNPAYWALL_EMAIL}`.
 *
 * Unpaywall is metadata-only: we use it to enrich OA-PDF links and
 * license info on results that already came back from another adapter.
 */

const { safeFetch } = require('../../../lib/safeFetch')
const log = require('../../../lib/logger')
const rateBucket = require('../rateBucket')
const { HOSTS, ADAPTER_SOFT_TIMEOUT_MS, DOI_RE } = require('../scholar.constants')

const SOURCE = 'unpaywall'
const HOST = HOSTS.unpaywall

function _email() {
  return process.env.UNPAYWALL_EMAIL || ''
}

function _normalize(p) {
  if (!p || typeof p !== 'object') return null
  const doi = (p.doi || '').toLowerCase()
  if (!doi || !DOI_RE.test(doi)) return null
  const best = p.best_oa_location || null
  return {
    doi,
    license: best?.license || null,
    openAccess: Boolean(p.is_oa),
    pdfExternalUrl: best?.url_for_pdf || best?.url || null,
    hostType: best?.host_type || null,
    publishedAt: p.published_date || null,
  }
}

/**
 * Search is not the primary use case for Unpaywall — we only call
 * `fetch(canonicalDoiId)` for enrichment. Provide a no-op search so the
 * adapter shape stays uniform.
 */
async function search(_query, _opts = {}) {
  return { source: SOURCE, results: [] }
}

async function fetch(canonicalId) {
  if (!rateBucket.take(SOURCE)) {
    return { source: SOURCE, paper: null, throttled: true }
  }
  if (!canonicalId.startsWith('doi:')) {
    return { source: SOURCE, paper: null, error: 'unsupported_id' }
  }
  const email = _email()
  if (!email) {
    // Unpaywall mandates a contact email; degrade gracefully without burning a token.
    return { source: SOURCE, paper: null, error: 'unpaywall_email_missing' }
  }
  const doi = canonicalId.slice(4)
  if (!DOI_RE.test(doi)) {
    return { source: SOURCE, paper: null, error: 'invalid_doi' }
  }
  const url = `https://${HOST}/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`
  const res = await safeFetch(url, {
    allowlist: [HOST],
    expect: 'json',
    timeoutMs: ADAPTER_SOFT_TIMEOUT_MS,
  })
  if (!res.ok) {
    log.warn(
      { event: 'scholar.adapter.error', source: SOURCE, error: res.error, status: res.status },
      'Unpaywall fetch failed',
    )
    return { source: SOURCE, paper: null, error: res.error || 'http_error' }
  }
  return { source: SOURCE, paper: _normalize(res.body) }
}

module.exports = { SOURCE, search, fetch, _normalize }
