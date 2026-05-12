/**
 * notes.comments.deep.test.js — Loop T3 (2026-05-12)
 *
 * Deep coverage of /api/notes/:id/comments + reactions.
 *
 *   POST   /:id/comments              — create (top-level or reply, anchored)
 *   GET    /:id/comments              — list, paginated, threaded
 *   PATCH  /:id/comments/:commentId   — resolve OR edit (within 15-min window)
 *   POST   /:id/comments/:commentId/react — like/dislike toggle
 *   DELETE /:id/comments/:commentId   — author OR note owner OR admin
 *
 * Notable invariants we assert:
 *   - A12 on every :id segment.
 *   - A13: reaction `type` must be 'like' or 'dislike'; arbitrary strings 400.
 *   - Mentions notification fires (Loop A3) on top-level comments.
 *   - Comment edit window strictly enforced at 15 minutes.
 *   - Reply depth capped at 1 — replies-to-replies are 400.
 *   - Privacy: non-readers see 404 (not 403) on comments to private notes.
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
    noteComment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    noteCommentReaction: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  }
  prisma.$transaction = vi.fn(async (fn) =>
    typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
  )
  return {
    prisma,
    sentry: { captureError: vi.fn() },
    accessControl: { assertOwnerOrAdmin: vi.fn(() => true) },
    moderationEngine: { isModerationEnabled: vi.fn(() => false), scanContent: vi.fn() },
    notify: { createNotification: vi.fn().mockResolvedValue(undefined) },
    mentions: { notifyMentionedUsers: vi.fn().mockResolvedValue(undefined) },
    activityTracker: { trackActivity: vi.fn() },
    noteAnchor: {
      buildAnchorContext: vi.fn(() => '{"prefix":"x","suffix":"y"}'),
      validateAnchorInput: vi.fn(() => null),
    },
    trustGate: { getInitialModerationStatus: vi.fn(() => 'clean') },
    commentGifAttachments: {
      normalizeCommentGifAttachments: vi.fn(() => ({ attachments: [], error: null })),
    },
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
  [require.resolve('../src/lib/trustGate'), mocks.trustGate],
  [require.resolve('../src/lib/commentGifAttachments'), mocks.commentGifAttachments],
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
  mocks.prisma.noteComment.findMany.mockReset()
  mocks.prisma.noteComment.findUnique.mockReset()
  mocks.prisma.noteComment.create.mockReset()
  mocks.prisma.noteComment.update.mockReset()
  mocks.prisma.noteComment.delete.mockReset()
  mocks.prisma.noteComment.count.mockResolvedValue(0)
  mocks.prisma.noteCommentReaction.findUnique.mockReset()
  mocks.prisma.noteCommentReaction.create.mockReset()
  mocks.prisma.noteCommentReaction.update.mockReset()
  mocks.prisma.noteCommentReaction.delete.mockReset()
  mocks.prisma.noteCommentReaction.count.mockResolvedValue(0)
  mocks.prisma.noteCommentReaction.groupBy.mockResolvedValue([])
  mocks.prisma.noteCommentReaction.findMany.mockResolvedValue([])
  mocks.noteAnchor.validateAnchorInput.mockReturnValue(null)
  mocks.commentGifAttachments.normalizeCommentGifAttachments.mockReturnValue({
    attachments: [],
    error: null,
  })
  authedUser = { userId: 42, username: 'tester', role: 'student' }
})

// ──────────────────────────────────────────────────────────────────────
// POST /:id/comments
// ──────────────────────────────────────────────────────────────────────

describe('POST /:id/comments', () => {
  it('creates a top-level comment', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 10,
      private: false,
      userId: 99,
      title: 'N',
      content: 'note body',
    })
    mocks.prisma.noteComment.create.mockResolvedValueOnce({
      id: 1,
      content: 'Hi',
      noteId: 10,
      userId: 42,
      author: { id: 42, username: 'tester' },
    })
    const res = await request(app).post('/10/comments').send({ content: 'Hi' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBe(1)
  })

  it('strips HTML tags from comment body before persisting (XSS defense)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 10,
      private: false,
      userId: 99,
      title: 'N',
      content: '',
    })
    mocks.prisma.noteComment.create.mockResolvedValueOnce({
      id: 1,
      content: 'alert(1)cleaned',
      noteId: 10,
      userId: 42,
      author: null,
    })
    await request(app)
      .post('/10/comments')
      .send({ content: '<b>bold</b> and <script>alert(1)</script>cleaned' })
    const createCall = mocks.prisma.noteComment.create.mock.calls[0][0]
    // Tags are stripped — inner text remains (it's plain text, not executable).
    // The load-bearing assertion is that no `<...>` HTML tag survives.
    expect(createCall.data.content).not.toMatch(/<[^>]+>/)
    expect(createCall.data.content).toContain('bold')
    expect(createCall.data.content).toContain('cleaned')
  })

  it('rejects empty comment', async () => {
    const res = await request(app).post('/10/comments').send({ content: '   ' })
    expect(res.status).toBe(400)
  })

  it('rejects content > 500 chars', async () => {
    const res = await request(app)
      .post('/10/comments')
      .send({ content: 'a'.repeat(501) })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/500/)
  })

  it('A12: rejects non-integer noteId', async () => {
    const res = await request(app).post('/abc/comments').send({ content: 'x' })
    expect(res.status).toBe(400)
  })

  it('returns 404 on private note (non-owner)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 10,
      private: true,
      userId: 999,
      title: 'N',
      content: '',
    })
    const res = await request(app).post('/10/comments').send({ content: 'hi' })
    expect(res.status).toBe(404)
  })

  it('anchored comment: writes anchorText / anchorOffset / anchorContext', async () => {
    mocks.noteAnchor.validateAnchorInput.mockReturnValueOnce({
      anchorText: 'photosynthesis',
      anchorOffset: 5,
    })
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 10,
      private: false,
      userId: 99,
      title: 'N',
      content: 'Plants do photosynthesis daily.',
    })
    mocks.prisma.noteComment.create.mockResolvedValueOnce({
      id: 1,
      content: 'good point',
      noteId: 10,
      userId: 42,
      author: null,
    })
    await request(app)
      .post('/10/comments')
      .send({ content: 'good point', anchorText: 'photosynthesis', anchorOffset: 5 })
    const createCall = mocks.prisma.noteComment.create.mock.calls[0][0]
    expect(createCall.data.anchorText).toBe('photosynthesis')
    expect(createCall.data.anchorOffset).toBe(5)
    expect(createCall.data.anchorContext).toMatch(/prefix/)
  })

  it('reply (parentId) capped at depth 1: replying to a reply → 400', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 10,
      private: false,
      userId: 99,
      title: 'N',
      content: '',
    })
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      parentId: 4,
    })
    const res = await request(app).post('/10/comments').send({ content: 'reply', parentId: 5 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/replies/i)
  })

  it('reply: parentId from a different note → 400', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 10,
      private: false,
      userId: 99,
      title: 'N',
      content: '',
    })
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 999,
      parentId: null,
    })
    const res = await request(app).post('/10/comments').send({ content: 'reply', parentId: 5 })
    expect(res.status).toBe(400)
  })

  it('mention notification fires on top-level comment (Loop A3)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 10,
      private: false,
      userId: 99,
      title: 'N',
      content: '',
    })
    mocks.prisma.noteComment.create.mockResolvedValueOnce({
      id: 1,
      content: 'hey @alice nice work',
      noteId: 10,
      userId: 42,
      author: null,
    })
    await request(app).post('/10/comments').send({ content: 'hey @alice nice work' })
    expect(mocks.mentions.notifyMentionedUsers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        text: 'hey @alice nice work',
        actorUsername: 'tester',
      }),
    )
  })

  it('notifies note owner on top-level comment from another user', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 10,
      private: false,
      userId: 99,
      title: 'My Note',
      content: '',
    })
    mocks.prisma.noteComment.create.mockResolvedValueOnce({
      id: 1,
      content: 'good note',
      noteId: 10,
      userId: 42,
      author: null,
    })
    await request(app).post('/10/comments').send({ content: 'good note' })
    expect(mocks.notify.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 99, type: 'comment' }),
    )
  })
})

// ──────────────────────────────────────────────────────────────────────
// GET /:id/comments
// ──────────────────────────────────────────────────────────────────────

describe('GET /:id/comments', () => {
  it('returns paginated list with reaction counts', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, private: false, userId: 99 })
    mocks.prisma.noteComment.findMany.mockResolvedValueOnce([
      {
        id: 1,
        content: 'top',
        noteId: 10,
        userId: 42,
        replies: [],
        attachments: [],
        author: null,
      },
    ])
    mocks.prisma.noteComment.count.mockResolvedValueOnce(1)
    const res = await request(app).get('/10/comments')
    expect(res.status).toBe(200)
    expect(res.body.comments).toHaveLength(1)
    expect(res.body.total).toBe(1)
    expect(res.body.comments[0].reactionCounts).toEqual({ like: 0, dislike: 0 })
  })

  it('threaded: top-level comment with replies enriched', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, private: false, userId: 99 })
    mocks.prisma.noteComment.findMany.mockResolvedValueOnce([
      {
        id: 1,
        content: 'top',
        noteId: 10,
        userId: 42,
        attachments: [],
        author: null,
        replies: [
          {
            id: 2,
            content: 'reply',
            noteId: 10,
            userId: 7,
            attachments: [],
            author: null,
          },
        ],
      },
    ])
    mocks.prisma.noteComment.count.mockResolvedValueOnce(1)
    const res = await request(app).get('/10/comments')
    expect(res.status).toBe(200)
    expect(res.body.comments[0].replies).toHaveLength(1)
    expect(res.body.comments[0].replyCount).toBe(1)
  })

  it('returns 404 on private note for non-owner', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, private: true, userId: 999 })
    const res = await request(app).get('/10/comments')
    expect(res.status).toBe(404)
  })

  it('A12: rejects non-integer noteId', async () => {
    const res = await request(app).get('/abc/comments')
    expect(res.status).toBe(400)
  })

  it('honors limit + offset query params', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, private: false, userId: 99 })
    mocks.prisma.noteComment.findMany.mockResolvedValueOnce([])
    mocks.prisma.noteComment.count.mockResolvedValueOnce(0)
    await request(app).get('/10/comments?limit=5&offset=15')
    const findCall = mocks.prisma.noteComment.findMany.mock.calls[0][0]
    expect(findCall.take).toBe(5)
    expect(findCall.skip).toBe(15)
  })
})

// ──────────────────────────────────────────────────────────────────────
// PATCH /:id/comments/:commentId
// ──────────────────────────────────────────────────────────────────────

describe('PATCH /:id/comments/:commentId', () => {
  it('comment author can edit within 15 minutes', async () => {
    const recent = new Date(Date.now() - 60_000) // 1 minute ago
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 42,
      createdAt: recent,
      note: { id: 10, userId: 99 },
    })
    mocks.prisma.noteComment.update.mockResolvedValueOnce({
      id: 5,
      content: 'edited',
      author: null,
    })
    const res = await request(app).patch('/10/comments/5').send({ content: 'edited' })
    expect(res.status).toBe(200)
    expect(res.body.content).toBe('edited')
  })

  it('edit window expired: 403', async () => {
    const old = new Date(Date.now() - 20 * 60_000) // 20 minutes ago
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 42,
      createdAt: old,
      note: { id: 10, userId: 99 },
    })
    const res = await request(app).patch('/10/comments/5').send({ content: 'too late' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/15 minutes/i)
  })

  it('only comment author can edit (someone else → 403)', async () => {
    const recent = new Date(Date.now() - 60_000)
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 999, // someone else
      createdAt: recent,
      note: { id: 10, userId: 99 },
    })
    const res = await request(app).patch('/10/comments/5').send({ content: 'evil' })
    expect(res.status).toBe(403)
  })

  it('note owner can resolve a comment', async () => {
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 999,
      createdAt: new Date(),
      note: { id: 10, userId: 42 }, // current user is note owner
    })
    mocks.prisma.noteComment.update.mockResolvedValueOnce({ id: 5, resolved: true, author: null })
    const res = await request(app).patch('/10/comments/5').send({ resolved: true })
    expect(res.status).toBe(200)
    expect(res.body.resolved).toBe(true)
  })

  it('non-owner cannot resolve: 403', async () => {
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 999,
      createdAt: new Date(),
      note: { id: 10, userId: 7 }, // different owner
    })
    const res = await request(app).patch('/10/comments/5').send({ resolved: true })
    expect(res.status).toBe(403)
  })

  it('A12: rejects non-integer ids on either segment', async () => {
    const r1 = await request(app).patch('/abc/comments/5').send({ resolved: true })
    expect(r1.status).toBe(400)
    const r2 = await request(app).patch('/10/comments/abc').send({ resolved: true })
    expect(r2.status).toBe(400)
  })

  it('400 when neither resolved nor content is supplied', async () => {
    const res = await request(app).patch('/10/comments/5').send({})
    expect(res.status).toBe(400)
  })
})

// ──────────────────────────────────────────────────────────────────────
// POST /:id/comments/:commentId/react
// ──────────────────────────────────────────────────────────────────────

describe('POST /:id/comments/:commentId/react', () => {
  it('A13: rejects type other than like/dislike', async () => {
    const res = await request(app).post('/10/comments/5/react').send({ type: 'spam' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/like.*dislike/i)
  })

  it('A13: rejects missing type', async () => {
    const res = await request(app).post('/10/comments/5/react').send({})
    expect(res.status).toBe(400)
  })

  it('creates a new reaction on first like', async () => {
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({ id: 5, noteId: 10 })
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, private: false, userId: 99 })
    mocks.prisma.noteCommentReaction.findUnique
      .mockResolvedValueOnce(null) // no existing
      .mockResolvedValueOnce({ type: 'like' }) // post-create lookup
    mocks.prisma.noteCommentReaction.count
      .mockResolvedValueOnce(1) // likes
      .mockResolvedValueOnce(0) // dislikes
    const res = await request(app).post('/10/comments/5/react').send({ type: 'like' })
    expect(res.status).toBe(200)
    expect(res.body.reactionCounts).toEqual({ like: 1, dislike: 0 })
    expect(mocks.prisma.noteCommentReaction.create).toHaveBeenCalled()
  })

  it('removes reaction when same type pressed again', async () => {
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({ id: 5, noteId: 10 })
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 10, private: false, userId: 99 })
    mocks.prisma.noteCommentReaction.findUnique
      .mockResolvedValueOnce({ type: 'like' }) // existing matches
      .mockResolvedValueOnce(null) // post-delete lookup
    mocks.prisma.noteCommentReaction.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0)
    const res = await request(app).post('/10/comments/5/react').send({ type: 'like' })
    expect(res.status).toBe(200)
    expect(mocks.prisma.noteCommentReaction.delete).toHaveBeenCalled()
    expect(res.body.userReaction).toBeNull()
  })

  it('returns 404 when comment is from a different note (IDOR guard)', async () => {
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({ id: 5, noteId: 999 })
    const res = await request(app).post('/10/comments/5/react').send({ type: 'like' })
    expect(res.status).toBe(404)
  })

  it('A12: rejects non-integer commentId', async () => {
    const res = await request(app).post('/10/comments/abc/react').send({ type: 'like' })
    expect(res.status).toBe(400)
  })
})

// ──────────────────────────────────────────────────────────────────────
// DELETE /:id/comments/:commentId
// ──────────────────────────────────────────────────────────────────────

describe('DELETE /:id/comments/:commentId', () => {
  it('comment author can delete', async () => {
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 42,
      note: { id: 10, userId: 99 },
    })
    mocks.prisma.noteComment.delete.mockResolvedValueOnce({})
    const res = await request(app).delete('/10/comments/5')
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/deleted/i)
  })

  it('note owner can delete someone else’s comment', async () => {
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 999,
      note: { id: 10, userId: 42 },
    })
    mocks.prisma.noteComment.delete.mockResolvedValueOnce({})
    const res = await request(app).delete('/10/comments/5')
    expect(res.status).toBe(200)
  })

  it('unrelated user gets 403', async () => {
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 999,
      note: { id: 10, userId: 888 },
    })
    const res = await request(app).delete('/10/comments/5')
    expect(res.status).toBe(403)
  })

  it('admin can delete anyone’s comment', async () => {
    authedUser = { userId: 7, username: 'admin', role: 'admin' }
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 10,
      userId: 999,
      note: { id: 10, userId: 888 },
    })
    mocks.prisma.noteComment.delete.mockResolvedValueOnce({})
    const res = await request(app).delete('/10/comments/5')
    expect(res.status).toBe(200)
  })

  it('returns 404 when comment id does not match note id (IDOR guard)', async () => {
    mocks.prisma.noteComment.findUnique.mockResolvedValueOnce({
      id: 5,
      noteId: 9999,
      userId: 42,
      note: { id: 9999, userId: 42 },
    })
    const res = await request(app).delete('/10/comments/5')
    expect(res.status).toBe(404)
  })

  it('A12: rejects non-integer commentId', async () => {
    const res = await request(app).delete('/10/comments/abc')
    expect(res.status).toBe(400)
  })
})
