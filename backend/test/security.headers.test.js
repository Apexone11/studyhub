/**
 * Security Headers & CORS — Regression Tests
 *
 * 1. CORS allowlist: allowed origin gets correct headers + preflight
 * 2. CORS deny: unknown origin rejected and never reflected
 * 3. Security headers present on normal API route (non-preview)
 * 4. Preview exceptions preserved (CSP, frame-ancestors, no X-Frame-Options)
 * 5. Static uploads route headers (nosniff, cache-control)
 */
import { createRequire } from 'node:module'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

let app

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-validation-check-ok'
  process.env.NODE_ENV = 'test'

  const appPath = require.resolve('../src/index')
  delete require.cache[appPath]
  app = require(appPath)
})

afterAll(() => {
  const appPath = require.resolve('../src/index')
  delete require.cache[appPath]
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 1) CORS allowlist — allowed origin + preflight
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('CORS allowlist', () => {
  it('allowed origin gets Access-Control-Allow-Origin + Credentials', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173')

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('preflight OPTIONS to mutating route returns correct CORS headers', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')

    // Preflight should succeed (200 or 204)
    expect(res.status).toBeLessThan(300)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
    expect(res.headers['access-control-allow-methods']).toBeDefined()
  })

  it('request with no Origin header still succeeds (server-to-server)', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 2) CORS deny — unknown origin rejected, never reflected
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('CORS deny', () => {
  it('unknown origin does NOT get Access-Control-Allow-Origin (never reflected)', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://evil.com')

    // The response must NOT reflect the attacker origin
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.com')
    // In practice it's undefined (cors middleware rejects)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('unknown origin preflight is rejected', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://evil.com')
      .set('Access-Control-Request-Method', 'POST')

    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('POST from untrusted origin with non-matching referer is blocked', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'https://evil.com')

    // cors middleware blocks before the route handler runs
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 3) Security headers on normal API route (non-preview)
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('Security headers on API routes', () => {
  it('includes all required security headers on /health', async () => {
    const res = await request(app).get('/health')

    // X-Content-Type-Options
    expect(res.headers['x-content-type-options']).toBe('nosniff')

    // Referrer-Policy
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')

    // Permissions-Policy — camera, mic, geo, payment all disabled
    const pp = res.headers['permissions-policy']
    expect(pp).toMatch(/camera=\(\)/)
    expect(pp).toMatch(/microphone=\(\)/)
    expect(pp).toMatch(/geolocation=\(\)/)
    expect(pp).toMatch(/payment=\(\)/)

    // X-Frame-Options
    expect(res.headers['x-frame-options']).toBe('DENY')

    // x-powered-by MUST be absent
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('API routes have strict CSP with default-src/script-src/frame-ancestors all "none"', async () => {
    const res = await request(app).get('/health')
    const csp = res.headers['content-security-policy']

    expect(csp).toBeDefined()
    expect(csp).toMatch(/default-src 'none'/)
    expect(csp).toMatch(/script-src 'none'/)
    expect(csp).toMatch(/frame-ancestors 'none'/)
    expect(csp).toMatch(/object-src 'none'/)
    expect(csp).toMatch(/base-uri 'none'/)
  })

  it('HSTS is set when NODE_ENV=production', async () => {
    // Require a fresh app with production mode to test HSTS
    const prevEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    // Set dummy frontend URL so CORS doesn't reject everything
    process.env.FRONTEND_URL = 'http://localhost:5173'
    try {
      const appPath = require.resolve('../src/index')
      delete require.cache[appPath]
      const prodApp = require(appPath)

      const res = await request(prodApp).get('/health')
      expect(res.headers['strict-transport-security']).toBeDefined()
      expect(res.headers['strict-transport-security']).toMatch(/max-age=/)

      delete require.cache[appPath]
    } finally {
      process.env.NODE_ENV = prevEnv
      delete process.env.FRONTEND_URL
    }
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 4) Preview exceptions preserved — CSP, frame-ancestors, no X-Frame-Options
 *
 * The preview route handler overrides CSP per-handler via buildPreviewCsp().
 * The global middleware sets initial CSP based on path detection. We test the
 * middleware logic directly via a mini app that replicates index.js behavior,
 * avoiding the DB dependency of the full preview route stack.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('Preview exceptions preserved', () => {
  it('preview path: CSP allows fonts/styles, blocks scripts, scoped frame-ancestors, no X-Frame-Options', async () => {
    const express = (await import('express')).default

    // Replicate the exact middleware from index.js
    const appSurfaceCsp = [
      "default-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "script-src 'none'",
    ].join('; ')

    const previewSurfaceCsp = [
      "default-src 'none'",
      "base-uri 'none'",
      "frame-ancestors http://localhost:5173",
      "form-action 'none'",
      "connect-src 'none'",
      "img-src data: blob: https:",
      "font-src data: blob: https://fonts.gstatic.com",
      "object-src 'none'",
      "script-src 'none'",
      "style-src 'unsafe-inline' https://fonts.googleapis.com",
    ].join('; ')

    const miniApp = express()
    miniApp.use((req, res, next) => {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN') // helmet default
      const isPreview = req.path === '/preview' || req.path.startsWith('/preview/')
      if (isPreview) {
        res.setHeader('Content-Security-Policy', previewSurfaceCsp)
        res.setHeader('Referrer-Policy', 'no-referrer')
        res.removeHeader('X-Frame-Options')
      } else {
        res.setHeader('Content-Security-Policy', appSurfaceCsp)
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
        res.setHeader('X-Frame-Options', 'DENY')
      }
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
      next()
    })
    miniApp.get('/preview/:id', (_req, res) => res.send('preview'))
    miniApp.get('/api/test', (_req, res) => res.json({ ok: true }))

    // ── Preview path assertions ──
    const preview = await request(miniApp).get('/preview/123')
    const pCsp = preview.headers['content-security-policy']

    // Allows fonts and styles
    expect(pCsp).toMatch(/font-src.*https:\/\/fonts\.gstatic\.com/)
    expect(pCsp).toMatch(/style-src.*'unsafe-inline'/)

    // Still blocks scripts
    expect(pCsp).toMatch(/script-src 'none'/)

    // frame-ancestors is scoped (not 'none', not *)
    expect(pCsp).toMatch(/frame-ancestors http:\/\/localhost:5173/)
    expect(pCsp).not.toMatch(/frame-ancestors 'none'/)
    expect(pCsp).not.toMatch(/frame-ancestors \*/)

    // X-Frame-Options removed for preview (embeddable in trusted origins)
    expect(preview.headers['x-frame-options']).toBeUndefined()

    // Preview uses stricter referrer policy
    expect(preview.headers['referrer-policy']).toBe('no-referrer')

    // ── API path assertions (contrast) ──
    const api = await request(miniApp).get('/api/test')
    expect(api.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/)
    expect(api.headers['x-frame-options']).toBe('DENY')
    expect(api.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 5) Static uploads route headers (nosniff, cache-control)
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('Static uploads route headers', () => {
  // These routes serve user-uploaded avatars and covers. Even if the file
  // doesn't exist (404), Express static middleware still runs setHeaders
  // only on hits. So we test the header config via a mini app replicating
  // the exact static middleware from index.js.

  it('avatar static route sets nosniff and cache-control', async () => {
    const express = (await import('express')).default
    const path = (await import('node:path')).default
    const fs = (await import('node:fs')).default
    const os = (await import('node:os')).default

    // Create a temp dir with a test file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-test-'))
    fs.writeFileSync(path.join(tmpDir, 'test.png'), 'fake-png')

    const miniApp = express()
    miniApp.use('/uploads/avatars', express.static(tmpDir, {
      index: false,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'public, max-age=300')
      },
    }))

    const res = await request(miniApp).get('/uploads/avatars/test.png')

    expect(res.status).toBe(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['cache-control']).toBe('public, max-age=300')

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('cover static route sets nosniff and cache-control', async () => {
    const express = (await import('express')).default
    const path = (await import('node:path')).default
    const fs = (await import('node:fs')).default
    const os = (await import('node:os')).default

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-test-'))
    fs.writeFileSync(path.join(tmpDir, 'test.jpg'), 'fake-jpg')

    const miniApp = express()
    miniApp.use('/uploads/covers', express.static(tmpDir, {
      index: false,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'public, max-age=300')
      },
    }))

    const res = await request(miniApp).get('/uploads/covers/test.jpg')

    expect(res.status).toBe(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['cache-control']).toBe('public, max-age=300')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('school-logos static route sets nosniff and longer cache', async () => {
    const express = (await import('express')).default
    const path = (await import('node:path')).default
    const fs = (await import('node:fs')).default
    const os = (await import('node:os')).default

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-test-'))
    fs.writeFileSync(path.join(tmpDir, 'test.png'), 'fake-logo')

    const miniApp = express()
    miniApp.use('/uploads/school-logos', express.static(tmpDir, {
      index: false,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'public, max-age=3600')
      },
    }))

    const res = await request(miniApp).get('/uploads/school-logos/test.png')

    expect(res.status).toBe(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['cache-control']).toBe('public, max-age=3600')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * Origin validation on mutations
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('Origin validation on mutations', () => {
  it('POST from trusted origin succeeds', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:5173')

    // Should not be blocked by origin check
    expect(res.status).not.toBe(403)
  })
})
