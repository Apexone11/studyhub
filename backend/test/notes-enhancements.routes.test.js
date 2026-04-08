import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const notesRoutePath = require.resolve('../src/modules/notes')

/* ═══════════════════════════════════════════════════════════════════════════
 * Mock setup — mirrors the Module._load patching pattern from existing tests
 * ═══════════════════════════════════════════════════════════════════════════ */
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
    noteVersion: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    noteStar: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    noteComment: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    optionalAuth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    verifiedEmail: vi.fn((_req, _res, next) => next()),
    sentry: { captureError: vi.fn() },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(({ res, user, ownerId }) => {
        if (user.userId !== ownerId && user.role !== 'admin') {
          res.status(403).json({ error: 'Not your note.' })
          return false
        }
        return true
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
  const notesRouterModule = require(notesRoutePath)
  const notesRouter = notesRouterModule.default || notesRouterModule

  app = express()
  app.use(express.json())
  app.use('/', notesRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[notesRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
})

/* ═══════════════════════════════════════════════════════════════════════════
 * VALIDATION — parseInt hardening
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('input validation', () => {
  it('PATCH /:id returns 400 for non-integer id', async () => {
    const res = await request(app).patch('/abc').send({ title: 'test' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid note id/i)
  })

  it('DELETE /:id returns 400 for non-integer id', async () => {
    const res = await request(app).delete('/abc')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid note id/i)
  })

  it('PATCH /:id returns 400 for negative id', async () => {
    const res = await request(app).patch('/-5').send({ title: 'test' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid note id/i)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * VERSION HISTORY
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('version history', () => {
  const sampleNote = { id: 1, userId: 42, title: 'Test', content: 'Hello world', private: true }

  describe('POST /:id/versions — save named version', () => {
    it('saves a version snapshot and returns 201', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue(sampleNote)
      mocks.prisma.noteVersion.create.mockResolvedValue({
        id: 10, noteId: 1, userId: 42, title: 'Test', content: 'Hello world', message: 'checkpoint', createdAt: new Date(),
      })

      const res = await request(app).post('/1/versions').send({ message: 'checkpoint' })

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ noteId: 1, message: 'checkpoint' })
      expect(mocks.prisma.noteVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ noteId: 1, userId: 42, title: 'Test', content: 'Hello world', message: 'checkpoint' }),
        })
      )
    })

    it('returns 404 for nonexistent note', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue(null)

      const res = await request(app).post('/999/versions').send({})
      expect(res.status).toBe(404)
    })

    it('returns 403 for non-owner', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ ...sampleNote, userId: 99 })

      const res = await request(app).post('/1/versions').send({})
      expect(res.status).toBe(403)
    })

    it('truncates message to 200 chars', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue(sampleNote)
      mocks.prisma.noteVersion.create.mockResolvedValue({
        id: 10, noteId: 1, userId: 42, title: 'Test', content: 'Hello world', message: 'x'.repeat(200), createdAt: new Date(),
      })

      const longMessage = 'a'.repeat(300)
      await request(app).post('/1/versions').send({ message: longMessage })

      expect(mocks.prisma.noteVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ message: 'a'.repeat(200) }),
        })
      )
    })
  })

  describe('GET /:id/versions — list versions', () => {
    it('returns a list of versions', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
      mocks.prisma.noteVersion.findMany.mockResolvedValue([
        { id: 10, title: 'v1', message: null, createdAt: new Date() },
        { id: 11, title: 'v2', message: 'update', createdAt: new Date() },
      ])

      const res = await request(app).get('/1/versions')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body).toHaveLength(2)
    })

    it('limits results to max 50', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
      mocks.prisma.noteVersion.findMany.mockResolvedValue([])

      await request(app).get('/1/versions?limit=100')

      expect(mocks.prisma.noteVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      )
    })
  })

  describe('GET /:id/versions/:versionId — get specific version', () => {
    it('returns the version with full content', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
      mocks.prisma.noteVersion.findUnique.mockResolvedValue({
        id: 10, noteId: 1, title: 'Old', content: 'Old content', createdAt: new Date(),
      })

      const res = await request(app).get('/1/versions/10')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ id: 10, content: 'Old content' })
    })

    it('returns 404 if version belongs to different note', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
      mocks.prisma.noteVersion.findUnique.mockResolvedValue({ id: 10, noteId: 99 })

      const res = await request(app).get('/1/versions/10')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /:id/versions/:versionId/restore', () => {
    it('auto-saves current state then restores the version', async () => {
      const currentNote = { id: 1, userId: 42, title: 'Current', content: 'Current content' }
      const oldVersion = { id: 10, noteId: 1, title: 'Old', content: 'Old content', createdAt: new Date('2026-01-01') }
      mocks.prisma.note.findUnique.mockResolvedValue(currentNote)
      mocks.prisma.noteVersion.findUnique.mockResolvedValue(oldVersion)
      mocks.prisma.noteVersion.create.mockResolvedValue({}) // auto-save
      mocks.prisma.note.update.mockResolvedValue({
        ...currentNote, title: 'Old', content: 'Old content',
        course: null, author: { id: 42, username: 'test_user' },
      })

      const res = await request(app).post('/1/versions/10/restore')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ title: 'Old', content: 'Old content' })
      // Auto-save should have been called with current content
      expect(mocks.prisma.noteVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'Current', content: 'Current content' }),
        })
      )
    })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * STAR / UNSTAR
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('note stars', () => {
  describe('POST /:id/star', () => {
    it('stars a note and returns { starred: true }', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, private: false, userId: 42 })
      mocks.prisma.noteStar.findUnique.mockResolvedValue(null)
      mocks.prisma.noteStar.create.mockResolvedValue({})

      const res = await request(app).post('/1/star')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ starred: true })
    })

    it('is idempotent if already starred', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, private: false, userId: 42 })
      mocks.prisma.noteStar.findUnique.mockResolvedValue({ userId: 42, noteId: 1 })

      const res = await request(app).post('/1/star')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ starred: true })
      expect(mocks.prisma.noteStar.create).not.toHaveBeenCalled()
    })

    it('returns 404 for private note not owned by user', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, private: true, userId: 99 })

      const res = await request(app).post('/1/star')
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /:id/star', () => {
    it('unstars a note and returns { starred: false }', async () => {
      mocks.prisma.noteStar.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app).delete('/1/star')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ starred: false })
    })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * PIN TOGGLE
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('note pin', () => {
  describe('PATCH /:id/pin', () => {
    it('toggles pinned from false to true', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42, pinned: false })
      mocks.prisma.note.update.mockResolvedValue({ id: 1, pinned: true })

      const res = await request(app).patch('/1/pin').send({})

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ pinned: true })
    })

    it('accepts explicit pinned value', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42, pinned: true })
      mocks.prisma.note.update.mockResolvedValue({ id: 1, pinned: false })

      const res = await request(app).patch('/1/pin').send({ pinned: false })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ pinned: false })
    })

    it('returns 403 for non-owner', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 99, pinned: false })

      const res = await request(app).patch('/1/pin').send({})
      expect(res.status).toBe(403)
    })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * TAGS
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('note tags', () => {
  describe('PATCH /:id/tags', () => {
    it('updates tags and returns sanitized array', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
      mocks.prisma.note.update.mockResolvedValue({ id: 1, tags: '["math","physics"]' })

      const res = await request(app).patch('/1/tags').send({ tags: ['Math', ' Physics '] })

      expect(res.status).toBe(200)
      expect(res.body.tags).toEqual(['math', 'physics'])
    })

    it('enforces max 10 tags', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
      mocks.prisma.note.update.mockResolvedValue({ id: 1, tags: JSON.stringify(Array.from({ length: 10 }, (_, i) => `tag${i}`)) })

      const tags = Array.from({ length: 15 }, (_, i) => `tag${i}`)
      await request(app).patch('/1/tags').send({ tags })

      const callData = mocks.prisma.note.update.mock.calls[0][0].data
      const savedTags = JSON.parse(callData.tags)
      expect(savedTags.length).toBeLessThanOrEqual(10)
    })

    it('deduplicates tags', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
      mocks.prisma.note.update.mockResolvedValue({ id: 1, tags: '["hello"]' })

      await request(app).patch('/1/tags').send({ tags: ['hello', 'Hello', 'HELLO'] })

      const callData = mocks.prisma.note.update.mock.calls[0][0].data
      const savedTags = JSON.parse(callData.tags)
      expect(savedTags).toEqual(['hello'])
    })

    it('handles non-array tags gracefully', async () => {
      mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })
      mocks.prisma.note.update.mockResolvedValue({ id: 1, tags: '[]' })

      const res = await request(app).patch('/1/tags').send({ tags: 'not-an-array' })

      expect(res.status).toBe(200)
      expect(res.body.tags).toEqual([])
    })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * COMMENT HTML STRIPPING
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('comment HTML stripping', () => {
  it('strips HTML tags from comment content', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, private: false, userId: 42, title: 'Test', content: 'body' })
    mocks.prisma.noteComment.create.mockResolvedValue({
      id: 1, content: 'alert("xss")', noteId: 1, userId: 42,
      author: { id: 42, username: 'test_user' },
    })

    const res = await request(app)
      .post('/1/comments')
      .send({ content: '<script>alert("xss")</script>' })

    expect(res.status).toBe(201)
    // The create call should receive stripped content
    const createCall = mocks.prisma.noteComment.create.mock.calls[0][0]
    expect(createCall.data.content).not.toContain('<script>')
    expect(createCall.data.content).toBe('alert("xss")')
  })

  it('returns 400 if stripping tags leaves empty content', async () => {
    const res = await request(app)
      .post('/1/comments')
      .send({ content: '<br><hr><div></div>' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/cannot be empty/i)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * IMAGE UPLOAD — validation only (no actual file upload in unit tests)
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('image upload', () => {
  it('returns 400 for invalid note id', async () => {
    const res = await request(app).post('/abc/images')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid note id/i)
  })

  it('returns 400 when no file is attached', async () => {
    mocks.prisma.note.findUnique.mockResolvedValue({ id: 1, userId: 42 })

    const res = await request(app).post('/1/images')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no image file/i)
  })
})
