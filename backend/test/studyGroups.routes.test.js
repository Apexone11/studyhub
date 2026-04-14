import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const studyGroupsRoutePath = require.resolve('../src/modules/studyGroups')

const mocks = vi.hoisted(() => {
  const state = { userId: 42, username: 'group_member', role: 'student' }

  const prisma = {
    studyGroup: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    studyGroupMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    course: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: state.userId, username: state.username, role: state.role }
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    rateLimiters: {
      readLimiter: (_req, _res, next) => next(),
      writeLimiter: (_req, _res, next) => next(),
      groupJoinLimiter: (_req, _res, next) => next(),
    },
    blockFilter: {
      getBlockedUserIds: vi.fn().mockResolvedValue([]),
    },
    notify: {
      createNotification: vi.fn().mockResolvedValue(undefined),
    },
    plans: {
      getUserPlan: vi.fn().mockResolvedValue('free'),
      isPro: vi.fn().mockReturnValue(false),
    },
  }
})

const originalModuleLoad = Module._load
let app

beforeAll(() => {
  const emptySubRouter = express.Router({ mergeParams: true })

  const mockTargets = new Map([
    [require.resolve('../src/lib/prisma'), mocks.prisma],
    [require.resolve('../src/middleware/auth'), mocks.auth],
    [require.resolve('../src/monitoring/sentry'), mocks.sentry],
    [require.resolve('../src/lib/rateLimiters'), mocks.rateLimiters],
    [require.resolve('../src/lib/social/blockFilter'), mocks.blockFilter],
    [require.resolve('../src/lib/notify'), mocks.notify],
    [require.resolve('../src/lib/getUserPlan'), mocks.plans],
    [require.resolve('../src/modules/studyGroups/studyGroups.resources.routes'), emptySubRouter],
    [require.resolve('../src/modules/studyGroups/studyGroups.sessions.routes'), emptySubRouter],
    [require.resolve('../src/modules/studyGroups/studyGroups.discussions.routes'), emptySubRouter],
    [require.resolve('../src/modules/studyGroups/studyGroups.activity.routes'), emptySubRouter],
    [require.resolve('../src/modules/studyGroups/studyGroups.reports.routes'), emptySubRouter],
  ])

  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)
    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[studyGroupsRoutePath]
  const routerModule = require(studyGroupsRoutePath)
  const router = routerModule.default || routerModule

  app = express()
  app.use(express.json())
  app.use('/', router)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[studyGroupsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()

  mocks.state.userId = 42
  mocks.state.username = 'group_member'
  mocks.state.role = 'student'

  mocks.prisma.studyGroup.findUnique.mockResolvedValue({
    id: 1,
    name: 'Calc Crew',
    privacy: 'public',
    maxMembers: 50,
    createdById: 7,
  })
  mocks.prisma.studyGroup.findMany.mockResolvedValue([])
  mocks.prisma.studyGroup.count.mockResolvedValue(0)
  mocks.prisma.studyGroupMember.findUnique.mockResolvedValue(null)
  mocks.prisma.studyGroupMember.count.mockResolvedValue(2)
  mocks.prisma.studyGroupMember.create.mockResolvedValue({
    id: 9,
    groupId: 1,
    userId: 42,
    role: 'member',
    status: 'active',
    joinedAt: new Date('2026-04-07T10:00:00Z'),
  })
  mocks.prisma.studyGroupMember.update.mockResolvedValue({
    id: 9,
    groupId: 1,
    userId: 42,
    role: 'member',
    status: 'active',
    joinedAt: new Date('2026-04-07T10:00:00Z'),
  })
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: 99,
    username: 'alice',
  })
})

describe('study groups join flow', () => {
  it('returns pending status when joining a private group', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValue({
      id: 1,
      name: 'Calc Crew',
      privacy: 'private',
      maxMembers: 50,
      createdById: 7,
    })
    mocks.prisma.studyGroupMember.create.mockResolvedValue({
      id: 10,
      groupId: 1,
      userId: 42,
      role: 'member',
      status: 'pending',
      joinedAt: new Date('2026-04-07T10:00:00Z'),
    })

    const res = await request(app).post('/1/join')

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')
    expect(mocks.prisma.studyGroupMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending' }),
      }),
    )
  })

  it('activates an invited membership instead of rejecting it', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      groupId: 1,
      userId: 42,
      role: 'member',
      status: 'invited',
      joinedAt: new Date('2026-04-07T10:00:00Z'),
    })

    const res = await request(app).post('/1/join')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('active')
    expect(mocks.prisma.studyGroupMember.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { status: 'active' },
    })
  })

  it('keeps pending requests from double-submitting', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      groupId: 1,
      userId: 42,
      role: 'member',
      status: 'pending',
      joinedAt: new Date('2026-04-07T10:00:00Z'),
    })

    const res = await request(app).post('/1/join')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/pending/i)
  })

  it('rejects banned users from rejoining', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      groupId: 1,
      userId: 42,
      role: 'member',
      status: 'banned',
      joinedAt: new Date('2026-04-07T10:00:00Z'),
    })

    const res = await request(app).post('/1/join')

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/banned/i)
  })
})

describe('study groups list filters', () => {
  it('applies schoolId filtering through the course relation', async () => {
    const res = await request(app).get('/?schoolId=12')

    expect(res.status).toBe(200)
    expect(mocks.prisma.studyGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { privacy: 'public' },
            { course: { is: { schoolId: 12 } } },
          ]),
        }),
      }),
    )
  })
})

describe('study groups members and invites', () => {
  it('includes pending and invited members for moderators', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 20,
      groupId: 1,
      userId: 42,
      role: 'moderator',
      status: 'active',
      joinedAt: new Date('2026-04-07T09:00:00Z'),
    })
    mocks.prisma.studyGroupMember.findMany.mockResolvedValue([
      {
        id: 31,
        userId: 77,
        role: 'member',
        status: 'pending',
        joinedAt: new Date('2026-04-07T11:00:00Z'),
        user: { id: 77, username: 'pending_user', avatarUrl: null },
      },
      {
        id: 32,
        userId: 78,
        role: 'member',
        status: 'invited',
        joinedAt: new Date('2026-04-07T12:00:00Z'),
        user: { id: 78, username: 'invited_user', avatarUrl: null },
      },
    ])
    mocks.prisma.studyGroupMember.count.mockResolvedValue(2)

    const res = await request(app).get('/1/members')

    expect(res.status).toBe(200)
    expect(res.body.members).toHaveLength(2)
    expect(res.body.members.map((member) => member.status)).toEqual(['pending', 'invited'])
    expect(mocks.prisma.studyGroupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupId: 1 }),
      }),
    )
    expect(mocks.prisma.studyGroupMember.findMany.mock.calls[0][0].where).not.toHaveProperty(
      'status',
    )
  })

  it('still limits regular members to active members only', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 20,
      groupId: 1,
      userId: 42,
      role: 'member',
      status: 'active',
      joinedAt: new Date('2026-04-07T09:00:00Z'),
    })
    mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])
    mocks.prisma.studyGroupMember.count.mockResolvedValue(0)

    const res = await request(app).get('/1/members')

    expect(res.status).toBe(200)
    expect(mocks.prisma.studyGroupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: 1,
          status: 'active',
        }),
      }),
    )
  })

  it('accepts username-based invites', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockImplementation(({ where }) => {
      if (where?.groupId_userId?.userId === 42) {
        return Promise.resolve({
          id: 20,
          groupId: 1,
          userId: 42,
          role: 'moderator',
          status: 'active',
          joinedAt: new Date('2026-04-07T09:00:00Z'),
        })
      }

      return Promise.resolve(null)
    })
    mocks.prisma.studyGroupMember.create.mockResolvedValue({
      id: 45,
      groupId: 1,
      userId: 99,
      role: 'member',
      status: 'invited',
      joinedAt: new Date('2026-04-07T13:00:00Z'),
    })

    const res = await request(app).post('/1/invite').send({ username: 'alice' })

    expect(res.status).toBe(201)
    expect(res.body.userId).toBe(99)
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'alice' },
    })
    expect(mocks.prisma.studyGroupMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 99, status: 'invited' }),
      }),
    )
  })
})
