import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const gifsRoutePath = require.resolve('../src/modules/gifs')

/* ── Mock factory ─────────────────────────────────────────────────────── */
const mocks = vi.hoisted(() => {
  const state = { userId: 42, username: 'test_user', role: 'student', authed: true }

  return {
    state,
    auth: (req, res, next) => {
      if (!state.authed) {
        return res.status(401).json({ error: 'Unauthorized' })
      }
      req.user = { userId: state.userId, username: state.username, role: state.role }
      return next()
    },
    originAllowlist: () => (_req, _res, next) => next(),
    rateLimiters: {
      gifSearchLimiter: (_req, _res, next) => next(),
    },
    cacheControl: {
      cacheControl: () => (_req, _res, next) => next(),
    },
    gifsService: {
      isTenorConfigured: vi.fn(),
      searchGifs: vi.fn(),
      featuredGifs: vi.fn(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/middleware/originAllowlist'), mocks.originAllowlist],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/lib/cacheControl'), mocks.cacheControl],
  [require.resolve('../src/modules/gifs/gifs.service'), mocks.gifsService],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patched(requestId, parent, isMain) {
    const resolved = Module._resolveFilename(requestId, parent, isMain)
    const mocked = mockTargets.get(resolved)
    if (mocked) return mocked
    return originalModuleLoad.apply(this, arguments)
  }
  delete require.cache[gifsRoutePath]
  delete require.cache[require.resolve('../src/modules/gifs/gifs.routes')]

  const routerModule = require(gifsRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[gifsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.authed = true
  mocks.gifsService.isTenorConfigured.mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/gifs/search', () => {
  it('returns 401 when unauthenticated', async () => {
    mocks.state.authed = false
    const res = await request(app).get('/search?q=cats')
    expect(res.status).toBe(401)
    expect(mocks.gifsService.searchGifs).not.toHaveBeenCalled()
  })

  it('returns 503 with no-store cache header when Tenor key is missing', async () => {
    mocks.gifsService.isTenorConfigured.mockReturnValue(false)
    const res = await request(app).get('/search?q=cats')
    expect(res.status).toBe(503)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(mocks.gifsService.searchGifs).not.toHaveBeenCalled()
  })

  it('returns proxied results on the happy path', async () => {
    mocks.gifsService.searchGifs.mockResolvedValue([
      {
        id: 'g1',
        preview: 'https://media.tenor.com/g1.gif',
        full: 'https://media.tenor.com/g1.gif',
        title: 'Yes',
      },
    ])
    const res = await request(app).get('/search?q=yes&limit=5')
    expect(res.status).toBe(200)
    expect(res.body.results).toHaveLength(1)
    expect(res.body.results[0].id).toBe('g1')
    expect(mocks.gifsService.searchGifs).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'yes', limit: 5 }),
    )
    expect(res.headers['cache-control']).toMatch(/private/)
    expect(res.headers['cache-control']).toMatch(/max-age=60/)
  })

  it('falls through to featured GIFs when query is empty', async () => {
    mocks.gifsService.featuredGifs.mockResolvedValue([
      {
        id: 'f1',
        preview: 'https://media.tenor.com/f1.gif',
        full: 'https://media.tenor.com/f1.gif',
        title: 'Trending',
      },
    ])
    const res = await request(app).get('/search?limit=8')
    expect(res.status).toBe(200)
    expect(mocks.gifsService.featuredGifs).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 8 }),
    )
    expect(mocks.gifsService.searchGifs).not.toHaveBeenCalled()
  })

  it('returns 504 when Tenor times out (statusCode propagated from service)', async () => {
    const err = new Error('GIF search timed out.')
    err.statusCode = 504
    mocks.gifsService.searchGifs.mockRejectedValue(err)
    const res = await request(app).get('/search?q=cats')
    expect(res.status).toBe(504)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('returns 502 when upstream returns 5xx', async () => {
    const err = new Error('Tenor responded 502.')
    err.statusCode = 502
    mocks.gifsService.searchGifs.mockRejectedValue(err)
    const res = await request(app).get('/search?q=cats')
    expect(res.status).toBe(502)
  })

  it('clamps limit to 24 (max) and 1 (min)', async () => {
    mocks.gifsService.searchGifs.mockResolvedValue([])
    await request(app).get('/search?q=cats&limit=999')
    expect(mocks.gifsService.searchGifs.mock.calls[0][0].limit).toBe(24)

    await request(app).get('/search?q=cats&limit=0')
    expect(mocks.gifsService.searchGifs.mock.calls[1][0].limit).toBe(12) // default
  })

  it('rejects malformed locale and falls back to empty string', async () => {
    mocks.gifsService.searchGifs.mockResolvedValue([])
    await request(app).get('/search?q=cats&locale=<script>')
    expect(mocks.gifsService.searchGifs.mock.calls[0][0].locale).toBe('')
  })

  it('accepts well-formed locale like "en" and "en_US"', async () => {
    mocks.gifsService.searchGifs.mockResolvedValue([])
    await request(app).get('/search?q=cats&locale=en')
    expect(mocks.gifsService.searchGifs.mock.calls[0][0].locale).toBe('en')

    await request(app).get('/search?q=cats&locale=en_US')
    expect(mocks.gifsService.searchGifs.mock.calls[1][0].locale).toBe('en_US')
  })

  it('caps long queries at 100 chars', async () => {
    mocks.gifsService.searchGifs.mockResolvedValue([])
    const longQuery = 'hithere' + 'a'.repeat(500)
    await request(app).get(`/search?q=${encodeURIComponent(longQuery)}`)
    const passedQuery = mocks.gifsService.searchGifs.mock.calls[0][0].query
    expect(passedQuery.startsWith('hithere')).toBe(true)
    expect(passedQuery.length).toBeLessThanOrEqual(100)
  })
})
