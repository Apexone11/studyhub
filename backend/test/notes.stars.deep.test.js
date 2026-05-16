/**
 * notes.stars.deep.test.js — Loop T3 (2026-05-12)
 *
 * Route coverage for note star endpoints:
 *   POST   /:id/star  — idempotent star
 *   DELETE /:id/star  — idempotent unstar
 *
 * Star semantics: POST is idempotent — calling twice does not create
 * duplicates and the response remains `{ starred: true }`. DELETE on a
 * note the user never starred is a no-op `{ starred: false }`. Star is
 * permitted on public OR private-owner-readable notes; private notes
 * owned by someone else return 404.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const notesRoutePath = require.resolve('../src/modules/notes')

const mocks = vi.hoisted(() => {
  const prisma = {
    note: { findUnique: vi.fn() },
    noteStar: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    noteReaction: { count: vi.fn(), findUnique: vi.fn() },
  }
  prisma.$transaction = vi.fn(async (fn) =>
    typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
  )
  return {
    prisma,
    sentry: { captureError: vi.fn() },
    accessControl: { assertOwnerOrAdmin: vi.fn(() => true), assertOwner: vi.fn(() => true) },
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
  noteHighlightLimiter: fakeRateLimiter,
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
  mocks.prisma.noteStar.findUnique.mockReset()
  mocks.prisma.noteStar.create.mockReset()
  mocks.prisma.noteStar.deleteMany.mockReset()
  mocks.prisma.noteStar.findMany.mockResolvedValue([])
  mocks.prisma.noteStar.count.mockResolvedValue(0)
  authedUser = { userId: 42, username: 'tester', role: 'student' }
})

// ──────────────────────────────────────────────────────────────────────
// POST /:id/star
// ──────────────────────────────────────────────────────────────────────

describe('POST /:id/star', () => {
  it('first star → creates row', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, private: false, userId: 99 })
    mocks.prisma.noteStar.findUnique.mockResolvedValueOnce(null)
    mocks.prisma.noteStar.create.mockResolvedValueOnce({})
    const res = await request(app).post('/10/star').send()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ starred: true })
    expect(mocks.prisma.noteStar.create).toHaveBeenCalledWith({
      data: { userId: 42, noteId: 10 },
    })
  })

  it('idempotent: a 2nd POST does NOT create a duplicate', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, private: false, userId: 99 })
    mocks.prisma.noteStar.findUnique.mockResolvedValueOnce({ userId: 42, noteId: 10 })
    const res = await request(app).post('/10/star').send()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ starred: true })
    expect(mocks.prisma.noteStar.create).not.toHaveBeenCalled()
  })

  it('rapid double-click does not create two stars', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, private: false, userId: 99 })
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, private: false, userId: 99 })
    mocks.prisma.noteStar.findUnique.mockResolvedValueOnce(null)
    mocks.prisma.noteStar.findUnique.mockResolvedValueOnce({ userId: 42, noteId: 10 })
    mocks.prisma.noteStar.create.mockResolvedValueOnce({})
    await request(app).post('/10/star').send()
    await request(app).post('/10/star').send()
    expect(mocks.prisma.noteStar.create).toHaveBeenCalledTimes(1)
  })

  it('returns 404 for non-existent note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/9999/star').send()
    expect(res.status).toBe(404)
  })

  it('returns 404 for non-readable private note (owned by someone else)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, private: true, userId: 999 })
    const res = await request(app).post('/10/star').send()
    expect(res.status).toBe(404)
  })

  it('A12: rejects non-integer id', async () => {
    const res = await request(app).post('/abc/star').send()
    expect(res.status).toBe(400)
  })

  it('A12: rejects zero / negative id', async () => {
    const r1 = await request(app).post('/0/star').send()
    expect(r1.status).toBe(400)
    const r2 = await request(app).post('/-1/star').send()
    expect(r2.status).toBe(400)
  })

  it('returns 401 unauthenticated', async () => {
    authedUser = null
    const res = await request(app).post('/10/star').send()
    expect(res.status).toBe(401)
  })
})

// ──────────────────────────────────────────────────────────────────────
// DELETE /:id/star
// ──────────────────────────────────────────────────────────────────────

describe('DELETE /:id/star', () => {
  it('unstars when starred', async () => {
    mocks.prisma.noteStar.deleteMany.mockResolvedValueOnce({ count: 1 })
    const res = await request(app).delete('/10/star').send()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ starred: false })
    expect(mocks.prisma.noteStar.deleteMany).toHaveBeenCalledWith({
      where: { userId: 42, noteId: 10 },
    })
  })

  it('idempotent: no-op when not starred returns starred:false too', async () => {
    mocks.prisma.noteStar.deleteMany.mockResolvedValueOnce({ count: 0 })
    const res = await request(app).delete('/10/star').send()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ starred: false })
  })

  it('A12: rejects non-integer id', async () => {
    const res = await request(app).delete('/abc/star').send()
    expect(res.status).toBe(400)
  })

  it('returns 401 unauthenticated', async () => {
    authedUser = null
    const res = await request(app).delete('/10/star').send()
    expect(res.status).toBe(401)
  })
})
