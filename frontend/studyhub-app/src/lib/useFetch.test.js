import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import useFetch, { cache, clearFetchCache } from './useFetch'

describe('useFetch cache utilities', () => {
  beforeEach(() => {
    // Clear cache before each test
    cache.clear()
  })

  describe('clearFetchCache', () => {
    it('clears all entries when called with no arguments', () => {
      // Setup: add multiple entries
      cache.set('key1', { data: 'data1', timestamp: Date.now() })
      cache.set('key2', { data: 'data2', timestamp: Date.now() })
      cache.set('key3', { data: 'data3', timestamp: Date.now() })
      expect(cache.size).toBe(3)

      // Act: clear all
      clearFetchCache()

      // Assert: all entries removed
      expect(cache.size).toBe(0)
      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(false)
      expect(cache.has('key3')).toBe(false)
    })

    it('clears only the specified key when cacheKey is provided', () => {
      // Setup: add multiple entries
      cache.set('key1', { data: 'data1', timestamp: Date.now() })
      cache.set('key2', { data: 'data2', timestamp: Date.now() })
      cache.set('key3', { data: 'data3', timestamp: Date.now() })
      expect(cache.size).toBe(3)

      // Act: clear only key2
      clearFetchCache('key2')

      // Assert: only key2 removed, others remain
      expect(cache.size).toBe(2)
      expect(cache.has('key1')).toBe(true)
      expect(cache.has('key2')).toBe(false)
      expect(cache.has('key3')).toBe(true)
    })

    it('is a no-op when called with non-existent key', () => {
      // Setup: add entries
      cache.set('existing-key', { data: 'data', timestamp: Date.now() })
      expect(cache.size).toBe(1)

      // Act: try to clear non-existent key
      clearFetchCache('non-existent-key')

      // Assert: cache unchanged
      expect(cache.size).toBe(1)
      expect(cache.has('existing-key')).toBe(true)
    })

    it('is a no-op when cache is already empty', () => {
      // Setup: ensure cache is empty
      expect(cache.size).toBe(0)

      // Act: clear empty cache
      clearFetchCache()
      clearFetchCache('any-key')

      // Assert: no errors, cache still empty
      expect(cache.size).toBe(0)
    })
  })

  describe('cache Map structure', () => {
    it('stores data and timestamp in cache entries', () => {
      // Setup: create a cache entry
      const testData = { id: 123, name: 'test' }
      const testTimestamp = Date.now()
      cache.set('test-key', { data: testData, timestamp: testTimestamp })

      // Act: retrieve from cache
      const entry = cache.get('test-key')

      // Assert: structure is correct
      expect(entry).toBeDefined()
      expect(entry.data).toEqual(testData)
      expect(entry.timestamp).toBe(testTimestamp)
    })

    it('cache entries can be retrieved after being set', () => {
      // Setup: add multiple entries with different data shapes
      const entry1 = { data: null, timestamp: 1000 }
      const entry2 = { data: { items: [1, 2, 3] }, timestamp: 2000 }
      const entry3 = { data: 'string-data', timestamp: 3000 }

      cache.set('key1', entry1)
      cache.set('key2', entry2)
      cache.set('key3', entry3)

      // Act & Assert: retrieve each entry
      expect(cache.get('key1')).toEqual(entry1)
      expect(cache.get('key2')).toEqual(entry2)
      expect(cache.get('key3')).toEqual(entry3)
    })

    it('cache size reflects number of entries', () => {
      expect(cache.size).toBe(0)

      cache.set('key1', { data: 'a', timestamp: 1000 })
      expect(cache.size).toBe(1)

      cache.set('key2', { data: 'b', timestamp: 2000 })
      expect(cache.size).toBe(2)

      cache.set('key3', { data: 'c', timestamp: 3000 })
      expect(cache.size).toBe(3)

      cache.delete('key1')
      expect(cache.size).toBe(2)
    })

    it('allows custom cache keys to distinguish entries', () => {
      // Setup: same path with different custom cache keys
      const sameData = { id: 1 }
      const timestamp = Date.now()

      cache.set('/api/users', { data: sameData, timestamp })
      cache.set('/api/users-custom-1', { data: { id: 2 }, timestamp })
      cache.set('/api/users-custom-2', { data: { id: 3 }, timestamp })

      // Act & Assert: each key retrieves its own data
      expect(cache.get('/api/users').data.id).toBe(1)
      expect(cache.get('/api/users-custom-1').data.id).toBe(2)
      expect(cache.get('/api/users-custom-2').data.id).toBe(3)
    })
  })

  describe('cache edge cases', () => {
    it('overwrites existing cache entries when set with same key', () => {
      // Setup: initial entry
      cache.set('key', { data: 'old-data', timestamp: 1000 })
      expect(cache.get('key').data).toBe('old-data')

      // Act: overwrite with new data
      cache.set('key', { data: 'new-data', timestamp: 2000 })

      // Assert: old data replaced
      expect(cache.get('key').data).toBe('new-data')
      expect(cache.get('key').timestamp).toBe(2000)
    })

    it('handles cache entries with null data', () => {
      const timestamp = Date.now()
      cache.set('null-key', { data: null, timestamp })

      const entry = cache.get('null-key')
      expect(entry.data).toBeNull()
      expect(entry.timestamp).toBe(timestamp)
    })

    it('handles cache entries with undefined data', () => {
      const timestamp = Date.now()
      cache.set('undefined-key', { data: undefined, timestamp })

      const entry = cache.get('undefined-key')
      expect(entry.data).toBeUndefined()
      expect(entry.timestamp).toBe(timestamp)
    })
  })
})

describe('useFetch focus revalidation', () => {
  let fetchSpy

  beforeEach(() => {
    cache.clear()
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      json: async () => ({ value: 1 }),
      text: async () => '',
    }))
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  async function waitForInitialFetch() {
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
  }

  it('refetches on window focus when swr > 0', async () => {
    const { unmount } = renderHook(() => useFetch('/api/focus-swr-test', { swr: 60_000 }))
    await waitForInitialFetch()

    // Advance wall-clock past the focus throttle so the hook doesn't skip.
    const realNow = Date.now
    vi.spyOn(Date, 'now').mockReturnValue(realNow() + 60_000)

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    Date.now.mockRestore()
    unmount()
  })

  it('does NOT refetch on focus when swr = 0 (default)', async () => {
    const { unmount } = renderHook(() => useFetch('/api/focus-no-swr-test'))
    await waitForInitialFetch()

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    // Give any microtasks a chance to flush; still should be exactly 1.
    await new Promise((r) => setTimeout(r, 30))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('refetches on focus when revalidateOnFocus=true is explicitly set', async () => {
    const { unmount } = renderHook(() =>
      useFetch('/api/focus-explicit-test', { revalidateOnFocus: true }),
    )
    await waitForInitialFetch()

    const realNow = Date.now
    vi.spyOn(Date, 'now').mockReturnValue(realNow() + 60_000)

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    Date.now.mockRestore()
    unmount()
  })

  it('throttles repeated focus events to avoid hammering the backend', async () => {
    const { unmount } = renderHook(() => useFetch('/api/focus-throttle-test', { swr: 60_000 }))
    await waitForInitialFetch()

    // Three focus events in quick succession (same throttle window) should
    // produce at most one additional fetch, not three.
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('focus'))
    })
    await new Promise((r) => setTimeout(r, 30))

    // Initial + one throttled refetch.
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(2)
    unmount()
  })
})
