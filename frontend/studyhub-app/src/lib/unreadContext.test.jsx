/**
 * unreadContext.test.jsx — coverage for the shared messages-unread poller.
 *
 * Verifies the L1-2 dual-poller consolidation:
 *   - polls /api/messages/unread-total once on mount, then every 30s,
 *   - broadcasts the same `total` to every consumer (one fetch feeds many),
 *   - clears the interval on unmount,
 *   - does not poll while unauthenticated, and zeroes the badge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { UnreadProvider } from './unreadContext.jsx'
import { useUnread } from './unreadContext.js'

const mockUseSession = vi.fn(() => ({ isAuthenticated: true }))

vi.mock('./session-context', () => ({
  useSession: () => mockUseSession(),
}))

vi.mock('../pages/shared/pageUtils', () => ({
  authHeaders: () => ({ 'Content-Type': 'application/json' }),
}))

// Probe consumer — surfaces the context `total` into the DOM so the test
// can assert each consumer sees the same value.
function TotalProbe({ testId }) {
  const { total } = useUnread()
  return <div data-testid={testId}>{total}</div>
}

describe('unreadContext', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total: 3 }),
    })
    mockUseSession.mockImplementation(() => ({ isAuthenticated: true }))
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    mockUseSession.mockReset()
  })

  it('polls the unread-total endpoint once on mount', async () => {
    render(
      <UnreadProvider>
        <TotalProbe testId="probe" />
      </UnreadProvider>,
    )
    await act(async () => {})

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/messages/unread-total'),
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('polls again every 30s', async () => {
    render(
      <UnreadProvider>
        <TotalProbe testId="probe" />
      </UnreadProvider>,
    )
    await act(async () => {})
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('broadcasts the same total to multiple consumers from a single fetch', async () => {
    const view = render(
      <UnreadProvider>
        <TotalProbe testId="bell" />
        <TotalProbe testId="badge" />
      </UnreadProvider>,
    )
    await act(async () => {})

    // One fetch feeds both consumers.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(view.getByTestId('bell').textContent).toBe('3')
    expect(view.getByTestId('badge').textContent).toBe('3')
  })

  it('clears the interval on unmount (no further polls)', async () => {
    const view = render(
      <UnreadProvider>
        <TotalProbe testId="probe" />
      </UnreadProvider>,
    )
    await act(async () => {})
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    view.unmount()
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not poll while unauthenticated and reports zero', async () => {
    mockUseSession.mockImplementation(() => ({ isAuthenticated: false }))
    const view = render(
      <UnreadProvider>
        <TotalProbe testId="probe" />
      </UnreadProvider>,
    )
    await act(async () => {})

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(view.getByTestId('probe').textContent).toBe('0')
  })
})
