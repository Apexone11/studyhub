/**
 * notes.update.test.js — PATCH /api/notes/:id (Notes Hardening v2)
 *
 * Uses Module._load patching to swap prisma/auth/etc. with mocks, matching the
 * pattern from notes.routes.test.js. This exercises the updateNote handler for
 * revision / saveId / contentHash / 409 / idempotency / payload-size behavior.
 */
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
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(async (fn) => fn(prisma)),
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
      isModerationEnabled: vi.fn(() => false),
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
    plagiarismService: {
      updateFingerprint: vi.fn(),
    },
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
  [require.resolve('../src/lib/plagiarismService'), mocks.plagiarismService],
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

  delete require.cache[notesRoutePath]
  const routerModule = require(notesRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[notesRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.noteVersion.findMany.mockResolvedValue([])
  mocks.prisma.noteVersion.findFirst.mockResolvedValue(null)
  mocks.prisma.noteVersion.create.mockResolvedValue({})
  mocks.prisma.noteVersion.deleteMany.mockResolvedValue({ count: 0 })
  mocks.prisma.$transaction.mockImplementation(async (fn) => fn(mocks.prisma))
  mocks.moderationEngine.isModerationEnabled.mockReturnValue(false)
  mocks.accessControl.assertOwnerOrAdmin.mockImplementation(({ user, ownerId }) => {
    return user.role === 'admin' || Number(ownerId) === Number(user.userId)
  })
})

describe('PATCH /:id (hardening v2)', () => {
  it('persists and bumps revision on matching baseRevision', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({
      id: 1,
      userId: 42,
      title: 'T1',
      content: 'C1',
      revision: 0,
      lastSaveId: null,
      contentHash: 'sha256:initial',
      updatedAt: new Date(),
    })
    mocks.prisma.note.update.mockResolvedValue({
      id: 1,
      userId: 42,
      title: 'T2',
      content: 'C2',
      revision: 1,
      lastSaveId: '11111111-1111-1111-1111-111111111111',
      contentHash: 'sha256:abc',
      updatedAt: new Date(),
    })

    const res = await request(app).patch('/1').send({
      title: 'T2',
      content: 'C2',
      baseRevision: 0,
      saveId: '11111111-1111-1111-1111-111111111111',
      contentHash: 'sha256:abc',
      trigger: 'manual',
    })

    expect(res.status).toBe(200)
    expect(res.body.revision).toBe(1)
    expect(res.body.note.title).toBe('T2')
  })

  it('returns 409 on stale baseRevision', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({
      id: 1,
      userId: 42,
      title: 'Server Title',
      content: 'Server Content',
      revision: 1,
      lastSaveId: 'other-save',
      contentHash: 'sha256:server',
      updatedAt: new Date(),
    })

    const res = await request(app).patch('/1').send({
      title: 'Z',
      content: 'W',
      baseRevision: 0,
      saveId: '33333333-3333-3333-3333-333333333333',
      contentHash: 'sha256:two',
      trigger: 'manual',
    })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('NOTE_REVISION_CONFLICT')
    expect(res.body.current.revision).toBe(1)
    expect(res.body.yours.title).toBe('Z')
  })

  it('is idempotent on repeated saveId — returns 202 with same result', async () => {
    const saveId = '44444444-4444-4444-4444-444444444444'
    mocks.prisma.note.findUnique.mockResolvedValue({
      id: 1,
      userId: 42,
      title: 'T2',
      content: 'C2',
      revision: 1,
      lastSaveId: saveId,
      contentHash: 'sha256:abc',
      updatedAt: new Date(),
    })

    const repeat = await request(app).patch('/1').send({
      title: 'T2',
      content: 'C2',
      baseRevision: 0,
      saveId,
      contentHash: 'sha256:abc',
      trigger: 'manual',
    })

    expect(repeat.status).toBe(202)
    expect(repeat.body.revision).toBe(1)
    expect(repeat.body.replay).toBe(true)
  })

  it('returns 200 no-op when contentHash matches current and title unchanged', async () => {
    const hash = 'sha256:initial'
    mocks.prisma.note.findUnique.mockResolvedValue({
      id: 1,
      userId: 42,
      title: 'T',
      content: 'C',
      revision: 3,
      lastSaveId: 'prev-save',
      contentHash: hash,
      updatedAt: new Date(),
    })

    const res = await request(app).patch('/1').send({
      title: 'T',
      content: 'C',
      baseRevision: 3,
      saveId: '66666666-6666-6666-6666-666666666666',
      contentHash: hash,
      trigger: 'debounce',
    })

    expect(res.status).toBe(200)
    expect(res.body.revision).toBe(3)
    expect(res.body.versionCreated).toBe(false)
    expect(res.body.noop).toBe(true)
    expect(mocks.prisma.note.update).not.toHaveBeenCalled()
  })

  it('rejects content > 200000 chars with 413', async () => {
    const big = 'x'.repeat(200001)
    const res = await request(app).patch('/1').send({
      title: 'T',
      content: big,
      baseRevision: 0,
      saveId: '77777777-7777-7777-7777-777777777777',
      contentHash: 'sha256:big',
      trigger: 'manual',
    })

    expect(res.status).toBe(413)
    expect(res.body.code).toBe('NOTE_PAYLOAD_TOO_LARGE')
  })
})
