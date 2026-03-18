import Module, { createRequire } from 'node:module'
import bcrypt from 'bcryptjs'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const authRoutePath = require.resolve('../src/routes/auth')

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
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/email'), mocks.email],
  [require.resolve('../src/lib/authTokens'), mocks.authTokens],
  [require.resolve('../src/lib/verificationChallenges'), mocks.verification],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
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
  it('returns 503 when login verification email cannot be delivered', async () => {
    const passwordHash = await bcrypt.hash('Password123', 4)

    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 11,
      username: 'delivery_down',
      passwordHash,
      email: 'delivery_down@studyhub.test',
      emailVerified: false,
      failedAttempts: 0,
      lockedUntil: null,
      twoFaEnabled: false,
    })

    mocks.verification.createOrRefreshLoginChallenge.mockResolvedValue({
      challenge: {
        id: 801,
        token: 'delivery-down-token',
        email: 'delivery_down@studyhub.test',
        expiresAt: new Date('2026-03-16T12:15:00.000Z'),
      },
      code: '123456',
      didSend: true,
    })

    const deliveryError = new Error('smtp unavailable')
    mocks.email.sendEmailVerification.mockRejectedValue(deliveryError)

    const response = await request(app)
      .post('/login')
      .send({ username: 'delivery_down', password: 'Password123' })

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      error: 'We could not send your verification code right now. Please try again later.',
    })
    expect(mocks.sentry.captureError).toHaveBeenCalledWith(deliveryError, expect.objectContaining({
      source: 'sendEmailVerification',
      purpose: 'login-email',
    }))
  })

  it('gates unverified users behind email verification before creating a session', async () => {
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
    })
    mocks.verification.createOrRefreshLoginChallenge.mockResolvedValue({
      challenge: {
        id: 77,
        token: 'login-token',
        email: 'legacy_user@studyhub.test',
        expiresAt: new Date('2026-03-16T12:15:00.000Z'),
        deliveryHint: 'le***@studyhub.test',
      },
      code: '654321',
      didSend: true,
    })

    const response = await request(app)
      .post('/login')
      .send({ username: 'legacy_user', password: 'Password123' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      requiresEmailVerification: true,
      verificationToken: 'login-token',
      emailRequired: false,
      codeSent: true,
    })
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(mocks.email.sendEmailVerification).toHaveBeenCalledWith(
      'legacy_user@studyhub.test',
      'legacy_user',
      '654321',
    )
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

  it('returns an email-required verification gate for legacy users without an email address', async () => {
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
    })
    mocks.verification.createOrRefreshLoginChallenge.mockResolvedValue({
      challenge: {
        id: 78,
        token: 'email-required-token',
        email: null,
        expiresAt: new Date('2026-03-16T12:15:00.000Z'),
      },
      code: null,
      didSend: false,
    })

    const response = await request(app)
      .post('/login')
      .send({ username: 'missing_email', password: 'Password123' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      requiresEmailVerification: true,
      verificationToken: 'email-required-token',
      emailRequired: true,
      codeSent: false,
    })
    expect(mocks.email.sendEmailVerification).not.toHaveBeenCalled()
  })

  it('returns 2FA only after verified-email checks already pass', async () => {
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
    })

    const response = await request(app)
      .post('/login')
      .send({ username: 'secure_user', password: 'Password123' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      requires2fa: true,
      username: 'secure_user',
      deliveryHint: expect.any(String),
    })
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(mocks.email.sendTwoFaCode).toHaveBeenCalledTimes(1)
  })

  it('keeps forgot-password restricted to verified emails', async () => {
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
      message: 'If we have a verified email on file for that account, a reset link has been sent.',
    })
    expect(mocks.email.sendPasswordReset).not.toHaveBeenCalled()
  })
})