import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserSearchInput from './UserSearchInput'

vi.mock('../../../config', () => ({ API: 'http://test.local' }))

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  if (vi.isFakeTimers()) {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  }
  globalThis.fetch = originalFetch
})

describe('UserSearchInput', () => {
  it('passes an AbortSignal to the user search fetch after the debounce', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })

    render(<UserSearchInput value={null} onChange={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search by name or email...'), {
      target: { value: 'ann' },
    })

    // Below the 300ms debounce — no request yet.
    expect(globalThis.fetch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users/search?q=ann'),
      expect.objectContaining({
        credentials: 'include',
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('aborts the in-flight request when a newer keystroke supersedes it', async () => {
    const signals = []
    // Never-resolving fetch so the first request stays in flight long enough
    // for the second keystroke to cancel it.
    globalThis.fetch = vi.fn((_url, opts) => {
      signals.push(opts.signal)
      return new Promise(() => {})
    })

    render(<UserSearchInput value={null} onChange={vi.fn()} />)
    const input = screen.getByPlaceholderText('Search by name or email...')

    fireEvent.change(input, { target: { value: 'an' } })
    vi.advanceTimersByTime(300)
    expect(signals).toHaveLength(1)
    expect(signals[0].aborted).toBe(false)

    // A second keystroke must abort the first in-flight request.
    fireEvent.change(input, { target: { value: 'ann' } })
    vi.advanceTimersByTime(300)

    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
  })

  it('aborts the outstanding request on unmount without surfacing an error', async () => {
    let capturedSignal = null
    globalThis.fetch = vi.fn((_url, opts) => {
      capturedSignal = opts.signal
      return new Promise(() => {})
    })

    const { unmount } = render(<UserSearchInput value={null} onChange={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search by name or email...'), {
      target: { value: 'ann' },
    })
    vi.advanceTimersByTime(300)
    expect(capturedSignal.aborted).toBe(false)

    unmount()
    expect(capturedSignal.aborted).toBe(true)
  })

  it('renders matching users returned by the backend', async () => {
    // Real timers here so testing-library's waitFor polling can advance while
    // the 300ms debounce + fetch microtasks settle.
    vi.useRealTimers()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1,
          username: 'annie',
          displayName: 'Annie A',
          email: 'annie@test.local',
          role: 'student',
        },
      ],
    })

    render(<UserSearchInput value={null} onChange={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search by name or email...'), {
      target: { value: 'annie' },
    })

    await waitFor(() => {
      expect(screen.getByText('Annie A')).toBeInTheDocument()
    })
  })
})
