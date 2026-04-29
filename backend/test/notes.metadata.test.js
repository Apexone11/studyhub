/**
 * notes.metadata.test.js — PATCH /api/notes/:id/metadata
 *
 * Covers the dedicated metadata endpoint that exists outside the hardened
 * content-save path. Behaviors under test:
 *   - field validation (private/allowDownloads/courseId types)
 *   - owner-only auth via assertOwnerOrAdmin (admin override)
 *   - private:true auto-clears allowDownloads (server-side normalization)
 *   - courseId enrollment 403 (a non-enrolled student can't file the
 *     note under that course)
 *   - admin bypass on the enrollment check
 *   - "no fields supplied" rejection
 *   - 404 on missing note, 400 on invalid id
 *
 * Mock pattern matches notes-enhancements.routes.test.js — Module._load
 * swap so the controller's prisma + accessControl + sentry imports can be
 * mocked without touching the database.
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
      update: vi.fn(),
    },
    enrollment: {
      findFirst: vi.fn(),
    },
  }

  let currentUser = { userId: 42, username: 'test_user', role: 'student' }

  return {
    prisma,
    setUser(next) {
      currentUser = next
    },
    auth: vi.fn((req, _res, next) => {
      req.user = currentUser
      next()
    }),
    optionalAuth: vi.fn((req, _res, next) => {
      req.user = currentUser
      next()
    }),
    verifiedEmail: vi.fn((_req, _res, next) => next()),
    sentry: { captureError: vi.fn() },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(({ res, user, ownerId, message }) => {
        if (user.role === 'admin' || Number(ownerId) === Number(user.userId)) return true
        res.status(403).json({ error: message || 'Forbidden.' })
        return false
      }),
    },
    moderation: {
      isModerationEnabled: vi.fn(() => false),
      scanContent: vi.fn(),
    },
    plagiarism: { updateFingerprint: vi.fn() },
    trustGate: { getInitialModerationStatus: vi.fn(() => 'clean') },
    notify: { createNotification: vi.fn() },
    mentions: { notifyMentionedUsers: vi.fn() },
    activityTracker: { trackActivity: vi.fn() },
    noteAnchor: {
      buildAnchorContext: vi.fn(() => null),
      validateAnchorInput: vi.fn(() => null),
    },
    timing: {
      timedSection: vi.fn(async (_name, fn) => ({ data: await fn(), durationMs: 0 })),
      logTiming: vi.fn(),
    },
    storage: {
      NOTE_IMAGES_DIR: '/tmp/test-note-images',
      safeUnlinkFile: vi.fn(),
      cleanupNoteImageIfUnused: vi.fn(async () => true),
      extractNoteImageUrlsFromTexts: vi.fn(() => []),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/core/auth/optionalAuth'), mocks.optionalAuth],
  [require.resolve('../src/middleware/requireVerifiedEmail'), mocks.verifiedEmail],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/accessControl'), mocks.accessControl],
  [require.resolve('../src/lib/moderation/moderationEngine'), mocks.moderation],
  [require.resolve('../src/lib/plagiarismService'), mocks.plagiarism],
  [require.resolve('../src/lib/trustGate'), mocks.trustGate],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/mentions'), mocks.mentions],
  [require.resolve('../src/lib/activityTracker'), mocks.activityTracker],
  [require.resolve('../src/lib/noteAnchor'), mocks.noteAnchor],
  [require.resolve('../src/lib/requestTiming'), mocks.timing],
  [require.resolve('../src/lib/storage'), mocks.storage],
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
  mocks.setUser({ userId: 42, username: 'test_user', role: 'student' })
})

/* ── Helpers ──────────────────────────────────────────────────────────── */

function ownedNote(extra = {}) {
  return {
    id: 1,
    userId: 42,
    title: 'Sample',
    content: '<p>Body</p>',
    private: false,
    allowDownloads: true,
    courseId: null,
    tags: '[]',
    pinned: false,
    starred: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: 42, username: 'test_user' },
    ...extra,
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * Validation
 * ═══════════════════════════════════════════════════════════════════════ */
describe('PATCH /:id/metadata — input validation', () => {
  it('returns 400 for a non-integer note id', async () => {
    const res = await request(app).patch('/abc/metadata').send({ private: true })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid note id/i)
  })

  it('returns 400 for a non-positive note id', async () => {
    const res = await request(app).patch('/0/metadata').send({ private: true })
    expect(res.status).toBe(400)
  })

  it('returns 400 when private is not a boolean', async () => {
    const res = await request(app).patch('/1/metadata').send({ private: 'yes' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/private/)
  })

  it('returns 400 when allowDownloads is not a boolean', async () => {
    const res = await request(app).patch('/1/metadata').send({ allowDownloads: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/allowDownloads/)
  })

  it('returns 400 when courseId is a non-integer non-null value', async () => {
    const res = await request(app).patch('/1/metadata').send({ courseId: 'CHEM101' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/courseId/)
  })

  it('returns 400 when courseId is negative', async () => {
    const res = await request(app).patch('/1/metadata').send({ courseId: -3 })
    expect(res.status).toBe(400)
  })

  it('returns 400 when no recognized fields are supplied', async () => {
    const res = await request(app).patch('/1/metadata').send({ unrelated: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/at least one/i)
  })
})

/* ═══════════════════════════════════════════════════════════════════════
 * Authorization
 * ═══════════════════════════════════════════════════════════════════════ */
describe('PATCH /:id/metadata — authorization', () => {
  it('returns 404 when the note does not exist', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue(null)
    const res = await request(app).patch('/999/metadata').send({ private: true })
    expect(res.status).toBe(404)
  })

  it('returns 403 when the caller is not the owner and not admin', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 999 })
    const res = await request(app).patch('/1/metadata').send({ private: true })
    expect(res.status).toBe(403)
    expect(mocks.prisma.note.update).not.toHaveBeenCalled()
  })

  it('admins can update someone else’s note metadata', async () => {
    mocks.setUser({ userId: 7, username: 'admin', role: 'admin' })
    mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 999 })
    mocks.prisma.note.update.mockResolvedValue(ownedNote({ private: true, allowDownloads: false }))
    const res = await request(app).patch('/1/metadata').send({ private: true })
    expect(res.status).toBe(200)
    expect(mocks.prisma.note.update).toHaveBeenCalled()
  })
})

/* ═══════════════════════════════════════════════════════════════════════
 * Persistence + normalization
 * ═══════════════════════════════════════════════════════════════════════ */
describe('PATCH /:id/metadata — persistence', () => {
  it('persists private=true and auto-clears allowDownloads server-side', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
    mocks.prisma.note.update.mockResolvedValue(ownedNote({ private: true, allowDownloads: false }))

    const res = await request(app)
      .patch('/1/metadata')
      .send({ private: true, allowDownloads: true })
    expect(res.status).toBe(200)

    // The controller MUST overwrite the user-supplied allowDownloads with
    // false when private=true, regardless of payload order.
    const updateArgs = mocks.prisma.note.update.mock.calls[0][0]
    expect(updateArgs.data.private).toBe(true)
    expect(updateArgs.data.allowDownloads).toBe(false)
    expect(res.body.note.private).toBe(true)
    expect(res.body.note.allowDownloads).toBe(false)
  })

  it('persists allowDownloads=false on its own without touching private', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
    mocks.prisma.note.update.mockResolvedValue(ownedNote({ allowDownloads: false }))

    const res = await request(app).patch('/1/metadata').send({ allowDownloads: false })
    expect(res.status).toBe(200)
    const updateArgs = mocks.prisma.note.update.mock.calls[0][0]
    expect(updateArgs.data).toEqual({ allowDownloads: false })
  })

  it('persists courseId=null when explicitly clearing the course', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
    mocks.prisma.note.update.mockResolvedValue(ownedNote({ courseId: null }))

    const res = await request(app).patch('/1/metadata').send({ courseId: null })
    expect(res.status).toBe(200)
    const updateArgs = mocks.prisma.note.update.mock.calls[0][0]
    expect(updateArgs.data).toEqual({ courseId: null })
    // Clearing a course must NOT trigger an enrollment lookup.
    expect(mocks.prisma.enrollment.findFirst).not.toHaveBeenCalled()
  })
})

/* ═══════════════════════════════════════════════════════════════════════
 * Course enrollment guard
 * ═══════════════════════════════════════════════════════════════════════ */
describe('PATCH /:id/metadata — courseId enrollment', () => {
  it('returns 403 when the user is not enrolled in the target course', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
    mocks.prisma.enrollment.findFirst.mockResolvedValue(null)

    const res = await request(app).patch('/1/metadata').send({ courseId: 555 })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/not enrolled/i)
    expect(mocks.prisma.note.update).not.toHaveBeenCalled()
  })

  it('persists the courseId when the user IS enrolled', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
    mocks.prisma.enrollment.findFirst.mockResolvedValue({ id: 100 })
    mocks.prisma.note.update.mockResolvedValue(ownedNote({ courseId: 555 }))

    const res = await request(app).patch('/1/metadata').send({ courseId: 555 })
    expect(res.status).toBe(200)
    expect(mocks.prisma.enrollment.findFirst).toHaveBeenCalledWith({
      where: { userId: 42, courseId: 555 },
      select: { id: true },
    })
    const updateArgs = mocks.prisma.note.update.mock.calls[0][0]
    expect(updateArgs.data.courseId).toBe(555)
  })

  it('admins bypass the enrollment check', async () => {
    mocks.setUser({ userId: 7, username: 'admin', role: 'admin' })
    mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 999 })
    mocks.prisma.enrollment.findFirst.mockResolvedValue(null)
    mocks.prisma.note.update.mockResolvedValue(ownedNote({ courseId: 555 }))

    const res = await request(app).patch('/1/metadata').send({ courseId: 555 })
    expect(res.status).toBe(200)
    expect(mocks.prisma.note.update).toHaveBeenCalled()
  })
})
