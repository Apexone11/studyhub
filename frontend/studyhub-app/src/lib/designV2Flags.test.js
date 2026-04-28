/**
 * designV2Flags — fail-closed contract matrix (decision #20, 2026-04-24).
 *
 * History: Day 3 made FLAG_NOT_FOUND fail-OPEN to fix localhost DX where
 * a fresh install had zero FeatureFlag rows and every design-v2 surface
 * was invisible. Codex P1 correctly pointed out that prod/staging don't
 * run the beta seed, so a missing row in prod would silently expose
 * whatever in-flight Phase-N surface had code landed behind the gate.
 *
 * Decision #20 (CLAUDE.md §12): flag evaluation is fail-CLOSED in all
 * environments. Only an explicit `enabled: true` response enables a
 * flag. Every other signal — missing row, network error, non-200,
 * malformed JSON — disables. Provisioning happens via
 * `backend/scripts/seedFeatureFlags.js` (safe for prod, idempotent,
 * only SHIPPED flags).
 *
 * These tests lock the 5-case contract so nobody silently regresses to
 * fail-open and leaks a WIP feature to real users.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDesignV2FlagCache, useDesignV2Flags } from './designV2Flags'
import { renderHook, waitFor } from '@testing-library/react'

const originalFetch = globalThis.fetch

beforeEach(() => {
  clearDesignV2FlagCache()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  clearDesignV2FlagCache()
})

describe('useDesignV2Flags fail-closed contract (decision #20)', () => {
  it('treats FLAG_NOT_FOUND from the server as DISABLED', async () => {
    // Server says the row does not exist. Under fail-closed this is
    // DISABLED — the shipped-flags seed is how prod gets the rows it
    // needs.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false, reason: 'FLAG_NOT_FOUND' }),
    })

    const { result } = renderHook(() => useDesignV2Flags())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.phase1Dashboard).toBe(false)
    expect(result.current.upcomingExams).toBe(false)
    expect(result.current.aiCard).toBe(false)
    expect(result.current.sheetsGrid).toBe(false)
    expect(result.current.creatorAudit).toBe(false)
  })

  it('respects an explicit DISABLED response (row exists, enabled=false)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false, reason: 'DISABLED' }),
    })

    const { result } = renderHook(() => useDesignV2Flags())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.upcomingExams).toBe(false)
  })

  it('fails CLOSED on a network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useDesignV2Flags())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.upcomingExams).toBe(false)
  })

  it('fails CLOSED on a non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    })

    const { result } = renderHook(() => useDesignV2Flags())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.upcomingExams).toBe(false)
  })

  it('respects enabled=true (the only green path)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, reason: 'ENABLED' }),
    })

    const { result } = renderHook(() => useDesignV2Flags())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.upcomingExams).toBe(true)
    expect(result.current.creatorAudit).toBe(true)
  })
})
