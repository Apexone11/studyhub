/**
 * notes.list.deep.test.js — Loop T3 (2026-05-12)
 *
 * GET /api/notes — list / search / filter coverage.
 *
 * The controller (notes.controller.js#listNotes) supports:
 *   ?q=         text search across title/content/tags
 *   ?tag=       exact-tag JSON-string match
 *   ?shared=    'true' returns public notes across users; otherwise own
 *   ?private=   only when listing own notes ('true' | 'false')
 *   ?courseId=  numeric filter
 *   ?page=      clamped to >= 1
 *   ?limit=     clamped 1..100, default 50
 *
 * Auth: requires authentication (route middleware). The list endpoint
 * never returns anonymous notes — there is no “public catalog without
 * login” mode at this layer.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const notesRoutePath = require.resolve('../src/modules/notes')

const mocks = vi.hoisted(() => {
  const prisma = {
    note: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    noteStar: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
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
    blockFilter: {
      getBlockedUserIds: vi.fn(async () => []),
      getMutedUserIds: vi.fn(async () => []),
    },
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
  mocks.prisma.note.findMany.mockReset()
  mocks.prisma.note.count.mockReset()
  mocks.prisma.noteStar.findMany.mockReset()
  mocks.prisma.note.findMany.mockResolvedValue([])
  mocks.prisma.note.count.mockResolvedValue(0)
  mocks.prisma.noteStar.findMany.mockResolvedValue([])
  authedUser = { userId: 42, username: 'tester', role: 'student' }
})

// ──────────────────────────────────────────────────────────────────────

describe('GET / (list notes)', () => {
  it('default response shape: notes / total / page / limit', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ notes: [], total: 0, page: 1, limit: 50 })
  })

  it('clamps limit above 100 down to 100', async () => {
    await request(app).get('/?limit=500')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.take).toBe(100)
  })

  it('limit=0 falls back to default 50 (parseInt(0)||50 → 50)', async () => {
    // The controller's parseInt||50 means a literal 0 ends up as the
    // default — the Math.max(1, _) is only load-bearing for negatives.
    await request(app).get('/?limit=0')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.take).toBe(50)
  })

  it('negative limit clamps up to 1', async () => {
    await request(app).get('/?limit=-7')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.take).toBe(1)
  })

  it('clamps page below 1 up to 1', async () => {
    await request(app).get('/?page=0')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.skip).toBe(0)
  })

  it('computes skip correctly for page 3 / limit 20', async () => {
    await request(app).get('/?page=3&limit=20')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.take).toBe(20)
    expect(call.skip).toBe(40)
  })

  it('default filter: own notes only (where.userId = current user)', async () => {
    await request(app).get('/')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.where.userId).toBe(42)
  })

  it('shared=true drops userId filter and queries private:false', async () => {
    await request(app).get('/?shared=true')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.where.userId).toBeUndefined()
    expect(call.where.private).toBe(false)
  })

  it('search query (q) builds OR across title / content / tags', async () => {
    await request(app).get('/?q=algorithms')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.where.OR).toEqual([
      { title: { contains: 'algorithms', mode: 'insensitive' } },
      { content: { contains: 'algorithms', mode: 'insensitive' } },
      { tags: { contains: 'algorithms', mode: 'insensitive' } },
    ])
  })

  it('exact tag query (tag) becomes case-insensitive JSON match', async () => {
    await request(app).get('/?tag=Physics')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.where.tags).toEqual({ contains: '"physics"', mode: 'insensitive' })
  })

  it('courseId filter coerces to integer', async () => {
    await request(app).get('/?courseId=42')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.where.courseId).toBe(42)
  })

  it('non-numeric courseId is dropped (no filter)', async () => {
    await request(app).get('/?courseId=lol')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.where.courseId).toBeUndefined()
  })

  it('private=true respected when listing own notes', async () => {
    await request(app).get('/?private=true')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.where.userId).toBe(42)
    expect(call.where.private).toBe(true)
  })

  it('private=false respected when listing own notes', async () => {
    await request(app).get('/?private=false')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.where.userId).toBe(42)
    expect(call.where.private).toBe(false)
  })

  it('star-bag is populated for the current user', async () => {
    mocks.prisma.note.findMany.mockResolvedValueOnce([
      { id: 1, title: 't', userId: 42, course: null, updatedAt: new Date() },
      { id: 2, title: 't', userId: 42, course: null, updatedAt: new Date() },
    ])
    mocks.prisma.note.count.mockResolvedValueOnce(2)
    mocks.prisma.noteStar.findMany.mockResolvedValueOnce([{ noteId: 1 }])
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.notes[0]._starred).toBe(true)
    expect(res.body.notes[1]._starred).toBe(false)
  })

  it('orders by updatedAt desc', async () => {
    await request(app).get('/')
    const call = mocks.prisma.note.findMany.mock.calls[0][0]
    expect(call.orderBy).toEqual({ updatedAt: 'desc' })
  })

  it('returns 401 when unauthenticated', async () => {
    authedUser = null
    const res = await request(app).get('/')
    expect(res.status).toBe(401)
  })

  it('graceful on empty result set (no crash on empty starred lookup)', async () => {
    mocks.prisma.note.findMany.mockResolvedValueOnce([])
    mocks.prisma.note.count.mockResolvedValueOnce(0)
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.notes).toEqual([])
    // noteStar.findMany should NOT be called when there are no note ids
    expect(mocks.prisma.noteStar.findMany).not.toHaveBeenCalled()
  })

  it('Prisma error → 500 envelope', async () => {
    mocks.prisma.note.findMany.mockRejectedValueOnce(new Error('boom'))
    const res = await request(app).get('/')
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/Server error/i)
  })
})
