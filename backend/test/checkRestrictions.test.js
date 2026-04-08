import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const middlewarePath = require.resolve('../src/middleware/checkRestrictions')

const mocks = vi.hoisted(() => ({
  prisma: {
    userRestriction: {
      findFirst: vi.fn(),
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
let checkRestrictions

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[middlewarePath]
  checkRestrictions = require(middlewarePath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[middlewarePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.userRestriction.findFirst.mockResolvedValue(null)
})

describe('checkRestrictions', () => {
  it('allows authenticated logout requests without querying restrictions', async () => {
    const app = express()
    app.use((req, _res, next) => {
      req.user = { userId: 42, role: 'student' }
      next()
    })
    app.use(checkRestrictions)
    app.post('/api/auth/logout', (_req, res) => res.status(200).json({ ok: true }))

    const response = await request(app).post('/api/auth/logout')

    expect(response.status).toBe(200)
    expect(mocks.prisma.userRestriction.findFirst).not.toHaveBeenCalled()
  })

  it('blocks restricted users from content mutations', async () => {
    mocks.prisma.userRestriction.findFirst.mockResolvedValue({
      id: 1,
      type: 'posting',
      reason: 'spam',
    })

    const app = express()
    app.use((req, _res, next) => {
      req.user = { userId: 42, role: 'student' }
      next()
    })
    app.use(checkRestrictions)
    app.post('/api/feed/posts', (_req, res) => res.status(200).json({ ok: true }))

    const response = await request(app).post('/api/feed/posts')

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      code: 'ACCOUNT_RESTRICTED',
      restricted: true,
    })
  })
})