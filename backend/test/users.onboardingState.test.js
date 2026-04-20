/**
 * users.onboardingState.test.js — unit coverage for GET
 * /api/users/me/onboarding-state (Design Refresh v2 Week 2).
 *
 * Mirrors the Module._load monkey-patch pattern used by the other
 * users.controller tests in this folder. We mock the prisma delegates the
 * endpoint actually calls and assert three things:
 *
 *   1. Shape — the response includes every key the frontend checklistConfig
 *      evaluates against. If a downstream feature renames a counter the test
 *      fails here before the UI breaks in production.
 *   2. Derivation — hasSchool, teacherVerified, hasLearningGoal each switch
 *      on the right input.
 *   3. Graceful degradation — when a prisma delegate rejects (e.g., missing
 *      table in a preview env) the endpoint still returns a 200 with the
 *      fallback value instead of a 500.
 */
import Module, { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const controllerPath = require.resolve('../src/modules/users/users.controller')

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    onboardingProgress: { findUnique: vi.fn() },
    enrollment: { count: vi.fn() },
    starredSheet: { count: vi.fn() },
    courseExam: { count: vi.fn() },
    studyGroupMember: { count: vi.fn() },
    studySheet: { count: vi.fn() },
    groupDiscussionPost: { count: vi.fn() },
    hashtagFollow: { count: vi.fn() },
    learningGoal: { findFirst: vi.fn(), create: vi.fn() },
    note: { count: vi.fn() },
    roleChangeLog: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (cb) => cb({})),
  },
  sentry: { captureError: vi.fn() },
  notify: { createNotification: vi.fn() },
  socketio: { emitToUser: vi.fn() },
  socketEvents: {},
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
}))

const mockTargets = new Map([
  [require.resolve('../src/lib/prisma'), mocks.prisma],
  [require.resolve('../src/monitoring/sentry'), mocks.sentry],
  [require.resolve('../src/lib/notify'), mocks.notify],
  [require.resolve('../src/lib/socketio'), mocks.socketio],
  [require.resolve('../src/lib/socketEvents'), mocks.socketEvents],
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

function makeRequest(extras = {}) {
  return {
    user: { userId: 42 },
    body: {},
    ip: '127.0.0.1',
    originalUrl: '/api/users/me/onboarding-state',
    method: 'GET',
    get: () => 'vitest-agent',
    ...extras,
  }
}

function stubAllZero() {
  mocks.prisma.user.findUnique.mockResolvedValue({
    accountType: 'student',
    trustLevel: 0,
    learningGoal: null,
  })
  mocks.prisma.onboardingProgress.findUnique.mockResolvedValue(null)
  mocks.prisma.enrollment.count.mockResolvedValue(0)
  mocks.prisma.starredSheet.count.mockResolvedValue(0)
  mocks.prisma.courseExam.count.mockResolvedValue(0)
  mocks.prisma.studyGroupMember.count.mockResolvedValue(0)
  mocks.prisma.studySheet.count.mockResolvedValue(0)
  mocks.prisma.groupDiscussionPost.count.mockResolvedValue(0)
  mocks.prisma.hashtagFollow.count.mockResolvedValue(0)
  mocks.prisma.learningGoal.findFirst.mockResolvedValue(null)
  mocks.prisma.note.count.mockResolvedValue(0)
}

beforeEach(() => {
  vi.clearAllMocks()
  stubAllZero()
})

describe('GET /api/users/me/onboarding-state', () => {
  it('returns 401 when the request has no authenticated user', async () => {
    const req = makeRequest({ user: null })
    const res = makeResponse()
    await controller.getOnboardingState(req, res)
    expect(res.statusCode).toBe(401)
    expect(res.jsonBody).toEqual({ error: 'Not authenticated' })
  })

  it('returns the full shape with zeros when the user is brand new', async () => {
    const req = makeRequest()
    const res = makeResponse()
    await controller.getOnboardingState(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toMatchObject({
      accountType: 'student',
      hasSchool: false,
      hasMajor: false,
      courseFollowCount: 0,
      starCount: 0,
      examCount: 0,
      groupMembershipCount: 0,
      teacherVerified: false,
      publishedMaterialCount: 0,
      sectionCount: 0,
      scheduledSessionCount: 0,
      problemQueuePostCount: 0,
      topicFollowCount: 0,
      hasLearningGoal: false,
      completedGoalTaskCount: 0,
      noteCount: 0,
    })
    expect(res.jsonBody.meta).toBeDefined()
    expect(res.jsonBody.meta.onboardingCompleted).toBe(false)
    expect(typeof res.jsonBody.meta.generatedAt).toBe('string')
  })

  it('derives hasSchool from onboardingProgress.schoolSelected', async () => {
    mocks.prisma.onboardingProgress.findUnique.mockResolvedValue({
      schoolSelected: true,
      coursesAdded: 0,
      completedAt: null,
    })
    const res = makeResponse()
    await controller.getOnboardingState(makeRequest(), res)
    expect(res.jsonBody.hasSchool).toBe(true)
  })

  it('derives hasSchool from a non-zero enrollment count when onboarding row is missing', async () => {
    mocks.prisma.enrollment.count.mockResolvedValue(3)
    const res = makeResponse()
    await controller.getOnboardingState(makeRequest(), res)
    expect(res.jsonBody.hasSchool).toBe(true)
    expect(res.jsonBody.courseFollowCount).toBe(3)
  })

  it('returns accountType=teacher + teacherVerified when trustLevel is 2', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      accountType: 'teacher',
      trustLevel: 2,
      learningGoal: null,
    })
    const res = makeResponse()
    await controller.getOnboardingState(makeRequest(), res)
    expect(res.jsonBody.accountType).toBe('teacher')
    expect(res.jsonBody.teacherVerified).toBe(true)
  })

  it('reports hasLearningGoal when either the LearningGoal row or user.learningGoal is populated', async () => {
    // Case A: LearningGoal row is present
    mocks.prisma.learningGoal.findFirst.mockResolvedValueOnce({ id: 9 })
    let res = makeResponse()
    await controller.getOnboardingState(makeRequest(), res)
    expect(res.jsonBody.hasLearningGoal).toBe(true)

    // Case B: row missing but user.learningGoal is set
    mocks.prisma.learningGoal.findFirst.mockResolvedValue(null)
    mocks.prisma.user.findUnique.mockResolvedValue({
      accountType: 'other',
      trustLevel: 0,
      learningGoal: 'Finish calculus',
    })
    res = makeResponse()
    await controller.getOnboardingState(makeRequest(), res)
    expect(res.jsonBody.hasLearningGoal).toBe(true)
  })

  it('propagates counters from prisma when they are > 0', async () => {
    mocks.prisma.enrollment.count.mockResolvedValue(4)
    mocks.prisma.starredSheet.count.mockResolvedValue(7)
    mocks.prisma.courseExam.count.mockResolvedValue(2)
    mocks.prisma.studyGroupMember.count.mockResolvedValue(3)
    mocks.prisma.studySheet.count.mockResolvedValue(5)
    mocks.prisma.groupDiscussionPost.count.mockResolvedValue(1)
    mocks.prisma.hashtagFollow.count.mockResolvedValue(6)
    mocks.prisma.note.count.mockResolvedValue(12)

    const res = makeResponse()
    await controller.getOnboardingState(makeRequest(), res)

    expect(res.jsonBody).toMatchObject({
      courseFollowCount: 4,
      starCount: 7,
      examCount: 2,
      groupMembershipCount: 3,
      publishedMaterialCount: 5,
      problemQueuePostCount: 1,
      topicFollowCount: 6,
      noteCount: 12,
    })
  })

  it('gracefully degrades when a prisma delegate rejects (e.g. missing table)', async () => {
    mocks.prisma.hashtagFollow.count.mockRejectedValue(
      new Error('relation "HashtagFollow" does not exist'),
    )
    mocks.prisma.courseExam.count.mockRejectedValue(new Error('kaboom'))

    const res = makeResponse()
    await controller.getOnboardingState(makeRequest(), res)

    // Endpoint still resolves 200. Missing counters fall through to 0.
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody.topicFollowCount).toBe(0)
    expect(res.jsonBody.examCount).toBe(0)
    // Per-call failures are captured as non-fatal telemetry.
    expect(mocks.sentry.captureError).toHaveBeenCalled()
  })
})
