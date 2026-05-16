/**
 * notes.highlights.deep.test.js — Loop T3 (2026-05-12)
 *
 * Route-level tests for the NoteHighlight feature added by Loop A1
 * (Note Review v1 — Phase 9). The surface lives at
 *   GET    /api/notes/:noteId/highlights
 *   POST   /api/notes/:noteId/highlights
 *   DELETE /api/notes/:noteId/highlights/:id
 *
 * Coverage targets (per task brief):
 *   - Owner can read highlights on their own private note.
 *   - Public/shared note: any auth viewer can read, filtered by
 *     block-list (try/catch wrapped per CLAUDE.md A6).
 *   - GET on a private non-owned note → 404 (privacy via 404, not 403).
 *   - POST color enum + anchor offset (A12 + Number.isInteger) + anchor
 *     text length cap + HTML/script strip.
 *   - DELETE by author, by note owner (moderation), and 403 otherwise.
 *   - A12 on every :id / :noteId path parameter.
 *
 * Same Module._load patching pattern as notes.routes.test.js — we
 * intercept require() at the source path and substitute mock objects so
 * the real prisma client / rate limiters / auth middleware never load.
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
    noteHighlight: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    noteStar: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    noteReaction: { count: vi.fn(), findUnique: vi.fn() },
    noteComment: { findUnique: vi.fn() },
  }
  prisma.$transaction = vi.fn(async (fn) =>
    typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
  )
  return {
    prisma,
    blockFilter: {
      getBlockedUserIds: vi.fn(async () => []),
      getMutedUserIds: vi.fn(async () => []),
      blockFilterClause: vi.fn(() => ({})),
      hasBlocked: vi.fn(async () => false),
      isBlockedEitherWay: vi.fn(async () => false),
    },
    sentry: { captureError: vi.fn() },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(({ res, user, ownerId, message }) => {
        if (user.role === 'admin' || Number(ownerId) === Number(user.userId)) return true
        if (res) res.status(403).json({ error: message || 'Forbidden' })
        return false
      }),
      assertOwner: vi.fn(({ res, user, ownerId, message }) => {
        if (Number(ownerId) === Number(user?.userId)) return true
        if (res) res.status(403).json({ error: message || 'Forbidden' })
        return false
      }),
    },
    moderationEngine: { isModerationEnabled: vi.fn(() => false), scanContent: vi.fn() },
    notify: { createNotification: vi.fn() },
    mentions: { notifyMentionedUsers: vi.fn() },
    activityTracker: { trackActivity: vi.fn() },
    noteAnchor: { buildAnchorContext: vi.fn(() => null), validateAnchorInput: vi.fn(() => null) },
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

function fakeRequireVerifiedEmail(req, _res, next) {
  next()
}

function fakeOptionalAuth(req, _res, next) {
  if (authedUser) req.user = { ...authedUser }
  next()
}

let originAllowed = true
function fakeOriginAllowlistFactory() {
  return function fakeOriginAllowlist(req, res, next) {
    if (!originAllowed) {
      return res.status(403).json({ error: 'Forbidden origin', code: 'FORBIDDEN' })
    }
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
  // G1-3 added a stricter per-(reviewer, note) cap on top of the
  // existing per-user write limiter. The test stubs it as a pass-through
  // so the route mount resolves without enforcing limits.
  noteHighlightLimiter: fakeRateLimiter,
}

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
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
  // vi.clearAllMocks() only clears .mock.calls — the mockResolvedValueOnce
  // queue is preserved across tests. Reset the implementation explicitly
  // so a Once value queued in a previous test doesn't leak into this one.
  mocks.prisma.note.findUnique.mockReset()
  mocks.prisma.noteHighlight.findMany.mockReset()
  mocks.prisma.noteHighlight.findUnique.mockReset()
  mocks.prisma.noteHighlight.create.mockReset()
  mocks.prisma.noteHighlight.delete.mockReset()
  authedUser = { userId: 42, username: 'tester', role: 'student' }
  originAllowed = true
  mocks.blockFilter.getBlockedUserIds.mockResolvedValue([])
})

// ── Helpers ──────────────────────────────────────────────────────────

function rowFor({ id = 1, noteId = 10, userId = 42, color = 'yellow', anchorText = 'hello' } = {}) {
  return {
    id,
    noteId,
    userId,
    anchorText,
    anchorOffset: 0,
    anchorContext: null,
    color,
    createdAt: new Date('2026-05-12T00:00:00Z'),
    updatedAt: new Date('2026-05-12T00:00:00Z'),
    user: { id: userId, username: `user${userId}`, avatarUrl: null },
  }
}

// ──────────────────────────────────────────────────────────────────────
// GET /:noteId/highlights
// ──────────────────────────────────────────────────────────────────────

describe('GET /:noteId/highlights', () => {
  it('owner can read highlights on their own private note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 42, private: true })
    mocks.prisma.noteHighlight.findMany.mockResolvedValueOnce([
      rowFor({ id: 1, noteId: 10, userId: 42 }),
    ])
    const res = await request(app).get('/10/highlights')
    expect(res.status).toBe(200)
    expect(res.body.highlights).toHaveLength(1)
    expect(res.body.highlights[0]).toMatchObject({
      id: 1,
      noteId: 10,
      userId: 42,
      color: 'yellow',
    })
  })

  it('returns all viewers’ highlights on a public note (auth required)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 99, private: false })
    mocks.prisma.noteHighlight.findMany.mockResolvedValueOnce([
      rowFor({ id: 1, userId: 42 }),
      rowFor({ id: 2, userId: 77 }),
      rowFor({ id: 3, userId: 99 }),
    ])
    const res = await request(app).get('/10/highlights')
    expect(res.status).toBe(200)
    expect(res.body.highlights).toHaveLength(3)
  })

  it('filters highlights from blocked users (block-filter applied)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 99, private: false })
    mocks.blockFilter.getBlockedUserIds.mockResolvedValueOnce([77])
    mocks.prisma.noteHighlight.findMany.mockResolvedValueOnce([
      rowFor({ id: 1, userId: 42 }),
      rowFor({ id: 2, userId: 99 }),
    ])
    const res = await request(app).get('/10/highlights')
    expect(res.status).toBe(200)
    // Confirm the where clause excluded the blocked user
    const findCall = mocks.prisma.noteHighlight.findMany.mock.calls[0][0]
    expect(findCall.where.userId).toEqual({ notIn: [77] })
  })

  it('returns 404 when private note is requested by non-owner', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 999, private: true })
    const res = await request(app).get('/10/highlights')
    expect(res.status).toBe(404)
    expect(mocks.prisma.noteHighlight.findMany).not.toHaveBeenCalled()
  })

  it('returns 404 when note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/9999/highlights')
    expect(res.status).toBe(404)
  })

  it('A12: rejects non-integer noteId', async () => {
    const res = await request(app).get('/abc/highlights')
    expect(res.status).toBe(400)
    expect(mocks.prisma.note.findUnique).not.toHaveBeenCalled()
  })

  it('A12: rejects zero / negative noteId', async () => {
    const r1 = await request(app).get('/0/highlights')
    expect(r1.status).toBe(400)
    const r2 = await request(app).get('/-1/highlights')
    expect(r2.status).toBe(400)
  })

  it('block-filter failure degrades gracefully (try/catch wrapped per A6)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 99, private: false })
    mocks.blockFilter.getBlockedUserIds.mockRejectedValueOnce(new Error('block table down'))
    mocks.prisma.noteHighlight.findMany.mockResolvedValueOnce([rowFor({ id: 1, userId: 42 })])
    const res = await request(app).get('/10/highlights')
    expect(res.status).toBe(200)
    expect(res.body.highlights).toHaveLength(1)
    // Should NOT pass a notIn filter when block-filter failed
    const findCall = mocks.prisma.noteHighlight.findMany.mock.calls[0][0]
    expect(findCall.where.userId).toBeUndefined()
  })

  it('returns 401 when unauthenticated (route requires auth)', async () => {
    authedUser = null
    const res = await request(app).get('/10/highlights')
    expect(res.status).toBe(401)
  })

  it('admin can read highlights on any private note', async () => {
    authedUser = { userId: 7, username: 'admin', role: 'admin' }
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 999, private: true })
    mocks.prisma.noteHighlight.findMany.mockResolvedValueOnce([rowFor({ id: 1, userId: 999 })])
    const res = await request(app).get('/10/highlights')
    expect(res.status).toBe(200)
    expect(res.body.highlights).toHaveLength(1)
  })

  it('serializes author info on each highlight', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 42, private: true })
    mocks.prisma.noteHighlight.findMany.mockResolvedValueOnce([rowFor({ id: 1, userId: 42 })])
    const res = await request(app).get('/10/highlights')
    expect(res.status).toBe(200)
    expect(res.body.highlights[0].author).toMatchObject({
      id: 42,
      username: 'user42',
    })
  })
})

// ──────────────────────────────────────────────────────────────────────
// POST /:noteId/highlights
// ──────────────────────────────────────────────────────────────────────

describe('POST /:noteId/highlights', () => {
  const validBody = { anchorText: 'photosynthesis', anchorOffset: 5, color: 'yellow' }

  it('owner can create on private note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 42, private: true })
    mocks.prisma.noteHighlight.create.mockResolvedValueOnce(rowFor({ id: 1 }))
    const res = await request(app).post('/10/highlights').send(validBody)
    expect(res.status).toBe(201)
    expect(res.body.highlight).toMatchObject({ id: 1, color: 'yellow' })
  })

  it('non-owner cannot create on private note (403)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 999, private: true })
    const res = await request(app).post('/10/highlights').send(validBody)
    expect(res.status).toBe(403)
    expect(mocks.prisma.noteHighlight.create).not.toHaveBeenCalled()
  })

  it('any auth user can create on public note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 99, private: false })
    mocks.prisma.noteHighlight.create.mockResolvedValueOnce(
      rowFor({ id: 1, userId: 42, noteId: 10 }),
    )
    const res = await request(app).post('/10/highlights').send(validBody)
    expect(res.status).toBe(201)
  })

  it('admin can create on anyone’s private note', async () => {
    authedUser = { userId: 7, username: 'admin', role: 'admin' }
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 999, private: true })
    mocks.prisma.noteHighlight.create.mockResolvedValueOnce(rowFor({ id: 1, userId: 7 }))
    const res = await request(app).post('/10/highlights').send(validBody)
    expect(res.status).toBe(201)
  })

  it('validates color against the allowlist (defaults to yellow on invalid)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 42, private: true })
    mocks.prisma.noteHighlight.create.mockResolvedValueOnce(rowFor({ id: 1, color: 'yellow' }))
    await request(app)
      .post('/10/highlights')
      .send({ ...validBody, color: 'neon-orange' })
    const createCall = mocks.prisma.noteHighlight.create.mock.calls[0][0]
    expect(createCall.data.color).toBe('yellow')
  })

  it('accepts all five enum colors (yellow|green|blue|pink|purple)', async () => {
    for (const c of ['yellow', 'green', 'blue', 'pink', 'purple']) {
      mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 42, private: true })
      mocks.prisma.noteHighlight.create.mockResolvedValueOnce(rowFor({ id: 1, color: c }))
      const res = await request(app)
        .post('/10/highlights')
        .send({ ...validBody, color: c })
      expect(res.status).toBe(201)
      expect(res.body.highlight.color).toBe(c)
    }
  })

  it('A12: rejects non-integer anchorOffset', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 42, private: true })
    const res = await request(app)
      .post('/10/highlights')
      .send({ ...validBody, anchorOffset: 'lol' })
    expect(res.status).toBe(400)
    expect(mocks.prisma.noteHighlight.create).not.toHaveBeenCalled()
  })

  it('A12: rejects negative anchorOffset', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 42, private: true })
    const res = await request(app)
      .post('/10/highlights')
      .send({ ...validBody, anchorOffset: -10 })
    expect(res.status).toBe(400)
  })

  it('A12: rejects anchorOffset above MAX_ANCHOR_OFFSET (4_000_000)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 42, private: true })
    const res = await request(app)
      .post('/10/highlights')
      .send({ ...validBody, anchorOffset: 9_999_999 })
    expect(res.status).toBe(400)
  })

  it('caps anchorText length at 2000 chars', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 42, private: true })
    mocks.prisma.noteHighlight.create.mockResolvedValueOnce(rowFor({ id: 1 }))
    const longText = 'a'.repeat(5000)
    await request(app)
      .post('/10/highlights')
      .send({ ...validBody, anchorText: longText })
    const createCall = mocks.prisma.noteHighlight.create.mock.calls[0][0]
    expect(createCall.data.anchorText.length).toBeLessThanOrEqual(2000)
  })

  it('sanitizes anchorText: strips <script> and HTML tags', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 42, private: true })
    mocks.prisma.noteHighlight.create.mockResolvedValueOnce(rowFor({ id: 1 }))
    await request(app)
      .post('/10/highlights')
      .send({ ...validBody, anchorText: '<script>alert(1)</script>hello' })
    const createCall = mocks.prisma.noteHighlight.create.mock.calls[0][0]
    expect(createCall.data.anchorText).not.toMatch(/<script>/i)
    expect(createCall.data.anchorText).not.toMatch(/<\/script>/i)
    expect(createCall.data.anchorText).toMatch(/hello/)
  })

  it('rejects empty anchorText (after strip)', async () => {
    // <span></span> reduces to empty after _stripText removes the tags.
    const res = await request(app)
      .post('/10/highlights')
      .send({ ...validBody, anchorText: '<span></span>   ' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/anchorText/i)
    expect(mocks.prisma.note.findUnique).not.toHaveBeenCalled()
  })

  it('rejects empty anchorText (missing)', async () => {
    const res = await request(app).post('/10/highlights').send({ anchorOffset: 0, color: 'yellow' })
    expect(res.status).toBe(400)
    expect(mocks.prisma.note.findUnique).not.toHaveBeenCalled()
  })

  it('A12: rejects non-integer noteId on POST', async () => {
    const res = await request(app).post('/abc/highlights').send(validBody)
    expect(res.status).toBe(400)
  })

  it('returns 404 when note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/9999/highlights').send(validBody)
    expect(res.status).toBe(404)
  })

  it('honors anchorContext when provided', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, userId: 42, private: true })
    mocks.prisma.noteHighlight.create.mockResolvedValueOnce(rowFor({ id: 1 }))
    await request(app)
      .post('/10/highlights')
      .send({ ...validBody, anchorContext: 'before...after' })
    const createCall = mocks.prisma.noteHighlight.create.mock.calls[0][0]
    expect(createCall.data.anchorContext).toMatch(/before/)
  })

  it('returns 401 when unauthenticated', async () => {
    authedUser = null
    const res = await request(app).post('/10/highlights').send(validBody)
    expect(res.status).toBe(401)
  })

  it('returns 403 when origin is not allowed (CSRF defense in depth)', async () => {
    originAllowed = false
    const res = await request(app).post('/10/highlights').send(validBody)
    expect(res.status).toBe(403)
  })
})

// ──────────────────────────────────────────────────────────────────────
// DELETE /:noteId/highlights/:id
// ──────────────────────────────────────────────────────────────────────

describe('DELETE /:noteId/highlights/:id', () => {
  it('highlight author can delete their own highlight', async () => {
    mocks.prisma.noteHighlight.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 42,
      note: { userId: 99 },
    })
    mocks.prisma.noteHighlight.delete.mockResolvedValueOnce({})
    const res = await request(app).delete('/10/highlights/5')
    expect(res.status).toBe(204)
    expect(mocks.prisma.noteHighlight.delete).toHaveBeenCalledWith({ where: { id: 5 } })
  })

  it('note owner can delete someone else’s highlight (moderation)', async () => {
    mocks.prisma.noteHighlight.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 999,
      note: { userId: 42 },
    })
    mocks.prisma.noteHighlight.delete.mockResolvedValueOnce({})
    const res = await request(app).delete('/10/highlights/5')
    expect(res.status).toBe(204)
  })

  it('admin can delete any highlight', async () => {
    authedUser = { userId: 7, username: 'admin', role: 'admin' }
    mocks.prisma.noteHighlight.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 999,
      note: { userId: 88 },
    })
    mocks.prisma.noteHighlight.delete.mockResolvedValueOnce({})
    const res = await request(app).delete('/10/highlights/5')
    expect(res.status).toBe(204)
  })

  it('unrelated user gets 403', async () => {
    mocks.prisma.noteHighlight.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 999,
      note: { userId: 888 },
    })
    const res = await request(app).delete('/10/highlights/5')
    expect(res.status).toBe(403)
    expect(mocks.prisma.noteHighlight.delete).not.toHaveBeenCalled()
  })

  it('returns 404 when highlight does not exist', async () => {
    mocks.prisma.noteHighlight.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).delete('/10/highlights/9999')
    expect(res.status).toBe(404)
  })

  it('returns 404 when highlight noteId does not match URL noteId (IDOR guard)', async () => {
    mocks.prisma.noteHighlight.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 9999,
      userId: 42,
      note: { userId: 42 },
    })
    const res = await request(app).delete('/10/highlights/5')
    expect(res.status).toBe(404)
    expect(mocks.prisma.noteHighlight.delete).not.toHaveBeenCalled()
  })

  it('A12: rejects non-integer highlight id', async () => {
    const res = await request(app).delete('/10/highlights/abc')
    expect(res.status).toBe(400)
  })

  it('A12: rejects non-integer noteId', async () => {
    const res = await request(app).delete('/abc/highlights/5')
    expect(res.status).toBe(400)
  })

  it('A12: rejects zero / negative ids on both segments', async () => {
    const r1 = await request(app).delete('/10/highlights/0')
    expect(r1.status).toBe(400)
    const r2 = await request(app).delete('/0/highlights/5')
    expect(r2.status).toBe(400)
    const r3 = await request(app).delete('/10/highlights/-1')
    expect(r3.status).toBe(400)
  })

  it('returns 403 when origin is not allowed (CSRF defense in depth)', async () => {
    originAllowed = false
    const res = await request(app).delete('/10/highlights/5')
    expect(res.status).toBe(403)
  })

  it('returns 401 when unauthenticated', async () => {
    authedUser = null
    const res = await request(app).delete('/10/highlights/5')
    expect(res.status).toBe(401)
  })
})
