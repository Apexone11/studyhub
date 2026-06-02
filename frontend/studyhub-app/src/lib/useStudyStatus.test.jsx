/**
 * useStudyStatus.test.jsx — regression coverage for the A4 rollback fix
 * (GROUP F audit, finding 1).
 *
 * Before the fix, a failed PUT /api/study-status/:id left the optimistic
 * status applied forever: the catch handler called loadFromServer(), which
 * early-returns the memoized _serverLoadPromise once the server state was
 * already loaded and therefore never re-fetched. These tests lock in the
 * snapshot rollback + forced re-fetch + error toast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const mockUser = { id: 7, username: 'beta_student1', role: 'student' }
vi.mock('./session-context', () => ({
  useSession: () => ({ user: mockUser }),
}))

const showToast = vi.fn()
vi.mock('./toast', () => ({
  showToast: (...args) => showToast(...args),
}))

import { useStudyStatus, clearStudyStatusCache } from './useStudyStatus'

beforeEach(() => {
  clearStudyStatusCache()
  showToast.mockClear()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useStudyStatus setStatus rollback (finding 1)', () => {
  it('rolls back to the prior status and toasts when the write fails', async () => {
    const responses = [
      // Initial loadFromServer (fetchAllStatuses) — empty server state.
      { ok: true, json: async () => ({ statuses: {} }) },
      // PUT /api/study-status/:id — server rejects the write.
      { ok: false, json: async () => ({ error: 'nope' }) },
      // Forced re-fetch (loadFromServer after _serverLoadPromise reset).
      { ok: true, json: async () => ({ statuses: {} }) },
    ]
    const fetchMock = vi.fn(() => Promise.resolve(responses.shift()))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useStudyStatus(101))

    // Let the initial server load resolve.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(result.current.studyStatus).toBeNull()

    await act(async () => {
      result.current.setStudyStatus('studying', { id: 101, title: 'Algo' })
    })

    // The optimistic value must not survive a rejected write.
    await waitFor(() => expect(result.current.studyStatus).toBeNull())
    expect(showToast).toHaveBeenCalledWith('Could not update study status.', 'error')

    // The catch must FORCE a fresh re-fetch (PUT + re-fetch GET), proving it
    // didn't just early-return the memoized load promise.
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(putCall).toBeTruthy()
    const getCallsAfterPut = fetchMock.mock.calls.filter(
      ([, init]) => !init?.method || init.method === 'GET',
    )
    expect(getCallsAfterPut.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the optimistic status when the write succeeds', async () => {
    const responses = [
      { ok: true, json: async () => ({ statuses: {} }) },
      { ok: true, json: async () => ({ ok: true }) },
    ]
    const fetchMock = vi.fn(() => Promise.resolve(responses.shift()))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useStudyStatus(202))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    await act(async () => {
      result.current.setStudyStatus('done', { id: 202, title: 'OS' })
    })

    await waitFor(() => expect(result.current.studyStatus).toBe('done'))
    expect(showToast).not.toHaveBeenCalled()
  })
})
