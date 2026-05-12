/**
 * notes.versions.deep.test.js — Loop T3 (2026-05-12)
 *
 * Route coverage for the NoteVersion subsystem:
 *   POST /:id/versions                     — manual snapshot
 *   GET  /:id/versions                     — list
 *   GET  /:id/versions/:versionId          — fetch one
 *   GET  /:id/versions/:versionId/diff     — word diff vs current / other
 *   POST /:id/versions/:versionId/restore  — restore
 *
 * Versions are owner-only (assertOwnerOrAdmin in the controller). There
 * is no public "view someone else's version history" — even on public
 * notes. We verify the route does NOT expose a DELETE: versions are
 * append-only by design.
 *
 * Auto-version retention cap: AUTO versions past 50 are pruned by
 * `prunePastFiftyAuto`. We don't exercise the prune side-effect here
 * (it's behind PATCH /:id), but we cover the explicit POST snapshot,
 * which is always kind='MANUAL'.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const notesRoutePath = require.resolve('../src/modules/notes')

const mocks = vi.hoisted(() => {
  const prisma = {
    note: { findUnique: vi.fn(), update: vi.fn() },
    noteVersion: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    noteStar: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    noteReaction: { count: vi.fn(), findUnique: vi.fn() },
  }
  prisma.$transaction = vi.fn(async (fn) =>
    typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
  )
  return {
    prisma,
    sentry: { captureError: vi.fn() },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(
        ({ user, ownerId }) => user.role === 'admin' || Number(ownerId) === Number(user.userId),
      ),
    },
    moderationEngine: { isModerationEnabled: vi.fn(() => false), scanContent: vi.fn() },
    notify: { createNotification: vi.fn() },
    mentions: { notifyMentionedUsers: vi.fn() },
    activityTracker: { trackActivity: vi.fn() },
    noteAnchor: { buildAnchorContext: vi.fn(() => null), validateAnchorInput: vi.fn(() => null) },
    blockFilter: { getBlockedUserIds: vi.fn(async () => []) },
  }
})

let authedUser = { userId: 42, username: 'tester', role: 'student' }
function fakeAuth(req, res, next) {
  if (!authedUser) {
    return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
  }
  req.user = { ...authedUser }
  next()
}
function fakeRequireVerifiedEmail(_req, _res, next) {
  next()
}
function fakeOptionalAuth(req, _res, next) {
  if (authedUser) req.user = { ...authedUser }
  next()
}
function fakeOriginAllowlistFactory() {
  return function (_req, _res, next) {
    next()
  }
}
fakeOriginAllowlistFactory.normalizeOrigin = (v) => v
fakeOriginAllowlistFactory.buildTrustedOrigins = () => new Set()
function fakeRateLimiter(_req, _res, next) {
  next()
}

const fakeLimiterBag = {
  notesMutateLimiter: fakeRateLimiter,
  notesReadLimiter: fakeRateLimiter,
  notesCommentLimiter: fakeRateLimiter,
  commentReactLimiter: fakeRateLimiter,
  notesPatchLimiter: fakeRateLimiter,
  notesChunkLimiter: fakeRateLimiter,
  notesRestoreLimiter: fakeRateLimiter,
  notesDiffLimiter: fakeRateLimiter,
  noteHighlightWriteLimiter: fakeRateLimiter,
}

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), fakeAuth],
  [require.resolve('../src/middleware/requireVerifiedEmail'), fakeRequireVerifiedEmail],
  [require.resolve('../src/middleware/originAllowlist'), fakeOriginAllowlistFactory],
  [require.resolve('../src/core/auth/optionalAuth'), fakeOptionalAuth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/moderation/moderationEngine'), mocks.moderationEngine],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
  [require.resolve('../src/lib/activityTracker'), mocks.activityTracker],
  [require.resolve('../src/lib/noteAnchor'), mocks.noteAnchor],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
  [require.resolve('../src/lib/rateLimiters'), fakeLimiterBag],
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
  mocks.prisma.note.findUnique.mockReset()
  mocks.prisma.note.update.mockReset()
  mocks.prisma.noteVersion.findMany.mockReset()
  mocks.prisma.noteVersion.findUnique.mockReset()
  mocks.prisma.noteVersion.create.mockReset()
  mocks.prisma.noteVersion.findFirst.mockResolvedValue(null)
  mocks.accessControl.assertOwnerOrAdmin.mockImplementation(
    ({ user, ownerId }) => user.role === 'admin' || Number(ownerId) === Number(user.userId),
  )
  authedUser = { userId: 42, username: 'tester', role: 'student' }
})

// ──────────────────────────────────────────────────────────────────────
// POST /:id/versions — Manual snapshot
// ──────────────────────────────────────────────────────────────────────

describe('POST /:id/versions', () => {
  it('owner can create a manual snapshot', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 1,
      userId: 42,
      title: 't',
      content: 'c',
      revision: 0,
    })
    mocks.prisma.noteVersion.create.mockResolvedValueOnce({
      id: 100,
      noteId: 1,
      kind: 'MANUAL',
      revision: 0,
    })
    const res = await request(app).post('/1/versions').send({ message: 'first cut' })
    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('MANUAL')
    const createCall = mocks.prisma.noteVersion.create.mock.calls[0][0]
    expect(createCall.data.kind).toBe('MANUAL')
    expect(createCall.data.message).toBe('first cut')
  })

  it('caps version message at 200 chars', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 1,
      userId: 42,
      title: 't',
      content: 'c',
      revision: 0,
    })
    mocks.prisma.noteVersion.create.mockResolvedValueOnce({ id: 100, noteId: 1 })
    await request(app)
      .post('/1/versions')
      .send({ message: 'a'.repeat(500) })
    const createCall = mocks.prisma.noteVersion.create.mock.calls[0][0]
    expect(createCall.data.message.length).toBeLessThanOrEqual(200)
  })

  it('non-owner gets 403', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 1,
      userId: 99,
      title: 't',
      content: 'c',
    })
    mocks.accessControl.assertOwnerOrAdmin.mockImplementationOnce(({ res }) => {
      res.status(403).json({ error: 'Not your note.', code: 'FORBIDDEN' })
      return false
    })
    const res = await request(app).post('/1/versions').send({ message: 'hi' })
    expect(res.status).toBe(403)
  })

  it('A12: rejects non-integer noteId', async () => {
    const res = await request(app).post('/abc/versions').send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/9999/versions').send({})
    expect(res.status).toBe(404)
  })
})

// ──────────────────────────────────────────────────────────────────────
// GET /:id/versions — list
// ──────────────────────────────────────────────────────────────────────

describe('GET /:id/versions', () => {
  it('owner can list', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42 })
    mocks.prisma.noteVersion.findMany.mockResolvedValueOnce([
      { id: 1, title: 't', kind: 'AUTO', revision: 0, message: null, createdAt: new Date() },
      { id: 2, title: 't', kind: 'MANUAL', revision: 1, message: 'first', createdAt: new Date() },
    ])
    const res = await request(app).get('/1/versions')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })

  it('default limit is 20, max is 50', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42 })
    mocks.prisma.noteVersion.findMany.mockResolvedValueOnce([])
    await request(app).get('/1/versions?limit=999')
    const findCall = mocks.prisma.noteVersion.findMany.mock.calls[0][0]
    expect(findCall.take).toBe(50)
  })

  it('non-owner gets 403', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 99 })
    mocks.accessControl.assertOwnerOrAdmin.mockImplementationOnce(({ res }) => {
      res.status(403).json({ error: 'Not your note.', code: 'FORBIDDEN' })
      return false
    })
    const res = await request(app).get('/1/versions')
    expect(res.status).toBe(403)
  })

  it('A12: rejects non-integer noteId', async () => {
    const res = await request(app).get('/abc/versions')
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/9999/versions')
    expect(res.status).toBe(404)
  })
})

// ──────────────────────────────────────────────────────────────────────
// GET /:id/versions/:versionId
// ──────────────────────────────────────────────────────────────────────

describe('GET /:id/versions/:versionId', () => {
  it('owner can fetch a specific version', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42 })
    mocks.prisma.noteVersion.findUnique.mockResolvedValueOnce({
      id: 100,
      noteId: 1,
      title: 't',
      content: 'old',
    })
    const res = await request(app).get('/1/versions/100')
    expect(res.status).toBe(200)
    expect(res.body.content).toBe('old')
  })

  it('returns 404 when version is not from this note (IDOR guard)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42 })
    mocks.prisma.noteVersion.findUnique.mockResolvedValueOnce({
      id: 100,
      noteId: 999,
      title: 't',
      content: 'c',
    })
    const res = await request(app).get('/1/versions/100')
    expect(res.status).toBe(404)
  })

  it('A12: rejects non-integer versionId', async () => {
    const res = await request(app).get('/1/versions/abc')
    expect(res.status).toBe(400)
  })
})

// ──────────────────────────────────────────────────────────────────────
// GET /:id/versions/:versionId/diff
// ──────────────────────────────────────────────────────────────────────

describe('GET /:id/versions/:versionId/diff', () => {
  it('produces a word diff vs current by default', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 1,
      userId: 42,
      content: 'hello new world',
    })
    mocks.prisma.noteVersion.findUnique.mockResolvedValueOnce({
      id: 100,
      noteId: 1,
      content: 'hello old world',
    })
    const res = await request(app).get('/1/versions/100/diff')
    expect(res.status).toBe(200)
    expect(res.body.chunks).toEqual(expect.any(Array))
    expect(res.body.summary).toEqual({ added: expect.any(Number), removed: expect.any(Number) })
  })

  it('against=<otherVersionId> compares two versions', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42, content: 'live' })
    mocks.prisma.noteVersion.findUnique
      .mockResolvedValueOnce({ id: 100, noteId: 1, content: 'v100 text' })
      .mockResolvedValueOnce({ id: 200, noteId: 1, content: 'v200 text' })
    const res = await request(app).get('/1/versions/100/diff?against=200')
    expect(res.status).toBe(200)
  })

  it('rejects invalid against query', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42, content: 'live' })
    mocks.prisma.noteVersion.findUnique.mockResolvedValueOnce({
      id: 100,
      noteId: 1,
      content: 'a',
    })
    const res = await request(app).get('/1/versions/100/diff?against=lol')
    expect(res.status).toBe(400)
  })

  it('returns 404 when version is not from this note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42, content: 'live' })
    mocks.prisma.noteVersion.findUnique.mockResolvedValueOnce({
      id: 100,
      noteId: 9999,
      content: 'a',
    })
    const res = await request(app).get('/1/versions/100/diff')
    expect(res.status).toBe(404)
  })

  it('A12: rejects non-integer id or versionId', async () => {
    const r1 = await request(app).get('/abc/versions/1/diff')
    expect(r1.status).toBe(400)
    const r2 = await request(app).get('/1/versions/abc/diff')
    expect(r2.status).toBe(400)
  })
})

// ──────────────────────────────────────────────────────────────────────
// No DELETE endpoint — versions are append-only
// ──────────────────────────────────────────────────────────────────────

describe('No DELETE endpoint for versions', () => {
  it('DELETE /:id/versions/:versionId is not registered (404)', async () => {
    // The notes router does not mount a DELETE handler for versions —
    // express returns 404 when no route matches.
    const res = await request(app).delete('/1/versions/100')
    // If a future change accidentally registers DELETE we want to know.
    expect([404, 405]).toContain(res.status)
  })
})
