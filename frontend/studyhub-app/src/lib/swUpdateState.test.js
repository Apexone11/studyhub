import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetForTests,
  isSwUpdateAvailable,
  markSwUpdateAvailable,
  subscribeSwUpdate,
  swUpdatePendingAgeMs,
} from './swUpdateState'

describe('swUpdateState', () => {
  beforeEach(() => {
    _resetForTests()
  })

  afterEach(() => {
    _resetForTests()
  })

  it('starts with no update available and zero age', () => {
    expect(isSwUpdateAvailable()).toBe(false)
    expect(swUpdatePendingAgeMs()).toBe(0)
  })

  it('markSwUpdateAvailable flips the flag and starts the age clock', () => {
    const before = Date.now()
    markSwUpdateAvailable()
    expect(isSwUpdateAvailable()).toBe(true)
    const age = swUpdatePendingAgeMs()
    expect(age).toBeGreaterThanOrEqual(0)
    expect(age).toBeLessThan(Date.now() - before + 10)
  })

  it('markSwUpdateAvailable is idempotent (second call does not reset pendingSince)', async () => {
    markSwUpdateAvailable()
    await new Promise((r) => setTimeout(r, 20))
    const firstAge = swUpdatePendingAgeMs()
    markSwUpdateAvailable()
    const secondAge = swUpdatePendingAgeMs()
    expect(secondAge).toBeGreaterThanOrEqual(firstAge)
  })

  it('subscribeSwUpdate invokes the callback synchronously with current state', () => {
    const cb = vi.fn()
    const unsub = subscribeSwUpdate(cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(false)
    unsub()
  })

  it('subscribeSwUpdate fires all listeners when the flag flips', () => {
    const a = vi.fn()
    const b = vi.fn()
    subscribeSwUpdate(a)
    subscribeSwUpdate(b)
    a.mockClear()
    b.mockClear()
    markSwUpdateAvailable()
    expect(a).toHaveBeenCalledWith(true)
    expect(b).toHaveBeenCalledWith(true)
  })

  it('unsubscribe removes the listener', () => {
    const cb = vi.fn()
    const unsub = subscribeSwUpdate(cb)
    cb.mockClear()
    unsub()
    markSwUpdateAvailable()
    expect(cb).not.toHaveBeenCalled()
  })

  it('a listener that throws does not prevent the others from running', () => {
    const good = vi.fn()
    subscribeSwUpdate(() => {
      throw new Error('boom')
    })
    subscribeSwUpdate(good)
    good.mockClear()
    expect(() => markSwUpdateAvailable()).not.toThrow()
    expect(good).toHaveBeenCalledWith(true)
  })

  it('non-function subscribers return a no-op unsubscribe without throwing', () => {
    const unsub = subscribeSwUpdate('not a function')
    expect(typeof unsub).toBe('function')
    expect(() => unsub()).not.toThrow()
  })
})
