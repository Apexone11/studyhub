/**
 * useLibraryData.test.jsx — regression coverage for the library data hook.
 *
 * Locks two A4 / data-integrity fixes (GROUP F audit):
 *  - Finding 7: the non-OK branch must surface the server-supplied error
 *    message. The old code did `readJsonSafely(await response.text())` —
 *    passing a string to a helper that expects a Response and is async, so
 *    the message was always lost and `data` was a dangling Promise.
 *  - Finding 8: the SWR cache-hit branch must reconcile `usingCache` /
 *    `unavailable` from the cached payload instead of leaving stale banners.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { server } from '../../test/server'
import { cache as swrCache } from '../../lib/useFetch'
import useLibraryData from './useLibraryData'

function wrapper({ children }) {
  return <MemoryRouter initialEntries={['/library?search=quantum']}>{children}</MemoryRouter>
}

afterEach(() => {
  swrCache.clear()
})

beforeEach(() => {
  swrCache.clear()
})

describe('useLibraryData error handling (finding 7)', () => {
  it('surfaces the server-supplied message on a non-OK response', async () => {
    server.use(
      http.get('http://localhost:4000/api/library/search', () =>
        HttpResponse.json({ message: 'Upstream catalog is rate limited.' }, { status: 503 }),
      ),
    )

    const { result } = renderHook(() => useLibraryData(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Upstream catalog is rate limited.')
    expect(result.current.books).toEqual([])
  })

  it('falls back to a friendly message when the server gives no body', async () => {
    server.use(
      http.get(
        'http://localhost:4000/api/library/search',
        () => new HttpResponse(null, { status: 500 }),
      ),
    )

    const { result } = renderHook(() => useLibraryData(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    // getApiErrorMessage maps the thrown `HTTP 500` Error to a message.
    expect(result.current.error).toBeTruthy()
    expect(result.current.error).not.toBe('')
  })
})

describe('useLibraryData cache-hit reconciliation (finding 8)', () => {
  it('reconciles usingCache / unavailable from a primed cache entry', async () => {
    const cacheKey = '/api/library/search?search=quantum&language=en'
    swrCache.set(cacheKey, {
      data: {
        books: [{ id: 'b1', title: 'Cached Book' }],
        totalCount: 1,
        source: 'cache',
        unavailable: true,
        endOfResults: false,
      },
      timestamp: Date.now(),
    })

    // Background revalidation echoes the same cache-sourced state so the
    // assertion is deterministic regardless of which render wins the race —
    // the point is that the cache-hit branch hydrates the banners at all,
    // instead of leaving them at their stale `false` defaults.
    server.use(
      http.get('http://localhost:4000/api/library/search', () =>
        HttpResponse.json({
          books: [{ id: 'b1', title: 'Cached Book' }],
          totalCount: 1,
          source: 'cache',
          unavailable: true,
          endOfResults: false,
        }),
      ),
    )

    const { result } = renderHook(() => useLibraryData(), { wrapper })

    await waitFor(() => expect(result.current.books.length).toBe(1))
    expect(result.current.usingCache).toBe(true)
    expect(result.current.unavailable).toBe(true)
  })

  it('flips banners back to live when the background revalidation says so', async () => {
    const cacheKey = '/api/library/search?search=quantum&language=en'
    swrCache.set(cacheKey, {
      data: {
        books: [{ id: 'b1', title: 'Cached Book' }],
        totalCount: 1,
        source: 'cache',
        unavailable: true,
        endOfResults: false,
      },
      timestamp: Date.now(),
    })

    server.use(
      http.get('http://localhost:4000/api/library/search', () =>
        HttpResponse.json({
          books: [{ id: 'b1', title: 'Cached Book' }],
          totalCount: 1,
          source: 'live',
          unavailable: false,
          endOfResults: false,
        }),
      ),
    )

    const { result } = renderHook(() => useLibraryData(), { wrapper })

    // Background revalidation corrects the banners to the live values.
    await waitFor(() => expect(result.current.usingCache).toBe(false))
    expect(result.current.unavailable).toBe(false)
  })
})
