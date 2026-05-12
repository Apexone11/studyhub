/**
 * auth.deep.test.js — comprehensive backend coverage for the auth module's
 * login, registration, and Google-OAuth surfaces.
 *
 * Uses the Module._load patching pattern (matches auth.routes.test.js and
 * ai.suggestions.routes.test.js) so we can mount the real router against a
 * fake Prisma + fake email + fake verification stack — no DB, no SMTP.
 *
 * Each `it` asserts a SPECIFIC behavior, not just a status code. Comments
 * on each test call out the contract being pinned.
 */
import Module, { createRequire } from 'node:module'
import bcrypt from 'bcryptjs'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const authRoutePath = require.resolve('../src/modules/auth')

const mocks = vi.hoisted(() => {
  class MockVerificationError extends Error {
    constructor(statusCode, message) {
      super(message)
      this.statusCode = statusCode
    }
  }

  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    passwordResetToken: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    school: { findUnique: vi.fn() },
    course: { findMany: vi.fn() },
    verificationChallenge: { deleteMany: vi.fn() },
    legalDocument: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    legalAcceptance: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    session: {
      create: vi.fn().mockResolvedValue({ id: 'session-1' }),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    subscription: { findMany: vi.fn().mockResolvedValue([]) },
    donation: { groupBy: vi.fn().mockResolvedValue([]) },
    notification: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    securityEvent: { create: vi.fn().mockResolvedValue({}) },
    loginChallenge: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    trustedDevice: { findUnique: vi.fn() },
    featureFlag: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (fnOrArray) => {
      if (typeof fnOrArray === 'function') return fnOrArray(prisma)
      return fnOrArray
    }),
  }

  return {
    prisma,
    email: {
      sendEmailVerification: vi.fn().mockResolvedValue({}),
      sendPasswordReset: vi.fn().mockResolvedValue({}),
      sendTwoFaCode: vi.fn().mockResolvedValue({}),
    },
    authTokens: {
      clearAuthCookie: vi.fn((res) => res.clearCookie('studyhub_session')),
      hashStoredSecret: vi.fn((value) => `hash:${value}`),
      setAuthCookie: vi.fn((response, token) => response.cookie('studyhub_session', token)),
      signAuthToken: vi.fn(() => 'signed-token'),
      signCsrfToken: vi.fn(() => 'csrf-token'),
      verifyAuthToken: vi.fn(() => ({ sub: 1, jti: 'jti-1' })),
      getAuthTokenFromRequest: vi.fn(() => null),
    },
    verification: {
      VERIFICATION_PURPOSE: {
        SIGNUP: 'signup',
        LOGIN_EMAIL: 'login-email',
        SETTINGS_EMAIL: 'settings-email',
      },
      VerificationError: MockVerificationError,
      consumeChallenge: vi.fn(),
      createOrRefreshLoginChallenge: vi.fn(),
      createSignupChallenge: vi.fn(),
      findChallengeByToken: vi.fn(),
      getResendAvailableAt: vi.fn(() => new Date('2026-03-16T12:01:00.000Z')),
      mapChallengeForClient: vi.fn((challenge) => ({
        verificationToken: challenge.token,
        expiresAt: challenge.expiresAt,
        resendAvailableAt: new Date('2026-03-16T12:01:00.000Z'),
        deliveryHint: challenge.deliveryHint || '',
        emailRequired: !challenge.email,
        email: challenge.email || null,
      })),
      resendSignupChallenge: vi.fn(),
      sendOrRefreshLoginChallenge: vi.fn(),
      verifyChallengeCode: vi.fn(),
    },
    sentry: { captureError: vi.fn() },
    trustGate: {
      checkAndPromoteTrust: vi.fn().mockResolvedValue({ promoted: false, trustLevel: 'new' }),
      TRUST_LEVELS: { NEW: 'new', VERIFIED: 'verified', TRUSTED: 'trusted' },
    },
    passwordSafety: {
      checkPasswordBreach: vi.fn(async () => ({ breached: false, count: 0 })),
      isPasswordPwned: vi.fn(async () => false),
    },
    googleAuth: {
      verifyGoogleIdToken: vi.fn(),
      findUserByGoogleId: vi.fn(),
      findUserByEmail: vi.fn(),
      isGoogleOAuthEnabled: vi.fn(() => true),
    },
    legalService: {
      CURRENT_LEGAL_VERSION: '2026-04-04',
      LEGAL_ACCEPTANCE_SOURCES: {
        REGISTER: 'register',
        GOOGLE_SIGNUP: 'google_signup',
        LOGIN: 'login',
      },
      recordCurrentRequiredLegalAcceptancesTx: vi.fn().mockResolvedValue({ count: 0 }),
      recordCurrentRequiredLegalAcceptances: vi.fn().mockResolvedValue({ count: 0 }),
      getSessionLegalAcceptanceState: vi.fn().mockResolvedValue({
        currentVersion: '2026-04-04',
        needsAcceptance: false,
        documents: [],
      }),
      getCurrentLegalDocument: vi.fn().mockResolvedValue(null),
      getCurrentLegalDocuments: vi.fn().mockResolvedValue([]),
      getUserLegalStatus: vi.fn().mockResolvedValue({ needsAcceptance: false }),
      ensureLegalDocumentsSeeded: vi.fn().mockResolvedValue(undefined),
      acceptCurrentLegalDocuments: vi.fn().mockResolvedValue({ count: 0 }),
    },
  }
})

// originAllowlist() is applied at the auth router level per CLAUDE.md A11.
// The real middleware rejects requests without a trusted Origin header,
// which would 403 every test in this file. Mock to a pass-through so the
// router contract under test (handlers + rate limits + cookies) stays
// the focus.
const originAllowlistMock = () => (_req, _res, next) => next()
// Achievements engine — Loop A4 wires LOGIN/etc. emits into auth.service.
// Stub here so the fire-and-forget never bubbles a Sentry capture.
const achievementsMock = {
  emitAchievementEvent: () => Promise.resolve(),
  EVENT_KINDS: new Proxy({}, { get: (_t, prop) => String(prop) }),
  checkAndAwardBadgesLegacy: () => {},
}

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/email/email'), mocks.email],
  [require.resolve('../src/lib/authTokens'), mocks.authTokens],
  [require.resolve('../src/lib/verification/verificationChallenges'), mocks.verification],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/trustGate'), mocks.trustGate],
  [require.resolve('../src/lib/passwordSafety'), mocks.passwordSafety],
  [require.resolve('../src/lib/googleAuth'), mocks.googleAuth],
  [require.resolve('../src/modules/legal/legal.service'), mocks.legalService],
  [require.resolve('../src/middleware/originAllowlist'), originAllowlistMock],
  [require.resolve('../src/modules/achievements'), achievementsMock],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    if (requestId === 'express-rate-limit') return () => (_req, _res, next) => next()
    try {
      const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
      const mockedModule = mockTargets.get(resolvedRequest)
      if (mockedModule) return mockedModule
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[authRoutePath]
  const authRouterModule = require('../src/modules/auth')
  const authRouter = authRouterModule.default || authRouterModule

  app = express()
  app.use(express.json())
  app.use('/', authRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[authRoutePath]
})

beforeEach(() => {
  // resetAllMocks clears queued `mockResolvedValueOnce` returns AND implementations,
  // so defaults below must be reapplied every test. clearAllMocks would leak the
  // once-queue from earlier tests into later ones — that's a pollution bug.
  vi.resetAllMocks()
  mocks.prisma.user.update.mockResolvedValue({})
  mocks.prisma.user.create.mockResolvedValue({ id: 999 })
  mocks.email.sendEmailVerification.mockResolvedValue({})
  mocks.email.sendPasswordReset.mockResolvedValue({})
  mocks.email.sendTwoFaCode.mockResolvedValue({})
  mocks.prisma.session.create.mockResolvedValue({ id: 'session-1' })
  mocks.prisma.session.findMany.mockResolvedValue([])
  mocks.prisma.session.update.mockResolvedValue({})
  mocks.prisma.session.updateMany.mockResolvedValue({ count: 0 })
  mocks.prisma.securityEvent.create.mockResolvedValue({})
  mocks.prisma.featureFlag.findUnique.mockResolvedValue(null)
  mocks.prisma.legalDocument.updateMany.mockResolvedValue({ count: 0 })
  mocks.prisma.legalDocument.upsert.mockResolvedValue({})
  mocks.prisma.legalDocument.findMany.mockResolvedValue([])
  mocks.prisma.legalDocument.findFirst.mockResolvedValue(null)
  mocks.prisma.legalAcceptance.findMany.mockResolvedValue([])
  mocks.prisma.legalAcceptance.createMany.mockResolvedValue({ count: 0 })
  mocks.prisma.subscription.findMany.mockResolvedValue([])
  mocks.prisma.donation.groupBy.mockResolvedValue([])
  mocks.prisma.notification.findFirst.mockResolvedValue(null)
  mocks.prisma.notification.create.mockResolvedValue({})
  mocks.prisma.$transaction.mockImplementation(async (fnOrArray) => {
    if (typeof fnOrArray === 'function') return fnOrArray(mocks.prisma)
    return Promise.all(fnOrArray)
  })
  mocks.passwordSafety.checkPasswordBreach.mockResolvedValue({ breached: false, count: 0 })
  mocks.passwordSafety.isPasswordPwned.mockResolvedValue(false)
  mocks.authTokens.signAuthToken.mockReturnValue('signed-token')
  mocks.authTokens.signCsrfToken.mockReturnValue('csrf-token')
  mocks.authTokens.hashStoredSecret.mockImplementation((v) => `hash:${v}`)
  mocks.authTokens.setAuthCookie.mockImplementation((response, token) =>
    response.cookie('studyhub_session', token),
  )
  mocks.authTokens.clearAuthCookie.mockImplementation((res) => res.clearCookie('studyhub_session'))
  mocks.authTokens.verifyAuthToken.mockReturnValue({ sub: 1, jti: 'jti-1' })
  mocks.authTokens.getAuthTokenFromRequest.mockReturnValue(null)
  mocks.trustGate.checkAndPromoteTrust.mockResolvedValue({ promoted: false, trustLevel: 'new' })
  mocks.legalService.recordCurrentRequiredLegalAcceptancesTx.mockResolvedValue({ count: 0 })
  mocks.legalService.recordCurrentRequiredLegalAcceptances.mockResolvedValue({ count: 0 })
  mocks.legalService.getSessionLegalAcceptanceState.mockResolvedValue({
    currentVersion: '2026-04-04',
    needsAcceptance: false,
    documents: [],
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Login flow
// ────────────────────────────────────────────────────────────────────────────
describe('POST /login — login flow', () => {
  async function makeUser(overrides = {}) {
    const passwordHash = await bcrypt.hash('Password123', 4)
    return {
      id: 100,
      username: 'tester',
      passwordHash,
      email: 'tester@studyhub.test',
      emailVerified: true,
      failedAttempts: 0,
      lockedUntil: null,
      twoFaEnabled: false,
      role: 'student',
      mfaRequired: false,
      ...overrides,
    }
  }

  it('returns 400 with BAD_REQUEST when username and password are both missing', async () => {
    const res = await request(app).post('/login').send({})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('BAD_REQUEST')
    expect(res.body.error).toMatch(/fill in both fields/i)
  })

  it('valid creds issue a session cookie AND return user payload', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(await makeUser())
    const res = await request(app)
      .post('/login')
      .send({ username: 'tester', password: 'Password123' })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Login successful!')
    expect(res.body.user.username).toBe('tester')
    expect(res.headers['set-cookie']).toBeDefined()
    expect(mocks.authTokens.setAuthCookie).toHaveBeenCalled()
  })

  it('unknown username returns 401 with same generic message (no enumeration)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post('/login')
      .send({ username: 'ghost', password: 'whatever1A' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNAUTHORIZED')
    expect(res.body.error).toBe('Incorrect username or password.')
    // No "user does not exist" message — frontend cannot distinguish missing-user from wrong-password.
    expect(res.body.error).not.toMatch(/not found|does not exist|no user/i)
  })

  it('wrong password returns 401 with attempts-remaining suffix', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(await makeUser({ failedAttempts: 0 }))
    const res = await request(app)
      .post('/login')
      .send({ username: 'tester', password: 'WrongPass1' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNAUTHORIZED')
    // The "Incorrect username or password" prefix is identical to the unknown-username branch.
    expect(res.body.error.startsWith('Incorrect username or password')).toBe(true)
    expect(res.body.error).toMatch(/4 attempts remaining/)
  })

  it('locked account returns 429 with RATE_LIMITED + minutesLeft + showForgot', async () => {
    const futureLock = new Date(Date.now() + 10 * 60 * 1000)
    mocks.prisma.user.findUnique.mockResolvedValue(await makeUser({ lockedUntil: futureLock }))
    const res = await request(app)
      .post('/login')
      .send({ username: 'tester', password: 'Password123' })
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('RATE_LIMITED')
    expect(res.body.locked).toBe(true)
    expect(res.body.showForgot).toBe(true)
    expect(res.body.minutesLeft).toBeGreaterThan(0)
  })

  it('5th failed attempt triggers a 15-minute lockout', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(await makeUser({ failedAttempts: 4 }))
    const res = await request(app)
      .post('/login')
      .send({ username: 'tester', password: 'WrongPass1' })
    expect(res.status).toBe(429)
    expect(res.body.locked).toBe(true)
    expect(res.body.minutesLeft).toBe(15)
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      }),
    )
  })

  it('successful login resets failedAttempts and clears lockedUntil', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(await makeUser({ failedAttempts: 3 }))
    await request(app).post('/login').send({ username: 'tester', password: 'Password123' })
    // The reset call clears the strike count once the user authenticates.
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedAttempts: 0,
          lockedUntil: null,
          lastFailedLoginAt: null,
        }),
      }),
    )
  })

  it('admin with mfaRequired but no 2FA receives 403 with MFA_SETUP_REQUIRED', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      await makeUser({ role: 'admin', mfaRequired: true, twoFaEnabled: false }),
    )
    mocks.prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true })
    const res = await request(app)
      .post('/login')
      .send({ username: 'tester', password: 'Password123' })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('MFA_SETUP_REQUIRED')
    expect(res.body.setupPath).toBe('/settings/security/setup-2fa')
  })

  it('login does NOT echo the password back in the response body', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(await makeUser())
    const res = await request(app)
      .post('/login')
      .send({ username: 'tester', password: 'Password123' })
    const json = JSON.stringify(res.body)
    expect(json).not.toContain('Password123')
    expect(json).not.toContain('passwordHash')
  })

  it('login response includes a csrfToken on the user payload', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(await makeUser())
    const res = await request(app)
      .post('/login')
      .send({ username: 'tester', password: 'Password123' })
    expect(res.body.user.csrfToken).toBe('csrf-token')
    expect(mocks.authTokens.signCsrfToken).toHaveBeenCalled()
  })

  it('login persists a Session row via session.service.createSession', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(await makeUser())
    await request(app).post('/login').send({ username: 'tester', password: 'Password123' })
    expect(mocks.prisma.session.create).toHaveBeenCalled()
  })

  it('login is idempotent — calling twice with valid creds succeeds both times', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(await makeUser())
    const r1 = await request(app)
      .post('/login')
      .send({ username: 'tester', password: 'Password123' })
    const r2 = await request(app)
      .post('/login')
      .send({ username: 'tester', password: 'Password123' })
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
  })

  it('username field is trimmed before lookup (whitespace tolerance)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(await makeUser())
    await request(app).post('/login').send({ username: '  tester  ', password: 'Password123' })
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'tester' } })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Register flow (POST /register and /register/start)
// ────────────────────────────────────────────────────────────────────────────
describe('POST /register — direct registration', () => {
  beforeEach(() => {
    // Default: every findUnique returns null (no existing username, no existing email).
    // Tests that walk the happy path through issueAuthenticatedSession override the
    // final post-create lookup to return the created user.
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.prisma.user.create.mockResolvedValue({ id: 999 })
  })

  function expectFullRegisterSuccess() {
    // Collision-check findUnique calls (username, optional email) return null;
    // the post-create lookup (where: { id }) returns the created user. We key
    // on the `id` shape so it matches no matter how many collision checks ran.
    mocks.prisma.user.findUnique.mockImplementation(async (args) => {
      if (args?.where?.id) {
        return {
          id: 999,
          username: 'happypath',
          email: null,
          emailVerified: true,
          role: 'student',
          authProvider: 'local',
          accountType: 'student',
          trustLevel: 'trusted',
          createdAt: new Date(),
          avatarUrl: null,
          coverImageUrl: null,
          enrollments: [],
          _count: { enrollments: 0, studySheets: 0, starredSheets: 0 },
        }
      }
      return null
    })
  }

  it('rejects when username is missing (400 BAD_REQUEST)', async () => {
    const res = await request(app).post('/register').send({
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/username is required/i)
  })

  it('rejects username with invalid chars (e.g. dash)', async () => {
    const res = await request(app).post('/register').send({
      username: 'bad-user-name',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/letters, numbers, and underscores/i)
  })

  it('rejects username shorter than 3 chars', async () => {
    const res = await request(app).post('/register').send({
      username: 'ab',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/3-20 characters/i)
  })

  it('rejects password shorter than PASSWORD_MIN_LENGTH (8)', async () => {
    const res = await request(app).post('/register').send({
      username: 'newuser',
      password: 'Aa1',
      confirmPassword: 'Aa1',
      termsAccepted: true,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/at least 8 characters/i)
  })

  it('rejects password missing a capital letter', async () => {
    const res = await request(app).post('/register').send({
      username: 'newuser',
      password: 'lowercase1',
      confirmPassword: 'lowercase1',
      termsAccepted: true,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/capital letter/i)
  })

  it('rejects password missing a digit', async () => {
    const res = await request(app).post('/register').send({
      username: 'newuser',
      password: 'AllLetters',
      confirmPassword: 'AllLetters',
      termsAccepted: true,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/capital letter and one number/i)
  })

  it('rejects mismatched confirmPassword', async () => {
    const res = await request(app).post('/register').send({
      username: 'newuser',
      password: 'Password123',
      confirmPassword: 'Password456',
      termsAccepted: true,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/passwords do not match/i)
  })

  it('rejects when termsAccepted is false', async () => {
    const res = await request(app).post('/register').send({
      username: 'newuser',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: false,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Terms of Use/i)
  })

  it('rejects malformed email (400 BAD_REQUEST)', async () => {
    const res = await request(app).post('/register').send({
      username: 'newuser',
      email: 'not-an-email',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/valid email address/i)
  })

  it('409 CONFLICT when username already exists', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce({ id: 1 })
    const res = await request(app).post('/register').send({
      username: 'taken_name',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('CONFLICT')
    expect(res.body.error).toMatch(/username is already taken/i)
  })

  it('409 CONFLICT when email already exists', async () => {
    // First call (username lookup) returns null; second call (email lookup) returns a user.
    mocks.prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1 })
    const res = await request(app).post('/register').send({
      username: 'newuser',
      email: 'taken@studyhub.test',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/email is already in use/i)
  })

  it('breached password (HIBP positive) returns 400 BREACHED_PASSWORD code', async () => {
    mocks.passwordSafety.checkPasswordBreach.mockResolvedValueOnce({ breached: true, count: 12345 })
    const res = await request(app).post('/register').send({
      username: 'newuser',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('BREACHED_PASSWORD')
    expect(res.body.error).toMatch(/12,345 data breaches/)
  })

  it('HIBP unreachable (throws) does NOT block registration — fail-OPEN', async () => {
    expectFullRegisterSuccess()
    mocks.passwordSafety.checkPasswordBreach.mockRejectedValueOnce(new Error('network'))
    const res = await request(app).post('/register').send({
      username: 'failopenuser',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })
    expect(res.status).toBe(201)
    expect(res.body.user).toBeDefined()
  })

  it('successful register stores a bcrypt hash (NOT plaintext) in user.create', async () => {
    await request(app).post('/register').send({
      username: 'hashcheck',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })
    // $transaction was called; check what was sent to user.create within it.
    expect(mocks.prisma.user.create).toHaveBeenCalled()
    const createArg = mocks.prisma.user.create.mock.calls[0][0]
    expect(createArg.data.passwordHash).toBeDefined()
    expect(createArg.data.passwordHash).not.toBe('Password123')
    // bcrypt hashes start with $2a$, $2b$, or $2y$.
    expect(createArg.data.passwordHash).toMatch(/^\$2[aby]\$/)
  })

  it('register/start requires email (verified flow)', async () => {
    const res = await request(app).post('/register/start').send({
      username: 'noemail',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
    expect(res.body.error).toMatch(/Email is required/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Google OAuth
// ────────────────────────────────────────────────────────────────────────────
describe('POST /google — Google OAuth', () => {
  beforeEach(() => {
    mocks.googleAuth.isGoogleOAuthEnabled.mockReturnValue(true)
  })

  it('400 BAD_REQUEST when credential is missing', async () => {
    const res = await request(app).post('/google').send({})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('BAD_REQUEST')
    expect(res.body.error).toMatch(/credential is required/i)
  })

  it('503 when Google OAuth is disabled', async () => {
    mocks.googleAuth.isGoogleOAuthEnabled.mockReturnValueOnce(false)
    const res = await request(app).post('/google').send({ credential: 'token' })
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/Google sign-in is not available/i)
  })

  it('401 when verifyGoogleIdToken throws (invalid token)', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockRejectedValueOnce(new Error('bad token'))
    const res = await request(app).post('/google').send({ credential: 'evil' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNAUTHORIZED')
    expect(res.body.error).toMatch(/Google sign-in failed/i)
  })

  it('signs in existing Google user (returns user, no needs_role)', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValueOnce({
      googleId: 'g-1',
      email: 'g@studyhub.test',
      emailVerified: true,
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValueOnce({ id: 42 })
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 42,
      username: 'g_user',
      email: 'g@studyhub.test',
      emailVerified: true,
      role: 'student',
    })
    const res = await request(app).post('/google').send({ credential: 'good' })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Login successful!')
    expect(res.body.user).toBeDefined()
    expect(res.body.status).not.toBe('needs_role')
  })

  it('rejects unverified Google email with 403', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValueOnce({
      googleId: 'g-2',
      email: 'unverified@studyhub.test',
      emailVerified: false,
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValueOnce(null)
    const res = await request(app).post('/google').send({ credential: 'unverified' })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
    expect(res.body.error).toMatch(/email must be verified/i)
  })

  it('email collision with non-Google user returns 409 with link-from-settings hint', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValueOnce({
      googleId: 'g-3',
      email: 'collide@studyhub.test',
      emailVerified: true,
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValueOnce(null)
    mocks.googleAuth.findUserByEmail.mockResolvedValueOnce({ id: 7, authProvider: 'local' })
    const res = await request(app).post('/google').send({ credential: 'collide' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/link Google from Settings/i)
  })

  it('new user path returns status=needs_role with tempToken', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValueOnce({
      googleId: 'g-4',
      email: 'fresh@studyhub.test',
      emailVerified: true,
      name: 'Fresh User',
      picture: 'https://avatar/4.png',
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValueOnce(null)
    mocks.googleAuth.findUserByEmail.mockResolvedValueOnce(null)
    const res = await request(app).post('/google').send({ credential: 'fresh' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('needs_role')
    expect(typeof res.body.tempToken).toBe('string')
    expect(res.body.email).toBe('fresh@studyhub.test')
  })
})
