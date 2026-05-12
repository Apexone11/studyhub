/**
 * studyGroups.resources.deep.test.js — Deep coverage for resource endpoints.
 *
 * Targets: GET/POST /:id/resources, PATCH/DELETE /:id/resources/:resourceId.
 * Covers: list pagination, member-gate, resourceType enum (A13), title/desc
 * length caps, URL validation, /uploads/group-media path acceptance,
 * unsafe-link rejection, author-or-admin write/delete, pin admin-only, A12.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const resourcesPath = require.resolve('../src/modules/studyGroups/studyGroups.resources.routes')

const mocks = vi.hoisted(() => {
  const state = { userId: 42, role: 'student' }
  const prisma = {
    groupResource: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    studyGroupMember: { findUnique: vi.fn() },
    studyGroup: { findUnique: vi.fn() },
  }
  return {
    state,
    prisma,
    mediaService: {
      getQuotaSnapshot: vi.fn().mockResolvedValue({ used: 0, limit: 5, resetIn: 0 }),
      assertQuotaAvailable: vi.fn().mockResolvedValue(undefined),
      incrementUsage: vi.fn().mockResolvedValue(undefined),
    },
    linkSafety: { checkUrl: vi.fn().mockReturnValue({ safe: true }) },
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
        groupMediaUploadLimiter: (_req, _res, next) => next(),
      },
    ],
    [require.resolve('../src/modules/studyGroups/studyGroups.media.service'), mocks.mediaService],
    [require.resolve('../src/lib/linkSafety'), mocks.linkSafety],
  ])
  Module._load = function patched(reqId, parent, isMain) {
    const resolved = Module._resolveFilename(reqId, parent, isMain)
    if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    return originalLoad.apply(this, arguments)
  }
  delete require.cache[resourcesPath]
  const routerModule = require(resourcesPath)
  app = express()
  app.use(express.json())
  // Mount with a fake :id parameter so the sub-router resolves req.params.id.
  app.use('/groups/:id/resources', routerModule.default || routerModule)
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[resourcesPath]
})

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
    joinedAt: new Date(),
  })
  mocks.prisma.groupResource.findMany.mockResolvedValue([])
  mocks.prisma.groupResource.count.mockResolvedValue(0)
  mocks.linkSafety.checkUrl.mockReturnValue({ safe: true })
})

describe('Resources: GET /', () => {
  it('returns resources for active members', async () => {
    mocks.prisma.groupResource.findMany.mockResolvedValue([
      {
        id: 1,
        groupId: 1,
        userId: 42,
        title: 'Notes',
        description: 'd',
        resourceType: 'link',
        resourceUrl: 'https://example.com',
        sheetId: null,
        noteId: null,
        pinned: false,
        createdAt: new Date(),
        user: { id: 42, username: 'caller', avatarUrl: null },
      },
    ])
    mocks.prisma.groupResource.count.mockResolvedValue(1)
    const res = await request(app).get('/groups/1/resources?limit=20&offset=0')
    expect(res.status).toBe(200)
    expect(res.body.resources).toHaveLength(1)
    expect(res.body.total).toBe(1)
  })

  it('respects custom pagination', async () => {
    const res = await request(app).get('/groups/1/resources?limit=5&offset=10')
    expect(res.status).toBe(200)
    expect(mocks.prisma.groupResource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    )
  })

  it('returns 404 when caller is not a member', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/groups/1/resources')
    expect(res.status).toBe(404)
  })

  it('A12: returns 400 on non-numeric group id', async () => {
    const res = await request(app).get('/groups/abc/resources')
    expect(res.status).toBe(400)
  })
})

describe('Resources: POST /', () => {
  beforeEach(() => {
    mocks.prisma.groupResource.create.mockImplementation(async ({ data }) => ({
      id: 100,
      ...data,
      createdAt: new Date(),
      user: { id: 42, username: 'caller', avatarUrl: null },
      pinned: false,
    }))
  })

  it('creates a link resource with valid http URL', async () => {
    const res = await request(app).post('/groups/1/resources').send({
      title: 'Helpful link',
      resourceType: 'link',
      resourceUrl: 'https://example.com/page',
    })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe('Helpful link')
  })

  it('rejects resourceType outside allowlist (A13)', async () => {
    const res = await request(app).post('/groups/1/resources').send({
      title: 'X',
      resourceType: 'malware',
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/resourceType/i)
  })

  it('rejects empty title (400)', async () => {
    const res = await request(app).post('/groups/1/resources').send({ title: '' })
    expect(res.status).toBe(400)
  })

  it('rejects title >200 chars', async () => {
    const res = await request(app)
      .post('/groups/1/resources')
      .send({
        title: 'x'.repeat(201),
        resourceType: 'link',
      })
    expect(res.status).toBe(400)
  })

  it('rejects description >2000 chars', async () => {
    const res = await request(app)
      .post('/groups/1/resources')
      .send({
        title: 't',
        description: 'x'.repeat(2001),
      })
    expect(res.status).toBe(400)
  })

  it('accepts /uploads/group-media/ path as resourceUrl', async () => {
    const res = await request(app).post('/groups/1/resources').send({
      title: 't',
      resourceType: 'file',
      resourceUrl: '/uploads/group-media/foo.pdf',
    })
    expect(res.status).toBe(201)
  })

  it('rejects javascript: URLs (validateResourceUrl)', async () => {
    const res = await request(app).post('/groups/1/resources').send({
      title: 't',
      resourceType: 'link',
      resourceUrl: 'javascript:alert(1)',
    })
    expect(res.status).toBe(400)
  })

  it('rejects when linkSafety flags URL as unsafe', async () => {
    mocks.linkSafety.checkUrl.mockReturnValueOnce({ safe: false, reason: 'phishing TLD' })
    const res = await request(app).post('/groups/1/resources').send({
      title: 't',
      resourceType: 'link',
      resourceUrl: 'https://evil.tk/x',
    })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('UNSAFE_LINK')
  })

  it('returns 404 when caller is not a member', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/groups/1/resources').send({ title: 't' })
    expect(res.status).toBe(404)
  })

  it('refuses when user is muted in group', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      groupId: 1,
      userId: 42,
      role: 'member',
      status: 'active',
      mutedUntil: new Date(Date.now() + 60000),
    })
    const res = await request(app).post('/groups/1/resources').send({ title: 't' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/muted/i)
  })
})

describe('Resources: PATCH /:resourceId', () => {
  it('A12: returns 400 on bad numeric resourceId', async () => {
    const res = await request(app).patch('/groups/1/resources/notanid').send({ title: 'x' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when resource not found', async () => {
    mocks.prisma.groupResource.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).patch('/groups/1/resources/99').send({ title: 'x' })
    expect(res.status).toBe(404)
  })

  it('refuses when caller is neither author nor admin', async () => {
    mocks.prisma.groupResource.findUnique.mockResolvedValueOnce({
      id: 99,
      groupId: 1,
      userId: 999,
      title: 't',
      resourceType: 'link',
    })
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).patch('/groups/1/resources/99').send({ title: 'x' })
    expect(res.status).toBe(403)
  })

  it('rejects javascript: URLs on PATCH', async () => {
    mocks.prisma.groupResource.findUnique.mockResolvedValueOnce({
      id: 99,
      groupId: 1,
      userId: 42,
      title: 't',
      resourceType: 'link',
    })
    const res = await request(app).patch('/groups/1/resources/99').send({
      resourceUrl: 'javascript:alert(1)',
    })
    expect(res.status).toBe(400)
  })

  it('author can edit own resource title', async () => {
    mocks.prisma.groupResource.findUnique.mockResolvedValueOnce({
      id: 99,
      groupId: 1,
      userId: 42,
      title: 'old',
      resourceType: 'link',
    })
    mocks.prisma.groupResource.update.mockResolvedValue({
      id: 99,
      groupId: 1,
      userId: 42,
      title: 'new',
      resourceType: 'link',
      resourceUrl: null,
      sheetId: null,
      noteId: null,
      description: '',
      pinned: false,
      createdAt: new Date(),
      user: { id: 42, username: 'caller', avatarUrl: null },
    })
    const res = await request(app).patch('/groups/1/resources/99').send({ title: 'new' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('new')
  })
})

describe('Resources: DELETE /:resourceId', () => {
  it('author can delete own resource', async () => {
    mocks.prisma.groupResource.findUnique.mockResolvedValueOnce({
      id: 99,
      groupId: 1,
      userId: 42,
    })
    mocks.prisma.groupResource.delete.mockResolvedValue({ id: 99 })
    const res = await request(app).delete('/groups/1/resources/99')
    expect(res.status).toBe(204)
  })

  it('admin can delete any resource', async () => {
    mocks.prisma.groupResource.findUnique.mockResolvedValueOnce({
      id: 99,
      groupId: 1,
      userId: 999,
    })
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'admin',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    mocks.prisma.groupResource.delete.mockResolvedValue({ id: 99 })
    const res = await request(app).delete('/groups/1/resources/99')
    expect(res.status).toBe(204)
  })

  it('regular member cannot delete others resource (403)', async () => {
    mocks.prisma.groupResource.findUnique.mockResolvedValueOnce({
      id: 99,
      groupId: 1,
      userId: 999,
    })
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).delete('/groups/1/resources/99')
    expect(res.status).toBe(403)
  })

  it('A12: returns 400 on bad numeric ids', async () => {
    const res = await request(app).delete('/groups/1/resources/banana')
    expect(res.status).toBe(400)
  })
})
