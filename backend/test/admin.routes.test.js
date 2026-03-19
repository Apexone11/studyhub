import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const adminRoutePath = require.resolve('../src/routes/admin')

const mocks = vi.hoisted(() => {
  const state = { role: 'student' }
  const prisma = {
    user: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    studySheet: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    comment: {
      count: vi.fn(),
    },
    requestedCourse: {
      count: vi.fn(),
    },
    note: {
      count: vi.fn(),
    },
    userFollow: {
      count: vi.fn(),
    },
    reaction: {
      count: vi.fn(),
    },
    emailSuppression: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    emailSuppressionAudit: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    state,
    prisma,
    auth: vi.fn((req, _res, next) => {
      req.user = { userId: 42, username: 'studyhub_owner', role: state.role }
      next()
    }),
    sentry: {
      captureError: vi.fn(),
    },
    deleteUserAccount: vi.fn(),
    htmlSecurity: {
      validateHtmlForSubmission: vi.fn(() => ({ ok: true, issues: [] })),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/deleteUserAccount'), { deleteUserAccount: mocks.deleteUserAccount }],
  [require.resolve('../src/lib/htmlSecurity'), mocks.htmlSecurity],
])

const originalModuleLoad = Module._load

let app

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(requestId, parent, isMain)
    const mockedModule = mockTargets.get(resolvedRequest)

    if (mockedModule) {
      return mockedModule
    }

    return originalModuleLoad.apply(this, arguments)
  }

  delete require.cache[adminRoutePath]
  const adminRouterModule = require(adminRoutePath)
  const adminRouter = adminRouterModule.default || adminRouterModule

  app = express()
  app.use(express.json())
  app.use('/', adminRouter)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[adminRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()

  mocks.state.role = 'student'
  mocks.prisma.user.findUnique.mockImplementation(async () => ({
    id: 42,
    role: mocks.state.role,
  }))
  mocks.prisma.user.count.mockResolvedValue(36)
  mocks.prisma.studySheet.count.mockResolvedValue(19)
  mocks.prisma.studySheet.aggregate.mockResolvedValue({ _sum: { stars: 78 } })
  mocks.prisma.comment.count.mockResolvedValue(14)
  mocks.prisma.requestedCourse.count.mockResolvedValue(4)
  mocks.prisma.note.count.mockResolvedValue(0)
  mocks.prisma.userFollow.count.mockResolvedValue(28)
  mocks.prisma.reaction.count.mockResolvedValue(4)

  mocks.prisma.emailSuppression.count.mockResolvedValue(1)
  mocks.prisma.emailSuppression.findMany.mockResolvedValue([
    {
      id: 7,
      email: 'suppressed_user@studyhub.test',
      active: true,
      reason: 'bounced',
      provider: 'resend',
      sourceEventType: 'email.bounced',
      sourceEventId: 'svix:msg_abc',
      sourceMessageId: 'email_123',
      details: null,
      firstSuppressedAt: new Date('2026-03-17T20:05:00.000Z'),
      lastSuppressedAt: new Date('2026-03-17T20:05:00.000Z'),
      createdAt: new Date('2026-03-17T20:05:00.000Z'),
      updatedAt: new Date('2026-03-17T20:05:00.000Z'),
    },
  ])
  mocks.prisma.emailSuppression.findUnique.mockResolvedValue({
    id: 7,
    email: 'suppressed_user@studyhub.test',
    active: true,
    reason: 'bounced',
    provider: 'resend',
    sourceEventType: 'email.bounced',
    sourceEventId: 'svix:msg_abc',
    sourceMessageId: 'email_123',
  })
  mocks.prisma.emailSuppression.update.mockResolvedValue({
    id: 7,
    email: 'suppressed_user@studyhub.test',
    active: false,
    reason: 'bounced',
    provider: 'resend',
    sourceEventType: 'email.bounced',
    sourceEventId: 'svix:msg_abc',
    sourceMessageId: 'email_123',
  })

  mocks.prisma.emailSuppressionAudit.create.mockResolvedValue({ id: 31 })
  mocks.prisma.emailSuppressionAudit.count.mockResolvedValue(1)
  mocks.prisma.emailSuppressionAudit.findMany.mockResolvedValue([
    {
      id: 31,
      suppressionId: 7,
      action: 'manual-unsuppress',
      reason: 'Mailbox recovered and confirmed by support.',
      context: {
        previousReason: 'bounced',
      },
      createdAt: new Date('2026-03-17T21:00:00.000Z'),
      performedBy: {
        id: 42,
        username: 'studyhub_owner',
      },
    },
  ])

  mocks.prisma.$transaction.mockImplementation(async (operation) => operation(mocks.prisma))
})

describe('admin routes', () => {
  it('returns a FORBIDDEN envelope for non-admin users', async () => {
    const response = await request(app).get('/stats')

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      error: 'Admin access required.',
      code: 'FORBIDDEN',
    })
    expect(mocks.prisma.user.count).not.toHaveBeenCalled()
  })

  it('still returns admin stats for admins without 2FA enabled', async () => {
    mocks.state.role = 'admin'

    const response = await request(app).get('/stats')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      totalUsers: 36,
      totalSheets: 19,
      totalComments: 14,
      flaggedRequests: 4,
    })
    expect(mocks.prisma.user.count).toHaveBeenCalled()
  })

  it('still returns admin stats for authenticated admins', async () => {
    mocks.state.role = 'admin'

    const response = await request(app).get('/stats')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      totalUsers: 36,
      totalSheets: 19,
      totalComments: 14,
      flaggedRequests: 4,
      totalStars: 78,
      totalNotes: 0,
      totalFollows: 28,
      totalReactions: 4,
    })
    expect(mocks.sentry.captureError).not.toHaveBeenCalled()
  })

  it('lists active email suppressions for admins', async () => {
    mocks.state.role = 'admin'

    const response = await request(app).get('/email-suppressions?status=active&page=1')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      total: 1,
      page: 1,
      status: 'active',
    })
    expect(response.body.suppressions).toHaveLength(1)
    expect(mocks.prisma.emailSuppression.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true },
    }))
  })

  it('unsuppresses a recipient and records an audit entry', async () => {
    mocks.state.role = 'admin'

    const response = await request(app)
      .patch('/email-suppressions/7/unsuppress')
      .send({ reason: 'Mailbox recovered and confirmed by support.' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: 'Recipient unsuppressed successfully.',
      suppression: {
        id: 7,
        active: false,
      },
    })

    expect(mocks.prisma.emailSuppression.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { active: false },
    })

    expect(mocks.prisma.emailSuppressionAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        suppressionId: 7,
        action: 'manual-unsuppress',
        reason: 'Mailbox recovered and confirmed by support.',
        performedByUserId: 42,
      }),
    })
  })

  it('rejects unsuppress requests without a meaningful reason', async () => {
    mocks.state.role = 'admin'

    const response = await request(app)
      .patch('/email-suppressions/7/unsuppress')
      .send({ reason: 'short' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      error: 'Provide an unsuppress reason with at least 8 characters.',
    })
    expect(mocks.prisma.emailSuppression.update).not.toHaveBeenCalled()
    expect(mocks.prisma.emailSuppressionAudit.create).not.toHaveBeenCalled()
  })

  it('returns suppression audit history for admins', async () => {
    mocks.state.role = 'admin'

    const response = await request(app).get('/email-suppressions/7/audit?page=1')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      suppression: {
        id: 7,
        email: 'suppressed_user@studyhub.test',
      },
      total: 1,
      page: 1,
    })
    expect(response.body.entries).toHaveLength(1)
    expect(mocks.prisma.emailSuppressionAudit.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { suppressionId: 7 },
    }))
  })
})
