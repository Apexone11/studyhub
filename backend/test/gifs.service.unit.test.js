import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for `gifs.service.js` — focused on the Tenor host allowlist
 * and shape normalization. The route-layer test (`gifs.routes.test.js`)
 * mocks the service entirely; this file exercises the actual normalization
 * logic that protects the frontend from `javascript:` / `data:` /
 * attacker-controlled URLs leaking through if Tenor's response shape ever
 * changes or the upstream is poisoned.
 */

const originalEnv = process.env.TENOR_API_KEY

beforeEach(() => {
  vi.resetModules()
  process.env.TENOR_API_KEY = 'test-key'
})

afterEach(() => {
  process.env.TENOR_API_KEY = originalEnv
  vi.restoreAllMocks()
})

describe('gifs.service — Tenor host allowlist', () => {
  it('accepts results from media.tenor.com', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: '1',
            content_description: 'OK',
            media_formats: {
              tinygif: { url: 'https://media.tenor.com/abc/tiny.gif' },
              gif: { url: 'https://media.tenor.com/abc/full.gif' },
            },
          },
        ],
      }),
    })
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    const results = await searchGifs({ query: 'cats', limit: 1 })
    expect(results).toHaveLength(1)
    expect(results[0].preview).toBe('https://media.tenor.com/abc/tiny.gif')
    expect(results[0].full).toBe('https://media.tenor.com/abc/full.gif')
  })

  it('accepts results from media1.tenor.com / c.tenor.com (mirror hosts)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: 'mirror1',
            media_formats: {
              tinygif: { url: 'https://media1.tenor.com/x/t.gif' },
              gif: { url: 'https://c.tenor.com/y/full.gif' },
            },
          },
        ],
      }),
    })
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    const results = await searchGifs({ query: 'cats' })
    expect(results).toHaveLength(1)
  })

  it('rejects javascript: and data: URLs in the upstream payload', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: 'evil',
            media_formats: {
              tinygif: { url: 'javascript:alert(1)' },
              gif: { url: 'data:text/html;base64,PHNjcmlwdD4=' },
            },
          },
        ],
      }),
    })
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    const results = await searchGifs({ query: 'cats' })
    expect(results).toHaveLength(0)
  })

  it('rejects http:// (insecure) and attacker-controlled hosts', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: 'http',
            media_formats: {
              tinygif: { url: 'http://media.tenor.com/abc.gif' },
              gif: { url: 'http://media.tenor.com/abc.gif' },
            },
          },
          {
            id: 'evil-host',
            media_formats: {
              tinygif: { url: 'https://attacker.example.com/x.gif' },
              gif: { url: 'https://attacker.example.com/y.gif' },
            },
          },
        ],
      }),
    })
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    const results = await searchGifs({ query: 'cats' })
    expect(results).toHaveLength(0)
  })

  it('throws GIF_NOT_CONFIGURED with statusCode 503 when key is missing', async () => {
    process.env.TENOR_API_KEY = ''
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    await expect(searchGifs({ query: 'cats' })).rejects.toMatchObject({
      code: 'GIF_NOT_CONFIGURED',
      statusCode: 503,
    })
  })

  it('maps Tenor 5xx responses to statusCode 502', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    })
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    await expect(searchGifs({ query: 'cats' })).rejects.toMatchObject({ statusCode: 502 })
  })

  it('maps Tenor 4xx responses to statusCode 400', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    })
    const { searchGifs } = await import('../src/modules/gifs/gifs.service.js')
    await expect(searchGifs({ query: 'cats' })).rejects.toMatchObject({ statusCode: 400 })
  })
})
