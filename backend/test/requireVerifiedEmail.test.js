import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const middlewarePath = require.resolve('../src/middleware/requireVerifiedEmail')

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
  sentry: {
    captureError: vi.fn(),
  },
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
])

const originalModuleLoad = Module._load
let requireVerifiedEmail

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[middlewarePath]
  requireVerifiedEmail = require(middlewarePath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[middlewarePath]
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireVerifiedEmail', () => {
  it('returns AUTH_REQUIRED when no authenticated user is present', async () => {
    const app = express()
    app.use(requireVerifiedEmail)
    app.post('/mutate', (_req, res) => res.status(200).json({ ok: true }))

    const response = await request(app).post('/mutate')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('returns EMAIL_NOT_VERIFIED with the standard envelope', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ emailVerified: false })

    const app = express()
    app.use((req, _res, next) => {
      req.user = { userId: 42 }
      next()
    })
    app.use(requireVerifiedEmail)
    app.post('/mutate', (_req, res) => res.status(200).json({ ok: true }))

    const response = await request(app).post('/mutate')

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' })
  })
})