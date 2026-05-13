/**
 * useScholarRecentlyViewed.test.js — Local-storage-backed recently-viewed
 * Scholar papers hook.
 *
 * Hook lives at src/pages/scholar/integration/useScholarRecentlyViewed.js.
 * If the path changes the import below will throw an ESM resolution
 * error — that's intentional. Callers of this hook (ScholarPage,
 * ScholarPaperPage) would also break, so failing fast is correct.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useScholarRecentlyViewed } from '../integration/useScholarRecentlyViewed'

const STORAGE_KEY = 'studyhub.scholar.recentlyViewed'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('useScholarRecentlyViewed', () => {
  it('starts empty when localStorage has nothing', () => {
    const { result } = renderHook(() => useScholarRecentlyViewed())
    expect(result.current.items).toEqual([])
  })

  it('add() prepends a new entry to the list', () => {
    const { result } = renderHook(() => useScholarRecentlyViewed())
    act(() => {
      result.current.add({ id: 'doi:10.1/a', title: 'First' })
    })
    expect(result.current.items[0].id).toBe('doi:10.1/a')
    expect(result.current.items).toHaveLength(1)
    act(() => {
      result.current.add({ id: 'doi:10.1/b', title: 'Second' })
    })
    expect(result.current.items[0].id).toBe('doi:10.1/b')
    expect(result.current.items[1].id).toBe('doi:10.1/a')
  })

  it('add() dedupes by id and promotes the entry to the front', () => {
    const { result } = renderHook(() => useScholarRecentlyViewed())
    act(() => {
      result.current.add({ id: 'doi:10.1/a', title: 'First' })
      result.current.add({ id: 'doi:10.1/b', title: 'Second' })
      result.current.add({ id: 'doi:10.1/a', title: 'First again' })
    })
    expect(result.current.items).toHaveLength(2)
    expect(result.current.items[0].id).toBe('doi:10.1/a')
    expect(result.current.items[1].id).toBe('doi:10.1/b')
  })

  it('caps the list at 10 entries (oldest dropped)', () => {
    const { result } = renderHook(() => useScholarRecentlyViewed())
    act(() => {
      for (let i = 0; i < 15; i += 1) {
        result.current.add({ id: `doi:10.1/p${i}`, title: `Paper ${i}` })
      }
    })
    expect(result.current.items).toHaveLength(10)
    // Most-recent-first ordering: the 15th add (i=14) should be at the
    // top, the 6th add (i=5) at the bottom — 10 most-recent kept.
    expect(result.current.items[0].id).toBe('doi:10.1/p14')
    expect(result.current.items[9].id).toBe('doi:10.1/p5')
  })

  it('remove(id) drops the matching entry', () => {
    const { result } = renderHook(() => useScholarRecentlyViewed())
    act(() => {
      result.current.add({ id: 'doi:10.1/a', title: 'A' })
      result.current.add({ id: 'doi:10.1/b', title: 'B' })
    })
    act(() => {
      result.current.remove('doi:10.1/a')
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].id).toBe('doi:10.1/b')
  })

  it('clear() empties the list', () => {
    const { result } = renderHook(() => useScholarRecentlyViewed())
    act(() => {
      result.current.add({ id: 'doi:10.1/a', title: 'A' })
      result.current.add({ id: 'doi:10.1/b', title: 'B' })
    })
    act(() => {
      result.current.clear()
    })
    expect(result.current.items).toEqual([])
  })

  it('persists writes to localStorage', () => {
    const { result } = renderHook(() => useScholarRecentlyViewed())
    act(() => {
      result.current.add({ id: 'doi:10.1/a', title: 'A' })
    })
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(parsed[0].id).toBe('doi:10.1/a')
  })

  it('swallows a Safari-private-mode setItem throw without surfacing to the caller', () => {
    const origSet = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('SecurityError: storage disabled in private mode')
    }
    try {
      const { result } = renderHook(() => useScholarRecentlyViewed())
      // The hook's add() fires a CustomEvent that triggers re-read
      // from storage (which is also empty because setItem threw), so
      // the items array may end up empty — but the call itself must
      // not surface the error to the caller.
      expect(() => {
        act(() => {
          result.current.add({ id: 'doi:10.1/a', title: 'A' })
        })
      }).not.toThrow()
    } finally {
      Storage.prototype.setItem = origSet
    }
  })

  it('returns [] when localStorage holds malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json[')
    const { result } = renderHook(() => useScholarRecentlyViewed())
    expect(result.current.items).toEqual([])
  })

  it('ignores add() calls with no id', () => {
    const { result } = renderHook(() => useScholarRecentlyViewed())
    act(() => {
      result.current.add({ title: 'No ID' })
      result.current.add(null)
      result.current.add(undefined)
    })
    expect(result.current.items).toEqual([])
  })
})
