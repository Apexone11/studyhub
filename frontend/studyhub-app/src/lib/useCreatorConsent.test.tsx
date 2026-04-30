import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCreatorConsent } from './useCreatorConsent'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('useCreatorConsent', () => {
  it('sends authenticated headers on the status fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: false, currentDocVersion: 'creator-v1', docVersion: null }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { result } = renderHook(() => useCreatorConsent())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/creator-audit/consent',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      }),
    )
  })

  it('sends authenticated headers when accepting consent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: false, currentDocVersion: 'creator-v1', docVersion: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, docVersion: 'creator-v1' }),
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { result } = renderHook(() => useCreatorConsent())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.confirmAccept()
    })

    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:4000/api/creator-audit/consent',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ docVersion: 'creator-v1' }),
      }),
    )
  })
})
