/**
 * onboarding.handleSchoolStep.test.js — regression coverage for Task #65.
 *
 * Pins the post-fix invariant that step 2 of onboarding does NOT attempt
 * `prisma.enrollment.create({ data: { userId, schoolId } })`. The prior
 * code at onboarding.service.js:188 silently failed on every step-2
 * submission because Enrollment is course-level (userId + courseId only;
 * see schema.prisma model Enrollment). The error was caught + logged as
 * a warning, so the broken call lived in the codebase invisible to
 * tests + monitoring. This test ensures it doesn't come back.
 *
 * Mocks the prisma + logger + events modules using the same Module._load
 * monkey-patch pattern as users.onboardingState.test.js.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const servicePath = require.resolve('../src/modules/onboarding/onboarding.service')

const mocks = vi.hoisted(() => ({
  prisma: {
    onboardingProgress: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    school: { findUnique: vi.fn() },
    enrollment: { create: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  events: {
    EVENTS: { ONBOARDING_STEP_COMPLETED: 'onb.step', ONBOARDING_FINISHED: 'onb.fin' },
    trackServerEvent: vi.fn(),
  },
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/lib/logger'), mocks.logger],
  [require.resolve('../src/lib/events'), mocks.events],
])

const originalModuleLoad = Module._load
let service

beforeAll(() => {
  Module._load = function patchedModuleLoad(requestId, parent, isMain) {
    const resolved = Module._resolveFilename(requestId, parent, isMain)
    if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    return originalModuleLoad.apply(this, arguments)
  }
  delete require.cache[servicePath]
  service = require(servicePath)
})

afterAll(() => {
  Module._load = originalModuleLoad
  delete require.cache[servicePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  // Pre-existing onboarding row at currentStep=2, no completion / skip yet.
  mocks.prisma.onboardingProgress.findUnique.mockResolvedValue({
    userId: 42,
    currentStep: 2,
    completedAt: null,
    skippedAt: null,
    schoolSelected: false,
    coursesAdded: 0,
    firstActionType: null,
    invitesSent: 0,
  })
  mocks.prisma.onboardingProgress.update.mockImplementation(({ data }) => ({
    userId: 42,
    currentStep: data.currentStep ?? 2,
    completedAt: data.completedAt ?? null,
    skippedAt: data.skippedAt ?? null,
    schoolSelected: data.schoolSelected ?? false,
    coursesAdded: 0,
    firstActionType: null,
    invitesSent: 0,
  }))
})

describe('onboarding step 2 (school selection)', () => {
  it('advances to step 3 and marks schoolSelected=true on a valid schoolId', async () => {
    mocks.prisma.school.findUnique.mockResolvedValue({ id: 7, name: 'UMD' })
    const result = await service.applyStep(42, 2, { schoolId: 7 })
    expect(mocks.prisma.school.findUnique).toHaveBeenCalledWith({ where: { id: 7 } })
    expect(result.currentStep).toBe(3)
    expect(result.progress.schoolSelected).toBe(true)
  })

  it('does NOT call prisma.enrollment.create — Enrollment is course-level (Task #65 regression)', async () => {
    mocks.prisma.school.findUnique.mockResolvedValue({ id: 7, name: 'UMD' })
    await service.applyStep(42, 2, { schoolId: 7 })
    // The previous code at onboarding.service.js:188 attempted to write
    // a schoolId column on Enrollment that does not exist. If anyone ever
    // re-introduces that call, this assertion catches it.
    expect(mocks.prisma.enrollment.create).not.toHaveBeenCalled()
    expect(mocks.prisma.enrollment.findFirst).not.toHaveBeenCalled()
  })

  it('does NOT log a warning about failed enrollment creation (no longer a swallowed error)', async () => {
    mocks.prisma.school.findUnique.mockResolvedValue({ id: 7, name: 'UMD' })
    await service.applyStep(42, 2, { schoolId: 7 })
    expect(mocks.logger.warn).not.toHaveBeenCalled()
  })

  it('throws 400 when schoolId is missing from the payload', async () => {
    await expect(service.applyStep(42, 2, {})).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/schoolId is required/i),
    })
    expect(mocks.prisma.school.findUnique).not.toHaveBeenCalled()
  })

  it('throws 400 when schoolId is not a valid number', async () => {
    await expect(service.applyStep(42, 2, { schoolId: 'not-a-number' })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/valid number/i),
    })
  })

  it('throws 404 when the schoolId does not match a real school row', async () => {
    mocks.prisma.school.findUnique.mockResolvedValue(null)
    await expect(service.applyStep(42, 2, { schoolId: 999 })).rejects.toMatchObject({
      status: 404,
      message: expect.stringMatching(/school not found/i),
    })
  })
})
