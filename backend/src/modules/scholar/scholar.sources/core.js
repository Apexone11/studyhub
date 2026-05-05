/**
 * core.js — Adapter stub for the CORE academic search API.
 *
 * Docs: https://core.ac.uk/services/api
 * Status: v1.5 stub. Returns `{ source, results: [], throttled: false }`
 * when CORE_API_KEY is not configured (graceful degradation per master
 * plan §18.6). Full implementation lands in Week 5 Day 4.
 *
 * Why a stub now: Week 5 Scholar v1 frontend wiring expects the search
 * fan-out shape `[{source, results, throttled}]` from every adapter so
 * the UI can render "Throttled" pills. A no-op adapter that conforms to
 * the contract keeps the frontend happy while the upstream integration
 * is still in flight.
 */

const log = require('../../../lib/logger')
const { HOSTS } = require('../scholar.constants')

const SOURCE = 'core'
const HOST = 'api.core.ac.uk'

// Reserved for future host-allowlist additions in scholar.constants.HOSTS.
void HOSTS

function _isEnabled() {
  return Boolean(process.env.CORE_API_KEY)
}

async function search(_q, _filters) {
  try {
    if (!_isEnabled()) return { source: SOURCE, results: [], throttled: false }
    // TODO(week5-day4): implement CORE search via safeFetch with HOST allowlist.
    // Return shape: { source, results: ScholarPaper[], throttled }.
    return { source: SOURCE, results: [], throttled: false }
  } catch (err) {
    log.warn(
      { event: 'scholar.adapter.unexpected', source: SOURCE, err: err && err.message },
      'CORE search threw unexpectedly',
    )
    return { source: SOURCE, results: [], error: 'unexpected_error' }
  }
}

async function fetch(_canonicalId) {
  try {
    if (!_isEnabled()) return { source: SOURCE, paper: null }
    // TODO(week5-day4): implement CORE fetch-by-doi via safeFetch.
    return { source: SOURCE, paper: null }
  } catch (err) {
    log.warn(
      { event: 'scholar.adapter.unexpected', source: SOURCE, err: err && err.message },
      'CORE fetch threw unexpectedly',
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
