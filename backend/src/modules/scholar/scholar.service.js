/**
 * scholar.service.js — Orchestrator for Scholar v1 search + paper detail.
 *
 * Responsibilities:
 *   - Fan out a search query to all adapters in parallel with a 3s soft
 *     timeout per adapter. Adapters that throttle return `{ throttled: true }`
 *     and we surface them via `throttledSources`.
 *   - Dedupe results by DOI (primary) and normalized title + first-author
 *     surname (secondary).
 *   - Enrich top-N results lacking an OA-PDF link via Unpaywall.
 *   - Cache search results in `ScholarPaperSearchCache` (1h TTL).
 *   - Cache paper detail in `ScholarPaper` with `staleAt` freshness.
 *   - Cache OA-PDF download to R2 (per-paper) gated on license allowlist.
 */

const crypto = require('node:crypto')
const log = require('../../lib/logger')
const prisma = require('../../lib/prisma')
const { safeFetch } = require('../../lib/safeFetch')
const r2 = require('../../lib/r2Storage')

const semanticScholar = require('./scholar.sources/semanticScholar')
const openAlex = require('./scholar.sources/openAlex')
const crossref = require('./scholar.sources/crossref')
const arxiv = require('./scholar.sources/arxiv')
const unpaywall = require('./scholar.sources/unpaywall')
const { logAdapterError } = require('./_adapterLogger')

const {
  ADAPTER_SOFT_TIMEOUT_MS,
  SEARCH_CACHE_TTL_MS,
  PAPER_DEFAULT_STALE_DAYS,
  isOpenAccessLicense,
  normalizeTitleForDedupe,
  normalizeAuthorForDedupe,
  SOURCE_TIER,
  slugifyTopic,
} = require('./scholar.constants')

const ADAPTERS = {
  semanticScholar,
  openAlex,
  crossref,
  arxiv,
  unpaywall,
}

// L1-CRIT-2: STATIC publisher allowlist for OA-PDF caching. Hoisted to
// module scope (Loop-7-HIGH-2) so future maintainers can find it next to
// other constants and we don't allocate a new array per call.
const SCHOLAR_PDF_HOST_ALLOWLIST = Object.freeze([
  'arxiv.org',
  'export.arxiv.org',
  'www.ncbi.nlm.nih.gov',
  'europepmc.org',
  'www.biorxiv.org',
  'www.medrxiv.org',
  'journals.plos.org',
  'plos.org',
  'peerj.com',
  'www.mdpi.com',
  'core.ac.uk',
  'doaj.org',
  'link.springer.com',
  'www.nature.com',
])

// ── Cache key derivation ────────────────────────────────────────────────

function _searchCacheKey(q, filters, source) {
  // Stable serialization across all filter axes — different filter sets
  // must NEVER collide on the same cache row.
  const stable = JSON.stringify({
    q: String(q || '')
      .toLowerCase()
      .trim(),
    type: filters?.type || '',
    domain: filters?.domain || '',
    from: filters?.from || '',
    to: filters?.to || '',
    limit: filters?.limit || 20,
    source: source || 'all',
    openAccess: filters?.openAccess ? 1 : 0,
    hasPdf: filters?.hasPdf ? 1 : 0,
    sources: Array.isArray(filters?.sources) ? [...filters.sources].sort().join(',') : '',
    domains: Array.isArray(filters?.domains) ? [...filters.domains].sort().join(',') : '',
    sort: filters?.sort || 'relevance',
    minCitations:
      typeof filters?.minCitations === 'number' && filters.minCitations > 0
        ? filters.minCitations
        : 0,
    author: (filters?.author || '').toLowerCase().trim(),
    venue: (filters?.venue || '').toLowerCase().trim(),
  })
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 32)
}

// ── Dedupe ──────────────────────────────────────────────────────────────

function _dedupe(papers) {
  const byDoi = new Map()
  const byTitleAuthor = new Map()
  const out = []
  for (const p of papers) {
    if (!p) continue
    if (p.doi) {
      const k = `doi:${p.doi.toLowerCase()}`
      const existing = byDoi.get(k)
      if (existing) {
        _mergeInto(existing, p)
        continue
      }
      byDoi.set(k, p)
      out.push(p)
      continue
    }
    const tk = `${normalizeTitleForDedupe(p.title)}|${normalizeAuthorForDedupe(p.authors?.[0]?.name || '')}`
    if (!tk || tk === '|') {
      out.push(p)
      continue
    }
    const existing = byTitleAuthor.get(tk)
    if (existing) {
      _mergeInto(existing, p)
      continue
    }
    byTitleAuthor.set(tk, p)
    out.push(p)
  }
  return out
}

function _mergeInto(target, candidate) {
  const tTier = SOURCE_TIER[target.source] || 0
  const cTier = SOURCE_TIER[candidate.source] || 0
  // Higher-tier source wins on metadata gaps. PDF link prefers whichever has one.
  for (const key of [
    'title',
    'abstract',
    'venue',
    'publishedAt',
    'license',
    'pubmedId',
    'openAlexId',
    'semanticScholarId',
    'arxivId',
  ]) {
    if (!target[key] && candidate[key]) target[key] = candidate[key]
    if (cTier > tTier && candidate[key]) target[key] = candidate[key]
  }
  if (!target.pdfExternalUrl && candidate.pdfExternalUrl) {
    target.pdfExternalUrl = candidate.pdfExternalUrl
    target.openAccess = target.openAccess || Boolean(candidate.openAccess)
  }
  if (
    typeof candidate.citationCount === 'number' &&
    candidate.citationCount > (target.citationCount || 0)
  ) {
    target.citationCount = candidate.citationCount
  }
  if (Array.isArray(candidate.topics) && candidate.topics.length > (target.topics?.length || 0)) {
    target.topics = candidate.topics
  }
}

// ── Unpaywall enrichment ────────────────────────────────────────────────

async function _enrichWithUnpaywall(papers, maxToEnrich = 10) {
  const candidates = []
  for (const p of papers) {
    if (candidates.length >= maxToEnrich) break
    if (!p.doi) continue
    if (p.openAccess && p.pdfExternalUrl) continue
    candidates.push(p)
  }
  if (candidates.length === 0) return papers
  const tasks = candidates.map(async (p) => {
    try {
      const r = await unpaywall.fetch(`doi:${p.doi}`)
      if (r?.paper) {
        if (r.paper.pdfExternalUrl) {
          p.pdfExternalUrl = p.pdfExternalUrl || r.paper.pdfExternalUrl
          p.openAccess = true
        }
        if (r.paper.license && !p.license) p.license = r.paper.license
      }
    } catch {
      // ignore per-paper enrichment failures
    }
  })
  await Promise.allSettled(tasks)
  return papers
}

// ── Post-fetch filtering ────────────────────────────────────────────────

// Filters that cannot be pushed down to the upstream adapters cleanly
// (every adapter has a different API contract for them). We apply them
// to the deduped + merged list so the user sees a single coherent
// response regardless of which sources contributed.
function _applyPostFetchFilters(papers, opts) {
  const { openAccess, hasPdf, domains, minCitations, author, venue } = opts || {}
  const wantDomains =
    Array.isArray(domains) && domains.length > 0
      ? new Set(domains.map((d) => slugifyTopic(d)))
      : null
  const minCit = Number.isInteger(minCitations) && minCitations > 0 ? minCitations : 0
  const authorNeedle = typeof author === 'string' && author.length > 0 ? author.toLowerCase() : null
  const venueNeedle = typeof venue === 'string' && venue.length > 0 ? venue.toLowerCase() : null

  return papers.filter((p) => {
    if (openAccess && !p.openAccess) return false
    if (hasPdf) {
      const url = p.pdfExternalUrl
      if (!url || typeof url !== 'string' || url.trim().length === 0) return false
    }
    if (minCit > 0 && (typeof p.citationCount !== 'number' || p.citationCount < minCit)) {
      return false
    }
    if (wantDomains) {
      const paperTopics = Array.isArray(p.topics) ? p.topics : []
      const haveSlugs = new Set()
      for (const t of paperTopics) {
        if (typeof t === 'string') {
          const s = slugifyTopic(t)
          if (s) haveSlugs.add(s)
        } else if (t && typeof t === 'object') {
          // Some adapters emit { name } or { displayName }.
          const candidate = t.slug || t.name || t.displayName || ''
          const s = slugifyTopic(String(candidate))
          if (s) haveSlugs.add(s)
        }
      }
      let intersects = false
      for (const want of wantDomains) {
        if (haveSlugs.has(want)) {
          intersects = true
          break
        }
      }
      if (!intersects) return false
    }
    if (authorNeedle) {
      const authors = Array.isArray(p.authors) ? p.authors : []
      const matched = authors.some((a) => {
        const name = a && typeof a === 'object' ? a.name : a
        return typeof name === 'string' && name.toLowerCase().includes(authorNeedle)
      })
      if (!matched) return false
    }
    if (venueNeedle) {
      if (typeof p.venue !== 'string' || !p.venue.toLowerCase().includes(venueNeedle)) return false
    }
    return true
  })
}

function _applySort(papers, sort) {
  if (!Array.isArray(papers) || papers.length < 2) return papers
  switch (sort) {
    case 'year-desc':
    case 'recent': {
      // Papers without a parseable date sink to the bottom; ties keep
      // the merge order (Array.prototype.sort is stable in Node 20+).
      return [...papers].sort((a, b) => _yearKey(b) - _yearKey(a))
    }
    case 'citations-desc': {
      return [...papers].sort(
        (a, b) =>
          (Number.isFinite(b?.citationCount) ? b.citationCount : 0) -
          (Number.isFinite(a?.citationCount) ? a.citationCount : 0),
      )
    }
    case 'relevance':
    default:
      return papers
  }
}

function _yearKey(p) {
  if (!p || !p.publishedAt) return Number.NEGATIVE_INFINITY
  const t = new Date(p.publishedAt).getTime()
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY
}

// ── Search fan-out ──────────────────────────────────────────────────────

// All five known search-result-emitting adapters keyed by slug. Unpaywall
// is enrichment-only and is intentionally not in this map (picking it
// alone yields zero results — see scholar.constants.js note).
const SEARCH_ADAPTERS_BY_SLUG = {
  semanticScholar,
  openAlex,
  crossref,
  arxiv,
}

async function searchPapers({
  q,
  type,
  domain,
  from,
  to,
  limit,
  cursor: _cursor,
  openAccess = false,
  hasPdf = false,
  sources = null,
  domains = null,
  sort = 'relevance',
  minCitations = 0,
  author = null,
  venue = null,
}) {
  const filters = {
    type,
    domain,
    from,
    to,
    limit,
    openAccess,
    hasPdf,
    sources,
    domains,
    sort,
    minCitations,
    author,
    venue,
  }
  const cacheKey = _searchCacheKey(q, filters, 'all')

  // Check cache.
  try {
    const cached = await prisma.scholarPaperSearchCache.findUnique({ where: { cacheKey } })
    if (cached && cached.expiresAt && cached.expiresAt.getTime() > Date.now()) {
      return cached.resultsJson
    }
  } catch (err) {
    log.warn({ event: 'scholar.search.cache_read_failed', err: err.message }, 'cache read failed')
  }

  // Restrict fan-out to the user-picked subset when present. `sources`
  // is the only filter pushed down to the adapters; the rest are
  // post-fetch so the change stays isolated and avoids per-adapter API
  // contract negotiations.
  const requestedSlugs =
    Array.isArray(sources) && sources.length > 0
      ? sources.filter((s) => s in SEARCH_ADAPTERS_BY_SLUG)
      : Object.keys(SEARCH_ADAPTERS_BY_SLUG)
  const sourceAdapters = requestedSlugs.map((slug) => SEARCH_ADAPTERS_BY_SLUG[slug])

  const tasks = sourceAdapters.map((adapter) =>
    Promise.race([
      adapter.search(q, filters),
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ source: adapter.SOURCE, results: [], error: 'soft_timeout' }),
          ADAPTER_SOFT_TIMEOUT_MS + 500,
        ),
      ),
    ]).catch((err) => ({ source: adapter.SOURCE, results: [], error: err.message })),
  )
  const settled = await Promise.allSettled(tasks)

  const merged = []
  const throttledSources = []
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue
    const v = s.value
    if (v.throttled) throttledSources.push(v.source)
    if (Array.isArray(v.results)) merged.push(...v.results)
  }

  let deduped = _dedupe(merged)
  await _enrichWithUnpaywall(deduped, 10)

  // ── Post-fetch filters (applied to the merged + deduped list) ────────
  deduped = _applyPostFetchFilters(deduped, {
    openAccess,
    hasPdf,
    domains,
    minCitations,
    author,
    venue,
  })

  // ── Sort ────────────────────────────────────────────────────────────
  deduped = _applySort(deduped, sort)

  const finalLimit = Math.min(50, Math.max(1, Number(limit) || 20))
  deduped = deduped.slice(0, finalLimit)

  const payload = {
    results: deduped,
    throttledSources,
    cursor: null, // pagination via offset is not yet implemented in v1
  }

  // Persist cache best-effort.
  try {
    const expiresAt = new Date(Date.now() + SEARCH_CACHE_TTL_MS)
    await prisma.scholarPaperSearchCache.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        source: 'all',
        resultsJson: payload,
        expiresAt,
      },
      update: {
        resultsJson: payload,
        expiresAt,
        fetchedAt: new Date(),
      },
    })
  } catch (err) {
    log.warn({ event: 'scholar.search.cache_write_failed', err: err.message }, 'cache write failed')
  }

  return payload
}

// ── Paper detail ────────────────────────────────────────────────────────

async function getPaperDetail(canonicalId) {
  // Try local cache first.
  let cached = null
  try {
    cached = await prisma.scholarPaper.findUnique({ where: { id: canonicalId } })
  } catch (err) {
    log.warn(
      { event: 'scholar.paper.cache_read_failed', err: err.message },
      'detail cache read failed',
    )
  }
  const stale = !cached || (cached.staleAt && cached.staleAt.getTime() < Date.now())
  if (cached && !stale) return _serializePaper(cached)

  // Refresh from primary adapter.
  const fresh = await _refreshPaperFromSources(canonicalId)
  if (!fresh) {
    return cached ? _serializePaper(cached) : null
  }
  // Persist refresh.
  try {
    const staleAt = new Date(Date.now() + PAPER_DEFAULT_STALE_DAYS * 24 * 60 * 60 * 1000)
    const persisted = await prisma.scholarPaper.upsert({
      where: { id: canonicalId },
      create: _toDbRow(fresh, staleAt),
      update: _toDbRow(fresh, staleAt, true),
    })
    return _serializePaper(persisted)
  } catch (err) {
    log.warn(
      { event: 'scholar.paper.cache_write_failed', err: err.message },
      'detail cache write failed',
    )
    // Fall through to in-memory result.
    return fresh
  }
}

async function _refreshPaperFromSources(canonicalId) {
  const order = canonicalId.startsWith('arxiv:')
    ? [arxiv, semanticScholar, openAlex, crossref]
    : canonicalId.startsWith('doi:')
      ? [semanticScholar, openAlex, crossref]
      : [semanticScholar]
  // Sequential by design — we want the highest-priority adapter that
  // returns a non-null paper to win, not the fastest. Each adapter's
  // `fetch()` is itself wrapped in try/catch and returns the documented
  // shape on any error, so an upstream failure cannot poison the chain.
  // The outer try here is belt-and-suspenders for the unlikely case that
  // an adapter rejects with an Error before its own catch can run.
  for (const adapter of order) {
    let r
    try {
      r = await adapter.fetch(canonicalId)
    } catch (err) {
      logAdapterError({
        source: adapter.SOURCE || 'unknown',
        error: 'unexpected_throw',
        message: err && err.message,
      })
      continue
    }
    if (r?.paper) {
      // Best-effort enrichment for OA-PDF / license.
      if (r.paper.doi) {
        try {
          const u = await unpaywall.fetch(`doi:${r.paper.doi}`)
          if (u?.paper) {
            if (u.paper.pdfExternalUrl) {
              r.paper.pdfExternalUrl = r.paper.pdfExternalUrl || u.paper.pdfExternalUrl
              r.paper.openAccess = true
            }
            if (u.paper.license && !r.paper.license) r.paper.license = u.paper.license
          }
        } catch (err) {
          logAdapterError({
            source: 'unpaywall',
            error: 'unexpected_throw',
            message: err && err.message,
          })
          // enrichment best-effort
        }
      }
      return r.paper
    }
  }
  return null
}

function _toDbRow(paper, staleAt, isUpdate = false) {
  const base = {
    title: String(paper.title || '').slice(0, 1000),
    abstract: paper.abstract ? String(paper.abstract).slice(0, 8000) : null,
    authorsJson: Array.isArray(paper.authors) ? paper.authors : [],
    venue: paper.venue ? String(paper.venue).slice(0, 500) : null,
    publishedAt: paper.publishedAt ? _safeDate(paper.publishedAt) : null,
    doi: paper.doi || null,
    arxivId: paper.arxivId || null,
    semanticScholarId: paper.semanticScholarId || null,
    openAlexId: paper.openAlexId || null,
    pubmedId: paper.pubmedId || null,
    license: paper.license || null,
    openAccess: Boolean(paper.openAccess),
    pdfExternalUrl: paper.pdfExternalUrl || null,
    citationCount: typeof paper.citationCount === 'number' ? paper.citationCount : 0,
    topicsJson: Array.isArray(paper.topics) ? paper.topics : [],
    fetchedAt: new Date(),
    staleAt,
  }
  if (isUpdate) return base
  return { id: paper.id, viewCount: 0, ...base }
}

function _safeDate(s) {
  if (s instanceof Date) return Number.isNaN(s.getTime()) ? null : s
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function _serializePaper(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    abstract: row.abstract,
    authors: row.authorsJson || [],
    venue: row.venue,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    doi: row.doi,
    arxivId: row.arxivId,
    semanticScholarId: row.semanticScholarId,
    openAlexId: row.openAlexId,
    pubmedId: row.pubmedId,
    license: row.license,
    openAccess: Boolean(row.openAccess),
    pdfCachedKey: row.pdfCachedKey || null,
    pdfExternalUrl: row.pdfExternalUrl,
    citationCount: row.citationCount || 0,
    viewCount: row.viewCount || 0,
    topics: row.topicsJson || [],
    fetchedAt: row.fetchedAt ? row.fetchedAt.toISOString() : null,
    staleAt: row.staleAt ? row.staleAt.toISOString() : null,
  }
}

// ── Citation / reference walks ──────────────────────────────────────────

async function getCitations(canonicalId, { limit = 20, offset = 0 }) {
  // Semantic Scholar exposes /paper/:id/citations and /paper/:id/references.
  // We delegate to the primary S2 adapter via a custom request shape.
  if (!canonicalId.startsWith('ss:') && !canonicalId.startsWith('doi:')) {
    return { results: [], error: 'unsupported_id' }
  }
  return _walk(canonicalId, 'citations', limit, offset)
}

async function getReferences(canonicalId, { limit = 20, offset = 0 }) {
  if (!canonicalId.startsWith('ss:') && !canonicalId.startsWith('doi:')) {
    return { results: [], error: 'unsupported_id' }
  }
  return _walk(canonicalId, 'references', limit, offset)
}

async function _walk(canonicalId, kind, limit, offset) {
  try {
    const lookupId = canonicalId.startsWith('doi:')
      ? `DOI:${canonicalId.slice(4)}`
      : canonicalId.slice(3) // ss:
    const fields = 'paperId,title,year,authors.name,externalIds'
    const url =
      `https://${require('./scholar.constants').HOSTS.semanticScholar}` +
      `/graph/v1/paper/${encodeURIComponent(lookupId)}/${kind}` +
      `?fields=${encodeURIComponent(fields)}&limit=${limit}&offset=${offset}`
    const res = await safeFetch(url, {
      allowlist: [require('./scholar.constants').HOSTS.semanticScholar],
      headers: process.env.SEMANTIC_SCHOLAR_API_KEY
        ? { 'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY }
        : {},
      expect: 'json',
      timeoutMs: ADAPTER_SOFT_TIMEOUT_MS,
    })
    if (!res.ok) {
      logAdapterError({
        source: 'semanticScholar',
        error: res.error,
        status: res.status,
        message: `${kind} walk failed`,
      })
      return { results: [], error: res.error || 'http_error' }
    }
    const list = Array.isArray(res.body?.data) ? res.body.data : []
    const pick = (entry) => (kind === 'citations' ? entry.citingPaper : entry.citedPaper)
    return {
      results: list.map((entry) => semanticScholar._normalize(pick(entry))).filter(Boolean),
      offset,
      limit,
    }
  } catch (err) {
    log.warn(
      { event: 'scholar.walk.unexpected', kind, err: err && err.message },
      `${kind} walk threw unexpectedly`,
    )
    return { results: [], error: 'unexpected_error' }
  }
}

// ── PDF cache (license-gated) ───────────────────────────────────────────

async function getOrCachePaperPdf(canonicalId, paper) {
  if (!paper) return { cached: false, reason: 'no_paper' }
  if (!paper.openAccess || !paper.pdfExternalUrl) {
    return { cached: false, reason: 'not_open_access' }
  }
  // License gate (CRITICAL — must run before any R2 write per master plan §18.8).
  if (!isOpenAccessLicense(paper.license)) {
    return { cached: false, reason: 'license_not_allowlisted', license: paper.license || null }
  }
  if (!r2.isR2Configured()) {
    return { cached: false, reason: 'r2_not_configured' }
  }

  const maxBytes = Number(process.env.SCHOLAR_PDF_MAX_BYTES_PER_PAPER) || 10 * 1024 * 1024

  // L1-CRIT-2 + Loop-7-HIGH-2: SCHOLAR_PDF_HOST_ALLOWLIST is hoisted to
  // module scope above. Never derived from upstream metadata.
  let pdfHost = ''
  try {
    pdfHost = new URL(paper.pdfExternalUrl).hostname.toLowerCase()
  } catch {
    return { cached: false, reason: 'invalid_pdf_url' }
  }
  if (!pdfHost) return { cached: false, reason: 'invalid_pdf_url' }
  if (!SCHOLAR_PDF_HOST_ALLOWLIST.includes(pdfHost)) {
    return { cached: false, reason: 'pdf_host_not_allowlisted', host: pdfHost }
  }

  const res = await safeFetch(paper.pdfExternalUrl, {
    allowlist: SCHOLAR_PDF_HOST_ALLOWLIST,
    expect: 'buffer',
    maxBytes,
    timeoutMs: 15000,
  })
  if (!res.ok) {
    return { cached: false, reason: res.error || 'pdf_fetch_failed' }
  }
  const buf = res.body
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    return { cached: false, reason: 'empty_pdf' }
  }
  // Magic-byte check — must start with %PDF.
  if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) {
    return { cached: false, reason: 'not_a_pdf' }
  }

  const key = _pdfKeyFor(canonicalId)
  try {
    await r2.uploadObject(key, buf, { contentType: 'application/pdf' })
    await prisma.scholarPaper.update({
      where: { id: canonicalId },
      data: { pdfCachedKey: key },
    })
    return { cached: true, key, bytes: buf.length }
  } catch (err) {
    log.warn(
      { event: 'scholar.pdf.cache_failed', canonicalId, err: err.message },
      'PDF cache write failed',
    )
    return { cached: false, reason: 'r2_write_failed' }
  }
}

function _pdfKeyFor(canonicalId) {
  // Path-safe representation. Always under scholar-papers/ for bucket policy clarity.
  const safe = canonicalId.replace(/[^A-Za-z0-9_.:-]+/g, '_')
  const hash = crypto.createHash('sha1').update(canonicalId).digest('hex').slice(0, 16)
  return `scholar-papers/${safe}_${hash}.pdf`
}

async function getSignedPdfUrl(canonicalId) {
  let row = null
  try {
    row = await prisma.scholarPaper.findUnique({ where: { id: canonicalId } })
  } catch {
    return { url: null, reason: 'lookup_failed' }
  }
  if (!row) return { url: null, reason: 'not_found' }
  if (!row.openAccess) return { url: null, reason: 'not_open_access' }
  if (!row.pdfCachedKey) return { url: null, reason: 'not_cached' }
  if (!r2.isR2Configured()) return { url: null, reason: 'r2_not_configured' }
  try {
    // Inline-view default. 600s = 10 min keeps the URL short-lived per
    // CLAUDE.md "R2 signed URLs default to 1h download / 10min upload TTL"
    // and the security-overview baseline. The PDF is uploaded with
    // Content-Type: application/pdf and no override on Content-Disposition,
    // so the iframe renders inline rather than triggering a download.
    const url = await r2.getSignedDownloadUrl(row.pdfCachedKey, 600)
    return { url, key: row.pdfCachedKey }
  } catch (err) {
    log.warn(
      { event: 'scholar.pdf.sign_failed', canonicalId, err: err.message },
      'PDF signed-url failed',
    )
    return { url: null, reason: 'sign_failed' }
  }
}

module.exports = {
  searchPapers,
  getPaperDetail,
  getCitations,
  getReferences,
  getOrCachePaperPdf,
  getSignedPdfUrl,
  // Test seams:
  _dedupe,
  _searchCacheKey,
  _serializePaper,
  _applyPostFetchFilters,
  _applySort,
  ADAPTERS,
}
