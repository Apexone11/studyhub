import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const routePath = require.resolve('../src/modules/creatorAudit')

const mocks = vi.hoisted(() => ({
  controller: {
    runCreatorAudit: vi.fn((_req, res) => res.json({ ok: true })),
    getConsent: vi.fn((_req, res) => res.json({ accepted: false })),
    acceptConsent: vi.fn((req, res) =>
      res.status(201).json({ accepted: true, docVersion: req.body.docVersion }),
    ),
    revokeConsent: vi.fn((_req, res) => res.json({ accepted: false })),
  },
}))

let authedUserId = 1
function fakeAuth(req, res, next) {
  if (authedUserId == null) return res.status(401).json({ error: 'Unauthorized' })
  req.user = { userId: authedUserId, role: 'student' }
  next()
}

let originAllowed = true
function fakeOriginAllowlistFactory() {
  return function fakeOriginAllowlist(_req, res, next) {
    if (!originAllowed) return res.status(403).json({ error: 'Forbidden origin' })
    next()
  }
}

function fakeRateLimiter(_req, _res, next) {
  next()
}

const mockTargets = new Map([
  [require.resolve('../src/modules/creatorAudit/creatorAudit.controller'), mocks.controller],
  [require.resolve('../src/middleware/auth'), fakeAuth],
  [require.resolve('../src/middleware/originAllowlist'), fakeOriginAllowlistFactory],
  [
    require.resolve('../src/lib/rateLimiters'),
    {
      creatorAuditRunLimiter: fakeRateLimiter,
      creatorAuditConsentLimiter: fakeRateLimiter,
      creatorAuditConsentReadLimiter: fakeRateLimiter,
    },
  ],
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

  delete require.cache[routePath]
  const creatorAuditRouter = require('../src/modules/creatorAudit')
  app = express()
  app.use(express.json())
  app.use('/', creatorAuditRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
})

beforeEach(() => {
  vi.clearAllMocks()
  authedUserId = 1
  originAllowed = true
})

describe('Creator Audit routes', () => {
  it('requires auth for consent reads', async () => {
    authedUserId = null

    const res = await request(app).get('/consent')

    expect(res.status).toBe(401)
    expect(mocks.controller.getConsent).not.toHaveBeenCalled()
  })

  it('returns consent for authenticated users', async () => {
    const res = await request(app).get('/consent')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ accepted: false })
    expect(mocks.controller.getConsent).toHaveBeenCalledTimes(1)
  })

  it('blocks audit runs from untrusted origins before the controller', async () => {
    originAllowed = false

    const res = await request(app).post('/run').send({ entityType: 'sheet', entityId: 1 })

    expect(res.status).toBe(403)
    expect(mocks.controller.runCreatorAudit).not.toHaveBeenCalled()
  })

  it('validates audit body shape before the controller', async () => {
    const res = await request(app).post('/run').send({ entityType: 'video', entityId: '1' })

    expect(res.status).toBe(400)
    expect(mocks.controller.runCreatorAudit).not.toHaveBeenCalled()
  })

  it('runs audits for valid sheet, note, and material requests', async () => {
    for (const entityType of ['sheet', 'note', 'material']) {
      const res = await request(app).post('/run').send({ entityType, entityId: 12 })
      expect(res.status).toBe(200)
    }

    expect(mocks.controller.runCreatorAudit).toHaveBeenCalledTimes(3)
  })

  it('allows stale consent document versions through validation for controller conflict handling', async () => {
    const res = await request(app).post('/consent').send({ docVersion: 'old-version' })

    expect(res.status).toBe(201)
    expect(res.body.docVersion).toBe('old-version')
    expect(mocks.controller.acceptConsent).toHaveBeenCalledTimes(1)
  })

  it('blocks consent writes from untrusted origins', async () => {
    originAllowed = false

    const res = await request(app).post('/consent').send({ docVersion: '2026.04' })

    expect(res.status).toBe(403)
    expect(mocks.controller.acceptConsent).not.toHaveBeenCalled()
  })

  it('revokes consent on trusted delete requests', async () => {
    const res = await request(app).delete('/consent')

    expect(res.status).toBe(200)
    expect(mocks.controller.revokeConsent).toHaveBeenCalledTimes(1)
  })
})
