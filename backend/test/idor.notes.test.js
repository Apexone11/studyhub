/**
 * IDOR / Permission Tests — Notes (PATCH, DELETE)
 *
 * Proves: non-owner cannot update or delete another user's note.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const notesRoutePath = require.resolve('../src/modules/notes')

const mocks = vi.hoisted(() => {
  const state = { userId: 42, role: 'student' }

  const prisma = {
    note: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    noteVersion: {
      findMany: vi.fn(),
    },
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId, username: 'test_user', role: state.role }
      next()
    }),
    verifiedEmail: vi.fn((_req, _res, next) => next()),
    sentry: { captureError: vi.fn() },
    securityEvents: { logSecurityEvent: vi.fn() },
    storage: {
      cleanupNoteImageIfUnused: vi.fn(async () => true),
      extractNoteImageUrlsFromTexts: vi.fn(() => []),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/middleware/requireVerifiedEmail'), mocks.verifiedEmail],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/securityEvents'), mocks.securityEvents],
  [require.resolve('../src/lib/storage'), mocks.storage],
])

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    if (requestId === 'express-rate-limit') return () => (_req, _res, next) => next()
    try {
      const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
      const mockedModule = mockTargets.get(resolvedRequest)
      if (mockedModule) return mockedModule
    } catch { /* fall through */ }
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[notesRoutePath]
  const notesRouter = require(notesRoutePath)
  app = express()
  app.use(express.json())
  app.use('/api/notes', notesRouter.default || notesRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[notesRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.role = 'student'
  mocks.prisma.noteVersion.findMany.mockResolvedValue([])
})

const OWNER_ID = 100
const NON_OWNER_ID = 42

const noteFixture = (overrides = {}) => ({
  id: 1,
  userId: OWNER_ID,
  title: 'My Note',
  content: 'content',
  private: false,
  courseId: null,
  ...overrides,
})

/* ══════════════════════════════════════════════════════════════════════════
 * PATCH /api/notes/:id
 * ══════════════════════════════════════════════════════════════════════════ */
describe('PATCH /api/notes/:id — ownership enforcement', () => {
  it('returns 403 when non-owner tries to update', async () => {
    mocks.state.userId = NON_OWNER_ID
    mocks.prisma.note.findUnique.mockResolvedValue(noteFixture())

    const res = await request(app)
      .patch('/api/notes/1')
      .send({ title: 'Hijacked' })

    expect(res.status).toBe(403)
    expect(mocks.prisma.note.update).not.toHaveBeenCalled()
  })

  it('returns 200 when owner updates their own note', async () => {
    mocks.state.userId = OWNER_ID
    mocks.prisma.note.findUnique.mockResolvedValue(noteFixture())
    mocks.prisma.note.update.mockResolvedValue({ ...noteFixture(), title: 'Updated' })

    const res = await request(app)
      .patch('/api/notes/1')
      .send({ title: 'Updated' })

    expect(res.status).toBe(200)
    expect(mocks.prisma.note.update).toHaveBeenCalled()
  })

  it('returns 200 when admin updates any note', async () => {
    mocks.state.userId = 99
    mocks.state.role = 'admin'
    mocks.prisma.note.findUnique.mockResolvedValue(noteFixture())
    mocks.prisma.note.update.mockResolvedValue({ ...noteFixture(), title: 'Admin Edit' })

    const res = await request(app)
      .patch('/api/notes/1')
      .send({ title: 'Admin Edit' })

    expect(res.status).toBe(200)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
 * DELETE /api/notes/:id
 * ══════════════════════════════════════════════════════════════════════════ */
describe('DELETE /api/notes/:id — ownership enforcement', () => {
  it('returns 403 when non-owner tries to delete', async () => {
    mocks.state.userId = NON_OWNER_ID
    mocks.prisma.note.findUnique.mockResolvedValue(noteFixture())

    const res = await request(app).delete('/api/notes/1')

    expect(res.status).toBe(403)
    expect(mocks.prisma.note.delete).not.toHaveBeenCalled()
  })

  it('returns 200 when owner deletes their own note', async () => {
    mocks.state.userId = OWNER_ID
    mocks.prisma.note.findUnique.mockResolvedValue(
      noteFixture({ content: '![image](/uploads/note-images/owner-note.png)' })
    )
    mocks.prisma.note.delete.mockResolvedValue({})
    mocks.prisma.noteVersion.findMany.mockResolvedValue([
      { content: '![image](/uploads/note-images/version-note.png)' },
    ])
    mocks.storage.extractNoteImageUrlsFromTexts.mockReturnValue([
      '/uploads/note-images/owner-note.png',
      '/uploads/note-images/version-note.png',
    ])

    const res = await request(app).delete('/api/notes/1')

    expect(res.status).toBe(200)
    expect(mocks.prisma.note.delete).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(mocks.storage.cleanupNoteImageIfUnused).toHaveBeenCalledTimes(2)
  })
})
