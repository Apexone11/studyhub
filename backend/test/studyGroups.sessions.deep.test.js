/**
 * studyGroups.sessions.deep.test.js — Deep coverage for sessions endpoints.
 *
 * Targets: GET/POST /:id/sessions, PATCH/DELETE /:id/sessions/:sessionId,
 * POST /:id/sessions/:sessionId/rsvp.
 * Covers: title/desc validation, scheduledAt parsing, durationMins range,
 * recurring enum (A13), status enum (A13), RSVP states, achievement event
 * emission (GROUP_SESSION_HOST), notification fan-out, A12.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const sessionsPath = require.resolve('../src/modules/studyGroups/studyGroups.sessions.routes')

const mocks = vi.hoisted(() => {
  const state = { userId: 42, role: 'student' }
  const prisma = {
    groupSession: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    groupSessionRsvp: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    studyGroupMember: { findUnique: vi.fn(), findMany: vi.fn() },
    studyGroup: { findUnique: vi.fn() },
  }
  return {
    state,
    prisma,
    notify: { createNotifications: vi.fn().mockResolvedValue(undefined) },
    achievements: {
      emitAchievementEvent: vi.fn(),
      EVENT_KINDS: { GROUP_SESSION_HOST: 'group_session_host' },
    },
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
      },
    ],
    [require.resolve('../src/lib/notify'), mocks.notify],
    [require.resolve('../src/modules/achievements'), mocks.achievements],
  ])
  Module._load = function patched(reqId, parent, isMain) {
    const resolved = Module._resolveFilename(reqId, parent, isMain)
    if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    return originalLoad.apply(this, arguments)
  }
  delete require.cache[sessionsPath]
  const routerModule = require(sessionsPath)
  app = express()
  app.use(express.json())
  app.use('/groups/:id/sessions', routerModule.default || routerModule)
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[sessionsPath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.userId = 42
  mocks.state.role = 'student'
  mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
    id: 9,
    role: 'admin',
    status: 'active',
    userId: 42,
    groupId: 1,
  })
  mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])
  mocks.prisma.studyGroup.findUnique.mockResolvedValue({ id: 1, name: 'Test Group' })
  mocks.prisma.groupSession.create.mockImplementation(async ({ data }) => ({
    id: 55,
    ...data,
    status: 'upcoming',
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
  mocks.prisma.groupSession.findMany.mockResolvedValue([])
  mocks.prisma.groupSession.count.mockResolvedValue(0)
})

describe('Sessions: GET /', () => {
  it('returns paginated list for active member', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    mocks.prisma.groupSession.findMany.mockResolvedValue([
      {
        id: 1,
        groupId: 1,
        title: 'Study Jam',
        description: '',
        location: 'Library',
        scheduledAt: new Date(),
        durationMins: 60,
        recurring: null,
        status: 'upcoming',
        rsvps: [
          { status: 'going', userId: 42 },
          { status: 'maybe', userId: 99 },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    mocks.prisma.groupSession.count.mockResolvedValue(1)
    const res = await request(app).get('/groups/1/sessions')
    expect(res.status).toBe(200)
    expect(res.body.sessions[0].rsvpCount).toBe(1)
    expect(res.body.sessions[0].rsvpMaybeCount).toBe(1)
    expect(res.body.sessions[0].userRsvpStatus).toBe('going')
  })

  it('returns 404 when caller is not a member', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/groups/1/sessions')
    expect(res.status).toBe(404)
  })

  it('A12: rejects non-numeric group id', async () => {
    const res = await request(app).get('/groups/foo/sessions')
    expect(res.status).toBe(400)
  })
})

describe('Sessions: POST /', () => {
  it('mod can create session, fires achievement + fan-out notification', async () => {
    mocks.prisma.studyGroupMember.findMany.mockResolvedValue([{ userId: 99 }])
    const future = new Date(Date.now() + 86400000).toISOString()
    const res = await request(app).post('/groups/1/sessions').send({
      title: 'Algo Crunch',
      scheduledAt: future,
      durationMins: 90,
    })
    expect(res.status).toBe(201)
    expect(mocks.achievements.emitAchievementEvent).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'group_session_host',
      expect.objectContaining({ groupId: 1 }),
    )
    expect(mocks.notify.createNotifications).toHaveBeenCalled()
  })

  it('regular member cannot create (403)', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).post('/groups/1/sessions').send({
      title: 't',
      scheduledAt: new Date().toISOString(),
    })
    expect(res.status).toBe(403)
  })

  it('rejects missing scheduledAt (400)', async () => {
    const res = await request(app).post('/groups/1/sessions').send({ title: 't' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/scheduledAt/i)
  })

  it('rejects invalid scheduledAt string', async () => {
    const res = await request(app).post('/groups/1/sessions').send({
      title: 't',
      scheduledAt: 'not-a-date',
    })
    expect(res.status).toBe(400)
  })

  it('rejects durationMins out of 1-1440 range', async () => {
    const res = await request(app).post('/groups/1/sessions').send({
      title: 't',
      scheduledAt: new Date().toISOString(),
      durationMins: 5000,
    })
    expect(res.status).toBe(400)
  })

  it('rejects invalid recurring value (A13 enum)', async () => {
    const res = await request(app).post('/groups/1/sessions').send({
      title: 't',
      scheduledAt: new Date().toISOString(),
      recurring: 'forever',
    })
    expect(res.status).toBe(400)
  })

  it('accepts recurring=weekly as a valid enum value', async () => {
    const res = await request(app).post('/groups/1/sessions').send({
      title: 't',
      scheduledAt: new Date().toISOString(),
      recurring: 'weekly',
    })
    expect(res.status).toBe(201)
  })

  it('accepts recurring=biweekly as a valid enum value', async () => {
    const res = await request(app).post('/groups/1/sessions').send({
      title: 't',
      scheduledAt: new Date().toISOString(),
      recurring: 'biweekly',
    })
    expect(res.status).toBe(201)
  })

  it('rejects empty title (400)', async () => {
    const res = await request(app).post('/groups/1/sessions').send({
      title: '',
      scheduledAt: new Date().toISOString(),
    })
    expect(res.status).toBe(400)
  })

  it('rejects description >2000 chars', async () => {
    const res = await request(app)
      .post('/groups/1/sessions')
      .send({
        title: 't',
        description: 'x'.repeat(2001),
        scheduledAt: new Date().toISOString(),
      })
    expect(res.status).toBe(400)
  })
})

describe('Sessions: PATCH /:sessionId', () => {
  beforeEach(() => {
    mocks.prisma.groupSession.findUnique.mockResolvedValue({
      id: 55,
      groupId: 1,
      title: 'old',
      description: '',
      location: '',
      scheduledAt: new Date(),
      durationMins: 60,
      recurring: null,
      status: 'upcoming',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    mocks.prisma.groupSession.update.mockImplementation(async ({ data }) => ({
      id: 55,
      groupId: 1,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  })

  it('mod can update title', async () => {
    const res = await request(app).patch('/groups/1/sessions/55').send({ title: 'new' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('new')
  })

  it('rejects invalid status enum (A13)', async () => {
    const res = await request(app).patch('/groups/1/sessions/55').send({ status: 'whatever' })
    expect(res.status).toBe(400)
  })

  it('accepts status=cancelled', async () => {
    const res = await request(app).patch('/groups/1/sessions/55').send({ status: 'cancelled' })
    expect(res.status).toBe(200)
  })

  it('A12: rejects non-numeric sessionId', async () => {
    const res = await request(app).patch('/groups/1/sessions/notanid').send({ title: 'x' })
    expect(res.status).toBe(400)
  })

  it('returns 404 for sessions outside this group', async () => {
    mocks.prisma.groupSession.findUnique.mockResolvedValue({
      id: 55,
      groupId: 999,
      title: 'other',
      scheduledAt: new Date(),
    })
    const res = await request(app).patch('/groups/1/sessions/55').send({ title: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('Sessions: POST /:sessionId/rsvp', () => {
  beforeEach(() => {
    mocks.prisma.groupSession.findUnique.mockResolvedValue({
      id: 55,
      groupId: 1,
      title: 't',
      scheduledAt: new Date(),
    })
    mocks.prisma.groupSessionRsvp.upsert.mockImplementation(async ({ create }) => ({
      id: 1,
      ...create,
      createdAt: new Date(),
    }))
  })

  it('member can RSVP going', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).post('/groups/1/sessions/55/rsvp').send({ status: 'going' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('going')
  })

  it('member can RSVP maybe', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).post('/groups/1/sessions/55/rsvp').send({ status: 'maybe' })
    expect(res.status).toBe(200)
  })

  it('member can RSVP not_going', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).post('/groups/1/sessions/55/rsvp').send({ status: 'not_going' })
    expect(res.status).toBe(200)
  })

  it('rejects invalid RSVP status (A13)', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue({
      id: 9,
      role: 'member',
      status: 'active',
      userId: 42,
      groupId: 1,
    })
    const res = await request(app).post('/groups/1/sessions/55/rsvp').send({ status: 'unsure' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when not a member', async () => {
    mocks.prisma.studyGroupMember.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/groups/1/sessions/55/rsvp').send({ status: 'going' })
    expect(res.status).toBe(404)
  })
})
