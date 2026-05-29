/**
 * wave-12.19 regression — A12 integer guard on
 * `feed.social.controller.js` POST /posts/:id/comments/:commentId/react.
 *
 * Before wave-12.19:
 *   - The handler accepted the raw `commentId` string and called
 *     `Number.parseInt(req.params.commentId, 10)` without rejecting
 *     non-numeric or non-positive values, which would feed `NaN` /
 *     negatives straight into Prisma `where` clauses.
 * After wave-12.19:
 *   - The handler short-circuits with 400 + the canonical envelope
 *     `{ error: 'Invalid comment id.', code: 'BAD_REQUEST' }` when
 *     `Number.isInteger(commentId)` fails or `commentId < 1`, per
 *     CLAUDE.md A12.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const socialRoutePath = require.resolve('../../src/modules/feed/feed.social.controller')

const mocks = vi.hoisted(() => {
  const authState = {
    user: { userId: 1, username: 'beta_student1', role: 'user' },
  }

  const prisma = {
    feedPost: {
      findUnique: vi.fn(),
    },
    feedPostComment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    feedPostReaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    feedPostCommentReaction: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  }

  return {
    authState,
    prisma,
    requireAuth: vi.fn((req, res, next) => {
      if (!authState.user) {
        return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
      }
      req.user = authState.user
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    rateLimiters: {
      commentReactLimiter: (_req, _res, next) => next(),
      feedReactLimiter: (_req, _res, next) => next(),
      feedReadLimiter: (_req, _res, next) => next(),
      feedWriteLimiter: (_req, _res, next) => next(),
      feedCommentLimiter: (_req, _res, next) => next(),
      feedAttachmentDownloadLimiter: (_req, _res, next) => next(),
      feedAuthLimiter: (_req, _res, next) => next(),
      feedLeaderboardLimiter: (_req, _res, next) => next(),
    },
    notify: { createNotification: vi.fn(async () => null) },
    mentions: { notifyMentionedUsers: vi.fn(async () => null) },
    accessControl: { assertOwnerOrAdmin: vi.fn(() => true) },
    moderationEngine: {
      isModerationEnabled: vi.fn(() => false),
      scanContent: vi.fn(async () => null),
    },
    trustGate: { getInitialModerationStatus: vi.fn(() => 'approved') },
    abuseDetection: { runAbuseChecks: vi.fn(async () => null) },
    commentGifAttachments: {
      normalizeCommentGifAttachments: vi.fn(() => ({ attachments: [], error: null })),
    },
    feedService: {
      reactionSummary: vi.fn(() => ({ reactionCounts: { like: 0, dislike: 0 } })),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), mocks.prisma],
  [require.resolve('../../src/core/auth/requireAuth'), mocks.requireAuth],
  [require.resolve('../../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../../src/lib/notify'), mocks.notify],
  [require.resolve('../../src/lib/mentions'), mocks.mentions],
  [require.resolve('../../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../../src/lib/moderation/moderationEngine'), mocks.moderationEngine],
  [require.resolve('../../src/lib/trustGate'), mocks.trustGate],
  [require.resolve('../../src/lib/abuseDetection'), mocks.abuseDetection],
  [require.resolve('../../src/lib/commentGifAttachments'), mocks.commentGifAttachments],
  [require.resolve('../../src/modules/feed/feed.service'), mocks.feedService],
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

  delete require.cache[socialRoutePath]
  const socialRouterModule = require(socialRoutePath)
  const socialRouter = socialRouterModule.default || socialRouterModule

  app = express()
  app.use(express.json())
  // Real mount in feed.routes.js is `router.use(socialController)` at the
  // feed module root, which is mounted at /api/feed in index.js. The
  // social controller owns the full `/posts/:id/...` path internally.
  app.use('/api/feed', socialRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[socialRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.authState.user = { userId: 1, username: 'beta_student1', role: 'user' }

  // Default: happy-path comment lookup so the only 400s we observe come
  // from the integer-guard, not downstream 404s.
  mocks.prisma.feedPostComment.findUnique.mockResolvedValue({
    id: 123,
    postId: 1,
  })
  mocks.prisma.feedPostCommentReaction.findUnique.mockResolvedValue(null)
  mocks.prisma.feedPostCommentReaction.create.mockResolvedValue({
    id: 1,
    userId: 1,
    commentId: 123,
    type: 'like',
  })
  mocks.prisma.feedPostCommentReaction.count.mockResolvedValue(0)
})

describe('POST /api/feed/posts/:id/comments/:commentId/react — A12 integer guard', () => {
  it('returns 400 envelope for a non-numeric commentId ("abc")', async () => {
    const res = await request(app)
      .post('/api/feed/posts/1/comments/abc/react')
      .send({ type: 'like' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid comment id.', code: 'BAD_REQUEST' })
    // Must short-circuit BEFORE any prisma lookup.
    expect(mocks.prisma.feedPostComment.findUnique).not.toHaveBeenCalled()
  })

  it('returns 400 for a negative commentId ("-5")', async () => {
    const res = await request(app)
      .post('/api/feed/posts/1/comments/-5/react')
      .send({ type: 'like' })

    expect(res.status).toBe(400)
  })

  it('does NOT 400 for a valid integer commentId (passes through to handler)', async () => {
    const res = await request(app)
      .post('/api/feed/posts/1/comments/123/react')
      .send({ type: 'like' })

    expect(res.status).not.toBe(400)
  })
})
