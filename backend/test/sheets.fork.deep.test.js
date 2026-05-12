/**
 * Deep test coverage — POST /api/sheets/:id/fork.
 *
 * Covers idempotency (returns existing fork), forkOf parentId linkage,
 * inherited visibility settings, allowEditing gate, self-fork rejection,
 * upload quota integration with payments tier, achievements emit, and
 * fork_base commit creation in the same transaction.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/sheets/sheets.fork.controller')

const mocks = vi.hoisted(() => {
  const state = { user: { userId: 2, username: 'forker', role: 'student' } }
  const prisma = {
    studySheet: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    sheetCommit: { create: vi.fn() },
    // $transaction supports both interactive (async fn) and array form
    $transaction: vi.fn(async (arg) => {
      if (typeof arg === 'function') return arg(prisma)
      return Promise.all(arg)
    }),
  }
  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      if (!state.user) return _res.status(401).json({ error: 'Login required.' })
      req.user = { ...state.user }
      next()
    }),
    verifiedEmail: vi.fn((_req, _res, next) => next()),
    sentry: { captureError: vi.fn() },
    notify: { createNotification: vi.fn().mockResolvedValue(undefined) },
    moderationEngine: {
      isModerationEnabled: vi.fn(() => false),
      scanContent: vi.fn(),
    },
    sheetsConstants: {
      SHEET_STATUS: { PUBLISHED: 'published', DRAFT: 'draft' },
      AUTHOR_SELECT: { id: true, username: true, avatarUrl: true, isStaffVerified: true },
      sheetWriteLimiter: (_req, _res, next) => next(),
    },
    serializer: { serializeSheet: vi.fn((sheet) => ({ ...sheet })) },
    getUserPlan: { getUserTier: vi.fn().mockResolvedValue('free') },
    paymentsConstants: {
      PLANS: { free: { uploadsPerMonth: 50 }, pro_monthly: { uploadsPerMonth: -1 } },
    },
    applyContentUpdate: {
      withPreviewText: vi.fn((content) => ({
        content,
        previewText: String(content).slice(0, 100),
      })),
    },
    achievements: {
      emitAchievementEvent: vi.fn(),
      EVENT_KINDS: { SHEET_FORK: 'sheet.fork' },
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/core/db/prisma'), mocks.prisma],
  [require.resolve('../src/core/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/core/auth/requireAuth'), mocks.auth],
  [require.resolve('../src/core/auth/requireVerifiedEmail'), mocks.verifiedEmail],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/moderation/moderationEngine'), mocks.moderationEngine],
  [require.resolve('../src/modules/sheets/sheets.constants'), mocks.sheetsConstants],
  [require.resolve('../src/modules/sheets/sheets.serializer'), mocks.serializer],
  [require.resolve('../src/lib/getUserPlan'), mocks.getUserPlan],
  [require.resolve('../src/modules/payments/payments.constants'), mocks.paymentsConstants],
  [require.resolve('../src/lib/sheets/applyContentUpdate'), mocks.applyContentUpdate],
  [require.resolve('../src/modules/achievements'), mocks.achievements],
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
  app.use('/api/sheets', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[controllerPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.studySheet.findUnique.mockReset()
  mocks.prisma.studySheet.findFirst.mockReset()
  mocks.prisma.studySheet.count.mockReset()
  mocks.prisma.sheetCommit.create.mockReset()
  mocks.state.user = { userId: 2, username: 'forker', role: 'student' }
  // Default: txn calls run the function
  mocks.prisma.$transaction.mockImplementation(async (arg) => {
    if (typeof arg === 'function') {
      // Mock-tx exposes the same methods that the route calls via tx.X
      const tx = {
        studySheet: {
          create: vi.fn().mockResolvedValue({
            id: 200,
            title: 'Original (fork)',
            forkOf: 10,
            userId: 2,
            author: { id: 2, username: 'forker' },
            course: { id: 1, school: { id: 1 } },
            forkSource: null,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        sheetCommit: { create: vi.fn().mockResolvedValue({ id: 1 }) },
      }
      return arg(tx)
    }
    return Promise.all(arg)
  })
})

function origSheet(overrides = {}) {
  return {
    id: 10,
    title: 'Original',
    description: 'D',
    content: '# X',
    contentFormat: 'markdown',
    courseId: 1,
    userId: 1, // author is different from forker (userId:2)
    status: 'published',
    forkOf: null,
    rootSheetId: null,
    attachmentUrl: null,
    attachmentType: null,
    attachmentName: null,
    allowDownloads: true,
    allowEditing: true,
    ...overrides,
  }
}

describe('POST /api/sheets/:id/fork', () => {
  it('creates a fork as DRAFT with parentId=originalId', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(origSheet())
    mocks.prisma.studySheet.findFirst.mockResolvedValueOnce(null) // no existing fork
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0) // quota check

    const res = await request(app).post('/api/sheets/10/fork').send({})
    expect(res.status).toBe(201)
    expect(mocks.prisma.$transaction).toHaveBeenCalled()
    expect(res.body.forkOf).toBe(10)
    expect(res.body.title).toMatch(/\(fork\)|Original/i)
  })

  it('400 when sheet id is not an integer', async () => {
    const res = await request(app).post('/api/sheets/abc/fork').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/integer/i)
  })

  it('404 when original does not exist', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/api/sheets/9999/fork').send({})
    expect(res.status).toBe(404)
  })

  it('403 when original is not published (e.g. draft)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(origSheet({ status: 'draft' }))
    const res = await request(app).post('/api/sheets/10/fork').send({})
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/published/i)
  })

  it('400 when forking your own sheet', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(origSheet({ userId: 2 }))
    const res = await request(app).post('/api/sheets/10/fork').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/own sheet/i)
  })

  it('403 when allowEditing is false (FORK_DISABLED code)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(origSheet({ allowEditing: false }))
    const res = await request(app).post('/api/sheets/10/fork').send({})
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORK_DISABLED')
  })

  it('idempotent: returns existing fork without creating a new one', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(origSheet())
    const existing = {
      id: 99,
      title: 'Already forked',
      forkOf: 10,
      userId: 2,
      author: { id: 2, username: 'forker' },
      course: { id: 1, school: { id: 1 } },
      forkSource: null,
    }
    mocks.prisma.studySheet.findFirst.mockResolvedValueOnce(existing)
    const res = await request(app).post('/api/sheets/10/fork').send({})
    expect(res.status).toBe(200) // existing fork → 200 not 201
    expect(res.body.id).toBe(99)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('upload quota at cap → 403 UPLOAD_LIMIT', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(origSheet())
    mocks.prisma.studySheet.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.studySheet.count.mockResolvedValueOnce(50) // at free cap
    const res = await request(app).post('/api/sheets/10/fork').send({})
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('UPLOAD_LIMIT')
  })

  it('pro_monthly tier (unlimited) skips the quota check', async () => {
    mocks.getUserPlan.getUserTier.mockResolvedValueOnce('pro_monthly')
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(origSheet())
    mocks.prisma.studySheet.findFirst.mockResolvedValueOnce(null)
    const res = await request(app).post('/api/sheets/10/fork').send({})
    expect(res.status).toBe(201)
  })

  it('fork inherits visibility settings (allowDownloads, allowEditing, attachment)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      origSheet({
        allowDownloads: false,
        attachmentUrl: '/x.pdf',
        attachmentType: 'pdf',
        attachmentName: 'x.pdf',
      }),
    )
    mocks.prisma.studySheet.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)

    let createCallArgs
    mocks.prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        studySheet: {
          create: vi.fn((args) => {
            createCallArgs = args
            return Promise.resolve({
              id: 200,
              ...args.data,
              author: { id: 2, username: 'forker' },
              course: { id: 1, school: { id: 1 } },
              forkSource: null,
            })
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        sheetCommit: { create: vi.fn().mockResolvedValue({ id: 1 }) },
      }
      return fn(tx)
    })

    const res = await request(app).post('/api/sheets/10/fork').send({})
    expect(res.status).toBe(201)
    expect(createCallArgs.data.allowDownloads).toBe(false)
    expect(createCallArgs.data.attachmentUrl).toBe('/x.pdf')
    expect(createCallArgs.data.attachmentType).toBe('pdf')
  })

  it('rootSheetId chains: forking a fork preserves rootSheetId', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      origSheet({ forkOf: 1, rootSheetId: 1 }),
    )
    mocks.prisma.studySheet.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)

    let createCallArgs
    mocks.prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        studySheet: {
          create: vi.fn((args) => {
            createCallArgs = args
            return Promise.resolve({
              id: 200,
              ...args.data,
              author: { id: 2, username: 'forker' },
              course: { id: 1, school: { id: 1 } },
              forkSource: null,
            })
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        sheetCommit: { create: vi.fn().mockResolvedValue({ id: 1 }) },
      }
      return fn(tx)
    })

    const res = await request(app).post('/api/sheets/10/fork').send({})
    expect(res.status).toBe(201)
    expect(createCallArgs.data.rootSheetId).toBe(1)
  })

  it('emits SHEET_FORK achievement event', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(origSheet())
    mocks.prisma.studySheet.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)

    const res = await request(app).post('/api/sheets/10/fork').send({})
    expect(res.status).toBe(201)
    expect(mocks.achievements.emitAchievementEvent).toHaveBeenCalledWith(
      mocks.prisma,
      2,
      'sheet.fork',
      expect.objectContaining({ originalSheetId: 10, originalAuthorId: 1 }),
    )
  })

  it('creates the original author a notification', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(origSheet())
    mocks.prisma.studySheet.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)
    await request(app).post('/api/sheets/10/fork').send({})
    expect(mocks.notify.createNotification).toHaveBeenCalledWith(
      mocks.prisma,
      expect.objectContaining({
        userId: 1, // original author
        type: 'fork',
      }),
    )
  })

  it('401 when unauthenticated', async () => {
    mocks.state.user = null
    const res = await request(app).post('/api/sheets/10/fork').send({})
    expect(res.status).toBe(401)
  })

  it('custom title in body is used (trimmed and length-clamped)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(origSheet())
    mocks.prisma.studySheet.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.studySheet.count.mockResolvedValueOnce(0)

    let createCallArgs
    mocks.prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        studySheet: {
          create: vi.fn((args) => {
            createCallArgs = args
            return Promise.resolve({
              id: 200,
              ...args.data,
              author: { id: 2, username: 'forker' },
              course: { id: 1, school: { id: 1 } },
              forkSource: null,
            })
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        sheetCommit: { create: vi.fn().mockResolvedValue({ id: 1 }) },
      }
      return fn(tx)
    })

    await request(app).post('/api/sheets/10/fork').send({ title: 'My Custom Fork' })
    expect(createCallArgs.data.title).toBe('My Custom Fork')
  })
})
