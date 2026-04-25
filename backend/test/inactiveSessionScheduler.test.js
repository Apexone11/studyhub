/**
 * inactiveSessionScheduler — policy regression tests.
 *
 * The scheduler is OFF by default in every environment (prod /
 * staging / test / local). Horizontal scaling makes "default on in
 * non-prod" unsafe: the moment staging scales to two replicas, both
 * fire the same idempotent sweep and double DB load for zero value.
 * See the file-level docstring in inactiveSessionScheduler.js for
 * the full reasoning.
 *
 * These tests exercise the module-level `startInactiveSessionScheduler`
 * entry point and assert:
 *   - It's a no-op by default across NODE_ENV=production, staging,
 *     development, and unset.
 *   - It runs only when ENABLE_INACTIVE_SESSION_SWEEP=true|1.
 *   - It continues to no-op under NODE_ENV=test even with the flag on,
 *     because Vitest rebuilds state per-file and we don't want sweep
 *     timers leaking across test files.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const schedulerPath = require.resolve('../src/lib/inactiveSessionScheduler')

let originalEnv
let logInfoSpy
let logErrorSpy

beforeEach(() => {
  originalEnv = { ...process.env }
  // Force a fresh require so module-level state (sweepInterval/Timeout)
  // doesn't leak between tests.
  delete require.cache[schedulerPath]

  // Silence the scheduler's log.info in most tests. Use a fresh spy
  // each time and mockClear() to discard any spill from module init.
  const logModule = require('../src/lib/logger')
  logInfoSpy = vi.spyOn(logModule, 'info').mockImplementation(() => {})
  logErrorSpy = vi.spyOn(logModule, 'error').mockImplementation(() => {})
  logInfoSpy.mockClear()
  logErrorSpy.mockClear()
})

afterEach(() => {
  // Stop any pending scheduler work from spilling across tests.
  try {
    const { stopInactiveSessionScheduler } = require(schedulerPath)
    stopInactiveSessionScheduler()
  } catch {
    /* ignore — scheduler may not have been loaded in this test */
  }
  delete require.cache[schedulerPath]
  logInfoSpy?.mockRestore()
  logErrorSpy?.mockRestore()
  process.env = originalEnv
})

describe('inactiveSessionScheduler policy', () => {
  it('is OFF by default when NODE_ENV=production and the flag is unset', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ENABLE_INACTIVE_SESSION_SWEEP

    // We don't start the scheduler in NODE_ENV=test directly — the
    // module short-circuits it — so instead we verify the isEnabled
    // gate at the function level via a production override.
    // Use require.cache reset to re-evaluate the module with the new env.
    const { startInactiveSessionScheduler } = require(schedulerPath)
    startInactiveSessionScheduler()

    // No sweep means log.info was invoked with the "disabled" message.
    const disabledCalls = logInfoSpy.mock.calls.filter((c) =>
      String(c[0] || '').includes('[inactive-session-sweep] disabled'),
    )
    expect(disabledCalls.length).toBe(1)
  })

  it('is OFF by default when NODE_ENV=staging and the flag is unset', () => {
    process.env.NODE_ENV = 'staging'
    delete process.env.ENABLE_INACTIVE_SESSION_SWEEP
    const { startInactiveSessionScheduler } = require(schedulerPath)
    startInactiveSessionScheduler()
    const disabledCalls = logInfoSpy.mock.calls.filter((c) =>
      String(c[0] || '').includes('[inactive-session-sweep] disabled'),
    )
    expect(disabledCalls.length).toBe(1)
  })

  it('is OFF by default when NODE_ENV=development and the flag is unset', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.ENABLE_INACTIVE_SESSION_SWEEP
    const { startInactiveSessionScheduler } = require(schedulerPath)
    startInactiveSessionScheduler()
    const disabledCalls = logInfoSpy.mock.calls.filter((c) =>
      String(c[0] || '').includes('[inactive-session-sweep] disabled'),
    )
    expect(disabledCalls.length).toBe(1)
  })

  it('remains a no-op under NODE_ENV=test even when the flag is "true"', () => {
    // Vitest sets NODE_ENV=test. The scheduler's first guard short-
    // circuits on test regardless of flag so sweep timers do not leak
    // across test files.
    process.env.NODE_ENV = 'test'
    process.env.ENABLE_INACTIVE_SESSION_SWEEP = 'true'
    const { startInactiveSessionScheduler } = require(schedulerPath)
    startInactiveSessionScheduler()

    // No log output for enabled OR disabled in this case — the module
    // returns before either log line runs.
    expect(logInfoSpy).not.toHaveBeenCalled()
  })

  it('accepts "1" as a truthy enable value outside test', () => {
    process.env.NODE_ENV = 'production'
    process.env.ENABLE_INACTIVE_SESSION_SWEEP = '1'
    const { startInactiveSessionScheduler } = require(schedulerPath)
    startInactiveSessionScheduler()
    const disabledCalls = logInfoSpy.mock.calls.filter((c) =>
      String(c[0] || '').includes('[inactive-session-sweep] disabled'),
    )
    expect(disabledCalls.length).toBe(0)
  })

  it('treats "false" as off (belt-and-suspenders)', () => {
    process.env.NODE_ENV = 'development'
    process.env.ENABLE_INACTIVE_SESSION_SWEEP = 'false'
    const { startInactiveSessionScheduler } = require(schedulerPath)
    startInactiveSessionScheduler()
    const disabledCalls = logInfoSpy.mock.calls.filter((c) =>
      String(c[0] || '').includes('[inactive-session-sweep] disabled'),
    )
    expect(disabledCalls.length).toBe(1)
  })

  it('treats "0" as off', () => {
    process.env.NODE_ENV = 'development'
    process.env.ENABLE_INACTIVE_SESSION_SWEEP = '0'
    const { startInactiveSessionScheduler } = require(schedulerPath)
    startInactiveSessionScheduler()
    const disabledCalls = logInfoSpy.mock.calls.filter((c) =>
      String(c[0] || '').includes('[inactive-session-sweep] disabled'),
    )
    expect(disabledCalls.length).toBe(1)
  })
})
