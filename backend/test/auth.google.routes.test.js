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
      handleAuthError: vi.fn((req, res, error) => res.status(error.statusCode || 500).json({
        error: error.message || 'Server error.',
      })),
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
  [require.resolve('../src/modules/auth/auth.service'), mocks.authService],
  [require.resolve('../src/modules/legal/legal.service'), mocks.legalService],
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

    const response = await request(app)
      .post('/google')
      .send({ credential: 'valid-google-jwt' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: 'Login successful!',
      user: expect.objectContaining({ id: 9 }),
    })
    expect(mocks.authService.issueAuthenticatedSession).toHaveBeenCalledWith(expect.anything(), 9)
  })

  it('rejects new Google account creation when the latest legal documents were not accepted', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-2',
      email: 'new@studyhub.test',
      name: 'New User',
      emailVerified: true,
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValue(null)
    mocks.googleAuth.findUserByEmail.mockResolvedValue(null)

    const response = await request(app)
      .post('/google')
      .send({ credential: 'valid-google-jwt', legalAccepted: false, legalVersion: null })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'Please review and accept the latest StudyHub legal documents before creating your Google account.',
    })
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.legalService.recordCurrentRequiredLegalAcceptancesTx).not.toHaveBeenCalled()
  })

  it('rejects Google sign-in when the Google account email is not verified', async () => {
    mocks.googleAuth.verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-unverified',
      email: 'new@studyhub.test',
      emailVerified: false,
    })
    mocks.googleAuth.findUserByGoogleId.mockResolvedValue(null)

    const response = await request(app)
      .post('/google')
      .send({
        credential: 'valid-google-jwt',
        legalAccepted: true,
        legalVersion: '2026-04-04',
      })

    expect(response.status).toBe(403)
    expect(response.body).toEqual({
      error: 'Google account email must be verified before you can sign in.',
    })
  })

  it('creates a new Google account and records current legal acceptances when accepted', async () => {
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

    const response = await request(app)
      .post('/google')
      .send({
        credential: 'valid-google-jwt',
        legalAccepted: true,
        legalVersion: '2026-04-04',
      })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      message: 'Account created with Google!',
      user: expect.objectContaining({ id: 77 }),
    })

    expect(mocks.tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'creator@studyhub.test',
        googleId: 'google-3',
        avatarUrl: 'https://example.com/avatar.png',
        termsAcceptedVersion: '2026-04-04',
        termsAcceptedAt: expect.any(Date),
      }),
      select: { id: true },
    })

    const createArgs = mocks.tx.user.create.mock.calls[0][0]
    expect(mocks.legalService.recordCurrentRequiredLegalAcceptancesTx).toHaveBeenCalledWith(
      mocks.tx,
      77,
      expect.objectContaining({
        acceptedAt: createArgs.data.termsAcceptedAt,
        source: 'google-signup',
      }),
    )
    expect(mocks.authService.issueAuthenticatedSession).toHaveBeenCalledWith(expect.anything(), 77)
  })

  it('retries username creation when a username collision races with account creation', async () => {
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

    const response = await request(app)
      .post('/google')
      .send({
        credential: 'valid-google-jwt',
        legalAccepted: true,
        legalVersion: '2026-04-04',
      })

    expect(response.status).toBe(201)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(mocks.tx.user.create).toHaveBeenCalledTimes(2)
    expect(mocks.tx.user.create.mock.calls[0][0].data.username.length).toBeLessThanOrEqual(20)
    expect(mocks.tx.user.create.mock.calls[1][0].data.username.length).toBeLessThanOrEqual(20)
    expect(mocks.tx.user.create.mock.calls[0][0].data.username).not.toBe(mocks.tx.user.create.mock.calls[1][0].data.username)
    expect(mocks.authService.issueAuthenticatedSession).toHaveBeenCalledWith(expect.anything(), 88)
  })
})