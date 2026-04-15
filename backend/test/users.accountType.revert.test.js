import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/users/users.controller')

// Hoisted mocks replace the modules that users.controller pulls in.
const mocks = vi.hoisted(() => {
  const tx = {
    enrollment: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    userEnrollmentArchive: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    course: { findMany: vi.fn() },
    user: { update: vi.fn() },
    roleChangeLog: { create: vi.fn() },
  }

  return {
    tx,
    prisma: {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      roleChangeLog: {
        count: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(tx)),
    },
    sentry: { captureError: vi.fn() },
    notify: { createNotification: vi.fn() },
    profileVisibility: {
      getProfileAccessDecision: vi.fn(),
      PROFILE_VISIBILITY: {},
    },
    piiVault: { getUserPII: vi.fn() },
    profileMetadata: {
      buildProfilePresentation: vi.fn(),
      getProfileFieldVisibility: vi.fn(),
    },
    badges: { checkAndAwardBadges: vi.fn() },
    streaks: { getUserStreak: vi.fn(), getWeeklyActivity: vi.fn() },
    userBadges: { enrichUserWithBadges: vi.fn() },
    legalService: {
      CURRENT_LEGAL_VERSION: '2026-04-04',
      acceptCurrentLegalDocuments: vi.fn(),
      getUserLegalStatus: vi.fn(),
    },
  }
})

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/profileVisibility'), mocks.profileVisibility],
  [require.resolve('../src/lib/piiVault'), mocks.piiVault],
  [require.resolve('../src/lib/profileMetadata'), mocks.profileMetadata],
  [require.resolve('../src/lib/badges'), mocks.badges],
  [require.resolve('../src/lib/streaks'), mocks.streaks],
  [require.resolve('../src/lib/userBadges'), mocks.userBadges],
  [require.resolve('../src/modules/legal/legal.service'), mocks.legalService],
])

const originalModuleLoad = Module._load

let controller

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolved = Module._resolveFilename(requestId, parent, isMain)
    if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    return originalModuleLoad.apply(this, arguments)
  }
  delete require.cache[controllerPath]
  controller = require(controllerPath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[controllerPath]
})

function makeResponse() {
  return {
    statusCode: 200,
    jsonBody: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.jsonBody = payload
      return this
    },
  }
}

function makeRequest(body, extras = {}) {
  return {
    user: { userId: 42 },
    body,
    ip: '127.0.0.1',
    originalUrl: '/api/users/me/account-type',
    method: 'PATCH',
    get: () => 'vitest-agent',
    ...extras,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.$transaction.mockImplementation(async (cb) => cb(mocks.tx))
  mocks.tx.enrollment.findMany.mockResolvedValue([])
  mocks.tx.enrollment.deleteMany.mockResolvedValue({ count: 0 })
  mocks.tx.enrollment.createMany.mockResolvedValue({ count: 0 })
  mocks.tx.userEnrollmentArchive.createMany.mockResolvedValue({ count: 0 })
  mocks.tx.userEnrollmentArchive.findMany.mockResolvedValue([])
  mocks.tx.userEnrollmentArchive.deleteMany.mockResolvedValue({ count: 0 })
  mocks.tx.course.findMany.mockResolvedValue([])
  mocks.prisma.roleChangeLog.count.mockResolvedValue(0)
  mocks.prisma.roleChangeLog.findFirst.mockResolvedValue(null)
})

describe('requestAccountTypeChange — forward change', () => {
  it('rejects an invalid accountType', async () => {
    const res = makeResponse()
    await controller.requestAccountTypeChange(makeRequest({ accountType: 'ghost' }), res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects when the user already has that role', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      accountType: 'student',
      previousAccountType: null,
      roleRevertDeadline: null,
    })
    const res = makeResponse()
    await controller.requestAccountTypeChange(makeRequest({ accountType: 'student' }), res)
    expect(res.statusCode).toBe(400)
    expect(res.jsonBody.error).toMatch(/already/i)
  })

  it('archives enrollments, writes a RoleChangeLog, and sets a 2-day deadline', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      accountType: 'student',
      previousAccountType: null,
      roleRevertDeadline: null,
    })
    mocks.tx.enrollment.findMany.mockResolvedValue([
      { id: 1, courseId: 100 },
      { id: 2, courseId: 101 },
      { id: 3, courseId: 102 },
    ])
    mocks.tx.user.update.mockResolvedValue({
      accountType: 'other',
      previousAccountType: 'student',
      roleRevertDeadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    })

    const res = makeResponse()
    await controller.requestAccountTypeChange(makeRequest({ accountType: 'other' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toMatchObject({
      accountType: 'other',
      previousAccountType: 'student',
      wasRevert: false,
      archivedEnrollmentCount: 3,
      needsReload: true,
    })

    expect(mocks.tx.userEnrollmentArchive.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 42, courseId: 100, reason: 'role_change' },
        { userId: 42, courseId: 101, reason: 'role_change' },
        { userId: 42, courseId: 102, reason: 'role_change' },
      ],
    })
    expect(mocks.tx.enrollment.deleteMany).toHaveBeenCalledWith({ where: { userId: 42 } })
    expect(mocks.tx.roleChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 42,
        fromAccountType: 'student',
        toAccountType: 'other',
        wasRevert: false,
        ip: '127.0.0.1',
        userAgent: 'vitest-agent',
      }),
    })
    const updateArgs = mocks.tx.user.update.mock.calls[0][0]
    expect(updateArgs.data.previousAccountType).toBe('student')
    expect(updateArgs.data.roleRevertDeadline).toBeInstanceOf(Date)
  })

  it('returns 409 COOLDOWN when a third non-revert change lands within 30 days', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      accountType: 'student',
      previousAccountType: null,
      roleRevertDeadline: null,
    })
    mocks.prisma.roleChangeLog.count.mockResolvedValue(3)
    mocks.prisma.roleChangeLog.findFirst.mockResolvedValue({
      changedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    })

    const res = makeResponse()
    await controller.requestAccountTypeChange(makeRequest({ accountType: 'other' }), res)

    expect(res.statusCode).toBe(409)
    expect(res.jsonBody.code).toBe('COOLDOWN')
    expect(typeof res.jsonBody.retryAfter).toBe('string')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('requestAccountTypeChange — revert', () => {
  it('restores archived enrollments, clears the deadline, and does NOT charge the 30-day budget', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      accountType: 'other',
      previousAccountType: 'student',
      roleRevertDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    mocks.tx.userEnrollmentArchive.findMany.mockResolvedValue([
      { id: 1, userId: 42, courseId: 100, reason: 'role_change' },
      { id: 2, userId: 42, courseId: 101, reason: 'role_change' },
      { id: 3, userId: 42, courseId: 999, reason: 'role_change' },
    ])
    mocks.tx.course.findMany.mockResolvedValue([{ id: 100 }, { id: 101 }])
    mocks.tx.user.update.mockResolvedValue({
      accountType: 'student',
      previousAccountType: null,
      roleRevertDeadline: null,
    })

    const res = makeResponse()
    await controller.requestAccountTypeChange(makeRequest({ accountType: 'student' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toMatchObject({
      accountType: 'student',
      previousAccountType: null,
      roleRevertDeadline: null,
      wasRevert: true,
      restoredEnrollmentCount: 2,
      unavailableCourseCount: 1,
    })
    expect(mocks.tx.enrollment.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 42, courseId: 100 },
        { userId: 42, courseId: 101 },
      ],
      skipDuplicates: true,
    })
    expect(mocks.tx.userEnrollmentArchive.deleteMany).toHaveBeenCalledWith({
      where: { userId: 42, reason: 'role_change' },
    })
    expect(mocks.tx.roleChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromAccountType: 'other',
        toAccountType: 'student',
        wasRevert: true,
      }),
    })
    // Revert must not touch the 30-day budget gate.
    expect(mocks.prisma.roleChangeLog.count).not.toHaveBeenCalled()
  })

  it('does not archive enrollments on revert — archives already exist from the forward change', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      accountType: 'other',
      previousAccountType: 'student',
      roleRevertDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    mocks.tx.user.update.mockResolvedValue({
      accountType: 'student',
      previousAccountType: null,
      roleRevertDeadline: null,
    })

    const res = makeResponse()
    await controller.requestAccountTypeChange(makeRequest({ accountType: 'student' }), res)

    expect(res.statusCode).toBe(200)
    expect(mocks.tx.enrollment.findMany).not.toHaveBeenCalled()
    expect(mocks.tx.enrollment.deleteMany).not.toHaveBeenCalled()
    expect(mocks.tx.userEnrollmentArchive.createMany).not.toHaveBeenCalled()
  })

  it('treats a non-previous target during the revert window as a new change, not a revert', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      accountType: 'other',
      previousAccountType: 'student',
      roleRevertDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    mocks.tx.user.update.mockResolvedValue({
      accountType: 'teacher',
      previousAccountType: 'other',
      roleRevertDeadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    })

    const res = makeResponse()
    await controller.requestAccountTypeChange(makeRequest({ accountType: 'teacher' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.jsonBody.wasRevert).toBe(false)
    expect(mocks.tx.roleChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromAccountType: 'other',
        toAccountType: 'teacher',
        wasRevert: false,
      }),
    })
    // Charges budget because it's not a revert.
    expect(mocks.prisma.roleChangeLog.count).toHaveBeenCalled()
  })
})

describe('getAccountTypeStatus', () => {
  it('returns current state + 30-day budget for a stable user', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      accountType: 'student',
      previousAccountType: null,
      roleRevertDeadline: null,
      accountTypeChangedAt: null,
    })
    mocks.prisma.roleChangeLog.count.mockResolvedValue(1)

    const res = makeResponse()
    await controller.getAccountTypeStatus(makeRequest({}), res)

    expect(res.jsonBody).toMatchObject({
      accountType: 'student',
      previousAccountType: null,
      roleRevertDeadline: null,
      changesUsedLast30Days: 1,
      changesRemainingLast30Days: 2,
    })
  })

  it('clears a stale revert deadline and surfaces null state', async () => {
    const pastDeadline = new Date(Date.now() - 60 * 1000)
    mocks.prisma.user.findUnique.mockResolvedValue({
      accountType: 'other',
      previousAccountType: 'student',
      roleRevertDeadline: pastDeadline,
      accountTypeChangedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    })
    mocks.prisma.user.update.mockResolvedValue({})
    mocks.prisma.roleChangeLog.count.mockResolvedValue(2)

    const res = makeResponse()
    await controller.getAccountTypeStatus(makeRequest({}), res)

    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { roleRevertDeadline: null, previousAccountType: null },
    })
    expect(res.jsonBody).toMatchObject({
      accountType: 'other',
      previousAccountType: null,
      roleRevertDeadline: null,
      changesRemainingLast30Days: 1,
    })
  })

  it('reports the active revert window for a user inside it', async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000)
    mocks.prisma.user.findUnique.mockResolvedValue({
      accountType: 'other',
      previousAccountType: 'student',
      roleRevertDeadline: deadline,
      accountTypeChangedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    })
    mocks.prisma.roleChangeLog.count.mockResolvedValue(1)

    const res = makeResponse()
    await controller.getAccountTypeStatus(makeRequest({}), res)

    expect(res.jsonBody).toMatchObject({
      accountType: 'other',
      previousAccountType: 'student',
      roleRevertDeadline: deadline,
      changesUsedLast30Days: 1,
    })
    expect(mocks.prisma.user.update).not.toHaveBeenCalled()
  })
})
