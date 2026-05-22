/**
 * useGeolocation.test.js — Vitest coverage for the permission-aware
 * geolocation hook (wave-12.2 school-scoped-search).
 *
 * Covers:
 *  - idle on mount (does NOT auto-request)
 *  - 'unavailable' when navigator.geolocation is missing
 *  - granted path returns coords + caches to sessionStorage
 *  - denied path surfaces 'denied' status
 *  - timeout path surfaces 'timeout' status
 *  - cached session populates coords on next mount without prompting
 *  - request() is idempotent (double-call doesn't double-prompt)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useGeolocation } from './useGeolocation'

const SESSION_KEY = 'studyhub.geolocation.session'

let originalGeolocation

function mockGeolocation(impl) {
  originalGeolocation = navigator.geolocation
  Object.defineProperty(navigator, 'geolocation', {
    value: impl,
    configurable: true,
    writable: true,
  })
}

function restoreGeolocation() {
  Object.defineProperty(navigator, 'geolocation', {
    value: originalGeolocation,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  // jsdom provides sessionStorage but we clear between tests so the
  // cache layer doesn't leak (some tests rely on no-cache mount state).
  sessionStorage.clear()
})

afterEach(() => {
  if (originalGeolocation !== undefined) {
    restoreGeolocation()
    originalGeolocation = undefined
  }
  sessionStorage.clear()
})

describe('useGeolocation', () => {
  it('starts in idle state when no cache and no auto-request', () => {
    mockGeolocation({ getCurrentPosition: vi.fn() })
    const { result } = renderHook(() => useGeolocation())
    expect(result.current.status).toBe('idle')
    expect(result.current.coords).toBeNull()
    // Did NOT call getCurrentPosition on mount
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled()
  })

  it('returns unavailable when navigator.geolocation is missing', () => {
    mockGeolocation(undefined)
    const { result } = renderHook(() => useGeolocation())
    expect(result.current.status).toBe('unavailable')
  })

  it('granted path returns coords and caches to sessionStorage', async () => {
    mockGeolocation({
      getCurrentPosition: (success) => {
        success({ coords: { latitude: 39.29, longitude: -76.61 } })
      },
    })
    const { result } = renderHook(() => useGeolocation())
    act(() => {
      result.current.request()
    })
    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(result.current.coords).toEqual({ lat: 39.29, lng: -76.61 })
    // Cached
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY))).toEqual({ lat: 39.29, lng: -76.61 })
  })

  it('denied path surfaces "denied" status', async () => {
    mockGeolocation({
      getCurrentPosition: (success, fail) => {
        fail({ code: 1, message: 'User denied' })
      },
    })
    const { result } = renderHook(() => useGeolocation())
    act(() => {
      result.current.request()
    })
    await waitFor(() => expect(result.current.status).toBe('denied'))
    expect(result.current.coords).toBeNull()
    expect(result.current.error?.code).toBe(1)
  })

  it('timeout path surfaces "timeout" status', async () => {
    mockGeolocation({
      getCurrentPosition: (success, fail) => {
        fail({ code: 3, message: 'Timeout' })
      },
    })
    const { result } = renderHook(() => useGeolocation())
    act(() => {
      result.current.request()
    })
    await waitFor(() => expect(result.current.status).toBe('timeout'))
  })

  it('cached session populates coords on next mount without prompting', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ lat: 38.9, lng: -77.0 }))
    const getCurrentPosition = vi.fn()
    mockGeolocation({ getCurrentPosition })
    const { result } = renderHook(() => useGeolocation())
    expect(result.current.status).toBe('granted')
    expect(result.current.coords).toEqual({ lat: 38.9, lng: -77.0 })
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('request() is idempotent when in-flight', async () => {
    let callCount = 0
    mockGeolocation({
      getCurrentPosition: () => {
        callCount += 1
        // Never resolve — simulates a stalled request
      },
    })
    const { result } = renderHook(() => useGeolocation())
    act(() => {
      result.current.request()
      result.current.request()
      result.current.request()
    })
    expect(callCount).toBe(1)
  })

  it('request() is a no-op when already granted with coords', async () => {
    let callCount = 0
    mockGeolocation({
      getCurrentPosition: (success) => {
        callCount += 1
        success({ coords: { latitude: 1, longitude: 2 } })
      },
    })
    const { result } = renderHook(() => useGeolocation())
    act(() => {
      result.current.request()
    })
    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(callCount).toBe(1)
    // Second call after granted should not re-fire
    act(() => {
      result.current.request()
    })
    expect(callCount).toBe(1)
  })
})
