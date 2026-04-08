import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const adminRoutePath = require.resolve('../src/modules/admin')

const mocks = vi.hoisted(() => {
  const state = { role: 'student' }
  const prisma = {
    user: {
      count: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
    },
    studySheet: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    feedPost: {
      count: vi.fn(),
    },
    feedPostComment: {
      count: vi.fn(),
    },
    starredSheet: {
      count: vi.fn(),
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
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    moderationCase: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    strike: {
      count: vi.fn(),
    },
    appeal: {
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
      validateHtmlForRuntime: vi.fn(() => ({ ok: true, issues: [] })),
      classifyHtmlRisk: vi.fn(() => ({ tier: 0, reasons: [] })),
      RISK_TIER: { CLEAN: 0, LOW: 1, MEDIUM: 2, HIGH: 3 },
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/middleware/auth'), mocks.auth],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/deleteUserAccount'), { deleteUserAccount: mocks.deleteUserAccount }],
  [require.resolve('../src/lib/html/htmlSecurity'), mocks.htmlSecurity],
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
  const adminRouterModule = require('../src/modules/admin')
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
  mocks.prisma.user.groupBy.mockResolvedValue([])
  mocks.prisma.user.count.mockResolvedValue(36)
  mocks.prisma.studySheet.count.mockResolvedValue(19)
  mocks.prisma.studySheet.aggregate.mockResolvedValue({ _sum: { stars: 78 } })
  mocks.prisma.comment.count.mockResolvedValue(14)
  mocks.prisma.feedPostComment.count.mockResolvedValue(9)
  mocks.prisma.starredSheet.count.mockResolvedValue(11)
  mocks.prisma.requestedCourse.count.mockResolvedValue(4)
  mocks.prisma.note.count.mockResolvedValue(0)
  mocks.prisma.userFollow.count.mockResolvedValue(28)
  mocks.prisma.reaction.count.mockResolvedValue(4)
  mocks.prisma.auditLog.findMany.mockResolvedValue([])
  mocks.prisma.auditLog.count.mockResolvedValue(0)
  mocks.prisma.feedPost.count.mockResolvedValue(6)
  mocks.prisma.moderationCase.count.mockResolvedValue(2)
  mocks.prisma.strike.count.mockResolvedValue(1)
  mocks.prisma.appeal.count.mockResolvedValue(3)
  mocks.prisma.moderationCase.findMany.mockResolvedValue([])

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

  it('uses req.user.userId (not req.user.id) for reviewedById when reviewing sheets', async () => {
    mocks.state.role = 'admin'

    mocks.prisma.studySheet.findUnique.mockResolvedValue({
      id: 100,
      status: 'pending_review',
      contentFormat: 'markdown',
      content: '# Hello',
      htmlScanFindings: [],
    })
    mocks.prisma.studySheet.update.mockResolvedValue({
      id: 100,
      status: 'published',
      reviewedById: 42,
      author: { id: 10, username: 'sheet_author' },
      course: null,
      reviewedBy: { id: 42, username: 'studyhub_owner' },
    })

    const response = await request(app)
      .patch('/sheets/100/review')
      .send({ action: 'approve' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      message: 'Sheet approved and published.',
    })

    // The critical assertion: reviewedById must use req.user.userId (42),
    // not req.user.id (which would be undefined)
    expect(mocks.prisma.studySheet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewedById: 42,
          status: 'published',
        }),
      }),
    )
  })

  it('returns numeric role counts for /analytics/user-roles', async () => {
    mocks.state.role = 'admin'
    mocks.prisma.user.groupBy.mockResolvedValue([
      { role: 'admin', _count: { _all: 2 } },
      { role: 'student', _count: { _all: 34 } },
    ])

    const response = await request(app).get('/analytics/user-roles')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      roles: [
        { role: 'admin', count: 2 },
        { role: 'student', count: 34 },
      ],
    })
  })

  it('uses active user follows when building /analytics/engagement-totals', async () => {
    mocks.state.role = 'admin'
    mocks.prisma.reaction.count.mockResolvedValue(12)
    mocks.prisma.feedPostComment.count.mockResolvedValue(7)
    mocks.prisma.starredSheet.count.mockResolvedValue(19)
    mocks.prisma.userFollow.count.mockResolvedValue(5)

    const response = await request(app).get('/analytics/engagement-totals?period=30d')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      totals: {
        likes: 12,
        comments: 7,
        stars: 19,
        follows: 5,
      },
    })
    expect(mocks.prisma.reaction.count).toHaveBeenCalledWith()
    expect(mocks.prisma.userFollow.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        createdAt: expect.any(Object),
        status: 'active',
      }),
    })
  })

  it('recursively redacts nested audit export details', async () => {
    mocks.state.role = 'admin'
    mocks.prisma.user.findUnique
      .mockResolvedValueOnce({ id: 42, role: 'admin' })
      .mockResolvedValueOnce({
        id: 7,
        username: 'audit_target',
        email: 'audit_target@studyhub.test',
      })
    mocks.prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 91,
        event: 'auth.login',
        resource: 'session',
        resourceId: 'session_123',
        details: {
          email: 'nested@studyhub.test',
          request: {
            token: 'secret-token',
            profile: {
              email: 'person@example.com',
            },
          },
          attempts: [{ refreshToken: 'refresh-secret' }],
        },
        route: '/api/auth/login',
        method: 'POST',
        ipAddress: '192.168.1.45',
        createdAt: new Date('2026-04-05T12:00:00.000Z'),
      },
    ])

    const response = await request(app).get('/audit-log/export?userId=7')

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      id: 7,
      username: 'audit_target',
      email: 'a***@studyhub.test',
    })
    expect(response.body.entries).toHaveLength(1)
    expect(response.body.entries[0]).toMatchObject({
      resource: 'session',
      resourceId: 'session_123',
      ipAddress: '192.168.x.x',
      details: {
        email: 'n***@studyhub.test',
        request: {
          token: '[REDACTED]',
          profile: {
            email: 'p***@example.com',
          },
        },
        attempts: [
          { refreshToken: '[REDACTED]' },
        ],
      },
    })
  })
})
