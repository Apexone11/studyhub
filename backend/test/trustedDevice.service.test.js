/**
 * trustedDevice.service — unit tests
 *
 * The focus of these tests is the invariant that catches the Round 3
 * Codex P1 regression: `findOrCreateDevice` must NOT clear `revokedAt`,
 * and `markTrusted` MUST clear it. Any drift here is a real security
 * bug because `findOrCreateDevice` runs on every login attempt — if
 * it un-revokes, the Settings "revoke device" button becomes useless.
 *
 * Uses the repo's Module._load patching pattern (see ai.routes.test.js)
 * because `../../lib/prisma` is CJS with `module.exports = prisma`.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)

const mocks = vi.hoisted(() => ({
  prisma: {
    trustedDevice: {
      upsert: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

const mockTargets = new Map([[require.resolve('../src/lib/prisma'), mocks.prisma]])
const originalModuleLoad = Module._load

let service

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
    return originalModuleLoad.apply(this, arguments)
  }
  service = require('../src/modules/auth/trustedDevice.service')
})

afterAll(() => {
  Module._load = originalModuleLoad
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findOrCreateDevice — revocation invariant', () => {
  it('does NOT pass `revokedAt: null` in the upsert update payload', async () => {
    mocks.prisma.trustedDevice.upsert.mockResolvedValue({ id: 1, userId: 42, deviceId: 'abc' })

    await service.findOrCreateDevice({
      userId: 42,
      deviceId: 'abc',
      label: 'Chrome on Windows',
      ip: '10.0.0.1',
      country: 'US',
      region: 'CA',
    })

    expect(mocks.prisma.trustedDevice.upsert).toHaveBeenCalledTimes(1)
    const call = mocks.prisma.trustedDevice.upsert.mock.calls[0][0]
    expect(call.update).toBeDefined()
    // The bug Codex caught: if this key exists with value null, any
    // revoked device gets re-enabled on the very next login attempt.
    expect(Object.keys(call.update)).not.toContain('revokedAt')
  })

  it('still updates lastSeenAt + metadata on the update path', async () => {
    mocks.prisma.trustedDevice.upsert.mockResolvedValue({ id: 1 })

    await service.findOrCreateDevice({
      userId: 1,
      deviceId: 'did',
      label: 'Safari',
      ip: '1.2.3.4',
      country: 'US',
      region: 'NY',
    })

    const call = mocks.prisma.trustedDevice.upsert.mock.calls[0][0]
    expect(call.update.lastSeenAt).toBeInstanceOf(Date)
    expect(call.update.lastIp).toBe('1.2.3.4')
    expect(call.update.lastCountry).toBe('US')
    expect(call.update.lastRegion).toBe('NY')
    expect(call.update.label).toBe('Safari')
  })

  it('returns null without calling prisma when userId or deviceId missing', async () => {
    const a = await service.findOrCreateDevice({ userId: null, deviceId: 'abc' })
    const b = await service.findOrCreateDevice({ userId: 1, deviceId: null })
    expect(a).toBeNull()
    expect(b).toBeNull()
    expect(mocks.prisma.trustedDevice.upsert).not.toHaveBeenCalled()
  })
})

describe('markTrusted — re-trust invariant', () => {
  it('sets trustedAt AND clears revokedAt', async () => {
    mocks.prisma.trustedDevice.update.mockResolvedValue({
      id: 1,
      trustedAt: new Date(),
      revokedAt: null,
    })

    await service.markTrusted(1)

    expect(mocks.prisma.trustedDevice.update).toHaveBeenCalledTimes(1)
    const call = mocks.prisma.trustedDevice.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 1 })
    expect(call.data.trustedAt).toBeInstanceOf(Date)
    expect(call.data.revokedAt).toBeNull()
  })

  it('returns null when id missing', async () => {
    const result = await service.markTrusted(null)
    expect(result).toBeNull()
    expect(mocks.prisma.trustedDevice.update).not.toHaveBeenCalled()
  })
})

describe('revokeDevice', () => {
  it('sets revokedAt to a fresh Date', async () => {
    mocks.prisma.trustedDevice.update.mockResolvedValue({ id: 1, revokedAt: new Date() })

    await service.revokeDevice(1)

    expect(mocks.prisma.trustedDevice.update).toHaveBeenCalledTimes(1)
    const call = mocks.prisma.trustedDevice.update.mock.calls[0][0]
    expect(call.data.revokedAt).toBeInstanceOf(Date)
  })
})

describe('getUserDevices', () => {
  it('filters by userId and excludes revoked devices', async () => {
    mocks.prisma.trustedDevice.findMany.mockResolvedValue([])

    await service.getUserDevices(7)

    const call = mocks.prisma.trustedDevice.findMany.mock.calls[0][0]
    expect(call.where).toEqual({ userId: 7, revokedAt: null })
    expect(call.orderBy).toEqual({ lastSeenAt: 'desc' })
  })

  it('returns [] when userId missing', async () => {
    const result = await service.getUserDevices(null)
    expect(result).toEqual([])
    expect(mocks.prisma.trustedDevice.findMany).not.toHaveBeenCalled()
  })
})
