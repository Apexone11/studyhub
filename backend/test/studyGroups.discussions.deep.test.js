/**
 * studyGroups.discussions.deep.test.js — Deep coverage for discussions sub-router.
 *
 * Targets: GET/POST /:id/discussions, GET/PATCH/DELETE /:id/discussions/:postId,
 * POST/PATCH/DELETE /:id/discussions/:postId/replies[/:replyId],
 * PATCH /:postId/resolve, POST upvote.
 * Covers: type enum (A13), title/content caps, parent thread anchoring,
 * mentions fan-out, block-filter on listing, edit window /
 * permission, A12, soft-delete, author-or-mod gates.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const discussionsPath = require.resolve('../src/modules/studyGroups/studyGroups.discussions.routes')

const mocks = vi.hoisted(() => {
  const state = { userId: 42, role: 'student' }
  const prisma = {
    groupDiscussionPost: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    groupDiscussionReply: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    discussionUpvote: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      delete: vi.fn(),
    },
    studyGroupMember: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    studyGroup: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  }
  return {
    state,
    prisma,
    notify: {
      createNotification: vi.fn().mockResolvedValue(undefined),
      createNotifications: vi.fn().mockResolvedValue(undefined),
    },
    blockFilter: { getBlockedUserIds: vi.fn().mockResolvedValue([]) },
    mentions: { notifyMentionedUsers: vi.fn().mockResolvedValue(undefined) },
    reportsService: { writeAuditLog: vi.fn().mockResolvedValue(undefined) },
    socketio: { getIO: () => ({ to: () => ({ emit: vi.fn() }) }) },
  }
})

const originalLoad = Module._load
let app

beforeAll(() => {
  const mockTargets = new Map([
    [require.resolve('../src/lib/prisma'), mocks.prisma],
    [
      require.resolve('../src/middleware/auth'),
      (req, _res, next) => {
        req.user = { userId: mocks.state.userId, username: 'caller', role: mocks.state.role }
        next()
      },
    ],
    [
      require.resolve('../src/middleware/originAllowlist'),
      Object.assign(() => (_req, _res, next) => next(), {
        normalizeOrigin: (v) => v,
        buildTrustedOrigins: () => new Set(),
      }),
    ],
    [require.resolve('../src/monitoring/sentry'), { captureError: vi.fn() }],
    [
      require.resolve('../src/lib/rateLimiters'),
      {
        readLimiter: (_req, _res, next) => next(),
        writeLimiter: (_req, _res, next) => next(),
      },
    ],
    [require.resolve('../src/lib/notify'), mocks.notify],
    [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
    [require.resolve('../src/lib/mentions'), mocks.mentions],
    [require.resolve('../src/lib/socketio'), mocks.socketio],
    [
      require.resolve('../src/modules/studyGroups/studyGroups.reports.service'),
      mocks.reportsService,
    ],
  ])
  Module._load = function patched(reqId, parent, isMain) {
    const resolved = Module._resolveFilename(reqId, parent, isMain)
    if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    return originalLoad.apply(this, arguments)
  }
  delete require.cache[discussionsPath]
  const routerModule = require(discussionsPath)
  app = express()
  app.use(express.json())
  app.use('/groups/:id/discussions', routerModule.default || routerModule)
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[discussionsPath]
})

function basePost(overrides = {}) {
  return {
    id: 10,
    groupId: 1,
    userId: 42,
    title: 't',
    content: 'c',
    type: 'discussion',
    pinned: false,
    resolved: false,
    status: 'published',
    attachments: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.role = 'student'
  mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
    id: 9,
    groupId: 1,
    userId: 42,
    role: 'member',
    status: 'active',
  })
  mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])
  mocks.prisma.studyGroup.findUnique.mockResolvedValue({
    id: 1,
    name: 'G',
    requirePostApproval: false,
  })
  mocks.prisma.groupDiscussionPost.findMany.mockResolvedValue([])
  mocks.prisma.groupDiscussionPost.count.mockResolvedValue(0)
})

describe('Discussions: GET /', () => {
  it('returns published posts for regular member', async () => {
    mocks.prisma.groupDiscussionPost.findMany.mockResolvedValue([
      {
        ...basePost(),
        author: { id: 42, username: 'caller', avatarUrl: null },
        // listDiscussions now counts via _count (relation aggregate) instead of
        // materializing every reply/upvote row (2026-05-31 perf fix).
        _count: { replies: 1, upvotes: 0 },
      },
    ])
    mocks.prisma.groupDiscussionPost.count.mockResolvedValue(1)
    const res = await request(app).get('/groups/1/discussions')
    expect(res.status).toBe(200)
    expect(res.body.posts[0].replyCount).toBe(1)
  })

  it('filters by type query parameter', async () => {
    const res = await request(app).get('/groups/1/discussions?type=question')
    expect(res.status).toBe(200)
    expect(mocks.prisma.groupDiscussionPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'question' }),
      }),
    )
  })

  it('respects pagination', async () => {
    const res = await request(app).get('/groups/1/discussions?limit=10&offset=20')
    expect(res.status).toBe(200)
    expect(mocks.prisma.groupDiscussionPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    )
  })

  it('returns 404 when caller is not a member', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/groups/1/discussions')
    expect(res.status).toBe(404)
  })

  it('A12: rejects bad group id', async () => {
    const res = await request(app).get('/groups/banana/discussions')
    expect(res.status).toBe(400)
  })
})

describe('Discussions: POST /', () => {
  beforeEach(() => {
    mocks.prisma.groupDiscussionPost.create.mockImplementation(async ({ data }) => ({
      ...basePost(),
      ...data,
      author: { id: 42, username: 'caller', avatarUrl: null },
    }))
    mocks.prisma.studyGroupMember.findMany.mockResolvedValue([{ userId: 99 }])
  })

  it('creates a discussion post and fires mention notify (Loop A3)', async () => {
    const res = await request(app).post('/groups/1/discussions').send({
      title: 'Hello @bob',
      content: 'Hey @bob what about question 5?',
      type: 'discussion',
    })
    expect(res.status).toBe(201)
    expect(mocks.mentions.notifyMentionedUsers).toHaveBeenCalled()
  })

  it('rejects invalid type (A13 enum)', async () => {
    const res = await request(app).post('/groups/1/discussions').send({
      title: 't',
      content: 'c',
      type: 'rant',
    })
    expect(res.status).toBe(400)
  })

  it('rejects empty title', async () => {
    const res = await request(app).post('/groups/1/discussions').send({
      title: '',
      content: 'c',
      type: 'discussion',
    })
    expect(res.status).toBe(400)
  })

  it('rejects empty content', async () => {
    const res = await request(app).post('/groups/1/discussions').send({
      title: 't',
      content: '',
      type: 'discussion',
    })
    expect(res.status).toBe(400)
  })

  it('rejects content >5000 chars', async () => {
    const res = await request(app)
      .post('/groups/1/discussions')
      .send({
        title: 't',
        content: 'x'.repeat(5001),
        type: 'discussion',
      })
    expect(res.status).toBe(400)
  })

  it('regular member cannot create announcement type (admin only)', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).post('/groups/1/discussions').send({
      title: 't',
      content: 'c',
      type: 'announcement',
    })
    expect(res.status).toBe(403)
  })

  it('returns 404 when caller not member (post anchored to group)', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/groups/1/discussions').send({
      title: 't',
      content: 'c',
      type: 'discussion',
    })
    expect(res.status).toBe(404)
  })

  it('block-filter excludes blocked users from mention allowlist', async () => {
    mocks.blockFilter.getBlockedUserIds.mockResolvedValue([99])
    await request(app).post('/groups/1/discussions').send({
      title: 't',
      content: 'hi @bob',
      type: 'discussion',
    })
    expect(mocks.mentions.notifyMentionedUsers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ restrictToUserIds: expect.not.arrayContaining([99]) }),
    )
  })
})

describe('Discussions: replies', () => {
  beforeEach(() => {
    mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue(basePost())
    mocks.prisma.groupDiscussionReply.create.mockImplementation(async ({ data }) => ({
      id: 200,
      ...data,
      isAnswer: data.isAnswer || false,
      author: { id: 42, username: 'caller', avatarUrl: null },
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  })

  it('creates a reply anchored to a post in the same group', async () => {
    const res = await request(app).post('/groups/1/discussions/10/replies').send({
      content: 'reply body',
    })
    expect(res.status).toBe(201)
    expect(res.body.content).toBe('reply body')
  })

  it('returns 404 if post is in a different group', async () => {
    mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue(basePost({ groupId: 999 }))
    const res = await request(app).post('/groups/1/discussions/10/replies').send({
      content: 'x',
    })
    expect(res.status).toBe(404)
  })

  it('rejects empty content on reply', async () => {
    const res = await request(app).post('/groups/1/discussions/10/replies').send({
      content: '',
    })
    expect(res.status).toBe(400)
  })

  it('rejects reply content >5000 chars', async () => {
    const res = await request(app)
      .post('/groups/1/discussions/10/replies')
      .send({
        content: 'x'.repeat(5001),
      })
    expect(res.status).toBe(400)
  })

  it('A12: rejects non-numeric replyId on PATCH', async () => {
    const res = await request(app).patch('/groups/1/discussions/10/replies/notanid').send({
      content: 'x',
    })
    expect(res.status).toBe(400)
  })
})

describe('Discussions: reply edit/delete membership gate (P2 security)', () => {
  beforeEach(() => {
    mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue(basePost())
    mocks.prisma.groupDiscussionReply.findUnique.mockResolvedValue({
      id: 200,
      postId: 10,
      userId: 42, // caller authored the reply
      content: 'old',
      isAnswer: false,
    })
    mocks.prisma.groupDiscussionReply.update.mockImplementation(async ({ data }) => ({
      id: 200,
      postId: 10,
      userId: 42,
      content: data.content ?? 'old',
      isAnswer: data.isAnswer ?? false,
      author: { id: 42, username: 'caller', avatarUrl: null },
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    mocks.prisma.groupDiscussionReply.delete.mockResolvedValue({ id: 200 })
  })

  it('banned member gets 403 on PATCH reply (cannot rewrite their old reply)', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'banned',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).patch('/groups/1/discussions/10/replies/200').send({
      content: 'rewritten by banned user',
    })
    expect(res.status).toBe(403)
    expect(mocks.prisma.groupDiscussionReply.update).not.toHaveBeenCalled()
  })

  it('banned member gets 403 on DELETE reply', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'banned',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).delete('/groups/1/discussions/10/replies/200')
    expect(res.status).toBe(403)
    expect(mocks.prisma.groupDiscussionReply.delete).not.toHaveBeenCalled()
  })

  it('active member can still edit their own reply', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).patch('/groups/1/discussions/10/replies/200').send({
      content: 'edited reply',
    })
    expect(res.status).toBe(200)
    expect(res.body.content).toBe('edited reply')
  })

  it('active member can still delete their own reply', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).delete('/groups/1/discussions/10/replies/200')
    expect(res.status).toBe(204)
    expect(mocks.prisma.groupDiscussionReply.delete).toHaveBeenCalled()
  })
})

describe('Discussions: PATCH /:postId (edit window + permissions)', () => {
  beforeEach(() => {
    mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue(basePost({ userId: 42 }))
    mocks.prisma.groupDiscussionPost.update.mockImplementation(async ({ data }) => ({
      ...basePost(),
      ...data,
      author: { id: 42, username: 'caller', avatarUrl: null },
      upvotes: [],
      _count: { replies: 0 },
    }))
  })

  it('refuses edit when caller has been banned (active-member gate)', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'banned',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).patch('/groups/1/discussions/10').send({ content: 'edit' })
    expect(res.status).toBe(403)
  })

  it('refuses edit when caller is not author and not admin', async () => {
    mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue(basePost({ userId: 999 }))
    const res = await request(app).patch('/groups/1/discussions/10').send({ content: 'edit' })
    expect(res.status).toBe(403)
  })

  it('author can edit their own post body', async () => {
    const res = await request(app).patch('/groups/1/discussions/10').send({ content: 'edited' })
    expect(res.status).toBe(200)
    expect(res.body.content).toBe('edited')
  })

  it('mod can pin a post (pin-only update branch)', async () => {
    mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue(basePost({ userId: 999 }))
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'moderator',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).patch('/groups/1/discussions/10').send({ pinned: true })
    expect(res.status).toBe(200)
  })
})

describe('Discussions: DELETE /:postId (soft-delete on mod-removal)', () => {
  it('author self-delete is hard-delete', async () => {
    mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue(basePost({ userId: 42 }))
    mocks.prisma.groupDiscussionPost.delete.mockResolvedValue({ id: 10 })
    const res = await request(app).delete('/groups/1/discussions/10')
    expect(res.status).toBe(204)
    expect(mocks.prisma.groupDiscussionPost.delete).toHaveBeenCalled()
  })

  it('mod removing another user`s post soft-deletes + strikes', async () => {
    mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue(basePost({ userId: 999 }))
    // requireGroupMember is called 3 times: caller active-gate, isGroupAdminOrMod,
    // then again to fetch the author for the strike counter. The author lookup
    // is distinguishable by userId in the where clause, so use mockImplementation.
    mocks.prisma.studyGroupMember.findUnique.mockImplementation(({ where }) => {
      const userId = where?.groupId_userId?.userId
      if (userId === 42) {
        return Promise.resolve({ id: 9, role: 'admin', status: 'active', userId: 42, groupId: 1 })
      }
      if (userId === 999) {
        return Promise.resolve({
          id: 99,
          status: 'active',
          userId: 999,
          groupId: 1,
          strikeCount: 0,
        })
      }
      return Promise.resolve(null)
    })
    mocks.prisma.groupDiscussionPost.update.mockResolvedValue({ id: 10 })
    mocks.prisma.studyGroupMember.update.mockResolvedValue({ id: 99 })
    const res = await request(app).delete('/groups/1/discussions/10')
    expect(res.status).toBe(204)
    expect(mocks.prisma.groupDiscussionPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'removed' }),
      }),
    )
  })

  it('non-author non-mod is 403', async () => {
    mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue(basePost({ userId: 999 }))
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).delete('/groups/1/discussions/10')
    expect(res.status).toBe(403)
  })

  it('A12: rejects bad numeric postId', async () => {
    const res = await request(app).delete('/groups/1/discussions/abc')
    expect(res.status).toBe(400)
  })
})

describe('Discussions: reactions / upvote toggle', () => {
  it('upvote adds row when not already upvoted', async () => {
    mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue(basePost())
    mocks.prisma.discussionUpvote.findUnique.mockResolvedValue(null)
    mocks.prisma.discussionUpvote.create.mockResolvedValue({ id: 1 })
    mocks.prisma.discussionUpvote.count.mockResolvedValue(1)
    const res = await request(app).post('/groups/1/discussions/10/upvote')
    expect(res.status).toBe(200)
    expect(res.body.upvoted).toBe(true)
    expect(res.body.upvoteCount).toBe(1)
  })

  it('upvote toggles off when already upvoted', async () => {
    mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue(basePost())
    mocks.prisma.discussionUpvote.findUnique.mockResolvedValue({ id: 5 })
    mocks.prisma.discussionUpvote.delete.mockResolvedValue({ id: 5 })
    mocks.prisma.discussionUpvote.count.mockResolvedValue(0)
    const res = await request(app).post('/groups/1/discussions/10/upvote')
    expect(res.status).toBe(200)
    expect(res.body.upvoted).toBe(false)
  })
})
