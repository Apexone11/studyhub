/**
 * notes.crud.deep.test.js — Loop T3 (2026-05-12)
 *
 * Deep-coverage route tests for the core notes CRUD surface:
 *   POST   /             — create (private=true default, title/content caps)
 *   GET    /:id          — visibility (owner/public/private), A12
 *   PATCH  /:id          — owner-only edit
 *   DELETE /:id          — owner-only
 *   PATCH  /:id/pin      — pinned toggle (owner-only)
 *   PATCH  /:id/tags     — tags array sanitization
 *   PATCH  /:id/metadata — privacy / courseId / allowDownloads
 *
 * Defense-in-depth focus:
 *   - A12 (Number.parseInt + Number.isInteger) on every :id segment.
 *   - First-create event (Loop A2) emits trackServerEvent on count === 1.
 *   - Plagiarism SimHash side-effect (updateFingerprint) is wired.
 *   - Tag sanitization keeps the 10-tag cap from the controller.
 */

import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const notesRoutePath = require.resolve('../src/modules/notes')

const mocks = vi.hoisted(() => {
  const prisma = {
    note: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    noteStar: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    noteReaction: { count: vi.fn(), findUnique: vi.fn() },
    noteVersion: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    noteComment: { findUnique: vi.fn() },
    noteHighlight: { findMany: vi.fn().mockResolvedValue([]) },
    enrollment: { findFirst: vi.fn() },
  }
  prisma.$transaction = vi.fn(async (fn) =>
    typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
  )
  return {
    prisma,
    sentry: { captureError: vi.fn() },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(({ res, user, ownerId, message }) => {
        if (user?.role === 'admin' || Number(ownerId) === Number(user?.userId)) return true
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
    trustGate: { getInitialModerationStatus: vi.fn(() => 'clean') },
    plagiarism: { updateFingerprint: vi.fn().mockResolvedValue(undefined) },
    events: {
      EVENTS: { NOTE_FIRST_CREATED: 'note_first_created' },
      trackServerEvent: vi.fn(),
    },
    achievements: {
      EVENT_KINDS: { NOTE_CREATE: 'note.create' },
      emitAchievementEvent: vi.fn().mockResolvedValue(undefined),
    },
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
  return function fakeOriginAllowlist(_req, _res, next) {
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
  [require.resolve('../src/lib/trustGate'), mocks.trustGate],
  [require.resolve('../src/lib/plagiarismService'), mocks.plagiarism],
  [require.resolve('../src/lib/events'), mocks.events],
  [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
  [require.resolve('../src/lib/rateLimiters'), fakeLimiterBag],
])

// achievements barrel — try-catch'd inside controller so we just stub it
const achievementsBarrel = require.resolve('../src/modules/achievements')
mockTargets.set(achievementsBarrel, mocks.achievements)

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
  app.use(express.json({ limit: '20mb' }))
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[notesRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  // Reset .mockResolvedValueOnce queues that survive clearAllMocks
  mocks.prisma.note.findUnique.mockReset()
  mocks.prisma.note.findMany.mockReset()
  mocks.prisma.note.create.mockReset()
  mocks.prisma.note.update.mockReset()
  mocks.prisma.note.delete.mockReset()
  mocks.prisma.note.count.mockReset()
  mocks.prisma.note.count.mockResolvedValue(0)
  mocks.prisma.noteStar.findUnique.mockResolvedValue(null)
  mocks.prisma.noteStar.findMany.mockResolvedValue([])
  mocks.prisma.noteStar.count.mockResolvedValue(0)
  mocks.prisma.noteReaction.count.mockResolvedValue(0)
  mocks.prisma.noteReaction.findUnique.mockResolvedValue(null)
  mocks.prisma.noteVersion.findFirst.mockResolvedValue(null)
  mocks.prisma.noteVersion.findMany.mockResolvedValue([])
  mocks.prisma.enrollment.findFirst.mockReset()
  mocks.accessControl.assertOwnerOrAdmin.mockImplementation(
    ({ user, ownerId }) => user.role === 'admin' || Number(ownerId) === Number(user.userId),
  )
  authedUser = { userId: 42, username: 'tester', role: 'student' }
})

// ──────────────────────────────────────────────────────────────────────
// POST / — Create
// ──────────────────────────────────────────────────────────────────────

describe('POST / (create note)', () => {
  it('creates with private=true by default when private is not set', async () => {
    mocks.prisma.note.create.mockResolvedValue({
      id: 1,
      title: 'New',
      content: 'c',
      private: true,
      userId: 42,
      courseId: null,
      updatedAt: new Date(),
      course: null,
    })
    const res = await request(app).post('/').send({ title: 'New', content: 'c' })
    expect(res.status).toBe(201)
    const createCall = mocks.prisma.note.create.mock.calls[0][0]
    expect(createCall.data.private).toBe(true)
  })

  it('honors explicit private:false (note becomes public)', async () => {
    mocks.prisma.note.create.mockResolvedValue({
      id: 1,
      title: 'New',
      content: 'c',
      private: false,
      userId: 42,
      course: null,
    })
    await request(app).post('/').send({ title: 'New', content: 'c', private: false })
    const createCall = mocks.prisma.note.create.mock.calls[0][0]
    expect(createCall.data.private).toBe(false)
  })

  it('rejects empty title (whitespace-only)', async () => {
    const res = await request(app).post('/').send({ title: '   ', content: 'c' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Title is required/i)
  })

  it('rejects title > 120 chars', async () => {
    const res = await request(app)
      .post('/')
      .send({ title: 'a'.repeat(121), content: 'c' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/120/i)
  })

  it('rejects content > 50000 chars on the legacy create path', async () => {
    const res = await request(app)
      .post('/')
      .send({ title: 'OK', content: 'x'.repeat(50001) })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/50000/)
  })

  it('first-creation funnel: emits NOTE_FIRST_CREATED when count is 1', async () => {
    mocks.prisma.note.create.mockResolvedValue({
      id: 1,
      title: 'First',
      content: 'c',
      private: true,
      userId: 42,
      course: null,
    })
    mocks.prisma.note.count.mockResolvedValueOnce(1)
    const res = await request(app).post('/').send({ title: 'First', content: 'c' })
    expect(res.status).toBe(201)
    expect(res.body.firstCreation).toBe(true)
    expect(mocks.events.trackServerEvent).toHaveBeenCalledWith(
      42,
      'note_first_created',
      expect.objectContaining({ noteId: 1 }),
    )
  })

  it('first-creation funnel: does NOT emit on 2nd note', async () => {
    mocks.prisma.note.create.mockResolvedValue({
      id: 2,
      title: 'Second',
      content: 'c',
      private: true,
      userId: 42,
      course: null,
    })
    mocks.prisma.note.count.mockResolvedValueOnce(2)
    const res = await request(app).post('/').send({ title: 'Second', content: 'c' })
    expect(res.status).toBe(201)
    expect(res.body.firstCreation).toBe(false)
    expect(mocks.events.trackServerEvent).not.toHaveBeenCalled()
  })

  it('SimHash side-effect: updateFingerprint fires after create', async () => {
    mocks.prisma.note.create.mockResolvedValue({
      id: 5,
      title: 'F',
      content: 'finger me up',
      private: true,
      userId: 42,
      course: null,
    })
    await request(app).post('/').send({ title: 'F', content: 'finger me up' })
    expect(mocks.plagiarism.updateFingerprint).toHaveBeenCalledWith('note', 5, 'finger me up')
  })

  it('courseId is coerced to integer or null', async () => {
    mocks.prisma.note.create.mockResolvedValue({
      id: 6,
      title: 't',
      content: 'c',
      private: true,
      userId: 42,
      courseId: 7,
      course: null,
    })
    await request(app).post('/').send({ title: 't', content: 'c', courseId: '7' })
    const createCall = mocks.prisma.note.create.mock.calls[0][0]
    expect(createCall.data.courseId).toBe(7)
  })

  it('invalid courseId string returns 400 (A12 — wave-12.19)', async () => {
    // Pre-12.19 behaviour was silent nullification (Prisma would write
    // null and the note would persist). The audit's A12 enforcement now
    // rejects non-integer courseId at the handler boundary so callers
    // get a clear envelope instead of guessing why the course link
    // disappeared.
    const res = await request(app).post('/').send({ title: 't', content: 'c', courseId: 'lol' })
    expect(res.status).toBe(400)
    expect(mocks.prisma.note.create).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    authedUser = null
    const res = await request(app).post('/').send({ title: 'x', content: 'y' })
    expect(res.status).toBe(401)
  })
})

// ──────────────────────────────────────────────────────────────────────
// GET /:id — Read by id
// ──────────────────────────────────────────────────────────────────────

describe('GET /:id', () => {
  it('owner sees their private note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 1,
      title: 'p',
      content: 'c',
      private: true,
      userId: 42,
      course: null,
      author: { id: 42, username: 'tester' },
    })
    const res = await request(app).get('/1')
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('p')
    expect(res.body.isOwner).toBe(true)
  })

  it('non-owner sees public note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 1,
      title: 'public',
      content: 'c',
      private: false,
      userId: 99,
      course: null,
      author: { id: 99, username: 'other' },
    })
    const res = await request(app).get('/1')
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('public')
    expect(res.body.isOwner).toBe(false)
  })

  it('non-owner gets 404 on private note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 1,
      title: 'secret',
      content: 'c',
      private: true,
      userId: 99,
      course: null,
      author: { id: 99, username: 'other' },
    })
    const res = await request(app).get('/1')
    expect(res.status).toBe(404)
  })

  it('returns 404 when note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/9999')
    expect(res.status).toBe(404)
  })

  it('A12: rejects non-integer id', async () => {
    const res = await request(app).get('/abc')
    expect(res.status).toBe(400)
    expect(mocks.prisma.note.findUnique).not.toHaveBeenCalled()
  })

  it('A12: rejects zero / negative id', async () => {
    const r1 = await request(app).get('/0')
    expect(r1.status).toBe(400)
    const r2 = await request(app).get('/-5')
    expect(r2.status).toBe(400)
  })

  it('returns 401 when unauthenticated GET (optionalAuth → 401 in controller)', async () => {
    authedUser = null
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 1,
      title: 'p',
      private: false,
      userId: 99,
      course: null,
      author: null,
    })
    const res = await request(app).get('/1')
    expect(res.status).toBe(401)
  })
})

// ──────────────────────────────────────────────────────────────────────
// PATCH /:id — Owner-only edit
// ──────────────────────────────────────────────────────────────────────

describe('PATCH /:id', () => {
  it('owner can edit their note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 1,
      userId: 42,
      title: 'old',
      content: 'old',
      revision: 0,
      contentHash: null,
    })
    mocks.prisma.note.update.mockResolvedValue({
      id: 1,
      title: 'new',
      content: 'updated',
      userId: 42,
      revision: 1,
      updatedAt: new Date(),
      course: null,
    })
    const res = await request(app).patch('/1').send({ title: 'new', content: 'updated' })
    expect(res.status).toBe(200)
    expect(res.body.note.title).toBe('new')
  })

  it('non-owner gets 403', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({
      id: 1,
      userId: 99,
      title: 'x',
      content: 'x',
      revision: 0,
    })
    // updateNote was tightened to assertOwner (no admin bypass) 2026-05-14.
    mocks.accessControl.assertOwner.mockImplementationOnce(({ res }) => {
      res.status(403).json({ error: 'Not your note.', code: 'FORBIDDEN' })
      return false
    })
    const res = await request(app).patch('/1').send({ title: 'stolen' })
    expect(res.status).toBe(403)
  })

  it('A12: rejects non-integer id', async () => {
    const res = await request(app).patch('/abc').send({ title: 'x' })
    expect(res.status).toBe(400)
  })

  it('rejects oversized content (> MAX_NOTE_CONTENT_HARDENED 200000)', async () => {
    const res = await request(app)
      .patch('/1')
      .send({ content: 'x'.repeat(200001) })
    expect(res.status).toBe(413)
  })

  it('returns 404 when note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).patch('/9999').send({ title: 'x' })
    expect(res.status).toBe(404)
  })
})

// ──────────────────────────────────────────────────────────────────────
// DELETE /:id
// ──────────────────────────────────────────────────────────────────────

describe('DELETE /:id', () => {
  it('owner can delete', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42 })
    mocks.prisma.note.delete.mockResolvedValue({})
    const res = await request(app).delete('/1')
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/deleted/i)
  })

  it('non-owner gets 403', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 99 })
    // deleteNote was tightened to assertOwner (no admin bypass) 2026-05-14.
    mocks.accessControl.assertOwner.mockImplementationOnce(({ res }) => {
      res.status(403).json({ error: 'Not your note.', code: 'FORBIDDEN' })
      return false
    })
    const res = await request(app).delete('/1')
    expect(res.status).toBe(403)
  })

  it('A12: rejects non-integer id', async () => {
    const res = await request(app).delete('/abc')
    expect(res.status).toBe(400)
  })

  it('returns 404 when note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).delete('/9999')
    expect(res.status).toBe(404)
  })
})

// ──────────────────────────────────────────────────────────────────────
// PATCH /:id/tags
// ──────────────────────────────────────────────────────────────────────

describe('PATCH /:id/tags', () => {
  it('owner can set tags (max 10, deduplicated, trimmed, lowercased)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42 })
    mocks.prisma.note.update.mockResolvedValue({
      id: 1,
      tags: JSON.stringify(['math', 'cs']),
    })
    const res = await request(app)
      .patch('/1/tags')
      .send({ tags: ['Math', 'math', '  CS  '] })
    expect(res.status).toBe(200)
    expect(res.body.tags).toEqual(['math', 'cs'])
  })

  it('non-array tags becomes empty array', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42 })
    mocks.prisma.note.update.mockResolvedValue({ id: 1, tags: JSON.stringify([]) })
    const res = await request(app).patch('/1/tags').send({ tags: 'not-an-array' })
    expect(res.status).toBe(200)
    expect(res.body.tags).toEqual([])
  })

  it('caps at 10 tags', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42 })
    const overflow = Array.from({ length: 25 }, (_, i) => `tag${i}`)
    mocks.prisma.note.update.mockImplementation(({ data }) => ({
      id: 1,
      tags: data.tags,
    }))
    const res = await request(app).patch('/1/tags').send({ tags: overflow })
    expect(res.status).toBe(200)
    expect(res.body.tags).toHaveLength(10)
  })

  it('A12: rejects non-integer id', async () => {
    const res = await request(app)
      .patch('/abc/tags')
      .send({ tags: ['x'] })
    expect(res.status).toBe(400)
  })

  it('returns 404 on unknown note', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce(null)
    const res = await request(app)
      .patch('/9999/tags')
      .send({ tags: ['x'] })
    expect(res.status).toBe(404)
  })
})

// ──────────────────────────────────────────────────────────────────────
// PATCH /:id/pin
// ──────────────────────────────────────────────────────────────────────

describe('PATCH /:id/pin', () => {
  it('toggles pinned when no explicit value', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42, pinned: false })
    mocks.prisma.note.update.mockResolvedValue({ id: 1, pinned: true })
    const res = await request(app).patch('/1/pin').send({})
    expect(res.status).toBe(200)
    expect(res.body.pinned).toBe(true)
  })

  it('respects explicit pinned:false', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42, pinned: true })
    mocks.prisma.note.update.mockResolvedValue({ id: 1, pinned: false })
    const res = await request(app).patch('/1/pin').send({ pinned: false })
    expect(res.status).toBe(200)
    expect(res.body.pinned).toBe(false)
  })

  it('non-owner gets 403', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 99, pinned: false })
    // toggleNotePin was tightened to assertOwner (no admin bypass)
    // 2026-05-14 per founder directive. Override the right helper.
    mocks.accessControl.assertOwner.mockImplementationOnce(({ res }) => {
      res.status(403).json({ error: 'Not your note.', code: 'FORBIDDEN' })
      return false
    })
    const res = await request(app).patch('/1/pin').send({ pinned: true })
    expect(res.status).toBe(403)
  })

  it('A12: rejects non-integer id', async () => {
    const res = await request(app).patch('/abc/pin').send({})
    expect(res.status).toBe(400)
  })
})

// ──────────────────────────────────────────────────────────────────────
// PATCH /:id/metadata (courseId enrollment guard)
// ──────────────────────────────────────────────────────────────────────

describe('PATCH /:id/metadata', () => {
  it('owner can set private:true (also forces allowDownloads:false)', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42 })
    mocks.prisma.note.update.mockResolvedValue({
      id: 1,
      private: true,
      allowDownloads: false,
      userId: 42,
      course: null,
    })
    const res = await request(app).patch('/1/metadata').send({ private: true })
    expect(res.status).toBe(200)
    const call = mocks.prisma.note.update.mock.calls[0][0]
    expect(call.data.private).toBe(true)
    expect(call.data.allowDownloads).toBe(false)
  })

  it('rejects non-boolean private', async () => {
    const res = await request(app).patch('/1/metadata').send({ private: 'yes' })
    expect(res.status).toBe(400)
  })

  it('rejects non-boolean allowDownloads', async () => {
    const res = await request(app).patch('/1/metadata').send({ allowDownloads: 'sure' })
    expect(res.status).toBe(400)
  })

  it('rejects when no recognized fields supplied', async () => {
    const res = await request(app).patch('/1/metadata').send({})
    expect(res.status).toBe(400)
  })

  it('rejects negative courseId', async () => {
    const res = await request(app).patch('/1/metadata').send({ courseId: -5 })
    expect(res.status).toBe(400)
  })

  it('sets courseId to null when null is passed', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42 })
    mocks.prisma.note.update.mockResolvedValue({ id: 1, courseId: null, userId: 42, course: null })
    const res = await request(app).patch('/1/metadata').send({ courseId: null })
    expect(res.status).toBe(200)
  })

  it('enrollment guard: non-admin without enrollment gets 403', async () => {
    mocks.prisma.note.findUnique.mockResolvedValueOnce({ id: 1, userId: 42 })
    mocks.prisma.enrollment.findFirst.mockResolvedValueOnce(null)
    const res = await request(app).patch('/1/metadata').send({ courseId: 7 })
    expect(res.status).toBe(403)
  })
})
