/**
 * loginChallenge.service.unit.test.js
 *
 * Pins the step-up challenge contract:
 *  - single-use (double-redeem race loses cleanly — regression for the
 *    TOCTOU where two parallel correct submissions could each issue a
 *    session; see the conditional updateMany in verifyChallenge).
 *  - lockout after MAX_ATTEMPTS wrong submissions, with `remaining`
 *    counting down correctly on each miss.
 *  - expired challenges surface `reason: 'expired'` not `wrong`.
 *  - happy-path sets consumedAt and returns the fresh row.
 *
 * Prisma is stubbed through Module._load so the service-under-test
 * runs its real code against a fake client. Same pattern used by
 * plagiarism.unit.test.js — no DB needed.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const servicePath = require.resolve('../../src/modules/auth/loginChallenge.service')

const mocks = vi.hoisted(() => {
  const prisma = {
    loginChallenge: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  }
  return { prisma }
})

const mockTargets = new Map([[require.resolve('../../src/lib/prisma'), mocks.prisma]])

const originalModuleLoad = Module._load

let service

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      const mocked = mockTargets.get(resolved)
      if (mocked) return mocked
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }
  delete require.cache[servicePath]
  service = require(servicePath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[servicePath]
})

beforeEach(() => {
  for (const fn of Object.values(mocks.prisma.loginChallenge)) fn.mockReset()
})

// SHA-256 of '123456' so the mocked row's codeHash matches the code we
// pass to verifyChallenge in the happy-path tests.
const CORRECT_CODE = '123456'
const CORRECT_CODE_HASH = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'

function makeChallenge(overrides = {}) {
  return {
    id: 'chal_1',
    userId: 42,
    pendingDeviceId: 'dev_1',
    codeHash: CORRECT_CODE_HASH,
    attempts: 0,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    createdAt: new Date(),
    ipAddress: null,
    userAgent: null,
    ...overrides,
  }
}

describe('loginChallenge.service verifyChallenge', () => {
  it('returns not_found when id or code is missing', async () => {
    const a = await service.verifyChallenge({ id: '', code: CORRECT_CODE })
    expect(a).toEqual({ ok: false, reason: 'not_found', remaining: 0 })
    const b = await service.verifyChallenge({ id: 'x', code: '' })
    expect(b).toEqual({ ok: false, reason: 'not_found', remaining: 0 })
    expect(mocks.prisma.loginChallenge.findUnique).not.toHaveBeenCalled()
  })

  it('returns expired when the row is past expiresAt', async () => {
    mocks.prisma.loginChallenge.findUnique.mockResolvedValueOnce(
      makeChallenge({ expiresAt: new Date(Date.now() - 1000) }),
    )
    const result = await service.verifyChallenge({ id: 'chal_1', code: CORRECT_CODE })
    expect(result).toEqual({ ok: false, reason: 'expired', remaining: 0 })
    // Must NOT try to redeem an expired row.
    expect(mocks.prisma.loginChallenge.updateMany).not.toHaveBeenCalled()
  })

  it('returns consumed when the row was already redeemed', async () => {
    mocks.prisma.loginChallenge.findUnique.mockResolvedValueOnce(
      makeChallenge({ consumedAt: new Date() }),
    )
    const result = await service.verifyChallenge({ id: 'chal_1', code: CORRECT_CODE })
    expect(result).toEqual({ ok: false, reason: 'consumed', remaining: 0 })
    expect(mocks.prisma.loginChallenge.updateMany).not.toHaveBeenCalled()
  })

  it('returns locked when attempts already at MAX_ATTEMPTS', async () => {
    mocks.prisma.loginChallenge.findUnique.mockResolvedValueOnce(
      makeChallenge({ attempts: service.MAX_ATTEMPTS }),
    )
    const result = await service.verifyChallenge({ id: 'chal_1', code: CORRECT_CODE })
    expect(result).toEqual({ ok: false, reason: 'locked', remaining: 0 })
  })

  it('wrong code increments attempts and decrements remaining', async () => {
    mocks.prisma.loginChallenge.findUnique.mockResolvedValueOnce(makeChallenge({ attempts: 0 }))
    mocks.prisma.loginChallenge.update.mockResolvedValueOnce(makeChallenge({ attempts: 1 }))
    const result = await service.verifyChallenge({ id: 'chal_1', code: '999999' })
    expect(result).toEqual({ ok: false, reason: 'wrong', remaining: service.MAX_ATTEMPTS - 1 })
    expect(mocks.prisma.loginChallenge.update).toHaveBeenCalledWith({
      where: { id: 'chal_1' },
      data: { attempts: { increment: 1 } },
    })
  })

  it('wrong code at the MAX_ATTEMPTS threshold returns locked', async () => {
    mocks.prisma.loginChallenge.findUnique.mockResolvedValueOnce(
      makeChallenge({ attempts: service.MAX_ATTEMPTS - 1 }),
    )
    mocks.prisma.loginChallenge.update.mockResolvedValueOnce(
      makeChallenge({ attempts: service.MAX_ATTEMPTS }),
    )
    const result = await service.verifyChallenge({ id: 'chal_1', code: '999999' })
    expect(result).toEqual({ ok: false, reason: 'locked', remaining: 0 })
  })

  it('correct code redeems via conditional updateMany and returns ok: true', async () => {
    mocks.prisma.loginChallenge.findUnique.mockResolvedValueOnce(makeChallenge())
    mocks.prisma.loginChallenge.updateMany.mockResolvedValueOnce({ count: 1 })

    const result = await service.verifyChallenge({ id: 'chal_1', code: CORRECT_CODE })

    expect(result.ok).toBe(true)
    expect(result.challenge.id).toBe('chal_1')
    expect(result.challenge.consumedAt).not.toBeNull()
    // Hot-path optimization: on a successful claim the service overlays
    // consumedAt on the pre-read row instead of issuing a second
    // findUnique. So findUnique should only be called once for a
    // successful redemption.
    expect(mocks.prisma.loginChallenge.findUnique).toHaveBeenCalledTimes(1)
    // The consume path MUST use the gated updateMany, not a blind update.
    expect(mocks.prisma.loginChallenge.updateMany).toHaveBeenCalledTimes(1)
    const call = mocks.prisma.loginChallenge.updateMany.mock.calls[0][0]
    expect(call.where).toMatchObject({
      id: 'chal_1',
      consumedAt: null,
      attempts: { lt: service.MAX_ATTEMPTS },
    })
    expect(call.data.consumedAt).toBeInstanceOf(Date)
  })

  it('single-use: when a parallel request wins the race, loser returns consumed', async () => {
    // Regression for the TOCTOU the atomicity fix closed. Both
    // requests see consumedAt=null on the initial findUnique (that's
    // the race window), but the conditional updateMany only
    // successfully claims the row for ONE of them. The loser's
    // updateMany returns count:0 and the service re-reads the row to
    // classify the outcome.
    mocks.prisma.loginChallenge.findUnique
      .mockResolvedValueOnce(makeChallenge()) // initial (pre-race) read
      .mockResolvedValueOnce(makeChallenge({ consumedAt: new Date() })) // post-race re-read
    mocks.prisma.loginChallenge.updateMany.mockResolvedValueOnce({ count: 0 })

    const result = await service.verifyChallenge({ id: 'chal_1', code: CORRECT_CODE })

    expect(result).toEqual({ ok: false, reason: 'consumed', remaining: 0 })
    // Critically: no session would be issued because ok is false. The
    // loser must NOT get a success path even though its initial read
    // saw consumedAt=null.
  })
})

describe('loginChallenge.service createChallenge', () => {
  it('creates a row and returns the plaintext code ONLY in the return value', async () => {
    mocks.prisma.loginChallenge.create.mockResolvedValueOnce({ id: 'chal_new' })

    const result = await service.createChallenge({
      userId: 42,
      pendingDeviceId: 'dev_1',
      ipAddress: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
    })

    expect(result.id).toBe('chal_new')
    expect(result.code).toMatch(/^\d{6}$/)
    // The service MUST hash the code before persisting — the plaintext
    // must never touch the DB.
    const createArg = mocks.prisma.loginChallenge.create.mock.calls[0][0].data
    expect(createArg).not.toHaveProperty('code')
    expect(createArg.codeHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('throws when required params are missing', async () => {
    await expect(service.createChallenge({})).rejects.toThrow(/userId/)
    await expect(service.createChallenge({ userId: 1 })).rejects.toThrow(/pendingDeviceId/)
  })
})
