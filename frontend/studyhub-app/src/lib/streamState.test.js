import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  startStreaming,
  stopStreaming,
  isStreamingActive,
  resetStreamingState,
  onStreamingChange,
} from './streamState'

describe('streamState — refcount + watchdog (Bug D regression)', () => {
  beforeEach(() => {
    resetStreamingState()
  })

  afterEach(() => {
    resetStreamingState()
    vi.useRealTimers()
  })

  it('starts inactive', () => {
    expect(isStreamingActive()).toBe(false)
  })

  it('two starts + one stop stays active (refcounted)', () => {
    startStreaming()
    startStreaming()
    expect(isStreamingActive()).toBe(true)
    stopStreaming()
    expect(isStreamingActive()).toBe(true)
    stopStreaming()
    expect(isStreamingActive()).toBe(false)
  })

  it('extra stop is a no-op (does not go negative)', () => {
    stopStreaming()
    stopStreaming()
    stopStreaming()
    expect(isStreamingActive()).toBe(false)
    startStreaming()
    expect(isStreamingActive()).toBe(true)
  })

  it('listener notify contract: every start fires, stop fires only when count→0', () => {
    const fired = []
    const unsub = onStreamingChange((active) => fired.push(active))
    startStreaming() // notify(true) — count 0→1
    startStreaming() // notify(true) — every start fires
    stopStreaming() // count 2→1 — does NOT fire (still active)
    expect(fired).toEqual([true, true])
    stopStreaming() // count 1→0 — notify(false)
    expect(fired).toEqual([true, true, false])
    unsub()
    startStreaming()
    expect(fired).toEqual([true, true, false]) // unsub took
  })

  it('watchdog auto-resets after 5 min stuck-active', () => {
    vi.useFakeTimers()
    startStreaming()
    expect(isStreamingActive()).toBe(true)
    // Advance past the watchdog (slightly more than 5 min to be safe).
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000)
    expect(isStreamingActive()).toBe(false)
  })

  it('resetStreamingState() forces inactive + notifies listeners', () => {
    const fired = []
    onStreamingChange((active) => fired.push(active))
    startStreaming()
    startStreaming()
    // Two starts, two notifies (every-start contract).
    expect(fired).toEqual([true, true])
    resetStreamingState()
    expect(isStreamingActive()).toBe(false)
    expect(fired).toEqual([true, true, false])
  })

  it('listener errors do not break other listeners', () => {
    const fired = []
    onStreamingChange(() => {
      throw new Error('bad listener')
    })
    onStreamingChange((active) => fired.push(active))
    startStreaming()
    expect(fired).toEqual([true])
  })
})
