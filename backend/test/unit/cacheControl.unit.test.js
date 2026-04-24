/**
 * cacheControl.unit.test.js
 *
 * Enforces that the cacheControl middleware never emits a public
 * Cache-Control header without a matching Vary: Origin. The Vary header
 * is what prevents a shared cache (Cloudflare edge, Railway proxy,
 * browser HTTP cache) from serving a response meant for one origin to
 * a request from another, which would break credentialed CORS requests
 * and surface in the frontend as `TypeError: Failed to fetch`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const cacheControlPath = '../../src/lib/cacheControl.js'

async function loadFresh() {
  vi.resetModules()
  return await import(cacheControlPath)
}

function buildApp(attach) {
  const app = express()
  attach(app)
  return app
}

describe('cacheControl middleware', () => {
  afterEach(() => {
    vi.resetModules()
  })

  describe('Cache-Control header', () => {
    it('sets public + max-age when options.public is true', async () => {
      const { cacheControl } = await loadFresh()
      const app = buildApp((a) => {
        a.get('/t', cacheControl(600, { public: true }), (_req, res) => res.json({ ok: true }))
      })

      const res = await request(app).get('/t')
      expect(res.status).toBe(200)
      expect(res.headers['cache-control']).toBe('public, max-age=600')
    })

    it('sets private + max-age when options.public is falsy', async () => {
      const { cacheControl } = await loadFresh()
      const app = buildApp((a) => {
        a.get('/t', cacheControl(60), (_req, res) => res.json({ ok: true }))
      })

      const res = await request(app).get('/t')
      expect(res.headers['cache-control']).toBe('private, max-age=60')
    })

    it('appends stale-while-revalidate when provided', async () => {
      const { cacheControl } = await loadFresh()
      const app = buildApp((a) => {
        a.get('/t', cacheControl(300, { public: true, staleWhileRevalidate: 900 }), (_req, res) =>
          res.json({ ok: true }),
        )
      })

      const res = await request(app).get('/t')
      expect(res.headers['cache-control']).toBe('public, max-age=300, stale-while-revalidate=900')
    })
  })

  describe('Vary header (the production bug fix)', () => {
    it('sets Vary: Origin on public responses (and omits Cookie/Authorization)', async () => {
      const { cacheControl } = await loadFresh()
      const app = buildApp((a) => {
        a.get('/t', cacheControl(600, { public: true }), (_req, res) => res.json({ ok: true }))
      })

      const res = await request(app).get('/t')
      const vary = res.headers.vary
      expect(vary).toBeDefined()
      expect(vary).toMatch(/Origin/)
      // Public responses intentionally OMIT Cookie/Authorization so shared
      // caches can actually share the entry across users.
      expect(vary).not.toMatch(/Cookie/)
      expect(vary).not.toMatch(/Authorization/)
    })

    it('sets Vary: Origin, Cookie, Authorization on private responses', async () => {
      const { cacheControl } = await loadFresh()
      const app = buildApp((a) => {
        a.get('/t', cacheControl(60), (_req, res) => res.json({ ok: true }))
      })

      const res = await request(app).get('/t')
      const vary = res.headers.vary
      expect(vary).toMatch(/Origin/)
      expect(vary).toMatch(/Cookie/)
      expect(vary).toMatch(/Authorization/)
    })

    it('varyByAuth=true forces Cookie/Authorization into Vary on public responses', async () => {
      const { cacheControl } = await loadFresh()
      const app = buildApp((a) => {
        a.get('/t', cacheControl(600, { public: true, varyByAuth: true }), (_req, res) =>
          res.json({ ok: true }),
        )
      })

      const res = await request(app).get('/t')
      const vary = res.headers.vary
      expect(vary).toMatch(/Origin/)
      expect(vary).toMatch(/Cookie/)
      expect(vary).toMatch(/Authorization/)
    })

    it('does not clobber an existing Vary header set upstream', async () => {
      const { cacheControl } = await loadFresh()
      const app = buildApp((a) => {
        a.get(
          '/t',
          (_req, res, next) => {
            res.set('Vary', 'Accept-Encoding')
            next()
          },
          cacheControl(60),
          (_req, res) => res.json({ ok: true }),
        )
      })

      const res = await request(app).get('/t')
      const vary = res.headers.vary
      expect(vary).toMatch(/Accept-Encoding/)
      expect(vary).toMatch(/Origin/)
      expect(vary).toMatch(/Cookie/)
      expect(vary).toMatch(/Authorization/)
    })

    it('does not duplicate values already present in Vary', async () => {
      const { cacheControl } = await loadFresh()
      const app = buildApp((a) => {
        a.get(
          '/t',
          (_req, res, next) => {
            res.set('Vary', 'Origin')
            next()
          },
          cacheControl(600, { public: true }),
          (_req, res) => res.json({ ok: true }),
        )
      })

      const res = await request(app).get('/t')
      const tokens = res.headers.vary.split(',').map((t) => t.trim())
      const originCount = tokens.filter((t) => t === 'Origin').length
      expect(originCount).toBe(1)
    })
  })

  describe('appendVary helper', () => {
    it('adds to an empty Vary header', async () => {
      const { appendVary } = await loadFresh()
      const set = {}
      const res = {
        getHeader: (key) => set[key.toLowerCase()],
        set: (key, value) => {
          set[key.toLowerCase()] = value
        },
      }
      appendVary(res, ['Origin'])
      expect(set.vary).toBe('Origin')
    })

    it('merges into an existing Vary header', async () => {
      const { appendVary } = await loadFresh()
      const set = { vary: 'Accept-Encoding' }
      const res = {
        getHeader: (key) => set[key.toLowerCase()],
        set: (key, value) => {
          set[key.toLowerCase()] = value
        },
      }
      appendVary(res, ['Origin', 'Cookie'])
      const tokens = set.vary.split(',').map((t) => t.trim())
      expect(tokens).toContain('Accept-Encoding')
      expect(tokens).toContain('Origin')
      expect(tokens).toContain('Cookie')
    })

    it('deduplicates tokens', async () => {
      const { appendVary } = await loadFresh()
      const set = { vary: 'Origin, Cookie' }
      const res = {
        getHeader: (key) => set[key.toLowerCase()],
        set: (key, value) => {
          set[key.toLowerCase()] = value
        },
      }
      appendVary(res, ['Origin', 'Authorization'])
      const tokens = set.vary.split(',').map((t) => t.trim())
      expect(tokens.filter((t) => t === 'Origin').length).toBe(1)
      expect(tokens).toContain('Authorization')
    })

    it('deduplicates case-insensitively — lowercase origin collapses with Origin', async () => {
      // Regression test: HTTP header values are case-insensitive
      // (RFC 7230 §3.2). Upstream middleware that writes `vary: origin`
      // (lowercase) must not collide with our canonical `Origin`. Before
      // this fix, the Vary header ended up with both "origin" and
      // "Origin" as distinct entries, which some proxies treat as
      // malformed.
      const { appendVary } = await loadFresh()
      const set = { vary: 'origin, cookie' }
      const res = {
        getHeader: (key) => set[key.toLowerCase()],
        set: (key, value) => {
          set[key.toLowerCase()] = value
        },
      }
      appendVary(res, ['Origin', 'Cookie', 'Authorization'])
      const tokens = set.vary.split(',').map((t) => t.trim())
      // Exactly one of each canonical Vary dimension — no case-variant
      // duplicates.
      expect(tokens.length).toBe(3)
      const normalized = tokens.map((t) => t.toLowerCase()).sort()
      expect(normalized).toEqual(['authorization', 'cookie', 'origin'])
    })

    it('preserves the upstream casing for non-canonical tokens', async () => {
      // If the caller passes a token we don't have a canonical casing
      // for, keep whatever casing they sent — only canonical tokens
      // get rewritten to the table's spelling.
      const { appendVary } = await loadFresh()
      const set = { vary: 'X-Custom-Header' }
      const res = {
        getHeader: (key) => set[key.toLowerCase()],
        set: (key, value) => {
          set[key.toLowerCase()] = value
        },
      }
      appendVary(res, ['Accept-Language'])
      const tokens = set.vary.split(',').map((t) => t.trim())
      expect(tokens).toContain('X-Custom-Header')
      expect(tokens).toContain('Accept-Language')
    })
  })
})
