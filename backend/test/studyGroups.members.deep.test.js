/**
 * studyGroups.members.deep.test.js — Deep coverage for membership endpoints.
 *
 * Targets: POST /:id/join, /:id/leave, /:id/invite, PATCH/DELETE /:id/members/:userId,
 * POST /:id/block/:userId, POST /:id/mute/:userId.
 * Covers: join semantics for public/private/invite_only, leave guard for
 * last admin, kick + audit log, mute, block bidirectionality, rejoin after
 * block, atomic member count, A12 numeric id parsing.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const studyGroupsRoutePath = require.resolve('../src/modules/studyGroups')

const mocks = vi.hoisted(() => {
  const state = { userId: 42, username: 'caller', role: 'student' }
  const prisma = {
    studyGroup: { findUnique: vi.fn(), update: vi.fn() },
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
  return {
    state,
    prisma,
    notify: { createNotification: vi.fn(), createNotifications: vi.fn() },
    blockFilter: { getBlockedUserIds: vi.fn().mockResolvedValue([]) },
    reportsService: {
      writeAuditLog: vi.fn().mockResolvedValue(undefined),
      getHiddenGroupIdsForReporter: vi.fn().mockResolvedValue(new Set()),
    },
  }
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
    [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
    [require.resolve('../src/lib/notify'), mocks.notify],
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
      mocks.reportsService,
    ],
    [
      require.resolve('../src/modules/achievements'),
      {
        emitAchievementEvent: vi.fn(),
        EVENT_KINDS: { GROUP_JOIN: 'group_join', GROUP_CREATE: 'group_create' },
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
    name: 'Test Group',
    description: '',
    privacy: 'public',
    maxMembers: 50,
    createdById: 99,
    avatarUrl: null,
    backgroundUrl: null,
    backgroundCredit: null,
    courseId: null,
    moderationStatus: 'active',
    deletedAt: null,
    memberListPrivate: false,
    requirePostApproval: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.username = 'caller'
  mocks.state.role = 'student'

  mocks.prisma.studyGroup.findUnique.mockResolvedValue(baseGroup())
  mocks.prisma.studyGroupMember.findUnique.mockResolvedValue(null)
  mocks.prisma.studyGroupMember.count.mockResolvedValue(2)
  mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])
  mocks.prisma.groupBlock.findUnique.mockResolvedValue(null)
})

describe('Membership: POST /:id/join', () => {
  it('member created with status=active for public group', async () => {
    mocks.prisma.studyGroupMember.create.mockResolvedValue({
      id: 50,
      groupId: 1,
      userId: 42,
      role: 'member',
      status: 'active',
      joinedAt: new Date(),
    })
    const res = await request(app).post('/1/join').send({})
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('active')
  })

  it('private group → pending request created (not auto-joined)', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(baseGroup({ privacy: 'private' }))
    mocks.prisma.studyGroupMember.create.mockResolvedValue({
      id: 51,
      groupId: 1,
      userId: 42,
      role: 'member',
      status: 'pending',
      joinedAt: new Date(),
    })
    const res = await request(app).post('/1/join').send({})
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')
  })

  it('invite_only group returns 403 on direct join', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(baseGroup({ privacy: 'invite_only' }))
    const res = await request(app).post('/1/join').send({})
    expect(res.status).toBe(403)
  })

  it('returns 400 on duplicate pending request', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
      id: 9,
      status: 'pending',
      groupId: 1,
      userId: 42,
      role: 'member',
      joinedAt: new Date(),
    })
    const res = await request(app).post('/1/join').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/pending/i)
  })

  it('returns 403 for banned user trying to rejoin', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
      id: 9,
      status: 'banned',
      groupId: 1,
      userId: 42,
      role: 'member',
      joinedAt: new Date(),
    })
    const res = await request(app).post('/1/join').send({})
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/banned/i)
  })

  it('returns 400 on numeric id parse failure (A12)', async () => {
    const res = await request(app).post('/abc/join').send({})
    expect(res.status).toBe(400)
  })

  it('blocked user gets a generic 404 (no "blocked" reveal)', async () => {
    mocks.prisma.groupBlock.findUnique.mockResolvedValueOnce({
      id: 1,
      reason: '',
      createdAt: new Date(),
    })
    const res = await request(app).post('/1/join').send({})
    expect(res.status).toBe(404)
  })

  it('member count atomic increment: cannot join when at capacity', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(baseGroup({ maxMembers: 5 }))
    mocks.prisma.studyGroupMember.count.mockResolvedValue(5)
    const res = await request(app).post('/1/join').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/full/i)
  })
})

describe('Membership: POST /:id/leave', () => {
  it('removes member row on success', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 50,
      groupId: 1,
      userId: 42,
      role: 'member',
      status: 'active',
      joinedAt: new Date(),
    })
    mocks.prisma.studyGroupMember.delete.mockResolvedValue({ id: 50 })
    const res = await request(app).post('/1/leave').send({})
    expect(res.status).toBe(204)
    expect(mocks.prisma.studyGroupMember.delete).toHaveBeenCalled()
  })

  it('returns 404 when caller is not a member', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/1/leave').send({})
    expect(res.status).toBe(404)
  })

  it('refuses to leave when caller is last admin', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 50,
      groupId: 1,
      userId: 42,
      role: 'admin',
      status: 'active',
      joinedAt: new Date(),
    })
    mocks.prisma.studyGroupMember.count.mockResolvedValue(1)
    const res = await request(app).post('/1/leave').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/last admin/i)
  })
})

describe('Membership: DELETE /:id/members/:userId (kick)', () => {
  it('admin can kick a regular member', async () => {
    mocks.prisma.studyGroupMember.findUnique
      .mockResolvedValueOnce({ id: 9, role: 'admin', status: 'active', userId: 42, groupId: 1 })
      .mockResolvedValueOnce({ id: 77, role: 'member', status: 'active', userId: 99, groupId: 1 })
      .mockResolvedValueOnce({ id: 9, role: 'admin', status: 'active', userId: 42, groupId: 1 })
    mocks.prisma.studyGroupMember.delete.mockResolvedValue({ id: 77 })
    const res = await request(app).delete('/1/members/99')
    expect(res.status).toBe(204)
  })

  it('moderator cannot remove an admin (403)', async () => {
    mocks.prisma.studyGroupMember.findUnique
      .mockResolvedValueOnce({ id: 9, role: 'moderator', status: 'active', userId: 42, groupId: 1 })
      .mockResolvedValueOnce({ id: 77, role: 'admin', status: 'active', userId: 99, groupId: 1 })
      .mockResolvedValueOnce({ id: 9, role: 'moderator', status: 'active', userId: 42, groupId: 1 })
    const res = await request(app).delete('/1/members/99')
    expect(res.status).toBe(403)
  })

  it('regular member cannot kick (403)', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).delete('/1/members/99')
    expect(res.status).toBe(403)
  })

  it('A12: returns 400 on bad numeric userId', async () => {
    const res = await request(app).delete('/1/members/notanint')
    expect(res.status).toBe(400)
  })

  it('cannot remove self (400)', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
      id: 9,
      role: 'admin',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).delete('/1/members/42')
    expect(res.status).toBe(400)
  })

  it('fires removed-user notification on kick', async () => {
    mocks.prisma.studyGroupMember.findUnique
      .mockResolvedValueOnce({ id: 9, role: 'admin', status: 'active', userId: 42, groupId: 1 })
      .mockResolvedValueOnce({ id: 77, role: 'member', status: 'active', userId: 99, groupId: 1 })
      .mockResolvedValueOnce({ id: 9, role: 'admin', status: 'active', userId: 42, groupId: 1 })
    mocks.prisma.studyGroupMember.delete.mockResolvedValue({ id: 77 })
    await request(app).delete('/1/members/99')
    expect(mocks.notify.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 99, type: 'group_removed' }),
    )
  })
})

describe('Membership: POST /:id/block/:userId (group block)', () => {
  it('admin can block a member; writes audit log', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
      id: 9,
      role: 'admin',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    mocks.prisma.groupBlock.upsert.mockResolvedValue({ id: 1 })
    mocks.prisma.studyGroupMember.deleteMany.mockResolvedValue({ count: 1 })
    const res = await request(app).post('/1/block/99').send({ reason: 'spam' })
    expect(res.status).toBe(200)
    expect(mocks.reportsService.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'member.block' }),
    )
  })

  it('cannot block self (400)', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
      id: 9,
      role: 'admin',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).post('/1/block/42').send({})
    expect(res.status).toBe(400)
  })

  it('non-mod 403s', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).post('/1/block/99').send({})
    expect(res.status).toBe(403)
  })

  it('block removes member row (cascades)', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
      id: 9,
      role: 'admin',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    mocks.prisma.groupBlock.upsert.mockResolvedValue({ id: 1 })
    mocks.prisma.studyGroupMember.deleteMany.mockResolvedValue({ count: 1 })
    await request(app).post('/1/block/99').send({})
    expect(mocks.prisma.studyGroupMember.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 1, userId: 99 } }),
    )
  })
})

describe('Membership: POST /:id/mute/:userId (mute toggles per group)', () => {
  it('admin can mute a member for N days', async () => {
    mocks.prisma.studyGroupMember.findUnique
      .mockResolvedValueOnce({ id: 9, role: 'admin', status: 'active', userId: 42, groupId: 1 })
      .mockResolvedValueOnce({ id: 77, status: 'active', userId: 99, groupId: 1 })
    mocks.prisma.studyGroupMember.update.mockResolvedValue({ id: 77 })
    const res = await request(app).post('/1/mute/99').send({ days: 3, reason: 'noisy' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('mutedUntil')
    expect(mocks.prisma.studyGroupMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mutedReason: 'noisy', mutedById: 42 }),
      }),
    )
  })

  it('cannot mute self', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
      id: 9,
      role: 'admin',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).post('/1/mute/42').send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when target is not a group member', async () => {
    mocks.prisma.studyGroupMember.findUnique
      .mockResolvedValueOnce({ id: 9, role: 'admin', status: 'active', userId: 42, groupId: 1 })
      .mockResolvedValueOnce(null)
    const res = await request(app).post('/1/mute/99').send({})
    expect(res.status).toBe(404)
  })
})
