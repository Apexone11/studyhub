/**
 * feed.social.deep.test.js — comprehensive coverage of feed comments + reactions.
 *
 * Focus:
 *   - Comment POST validates type (text), length, parentId belongs to same post
 *   - React POST validates type allowlist (like/dislike/null)
 *   - Sort allowlist on GET /posts/:id/comments?sort=
 *   - Block-filter graceful for listing flows
 *   - Star/reaction atomic increment via groupBy + Promise.all
 *   - Delete by author or admin (assertOwnerOrAdmin)
 *   - PATCH edit window enforcement (15 min)
 *   - Comment reactions (like/dislike) with idempotent toggle
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const feedRoutePath = require.resolve('../src/modules/feed')

const mocks = vi.hoisted(() => {
  const prisma = {
    announcement: { findMany: vi.fn() },
    studySheet: { findMany: vi.fn() },
    feedPost: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    feedPostComment: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      groupBy: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    feedPostReaction: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    feedPostCommentReaction: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    note: { findMany: vi.fn() },
    noteComment: { groupBy: vi.fn() },
    starredSheet: { findMany: vi.fn() },
    comment: { groupBy: vi.fn() },
    reaction: { findMany: vi.fn(), groupBy: vi.fn() },
    enrollment: { findMany: vi.fn() },
    userFollow: { findMany: vi.fn() },
    userSchoolEnrollment: { findMany: vi.fn() },
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    sentry: { captureError: vi.fn() },
    notify: { createNotification: vi.fn().mockResolvedValue({}) },
    mentions: { notifyMentionedUsers: vi.fn().mockResolvedValue() },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(() => true),
      sendForbidden: vi.fn(),
    },
    storage: {
      cleanupAttachmentIfUnused: vi.fn(),
      resolveAttachmentPath: vi.fn(),
    },
    attachmentPreview: { sendAttachmentPreview: vi.fn() },
    moderationEngine: {
      isModerationEnabled: vi.fn(() => false),
      scanContent: vi.fn(),
    },
    blockFilter: {
      getBlockedUserIds: vi.fn().mockResolvedValue([]),
      getMutedUserIds: vi.fn().mockResolvedValue([]),
    },
    userBadges: {
      enrichUsersWithBadges: vi.fn(async (users) => users),
    },
    trustGate: {
      getInitialModerationStatus: vi.fn(() => 'clean'),
    },
    abuseDetection: {
      runAbuseChecks: vi.fn().mockResolvedValue(undefined),
    },
    commentGifAttachments: {
      normalizeCommentGifAttachments: vi.fn(() => ({ attachments: [], error: null })),
    },
    feedConstants: {
      reactLimiter: (_req, _res, next) => next(),
      commentLimiter: (_req, _res, next) => next(),
      feedWriteLimiter: (_req, _res, next) => next(),
      feedReadLimiter: (_req, _res, next) => next(),
      attachmentDownloadLimiter: (_req, _res, next) => next(),
      authLimiter: (_req, _res, next) => next(),
      leaderboardLimiter: (_req, _res, next) => next(),
    },
    rateLimiters: new Proxy(
      {},
      {
        get: () => (_req, _res, next) => next(),
      },
    ),
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/storage'), mocks.storage],
  [require.resolve('../src/lib/attachmentPreview'), mocks.attachmentPreview],
  [require.resolve('../src/lib/moderation/moderationEngine'), mocks.moderationEngine],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
  [require.resolve('../src/lib/userBadges'), mocks.userBadges],
  [require.resolve('../src/lib/trustGate'), mocks.trustGate],
  [require.resolve('../src/lib/abuseDetection'), mocks.abuseDetection],
  [require.resolve('../src/lib/commentGifAttachments'), mocks.commentGifAttachments],
  [require.resolve('../src/modules/feed/feed.constants'), mocks.feedConstants],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
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

  delete require.cache[feedRoutePath]
  const feedRouterModule = require(feedRoutePath)
  const feedRouter = feedRouterModule.default || feedRouterModule

  app = express()
  app.use(express.json())
  app.use('/', feedRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[feedRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.accessControl.assertOwnerOrAdmin.mockReturnValue(true)
  mocks.trustGate.getInitialModerationStatus.mockReturnValue('clean')
  mocks.commentGifAttachments.normalizeCommentGifAttachments.mockReturnValue({
    attachments: [],
    error: null,
  })
  mocks.prisma.feedPostComment.count.mockResolvedValue(0)
  mocks.prisma.feedPostComment.findMany.mockResolvedValue([])
  // After clearAllMocks the mockResolvedValue/mockImplementation set in
  // hoisted state is cleared on the `notify`/`mentions` stubs. Re-seed.
  mocks.notify.createNotification.mockResolvedValue({})
  mocks.mentions.notifyMentionedUsers.mockResolvedValue()
  mocks.abuseDetection.runAbuseChecks.mockResolvedValue(undefined)
})

// ── 1) Comment POST validation ────────────────────────────────────────────
describe('POST /posts/:id/comments — validation', () => {
  it('creates a top-level comment when payload is valid', async () => {
    mocks.prisma.feedPost.findUnique.mockResolvedValue({
      id: 10,
      userId: 99,
      author: { id: 99, username: 'op' },
    })
    mocks.prisma.feedPostComment.create.mockResolvedValue({
      id: 1,
      content: 'hi',
      postId: 10,
      userId: 42,
      author: { id: 42, username: 'test_user', avatarUrl: null },
      createdAt: new Date(),
    })

    const res = await request(app).post('/posts/10/comments').send({ content: 'hi' })
    expect(res.status).toBe(201)
    expect(res.body.content).toBe('hi')
    expect(mocks.notify.createNotification).toHaveBeenCalled()
  })

  it('rejects empty content', async () => {
    const res = await request(app).post('/posts/10/comments').send({ content: '' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/empty/i)
  })

  it('rejects content over 500 characters', async () => {
    const res = await request(app)
      .post('/posts/10/comments')
      .send({ content: 'x'.repeat(501) })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/500/)
  })

  it('returns 404 when the parent post does not exist', async () => {
    mocks.prisma.feedPost.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/posts/123/comments').send({ content: 'hello' })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/post not found/i)
  })

  it('rejects an invalid post id (non-integer)', async () => {
    const res = await request(app).post('/posts/banana/comments').send({ content: 'hi' })
    expect(res.status).toBe(400)
  })

  it('rejects a parentId that belongs to a different post', async () => {
    mocks.prisma.feedPost.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      author: { id: 1, username: 'op' },
    })
    mocks.prisma.feedPostComment.findUnique.mockResolvedValue({
      id: 50,
      postId: 999, // wrong post
      parentId: null,
    })

    const res = await request(app)
      .post('/posts/10/comments')
      .send({ content: 'reply', parentId: 50 })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/different post/i)
  })

  it('rejects a parentId that already is a reply (depth cap = 1)', async () => {
    mocks.prisma.feedPost.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      author: { id: 1, username: 'op' },
    })
    mocks.prisma.feedPostComment.findUnique.mockResolvedValue({
      id: 51,
      postId: 10,
      parentId: 50, // already nested
    })

    const res = await request(app)
      .post('/posts/10/comments')
      .send({ content: 'reply-of-reply', parentId: 51 })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/replies/i)
  })
})

// ── 2) React POST allowlist ───────────────────────────────────────────────
describe('POST /posts/:id/react — reaction allowlist', () => {
  it('rejects an emoji that is not in the like/dislike/null allowlist', async () => {
    const res = await request(app).post('/posts/10/react').send({ type: '🔥' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/like.*dislike/)
  })

  it('accepts null as a remove-reaction signal', async () => {
    mocks.prisma.feedPost.findUnique.mockResolvedValue({ id: 10 })
    mocks.prisma.feedPostReaction.findUnique.mockResolvedValue({
      userId: 42,
      postId: 10,
      type: 'like',
    })
    mocks.prisma.feedPostReaction.delete.mockResolvedValue({})
    mocks.prisma.feedPostReaction.groupBy.mockResolvedValue([])
    mocks.prisma.feedPostReaction.findMany.mockResolvedValue([])

    const res = await request(app).post('/posts/10/react').send({ type: null })
    expect(res.status).toBe(200)
    expect(res.body.userReaction).toBeNull()
  })

  it('accepts `like` and toggles the reaction on', async () => {
    mocks.prisma.feedPost.findUnique.mockResolvedValue({ id: 10 })
    mocks.prisma.feedPostReaction.findUnique.mockResolvedValue(null)
    mocks.prisma.feedPostReaction.create.mockResolvedValue({})
    mocks.prisma.feedPostReaction.groupBy.mockResolvedValue([
      { postId: 10, type: 'like', _count: { _all: 1 } },
    ])
    mocks.prisma.feedPostReaction.findMany.mockResolvedValue([{ postId: 10, type: 'like' }])

    const res = await request(app).post('/posts/10/react').send({ type: 'like' })
    expect(res.status).toBe(200)
    expect(res.body.likes).toBe(1)
    expect(res.body.userReaction).toBe('like')
  })
})

// ── 3) GET /posts/:id/comments — sort allowlist ───────────────────────────
describe('GET /posts/:id/comments — sort handling', () => {
  it('accepts ?sort=newest|oldest|top without 400', async () => {
    mocks.prisma.feedPostComment.findMany.mockResolvedValue([])
    mocks.prisma.feedPostComment.count.mockResolvedValue(0)

    for (const sort of ['newest', 'oldest', 'top']) {
      const res = await request(app).get('/posts/10/comments').query({ sort })
      expect(res.status).toBe(200)
    }
  })

  it('returns a structured envelope { comments, total, limit, offset }', async () => {
    mocks.prisma.feedPostComment.findMany.mockResolvedValue([
      {
        id: 1,
        content: 'top-level',
        postId: 10,
        createdAt: new Date(),
        author: { id: 42, username: 'me', avatarUrl: null },
        reactions: [],
        attachments: [],
        replies: [],
      },
    ])
    mocks.prisma.feedPostComment.count.mockResolvedValue(1)

    const res = await request(app).get('/posts/10/comments')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      comments: expect.any(Array),
      total: 1,
      limit: 20,
      offset: 0,
    })
  })

  it('top sort orders by net likes (like-dislike) desc', async () => {
    mocks.prisma.feedPostComment.findMany.mockResolvedValue([
      {
        id: 1,
        content: 'low',
        postId: 10,
        createdAt: new Date(Date.now() - 1000),
        author: { id: 42, username: 'me' },
        reactions: [{ userId: 1, type: 'like' }],
        attachments: [],
        replies: [],
      },
      {
        id: 2,
        content: 'high',
        postId: 10,
        createdAt: new Date(),
        author: { id: 43, username: 'them' },
        reactions: [
          { userId: 1, type: 'like' },
          { userId: 2, type: 'like' },
          { userId: 3, type: 'like' },
        ],
        attachments: [],
        replies: [],
      },
    ])
    mocks.prisma.feedPostComment.count.mockResolvedValue(2)

    const res = await request(app).get('/posts/10/comments').query({ sort: 'top' })
    expect(res.status).toBe(200)
    expect(res.body.comments[0].id).toBe(2)
    expect(res.body.comments[1].id).toBe(1)
  })
})

// ── 4) Comment reactions toggle ───────────────────────────────────────────
describe('POST /posts/:id/comments/:commentId/react', () => {
  it('rejects when type is not like/dislike', async () => {
    const res = await request(app).post('/posts/10/comments/1/react').send({ type: 'love' })
    expect(res.status).toBe(400)
  })

  it('creates a like reaction when none exists', async () => {
    mocks.prisma.feedPostComment.findUnique.mockResolvedValue({ id: 1, postId: 10 })
    mocks.prisma.feedPostCommentReaction.findUnique
      .mockResolvedValueOnce(null) // initial existing lookup
      .mockResolvedValueOnce({ type: 'like' }) // final lookup for response
    mocks.prisma.feedPostCommentReaction.create.mockResolvedValue({})
    mocks.prisma.feedPostCommentReaction.count
      .mockResolvedValueOnce(1) // likes
      .mockResolvedValueOnce(0) // dislikes

    const res = await request(app).post('/posts/10/comments/1/react').send({ type: 'like' })

    expect(res.status).toBe(200)
    expect(res.body.reactionCounts).toEqual({ like: 1, dislike: 0 })
    expect(res.body.userReaction).toBe('like')
  })

  it('returns 404 when the comment is missing', async () => {
    mocks.prisma.feedPostComment.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/posts/10/comments/999/react').send({ type: 'like' })
    expect(res.status).toBe(404)
  })
})

// ── 5) Delete by author or admin ──────────────────────────────────────────
describe('DELETE /posts/:id/comments/:commentId — owner/admin guard', () => {
  it('deletes when the assertOwnerOrAdmin guard passes', async () => {
    mocks.prisma.feedPostComment.findUnique.mockResolvedValue({
      id: 1,
      userId: 42,
      postId: 10,
    })
    mocks.prisma.feedPostComment.delete.mockResolvedValue({})

    const res = await request(app).delete('/posts/10/comments/1')
    expect(res.status).toBe(200)
    expect(mocks.accessControl.assertOwnerOrAdmin).toHaveBeenCalled()
  })

  it('returns 404 when the comment is missing', async () => {
    mocks.prisma.feedPostComment.findUnique.mockResolvedValue(null)
    const res = await request(app).delete('/posts/10/comments/999')
    expect(res.status).toBe(404)
  })

  it('refuses on a non-integer comment id (A12)', async () => {
    const res = await request(app).delete('/posts/10/comments/banana')
    expect(res.status).toBe(400)
  })
})

// ── 6) PATCH /posts/:id/comments/:commentId — edit window ─────────────────
describe('PATCH /posts/:id/comments/:commentId — 15-min edit window', () => {
  it('rejects an edit beyond 15 minutes after creation', async () => {
    mocks.prisma.feedPostComment.findUnique.mockResolvedValue({
      id: 1,
      userId: 42,
      postId: 10,
      createdAt: new Date(Date.now() - 16 * 60 * 1000),
    })

    const res = await request(app).patch('/posts/10/comments/1').send({ content: 'late edit' })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/15 minutes/i)
  })

  it('rejects when the editor is not the author', async () => {
    mocks.prisma.feedPostComment.findUnique.mockResolvedValue({
      id: 1,
      userId: 999, // someone else
      postId: 10,
      createdAt: new Date(),
    })

    const res = await request(app).patch('/posts/10/comments/1').send({ content: 'hijack edit' })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/own/i)
  })

  it('accepts an edit within the 15-min window', async () => {
    mocks.prisma.feedPostComment.findUnique.mockResolvedValue({
      id: 1,
      userId: 42,
      postId: 10,
      createdAt: new Date(),
    })
    mocks.prisma.feedPostComment.update.mockResolvedValue({
      id: 1,
      content: 'edited',
      author: { id: 42, username: 'test_user', avatarUrl: null },
    })

    const res = await request(app).patch('/posts/10/comments/1').send({ content: 'edited' })

    expect(res.status).toBe(200)
    expect(res.body.content).toBe('edited')
  })
})

// ── 7) End-to-end notify integration ──────────────────────────────────────
describe('Comment creation side effects', () => {
  it('notifies the post author and any mentions on a top-level comment', async () => {
    mocks.prisma.feedPost.findUnique.mockResolvedValue({
      id: 10,
      userId: 99,
      author: { id: 99, username: 'op' },
    })
    mocks.prisma.feedPostComment.create.mockResolvedValue({
      id: 1,
      content: 'Hey @alice',
      postId: 10,
      userId: 42,
      author: { id: 42, username: 'test_user', avatarUrl: null },
      createdAt: new Date(),
    })

    await request(app).post('/posts/10/comments').send({ content: 'Hey @alice' })

    expect(mocks.notify.createNotification).toHaveBeenCalled()
    expect(mocks.mentions.notifyMentionedUsers).toHaveBeenCalled()
  })

  it('does NOT mention-notify replies (parentId branch skips it)', async () => {
    mocks.prisma.feedPost.findUnique.mockResolvedValue({
      id: 10,
      userId: 99,
      author: { id: 99, username: 'op' },
    })
    mocks.prisma.feedPostComment.findUnique
      .mockResolvedValueOnce({ id: 50, postId: 10, parentId: null }) // parent check
      .mockResolvedValueOnce({ userId: 99 }) // notify parent author lookup
    mocks.prisma.feedPostComment.create.mockResolvedValue({
      id: 51,
      content: 'reply',
      postId: 10,
      userId: 42,
      author: { id: 42, username: 'test_user', avatarUrl: null },
      createdAt: new Date(),
    })

    await request(app).post('/posts/10/comments').send({ content: 'reply', parentId: 50 })

    // Notify the parent comment author, not mentions.
    expect(mocks.notify.createNotification).toHaveBeenCalled()
    expect(mocks.mentions.notifyMentionedUsers).not.toHaveBeenCalled()
  })
})
