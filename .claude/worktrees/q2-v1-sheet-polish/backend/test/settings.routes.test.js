import Module, { createRequire } from 'node:module'
import bcrypt from 'bcryptjs'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const settingsRoutePath = require.resolve('../src/modules/settings')

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    userPreferences: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    school: {
      findUnique: vi.fn(),
    },
    course: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    enrollment: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    authTokens: {
      signAuthToken: vi.fn(() => 'new-token'),
      setAuthCookie: vi.fn((res, token) => res.cookie('studyhub_session', token)),
    },
    email: {
      sendEmailVerification: vi.fn(),
    },
    deleteUserAccount: {
      deleteUserAccount: vi.fn(),
    },
    verification: {
      VERIFICATION_PURPOSE: {
        SIGNUP: 'signup',
        LOGIN_EMAIL: 'login-email',
        SETTINGS_EMAIL: 'settings-email',
      },
      VerificationError: class VerificationError extends Error {
        constructor(statusCode, message) {
          super(message)
          this.statusCode = statusCode
        }
      },
      consumeChallenge: vi.fn(),
      createSettingsEmailChallenge: vi.fn(),
      getUserActiveChallenge: vi.fn(),
      mapChallengeForClient: vi.fn(() => ({
        verificationToken: 'token',
        expiresAt: new Date(),
        resendAvailableAt: new Date(),
        deliveryHint: '',
        emailRequired: false,
        email: null,
      })),
      resendSettingsEmailChallenge: vi.fn(),
      verifyChallengeCode: vi.fn(),
    },
    emailValidation: {
      isValidEmailAddress: vi.fn(() => true),
    },
    googleAuth: {
      verifyGoogleIdToken: vi.fn(),
      findUserByGoogleId: vi.fn(),
      linkGoogleToUser: vi.fn(),
      unlinkGoogleFromUser: vi.fn(),
      isGoogleOAuthEnabled: vi.fn(() => false),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/authTokens'), mocks.authTokens],
  [require.resolve('../src/lib/email'), mocks.email],
  [require.resolve('../src/lib/deleteUserAccount'), mocks.deleteUserAccount],
  [require.resolve('../src/lib/verificationChallenges'), mocks.verification],
  [require.resolve('../src/lib/emailValidation'), mocks.emailValidation],
  [require.resolve('../src/lib/googleAuth'), mocks.googleAuth],
])

const originalModuleLoad = Module._load

let app
let passwordHash

beforeAll(async () => {
  passwordHash = await bcrypt.hash('Password123', 4)

  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[settingsRoutePath]
  const routerModule = require(settingsRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[settingsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()

  mocks.verification.getUserActiveChallenge.mockResolvedValue(null)
  mocks.prisma.$transaction.mockImplementation(async (fn) => fn(mocks.prisma))
})

describe('settings routes', () => {
  describe('GET /me', () => {
    it('returns user settings profile', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 42,
        username: 'test_user',
        role: 'student',
        email: 'test@studyhub.test',
        emailVerified: true,
        avatarUrl: null,
        authProvider: 'local',
        googleId: null,
        createdAt: new Date(),
        enrollments: [],
        _count: { studySheets: 5, enrollments: 2 },
      })

      const response = await request(app).get('/me')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        id: 42,
        username: 'test_user',
        email: 'test@studyhub.test',
        emailVerified: true,
      })
    })

    it('returns 404 when user does not exist', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue(null)

      const response = await request(app).get('/me')

      expect(response.status).toBe(404)
      expect(response.body).toMatchObject({ error: 'User not found.' })
    })
  })

  describe('PATCH /password', () => {
    it('changes password successfully', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 42,
        passwordHash,
      })
      mocks.prisma.user.update.mockResolvedValue({})

      const response = await request(app)
        .patch('/password')
        .send({ currentPassword: 'Password123', newPassword: 'NewPassword1' })

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ message: 'Password updated successfully.' })
    })

    it('requires both current and new password', async () => {
      const response = await request(app)
        .patch('/password')
        .send({ currentPassword: 'Password123' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'Current and new password are required.',
      })
    })

    it('validates new password length', async () => {
      const response = await request(app)
        .patch('/password')
        .send({ currentPassword: 'Password123', newPassword: 'short' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'New password must be at least 8 characters.',
      })
    })

    it('validates new password complexity', async () => {
      const response = await request(app)
        .patch('/password')
        .send({ currentPassword: 'Password123', newPassword: 'alllowercase' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'New password must include at least one capital letter and one number.',
      })
    })

    it('rejects when new password matches current', async () => {
      const response = await request(app)
        .patch('/password')
        .send({ currentPassword: 'Password123', newPassword: 'Password123' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'New password must be different from current password.',
      })
    })

    it('rejects incorrect current password', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 42,
        passwordHash,
      })

      const response = await request(app)
        .patch('/password')
        .send({ currentPassword: 'WrongPassword1', newPassword: 'NewPassword1' })

      expect(response.status).toBe(401)
      expect(response.body).toMatchObject({ error: 'Current password is incorrect.' })
    })
  })

  describe('GET /preferences', () => {
    it('returns user preferences', async () => {
      mocks.prisma.userPreferences.findUnique.mockResolvedValue({
        id: 1,
        userId: 42,
        profileVisibility: 'public',
        theme: 'system',
        emailDigest: true,
        inAppNotifications: true,
      })

      const response = await request(app).get('/preferences')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        profileVisibility: 'public',
        theme: 'system',
      })
      // Should not include internal fields
      expect(response.body.id).toBeUndefined()
      expect(response.body.userId).toBeUndefined()
    })

    it('creates default preferences if none exist', async () => {
      mocks.prisma.userPreferences.findUnique.mockResolvedValue(null)
      mocks.prisma.userPreferences.create.mockResolvedValue({
        id: 1,
        userId: 42,
        profileVisibility: 'public',
        theme: 'system',
        emailDigest: true,
      })

      const response = await request(app).get('/preferences')

      expect(response.status).toBe(200)
      expect(mocks.prisma.userPreferences.create).toHaveBeenCalledWith({
        data: { userId: 42 },
      })
    })
  })

  describe('PATCH /preferences', () => {
    it('updates preferences with valid fields', async () => {
      mocks.prisma.userPreferences.upsert.mockResolvedValue({
        id: 1,
        userId: 42,
        profileVisibility: 'private',
        theme: 'dark',
        emailDigest: false,
      })

      const response = await request(app)
        .patch('/preferences')
        .send({ profileVisibility: 'private', theme: 'dark', emailDigest: false })

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        message: 'Preferences saved.',
        preferences: expect.objectContaining({
          profileVisibility: 'private',
          theme: 'dark',
        }),
      })
    })

    it('rejects when no valid preference fields are provided', async () => {
      const response = await request(app)
        .patch('/preferences')
        .send({ invalidKey: 'value' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'No valid preference fields provided.',
      })
    })

    it('ignores invalid enum values', async () => {
      const response = await request(app)
        .patch('/preferences')
        .send({ profileVisibility: 'invisible', theme: 'neon' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'No valid preference fields provided.',
      })
    })
  })

  describe('DELETE /account', () => {
    it('deletes account with valid password and reason', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 42,
        username: 'test_user',
        passwordHash,
      })
      mocks.deleteUserAccount.deleteUserAccount.mockResolvedValue()

      const response = await request(app)
        .delete('/account')
        .send({ password: 'Password123', reason: 'leaving' })

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ message: 'Account deleted.' })
      expect(mocks.deleteUserAccount.deleteUserAccount).toHaveBeenCalledWith(
        mocks.prisma,
        expect.objectContaining({
          userId: 42,
          username: 'test_user',
          reason: 'leaving',
        }),
      )
    })

    it('requires password', async () => {
      const response = await request(app)
        .delete('/account')
        .send({ reason: 'leaving' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'Password is required to delete your account.',
      })
    })

    it('requires reason', async () => {
      const response = await request(app)
        .delete('/account')
        .send({ password: 'Password123' })

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        error: 'Please select a reason for leaving.',
      })
    })

    it('rejects incorrect password', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 42,
        username: 'test_user',
        passwordHash,
      })

      const response = await request(app)
        .delete('/account')
        .send({ password: 'WrongPassword1', reason: 'leaving' })

      expect(response.status).toBe(401)
      expect(response.body).toMatchObject({ error: 'Password is incorrect.' })
      expect(mocks.deleteUserAccount.deleteUserAccount).not.toHaveBeenCalled()
    })
  })
})
