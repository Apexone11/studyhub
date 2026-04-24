/**
 * designV2Flags — fail-open regression test.
 *
 * Bug caught during Day 2 -> Day 3 smoke test: the <UpcomingExamsCard />
 * was completely absent on localhost for beta_student1 even though
 * the Day 2 handoff claimed the flag was fail-open.
 *
 * Root cause:
 *   - backend/src/lib/featureFlags.js::evaluateFlag() returns
 *     {enabled: false, reason: 'FLAG_NOT_FOUND'} when no row exists
 *     in the FeatureFlag table. On a fresh install NO design_v2_* rows
 *     exist, so every design-v2 gate was reporting "off".
 *   - The frontend hook previously looked at data.enabled only, which
 *     means it honored the server's `false` even though the product
 *     intent (and the hook's own docstring) was "fail-open for design v2".
 *
 * Fix:
 *   - Hook now treats `reason: 'FLAG_NOT_FOUND'` as fail-open, matching
 *     the documented intent and the network-error branch.
 *
 * These tests lock that behavior so no one silently regresses the
 * fail-open contract and hides a Day-N feature from localhost users.
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

describe('useDesignV2Flags fail-open contract', () => {
  it('treats FLAG_NOT_FOUND from the server as ENABLED (fail-open)', async () => {
    // Mirror the server response for a flag row that does not exist in
    // the FeatureFlag table. Before the fix, the hook returned
    // enabled=false here and hid every design-v2 feature on localhost.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false, reason: 'FLAG_NOT_FOUND' }),
    })

    const { result } = renderHook(() => useDesignV2Flags())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Every declared flag should be true (fail-open) because every
    // evaluation returned FLAG_NOT_FOUND.
    expect(result.current.phase1Dashboard).toBe(true)
    expect(result.current.upcomingExams).toBe(true)
    expect(result.current.aiCard).toBe(true)
    expect(result.current.sheetsGrid).toBe(true)
  })

  it('respects an explicit DISABLED response (DB row exists, enabled=false)', async () => {
    // When an admin has explicitly flipped a flag off, we must honor
    // that. FLAG_NOT_FOUND is the only "missing row" case — anything
    // else should respect the server.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false, reason: 'DISABLED' }),
    })

    const { result } = renderHook(() => useDesignV2Flags())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // DISABLED is respected, not fail-opened.
    expect(result.current.upcomingExams).toBe(false)
  })

  it('fails open on a network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useDesignV2Flags())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.upcomingExams).toBe(true)
  })

  it('fails open on a non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    })

    const { result } = renderHook(() => useDesignV2Flags())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.upcomingExams).toBe(true)
  })

  it('respects enabled=true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, reason: 'ENABLED' }),
    })

    const { result } = renderHook(() => useDesignV2Flags())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.upcomingExams).toBe(true)
  })
})
