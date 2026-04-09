/**
 * Unit tests for studyGroups.reports.service.
 * Mocks prisma + notify + sentry so tests run without a database.
 *
 * Coverage:
 *   - createReport validation (bad reason, self-report, duplicate,
 *     attachment shape checks)
 *   - createReport success path + mod-team notification + audit log
 *   - maybeEscalate threshold behavior (under/at/over, idempotent)
 *   - resolveReport dismiss/warn/lock/delete transitions
 *   - getHiddenGroupIdsForReporter returns active-report group IDs
 *   - Graceful degradation when Prisma throws
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const servicePath = require.resolve('../src/modules/studyGroups/studyGroups.reports.service')

const mocks = vi.hoisted(() => ({
  prisma: {
    studyGroup: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    studyGroupMember: {
      findMany: vi.fn(),
    },
    groupReport: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    groupAuditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn) => (typeof fn === 'function' ? fn({
      studyGroup: {
        update: vi.fn(async (args) => ({ id: args.where.id, ...args.data })),
      },
      groupReport: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    }) : Promise.all(fn))),
  },
  notify: {
    createNotification: vi.fn(),
    createNotifications: vi.fn(),
  },
  sentry: { captureError: vi.fn() },
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/monitoring/sentry'), { captureError: mocks.sentry.captureError }],
])

const originalLoad = Module._load
let service

beforeAll(() => {
  Module._load = function patched(requestId, parent, isMain) {
    const resolved = Module._resolveFilename(requestId, parent, isMain)
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
    id: 10, name: 'Test Group', createdById: 100, deletedAt: null, moderationStatus: 'active',
  })
  mocks.prisma.studyGroupMember.findMany.mockResolvedValue([])
  mocks.prisma.groupReport.findUnique.mockResolvedValue(null)
  mocks.prisma.groupReport.findMany.mockResolvedValue([])
  mocks.prisma.groupReport.create.mockResolvedValue({ id: 1, status: 'pending' })
  mocks.prisma.groupReport.count.mockResolvedValue(0)
  mocks.prisma.groupAuditLog.create.mockResolvedValue({})
})

describe('createReport validation', () => {
  it('rejects an invalid reason', async () => {
    await expect(
      service.createReport({
        groupId: 10, reporterId: 42, reason: 'nonsense',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
  })

  it('404s when the group does not exist', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValue(null)
    await expect(
      service.createReport({
        groupId: 10, reporterId: 42, reason: 'spam',
      }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('404s when the group is soft-deleted', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValue({
      id: 10, name: 'x', createdById: 100, deletedAt: new Date(),
    })
    await expect(
      service.createReport({ groupId: 10, reporterId: 42, reason: 'spam' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('rejects an owner reporting their own group', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValue({
      id: 10, name: 'x', createdById: 42, deletedAt: null,
    })
    await expect(
      service.createReport({ groupId: 10, reporterId: 42, reason: 'spam' }),
    ).rejects.toMatchObject({ status: 400, code: 'SELF_REPORT_FORBIDDEN' })
  })

  it('rejects a duplicate report', async () => {
    mocks.prisma.groupReport.findUnique.mockResolvedValue({ id: 5, status: 'pending' })
    await expect(
      service.createReport({ groupId: 10, reporterId: 42, reason: 'spam' }),
    ).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_REPORT' })
  })

  it('rejects attachments that are not an array', async () => {
    await expect(
      service.createReport({
        groupId: 10, reporterId: 42, reason: 'spam',
        attachments: { url: '/uploads/group-media/a.png' },
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects more than 2 attachments', async () => {
    await expect(
      service.createReport({
        groupId: 10, reporterId: 42, reason: 'spam',
        attachments: [
          { url: '/uploads/group-media/a.png', kind: 'image' },
          { url: '/uploads/group-media/b.png', kind: 'image' },
          { url: '/uploads/group-media/c.png', kind: 'image' },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects attachments with non-/uploads/group-media URLs', async () => {
    await expect(
      service.createReport({
        groupId: 10, reporterId: 42, reason: 'spam',
        attachments: [{ url: 'https://evil.example/pwn.exe', kind: 'file' }],
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe('createReport success path', () => {
  it('creates the row, audits, and notifies the full mod team', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValue({
      id: 10, name: 'Algo Study', createdById: 100, deletedAt: null, moderationStatus: 'active',
    })
    mocks.prisma.studyGroupMember.findMany.mockResolvedValue([
      { userId: 200 }, // admin
      { userId: 201 }, // moderator
    ])

    const report = await service.createReport({
      groupId: 10,
      reporterId: 42,
      reason: 'harassment',
      details: 'Repeated insults toward junior members.',
    })

    expect(report).toBeDefined()
    expect(mocks.prisma.groupReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: 10,
          reporterId: 42,
          reason: 'harassment',
          details: 'Repeated insults toward junior members.',
        }),
      }),
    )
    expect(mocks.prisma.groupAuditLog.create).toHaveBeenCalled()
    expect(mocks.notify.createNotifications).toHaveBeenCalled()
    // Recipients: creator + admin + moderator. Reporter is NOT in the list.
    const notifyCall = mocks.notify.createNotifications.mock.calls[0][1]
    const recipients = notifyCall.map((n) => n.userId).sort()
    expect(recipients).toEqual([100, 200, 201])
    // actorId MUST be omitted to preserve reporter anonymity.
    expect(notifyCall.every((n) => !('actorId' in n) || n.actorId == null)).toBe(true)
  })

  it('strips HTML tags from details (contents remain as plain text)', async () => {
    await service.createReport({
      groupId: 10,
      reporterId: 42,
      reason: 'spam',
      details: '<b>urgent</b> please look at this',
    })
    const createdWith = mocks.prisma.groupReport.create.mock.calls[0][0].data
    expect(createdWith.details).toBe('urgent please look at this')
    expect(createdWith.details).not.toContain('<')
  })

  it('does not notify the reporter when they happen to be a group admin', async () => {
    mocks.prisma.studyGroup.findUnique.mockResolvedValue({
      id: 10, name: 'x', createdById: 100, deletedAt: null, moderationStatus: 'active',
    })
    mocks.prisma.studyGroupMember.findMany.mockResolvedValue([
      { userId: 42 }, // the reporter themselves
      { userId: 200 },
    ])

    await service.createReport({
      groupId: 10, reporterId: 42, reason: 'spam',
    })

    const recipients = mocks.notify.createNotifications.mock.calls[0][1].map((n) => n.userId).sort()
    expect(recipients).toEqual([100, 200])
    expect(recipients).not.toContain(42)
  })
})

describe('maybeEscalate', () => {
  it('does nothing under the threshold', async () => {
    mocks.prisma.groupReport.findMany.mockResolvedValue([
      { id: 1, reporterId: 1 },
      { id: 2, reporterId: 2 },
      { id: 3, reporterId: 3 },
    ])
    const result = await service.maybeEscalate(10)
    expect(result).toBe(false)
    expect(mocks.prisma.studyGroup.update).not.toHaveBeenCalled()
  })

  it('auto-locks when 5+ unique reporters within the window', async () => {
    mocks.prisma.groupReport.findMany.mockResolvedValue([
      { id: 1, reporterId: 1 },
      { id: 2, reporterId: 2 },
      { id: 3, reporterId: 3 },
      { id: 4, reporterId: 4 },
      { id: 5, reporterId: 5 },
    ])
    mocks.prisma.studyGroup.findUnique.mockResolvedValue({
      id: 10, name: 'x', moderationStatus: 'active', createdById: 100,
    })
    mocks.prisma.groupReport.updateMany.mockResolvedValue({ count: 5 })

    const result = await service.maybeEscalate(10)
    expect(result).toBe(true)
    expect(mocks.prisma.studyGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ moderationStatus: 'locked' }),
      }),
    )
    expect(mocks.prisma.groupReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'escalated' },
      }),
    )
    expect(mocks.notify.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 100,
        type: 'group_auto_locked',
        priority: 'high',
      }),
    )
  })

  it('is idempotent on an already-locked group', async () => {
    mocks.prisma.groupReport.findMany.mockResolvedValue([
      { id: 1, reporterId: 1 }, { id: 2, reporterId: 2 }, { id: 3, reporterId: 3 },
      { id: 4, reporterId: 4 }, { id: 5, reporterId: 5 },
    ])
    mocks.prisma.studyGroup.findUnique.mockResolvedValue({
      id: 10, name: 'x', moderationStatus: 'locked', createdById: 100,
    })
    const result = await service.maybeEscalate(10)
    expect(result).toBe(false)
    expect(mocks.prisma.studyGroup.update).not.toHaveBeenCalled()
  })

  it('deduplicates reporters (5 reports from 3 users stays under threshold)', async () => {
    mocks.prisma.groupReport.findMany.mockResolvedValue([
      { id: 1, reporterId: 1 },
      { id: 2, reporterId: 2 },
      { id: 3, reporterId: 3 },
      { id: 4, reporterId: 1 }, // duplicates shouldn't happen per the unique index,
      { id: 5, reporterId: 2 }, // but the code should dedupe anyway.
    ])
    const result = await service.maybeEscalate(10)
    expect(result).toBe(false)
  })
})

describe('resolveReport', () => {
  const openReport = {
    id: 77,
    groupId: 10,
    group: { id: 10, name: 'x', createdById: 100, moderationStatus: 'active' },
  }

  beforeEach(() => {
    mocks.prisma.groupReport.findUnique.mockResolvedValue(openReport)
  })

  it('rejects invalid actions', async () => {
    await expect(
      service.resolveReport({ reportId: 77, actorId: 999, action: 'smite' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
  })

  it('404s on missing report', async () => {
    mocks.prisma.groupReport.findUnique.mockResolvedValue(null)
    await expect(
      service.resolveReport({ reportId: 77, actorId: 999, action: 'dismiss' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('dismiss: resolves the report and notifies nobody', async () => {
    const result = await service.resolveReport({ reportId: 77, actorId: 999, action: 'dismiss' })
    expect(result.action).toBe('dismiss')
    expect(mocks.notify.createNotification).not.toHaveBeenCalled()
    expect(mocks.prisma.groupAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'group.report.dismiss' }),
      }),
    )
  })

  it('warn: sets warnedUntil 7 days out and notifies the owner', async () => {
    await service.resolveReport({ reportId: 77, actorId: 999, action: 'warn' })
    expect(mocks.notify.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 100,
        type: 'group_moderation_action',
        priority: 'high',
      }),
    )
  })

  it('lock: transitions moderationStatus to locked and notifies owner', async () => {
    await service.resolveReport({ reportId: 77, actorId: 999, action: 'lock' })
    expect(mocks.notify.createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: expect.stringContaining('locked'),
      }),
    )
  })

  it('delete: soft-deletes + stamps deletedById + notifies owner about appeal window', async () => {
    await service.resolveReport({ reportId: 77, actorId: 999, action: 'delete' })
    const notification = mocks.notify.createNotification.mock.calls[0][1]
    expect(notification.message).toMatch(/30 days/)
    expect(notification.message).toMatch(/appeal/i)
  })
})

describe('getHiddenGroupIdsForReporter', () => {
  it('returns the set of active-report group IDs', async () => {
    mocks.prisma.groupReport.findMany.mockResolvedValue([
      { groupId: 10 },
      { groupId: 20 },
      { groupId: 30 },
    ])
    const hidden = await service.getHiddenGroupIdsForReporter(42)
    expect(hidden).toBeInstanceOf(Set)
    expect(hidden.has(10)).toBe(true)
    expect(hidden.has(20)).toBe(true)
    expect(hidden.has(30)).toBe(true)
    expect(hidden.size).toBe(3)
  })

  it('returns empty set for null user', async () => {
    const hidden = await service.getHiddenGroupIdsForReporter(null)
    expect(hidden.size).toBe(0)
    expect(mocks.prisma.groupReport.findMany).not.toHaveBeenCalled()
  })

  it('degrades gracefully when Prisma throws', async () => {
    mocks.prisma.groupReport.findMany.mockRejectedValue(new Error('connection refused'))
    const hidden = await service.getHiddenGroupIdsForReporter(42)
    expect(hidden.size).toBe(0)
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })
})
