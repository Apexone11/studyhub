/**
 * pubmed.js — Adapter stub for NCBI PubMed E-utilities.
 *
 * Docs: https://www.ncbi.nlm.nih.gov/books/NBK25497/
 * Status: v1.5 stub. NCBI requires a tool name + email in every
 * request (the polite-pool contract); without `PUBMED_EMAIL` set we
 * skip outbound traffic entirely.
 *
 * Full implementation lands in Week 5 Day 4. This stub preserves the
 * search-fan-out contract `{ source, results: [], throttled: false }`.
 */

const SOURCE = 'pubmed'
const HOST = 'eutils.ncbi.nlm.nih.gov'

function _isEnabled() {
  return Boolean(process.env.PUBMED_EMAIL)
}

async function search(_q, _filters) {
  if (!_isEnabled()) return { source: SOURCE, results: [], throttled: false }
  // TODO(week5-day4): ESearch + ESummary fan-out via safeFetch.
  return { source: SOURCE, results: [], throttled: false }
}

async function fetch(_canonicalId) {
  if (!_isEnabled()) return { source: SOURCE, paper: null }
  return { source: SOURCE, paper: null }
}

module.exports = {
  SOURCE,
  HOST,
  search,
  fetch,
}
