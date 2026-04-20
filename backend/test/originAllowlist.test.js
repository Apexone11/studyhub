/**
 * originAllowlist.test.js — Unit tests for the payments-facing Origin guard.
 *
 * Covers:
 *   - GET/HEAD/OPTIONS pass through unchanged
 *   - Missing Origin + Referer is rejected with 403 (stricter than the global
 *     CSRF guard, which bails out in that case)
 *   - Whitelisted Origin / Referer passes
 *   - Non-whitelisted Origin is rejected
 *   - Factory option `rebuildPerRequest` re-reads process.env each call
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originAllowlist = require('../src/middleware/originAllowlist')

function makeReq(overrides = {}) {
  return {
    method: 'POST',
    protocol: 'https',
    headers: {},
    get(name) {
      if (name === 'host') return 'api.studyhub.test'
      return undefined
    },
    ...overrides,
  }
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
  return res
}

describe('originAllowlist()', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('passes GET requests through without checking the Origin header', () => {
    const mw = originAllowlist()
    const req = makeReq({ method: 'GET', headers: {} })
    const res = makeRes()
    const next = vi.fn()

    mw(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(200)
  })

  it('passes HEAD and OPTIONS through without checking the Origin header', () => {
    const mw = originAllowlist()
    for (const method of ['HEAD', 'OPTIONS']) {
      const req = makeReq({ method, headers: {} })
      const res = makeRes()
      const next = vi.fn()
      mw(req, res, next)
      expect(next).toHaveBeenCalledOnce()
    }
  })

  it('rejects POSTs with neither Origin nor Referer (stricter than global CSRF)', () => {
    const mw = originAllowlist()
    const req = makeReq({ method: 'POST', headers: {} })
    const res = makeRes()
    const next = vi.fn()

    mw(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body?.error).toMatch(/origin/i)
  })

  it('allows POSTs from whitelisted dev Origin (http://localhost:5173)', () => {
    const mw = originAllowlist()
    const req = makeReq({
      method: 'POST',
      headers: { origin: 'http://localhost:5173' },
    })
    const res = makeRes()
    const next = vi.fn()

    mw(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(200)
  })

  it('allows POSTs that only provide a whitelisted Referer', () => {
    const mw = originAllowlist()
    const req = makeReq({
      method: 'POST',
      headers: { referer: 'http://localhost:5173/pricing' },
    })
    const res = makeRes()
    const next = vi.fn()

    mw(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('rejects POSTs from an unknown Origin', () => {
    const mw = originAllowlist()
    const req = makeReq({
      method: 'POST',
      headers: { origin: 'https://evil.example.com' },
    })
    const res = makeRes()
    const next = vi.fn()

    mw(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body?.error).toMatch(/not allowed/i)
  })

  it('allows same-host Origin even when not explicitly configured', () => {
    const mw = originAllowlist()
    const req = makeReq({
      method: 'POST',
      headers: { origin: 'https://api.studyhub.test' },
    })
    const res = makeRes()
    const next = vi.fn()

    mw(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('in production, honors FRONTEND_URL and FRONTEND_URL_ALT when rebuildPerRequest=true', () => {
    process.env.NODE_ENV = 'production'
    process.env.FRONTEND_URL = 'https://studyhub.example.com'
    process.env.FRONTEND_URL_ALT = 'https://alt.example.com'

    const mw = originAllowlist({ rebuildPerRequest: true })

    const goodReq = makeReq({
      method: 'POST',
      headers: { origin: 'https://studyhub.example.com' },
    })
    const goodRes = makeRes()
    const goodNext = vi.fn()
    mw(goodReq, goodRes, goodNext)
    expect(goodNext).toHaveBeenCalledOnce()

    const altReq = makeReq({
      method: 'POST',
      headers: { origin: 'https://alt.example.com' },
    })
    const altRes = makeRes()
    const altNext = vi.fn()
    mw(altReq, altRes, altNext)
    expect(altNext).toHaveBeenCalledOnce()

    const badReq = makeReq({
      method: 'POST',
      headers: { origin: 'https://evil.example.com' },
    })
    const badRes = makeRes()
    const badNext = vi.fn()
    mw(badReq, badRes, badNext)
    expect(badNext).not.toHaveBeenCalled()
    expect(badRes.statusCode).toBe(403)
  })

  it('in production, auto-derives www / non-www variant of FRONTEND_URL', () => {
    process.env.NODE_ENV = 'production'
    process.env.FRONTEND_URL = 'https://studyhub.example.com'
    delete process.env.FRONTEND_URL_ALT

    const mw = originAllowlist({ rebuildPerRequest: true })

    const wwwReq = makeReq({
      method: 'POST',
      headers: { origin: 'https://www.studyhub.example.com' },
    })
    const wwwRes = makeRes()
    const wwwNext = vi.fn()
    mw(wwwReq, wwwRes, wwwNext)
    expect(wwwNext).toHaveBeenCalledOnce()
  })

  it('treats malformed Origin headers as missing and rejects', () => {
    const mw = originAllowlist()
    const req = makeReq({
      method: 'POST',
      headers: { origin: 'not-a-valid-url' },
    })
    const res = makeRes()
    const next = vi.fn()

    mw(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })
})

describe('originAllowlist.normalizeOrigin()', () => {
  it('returns the origin for a valid URL', () => {
    expect(originAllowlist.normalizeOrigin('http://localhost:5173/foo')).toBe(
      'http://localhost:5173',
    )
  })

  it('returns null for falsy or malformed input', () => {
    expect(originAllowlist.normalizeOrigin(null)).toBeNull()
    expect(originAllowlist.normalizeOrigin('')).toBeNull()
    expect(originAllowlist.normalizeOrigin('not-a-url')).toBeNull()
  })
})
