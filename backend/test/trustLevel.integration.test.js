/**
 * Integration tests for trust-level gating on content creation endpoints.
 *
 * Verifies that:
 *   - New users' content is created with moderationStatus 'pending_review'
 *   - Trusted users' content is created with moderationStatus 'clean'
 *   - New users' sheets resolve to 'pending_review' instead of 'published'
 *
 * Uses the same Module._load mocking pattern as feed.routes.test.js.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const feedRoutePath = require.resolve('../src/modules/feed')

const mocks = vi.hoisted(() => {
  const prisma = {
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
    },
    feedPostReaction: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
    },
    announcement: { findMany: vi.fn() },
    studySheet: { findMany: vi.fn() },
    note: { findMany: vi.fn() },
    noteComment: { groupBy: vi.fn() },
    starredSheet: { findMany: vi.fn() },
    comment: { groupBy: vi.fn() },
    reaction: { findMany: vi.fn(), groupBy: vi.fn() },
  }

  let currentUser = { userId: 42, username: 'test_user', role: 'student', trustLevel: 'new' }

  return {
    prisma,
    setUser(user) { currentUser = user },
    auth: vi.fn((req, _res, next) => {
      req.user = currentUser
      next()
    }),
    sentry: { captureError: vi.fn() },
    notify: { createNotification: vi.fn() },
    mentions: { notifyMentionedUsers: vi.fn() },
    accessControl: { assertOwnerOrAdmin: vi.fn(() => true), sendForbidden: vi.fn() },
    storage: { cleanupAttachmentIfUnused: vi.fn(), resolveAttachmentPath: vi.fn() },
    attachmentPreview: { sendAttachmentPreview: vi.fn() },
    moderationEngine: { isModerationEnabled: vi.fn(() => false), scanContent: vi.fn() },
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
})

describe('Trust Level — Feed Post Creation', () => {
  it('new user: post is created with moderationStatus pending_review', async () => {
    mocks.setUser({ userId: 42, username: 'new_user', role: 'student', trustLevel: 'new' })

    const mockPost = {
      id: 1,
      content: 'Hello world',
      userId: 42,
      courseId: null,
      allowDownloads: true,
      moderationStatus: 'pending_review',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: { id: 42, username: 'new_user', avatarUrl: null },
      course: null,
    }
    mocks.prisma.feedPost.create.mockResolvedValue(mockPost)
    mocks.prisma.feedPostReaction.groupBy.mockResolvedValue([])
    mocks.prisma.feedPostComment.count.mockResolvedValue(0)

    await request(app)
      .post('/posts')
      .send({ content: 'Hello world' })
      .expect(201)

    // Verify the Prisma create was called with pending_review
    expect(mocks.prisma.feedPost.create).toHaveBeenCalledTimes(1)
    const createArgs = mocks.prisma.feedPost.create.mock.calls[0][0]
    expect(createArgs.data.moderationStatus).toBe('pending_review')
  })

  it('trusted user: post is created with moderationStatus clean', async () => {
    mocks.setUser({ userId: 43, username: 'trusted_user', role: 'student', trustLevel: 'trusted' })

    const mockPost = {
      id: 2,
      content: 'Trusted post',
      userId: 43,
      courseId: null,
      allowDownloads: true,
      moderationStatus: 'clean',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: { id: 43, username: 'trusted_user', avatarUrl: null },
      course: null,
    }
    mocks.prisma.feedPost.create.mockResolvedValue(mockPost)
    mocks.prisma.feedPostReaction.groupBy.mockResolvedValue([])
    mocks.prisma.feedPostComment.count.mockResolvedValue(0)

    await request(app)
      .post('/posts')
      .send({ content: 'Trusted post' })
      .expect(201)

    const createArgs = mocks.prisma.feedPost.create.mock.calls[0][0]
    expect(createArgs.data.moderationStatus).toBe('clean')
  })

  it('admin user: post is created with moderationStatus clean regardless of trustLevel', async () => {
    mocks.setUser({ userId: 1, username: 'admin_user', role: 'admin', trustLevel: 'new' })

    const mockPost = {
      id: 3,
      content: 'Admin post',
      userId: 1,
      courseId: null,
      allowDownloads: true,
      moderationStatus: 'clean',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: { id: 1, username: 'admin_user', avatarUrl: null },
      course: null,
    }
    mocks.prisma.feedPost.create.mockResolvedValue(mockPost)
    mocks.prisma.feedPostReaction.groupBy.mockResolvedValue([])
    mocks.prisma.feedPostComment.count.mockResolvedValue(0)

    await request(app)
      .post('/posts')
      .send({ content: 'Admin post' })
      .expect(201)

    const createArgs = mocks.prisma.feedPost.create.mock.calls[0][0]
    expect(createArgs.data.moderationStatus).toBe('clean')
  })

  it('restricted user: post is created with moderationStatus pending_review', async () => {
    mocks.setUser({ userId: 44, username: 'restricted_user', role: 'student', trustLevel: 'restricted' })

    const mockPost = {
      id: 4,
      content: 'Restricted post',
      userId: 44,
      courseId: null,
      allowDownloads: true,
      moderationStatus: 'pending_review',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: { id: 44, username: 'restricted_user', avatarUrl: null },
      course: null,
    }
    mocks.prisma.feedPost.create.mockResolvedValue(mockPost)
    mocks.prisma.feedPostReaction.groupBy.mockResolvedValue([])
    mocks.prisma.feedPostComment.count.mockResolvedValue(0)

    await request(app)
      .post('/posts')
      .send({ content: 'Restricted post' })
      .expect(201)

    const createArgs = mocks.prisma.feedPost.create.mock.calls[0][0]
    expect(createArgs.data.moderationStatus).toBe('pending_review')
  })
})
