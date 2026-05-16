/**
 * toast.test.js — Vitest coverage for showToast's per-type duration
 * defaults (added 2026-05-16 UI/UX Bucket A2).
 *
 * Contract under test:
 *  - success defaults to 2500 ms
 *  - info    defaults to 3500 ms
 *  - error   defaults to 6000 ms (5s-of-read + glance margin)
 *  - explicit `0` opts into manual-dismiss-only (used for critical errors)
 *  - explicit positive number overrides the default
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { showToast, toastListeners } from './toast'

let captured = []
let listener = null

beforeEach(() => {
  captured = []
  listener = (toast) => captured.push(toast)
  toastListeners.add(listener)
})

afterEach(() => {
  if (listener) toastListeners.delete(listener)
  listener = null
})

describe('showToast — per-type duration defaults', () => {
  it('success toasts default to 2500 ms', () => {
    showToast('Saved', 'success')
    expect(captured).toHaveLength(1)
    expect(captured[0].durationMs).toBe(2500)
    expect(captured[0].type).toBe('success')
    expect(captured[0].message).toBe('Saved')
  })

  it('info toasts default to 3500 ms', () => {
    showToast('FYI', 'info')
    expect(captured[0].durationMs).toBe(3500)
  })

  it('error toasts default to 6000 ms (Nielsen "5s+ for novel error copy")', () => {
    showToast('Something broke', 'error')
    expect(captured[0].durationMs).toBe(6000)
  })

  it('explicit `0` means manual-dismiss-only (Toast.jsx honors it)', () => {
    showToast('Critical', 'error', 0)
    expect(captured[0].durationMs).toBe(0)
  })

  it('explicit positive number overrides the default', () => {
    showToast('Stay around', 'success', 10000)
    expect(captured[0].durationMs).toBe(10000)
  })

  it('falls back to info default when type is unknown', () => {
    showToast('Hmm', 'mystery')
    expect(captured[0].durationMs).toBe(3500)
  })

  it('returns a stable id for the toast', () => {
    const id = showToast('Saved', 'success')
    expect(typeof id).toBe('number')
    expect(captured[0].id).toBe(id)
  })

  it('fires the listener with type=info by default when type omitted', () => {
    showToast('Hi')
    expect(captured[0].type).toBe('info')
    expect(captured[0].durationMs).toBe(3500)
  })

  // Mock useToast — covered separately because it's a thin wrapper.
  it('useToast.error forwards the type+message+duration override', async () => {
    const { useToast } = await import('./toast')
    const t = useToast()
    t.error('Fail!', 1000)
    expect(captured[0]).toMatchObject({ type: 'error', message: 'Fail!', durationMs: 1000 })
  })
})
