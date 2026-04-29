import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRolesV2FlagCache, useRolesV2Flags } from './rolesV2Flags'

const originalFetch = globalThis.fetch

beforeEach(() => {
  clearRolesV2FlagCache()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  clearRolesV2FlagCache()
})

describe('useRolesV2Flags fail-closed contract', () => {
  it('treats missing flag rows as disabled', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false, reason: 'FLAG_NOT_FOUND' }),
    })

    const { result } = renderHook(() => useRolesV2Flags())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.core).toBe(false)
    expect(result.current.oauthPicker).toBe(false)
    expect(result.current.revertWindow).toBe(false)
  })

  it('fails closed on network errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useRolesV2Flags())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.core).toBe(false)
    expect(result.current.oauthPicker).toBe(false)
    expect(result.current.revertWindow).toBe(false)
  })

  it('fails closed on malformed responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })

    const { result } = renderHook(() => useRolesV2Flags())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.core).toBe(false)
  })

  it('enables roles surfaces only on explicit enabled=true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, reason: 'ENABLED' }),
    })

    const { result } = renderHook(() => useRolesV2Flags())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.core).toBe(true)
    expect(result.current.oauthPicker).toBe(true)
    expect(result.current.revertWindow).toBe(true)
  })
})
