import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for `gifs.service.js` — focused on the GIPHY host allowlist
 * and shape normalization. The route-layer test (`gifs.routes.test.js`)
 * mocks the service entirely; this file exercises the actual normalization
 * logic that protects the frontend from `javascript:` / `data:` /
 * attacker-controlled URLs leaking through if GIPHY's response shape ever
 * changes or the upstream is poisoned.
 *
 * Provider switched from Tenor to GIPHY 2026-05-03 (Tenor sunset). The
 * service still uses the legacy `TENOR_API_KEY` name as a fallback so the
 * tests can keep using that env var; new deployments should set
 * `GIPHY_API_KEY` instead.
 */

const originalKey = process.env.GIPHY_API_KEY
const originalLegacy = process.env.TENOR_API_KEY

beforeEach(() => {
  vi.resetModules()
  process.env.GIPHY_API_KEY = 'test-key'
  delete process.env.TENOR_API_KEY
})

afterEach(() => {
  if (originalKey === undefined) delete process.env.GIPHY_API_KEY
  else process.env.GIPHY_API_KEY = originalKey
  if (originalLegacy === undefined) delete process.env.TENOR_API_KEY
  else process.env.TENOR_API_KEY = originalLegacy
  vi.restoreAllMocks()
})

function giphyResponse(items) {
  return { ok: true, status: 200, json: async () => ({ data: items }) }
}

describe('gifs.service — GIPHY host allowlist', () => {
  it('accepts results from media.giphy.com', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      giphyResponse([
        {
          id: '1',
          title: 'OK',
          images: {
            fixed_height_small: { url: 'https://media.giphy.com/abc/tiny.gif' },
            original: { url: 'https://media.giphy.com/abc/full.gif' },
          },
        },
      ]),
    )
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    const results = await searchGifs({ query: 'cats', limit: 1 })
    expect(results).toHaveLength(1)
    expect(results[0].preview).toBe('https://media.giphy.com/abc/tiny.gif')
    expect(results[0].full).toBe('https://media.giphy.com/abc/full.gif')
    expect(results[0].title).toBe('OK')
  })

  it('accepts results from mediaN.giphy.com / i.giphy.com (mirror hosts)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      giphyResponse([
        {
          id: 'mirror1',
          title: 'mirror',
          images: {
            fixed_height_small: { url: 'https://media2.giphy.com/x/t.gif' },
            original: { url: 'https://i.giphy.com/y/full.gif' },
          },
        },
      ]),
    )
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    const results = await searchGifs({ query: 'cats' })
    expect(results).toHaveLength(1)
  })

  it('rejects javascript: and data: URLs in the upstream payload', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      giphyResponse([
        {
          id: 'evil',
          title: 'evil',
          images: {
            fixed_height_small: { url: 'javascript:alert(1)' },
            original: { url: 'data:text/html;base64,PHNjcmlwdD4=' },
          },
        },
      ]),
    )
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    const results = await searchGifs({ query: 'cats' })
    expect(results).toHaveLength(0)
  })

  it('rejects http:// (insecure) and attacker-controlled hosts', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      giphyResponse([
        {
          id: 'http',
          title: 'insecure',
          images: {
            fixed_height_small: { url: 'http://media.giphy.com/abc.gif' },
            original: { url: 'http://media.giphy.com/abc.gif' },
          },
        },
        {
          id: 'evil-host',
          title: 'attacker',
          images: {
            fixed_height_small: { url: 'https://attacker.example.com/x.gif' },
            original: { url: 'https://attacker.example.com/y.gif' },
          },
        },
      ]),
    )
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    const results = await searchGifs({ query: 'cats' })
    expect(results).toHaveLength(0)
  })

  it('throws GIF_NOT_CONFIGURED with statusCode 503 when key is missing', async () => {
    delete process.env.GIPHY_API_KEY
    delete process.env.TENOR_API_KEY
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    await expect(searchGifs({ query: 'cats' })).rejects.toMatchObject({
      code: 'GIF_NOT_CONFIGURED',
      statusCode: 503,
    })
  })

  it('falls back to legacy TENOR_API_KEY when GIPHY_API_KEY is unset (rename window)', async () => {
    delete process.env.GIPHY_API_KEY
    process.env.TENOR_API_KEY = 'legacy-key'
    globalThis.fetch = vi.fn().mockResolvedValue(giphyResponse([]))
    const { searchGifs, isTenorConfigured } = await import('../src/modules/gifs/gifs.service.js')
    expect(isTenorConfigured()).toBe(true)
    await searchGifs({ query: 'cats' })
    // The fetched URL should carry the legacy key as `api_key=`.
    const calledUrl = globalThis.fetch.mock.calls[0][0].toString()
    expect(calledUrl).toContain('api_key=legacy-key')
  })

  it('maps GIPHY 5xx responses to statusCode 502', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    })
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    await expect(searchGifs({ query: 'cats' })).rejects.toMatchObject({ statusCode: 502 })
  })

  it('maps GIPHY 4xx responses to statusCode 400', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    })
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    await expect(searchGifs({ query: 'cats' })).rejects.toMatchObject({ statusCode: 400 })
  })
})
