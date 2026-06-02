/**
 * Deep test coverage — social endpoints on /api/sheets.
 *
 * Stars, comments (CRUD + edit window), reactions, and listing sort.
 * Verifies idempotency on toggle, atomic recount on star write, A13
 * type allowlist on reactions, edit window enforcement on comment patch.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/sheets/sheets.social.controller')

const mocks = vi.hoisted(() => {
  const state = { user: { userId: 1, username: 'tester', role: 'student' } }
  const prisma = {
    studySheet: { findUnique: vi.fn(), update: vi.fn() },
    starredSheet: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    comment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    reaction: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    commentReaction: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  }
  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      if (!state.user) return _res.status(401).json({ error: 'Login required.' })
      req.user = { ...state.user }
      next()
    }),
    verifiedEmail: vi.fn((_req, _res, next) => next()),
    sentry: { captureError: vi.fn() },
    sheetsService: {
      canReadSheet: vi.fn((sheet, user) => {
        if (sheet.status === 'published') return true
        return Boolean(user && (user.role === 'admin' || user.userId === sheet.userId))
      }),
    },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(({ res, user, ownerId }) => {
        if (user?.role === 'admin' || user?.userId === ownerId) return true
        res.status(403).json({ error: 'Not your comment.' })
        return false
      }),
      sendForbidden: (res, msg) => res.status(403).json({ error: msg }),
    },
    notify: { createNotification: vi.fn().mockResolvedValue(undefined) },
    mentions: { notifyMentionedUsers: vi.fn().mockResolvedValue(undefined) },
    sheetsConstants: {
      SHEET_STATUS: { PUBLISHED: 'published', DRAFT: 'draft' },
      AUTHOR_SELECT: { id: true, username: true, avatarUrl: true, isStaffVerified: true },
      reactLimiter: (_req, _res, next) => next(),
      commentLimiter: (_req, _res, next) => next(),
    },
    trustGate: { getInitialModerationStatus: vi.fn(() => 'clean') },
    activityTracker: { trackActivity: vi.fn() },
    timing: {
      timedSection: vi.fn(async (_label, fn) => ({ data: await fn() })),
      logTiming: vi.fn(),
    },
    rateLimiters: { commentReactLimiter: (_req, _res, next) => next() },
    gifAttachments: {
      normalizeCommentGifAttachments: vi.fn(() => ({ attachments: [], error: null })),
    },
    errorEnvelope: {
      sendError: (res, status, message, code) => res.status(status).json({ error: message, code }),
      ERROR_CODES: {
        BAD_REQUEST: 'BAD_REQUEST',
        VALIDATION: 'VALIDATION',
        FORBIDDEN: 'FORBIDDEN',
        NOT_FOUND: 'NOT_FOUND',
        INTERNAL: 'INTERNAL',
      },
    },
    achievements: {
      emitAchievementEvent: vi.fn(),
      EVENT_KINDS: { STAR_RECEIVED: 'star.received' },
    },
    validate: {
      parsePositiveInt: vi.fn((v, fb) => {
        const n = Number.parseInt(v, 10)
        return Number.isInteger(n) && n > 0 ? n : fb
      }),
      parseBoundedInt: vi.fn((v, fb, max) => {
        const n = Number.parseInt(v, 10)
        if (!Number.isInteger(n) || n <= 0) return Math.min(fb, max)
        return Math.min(n, max)
      }),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/core/db/prisma'), mocks.prisma],
  [require.resolve('../src/core/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/core/auth/requireAuth'), mocks.auth],
  [require.resolve('../src/core/auth/requireVerifiedEmail'), mocks.verifiedEmail],
  [require.resolve('../src/core/http/validate'), mocks.validate],
  [require.resolve('../src/modules/sheets/sheets.service'), mocks.sheetsService],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
  [require.resolve('../src/modules/sheets/sheets.constants'), mocks.sheetsConstants],
  [require.resolve('../src/lib/trustGate'), mocks.trustGate],
  [require.resolve('../src/lib/activityTracker'), mocks.activityTracker],
  [require.resolve('../src/lib/requestTiming'), mocks.timing],
  [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
  [require.resolve('../src/lib/commentGifAttachments'), mocks.gifAttachments],
  [require.resolve('../src/middleware/errorEnvelope'), mocks.errorEnvelope],
  [require.resolve('../src/modules/achievements'), mocks.achievements],
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
  delete require.cache[controllerPath]
  const routerModule = require(controllerPath)
  const router = routerModule.default || routerModule
  app = express()
  app.use(express.json())
  app.use('/api/sheets', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[controllerPath]
})

beforeEach(() => {
  // Reset queued mockResolvedValueOnce values across tests. Implementations
  // on the auth/middleware mocks are restored manually below to avoid the
  // resetAllMocks side-effect of clearing them.
  vi.clearAllMocks()
  mocks.prisma.studySheet.findUnique.mockReset()
  mocks.prisma.studySheet.update.mockReset()
  mocks.prisma.starredSheet.findUnique.mockReset()
  mocks.prisma.starredSheet.create.mockReset()
  mocks.prisma.starredSheet.delete.mockReset()
  mocks.prisma.starredSheet.count.mockReset()
  mocks.prisma.comment.findUnique.mockReset()
  mocks.prisma.comment.findMany.mockReset()
  mocks.prisma.comment.create.mockReset()
  mocks.prisma.comment.update.mockReset()
  mocks.prisma.comment.delete.mockReset()
  mocks.prisma.comment.count.mockReset()
  mocks.prisma.reaction.findUnique.mockReset()
  mocks.prisma.reaction.upsert.mockReset()
  mocks.prisma.reaction.delete.mockReset()
  mocks.prisma.reaction.count.mockReset()
  mocks.state.user = { userId: 1, username: 'tester', role: 'student' }
  // Restore implementations cleared by mockReset.
  mocks.sheetsService.canReadSheet.mockImplementation((sheet, user) => {
    if (sheet?.status === 'published') return true
    return Boolean(user && (user.role === 'admin' || user.userId === sheet?.userId))
  })
  mocks.gifAttachments.normalizeCommentGifAttachments.mockImplementation(() => ({
    attachments: [],
    error: null,
  }))
})

function pubSheet(overrides = {}) {
  return {
    id: 10,
    userId: 5,
    status: 'published',
    title: 'Sheet',
    ...overrides,
  }
}

// ── POST /:id/star ────────────────────────────────────────────────
describe('POST /api/sheets/:id/star', () => {
  it('first call creates star and atomically recounts', async () => {
    mocks.prisma.starredSheet.findUnique.mockResolvedValueOnce(null) // pre-check: not starred
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.starredSheet.create.mockResolvedValueOnce({})
    mocks.prisma.starredSheet.count.mockResolvedValueOnce(1)
    mocks.prisma.starredSheet.findUnique.mockResolvedValueOnce({}) // post-toggle check
    mocks.prisma.studySheet.update.mockResolvedValue({})

    const res = await request(app).post('/api/sheets/10/star').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ stars: 1, starred: true })
    // atomic recount: update writes the stars count from the source-of-truth count
    expect(mocks.prisma.studySheet.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { stars: 1 },
    })
  })

  it('second call (idempotent toggle) removes the star', async () => {
    mocks.prisma.starredSheet.findUnique.mockResolvedValueOnce({}) // pre: starred
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.starredSheet.delete.mockResolvedValueOnce({})
    mocks.prisma.starredSheet.count.mockResolvedValueOnce(0)
    mocks.prisma.starredSheet.findUnique.mockResolvedValueOnce(null) // post: gone
    mocks.prisma.studySheet.update.mockResolvedValue({})

    const res = await request(app).post('/api/sheets/10/star').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ stars: 0, starred: false })
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.state.user = null
    const res = await request(app).post('/api/sheets/10/star').send({})
    expect(res.status).toBe(401)
  })

  it('A12: 400 on non-integer sheet id', async () => {
    const res = await request(app).post('/api/sheets/abc/star').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid/i)
  })

  it('404 when sheet does not exist', async () => {
    mocks.prisma.starredSheet.findUnique.mockResolvedValueOnce(null)
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/api/sheets/99/star').send({})
    expect(res.status).toBe(404)
  })

  it('403 when trying to star a draft sheet the viewer CAN read (owner)', async () => {
    mocks.prisma.starredSheet.findUnique.mockResolvedValueOnce(null)
    // userId matches the testing user so canReadSheet passes — the 403 then
    // fires because the draft status disallows starring.
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      pubSheet({ status: 'draft', userId: 1 }),
    )
    const res = await request(app).post('/api/sheets/10/star').send({})
    expect(res.status).toBe(403)
  })
})

// ── POST /:id/comments ────────────────────────────────────────────
describe('POST /api/sheets/:id/comments', () => {
  it('creates a comment (201)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.comment.create.mockResolvedValueOnce({
      id: 1,
      content: 'great',
      author: { id: 1, username: 'tester' },
      attachments: [],
    })
    const res = await request(app).post('/api/sheets/10/comments').send({ content: 'great' })
    expect(res.status).toBe(201)
    expect(res.body.content).toBe('great')
  })

  it('400 on empty content + zero attachments', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    const res = await request(app).post('/api/sheets/10/comments').send({ content: '   ' })
    expect(res.status).toBe(400)
  })

  it('400 on >500 char comment', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    const res = await request(app)
      .post('/api/sheets/10/comments')
      .send({ content: 'x'.repeat(501) })
    expect(res.status).toBe(400)
  })

  it('400 on reply-to-reply (max 1 level deep)', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.comment.findUnique.mockResolvedValueOnce({
      id: 50,
      sheetId: 10,
      parentId: 49,
    })
    const res = await request(app).post('/api/sheets/10/comments').send({
      content: 'reply',
      parentId: 50,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/max 1 level/i)
  })

  it('404 when sheet not found', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/api/sheets/10/comments').send({ content: 'hey' })
    expect(res.status).toBe(404)
  })

  it('401 when unauthenticated', async () => {
    mocks.state.user = null
    const res = await request(app).post('/api/sheets/10/comments').send({ content: 'hey' })
    expect(res.status).toBe(401)
  })
})

// ── GET /:id/comments ─────────────────────────────────────────────
describe('GET /api/sheets/:id/comments', () => {
  it('returns paginated list with default sort newest', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.comment.findMany.mockResolvedValueOnce([
      {
        id: 1,
        content: 'hi',
        author: { id: 5, username: 'a' },
        reactions: [],
        attachments: [],
        replies: [],
        createdAt: new Date(),
      },
    ])
    mocks.prisma.comment.count.mockResolvedValueOnce(1)
    const res = await request(app).get('/api/sheets/10/comments')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.comments).toHaveLength(1)
  })

  it('sort=oldest flips orderBy to asc', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.comment.findMany.mockResolvedValueOnce([])
    mocks.prisma.comment.count.mockResolvedValueOnce(0)
    await request(app).get('/api/sheets/10/comments?sort=oldest')
    const args = mocks.prisma.comment.findMany.mock.calls[0][0]
    expect(args.orderBy).toEqual({ createdAt: 'asc' })
  })

  it('sort=top re-orders by net likes after fetch', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.comment.findMany.mockResolvedValueOnce([
      {
        id: 1,
        content: 'one',
        author: { id: 5, username: 'a' },
        reactions: [{ userId: 9, type: 'like' }],
        attachments: [],
        replies: [],
        createdAt: new Date(),
      },
      {
        id: 2,
        content: 'two',
        author: { id: 6, username: 'b' },
        reactions: [
          { userId: 9, type: 'like' },
          { userId: 10, type: 'like' },
        ],
        attachments: [],
        replies: [],
        createdAt: new Date(),
      },
    ])
    mocks.prisma.comment.count.mockResolvedValueOnce(2)
    const res = await request(app).get('/api/sheets/10/comments?sort=top')
    expect(res.status).toBe(200)
    // Higher net-likes (2 likes) wins.
    expect(res.body.comments[0].id).toBe(2)
  })

  it('A12: 400 on non-integer id', async () => {
    const res = await request(app).get('/api/sheets/abc/comments')
    expect(res.status).toBe(400)
  })

  it('404 when sheet not found', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/sheets/9999/comments')
    expect(res.status).toBe(404)
  })
})

// ── PATCH /:id/comments/:commentId ────────────────────────────────
describe('PATCH /api/sheets/:id/comments/:commentId', () => {
  it('author can edit within 15 minutes (200)', async () => {
    mocks.prisma.comment.findUnique.mockResolvedValueOnce({
      id: 7,
      userId: 1,
      sheetId: 10,
      createdAt: new Date(Date.now() - 60_000), // 1 min ago
    })
    mocks.prisma.comment.update.mockResolvedValueOnce({
      id: 7,
      content: 'edited',
      author: { id: 1, username: 'tester' },
    })
    const res = await request(app).patch('/api/sheets/10/comments/7').send({ content: 'edited' })
    expect(res.status).toBe(200)
  })

  it('403 outside the 15-minute edit window', async () => {
    mocks.prisma.comment.findUnique.mockResolvedValueOnce({
      id: 7,
      userId: 1,
      sheetId: 10,
      createdAt: new Date(Date.now() - 16 * 60_000),
    })
    const res = await request(app).patch('/api/sheets/10/comments/7').send({ content: 'too late' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/15 minutes/i)
  })

  it('403 when caller is not the author', async () => {
    mocks.prisma.comment.findUnique.mockResolvedValueOnce({
      id: 7,
      userId: 999,
      sheetId: 10,
      createdAt: new Date(),
    })
    const res = await request(app).patch('/api/sheets/10/comments/7').send({ content: 'spoof' })
    expect(res.status).toBe(403)
  })

  it('404 when commentId does not match sheetId', async () => {
    mocks.prisma.comment.findUnique.mockResolvedValueOnce({
      id: 7,
      userId: 1,
      sheetId: 99,
      createdAt: new Date(),
    })
    const res = await request(app).patch('/api/sheets/10/comments/7').send({ content: 'x' })
    expect(res.status).toBe(404)
  })

  it('400 when content is empty', async () => {
    const res = await request(app).patch('/api/sheets/10/comments/7').send({ content: '   ' })
    expect(res.status).toBe(400)
  })

  it('400 when content exceeds 500 chars', async () => {
    const res = await request(app)
      .patch('/api/sheets/10/comments/7')
      .send({ content: 'x'.repeat(501) })
    expect(res.status).toBe(400)
  })

  it('A12: 400 on non-integer commentId before findUnique', async () => {
    const res = await request(app).patch('/api/sheets/10/comments/abc').send({ content: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid id/i)
    expect(mocks.prisma.comment.findUnique).not.toHaveBeenCalled()
  })
})

// ── DELETE /:id/comments/:commentId ───────────────────────────────
describe('DELETE /api/sheets/:id/comments/:commentId', () => {
  it('author can delete own comment', async () => {
    mocks.prisma.comment.findUnique.mockResolvedValueOnce({ id: 7, userId: 1, sheetId: 10 })
    mocks.prisma.comment.delete.mockResolvedValueOnce({})
    const res = await request(app).delete('/api/sheets/10/comments/7')
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/deleted/i)
  })

  it('non-author non-admin → 403', async () => {
    mocks.prisma.comment.findUnique.mockResolvedValueOnce({ id: 7, userId: 999, sheetId: 10 })
    const res = await request(app).delete('/api/sheets/10/comments/7')
    expect(res.status).toBe(403)
    expect(mocks.prisma.comment.delete).not.toHaveBeenCalled()
  })

  it("admin can delete anyone's comment", async () => {
    mocks.state.user = { userId: 999, username: 'admin', role: 'admin' }
    mocks.prisma.comment.findUnique.mockResolvedValueOnce({ id: 7, userId: 1, sheetId: 10 })
    mocks.prisma.comment.delete.mockResolvedValueOnce({})
    const res = await request(app).delete('/api/sheets/10/comments/7')
    expect(res.status).toBe(200)
  })

  it('404 when comment not found', async () => {
    mocks.prisma.comment.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).delete('/api/sheets/10/comments/9999')
    expect(res.status).toBe(404)
  })

  it('A12: 400 on non-integer commentId before findUnique', async () => {
    const res = await request(app).delete('/api/sheets/10/comments/abc')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid comment id/i)
    expect(mocks.prisma.comment.findUnique).not.toHaveBeenCalled()
  })
})

// ── POST /:id/comments/:commentId/react ───────────────────────────
describe('POST /api/sheets/:id/comments/:commentId/react', () => {
  it('A12: 400 on non-integer commentId before findUnique', async () => {
    const res = await request(app).post('/api/sheets/10/comments/abc/react').send({ type: 'like' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid comment id/i)
    expect(mocks.prisma.comment.findUnique).not.toHaveBeenCalled()
  })

  it('A12: 400 on commentId < 1', async () => {
    const res = await request(app).post('/api/sheets/10/comments/0/react').send({ type: 'like' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid comment id/i)
  })
})

// ── POST /:id/react ───────────────────────────────────────────────
describe('POST /api/sheets/:id/react', () => {
  it('400 for invalid type (A13 allowlist)', async () => {
    const res = await request(app).post('/api/sheets/10/react').send({ type: 'shrug' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/like.*dislike/i)
  })

  it('400 for type=heart (not in allowlist)', async () => {
    const res = await request(app).post('/api/sheets/10/react').send({ type: 'heart' })
    expect(res.status).toBe(400)
  })

  it('accepts type=null to clear reaction', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.reaction.findUnique
      .mockResolvedValueOnce({ type: 'like' }) // existing
      .mockResolvedValueOnce(null) // after delete
    mocks.prisma.reaction.delete.mockResolvedValueOnce({})
    mocks.prisma.reaction.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0)
    const res = await request(app).post('/api/sheets/10/react').send({ type: null })
    expect(res.status).toBe(200)
    expect(res.body.userReaction).toBeNull()
  })

  it('accepts type=like and upserts', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(pubSheet())
    mocks.prisma.reaction.findUnique
      .mockResolvedValueOnce(null) // no existing
      .mockResolvedValueOnce({ type: 'like' }) // after upsert
    mocks.prisma.reaction.upsert.mockResolvedValueOnce({})
    mocks.prisma.reaction.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0)
    const res = await request(app).post('/api/sheets/10/react').send({ type: 'like' })
    expect(res.status).toBe(200)
    expect(res.body.likes).toBe(1)
    expect(res.body.dislikes).toBe(0)
    expect(res.body.userReaction).toBe('like')
  })

  it('404 when sheet missing', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/api/sheets/10/react').send({ type: 'like' })
    expect(res.status).toBe(404)
  })

  it('403 reacting to a draft sheet', async () => {
    mocks.prisma.studySheet.findUnique.mockResolvedValueOnce(
      pubSheet({ status: 'draft', userId: 1 }),
    )
    const res = await request(app).post('/api/sheets/10/react').send({ type: 'like' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/published/i)
  })

  it('A12: 400 on non-integer id', async () => {
    const res = await request(app).post('/api/sheets/abc/react').send({ type: 'like' })
    expect(res.status).toBe(400)
  })
})
