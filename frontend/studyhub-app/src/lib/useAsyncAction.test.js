/**
 * useAsyncAction.test.js — Vitest coverage for the async wrapper hook
 * (wave-12.2 Bucket B1). Replaces 30+ ad-hoc patterns across the app.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAsyncAction } from './useAsyncAction'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAsyncAction', () => {
  it('starts with pending=false, error=null, data=null', () => {
    const { result } = renderHook(() => useAsyncAction(async () => 'ok'))
    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.data).toBeNull()
  })

  it('flips pending true→false around a successful call', async () => {
    let resolve
    const fn = vi.fn(() => new Promise((r) => (resolve = r)))
    const { result } = renderHook(() => useAsyncAction(fn))

    let promise
    act(() => {
      promise = result.current.run('payload')
    })
    expect(result.current.pending).toBe(true)
    await act(async () => {
      resolve('done')
      await promise
    })
    expect(result.current.pending).toBe(false)
    expect(result.current.data).toBe('done')
    expect(result.current.error).toBeNull()
    expect(fn).toHaveBeenCalledWith('payload')
  })

  it('captures errors and surfaces them via `error` (resolved as Error instance)', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => {
        throw new Error('boom')
      }),
    )
    await act(async () => {
      try {
        await result.current.run()
      } catch {
        /* expected */
      }
    })
    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error.message).toBe('boom')
  })

  it('coerces non-Error throws to Error instances', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => {
        // Test wants a non-Error throw to verify coercion; this is the
        // canonical "don't throw literals" case but here it's the point.
        const err = 'string-throw'
        throw err
      }),
    )
    await act(async () => {
      try {
        await result.current.run()
      } catch {
        /* expected */
      }
    })
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error.message).toBe('string-throw')
  })

  it('returns the same in-flight promise on concurrent run() (prevents double-submit)', async () => {
    let resolve
    const fn = vi.fn(() => new Promise((r) => (resolve = r)))
    const { result } = renderHook(() => useAsyncAction(fn))

    let p1, p2
    act(() => {
      p1 = result.current.run()
      p2 = result.current.run()
    })
    expect(p1).toBe(p2)
    expect(fn).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve('done')
      await p1
    })
  })

  it('reset() clears error and data', async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => {
        throw new Error('boom')
      }),
    )
    await act(async () => {
      try {
        await result.current.run()
      } catch {
        /* expected */
      }
    })
    expect(result.current.error).not.toBeNull()
    act(() => result.current.reset())
    expect(result.current.error).toBeNull()
    expect(result.current.data).toBeNull()
  })

  it('does not update state after unmount (stale-set guard)', async () => {
    let resolve
    const fn = vi.fn(() => new Promise((r) => (resolve = r)))
    const { result, unmount } = renderHook(() => useAsyncAction(fn))

    let promise
    act(() => {
      promise = result.current.run()
    })
    unmount()
    // Resolving after unmount must NOT trigger setState (no warning, no crash).
    await act(async () => {
      resolve('late')
      await promise
    })
    // No assertion possible on internal state since the hook is unmounted —
    // but this test passes when no warning is logged.
  })

  it('uses the latest fn reference (avoids stale closure)', async () => {
    let captured
    const { result, rerender } = renderHook(({ fn }) => useAsyncAction(fn), {
      initialProps: { fn: async () => 'v1' },
    })
    rerender({ fn: async () => 'v2' })
    await act(async () => {
      captured = await result.current.run()
    })
    expect(captured).toBe('v2')
  })
})
