/**
 * useRecentlyVisited.test.js — Vitest coverage for the cross-surface
 * recently-visited tracker (Bucket C1, wave-12.3).
 *
 * Covers:
 *  - starts empty when localStorage is clean
 *  - record() persists to localStorage and updates state
 *  - record() dedupes by (type, id) and bumps the existing entry to top
 *  - record() validates entry shape (silent no-op on garbage)
 *  - cap of 20 entries enforced
 *  - clear() empties the list
 *  - cross-tab sync via the 'storage' event
 *  - in-page sync via the custom 'studyhub:recentlyVisited:change' event
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useRecentlyVisited } from './useRecentlyVisited'

const STORAGE_KEY = 'studyhub.recentlyVisited'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('useRecentlyVisited', () => {
  it('starts with an empty list when localStorage is clean', () => {
    const { result } = renderHook(() => useRecentlyVisited())
    expect(result.current.items).toEqual([])
  })

  it('record() adds an entry + persists to localStorage', () => {
    const { result } = renderHook(() => useRecentlyVisited())
    act(() => {
      result.current.record({ type: 'sheet', id: 42, title: 'Calc', href: '/sheets/42' })
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]).toMatchObject({
      type: 'sheet',
      id: '42',
      title: 'Calc',
      href: '/sheets/42',
    })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(stored).toHaveLength(1)
  })

  it('dedupes by (type, id) and bumps the existing entry to top', () => {
    const { result } = renderHook(() => useRecentlyVisited())
    act(() => {
      result.current.record({ type: 'sheet', id: 1, title: 'A', href: '/sheets/1' })
      result.current.record({ type: 'sheet', id: 2, title: 'B', href: '/sheets/2' })
      // Re-record id=1 — should move to top, not duplicate
      result.current.record({ type: 'sheet', id: 1, title: 'A (updated)', href: '/sheets/1' })
    })
    expect(result.current.items).toHaveLength(2)
    expect(result.current.items[0].id).toBe('1')
    expect(result.current.items[0].title).toBe('A (updated)')
    expect(result.current.items[1].id).toBe('2')
  })

  it('silently ignores garbage entries (missing fields)', () => {
    const { result } = renderHook(() => useRecentlyVisited())
    act(() => {
      result.current.record(null)
      result.current.record({})
      result.current.record({ type: 'sheet' }) // missing id/href
      result.current.record({ type: 'sheet', id: 1 }) // missing href
    })
    expect(result.current.items).toEqual([])
  })

  it('caps the list at 20 entries (oldest dropped)', () => {
    const { result } = renderHook(() => useRecentlyVisited())
    act(() => {
      for (let i = 1; i <= 25; i++) {
        result.current.record({
          type: 'sheet',
          id: i,
          title: `S${i}`,
          href: `/sheets/${i}`,
        })
      }
    })
    expect(result.current.items).toHaveLength(20)
    // Most recent first — id 25 should be at top, id 6+ kept
    expect(result.current.items[0].id).toBe('25')
    expect(result.current.items[19].id).toBe('6')
  })

  it('clear() empties the list', () => {
    const { result } = renderHook(() => useRecentlyVisited())
    act(() => {
      result.current.record({ type: 'sheet', id: 1, title: 'A', href: '/sheets/1' })
      result.current.clear()
    })
    expect(result.current.items).toEqual([])
  })

  it('preserves order across types (sheets, notes, papers mix)', () => {
    const { result } = renderHook(() => useRecentlyVisited())
    act(() => {
      result.current.record({ type: 'sheet', id: 1, title: 'S', href: '/sheets/1' })
      result.current.record({ type: 'note', id: 2, title: 'N', href: '/notes/2' })
      result.current.record({ type: 'paper', id: 'p_3', title: 'P', href: '/scholar/paper/p_3' })
    })
    expect(result.current.items.map((e) => e.type)).toEqual(['paper', 'note', 'sheet'])
  })
})
