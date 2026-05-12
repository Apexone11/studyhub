/**
 * Deep test coverage — download endpoints on /api/sheets/:id.
 *
 * Covers allowDownloads gate (A6 backend enforcement), download counter,
 * markdown vs html content-type, safe filename quoting, and the POST tracker.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/sheets/sheets.downloads.controller')

const mocks = vi.hoisted(() => {
  const state = { user: { userId: 1, username: 'tester', role: 'student' } }
  const prisma = {
    studySheet: { findUnique: vi.fn(), update: vi.fn() },
  }
  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      if (!state.user) return _res.status(401).json({ error: 'Login required.' })
      req.user = { ...state.user }
      next()
    }),
    sentry: { captureError: vi.fn() },
    sheetsService: {
      canReadSheet: vi.fn((sheet, user) => {
        if (sheet?.status === 'published') return true
        return Boolean(user && (user.role === 'admin' || user.userId === sheet?.userId))
      }),
      safeDownloadName: vi.fn((name, ext) =>
        `${String(name).replace(/[^a-z0-9_-]/gi, '_')}${ext}`.toLowerCase(),
      ),
    },
    accessControl: { sendForbidden: (res, msg) => res.status(403).json({ error: msg }) },
    storage: { resolveAttachmentPath: vi.fn() },
    attachmentPreview: { sendAttachmentPreview: vi.fn() },
    sheetsConstants: {
      attachmentDownloadLimiter: (_req, _res, next) => next(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/core/db/prisma'), mocks.prisma],
  [require.resolve('../src/core/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/core/auth/requireAuth'), mocks.auth],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/storage'), mocks.storage],
  [require.resolve('../src/lib/attachmentPreview'), mocks.attachmentPreview],
  [require.resolve('../src/modules/sheets/sheets.service'), mocks.sheetsService],
  [require.resolve('../src/modules/sheets/sheets.constants'), mocks.sheetsConstants],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    try {
      const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
      const mockedModule = mockTargets.get(resolvedRequest)
      if (mockedModule) return mockedModule
    } catch {
      /* fall through */
    }
    return originalModuleLoad.apply(this, arguments)
  }
  delete require.cache[controllerPath]
  const routerModule = require(controllerPath)
  const router = routerModule.default || routerModule
  app = express()
  app.use(express.json())
  // Inject req.user globally so non-auth-required routes (the GET /:id/download
  // path is public — only requires the rate limiter) can still see the
  // current test's authenticated user. Production sets this via the
  // pino/jwt cookie middleware on every request.
  app.use((req, _res, next) => {
    if (mocks.state.user) req.user = { ...mocks.state.user }
    next()
  })
  app.use('/api/sheets', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[controllerPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.studySheet.findUnique.mockReset()
  mocks.prisma.studySheet.update.mockReset()
  mocks.state.user = { userId: 1, username: 'tester', role: 'student' }
  mocks.sheetsService.canReadSheet.mockImplementation((sheet, user) => {
    if (sheet?.status === 'published') return true
    return Boolean(user && (user.role === 'admin' || user.userId === sheet?.userId))
  })
  mocks.sheetsService.safeDownloadName.mockImplementation((name, ext) =>
    `${String(name).replace(/[^a-z0-9_-]/gi, '_')}${ext}`.toLowerCase(),
  )
})

function pubSheet(overrides = {}) {
  return {
    id: 10,
    userId: 1,
    title: 'Calculus',
    content: '# Hi',
    contentFormat: 'markdown',
    status: 'published',
    allowDownloads: true,
    ...overrides,
  }
}

describe('GET /api/sheets/:id/download', () => {
  it('200 + markdown content-type for markdown sheets', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.studySheet.update.mockResolvedValueOnce({})
    const res = await request(app).get('/api/sheets/10/download')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/markdown/)
    // Atomic increment of the counter
    expect(mocks.prisma.studySheet.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { downloads: { increment: 1 } },
    })
  })

  it('200 + html content-type for html sheets', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet({ contentFormat: 'html' }))
    mocks.prisma.studySheet.update.mockResolvedValueOnce({})
    const res = await request(app).get('/api/sheets/10/download')
    expect(res.headers['content-type']).toMatch(/text\/html/)
  })

  it('403 when allowDownloads=false and viewer is NOT owner/admin (A6)', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      pubSheet({ allowDownloads: false, userId: 1 }),
    )
    const res = await request(app).get('/api/sheets/10/download')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/disabled/i)
    expect(mocks.prisma.studySheet.update).not.toHaveBeenCalled()
  })

  it('200 when allowDownloads=false but viewer IS the owner', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      pubSheet({ allowDownloads: false, userId: 1 }),
    )
    mocks.prisma.studySheet.update.mockResolvedValueOnce({})
    const res = await request(app).get('/api/sheets/10/download')
    expect(res.status).toBe(200)
  })

  it('200 when allowDownloads=false but viewer is admin', async () => {
    mocks.state.user = { userId: 999, username: 'admin', role: 'admin' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      pubSheet({ allowDownloads: false, userId: 1 }),
    )
    mocks.prisma.studySheet.update.mockResolvedValueOnce({})
    const res = await request(app).get('/api/sheets/10/download')
    expect(res.status).toBe(200)
  })

  it('404 when sheet does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/sheets/9999/download')
    expect(res.status).toBe(404)
  })

  it('A12: 400 on non-integer id', async () => {
    const res = await request(app).get('/api/sheets/abc/download')
    expect(res.status).toBe(400)
  })

  it('Content-Security-Policy default-src none header is set on response', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.studySheet.update.mockResolvedValueOnce({})
    const res = await request(app).get('/api/sheets/10/download')
    expect(res.headers['content-security-policy']).toMatch(/default-src 'none'/)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })
})

describe('POST /api/sheets/:id/download (tracker)', () => {
  it('200 + increments downloads', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.studySheet.update.mockResolvedValueOnce({ downloads: 5 })
    const res = await request(app).post('/api/sheets/10/download').send({})
    expect(res.status).toBe(200)
    expect(res.body.downloads).toBe(5)
    expect(mocks.prisma.studySheet.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { downloads: { increment: 1 } },
      select: { downloads: true },
    })
  })

  it('403 when allowDownloads=false for non-owner', async () => {
    mocks.state.user = { userId: 999, username: 'other', role: 'student' }
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      pubSheet({ allowDownloads: false, userId: 1 }),
    )
    const res = await request(app).post('/api/sheets/10/download').send({})
    expect(res.status).toBe(403)
  })
})
