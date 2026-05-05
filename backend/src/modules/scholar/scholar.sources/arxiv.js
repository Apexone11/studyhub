/**
 * arxiv.js — Adapter for the arXiv API (Atom XML).
 *
 * Docs: https://info.arxiv.org/help/api/index.html
 * Per arXiv ToS: max 1 request every 3 seconds. Bucket enforces.
 *
 * The arXiv API speaks Atom 1.0, not JSON. We do a minimal hand-rolled
 * parse: regex-extract <entry>...</entry> blocks and pull a small
 * fixed set of tags. No external XML lib (CLAUDE.md A1 — no extra deps).
 */

const { safeFetch } = require('../../../lib/safeFetch')
const log = require('../../../lib/logger')
const rateBucket = require('../rateBucket')
const { logAdapterError } = require('../_adapterLogger')
const { HOSTS, ADAPTER_SOFT_TIMEOUT_MS, ARXIV_RE } = require('../scholar.constants')

const SOURCE = 'arxiv'
const HOST = HOSTS.arxiv

function _decodeXml(s) {
  if (!s || typeof s !== 'string') return ''
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function _tag(block, name) {
  // Captures innerText of the FIRST <name>...</name>. Self-closing → ''.
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')
  const m = block.match(re)
  return m ? _decodeXml(m[1].trim()) : ''
}

function _tagAll(block, name) {
  const out = []
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'gi')
  let m
  while ((m = re.exec(block)) !== null) {
    out.push(_decodeXml(m[1].trim()))
  }
  return out
}

function _parseEntry(block) {
  // arXiv entry id looks like http://arxiv.org/abs/2401.12345v1
  const idText = _tag(block, 'id')
  const arxivMatch = idText.match(/abs\/([0-9]{4}\.[0-9]{4,5}(v\d+)?)/i)
  if (!arxivMatch) return null
  const arxivId = arxivMatch[1]
  if (!ARXIV_RE.test(arxivId)) return null

  const title = _tag(block, 'title').replace(/\s+/g, ' ').trim()
  const summary = _tag(block, 'summary')

  // <author><name>Foo Bar</name></author>
  const authorBlocks = _tagAll(block, 'author')
  const authors = authorBlocks
    .map((b) => ({ name: _tag(b, 'name') || b.replace(/<[^>]*>/g, '').trim(), affiliation: null }))
    .filter((a) => a.name)

  const published = _tag(block, 'published')
  let publishedAt = null
  if (published) {
    const d = new Date(published)
    if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString().slice(0, 10)
  }

  // Detect PDF link.
  const linkMatches = block.match(/<link\s+[^>]*\/>/gi) || []
  let pdfUrl = null
  for (const link of linkMatches) {
    if (/title="pdf"/i.test(link) || /type="application\/pdf"/i.test(link)) {
      const hrefMatch = link.match(/href="([^"]+)"/i)
      if (hrefMatch) pdfUrl = hrefMatch[1]
      break
    }
  }
  // arXiv DOIs sometimes come on the entry; safer to omit unless explicit.
  const doiMatch = block.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i)
  const doi = doiMatch ? _decodeXml(doiMatch[1].trim()).toLowerCase() : null

  const id = doi ? `doi:${doi}` : `arxiv:${arxivId}`
  return {
    id,
    title,
    abstract: summary || null,
    authors,
    venue: 'arXiv',
    publishedAt,
    doi,
    arxivId,
    semanticScholarId: null,
    openAlexId: null,
    pubmedId: null,
    license: 'arXiv', // Most arXiv content is "arXiv perpetual nonexclusive"; not OA per our license gate
    openAccess: Boolean(pdfUrl), // Free to download; license gate later may still reject cache
    pdfExternalUrl: pdfUrl,
    citationCount: 0,
    topics: [],
    source: SOURCE,
  }
}

async function search(query, opts = {}) {
  try {
    if (!rateBucket.take(SOURCE)) {
      return { source: SOURCE, results: [], throttled: true }
    }
    const limit = Math.min(50, Math.max(1, opts.limit || 20))
    const params = new URLSearchParams({
      search_query: `all:${query}`,
      max_results: String(limit),
      sortBy: 'relevance',
      sortOrder: 'descending',
    })
    const url = `https://${HOST}/api/query?${params.toString()}`
    const res = await safeFetch(url, {
      allowlist: [HOST],
      expect: 'text',
      timeoutMs: ADAPTER_SOFT_TIMEOUT_MS,
      maxBytes: 5 * 1024 * 1024, // arXiv responses can be large
    })
    if (!res.ok) {
      logAdapterError({
        source: SOURCE,
        error: res.error,
        status: res.status,
        message: 'arXiv search failed',
      })
      return { source: SOURCE, results: [], error: res.error || 'http_error' }
    }
    const xml = String(res.body || '')
    const entries = []
    const re = /<entry\b[\s\S]*?<\/entry>/gi
    let m
    while ((m = re.exec(xml)) !== null) {
      const parsed = _parseEntry(m[0])
      if (parsed) entries.push(parsed)
    }
    return { source: SOURCE, results: entries }
  } catch (err) {
    log.warn(
      { event: 'scholar.adapter.unexpected', source: SOURCE, err: err && err.message },
      'arXiv search threw unexpectedly',
    )
    return { source: SOURCE, results: [], error: 'unexpected_error' }
  }
}

async function fetch(canonicalId) {
  try {
    if (!rateBucket.take(SOURCE)) {
      return { source: SOURCE, paper: null, throttled: true }
    }
    if (!canonicalId.startsWith('arxiv:')) {
      return { source: SOURCE, paper: null, error: 'unsupported_id' }
    }
    const arxivId = canonicalId.slice(6)
    if (!ARXIV_RE.test(arxivId)) {
      return { source: SOURCE, paper: null, error: 'invalid_arxiv_id' }
    }
    const params = new URLSearchParams({
      id_list: arxivId,
      max_results: '1',
    })
    const url = `https://${HOST}/api/query?${params.toString()}`
    const res = await safeFetch(url, {
      allowlist: [HOST],
      expect: 'text',
      timeoutMs: ADAPTER_SOFT_TIMEOUT_MS,
      maxBytes: 1 * 1024 * 1024,
    })
    if (!res.ok) {
      logAdapterError({
        source: SOURCE,
        error: res.error,
        status: res.status,
        message: 'arXiv fetch failed',
      })
      return { source: SOURCE, paper: null, error: res.error || 'http_error' }
    }
    const xml = String(res.body || '')
    const m = xml.match(/<entry\b[\s\S]*?<\/entry>/i)
    if (!m) return { source: SOURCE, paper: null, error: 'not_found' }
    return { source: SOURCE, paper: _parseEntry(m[0]) }
  } catch (err) {
    log.warn(
      { event: 'scholar.adapter.unexpected', source: SOURCE, err: err && err.message },
      'arXiv fetch threw unexpectedly',
    )
    return { source: SOURCE, paper: null, error: 'unexpected_error' }
  }
}

module.exports = { SOURCE, search, fetch, _parseEntry }
