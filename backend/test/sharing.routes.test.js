import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const sharingRoutePath = require.resolve('../src/modules/sharing')

/* ── Mock factory ──────────────────────────────────────────────────────── */
const mocks = vi.hoisted(() => {
  const state = { userId: 42, username: 'test_user', role: 'student' }

  const prisma = {
    shareLink: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    contentShare: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    studySheet: {
      findUnique: vi.fn(),
    },
    note: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId, username: state.username, role: state.role }
      next()
    }),
    optionalAuth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId, username: state.username, role: state.role }
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    rateLimiters: {
      sharingReadLimiter: (_req, _res, next) => next(),
      sharingMutateLimiter: (_req, _res, next) => next(),
    },
    accessControl: {
      assertOwnerOrAdmin: vi.fn((_req, _res, _resourceUserId) => true),
    },
    blockFilter: {
      isBlockedEitherWay: vi.fn().mockResolvedValue(false),
    },
    watermark: {
      watermarkHtml: vi.fn((html) => html),
      watermarkText: vi.fn((text) => text),
    },
  }
})

/* ── Wire mock targets ────────────────────────────────────────────────── */
const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/core/auth/optionalAuth'), mocks.optionalAuth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
  [require.resolve('../src/lib/watermark'), mocks.watermark],
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

  delete require.cache[sharingRoutePath]
  const routesPath = require.resolve('../src/modules/sharing/sharing.routes')
  delete require.cache[routesPath]

  const routerModule = require(sharingRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[sharingRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.username = 'test_user'
  mocks.state.role = 'student'
})

/* ── Share Links ───────────────────────────────────────────────────────── */

describe('GET /links', () => {
  it('returns share links for authenticated user', async () => {
    mocks.prisma.shareLink.findMany.mockResolvedValue([
      { id: 1, token: 'abc123', contentType: 'sheet', contentId: 1, createdAt: new Date() },
    ])

    const res = await request(app).get('/links')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })

  it('returns 500 on database error', async () => {
    mocks.prisma.shareLink.findMany.mockRejectedValue(new Error('DB error'))
    const res = await request(app).get('/links')
    expect(res.status).toBe(500)
  })
})

describe('POST /links', () => {
  it('creates a share link for own sheet', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValue({ id: 1, userId: 42 })
    mocks.prisma.shareLink.count.mockResolvedValue(0)
    mocks.prisma.shareLink.create.mockResolvedValue({
      id: 1, token: 'abc123', contentType: 'sheet', contentId: 1,
      url: 'https://studyhub.com/s/abc123', permission: 'view',
    })

    const res = await request(app)
      .post('/links')
      .send({ contentType: 'sheet', contentId: 1, permission: 'view' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBe('abc123')
  })

  it('rejects missing contentType', async () => {
    const res = await request(app)
      .post('/links')
      .send({ contentId: 1, permission: 'view' })
    expect(res.status).toBe(400)
  })

  it('rejects missing permission', async () => {
    const res = await request(app)
      .post('/links')
      .send({ contentType: 'sheet', contentId: 1 })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /links/:id', () => {
  it('deletes own share link', async () => {
    mocks.prisma.shareLink.findUnique.mockResolvedValue({ id: 1, userId: 42 })
    mocks.prisma.shareLink.delete.mockResolvedValue({ id: 1 })

    const res = await request(app).delete('/links/1')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 404 for non-existent link', async () => {
    mocks.prisma.shareLink.findUnique.mockResolvedValue(null)
    const res = await request(app).delete('/links/999')
    expect(res.status).toBe(404)
  })
})

/* ── Direct Share ──────────────────────────────────────────────────────── */

describe('GET /shared-with-me', () => {
  it('returns items shared with the user', async () => {
    mocks.prisma.contentShare.findMany.mockResolvedValue([
      { id: 1, contentType: 'sheet', contentId: 1, sharedBy: { username: 'alice' } },
    ])

    const res = await request(app).get('/shared-with-me')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })
})
