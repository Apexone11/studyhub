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
    },
    passwordResetToken: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    school: {
      findUnique: vi.fn(),
    },
    course: {
      findMany: vi.fn(),
    },
    verificationChallenge: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    prisma,
    email: {
      sendEmailVerification: vi.fn(),
      sendPasswordReset: vi.fn(),
      sendTwoFaCode: vi.fn(),
    },
    authTokens: {
      clearAuthCookie: vi.fn(),
      hashStoredSecret: vi.fn((value) => `hash:${value}`),
      setAuthCookie: vi.fn((response, token) => response.cookie('studyhub_session', token)),
      signAuthToken: vi.fn(() => 'signed-token'),
      signCsrfToken: vi.fn(() => 'csrf-token'),
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
    sentry: {
      captureError: vi.fn(),
    },
    trustGate: {
      checkAndPromoteTrust: vi.fn().mockResolvedValue({ promoted: false, trustLevel: 'new' }),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/email/email'), mocks.email],
  [require.resolve('../src/lib/authTokens'), mocks.authTokens],
  [require.resolve('../src/lib/verification/verificationChallenges'), mocks.verification],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/trustGate'), mocks.trustGate],
])

const originalModuleLoad = Module._load

let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[authRoutePath]
  const authRouterModule = require(authRoutePath)
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
  vi.clearAllMocks()
  mocks.prisma.user.update.mockResolvedValue({})
  mocks.email.sendEmailVerification.mockResolvedValue({})
  mocks.email.sendPasswordReset.mockResolvedValue({})
  mocks.email.sendTwoFaCode.mockResolvedValue({})
})

describe('auth routes', () => {
  it('logs in unverified users without sending a login verification email', async () => {
    const passwordHash = await bcrypt.hash('Password123', 4)

    const loginUser = {
      id: 11,
      username: 'delivery_down',
      passwordHash,
      email: 'delivery_down@studyhub.test',
      emailVerified: false,
      failedAttempts: 0,
      lockedUntil: null,
      twoFaEnabled: false,
      role: 'student',
    }

    mocks.prisma.user.findUnique.mockResolvedValue({
      ...loginUser,
    })

    const deliveryError = new Error('smtp unavailable')
    mocks.email.sendEmailVerification.mockRejectedValue(deliveryError)

    const response = await request(app)
      .post('/login')
      .send({ username: 'delivery_down', password: 'Password123' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: 'Login successful!',
      user: {
        id: loginUser.id,
        username: loginUser.username,
        email: loginUser.email,
        emailVerified: false,
      },
    })
    expect(response.headers['set-cookie']).toBeDefined()
    expect(mocks.email.sendEmailVerification).not.toHaveBeenCalled()
    expect(mocks.verification.createOrRefreshLoginChallenge).not.toHaveBeenCalled()
    expect(mocks.sentry.captureError).not.toHaveBeenCalled()
  })

  it('creates a session for legacy users instead of returning a verification gate', async () => {
    const passwordHash = await bcrypt.hash('Password123', 4)

    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 1,
      username: 'legacy_user',
      passwordHash,
      email: 'legacy_user@studyhub.test',
      emailVerified: false,
      failedAttempts: 0,
      lockedUntil: null,
      twoFaEnabled: false,
      role: 'student',
    })

    const response = await request(app)
      .post('/login')
      .send({ username: 'legacy_user', password: 'Password123' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: 'Login successful!',
      user: {
        username: 'legacy_user',
        email: 'legacy_user@studyhub.test',
        emailVerified: false,
      },
    })
    expect(response.body.requiresEmailVerification).toBeUndefined()
    expect(response.headers['set-cookie']).toBeDefined()
    expect(mocks.email.sendEmailVerification).not.toHaveBeenCalled()
  })

  it('cleans up signup challenge when verification email delivery fails', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce(null)
    mocks.prisma.user.findUnique.mockResolvedValueOnce(null)

    mocks.verification.createSignupChallenge.mockResolvedValue({
      challenge: {
        id: 901,
        token: 'signup-token',
        username: 'signup_user',
        email: 'signup_user@studyhub.test',
        expiresAt: new Date('2026-03-16T12:15:00.000Z'),
      },
      code: '654321',
    })

    const deliveryError = new Error('provider outage')
    mocks.email.sendEmailVerification.mockRejectedValue(deliveryError)

    const response = await request(app)
      .post('/register/start')
      .send({
        username: 'signup_user',
        email: 'signup_user@studyhub.test',
        password: 'Password123',
        confirmPassword: 'Password123',
        termsAccepted: true,
      })

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'We could not send your verification code right now. Please try again later.',
    })
    expect(mocks.verification.consumeChallenge).toHaveBeenCalledWith(901)
    expect(mocks.sentry.captureError).toHaveBeenCalledWith(deliveryError, expect.objectContaining({
      source: 'sendEmailVerification',
      purpose: 'signup',
    }))
  })

  it('creates a session for legacy users even when no email is stored', async () => {
    const passwordHash = await bcrypt.hash('Password123', 4)

    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 2,
      username: 'missing_email',
      passwordHash,
      email: null,
      emailVerified: false,
      failedAttempts: 0,
      lockedUntil: null,
      twoFaEnabled: false,
      role: 'student',
    })

    const response = await request(app)
      .post('/login')
      .send({ username: 'missing_email', password: 'Password123' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: 'Login successful!',
      user: {
        username: 'missing_email',
        email: null,
        emailVerified: false,
      },
    })
    expect(response.body.requiresEmailVerification).toBeUndefined()
    expect(response.headers['set-cookie']).toBeDefined()
    expect(mocks.email.sendEmailVerification).not.toHaveBeenCalled()
  })

  it('creates a session without a 2FA gate when the user has 2FA enabled', async () => {
    const passwordHash = await bcrypt.hash('Password123', 4)

    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 3,
      username: 'secure_user',
      passwordHash,
      email: 'secure_user@studyhub.test',
      emailVerified: true,
      failedAttempts: 0,
      lockedUntil: null,
      twoFaEnabled: true,
      role: 'student',
    })

    const response = await request(app)
      .post('/login')
      .send({ username: 'secure_user', password: 'Password123' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: 'Login successful!',
      user: {
        username: 'secure_user',
        email: 'secure_user@studyhub.test',
        emailVerified: true,
      },
    })
    expect(response.body.requires2fa).toBeUndefined()
    expect(response.headers['set-cookie']).toBeDefined()
    expect(mocks.email.sendTwoFaCode).not.toHaveBeenCalled()
  })

  it('sends forgot-password email to any user with an email address', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 4,
      username: 'unverified_user',
      email: 'unverified_user@studyhub.test',
      emailVerified: false,
    })

    const response = await request(app)
      .post('/forgot-password')
      .send({ username: 'unverified_user' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'If an account exists with that username or email, a reset link has been sent.',
    })
    expect(mocks.email.sendPasswordReset).toHaveBeenCalledWith(
      'unverified_user@studyhub.test',
      'unverified_user',
      expect.stringContaining('/reset-password?token='),
    )
  })

  it('returns generic message for forgot-password when user has no email', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 5,
      username: 'no_email_user',
      email: null,
      emailVerified: false,
    })

    const response = await request(app)
      .post('/forgot-password')
      .send({ username: 'no_email_user' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'If an account exists with that username or email, a reset link has been sent.',
    })
    expect(mocks.email.sendPasswordReset).not.toHaveBeenCalled()
  })
})