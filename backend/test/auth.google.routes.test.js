import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const googleRoutePath = require.resolve('../src/modules/auth/auth.google.controller')

const mocks = vi.hoisted(() => {
  class MockAppError extends Error {
    constructor(statusCode, message) {
      super(message)
      this.statusCode = statusCode
    }
  }

  const tx = {
    user: {
      create: vi.fn(),
    },
  }

  return {
    tx,
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
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
        create: vi.fn().mockResolvedValue({ id: 'test-session-id' }),
      },
      subscription: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      donation: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    },
    googleAuth: {
      verifyGoogleIdToken: vi.fn(),
      findUserByGoogleId: vi.fn(),
      findUserByEmail: vi.fn(),
      isGoogleOAuthEnabled: vi.fn(() => true),
    },
    authConstants: {
      googleLimiter: (_req, _res, next) => next(),
    },
    rateLimiters: {
      googleCompleteLimiter: (_req, _res, next) => next(),
    },
    authService: {
      AppError: MockAppError,
      issueAuthenticatedSession: vi.fn(async (_res, userId) => ({
        id: userId,
        username: 'session_user',
        legalAcceptance: {
          currentVersion: '2026-04-04',
          needsAcceptance: false,
        },
      })),
      handleAuthError: vi.fn((req, res, error) =>
        res.status(error.statusCode || 500).json({
          error: error.message || 'Server error.',
        }),
      ),
    },
    legalService: {
      CURRENT_LEGAL_VERSION: '2026-04-04',
      LEGAL_ACCEPTANCE_SOURCES: {
        GOOGLE_SIGNUP: 'google-signup',
      },
      recordCurrentRequiredLegalAcceptancesTx: vi.fn(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/googleAuth'), mocks.googleAuth],
  [require.resolve('../src/modules/auth/auth.constants'), mocks.authConstants],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/modules/auth/auth.service'), mocks.authService],
  [require.resolve('../src/modules/legal/legal.service'), mocks.legalService],
])

const originalModuleLoad = Module._load

let app

beforeAll(() => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-123'
  }
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[googleRoutePath]
  const routerModule = require(googleRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[googleRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.googleAuth.isGoogleOAuthEnabled.mockReturnValue(true)
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx))
})

describe('auth google route', () => {
  it('allows an existing Google user to sign in without resubmitting legal acceptance', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-1',
      email: 'existing@studyhub.test',
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValue({ id: 9 })

    const response = await request(app).post('/google').send({ credential: 'valid-google-jwt' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: 'Login successful!',
      user: expect.objectContaining({ id: 9 }),
    })
    expect(mocks.authService.issueAuthenticatedSession).toHaveBeenCalledWith(
      expect.anything(),
      9,
      expect.anything(),
    )
  })

  it('returns needs_role with a tempToken for new Google users without creating a row', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-2',
      email: 'new@studyhub.test',
      name: 'New User',
      emailVerified: true,
      picture: 'https://example.com/avatar.png',
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValue(null)
    mocks.googleAuth.findUserByEmail.mockResolvedValue(null)

    const response = await request(app).post('/google').send({ credential: 'valid-google-jwt' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'needs_role',
      email: 'new@studyhub.test',
      name: 'New User',
      avatarUrl: 'https://example.com/avatar.png',
    })
    expect(typeof response.body.tempToken).toBe('string')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.legalService.recordCurrentRequiredLegalAcceptancesTx).not.toHaveBeenCalled()
  })

  it('rejects /google/complete when legal documents are not accepted', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-legal',
      email: 'legal@studyhub.test',
      name: 'Legal User',
      emailVerified: true,
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValue(null)
    mocks.googleAuth.findUserByEmail.mockResolvedValue(null)

    const first = await request(app).post('/google').send({ credential: 'valid-google-jwt' })
    expect(first.status).toBe(200)
    const { tempToken } = first.body

    const complete = await request(app).post('/google/complete').send({
      tempToken,
      accountType: 'student',
      legalAccepted: false,
    })

    expect(complete.status).toBe(400)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects Google sign-in when the Google account email is not verified', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-unverified',
      email: 'new@studyhub.test',
      emailVerified: false,
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValue(null)

    const response = await request(app).post('/google').send({
      credential: 'valid-google-jwt',
      legalAccepted: true,
      legalVersion: '2026-04-04',
    })

    expect(response.status).toBe(403)
    expect(response.body).toEqual({
      error: 'Google account email must be verified before you can sign in.',
    })
  })

  it('creates a new Google account with the chosen accountType via /google/complete', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-3',
      email: 'creator@studyhub.test',
      name: 'Creator User',
      emailVerified: true,
      picture: 'https://example.com/avatar.png',
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValue(null)
    mocks.googleAuth.findUserByEmail.mockResolvedValue(null)
    mocks.tx.user.create.mockResolvedValue({ id: 77 })

    const first = await request(app).post('/google').send({ credential: 'valid-google-jwt' })
    expect(first.status).toBe(200)
    expect(first.body.status).toBe('needs_role')

    const complete = await request(app).post('/google/complete').send({
      tempToken: first.body.tempToken,
      accountType: 'other',
      legalAccepted: true,
      legalVersion: '2026-04-04',
    })

    expect(complete.status).toBe(201)
    expect(complete.body).toMatchObject({
      status: 'signed_in',
      user: expect.objectContaining({ id: 77 }),
      nextRoute: '/onboarding?track=self-learner',
    })

    expect(mocks.tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'creator@studyhub.test',
        googleId: 'google-3',
        avatarUrl: 'https://example.com/avatar.png',
        accountType: 'other',
        termsAcceptedVersion: '2026-04-04',
        termsAcceptedAt: expect.any(Date),
      }),
      select: { id: true },
    })

    expect(mocks.legalService.recordCurrentRequiredLegalAcceptancesTx).toHaveBeenCalledWith(
      mocks.tx,
      77,
      expect.objectContaining({ source: 'google-signup' }),
    )
    expect(mocks.authService.issueAuthenticatedSession).toHaveBeenCalledWith(
      expect.anything(),
      77,
      expect.anything(),
    )
  })

  it('rejects /google/complete with an invalid accountType', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-bad-role',
      email: 'badrole@studyhub.test',
      name: 'Bad Role',
      emailVerified: true,
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValue(null)
    mocks.googleAuth.findUserByEmail.mockResolvedValue(null)

    const first = await request(app).post('/google').send({ credential: 'valid-google-jwt' })
    const complete = await request(app).post('/google/complete').send({
      tempToken: first.body.tempToken,
      accountType: 'ghost',
      legalAccepted: true,
      legalVersion: '2026-04-04',
    })

    expect(complete.status).toBe(400)
  })

  it('rejects /google/complete with a malformed tempToken', async () => {
    const complete = await request(app).post('/google/complete').send({
      tempToken: 'not-a-real-jwt',
      accountType: 'student',
      legalAccepted: true,
      legalVersion: '2026-04-04',
    })

    expect(complete.status).toBe(400)
    expect(complete.body.error).toMatch(/expired|start Google sign-in again/i)
  })

  it('retries username creation on collision during /google/complete', async () => {
    const duplicateUsernameError = new Error('duplicate username')
    duplicateUsernameError.code = 'P2002'
    duplicateUsernameError.meta = { target: ['username'] }

    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-4',
      email: 'retry@studyhub.test',
      name: 'Creator User With A Very Long Name',
      emailVerified: true,
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValue(null)
    mocks.googleAuth.findUserByEmail.mockResolvedValue(null)
    mocks.tx.user.create
      .mockRejectedValueOnce(duplicateUsernameError)
      .mockResolvedValueOnce({ id: 88 })

    const first = await request(app).post('/google').send({ credential: 'valid-google-jwt' })
    expect(first.status).toBe(200)

    const complete = await request(app).post('/google/complete').send({
      tempToken: first.body.tempToken,
      accountType: 'student',
      legalAccepted: true,
      legalVersion: '2026-04-04',
    })

    expect(complete.status).toBe(201)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(mocks.tx.user.create).toHaveBeenCalledTimes(2)
    expect(mocks.tx.user.create.mock.calls[0][0].data.username.length).toBeLessThanOrEqual(20)
    expect(mocks.tx.user.create.mock.calls[1][0].data.username.length).toBeLessThanOrEqual(20)
    expect(mocks.tx.user.create.mock.calls[0][0].data.username).not.toBe(
      mocks.tx.user.create.mock.calls[1][0].data.username,
    )
    expect(mocks.authService.issueAuthenticatedSession).toHaveBeenCalledWith(
      expect.anything(),
      88,
      expect.anything(),
    )
  })
})
