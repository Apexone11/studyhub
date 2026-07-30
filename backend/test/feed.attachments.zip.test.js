import fs from 'node:fs'
import os from 'node:os'
import nodePath from 'node:path'
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const feedRoutePath = require.resolve('../src/modules/feed')

// A real file on disk: the route stats and streams whatever
// resolveAttachmentPath hands back, so the archive tests need one.
const existingFile = nodePath.join(os.tmpdir(), 'studyhub-zip-test-fixture.pdf')

const mocks = vi.hoisted(() => {
  const prisma = {
    announcement: { findMany: vi.fn() },
    studySheet: { findMany: vi.fn() },
    feedPost: { findMany: vi.fn(), findUnique: vi.fn() },
    feedPostAttachment: { findMany: vi.fn(), findFirst: vi.fn() },
    feedPostComment: { count: vi.fn(), groupBy: vi.fn() },
    feedPostReaction: { findMany: vi.fn(), groupBy: vi.fn() },
    note: { findMany: vi.fn() },
    noteComment: { groupBy: vi.fn() },
    starredSheet: { findMany: vi.fn() },
    comment: { groupBy: vi.fn() },
    reaction: { findMany: vi.fn(), groupBy: vi.fn() },
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    sentry: { captureError: vi.fn() },
    notify: { createNotification: vi.fn() },
    mentions: { notifyMentionedUsers: vi.fn() },
    accessControl: {
      assertOwnerOrAdmin: vi.fn(() => true),
      sendForbidden: vi.fn((res, message) => res.status(403).json({ error: message })),
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
  }
})

// Every limiter becomes a pass-through: the suite makes more than
// feedZipLimiter's 10-per-5-minutes allowance from one mocked user, and
// limiter behavior is covered by the rate-limiter suite, not here.
const passThroughLimiters = new Proxy(
  {},
  {
    get: () => (req, res, next) => next(),
  },
)

const mockTargets = new Map([
  [require.resolve('../src/lib/rateLimiters'), passThroughLimiters],
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
  fs.writeFileSync(existingFile, '%PDF-1.4 test\n')

  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) return mockedModule
    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[feedRoutePath]
  const feedRouterModule = require('../src/modules/feed')
  const feedRouter = feedRouterModule.default || feedRouterModule

  app = express()
  app.use(express.json())
  app.use('/', feedRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[feedRoutePath]
  try {
    fs.unlinkSync(existingFile)
  } catch {
    /* already gone — nothing to clean up */
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.accessControl.sendForbidden.mockImplementation((res, message) =>
    res.status(403).json({ error: message }),
  )
  // Owned by the authenticated user, downloads permitted, unless a test
  // overrides it.
  mocks.prisma.feedPost.findUnique.mockResolvedValue({
    id: 7,
    userId: 42,
    allowDownloads: true,
  })
  mocks.prisma.feedPostAttachment.findMany.mockResolvedValue([])
  mocks.storage.resolveAttachmentPath.mockReturnValue(null)
})

describe('POST /posts/:id/attachments/zip', () => {
  it('rejects a non-array attachmentIds', async () => {
    const res = await request(app).post('/posts/7/attachments/zip').send({ attachmentIds: 'nope' })
    expect(res.status).toBe(400)
    expect(mocks.prisma.feedPostAttachment.findMany).not.toHaveBeenCalled()
  })

  it('rejects an empty selection', async () => {
    const res = await request(app).post('/posts/7/attachments/zip').send({ attachmentIds: [] })
    expect(res.status).toBe(400)
  })

  it('rejects more ids than a post can hold', async () => {
    const res = await request(app)
      .post('/posts/7/attachments/zip')
      .send({ attachmentIds: [1, 2, 3, 4, 5, 6] })
    expect(res.status).toBe(400)
  })

  it('rejects non-integer ids', async () => {
    const res = await request(app)
      .post('/posts/7/attachments/zip')
      .send({ attachmentIds: [1, 'abc'] })
    expect(res.status).toBe(400)
  })

  it('rejects an invalid post id', async () => {
    const res = await request(app)
      .post('/posts/not-a-number/attachments/zip')
      .send({ attachmentIds: [1] })
    expect(res.status).toBe(400)
  })

  it('404s when the post does not exist', async () => {
    mocks.prisma.feedPost.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post('/posts/7/attachments/zip')
      .send({ attachmentIds: [1] })
    expect(res.status).toBe(404)
  })

  it('403s for a non-owner when downloads are disabled', async () => {
    mocks.prisma.feedPost.findUnique.mockResolvedValue({
      id: 7,
      userId: 999,
      allowDownloads: false,
    })
    const res = await request(app)
      .post('/posts/7/attachments/zip')
      .send({ attachmentIds: [1] })
    expect(res.status).toBe(403)
    expect(mocks.prisma.feedPostAttachment.findMany).not.toHaveBeenCalled()
  })

  it('scopes the attachment lookup to the post so foreign ids cannot leak', async () => {
    await request(app)
      .post('/posts/7/attachments/zip')
      .send({ attachmentIds: [1, 4242] })
    expect(mocks.prisma.feedPostAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [1, 4242] }, postId: 7 },
      }),
    )
  })

  it('413s when the selection exceeds the bundle size cap', async () => {
    const fifty = 50 * 1024 * 1024
    mocks.prisma.feedPostAttachment.findMany.mockResolvedValue([
      { id: 1, url: '/uploads/attachments/a.pdf', name: 'a.pdf', sizeBytes: fifty },
      { id: 2, url: '/uploads/attachments/b.pdf', name: 'b.pdf', sizeBytes: fifty },
    ])
    mocks.storage.resolveAttachmentPath.mockImplementation(() => existingFile)

    const res = await request(app)
      .post('/posts/7/attachments/zip')
      .send({ attachmentIds: [1, 2] })
    expect(res.status).toBe(413)
  })

  it('streams a zip when several attachments are selected', async () => {
    mocks.prisma.feedPostAttachment.findMany.mockResolvedValue([
      { id: 1, url: '/uploads/attachments/a.pdf', name: 'a.pdf', sizeBytes: 12 },
      { id: 2, url: '/uploads/attachments/b.pdf', name: 'b.pdf', sizeBytes: 12 },
    ])
    mocks.storage.resolveAttachmentPath.mockImplementation(() => existingFile)

    const res = await request(app)
      .post('/posts/7/attachments/zip')
      .send({ attachmentIds: [1, 2] })
      .buffer()
      .parse((response, callback) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => callback(null, Buffer.concat(chunks)))
      })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/zip')
    expect(res.headers['content-disposition']).toContain('post-7-attachments.zip')
    // "PK" — the zip local-file-header magic bytes.
    expect(res.body.subarray(0, 2).toString('latin1')).toBe('PK')
  })

  it('sends a single selected file directly instead of an archive', async () => {
    mocks.prisma.feedPostAttachment.findMany.mockResolvedValue([
      { id: 1, url: '/uploads/attachments/only.pdf', name: 'only.pdf', sizeBytes: 12 },
    ])
    mocks.storage.resolveAttachmentPath.mockImplementation(() => existingFile)

    const res = await request(app)
      .post('/posts/7/attachments/zip')
      .send({ attachmentIds: [1] })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).not.toContain('application/zip')
  })

  it('404s when none of the selected attachments resolve to a file', async () => {
    mocks.prisma.feedPostAttachment.findMany.mockResolvedValue([
      { id: 1, url: '/uploads/attachments/gone.pdf', name: 'gone.pdf', sizeBytes: 10 },
    ])
    mocks.storage.resolveAttachmentPath.mockReturnValue(null)
    const res = await request(app)
      .post('/posts/7/attachments/zip')
      .send({ attachmentIds: [1] })
    expect(res.status).toBe(404)
  })
})
