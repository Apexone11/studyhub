import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const studyGroupsRoutePath = require.resolve('../src/modules/studyGroups')

/* ═══════════════════════════════════════════════════════════════════════════
 * Mock setup — mirrors the Module._load patching pattern from existing tests
 * ═══════════════════════════════════════════════════════════════════════════ */
const mocks = vi.hoisted(() => {
  const prisma = {
    studyGroup: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    studyGroupMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    studyGroupResource: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    groupResource: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    groupSession: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    groupSessionRsvp: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    studyGroupSession: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    studyGroupSessionRsvp: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    groupDiscussionPost: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    groupDiscussionReply: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    course: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
  }

  return {
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'test_user', role: 'student' }
      next()
    }),
    readLimiter: vi.fn((_req, _res, next) => next()),
    writeLimiter: vi.fn((_req, _res, next) => next()),
    groupJoinLimiter: vi.fn((_req, _res, next) => next()),
    groupMediaUploadLimiter: vi.fn((_req, _res, next) => next()),
    groupReportLimiter: vi.fn((_req, _res, next) => next()),
    groupAppealLimiter: vi.fn((_req, _res, next) => next()),
    getBlockedUserIds: vi.fn(async () => []),
    sentry: { captureError: vi.fn() },
    socketio: {
      getIO: vi.fn(() => ({ to: vi.fn().mockReturnThis(), emit: vi.fn() })),
    },
    notify: {
      createNotification: vi.fn(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [
    require.resolve('../src/lib/rateLimiters'),
    {
      readLimiter: mocks.readLimiter,
      writeLimiter: mocks.writeLimiter,
      groupJoinLimiter: mocks.groupJoinLimiter,
      groupMediaUploadLimiter: mocks.groupMediaUploadLimiter,
      groupReportLimiter: mocks.groupReportLimiter,
      groupAppealLimiter: mocks.groupAppealLimiter,
    },
  ],
  [
    require.resolve('../src/lib/social/blockFilter'),
    {
      getBlockedUserIds: mocks.getBlockedUserIds,
    },
  ],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/socketio'), mocks.socketio],
  [require.resolve('../src/lib/notify'), mocks.notify],
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

  delete require.cache[studyGroupsRoutePath]
  const studyGroupsRouterModule = require(studyGroupsRoutePath)
  const studyGroupsRouter = studyGroupsRouterModule.default || studyGroupsRouterModule

  app = express()
  app.use(express.json())
  app.use('/', studyGroupsRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[studyGroupsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
})

/* ═══════════════════════════════════════════════════════════════════════════
 * GROUP CRUD — 6 tests
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('group CRUD', () => {
  describe('GET /', () => {
    it('returns group list with pagination', async () => {
      mocks.prisma.studyGroup.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Math Study Group',
          description: 'Algebra and geometry',
          privacy: 'public',
          courseId: 10,
          maxMembers: 50,
          createdById: 1,
          avatarUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
      mocks.prisma.studyGroup.count.mockResolvedValue(1)
      mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])
      mocks.prisma.studyGroupMember.count.mockResolvedValue(5)
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue(null)

      const res = await request(app).get('/?limit=20&offset=0')

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('groups')
      expect(Array.isArray(res.body.groups)).toBe(true)
      expect(res.body).toHaveProperty('total')
      expect(res.body).toHaveProperty('limit')
      expect(res.body).toHaveProperty('offset')
    })
  })

  describe('POST /', () => {
    it('creates a group with valid data', async () => {
      const newGroup = {
        id: 5,
        name: 'Physics Study Group',
        description: 'Advanced mechanics',
        privacy: 'public',
        courseId: 11,
        maxMembers: 30,
        createdById: 42,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mocks.prisma.course.findUnique.mockResolvedValue({ id: 11, name: 'Physics 101' })
      mocks.prisma.studyGroup.create.mockResolvedValue(newGroup)
      mocks.prisma.studyGroupMember.create.mockResolvedValue({
        id: 1,
        groupId: 5,
        userId: 42,
        role: 'admin',
        status: 'active',
        joinedAt: new Date(),
      })
      mocks.prisma.studyGroupMember.count.mockResolvedValue(1)
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
        id: 1,
        groupId: 5,
        userId: 42,
        role: 'admin',
        status: 'active',
        joinedAt: new Date(),
      })

      const res = await request(app).post('/').send({
        name: 'Physics Study Group',
        description: 'Advanced mechanics',
        courseId: 11,
        privacy: 'public',
      })

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('id')
      expect(res.body.name).toBe('Physics Study Group')
      expect(res.body.description).toBe('Advanced mechanics')
    })

    it('rejects group with empty name (400)', async () => {
      const res = await request(app).post('/').send({
        name: '',
        description: 'Some description',
      })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/name/i)
    })
  })

  describe('GET /:id', () => {
    it('returns group details', async () => {
      const group = {
        id: 1,
        name: 'Study Group A',
        description: 'Test group',
        privacy: 'public',
        courseId: 10,
        maxMembers: 50,
        createdById: 99,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mocks.prisma.studyGroup.findUnique.mockResolvedValue(group)
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue(null)
      mocks.prisma.studyGroupMember.count.mockResolvedValue(10)

      const res = await request(app).get('/1')

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(1)
      expect(res.body.name).toBe('Study Group A')
      expect(res.body).toHaveProperty('memberCount')
    })
  })

  describe('PATCH /:id', () => {
    it('updates group (admin only)', async () => {
      const updatedGroup = {
        id: 1,
        name: 'Updated Group',
        description: 'Updated description',
        privacy: 'public',
        courseId: 10,
        maxMembers: 50,
        createdById: 42,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mocks.prisma.studyGroup.findUnique.mockResolvedValue(updatedGroup)
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
        groupId: 1,
        userId: 42,
        role: 'admin',
        status: 'active',
      })
      mocks.prisma.studyGroup.update.mockResolvedValue(updatedGroup)
      mocks.prisma.studyGroupMember.count.mockResolvedValue(15)

      const res = await request(app).patch('/1').send({
        name: 'Updated Group',
        description: 'Updated description',
      })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Updated Group')
    })
  })

  describe('DELETE /:id', () => {
    it('deletes group (creator only, 403 for non-creator)', async () => {
      const group = {
        id: 1,
        createdById: 42,
        name: 'Group to Delete',
        privacy: 'public',
        courseId: 10,
        maxMembers: 50,
        description: 'test',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mocks.prisma.studyGroup.findUnique.mockResolvedValue(group)
      mocks.prisma.studyGroupMember.deleteMany.mockResolvedValue({ count: 10 })
      mocks.prisma.studyGroup.update.mockResolvedValue(group)

      const res = await request(app).delete('/1')

      expect(res.status).toBe(204)
      expect(mocks.prisma.studyGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            moderationStatus: 'deleted',
            deletedById: 42,
          }),
        }),
      )
    })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * MEMBERSHIP — 5 tests
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('membership', () => {
  describe('POST /:id/join', () => {
    it('joins a public group', async () => {
      mocks.prisma.studyGroup.findUnique.mockResolvedValue({
        id: 1,
        name: 'Public Group',
        privacy: 'public',
        maxMembers: 50,
        description: 'test',
        courseId: 10,
        createdById: 99,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue(null)
      mocks.prisma.studyGroupMember.count.mockResolvedValue(10)
      mocks.prisma.studyGroupMember.create.mockResolvedValue({
        id: 100,
        groupId: 1,
        userId: 42,
        role: 'member',
        status: 'active',
        joinedAt: new Date(),
      })

      const res = await request(app).post('/1/join').send({})

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({
        groupId: 1,
        userId: 42,
        role: 'member',
        status: 'active',
      })
    })

    it('requests to join private group (status: pending)', async () => {
      mocks.prisma.studyGroup.findUnique.mockResolvedValue({
        id: 2,
        name: 'Private Group',
        privacy: 'private',
        maxMembers: 20,
        description: 'test',
        courseId: 10,
        createdById: 99,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue(null)
      mocks.prisma.studyGroupMember.count.mockResolvedValue(5)
      mocks.prisma.studyGroupMember.create.mockResolvedValue({
        id: 101,
        groupId: 2,
        userId: 42,
        role: 'member',
        status: 'pending',
        joinedAt: new Date(),
      })

      const res = await request(app).post('/2/join').send({})

      expect(res.status).toBe(201)
      expect(res.body.status).toBe('pending')
    })
  })

  describe('POST /:id/leave', () => {
    it('leaves a group', async () => {
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
        id: 100,
        groupId: 1,
        userId: 42,
        role: 'member',
        status: 'active',
      })
      mocks.prisma.studyGroupMember.delete.mockResolvedValue({ id: 100 })

      const res = await request(app).post('/1/leave').send({})

      expect(res.status).toBe(204)
      expect(mocks.prisma.studyGroupMember.delete).toHaveBeenCalled()
    })
  })

  describe('POST /:id/invite', () => {
    it('invites user (admin only)', async () => {
      mocks.prisma.studyGroup.findUnique.mockResolvedValue({
        id: 1,
        name: 'Group',
        privacy: 'public',
        maxMembers: 50,
        description: 'test',
        courseId: 10,
        createdById: 99,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
        groupId: 1,
        userId: 42,
        role: 'admin',
        status: 'active',
      })
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 99,
        username: 'invited_user',
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce(null)
      mocks.prisma.studyGroupMember.create.mockResolvedValue({
        id: 102,
        groupId: 1,
        userId: 99,
        role: 'member',
        status: 'pending',
        joinedAt: new Date(),
      })

      const res = await request(app).post('/1/invite').send({ userId: 99 })

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('id')
    })
  })

  describe('DELETE /:id/members/:userId', () => {
    it('removes member (admin only, 403 for regular member)', async () => {
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
        groupId: 1,
        userId: 42,
        role: 'admin',
        status: 'active',
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValueOnce({
        id: 50,
        groupId: 1,
        userId: 99,
        role: 'member',
        status: 'active',
      })
      mocks.prisma.studyGroupMember.delete.mockResolvedValue({ id: 50 })

      const res = await request(app).delete('/1/members/99')

      expect(res.status).toBe(204)
      expect(mocks.prisma.studyGroupMember.delete).toHaveBeenCalled()
    })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * RESOURCES — 3 tests
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('resources', () => {
  describe('GET /:id/resources', () => {
    it('lists resources', async () => {
      mocks.prisma.studyGroup.findUnique.mockResolvedValue({
        id: 1,
        name: 'Study Group',
        privacy: 'public',
        maxMembers: 50,
        description: 'test',
        courseId: 10,
        createdById: 99,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
        groupId: 1,
        userId: 42,
        role: 'member',
        status: 'active',
      })
      mocks.prisma.groupResource.findMany.mockResolvedValue([
        {
          id: 1,
          groupId: 1,
          userId: 42,
          title: 'Study Notes',
          resourceType: 'link',
          resourceUrl: 'https://example.com/notes',
          description: 'Comprehensive notes',
          pinned: false,
          user: { id: 42, username: 'test_user', avatarUrl: null },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
      mocks.prisma.groupResource.count.mockResolvedValue(1)

      const res = await request(app).get('/1/resources?limit=20&offset=0')

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('resources')
      expect(Array.isArray(res.body.resources)).toBe(true)
    })
  })

  describe('POST /:id/resources', () => {
    it('adds resource (member only)', async () => {
      mocks.prisma.studyGroup.findUnique.mockResolvedValue({
        id: 1,
        name: 'Study Group',
        privacy: 'public',
        maxMembers: 50,
        description: 'test',
        courseId: 10,
        createdById: 99,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
        groupId: 1,
        userId: 42,
        role: 'member',
        status: 'active',
      })
      mocks.prisma.groupResource.create.mockResolvedValue({
        id: 10,
        groupId: 1,
        userId: 42,
        title: 'New Resource',
        resourceType: 'link',
        resourceUrl: 'https://example.com/resource',
        description: 'Test resource',
        pinned: false,
        user: { id: 42, username: 'test_user', avatarUrl: null },
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const res = await request(app).post('/1/resources').send({
        title: 'New Resource',
        resourceUrl: 'https://example.com/resource',
        description: 'Test resource',
      })

      expect(res.status).toBe(201)
      expect(res.body.title).toBe('New Resource')
    })
  })

  describe('DELETE /:id/resources/:resourceId', () => {
    it('deletes own resource', async () => {
      mocks.prisma.groupResource.findUnique.mockResolvedValue({
        id: 10,
        groupId: 1,
        userId: 42,
        title: 'Resource to Delete',
        resourceType: 'link',
        resourceUrl: 'https://example.com/resource',
        description: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.groupResource.delete.mockResolvedValue({ id: 10 })

      const res = await request(app).delete('/1/resources/10')

      expect(res.status).toBe(204)
    })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * SESSIONS — 3 tests
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('sessions', () => {
  describe('GET /:id/sessions', () => {
    it('lists sessions', async () => {
      mocks.prisma.studyGroup.findUnique.mockResolvedValue({
        id: 1,
        name: 'Study Group',
        privacy: 'public',
        maxMembers: 50,
        description: 'test',
        courseId: 10,
        createdById: 99,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
        groupId: 1,
        userId: 42,
        role: 'member',
        status: 'active',
      })
      mocks.prisma.groupSession.findMany.mockResolvedValue([
        {
          id: 1,
          groupId: 1,
          title: 'Study Session',
          description: 'Group study',
          scheduledAt: new Date(),
          durationMins: 60,
          location: 'Library',
          recurring: false,
          status: 'scheduled',
          rsvps: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
      mocks.prisma.groupSession.count.mockResolvedValue(1)

      const res = await request(app).get('/1/sessions?limit=20&offset=0')

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('sessions')
      expect(Array.isArray(res.body.sessions)).toBe(true)
    })
  })

  describe('POST /:id/sessions', () => {
    it('creates session (admin/mod only)', async () => {
      const scheduledAt = new Date(Date.now() + 86400000)

      mocks.prisma.studyGroup.findUnique.mockResolvedValue({
        id: 1,
        name: 'Study Group',
        privacy: 'public',
        maxMembers: 50,
        description: 'test',
        courseId: 10,
        createdById: 99,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
        groupId: 1,
        userId: 42,
        role: 'admin',
        status: 'active',
      })
      mocks.prisma.groupSession.create.mockResolvedValue({
        id: 20,
        groupId: 1,
        title: 'Study Session',
        description: 'Group study',
        scheduledAt,
        durationMins: 60,
        location: 'Library',
        recurring: null,
        status: 'scheduled',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      // Mock member notification query
      mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])

      const res = await request(app).post('/1/sessions').send({
        title: 'Study Session',
        description: 'Group study',
        scheduledAt: scheduledAt.toISOString(),
        durationMins: 60,
        location: 'Library',
      })

      expect(res.status).toBe(201)
      expect(res.body.title).toBe('Study Session')
    })
  })

  describe('POST /:id/sessions/:sessionId/rsvp', () => {
    it('RSVPs to session', async () => {
      mocks.prisma.studyGroup.findUnique.mockResolvedValue({
        id: 1,
        name: 'Study Group',
        privacy: 'public',
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
        groupId: 1,
        userId: 42,
        role: 'member',
        status: 'active',
      })
      mocks.prisma.groupSession.findUnique.mockResolvedValue({
        id: 20,
        groupId: 1,
        title: 'Study Session',
        description: 'Group study',
        scheduledAt: new Date(),
        durationMins: 60,
        location: 'Library',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.groupSessionRsvp.upsert.mockResolvedValue({
        id: 200,
        sessionId: 20,
        userId: 42,
        status: 'going',
        createdAt: new Date(),
      })

      const res = await request(app).post('/1/sessions/20/rsvp').send({
        status: 'going',
      })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('going')
    })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * DISCUSSIONS — 3 tests
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('discussions', () => {
  describe('GET /:id/discussions', () => {
    it('lists discussion posts', async () => {
      mocks.prisma.studyGroup.findUnique.mockResolvedValue({
        id: 1,
        name: 'Study Group',
        privacy: 'public',
        maxMembers: 50,
        description: 'test',
        courseId: 10,
        createdById: 99,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
        groupId: 1,
        userId: 42,
        role: 'member',
        status: 'active',
      })
      mocks.prisma.groupDiscussionPost.findMany.mockResolvedValue([
        {
          id: 1,
          groupId: 1,
          userId: 42,
          author: { id: 42, username: 'test_user', avatarUrl: null },
          title: 'Question about calculus',
          content: 'Can someone explain derivatives?',
          type: 'question',
          pinned: false,
          resolved: false,
          replies: [],
          upvotes: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
      mocks.prisma.groupDiscussionPost.count.mockResolvedValue(1)

      const res = await request(app).get('/1/discussions?limit=20&offset=0')

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('posts')
      expect(Array.isArray(res.body.posts)).toBe(true)
    })
  })

  describe('POST /:id/discussions', () => {
    it('creates discussion post', async () => {
      mocks.prisma.studyGroup.findUnique.mockResolvedValue({
        id: 1,
        name: 'Study Group',
        privacy: 'public',
        maxMembers: 50,
        description: 'test',
        courseId: 10,
        createdById: 99,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
        groupId: 1,
        userId: 42,
        role: 'member',
        status: 'active',
      })
      mocks.prisma.groupDiscussionPost.create.mockResolvedValue({
        id: 100,
        groupId: 1,
        userId: 42,
        title: 'Question about math',
        content: 'How do I solve this?',
        type: 'question',
        pinned: false,
        resolved: false,
        author: { id: 42, username: 'test_user' },
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const res = await request(app).post('/1/discussions').send({
        title: 'Question about math',
        content: 'How do I solve this?',
        type: 'question',
      })

      expect(res.status).toBe(201)
      expect(res.body.title).toBe('Question about math')
      expect(res.body.type).toBe('question')
    })
  })

  describe('POST /:id/discussions/:postId/replies', () => {
    it('adds reply to post', async () => {
      mocks.prisma.groupDiscussionPost.findUnique.mockResolvedValue({
        id: 100,
        groupId: 1,
        userId: 99,
        title: 'Question about math',
        content: 'How do I solve this?',
        type: 'question',
        pinned: false,
        resolved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
        groupId: 1,
        userId: 42,
        role: 'member',
        status: 'active',
      })
      mocks.prisma.groupDiscussionReply.create.mockResolvedValue({
        id: 500,
        postId: 100,
        userId: 42,
        content: 'You need to factor it first',
        author: { id: 42, username: 'test_user' },
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const res = await request(app).post('/1/discussions/100/replies').send({
        content: 'You need to factor it first',
      })

      expect(res.status).toBe(201)
      expect(res.body.content).toBe('You need to factor it first')
      expect(res.body).toHaveProperty('postId')
    })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * INPUT VALIDATION — additional edge cases
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('input validation', () => {
  it('GET /:id returns 400 for non-integer id', async () => {
    const res = await request(app).get('/invalid-id')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid.*id/i)
  })

  it('PATCH /:id returns 400 for non-integer id', async () => {
    const res = await request(app).patch('/invalid-id').send({ name: 'test' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid.*id/i)
  })

  it('DELETE /:id returns 400 for non-integer id', async () => {
    const res = await request(app).delete('/invalid-id')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid.*id/i)
  })

  it('POST /:id/join returns 400 for non-integer id', async () => {
    const res = await request(app).post('/invalid-id/join').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid.*id/i)
  })

  it('POST /:id/leave returns 400 for non-integer id', async () => {
    const res = await request(app).post('/invalid-id/leave').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid.*id/i)
  })

  it('GET /:id/resources returns 400 for non-integer id', async () => {
    const res = await request(app).get('/invalid-id/resources')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid.*id/i)
  })

  it('POST /:id/resources returns 400 for non-integer id', async () => {
    const res = await request(app).post('/invalid-id/resources').send({
      title: 'test',
      url: 'https://example.com',
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid.*id/i)
  })

  it('GET /:id/sessions returns 400 for non-integer id', async () => {
    const res = await request(app).get('/invalid-id/sessions')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid.*id/i)
  })

  it('POST /:id/sessions returns 400 for non-integer id', async () => {
    const res = await request(app).post('/invalid-id/sessions').send({
      title: 'test',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid.*id/i)
  })

  it('GET /:id/discussions returns 400 for non-integer id', async () => {
    const res = await request(app).get('/invalid-id/discussions')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid.*id/i)
  })

  it('POST /:id/discussions returns 400 for non-integer id', async () => {
    const res = await request(app).post('/invalid-id/discussions').send({
      title: 'test',
      content: 'test content',
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid.*id/i)
  })
})
