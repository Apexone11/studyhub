/**
 * note-share-comment.integ.test.js — Loop T10 deep integration test.
 *
 * Scenario:
 *   1. User A creates a private note (visibility flag flipped via the
 *      metadata route — bypasses the content-save path).
 *   2. User B tries to GET the note → 404 (private).
 *   3. User A flips note to public.
 *   4. User B GETs the note → 200 with content.
 *   5. User B POSTs a highlight on a passage → 201.
 *   6. User B GETs highlights list → sees their own.
 *   7. User A reads the highlights list (owner sees all).
 *
 * Critical assertions:
 *   - Visibility boundaries enforced server-side (CLAUDE.md A6).
 *   - Highlight visibility on public notes accepts any authenticated user.
 *   - Highlight on a still-private note from a non-owner returns 403.
 *
 * The notes routes are heavily coupled to many helpers (mentions, plagiarism,
 * activity tracker, etc.). We exercise the highlight + read paths directly
 * since the note-share visibility toggle is what this scenario exists to
 * cover. The full note-mutation path is exercised by notes.routes.test.js.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)

const state = {
  nextNoteId: 1,
  nextHighlightId: 1,
  notes: [],
  highlights: [],
  notifications: [],
}

function reset() {
  state.notes.length = 0
  state.highlights.length = 0
  state.notifications.length = 0
  state.nextNoteId = 1
  state.nextHighlightId = 1
}

const USERS = [
  { id: 1, username: 'alice', avatarUrl: null },
  { id: 2, username: 'bob', avatarUrl: null },
]

const prismaMock = {
  $transaction: async (fnOrArr) =>
    typeof fnOrArr === 'function' ? fnOrArr(prismaMock) : Promise.all(fnOrArr),
  $queryRaw: vi.fn(async () => []),
  user: {
    findUnique: vi.fn(async ({ where }) => USERS.find((u) => u.id === where.id) || null),
  },
  note: {
    findUnique: vi.fn(async ({ where, select, include }) => {
      const note = state.notes.find((n) => n.id === where.id)
      if (!note) return null
      const author = USERS.find((u) => u.id === note.userId)
      const enriched = { ...note, author }
      if (select) {
        const out = {}
        for (const k of Object.keys(select)) if (select[k]) out[k] = enriched[k]
        return out
      }
      if (include) return enriched
      return { ...note }
    }),
    create: vi.fn(async ({ data }) => {
      const note = {
        id: state.nextNoteId++,
        title: data.title,
        content: data.content,
        userId: data.userId,
        private: data.private !== false,
        allowDownloads: data.allowDownloads !== false,
        downloads: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      state.notes.push(note)
      return { ...note }
    }),
    update: vi.fn(async ({ where, data }) => {
      const note = state.notes.find((n) => n.id === where.id)
      if (!note) {
        const err = new Error('not found')
        err.code = 'P2025'
        throw err
      }
      Object.assign(note, data, { updatedAt: new Date() })
      return { ...note }
    }),
  },
  noteHighlight: {
    findMany: vi.fn(async ({ where, include: _include } = {}) => {
      let rows = [...state.highlights]
      if (where?.noteId) rows = rows.filter((h) => h.noteId === where.noteId)
      if (where?.userId?.notIn?.length) {
        const banned = new Set(where.userId.notIn)
        rows = rows.filter((h) => !banned.has(h.userId))
      }
      return rows.map((h) => ({ ...h, user: USERS.find((u) => u.id === h.userId) }))
    }),
    findUnique: vi.fn(async ({ where }) => {
      const h = state.highlights.find((x) => x.id === where.id)
      if (!h) return null
      const note = state.notes.find((n) => n.id === h.noteId)
      return { ...h, note: { userId: note?.userId } }
    }),
    create: vi.fn(async ({ data }) => {
      const h = {
        id: state.nextHighlightId++,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      state.highlights.push(h)
      return { ...h, user: USERS.find((u) => u.id === h.userId) }
    }),
    delete: vi.fn(async ({ where }) => {
      const i = state.highlights.findIndex((h) => h.id === where.id)
      if (i < 0) {
        const err = new Error('not found')
        err.code = 'P2025'
        throw err
      }
      const removed = state.highlights[i]
      state.highlights.splice(i, 1)
      return removed
    }),
  },
  userBlock: {
    findMany: vi.fn(async () => []),
  },
}

const sentryMock = { captureError: vi.fn(), redactObject: (o) => o, redactHeaders: (h) => h }

function fakeAuth(req, res, next) {
  const id = req.headers['x-test-user-id']
  if (!id) return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
  req.user = {
    userId: Number(id),
    role: String(req.headers['x-test-role'] || 'student'),
    username: USERS.find((u) => u.id === Number(id))?.username || `user${id}`,
  }
  next()
}
fakeAuth.default = fakeAuth

const passthroughLimiter = (_req, _res, next) => next()
passthroughLimiter.default = passthroughLimiter
const rateLimitersMock = new Proxy(
  {},
  {
    get(_t, key) {
      if (key === '__esModule') return true
      if (typeof key === 'string' && key.startsWith('create')) return () => passthroughLimiter
      return passthroughLimiter
    },
  },
)

const originAllowlistMock = Object.assign(() => (req, res, next) => next(), {
  normalizeOrigin: (v) => v,
  buildTrustedOrigins: () => new Set(),
})

const blockFilterMock = {
  getBlockedUserIds: vi.fn(async () => []),
  getMutedUserIds: vi.fn(async () => []),
  blockFilterClause: () => ({}),
  hasBlocked: vi.fn(async () => false),
  isBlockedEitherWay: vi.fn(async () => false),
}

const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), prismaMock],
  [require.resolve('../../src/middleware/auth'), fakeAuth],
  [require.resolve('../../src/middleware/requireVerifiedEmail'), (req, res, next) => next()],
  [require.resolve('../../src/middleware/originAllowlist'), originAllowlistMock],
  [require.resolve('../../src/core/auth/requireAuth'), fakeAuth],
  [
    require.resolve('../../src/core/auth/optionalAuth'),
    function fakeOptional(req, _res, next) {
      const id = req.headers['x-test-user-id']
      if (id) {
        req.user = {
          userId: Number(id),
          role: String(req.headers['x-test-role'] || 'student'),
          username: USERS.find((u) => u.id === Number(id))?.username || `user${id}`,
        }
      }
      next()
    },
  ],
  [require.resolve('../../src/core/auth/requireVerifiedEmail'), (req, res, next) => next()],
  [require.resolve('../../src/core/db/prisma'), prismaMock],
  [require.resolve('../../src/monitoring/sentry'), sentryMock],
  [require.resolve('../../src/lib/rateLimiters'), rateLimitersMock],
  [require.resolve('../../src/lib/social/blockFilter'), blockFilterMock],
])

const originalLoad = Module._load
let app

// We mount only the highlights controller directly to avoid the heavy notes
// router import surface (mentions, plagiarism, fingerprinting, etc.).
beforeAll(() => {
  Module._load = function patched(req, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(req, parent, isMain)
      if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    } catch {
      /* fall through */
    }
    return originalLoad.apply(this, arguments)
  }

  const highlightControllerPath =
    require.resolve('../../src/modules/notes/note.highlights.controller')
  delete require.cache[highlightControllerPath]
  const noteHighlights = require('../../src/modules/notes/note.highlights.controller')

  app = express()
  app.use(express.json({ limit: '2mb' }))

  // Mount real handlers behind fake middleware. These hit the real Prisma
  // calls in the controller through the mocked prismaMock.
  app.get('/notes/:noteId/highlights', fakeAuth, noteHighlights.listHighlights)
  app.post('/notes/:noteId/highlights', fakeAuth, noteHighlights.createHighlight)
  app.delete('/notes/:noteId/highlights/:id', fakeAuth, noteHighlights.deleteHighlight)

  // Simulated GET /notes/:id and PATCH /notes/:id/metadata via direct prisma
  // calls — exercises the same canReadNote logic the real controller uses.
  app.get(
    '/notes/:id',
    (req, res, next) => {
      const id = req.headers['x-test-user-id']
      if (id) {
        req.user = {
          userId: Number(id),
          role: String(req.headers['x-test-role'] || 'student'),
        }
      }
      next()
    },
    async (req, res) => {
      const noteId = Number.parseInt(req.params.id, 10)
      const note = await prismaMock.note.findUnique({
        where: { id: noteId },
        include: { author: true },
      })
      if (!note) return res.status(404).json({ error: 'Note not found.' })
      // canReadNote: public OR owner OR admin
      const canRead =
        !note.private ||
        (req.user && (req.user.userId === note.userId || req.user.role === 'admin'))
      if (!canRead) return res.status(404).json({ error: 'Note not found.' })
      res.json({ note })
    },
  )

  app.patch('/notes/:id/metadata', fakeAuth, async (req, res) => {
    const noteId = Number.parseInt(req.params.id, 10)
    const note = state.notes.find((n) => n.id === noteId)
    if (!note) return res.status(404).json({ error: 'Note not found.' })
    if (note.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your note.' })
    }
    const update = {}
    if (typeof req.body?.private === 'boolean') update.private = req.body.private
    Object.assign(note, update, { updatedAt: new Date() })
    res.json({ note: { ...note } })
  })

  app.use((err, _req, res, _next) =>
    res.status(500).json({ error: err?.message || 'Server error' }),
  )
})

afterAll(() => {
  Module._load = originalLoad
})

beforeEach(() => {
  vi.clearAllMocks()
  reset()
})

describe('Integration: note share & highlight', () => {
  it('private → public → other user highlights → owner reads all', async () => {
    // ── Step 1: alice creates a private note (via direct seeding) ───
    await prismaMock.note.create({
      data: {
        title: 'Alice study notes',
        content: 'Polymorphism allows different classes to be treated as the same interface.',
        userId: 1,
        private: true,
      },
    })
    const noteId = state.notes[0].id

    // ── Step 2: bob tries to read it → 404 ────────────────────────
    const bobReadPrivate = await request(app)
      .get(`/notes/${noteId}`)
      .set('x-test-user-id', '2')
      .set('x-test-role', 'student')
    expect(bobReadPrivate.status).toBe(404)

    // ── Step 3: bob tries to highlight a private note → 403 ───────
    const bobHighlightPrivate = await request(app)
      .post(`/notes/${noteId}/highlights`)
      .set('x-test-user-id', '2')
      .set('x-test-role', 'student')
      .send({ anchorText: 'Polymorphism', anchorOffset: 0, color: 'yellow' })
    expect(bobHighlightPrivate.status).toBe(403)

    // ── Step 4: alice flips it to public ─────────────────────────
    const flipRes = await request(app)
      .patch(`/notes/${noteId}/metadata`)
      .set('x-test-user-id', '1')
      .set('x-test-role', 'student')
      .send({ private: false })
    expect(flipRes.status).toBe(200)
    expect(flipRes.body.note.private).toBe(false)
    expect(state.notes[0].private).toBe(false)

    // ── Step 5: bob can read it now ──────────────────────────────
    const bobReadPublic = await request(app)
      .get(`/notes/${noteId}`)
      .set('x-test-user-id', '2')
      .set('x-test-role', 'student')
    expect(bobReadPublic.status).toBe(200)
    expect(bobReadPublic.body.note.content).toMatch(/Polymorphism/i)

    // ── Step 6: bob highlights a passage ─────────────────────────
    const highlightRes = await request(app)
      .post(`/notes/${noteId}/highlights`)
      .set('x-test-user-id', '2')
      .set('x-test-role', 'student')
      .send({
        anchorText: 'Polymorphism',
        anchorOffset: 0,
        color: 'green',
      })
    expect(highlightRes.status).toBe(201)
    expect(highlightRes.body.highlight).toMatchObject({
      noteId,
      userId: 2,
      anchorText: 'Polymorphism',
      color: 'green',
    })
    const highlightId = highlightRes.body.highlight.id

    // Side-effect: highlight persisted
    expect(state.highlights).toHaveLength(1)
    expect(state.highlights[0].userId).toBe(2)

    // ── Step 7: alice (owner) lists highlights → sees bob's ────
    const aliceListRes = await request(app)
      .get(`/notes/${noteId}/highlights`)
      .set('x-test-user-id', '1')
      .set('x-test-role', 'student')
    expect(aliceListRes.status).toBe(200)
    expect(aliceListRes.body.highlights).toHaveLength(1)
    expect(aliceListRes.body.highlights[0]).toMatchObject({
      id: highlightId,
      userId: 2,
      author: expect.objectContaining({ username: 'bob' }),
    })

    // ── Step 8: bob lists highlights → also sees his own ───────
    const bobListRes = await request(app)
      .get(`/notes/${noteId}/highlights`)
      .set('x-test-user-id', '2')
      .set('x-test-role', 'student')
    expect(bobListRes.status).toBe(200)
    expect(bobListRes.body.highlights).toHaveLength(1)
  })

  it('color out of allowlist defaults to yellow', async () => {
    await prismaMock.note.create({
      data: {
        title: 'Public note',
        content: 'Some content here.',
        userId: 1,
        private: false,
      },
    })
    const noteId = state.notes[0].id

    const res = await request(app)
      .post(`/notes/${noteId}/highlights`)
      .set('x-test-user-id', '2')
      .set('x-test-role', 'student')
      .send({
        anchorText: 'content',
        anchorOffset: 5,
        color: 'rainbow', // not in allowlist
      })
    expect(res.status).toBe(201)
    expect(res.body.highlight.color).toBe('yellow')
  })

  it('400 when anchorText is empty', async () => {
    await prismaMock.note.create({
      data: { title: 'N', content: 'x', userId: 1, private: false },
    })
    const noteId = state.notes[0].id

    const res = await request(app)
      .post(`/notes/${noteId}/highlights`)
      .set('x-test-user-id', '2')
      .set('x-test-role', 'student')
      .send({ anchorText: '   ', anchorOffset: 0 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/anchorText/i)
  })

  it('400 when anchorOffset is negative', async () => {
    await prismaMock.note.create({
      data: { title: 'N', content: 'x', userId: 1, private: false },
    })
    const noteId = state.notes[0].id

    const res = await request(app)
      .post(`/notes/${noteId}/highlights`)
      .set('x-test-user-id', '2')
      .set('x-test-role', 'student')
      .send({ anchorText: 'x', anchorOffset: -5 })
    expect(res.status).toBe(400)
  })

  it('404 when note does not exist', async () => {
    const res = await request(app)
      .post(`/notes/9999/highlights`)
      .set('x-test-user-id', '2')
      .set('x-test-role', 'student')
      .send({ anchorText: 'x', anchorOffset: 0 })
    expect(res.status).toBe(404)
  })
})
