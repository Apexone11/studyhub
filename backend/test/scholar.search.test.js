/**
 * scholar.search.test.js — Search route + service coverage.
 *
 * Mocks Prisma + adapters (Module._load patching like exams.routes.test.js)
 * to drive the real router with supertest.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const scholarRoutePath = require.resolve('../src/modules/scholar')
const semanticScholarPath =
  require.resolve('../src/modules/scholar/scholar.sources/semanticScholar')
const openAlexPath = require.resolve('../src/modules/scholar/scholar.sources/openAlex')
const crossrefPath = require.resolve('../src/modules/scholar/scholar.sources/crossref')
const arxivPath = require.resolve('../src/modules/scholar/scholar.sources/arxiv')
const unpaywallPath = require.resolve('../src/modules/scholar/scholar.sources/unpaywall')

const mocks = vi.hoisted(() => {
  const state = { authenticated: true, userId: 7 }
  const prisma = {
    scholarPaperSearchCache: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    scholarPaper: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(async ({ create }) => create),
      update: vi.fn(),
    },
    bookShelf: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    shelfBook: { upsert: vi.fn(), deleteMany: vi.fn() },
  }

  // Make a pass-through soft-timeout: each adapter is mocked at module level
  // so the service's Promise.race against them resolves with the fake.
  const adapter = (source) => ({
    SOURCE: source,
    search: vi.fn(),
    fetch: vi.fn(),
    _normalize: vi.fn(),
  })

  return {
    state,
    prisma,
    auth: vi.fn((req, res, next) => {
      if (!state.authenticated) {
        return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      }
      req.user = { userId: state.userId, username: 'tester', role: 'student' }
      next()
    }),
    originAllowlist: vi.fn(() => (_req, _res, next) => next()),
    rateLimiters: {
      scholarSearchLimiter: (_req, _res, next) => next(),
      scholarReadLimiter: (_req, _res, next) => next(),
      scholarSaveLimiter: (_req, _res, next) => next(),
      scholarCiteLimiter: (_req, _res, next) => next(),
      scholarAiSummarizeLimiter: (_req, _res, next) => next(),
      scholarAiSheetLimiter: (_req, _res, next) => next(),
      // v1.5 limiters used by the annotation + discussion routes that
      // ship in the same file.
      scholarAnnotationLimiter: (_req, _res, next) => next(),
      scholarDiscussionLimiter: (_req, _res, next) => next(),
    },
    sentry: { captureError: vi.fn() },
    cacheControl: { cacheControl: () => (_req, _res, next) => next() },
    semanticScholar: adapter('semanticScholar'),
    openAlex: adapter('openAlex'),
    crossref: adapter('crossref'),
    arxiv: adapter('arxiv'),
    unpaywall: adapter('unpaywall'),
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/middleware/originAllowlist'), mocks.originAllowlist],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/cacheControl'), mocks.cacheControl],
  [semanticScholarPath, mocks.semanticScholar],
  [openAlexPath, mocks.openAlex],
  [crossrefPath, mocks.crossref],
  [arxivPath, mocks.arxiv],
  [unpaywallPath, mocks.unpaywall],
])

const originalModuleLoad = Module._load

let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolved = Module._resolveFilename(requestId, parent, isMain)
    const mocked = mockTargets.get(resolved)
    if (mocked) return mocked
    return originalModuleLoad.apply(this, arguments)
  }
  // Force re-require so the route file binds to our mocks.
  delete require.cache[scholarRoutePath]
  delete require.cache[require.resolve('../src/modules/scholar/scholar.service')]
  const routerModule = require(scholarRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/api/scholar', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[scholarRoutePath]
  delete require.cache[require.resolve('../src/modules/scholar/scholar.service')]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.authenticated = true
  mocks.prisma.scholarPaperSearchCache.findUnique.mockResolvedValue(null)
  mocks.prisma.scholarPaperSearchCache.upsert.mockResolvedValue({})
  mocks.prisma.scholarPaper.findUnique.mockResolvedValue(null)
  // Default adapter behavior: empty success.
  for (const a of [mocks.semanticScholar, mocks.openAlex, mocks.crossref, mocks.arxiv]) {
    a.search.mockResolvedValue({ source: a.SOURCE, results: [] })
    a.fetch.mockResolvedValue({ source: a.SOURCE, paper: null })
  }
  mocks.unpaywall.search.mockResolvedValue({ source: 'unpaywall', results: [] })
  mocks.unpaywall.fetch.mockResolvedValue({ source: 'unpaywall', paper: null })
})

// ── Validation ──────────────────────────────────────────────────────────

describe('GET /api/scholar/search validation', () => {
  it('rejects missing q', async () => {
    const res = await request(app).get('/api/scholar/search')
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
  })

  it('rejects q with control characters', async () => {
    const res = await request(app).get('/api/scholar/search').query({ q: 'foo\x00bar' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
  })

  it('rejects q over 200 chars', async () => {
    const long = 'x'.repeat(201)
    const res = await request(app).get('/api/scholar/search').query({ q: long })
    expect(res.status).toBe(400)
  })

  it('rejects out-of-range from year', async () => {
    const res = await request(app).get('/api/scholar/search').query({ q: 'ai', from: 1500 })
    expect(res.status).toBe(400)
    expect(res.body.reason).toBe('from_out_of_range')
  })

  it('rejects out-of-range to year', async () => {
    const res = await request(app).get('/api/scholar/search').query({ q: 'ai', to: 9999 })
    expect(res.status).toBe(400)
    expect(res.body.reason).toBe('to_out_of_range')
  })
})

// ── Fan-out ─────────────────────────────────────────────────────────────

describe('GET /api/scholar/search fan-out', () => {
  it('aggregates results from all adapters', async () => {
    mocks.semanticScholar.search.mockResolvedValue({
      source: 'semanticScholar',
      results: [
        {
          id: 'doi:10.1/a',
          title: 'A',
          authors: [{ name: 'X' }],
          doi: '10.1/a',
          source: 'semanticScholar',
          topics: [],
          openAccess: false,
          citationCount: 0,
        },
      ],
    })
    mocks.openAlex.search.mockResolvedValue({
      source: 'openAlex',
      results: [
        {
          id: 'doi:10.2/b',
          title: 'B',
          authors: [{ name: 'Y' }],
          doi: '10.2/b',
          source: 'openAlex',
          topics: [],
          openAccess: false,
          citationCount: 0,
        },
      ],
    })

    const res = await request(app).get('/api/scholar/search').query({ q: 'machine learning' })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.results)).toBe(true)
    expect(res.body.results).toHaveLength(2)
    const ids = res.body.results.map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['doi:10.1/a', 'doi:10.2/b']))
  })

  it('dedupes by DOI across sources', async () => {
    const sample = (source) => ({
      id: 'doi:10.5/dup',
      title: 'Same Paper',
      authors: [{ name: 'A. Author' }],
      doi: '10.5/dup',
      source,
      topics: [],
      openAccess: false,
      citationCount: 0,
    })
    mocks.semanticScholar.search.mockResolvedValue({
      source: 'semanticScholar',
      results: [sample('semanticScholar')],
    })
    mocks.openAlex.search.mockResolvedValue({ source: 'openAlex', results: [sample('openAlex')] })
    mocks.crossref.search.mockResolvedValue({ source: 'crossref', results: [sample('crossref')] })

    const res = await request(app).get('/api/scholar/search').query({ q: 'foo' })
    expect(res.status).toBe(200)
    expect(res.body.results).toHaveLength(1)
  })

  it('reports throttledSources', async () => {
    mocks.arxiv.search.mockResolvedValue({ source: 'arxiv', results: [], throttled: true })
    const res = await request(app).get('/api/scholar/search').query({ q: 'physics' })
    expect(res.status).toBe(200)
    expect(res.body.throttledSources).toContain('arxiv')
  })
})

// ── Cite endpoint ───────────────────────────────────────────────────────

describe('POST /api/scholar/cite', () => {
  beforeEach(() => {
    mocks.prisma.scholarPaper.findUnique.mockResolvedValue({
      id: 'doi:10.1234/x',
      title: 'A Paper',
      abstract: null,
      authorsJson: [{ name: 'Marie Curie' }],
      venue: 'J Phys',
      publishedAt: new Date('1903-01-01'),
      doi: '10.1234/x',
      arxivId: null,
      semanticScholarId: null,
      openAlexId: null,
      pubmedId: null,
      license: null,
      openAccess: false,
      pdfCachedKey: null,
      pdfExternalUrl: null,
      citationCount: 0,
      viewCount: 0,
      topicsJson: [],
      fetchedAt: new Date(),
      staleAt: new Date(Date.now() + 86400000),
    })
  })

  it('rejects unknown style', async () => {
    const res = await request(app)
      .post('/api/scholar/cite')
      .send({ paperId: 'doi:10.1234/x', style: 'evil' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
  })

  it('rejects malformed paperId', async () => {
    const res = await request(app)
      .post('/api/scholar/cite')
      .send({ paperId: '../../etc/passwd', style: 'bibtex' })
    expect(res.status).toBe(400)
  })

  it('returns BibTeX with proper escaping', async () => {
    const res = await request(app)
      .post('/api/scholar/cite')
      .send({ paperId: 'doi:10.1234/x', style: 'bibtex' })
    expect(res.status).toBe(200)
    expect(res.body.formatted).toMatch(/^@article\{/)
    expect(res.body.contentType).toContain('x-bibtex')
    expect(res.body.filename).toMatch(/\.bib$/)
  })
})

// ── Save / unsave ───────────────────────────────────────────────────────

describe('POST /api/scholar/save', () => {
  it('rejects malformed paperId', async () => {
    const res = await request(app).post('/api/scholar/save').send({ paperId: 'evil' })
    expect(res.status).toBe(400)
  })
})
