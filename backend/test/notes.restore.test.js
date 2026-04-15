import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const notesRoutePath = require.resolve('../src/modules/notes')

const mocks = vi.hoisted(() => {
  const prisma = {
    note: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    noteStar: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    noteReaction: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    noteComment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    noteVersion: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn(),
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    requireVerifiedEmail: vi.fn((req, _res, next) => next()),
    sentry: {
      captureError: vi.fn(),
    },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(({ user, ownerId }) => {
        return user.role === 'admin' || Number(ownerId) === Number(user.userId)
      }),
    },
    moderationEngine: {
      isModerationEnabled: vi.fn(() => true),
      scanContent: vi.fn(),
    },
    notify: {
      createNotification: vi.fn(),
    },
    mentions: {
      notifyMentionedUsers: vi.fn(),
    },
    activityTracker: {
      trackActivity: vi.fn(),
    },
    noteAnchor: {
      buildAnchorContext: vi.fn(() => null),
      validateAnchorInput: vi.fn(() => null),
    },
    optionalAuth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/middleware/requireVerifiedEmail'), mocks.requireVerifiedEmail],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/moderation/moderationEngine'), mocks.moderationEngine],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
  [require.resolve('../src/lib/activityTracker'), mocks.activityTracker],
  [require.resolve('../src/lib/noteAnchor'), mocks.noteAnchor],
  [require.resolve('../src/core/auth/optionalAuth'), mocks.optionalAuth],
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

  delete require.cache[notesRoutePath]
  const routerModule = require(notesRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[notesRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ user, ownerId }) => {
    return user.role === 'admin' || Number(ownerId) === Number(user.userId)
  })
  mocks.moderationEngine.isModerationEnabled.mockReturnValue(true)
})

describe('POST /:id/versions/:versionId/restore', () => {
  it('creates PRE_RESTORE snapshot, overwrites note, bumps revision', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({
      id: 1,
      userId: 42,
      title: 'Current Title',
      content: 'Current content',
      revision: 2,
    })
    mocks.prisma.noteVersion.findUnique.mockResolvedValue({
      id: 7,
      noteId: 1,
      title: 'Old',
      content: 'Old content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    })

    // Stub $transaction to invoke the callback with a tx that proxies create + update.
    const txCreate = vi.fn().mockResolvedValue({ id: 99 })
    const txUpdate = vi.fn().mockResolvedValue({
      id: 1,
      userId: 42,
      title: 'Old',
      content: 'Old content',
      revision: 3,
    })
    mocks.prisma.$transaction.mockImplementation(async (cb) => {
      return cb({
        noteVersion: { create: txCreate },
        note: { update: txUpdate },
      })
    })

    const res = await request(app).post('/1/versions/7/restore').send({})

    expect(res.status).toBe(200)
    expect(res.body.note.title).toBe('Old')
    expect(res.body.note.content).toBe('Old content')
    expect(res.body.note.revision).toBe(3)
    expect(res.body.revision).toBe(3)

    expect(txCreate).toHaveBeenCalledTimes(1)
    const createArgs = txCreate.mock.calls[0][0]
    expect(createArgs.data).toMatchObject({
      noteId: 1,
      userId: 42,
      title: 'Current Title',
      content: 'Current content',
      parentVersionId: 7,
      kind: 'PRE_RESTORE',
      revision: 2,
    })
    expect(createArgs.data.bytesContent).toBe(Buffer.byteLength('Current content', 'utf8'))

    expect(txUpdate).toHaveBeenCalledTimes(1)
    const updateArgs = txUpdate.mock.calls[0][0]
    expect(updateArgs.where).toEqual({ id: 1 })
    expect(updateArgs.data).toMatchObject({
      title: 'Old',
      content: 'Old content',
      revision: 3,
      lastSaveId: null,
    })
    expect(typeof updateArgs.data.contentHash).toBe('string')
  })

  it('returns 404 when version does not belong to note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({
      id: 1,
      userId: 42,
      title: 'Title',
      content: 'Content',
      revision: 1,
    })
    mocks.prisma.noteVersion.findUnique.mockResolvedValue({
      id: 7,
      noteId: 99,
      title: 'Foreign',
      content: 'Foreign content',
      createdAt: new Date(),
    })

    const res = await request(app).post('/1/versions/7/restore').send({})

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOTE_VERSION_NOT_FOUND')
  })

  it('returns 404 when note not owned by user', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({
      id: 1,
      userId: 999,
      title: 'Other',
      content: 'Other content',
      revision: 1,
    })

    const res = await request(app).post('/1/versions/7/restore').send({})

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
  })
})
