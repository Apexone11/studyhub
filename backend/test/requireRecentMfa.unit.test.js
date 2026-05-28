/**
 * requireRecentMfa.unit.test.js — middleware tests for step-up MFA.
 *
 * Uses the Module._load patching pattern (matches auth.deep.test.js) so we
 * can swap in a fake prisma + fake logger without touching the real DB.
 *
 * Coverage:
 *   - missing req.user → 401 (defense-in-depth, requireAuth should have
 *     caught this but we never permit privileged action without identity).
 *   - missing req.sessionJti → 403 MFA_STEP_UP_REQUIRED (no_session).
 *   - session.mfaVerifiedAt = null → 403 MFA_STEP_UP_REQUIRED
 *     (not_verified). Includes setupRequired=true when user has no 2FA.
 *   - session.mfaVerifiedAt stale → 403 MFA_STEP_UP_REQUIRED (stale)
 *     with ageMs / withinMs in the response body.
 *   - session.mfaVerifiedAt fresh → next() called.
 *   - session row missing → 401 AUTH_EXPIRED.
 *   - Prisma table missing (P2021) → graceful skip (next() called).
 *   - EMERGENCY_DISABLE_ADMIN_MFA="true" bypasses with structured log.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const middlewarePath = require.resolve('../src/middleware/requireRecentMfa.js')

const mocks = vi.hoisted(() => ({
  prisma: {
    session: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

let originalLoad
let requireRecentMfa

beforeAll(() => {
  originalLoad = Module._load
  Module._load = function patched(request, parent, isMain) {
    // The middleware lives at backend/src/middleware/requireRecentMfa.js
    // and does:  require('../lib/prisma'), require('../lib/logger'),
    //            require('./errorEnvelope').
    // Only swap the prisma + logger; let errorEnvelope load real.
    if (request === '../lib/prisma') return mocks.prisma
    if (request === '../lib/logger') return mocks.log
    return originalLoad.call(this, request, parent, isMain)
  }
  // Drop the cached module so the next require picks up our patched loader.
  delete require.cache[middlewarePath]
  requireRecentMfa = require('../src/middleware/requireRecentMfa.js')
})

afterAll(() => {
  Module._load = originalLoad
})

beforeEach(() => {
  mocks.prisma.session.findUnique.mockReset()
  mocks.prisma.user.findUnique.mockReset()
  mocks.log.warn.mockReset()
  mocks.log.error.mockReset()
  mocks.log.info.mockReset()
  delete process.env.EMERGENCY_DISABLE_ADMIN_MFA
})

afterEach(() => {
  delete process.env.EMERGENCY_DISABLE_ADMIN_MFA
})

function makeReq(overrides = {}) {
  return {
    user: { userId: 7 },
    sessionJti: 'jti-7',
    originalUrl: '/api/admin/users/42',
    ...overrides,
  }
}

function makeRes() {
  const res = { statusCode: 200, body: null }
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (payload) => {
    res.body = payload
    return res
  }
  return res
}

describe('requireRecentMfa — pre-flight checks', () => {
  it('returns 401 when req.user is missing (requireAuth bypass defense)', async () => {
    const req = makeReq({ user: undefined })
    const res = makeRes()
    const next = vi.fn()
    await requireRecentMfa()(req, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 MFA_STEP_UP_REQUIRED when req.sessionJti is missing', async () => {
    const req = makeReq({ sessionJti: undefined })
    const res = makeRes()
    const next = vi.fn()
    await requireRecentMfa()(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(res.body.code).toBe('MFA_STEP_UP_REQUIRED')
    expect(res.body.reason).toBe('no_session')
    expect(next).not.toHaveBeenCalled()
  })
})

describe('requireRecentMfa — session lookup branches', () => {
  it('returns 401 AUTH_EXPIRED when the session row is gone', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(null)
    const res = makeRes()
    const next = vi.fn()
    await requireRecentMfa()(makeReq(), res, next)
    expect(res.statusCode).toBe(401)
    expect(res.body.code).toBe('AUTH_EXPIRED')
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 not_verified when mfaVerifiedAt is null (and 2FA not configured)', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue({ mfaVerifiedAt: null, userId: 7 })
    mocks.prisma.user.findUnique.mockResolvedValue({ twoFaEnabled: false })
    const res = makeRes()
    const next = vi.fn()
    await requireRecentMfa()(makeReq(), res, next)
    expect(res.statusCode).toBe(403)
    expect(res.body.code).toBe('MFA_STEP_UP_REQUIRED')
    expect(res.body.reason).toBe('not_verified')
    expect(res.body.setupRequired).toBe(true)
    expect(res.body.setupPath).toBe('/settings/security/setup-2fa')
    expect(next).not.toHaveBeenCalled()
  })

  it('returns setupRequired=false when 2FA IS configured but session never verified', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue({ mfaVerifiedAt: null, userId: 7 })
    mocks.prisma.user.findUnique.mockResolvedValue({ twoFaEnabled: true })
    const res = makeRes()
    await requireRecentMfa()(makeReq(), res, vi.fn())
    expect(res.body.setupRequired).toBe(false)
  })

  it('returns 403 stale when mfaVerifiedAt is older than the window', async () => {
    const sixteenMinAgo = new Date(Date.now() - 16 * 60_000)
    mocks.prisma.session.findUnique.mockResolvedValue({
      mfaVerifiedAt: sixteenMinAgo,
      userId: 7,
    })
    const res = makeRes()
    const next = vi.fn()
    await requireRecentMfa({ withinMs: 15 * 60_000 })(makeReq(), res, next)
    expect(res.statusCode).toBe(403)
    expect(res.body.code).toBe('MFA_STEP_UP_REQUIRED')
    expect(res.body.reason).toBe('stale')
    expect(res.body.ageMs).toBeGreaterThan(15 * 60_000)
    expect(res.body.withinMs).toBe(15 * 60_000)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next() when mfaVerifiedAt is fresh', async () => {
    const oneMinAgo = new Date(Date.now() - 60_000)
    mocks.prisma.session.findUnique.mockResolvedValue({ mfaVerifiedAt: oneMinAgo, userId: 7 })
    const res = makeRes()
    const next = vi.fn()
    await requireRecentMfa()(makeReq(), res, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200) // unchanged
  })

  it('respects a custom withinMs window', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000)
    mocks.prisma.session.findUnique.mockResolvedValue({ mfaVerifiedAt: fiveMinAgo, userId: 7 })

    const resStrict = makeRes()
    const nextStrict = vi.fn()
    await requireRecentMfa({ withinMs: 60_000 })(makeReq(), resStrict, nextStrict)
    expect(nextStrict).not.toHaveBeenCalled()
    expect(resStrict.body.reason).toBe('stale')

    const resLoose = makeRes()
    const nextLoose = vi.fn()
    await requireRecentMfa({ withinMs: 60 * 60_000 })(makeReq(), resLoose, nextLoose)
    expect(nextLoose).toHaveBeenCalledTimes(1)
  })
})

describe('requireRecentMfa — graceful degrade on missing Session table (P2021)', () => {
  it('calls next() when Prisma reports the table does not exist (fresh dev DB)', async () => {
    const tableMissing = Object.assign(new Error('relation "Session" does not exist'), {
      code: 'P2021',
    })
    mocks.prisma.session.findUnique.mockRejectedValue(tableMissing)
    const res = makeRes()
    const next = vi.fn()
    await requireRecentMfa()(makeReq(), res, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(mocks.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.require_recent_mfa.session_table_missing' }),
      expect.any(String),
    )
  })

  it('returns 503 on any OTHER Prisma error (fails closed)', async () => {
    mocks.prisma.session.findUnique.mockRejectedValue(new Error('P1001: cannot reach DB'))
    const res = makeRes()
    const next = vi.fn()
    await requireRecentMfa()(makeReq(), res, next)
    expect(res.statusCode).toBe(503)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('requireRecentMfa — EMERGENCY_DISABLE_ADMIN_MFA bypass', () => {
  it('bypasses the gate when override is set (case + whitespace tolerant)', async () => {
    for (const variant of ['true', ' true', 'TRUE', 'True']) {
      process.env.EMERGENCY_DISABLE_ADMIN_MFA = variant
      const res = makeRes()
      const next = vi.fn()
      await requireRecentMfa()(makeReq(), res, next)
      expect(next, `variant=${JSON.stringify(variant)}`).toHaveBeenCalledTimes(1)
      // Session lookup MUST be skipped while override is set so a
      // db-down incident plus an override-set founder still gets in.
      expect(mocks.prisma.session.findUnique).not.toHaveBeenCalled()
      // Every bypass emits the loud Sentry-visible log.
      expect(mocks.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth.admin_mfa_step_up_emergency_bypass' }),
        expect.any(String),
      )
      mocks.prisma.session.findUnique.mockReset()
      mocks.log.warn.mockReset()
    }
  })

  it('non-true values do NOT bypass', async () => {
    for (const variant of ['false', '1', 'yes', 'TRUEISH', '']) {
      process.env.EMERGENCY_DISABLE_ADMIN_MFA = variant
      const oneMinAgo = new Date(Date.now() - 60_000)
      mocks.prisma.session.findUnique.mockResolvedValue({
        mfaVerifiedAt: oneMinAgo,
        userId: 7,
      })
      const res = makeRes()
      const next = vi.fn()
      await requireRecentMfa()(makeReq(), res, next)
      // Session lookup must run (gate enforced); fresh verifiedAt
      // means next() is called.
      expect(
        mocks.prisma.session.findUnique,
        `variant=${JSON.stringify(variant)}`,
      ).toHaveBeenCalled()
      expect(next).toHaveBeenCalledTimes(1)
      // No bypass log fired.
      expect(mocks.log.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth.admin_mfa_step_up_emergency_bypass' }),
        expect.any(String),
      )
      mocks.prisma.session.findUnique.mockReset()
      mocks.log.warn.mockReset()
    }
  })
})
