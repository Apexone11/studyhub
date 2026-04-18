import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const webauthnRoutePath = require.resolve('../../src/modules/webauthn/webauthn.routes')

const mocks = vi.hoisted(() => {
  const authState = {
    user: { userId: 1, username: 'admin_user', role: 'admin' },
  }

  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    webAuthnCredential: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
  }

  const webauthnLib = {
    generateRegistrationOptions: vi.fn(),
    verifyRegistration: vi.fn(),
    generateAuthenticationOptions: vi.fn(),
    verifyAuthentication: vi.fn(),
  }

  return {
    authState,
    prisma,
    webauthnLib,
    requireAuth: vi.fn((req, res, next) => {
      if (!authState.user) {
        return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
      }
      req.user = authState.user
      next()
    }),
    requireAdmin: vi.fn((req, res, next) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.', code: 'FORBIDDEN' })
      }
      next()
    }),
    authTokens: {
      signAuthToken: vi.fn(() => 'signed-token-xyz'),
      setAuthCookie: vi.fn((res) => res),
      getAuthTokenFromRequest: vi.fn(() => null),
      verifyAuthToken: vi.fn(),
    },
    sentry: {
      captureError: vi.fn(),
    },
    rateLimiters: {
      webauthnLimiter: (_req, _res, next) => next(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), mocks.prisma],
  [require.resolve('../../src/middleware/auth'), mocks.requireAuth],
  [require.resolve('../../src/middleware/requireAdmin'), mocks.requireAdmin],
  [require.resolve('../../src/lib/authTokens'), mocks.authTokens],
  [require.resolve('../../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../../src/lib/webauthn/webauthn'), mocks.webauthnLib],
])

const originalModuleLoad = Module._load

let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[webauthnRoutePath]
  const webauthnRouterModule = require(webauthnRoutePath)
  const webauthnRouter = webauthnRouterModule.default || webauthnRouterModule

  app = express()
  app.use(express.json())
  app.use('/api/webauthn', webauthnRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[webauthnRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.authState.user = { userId: 1, username: 'admin_user', role: 'admin' }
  mocks.prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin_user', role: 'admin' })
  mocks.prisma.webAuthnCredential.findMany.mockResolvedValue([])
  mocks.prisma.webAuthnCredential.findUnique.mockResolvedValue(null)
  mocks.prisma.webAuthnCredential.create.mockResolvedValue({
    id: 10,
    credentialId: 'cred-abc',
    name: 'Passkey',
    deviceType: 'platform',
    backedUp: false,
    createdAt: new Date('2026-04-01T00:00:00Z'),
  })
  mocks.prisma.webAuthnCredential.delete.mockResolvedValue({ id: 10 })
  mocks.prisma.webAuthnCredential.update.mockResolvedValue({ id: 10, counter: 5 })

  mocks.webauthnLib.generateRegistrationOptions.mockReturnValue({
    challenge: 'register-challenge-xyz',
    rp: { name: 'StudyHub', id: 'localhost' },
    rpName: 'StudyHub',
    rpId: 'localhost',
    user: { id: 'base64-uid', name: 'admin_user', displayName: 'admin_user' },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
  })

  mocks.webauthnLib.verifyRegistration.mockReturnValue({
    verified: true,
    credentialId: 'cred-abc',
    publicKey: 'pk-bytes',
    counter: 0,
    deviceType: 'platform',
    backedUp: false,
    transports: ['internal'],
  })

  mocks.webauthnLib.generateAuthenticationOptions.mockReturnValue({
    challenge: 'auth-challenge-xyz',
    rpId: 'localhost',
    allowCredentials: [{ id: 'cred-abc', type: 'public-key', transports: ['internal'] }],
    timeout: 60000,
  })

  mocks.webauthnLib.verifyAuthentication.mockReturnValue({
    verified: true,
    newCounter: 5,
  })
})

describe('POST /api/webauthn/register/options', () => {
  it('returns 401 when there is no authenticated user', async () => {
    mocks.authState.user = null

    const res = await request(app).post('/api/webauthn/register/options').send({})

    expect(res.status).toBe(401)
  })

  it('returns 403 when the authenticated user is not an admin', async () => {
    mocks.authState.user = { userId: 2, username: 'regular_user', role: 'user' }

    const res = await request(app).post('/api/webauthn/register/options').send({})

    expect(res.status).toBe(403)
  })

  it('returns challenge payload with rp info for an admin', async () => {
    const res = await request(app).post('/api/webauthn/register/options').send({})

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      challenge: 'register-challenge-xyz',
      rpName: 'StudyHub',
      rpId: 'localhost',
    })
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { id: true, username: true },
    })
    expect(mocks.webauthnLib.generateRegistrationOptions).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/webauthn/register/verify', () => {
  const validPayload = {
    id: 'cred-abc',
    rawId: 'cred-abc',
    type: 'public-key',
    response: { attestationObject: 'ao', clientDataJSON: 'cdj' },
    transports: ['internal'],
    name: 'My Yubikey',
  }

  it('stores a fresh credential and returns 201', async () => {
    const res = await request(app).post('/api/webauthn/register/verify').send(validPayload)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      message: expect.stringMatching(/registered/i),
      credential: expect.objectContaining({ credentialId: 'cred-abc' }),
    })
    expect(mocks.prisma.webAuthnCredential.create).toHaveBeenCalledTimes(1)
    const createArg = mocks.prisma.webAuthnCredential.create.mock.calls[0][0]
    expect(createArg.data).toMatchObject({
      userId: 1,
      credentialId: 'cred-abc',
      publicKey: 'pk-bytes',
      counter: 0,
      name: 'My Yubikey',
    })
  })

  it('returns 409 when Prisma reports a duplicate credentialId (P2002)', async () => {
    const dupErr = new Error('Unique constraint')
    dupErr.code = 'P2002'
    mocks.prisma.webAuthnCredential.create.mockRejectedValue(dupErr)

    const res = await request(app).post('/api/webauthn/register/verify').send(validPayload)

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already registered/i)
  })

  it('returns 400 when the WebAuthn library fails to verify', async () => {
    mocks.webauthnLib.verifyRegistration.mockReturnValue({
      verified: false,
      error: 'Challenge mismatch.',
    })

    const res = await request(app).post('/api/webauthn/register/verify').send(validPayload)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/challenge mismatch/i)
    expect(mocks.prisma.webAuthnCredential.create).not.toHaveBeenCalled()
  })

  it('returns 400 when the credential payload is missing required fields', async () => {
    const res = await request(app).post('/api/webauthn/register/verify').send({ id: 'cred-abc' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid credential payload/i)
  })
})

describe('POST /api/webauthn/authenticate/options', () => {
  it('returns 400 when username is missing', async () => {
    const res = await request(app).post('/api/webauthn/authenticate/options').send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/username is required/i)
  })

  it('returns challenge + allowCredentials for a valid admin username', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 1, role: 'admin' })
    mocks.prisma.webAuthnCredential.findMany.mockResolvedValue([
      { credentialId: 'cred-abc', transports: 'internal' },
    ])

    const res = await request(app)
      .post('/api/webauthn/authenticate/options')
      .send({ username: 'admin_user' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      challenge: 'auth-challenge-xyz',
      allowCredentials: expect.any(Array),
    })
  })

  it('does not leak user existence for a non-existent username (returns 400, not 404)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/webauthn/authenticate/options')
      .send({ username: 'ghost_user' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not available/i)
    expect(res.status).not.toBe(404)
  })

  it('returns 400 when the user exists but is not admin (WebAuthn is admin-only)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 7, role: 'user' })

    const res = await request(app)
      .post('/api/webauthn/authenticate/options')
      .send({ username: 'regular_user' })

    expect(res.status).toBe(400)
    expect(mocks.webauthnLib.generateAuthenticationOptions).not.toHaveBeenCalled()
  })
})

describe('POST /api/webauthn/authenticate/verify', () => {
  const validPayload = {
    id: 'cred-abc',
    rawId: 'cred-abc',
    type: 'public-key',
    response: { authenticatorData: 'ad', clientDataJSON: 'cdj', signature: 'sig' },
    username: 'admin_user',
  }

  it('updates counter, issues session, and returns user on success', async () => {
    mocks.prisma.user.findUnique
      .mockResolvedValueOnce({ id: 1, username: 'admin_user', role: 'admin' })
      .mockResolvedValueOnce({ id: 1, username: 'admin_user', role: 'admin' })
    mocks.prisma.webAuthnCredential.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      publicKey: 'pk-bytes',
      counter: 0,
    })

    const res = await request(app).post('/api/webauthn/authenticate/verify').send(validPayload)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      message: expect.stringMatching(/successful/i),
      user: { id: 1, username: 'admin_user', role: 'admin' },
    })
    expect(mocks.prisma.webAuthnCredential.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { counter: 5 },
    })
    expect(mocks.authTokens.signAuthToken).toHaveBeenCalledTimes(1)
    expect(mocks.authTokens.setAuthCookie).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when the WebAuthn library reports a counter/replay failure', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin_user', role: 'admin' })
    mocks.prisma.webAuthnCredential.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      publicKey: 'pk-bytes',
      counter: 99,
    })
    mocks.webauthnLib.verifyAuthentication.mockReturnValue({
      verified: false,
      error: 'counter',
    })

    const res = await request(app).post('/api/webauthn/authenticate/verify').send(validPayload)

    expect(res.status).toBe(401)
    expect(mocks.prisma.webAuthnCredential.update).not.toHaveBeenCalled()
    expect(mocks.authTokens.signAuthToken).not.toHaveBeenCalled()
  })

  it('returns 401 when the resolved user is not an admin', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 7,
      username: 'regular_user',
      role: 'user',
    })

    const res = await request(app).post('/api/webauthn/authenticate/verify').send(validPayload)

    expect(res.status).toBe(401)
    expect(mocks.prisma.webAuthnCredential.findUnique).not.toHaveBeenCalled()
  })

  it('returns 401 when the stored credential belongs to a different user', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin_user', role: 'admin' })
    mocks.prisma.webAuthnCredential.findUnique.mockResolvedValue({
      id: 10,
      userId: 999,
      publicKey: 'pk-bytes',
      counter: 0,
    })

    const res = await request(app).post('/api/webauthn/authenticate/verify').send(validPayload)

    expect(res.status).toBe(401)
    expect(mocks.webauthnLib.verifyAuthentication).not.toHaveBeenCalled()
  })
})

describe('GET /api/webauthn/credentials', () => {
  it("returns the authenticated admin user's credentials", async () => {
    mocks.prisma.webAuthnCredential.findMany.mockResolvedValue([
      {
        id: 10,
        credentialId: 'cred-abc',
        name: 'Yubikey',
        deviceType: 'cross-platform',
        backedUp: false,
        createdAt: new Date('2026-04-01T00:00:00Z'),
      },
    ])

    const res = await request(app).get('/api/webauthn/credentials')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      credentials: expect.arrayContaining([
        expect.objectContaining({ credentialId: 'cred-abc', name: 'Yubikey' }),
      ]),
    })
    expect(mocks.prisma.webAuthnCredential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 1 } }),
    )
  })

  it('returns 403 for non-admin users', async () => {
    mocks.authState.user = { userId: 2, username: 'regular_user', role: 'user' }

    const res = await request(app).get('/api/webauthn/credentials')

    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/webauthn/credentials/:id', () => {
  it('returns 403 when the credential is not owned by the authenticated user', async () => {
    mocks.prisma.webAuthnCredential.findUnique.mockResolvedValue({ id: 10, userId: 999 })

    const res = await request(app).delete('/api/webauthn/credentials/10')

    expect(res.status).toBe(403)
    expect(mocks.prisma.webAuthnCredential.delete).not.toHaveBeenCalled()
  })

  it('deletes the credential when owned by the authenticated user', async () => {
    mocks.prisma.webAuthnCredential.findUnique.mockResolvedValue({ id: 10, userId: 1 })

    const res = await request(app).delete('/api/webauthn/credentials/10')

    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/removed/i)
    expect(mocks.prisma.webAuthnCredential.delete).toHaveBeenCalledWith({ where: { id: 10 } })
  })

  it('returns 404 when the credential does not exist', async () => {
    mocks.prisma.webAuthnCredential.findUnique.mockResolvedValue(null)

    const res = await request(app).delete('/api/webauthn/credentials/10')

    expect(res.status).toBe(404)
    expect(mocks.prisma.webAuthnCredential.delete).not.toHaveBeenCalled()
  })

  it('returns 400 when the id param is not an integer', async () => {
    const res = await request(app).delete('/api/webauthn/credentials/not-a-number')

    expect(res.status).toBe(400)
  })
})
