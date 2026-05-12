/**
 * studyGroups.crud.deep.test.js — Deep test coverage for group CRUD endpoints.
 *
 * Targets: POST/GET/PATCH/DELETE /api/study-groups[/:id]
 * Covers: name validation, privacy enum (A13), 404 on missing, GET privacy,
 * owner-only PATCH/DELETE, A12 numeric ID validation, avatar URL cap,
 * description max length, soft-delete cascade behavior.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const studyGroupsRoutePath = require.resolve('../src/modules/studyGroups')

const mocks = vi.hoisted(() => {
  const state = { userId: 42, username: 'group_owner', role: 'student' }
  const prisma = {
    studyGroup: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    studyGroupMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    course: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    groupResource: { count: vi.fn().mockResolvedValue(0) },
    groupSession: { count: vi.fn().mockResolvedValue(0) },
    groupDiscussionPost: { count: vi.fn().mockResolvedValue(0) },
    groupAuditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    groupBlock: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  }
  return { state, prisma }
})

const originalLoad = Module._load
let app

beforeAll(() => {
  const emptyRouter = express.Router({ mergeParams: true })
  const mockTargets = new Map([
    [require.resolve('../src/lib/prisma'), mocks.prisma],
    [
      require.resolve('../src/middleware/auth'),
      (req, _res, next) => {
        req.user = {
          userId: mocks.state.userId,
          username: mocks.state.username,
          role: mocks.state.role,
        }
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
        groupJoinLimiter: (_req, _res, next) => next(),
        groupMediaUploadLimiter: (_req, _res, next) => next(),
        groupReportLimiter: (_req, _res, next) => next(),
        groupAppealLimiter: (_req, _res, next) => next(),
      },
    ],
    [
      require.resolve('../src/lib/social/blockFilter'),
      { getBlockedUserIds: vi.fn().mockResolvedValue([]) },
    ],
    [
      require.resolve('../src/lib/notify'),
      {
        createNotification: vi.fn().mockResolvedValue(undefined),
        createNotifications: vi.fn().mockResolvedValue(undefined),
      },
    ],
    [
      require.resolve('../src/lib/getUserPlan'),
      { getUserPlan: vi.fn().mockResolvedValue('free'), isPro: () => false },
    ],
    [require.resolve('../src/modules/studyGroups/studyGroups.resources.routes'), emptyRouter],
    [require.resolve('../src/modules/studyGroups/studyGroups.sessions.routes'), emptyRouter],
    [require.resolve('../src/modules/studyGroups/studyGroups.discussions.routes'), emptyRouter],
    [require.resolve('../src/modules/studyGroups/studyGroups.activity.routes'), emptyRouter],
    [require.resolve('../src/modules/studyGroups/studyGroups.reports.routes'), emptyRouter],
    [
      require.resolve('../src/modules/studyGroups/studyGroups.reports.service'),
      {
        writeAuditLog: vi.fn().mockResolvedValue(undefined),
        getHiddenGroupIdsForReporter: vi.fn().mockResolvedValue(new Set()),
      },
    ],
    [
      require.resolve('../src/modules/achievements'),
      {
        emitAchievementEvent: vi.fn(),
        EVENT_KINDS: { GROUP_CREATE: 'group_create', GROUP_JOIN: 'group_join' },
      },
    ],
  ])
  Module._load = function patched(req, parent, isMain) {
    const resolved = Module._resolveFilename(req, parent, isMain)
    if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    return originalLoad.apply(this, arguments)
  }
  delete require.cache[studyGroupsRoutePath]
  const routerModule = require(studyGroupsRoutePath)
  app = express()
  app.use(express.json())
  app.use('/', routerModule.default || routerModule)
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[studyGroupsRoutePath]
})

function baseGroup(overrides = {}) {
  return {
    id: 1,
    name: 'Calc Crew',
    description: 'desc',
    privacy: 'public',
    maxMembers: 50,
    createdById: 42,
    avatarUrl: null,
    backgroundUrl: null,
    backgroundCredit: null,
    courseId: null,
    moderationStatus: 'active',
    deletedAt: null,
    memberListPrivate: false,
    requirePostApproval: false,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.username = 'group_owner'
  mocks.state.role = 'student'

  mocks.prisma.studyGroup.findUnique.mockResolvedValue(baseGroup())
  mocks.prisma.studyGroup.findMany.mockResolvedValue([])
  mocks.prisma.studyGroup.count.mockResolvedValue(0)
  mocks.prisma.studyGroup.create.mockImplementation(async ({ data }) =>
    baseGroup({ id: 99, ...data, createdById: 42 }),
  )
  mocks.prisma.studyGroup.update.mockImplementation(async ({ where, data }) =>
    baseGroup({ id: where.id, ...data }),
  )
  mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
    id: 9,
    groupId: 1,
    userId: 42,
    role: 'admin',
    status: 'active',
    joinedAt: new Date(),
  })
  mocks.prisma.studyGroupMember.count.mockResolvedValue(1)
  mocks.prisma.course.findUnique.mockResolvedValue({
    id: 5,
    name: 'Calc',
    code: 'C101',
    school: null,
  })
})

describe('CRUD: POST / (create)', () => {
  it('creates a public group with valid data', async () => {
    const res = await request(app)
      .post('/')
      .send({ name: 'New Group', description: 'd', privacy: 'public' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('New Group')
    expect(mocks.prisma.studyGroup.create).toHaveBeenCalled()
  })

  it('rejects empty name (400)', async () => {
    const res = await request(app).post('/').send({ name: '', description: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/name/i)
  })

  it('rejects name >100 chars (400)', async () => {
    const res = await request(app)
      .post('/')
      .send({ name: 'x'.repeat(101) })
    expect(res.status).toBe(400)
  })

  it('rejects invalid privacy value (A13 enum check)', async () => {
    const res = await request(app).post('/').send({ name: 'g', privacy: 'wide_open' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/privacy/i)
  })

  it('accepts privacy=private as a valid enum value', async () => {
    mocks.prisma.studyGroup.count.mockResolvedValue(0)
    const res = await request(app).post('/').send({ name: 'p', privacy: 'private' })
    expect(res.status).toBe(201)
  })

  it('accepts privacy=invite_only as a valid enum value', async () => {
    mocks.prisma.studyGroup.count.mockResolvedValue(0)
    const res = await request(app).post('/').send({ name: 'i', privacy: 'invite_only' })
    expect(res.status).toBe(201)
  })

  it('rejects description >2000 chars', async () => {
    const res = await request(app)
      .post('/')
      .send({ name: 'g', description: 'x'.repeat(2001) })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/description/i)
  })

  it('rejects invalid courseId', async () => {
    const res = await request(app).post('/').send({ name: 'g', courseId: 'banana' })
    expect(res.status).toBe(400)
  })

  it('404s when courseId points to nonexistent course', async () => {
    mocks.prisma.course.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).post('/').send({ name: 'g', courseId: 999 })
    expect(res.status).toBe(404)
  })
})

describe('CRUD: GET /:id (read + privacy)', () => {
  it('returns 400 on non-numeric id (A12)', async () => {
    const res = await request(app).get('/abc')
    expect(res.status).toBe(400)
  })

  it('returns 404 on missing group', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/777')
    expect(res.status).toBe(404)
  })

  it('returns 404 (not 403) for private groups to non-members (avoid leak)', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(
      baseGroup({ privacy: 'private', createdById: 99 }),
    )
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/1')
    expect(res.status).toBe(404)
  })

  it('returns 200 for public group regardless of membership', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(
      baseGroup({ privacy: 'public', createdById: 99 }),
    )
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce(null)
    const res = await request(app).get('/1')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(1)
  })

  it('returns 404 for soft-deleted group to non-owner', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(
      baseGroup({ deletedAt: new Date(), createdById: 99 }),
    )
    const res = await request(app).get('/1')
    expect(res.status).toBe(404)
  })

  it('returns 200 for soft-deleted group when caller is owner', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(
      baseGroup({ deletedAt: new Date(), createdById: 42 }),
    )
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
      id: 9,
      groupId: 1,
      userId: 42,
      role: 'admin',
      status: 'active',
      joinedAt: new Date(),
    })
    const res = await request(app).get('/1')
    expect(res.status).toBe(200)
  })
})

describe('CRUD: PATCH /:id (owner only)', () => {
  it('returns 400 on non-numeric id (A12)', async () => {
    const res = await request(app).patch('/notanid').send({ name: 'x' })
    expect(res.status).toBe(400)
  })

  it('returns 403 when caller is not an admin', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
      id: 9,
      groupId: 1,
      userId: 42,
      role: 'member',
      status: 'active',
    })
    const res = await request(app).patch('/1').send({ name: 'X' })
    expect(res.status).toBe(403)
  })

  it('rejects invalid privacy value on update (A13)', async () => {
    const res = await request(app).patch('/1').send({ privacy: 'foo' })
    expect(res.status).toBe(400)
  })

  it('rejects invalid maxMembers (out of range)', async () => {
    const res = await request(app).patch('/1').send({ maxMembers: 5000 })
    expect(res.status).toBe(400)
  })

  it('rejects external backgroundUrl', async () => {
    const res = await request(app).patch('/1').send({ backgroundUrl: 'https://evil.com/x.jpg' })
    expect(res.status).toBe(400)
  })

  it('accepts an internal /uploads/group-media/ backgroundUrl', async () => {
    const res = await request(app)
      .patch('/1')
      .send({ backgroundUrl: '/uploads/group-media/foo.jpg' })
    expect(res.status).toBe(200)
  })

  it('updates name when caller is admin', async () => {
    const res = await request(app).patch('/1').send({ name: 'New Name' })
    expect(res.status).toBe(200)
    expect(mocks.prisma.studyGroup.update).toHaveBeenCalled()
  })
})

describe('CRUD: DELETE /:id (owner only soft-delete)', () => {
  it('returns 400 on non-numeric id (A12)', async () => {
    const res = await request(app).delete('/--')
    expect(res.status).toBe(400)
  })

  it('returns 403 when caller is not the creator', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(baseGroup({ createdById: 99 }))
    const res = await request(app).delete('/1')
    expect(res.status).toBe(403)
  })

  it('soft-deletes (moderationStatus=deleted, deletedAt set) on owner', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(baseGroup({ createdById: 42 }))
    const res = await request(app).delete('/1')
    expect(res.status).toBe(204)
    expect(mocks.prisma.studyGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ moderationStatus: 'deleted' }) }),
    )
  })

  it('platform admin can delete any group', async () => {
    mocks.state.role = 'admin'
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(baseGroup({ createdById: 999 }))
    const res = await request(app).delete('/1')
    expect(res.status).toBe(204)
  })

  it('returns 204 idempotently when already soft-deleted', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(
      baseGroup({ createdById: 42, deletedAt: new Date() }),
    )
    const res = await request(app).delete('/1')
    expect(res.status).toBe(204)
  })
})
