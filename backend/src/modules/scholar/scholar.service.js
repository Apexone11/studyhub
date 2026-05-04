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

const {
  ADAPTER_SOFT_TIMEOUT_MS,
  SEARCH_CACHE_TTL_MS,
  PAPER_DEFAULT_STALE_DAYS,
  isOpenAccessLicense,
  normalizeTitleForDedupe,
  normalizeAuthorForDedupe,
  SOURCE_TIER,
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

// ── Search fan-out ──────────────────────────────────────────────────────

async function searchPapers({ q, type, domain, from, to, limit, cursor: _cursor }) {
  const filters = { type, domain, from, to, limit }
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

  // Fan out — Unpaywall is enrichment-only, not a search source.
  const sourceAdapters = [semanticScholar, openAlex, crossref, arxiv]
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
  for (const adapter of order) {
    try {
      const r = await adapter.fetch(canonicalId)
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
          } catch {
            // enrichment best-effort
          }
        }
        return r.paper
      }
    } catch {
      // try next adapter
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
  if (!res.ok) return { results: [], error: res.error || 'http_error' }
  const list = Array.isArray(res.body?.data) ? res.body.data : []
  const pick = (entry) => (kind === 'citations' ? entry.citingPaper : entry.citedPaper)
  return {
    results: list.map((entry) => semanticScholar._normalize(pick(entry))).filter(Boolean),
    offset,
    limit,
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
    const url = await r2.getSignedDownloadUrl(row.pdfCachedKey, 3600)
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
  ADAPTERS,
}
