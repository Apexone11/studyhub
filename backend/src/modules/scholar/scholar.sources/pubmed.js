/**
 * pubmed.js — Adapter stub for NCBI PubMed E-utilities.
 *
 * Docs: https://www.ncbi.nlm.nih.gov/books/NBK25497/
 * Status: v1.5 stub. NCBI requires a tool name + email in every
 * request (the polite-pool contract); without `PUBMED_EMAIL` set we
 * skip outbound traffic entirely.
 *
 * The stub preserves the search-fan-out contract
 * `{ source, results: [], throttled: false }`.
 */

const log = require('../../../lib/logger')

const SOURCE = 'pubmed'
const HOST = 'eutils.ncbi.nlm.nih.gov'

function _isEnabled() {
  return Boolean(process.env.PUBMED_EMAIL)
}

async function search(_q, _filters) {
  try {
    if (!_isEnabled()) return { source: SOURCE, results: [], throttled: false }
    // Deferred to v1.5: ESearch + ESummary fan-out via safeFetch.
    return { source: SOURCE, results: [], throttled: false }
  } catch (err) {
    log.warn(
      { event: 'scholar.adapter.unexpected', source: SOURCE, err: err && err.message },
      'PubMed search threw unexpectedly',
    )
    return { source: SOURCE, results: [], error: 'unexpected_error' }
  }
}

async function fetch(_canonicalId) {
  try {
    if (!_isEnabled()) return { source: SOURCE, paper: null }
    return { source: SOURCE, paper: null }
  } catch (err) {
    log.warn(
      { event: 'scholar.adapter.unexpected', source: SOURCE, err: err && err.message },
      'PubMed fetch threw unexpectedly',
    )
    return { source: SOURCE, paper: null, error: 'unexpected_error' }
  }
}

module.exports = {
  SOURCE,
  HOST,
  search,
  fetch,
}
