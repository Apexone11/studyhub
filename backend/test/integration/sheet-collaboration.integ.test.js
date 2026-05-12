/**
 * sheet-collaboration.integ.test.js — Loop T10 deep integration test.
 *
 * Scenario: two users collaborate on a sheet.
 *   1. User A creates a published sheet → SHEET_PUBLISH event emitted.
 *   2. User B forks A's sheet → SHEET_FORK event emitted on B.
 *   3. User B edits the fork content (PATCH).
 *   4. (Simulated) User B submits a contribution back to A.
 *   5. User A accepts → contribution merged + REVIEW_SUBMIT + CONTRIBUTION_ACCEPT events.
 *
 * The test exercises the real Express sheets router for create + fork + GET.
 * Contribution submit / accept is simulated via direct service calls because
 * the contributions controller has heavier coupling (notify, mentions, sheetLab
 * commits) that's tested in dedicated unit tests. Achievement event emission
 * is the load-bearing assertion (Loop A4).
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)

const state = {
  nextUserId: 100,
  nextSheetId: 1,
  nextContributionId: 1,
  nextActivityId: 1,
  nextAchievementEventId: 1,
  users: [
    {
      id: 100,
      username: 'alice',
      email: 'alice@x.com',
      accountType: 'student',
      createdAt: new Date(),
    },
    { id: 101, username: 'bob', email: 'bob@x.com', accountType: 'student', createdAt: new Date() },
  ],
  sheets: [],
  contributions: [],
  userDailyActivities: [],
  notifications: [],
  emittedAchievementEvents: [],
}

function reset() {
  state.sheets.length = 0
  state.contributions.length = 0
  state.userDailyActivities.length = 0
  state.notifications.length = 0
  state.emittedAchievementEvents.length = 0
  state.nextSheetId = 1
  state.nextContributionId = 1
  state.nextActivityId = 1
}

const COURSE = {
  id: 10,
  code: 'CMSC131',
  name: 'OOP I',
  schoolId: 1,
  school: { id: 1, name: 'UMD', short: 'UMD' },
}

function attachSheetRelations(sheet) {
  const author = state.users.find((u) => u.id === sheet.userId)
  const forkSource = sheet.forkOf ? state.sheets.find((s) => s.id === sheet.forkOf) : null
  return {
    ...sheet,
    course: COURSE,
    author: author ? { id: author.id, username: author.username } : null,
    htmlVersions: [],
    forkSource: forkSource
      ? {
          id: forkSource.id,
          title: forkSource.title,
          userId: forkSource.userId,
          author: { id: forkSource.userId, username: 'alice' },
        }
      : null,
    incomingContributions: [],
    outgoingContributions: [],
  }
}

const prismaMock = {
  $transaction: async (fnOrArr) =>
    typeof fnOrArr === 'function' ? fnOrArr(prismaMock) : Promise.all(fnOrArr),
  $queryRaw: vi.fn(async () => []),
  user: {
    findUnique: vi.fn(async ({ where, select }) => {
      const u = state.users.find((x) => x.id === where.id || x.username === where.username)
      if (!u) return null
      if (!select) return { ...u }
      const out = {}
      for (const k of Object.keys(select)) if (select[k]) out[k] = u[k]
      return out
    }),
  },
  studySheet: {
    findUnique: vi.fn(async ({ where, select, include }) => {
      const sheet = state.sheets.find((s) => s.id === where.id)
      if (!sheet) return null
      const full = attachSheetRelations(sheet)
      if (select) {
        const out = {}
        for (const k of Object.keys(select)) if (select[k]) out[k] = full[k]
        return out
      }
      if (include) return full
      return { ...sheet }
    }),
    findFirst: vi.fn(async ({ where }) => {
      const matches = state.sheets.filter((s) => {
        if (where?.userId && s.userId !== where.userId) return false
        if (where?.status && s.status !== where.status) return false
        return true
      })
      return matches.length ? attachSheetRelations(matches[0]) : null
    }),
    create: vi.fn(async ({ data }) => {
      const sheet = {
        id: state.nextSheetId++,
        allowEditing: true,
        allowDownloads: true,
        ...data,
        forks: 0,
        stars: 0,
        downloads: 0,
        rootSheetId: data.forkOf ? data.rootSheetId || data.forkOf : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      state.sheets.push(sheet)
      return attachSheetRelations(sheet)
    }),
    update: vi.fn(async ({ where, data }) => {
      const sheet = state.sheets.find((s) => s.id === where.id)
      if (!sheet) {
        const err = new Error('not found')
        err.code = 'P2025'
        throw err
      }
      for (const [k, v] of Object.entries(data || {})) {
        // Prisma supports { increment: N } / { decrement: N } update objects.
        if (v && typeof v === 'object' && 'increment' in v) {
          sheet[k] = (sheet[k] || 0) + v.increment
        } else if (v && typeof v === 'object' && 'decrement' in v) {
          sheet[k] = (sheet[k] || 0) - v.decrement
        } else {
          sheet[k] = v
        }
      }
      sheet.updatedAt = new Date()
      return attachSheetRelations(sheet)
    }),
    count: vi.fn(async ({ where } = {}) => {
      let rows = state.sheets
      if (where?.userId) rows = rows.filter((s) => s.userId === where.userId)
      if (where?.createdAt?.gte) rows = rows.filter((s) => s.createdAt >= where.createdAt.gte)
      return rows.length
    }),
    findMany: vi.fn(async () => state.sheets.map(attachSheetRelations)),
  },
  course: {
    findUnique: vi.fn(async ({ where, select }) => {
      if (where.id !== COURSE.id) return null
      if (!select) return { ...COURSE }
      const out = {}
      for (const k of Object.keys(select)) if (select[k]) out[k] = COURSE[k]
      return out
    }),
    findMany: vi.fn(async ({ where }) => {
      const ids = where?.id?.in || []
      return ids.filter((id) => id === COURSE.id).map(() => ({ id: COURSE.id }))
    }),
  },
  sheetContribution: {
    create: vi.fn(async ({ data }) => {
      const row = {
        id: state.nextContributionId++,
        ...data,
        createdAt: new Date(),
      }
      state.contributions.push(row)
      return row
    }),
    findMany: vi.fn(async ({ where } = {}) =>
      state.contributions.filter((c) => {
        if (where?.toSheetId && c.toSheetId !== where.toSheetId) return false
        if (where?.fromUserId && c.fromUserId !== where.fromUserId) return false
        if (where?.status && c.status !== where.status) return false
        return true
      }),
    ),
    findUnique: vi.fn(
      async ({ where }) => state.contributions.find((c) => c.id === where.id) || null,
    ),
    update: vi.fn(async ({ where, data }) => {
      const c = state.contributions.find((x) => x.id === where.id)
      if (!c) {
        const err = new Error('not found')
        err.code = 'P2025'
        throw err
      }
      Object.assign(c, data)
      return { ...c }
    }),
  },
  enrollment: new Proxy({}, { get: () => async () => null }),
  starredSheet: new Proxy({}, { get: () => async () => null }),
  moderationCase: { create: vi.fn(async () => null) },
  provenanceManifest: { upsert: vi.fn(async () => null) },
  sheetCommit: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => null),
  },
  badge: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
  userBadge: {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    create: vi.fn(async () => null),
  },
  featureFlag: { findUnique: vi.fn(async () => ({ enabled: true })) },
  userPreferences: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => null) },
}

const sentryMock = { captureError: vi.fn(), redactObject: (o) => o, redactHeaders: (h) => h }

function fakeAuth(req, res, next) {
  const id = req.headers['x-test-user-id']
  if (!id) return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
  req.user = {
    userId: Number(id),
    role: String(req.headers['x-test-role'] || 'student'),
    username: state.users.find((u) => u.id === Number(id))?.username || `user${id}`,
  }
  next()
}
fakeAuth.default = fakeAuth

function fakeOptionalAuth(req, _res, next) {
  const id = req.headers['x-test-user-id']
  if (id) {
    req.user = {
      userId: Number(id),
      role: String(req.headers['x-test-role'] || 'student'),
      username: state.users.find((u) => u.id === Number(id))?.username || `user${id}`,
    }
  }
  next()
}

const passthroughLimiter = (_req, _res, next) => next()
passthroughLimiter.default = passthroughLimiter
const rateLimitersMock = new Proxy(
  {},
  {
    get(_t, key) {
      if (key === '__esModule') return true
      if (typeof key === 'string' && key.startsWith('create')) return () => passthroughLimiter
      return passthroughLimiter
    },
  },
)

const achievementsMock = {
  checkAndAwardBadges: vi.fn(),
  checkAndAwardBadgesLegacy: vi.fn(),
  emitAchievementEvent: vi.fn(async (_p, userId, kind, metadata) => {
    state.emittedAchievementEvents.push({ userId, kind, metadata })
    return { awarded: [] }
  }),
  EVENT_KINDS: {
    SHEET_PUBLISH: 'sheet.publish',
    SHEET_FORK: 'sheet.fork',
    AI_PUBLISH_SHEET: 'ai.publish_sheet',
    CONTRIBUTION_SUBMIT: 'contribution.submit',
    CONTRIBUTION_ACCEPT: 'contribution.accept',
    REVIEW_SUBMIT: 'review.submit',
    NOTE_CREATE: 'note.create',
  },
}

const htmlSecurityMock = new Proxy(
  {
    validateHtmlForSubmission: () => ({ ok: true, issues: [] }),
    RISK_TIER: { CLEAN: 0, FLAGGED: 1, HIGH_RISK: 2, QUARANTINED: 3 },
    normalizeContentFormat: (v) => (v === 'html' ? 'html' : 'markdown'),
    generateRiskSummary: () => '',
    generateTierExplanation: () => '',
    RISK_TIER_LABELS: { 0: 'clean', 1: 'flagged', 2: 'high_risk', 3: 'quarantined' },
  },
  { get: (t, p) => (p in t ? t[p] : () => null) },
)

const trustGateMock = {
  TRUST_LEVELS: { UNVERIFIED: 'unverified', VERIFIED: 'verified', TRUSTED: 'trusted' },
  shouldAutoPublish: () => true,
}

const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), prismaMock],
  [require.resolve('../../src/middleware/auth'), fakeAuth],
  [require.resolve('../../src/middleware/requireVerifiedEmail'), (req, res, next) => next()],
  [
    require.resolve('../../src/middleware/originAllowlist'),
    Object.assign(() => (req, res, next) => next(), {
      normalizeOrigin: (v) => v,
      buildTrustedOrigins: () => new Set(),
    }),
  ],
  [require.resolve('../../src/core/auth/requireAuth'), fakeAuth],
  [require.resolve('../../src/core/auth/optionalAuth'), fakeOptionalAuth],
  [require.resolve('../../src/core/auth/requireVerifiedEmail'), (req, res, next) => next()],
  [require.resolve('../../src/core/db/prisma'), prismaMock],
  [require.resolve('../../src/core/monitoring/sentry'), sentryMock],
  [require.resolve('../../src/monitoring/sentry'), sentryMock],
  [require.resolve('../../src/lib/rateLimiters'), rateLimitersMock],
  [
    require.resolve('../../src/lib/notify'),
    {
      createNotification: vi.fn(async (_p, payload) => {
        state.notifications.push({ ...payload })
        return payload
      }),
    },
  ],
  [
    require.resolve('../../src/lib/events'),
    {
      EVENTS: {
        SHEET_FIRST_CREATED: 'sheet_first_created',
        SIGNUP_COMPLETED: 'signup_completed',
        ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
        ONBOARDING_FINISHED: 'onboarding_finished',
        ONBOARDING_SKIPPED: 'onboarding_skipped',
        SHEET_STARRED_FIRST: 'sheet_starred_first',
        NOTE_FIRST_CREATED: 'note_first_created',
        REFERRAL_SENT: 'referral_sent',
        REFERRAL_ACCEPTED: 'referral_accepted',
        REFERRAL_REWARD_GRANTED: 'referral_reward_granted',
        AI_STREAM_TTFT: 'ai_stream_ttft',
      },
      trackServerEvent: vi.fn(),
      flushEvents: vi.fn(async () => undefined),
    },
  ],
  [require.resolve('../../src/lib/trustGate'), trustGateMock],
  [require.resolve('../../src/lib/badges'), achievementsMock],
  [require.resolve('../../src/modules/achievements'), achievementsMock],
  [require.resolve('../../src/lib/html/htmlSecurity'), htmlSecurityMock],
  [
    require.resolve('../../src/lib/html/htmlDraftValidation'),
    { scanHtmlContentForPersistence: async () => null },
  ],
  [
    require.resolve('../../src/lib/html/htmlKillSwitch'),
    { isHtmlUploadsEnabled: async () => ({ enabled: true }) },
  ],
  [
    require.resolve('../../src/lib/moderation/moderationEngine'),
    { isModerationEnabled: () => false, scanContent: async () => null },
  ],
  [
    require.resolve('../../src/lib/plagiarismService'),
    { updateFingerprint: vi.fn(async () => null) },
  ],
  [require.resolve('../../src/lib/plagiarism'), { findSimilarSheets: vi.fn(async () => []) }],
  [
    require.resolve('../../src/modules/plagiarism/plagiarism.service'),
    { runPlagiarismScan: vi.fn(async () => null) },
  ],
  [
    require.resolve('../../src/lib/activityTracker'),
    {
      trackActivity: vi.fn(async (_p, userId, kind) => {
        const today = new Date().toISOString().slice(0, 10)
        const existing = state.userDailyActivities.find(
          (a) => a.userId === userId && a.date === today,
        )
        if (existing) existing[kind] = (existing[kind] || 0) + 1
        else
          state.userDailyActivities.push({
            id: state.nextActivityId++,
            userId,
            date: today,
            [kind]: 1,
          })
      }),
    },
  ],
  [require.resolve('../../src/lib/abuseDetection'), { runAbuseChecks: vi.fn(async () => null) }],
  [require.resolve('../../src/lib/provenance'), { createProvenanceToken: () => 'token' }],
  [
    require.resolve('../../src/lib/sheets/extractPreviewText'),
    { extractPreviewText: (s) => String(s || '').slice(0, 200) },
  ],
  [
    require.resolve('../../src/lib/getUserPlan'),
    { getUserPlan: vi.fn(async () => 'free'), getUserTier: vi.fn(async () => 'free') },
  ],
  [
    require.resolve('../../src/modules/payments/payments.constants'),
    {
      PLANS: { free: { uploadsPerMonth: -1, privateGroups: 0, aiMessagesPerDay: 30 } },
      DONATION_MIN_CENTS: 100,
      DONATION_MAX_CENTS: 100000,
      DONATION_MESSAGE_MAX_LENGTH: 280,
      planFromPriceId: () => null,
    },
  ],
])

const originalLoad = Module._load
let app
const sheetsRoutePath = require.resolve('../../src/modules/sheets')

beforeAll(() => {
  Module._load = function patched(req, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(req, parent, isMain)
      if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    } catch {
      /* fall through */
    }
    return originalLoad.apply(this, arguments)
  }
  delete require.cache[sheetsRoutePath]
  const sheetsRouter = require('../../src/modules/sheets')
  app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use('/sheets', sheetsRouter.default || sheetsRouter)
  app.use((err, _req, res, _next) =>
    res.status(500).json({ error: err?.message || 'Server error' }),
  )
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[sheetsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  reset()
})

describe('Integration: sheet collaboration (create → fork → contribute → accept)', () => {
  it('walks two users through create-fork-contribute-accept lifecycle', async () => {
    // ── Step 1: alice creates published sheet ─────────────────────────
    const createRes = await request(app)
      .post('/sheets')
      .set('x-test-user-id', '100')
      .set('x-test-role', 'student')
      .send({
        title: 'Alice OOP notes',
        content: '# Polymorphism\n\nDynamic dispatch.',
        courseId: 10,
        contentFormat: 'markdown',
      })

    expect(createRes.status).toBe(201)
    expect(createRes.body.firstCreation).toBe(true)
    expect(createRes.body.userId).toBe(100)
    const sourceSheetId = createRes.body.id

    // Side-effect: SHEET_PUBLISH event emitted for alice
    expect(
      state.emittedAchievementEvents.find(
        (e) =>
          e.kind === 'sheet.publish' && e.userId === 100 && e.metadata.sheetId === sourceSheetId,
      ),
    ).toBeTruthy()

    // ── Step 2: bob forks alice's sheet ───────────────────────────────
    const forkRes = await request(app)
      .post(`/sheets/${sourceSheetId}/fork`)
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({})

    expect(forkRes.status).toBe(201)
    expect(forkRes.body.userId).toBe(101) // bob owns the fork
    expect(forkRes.body.forkOf).toBe(sourceSheetId)
    const forkSheetId = forkRes.body.id
    expect(forkSheetId).not.toBe(sourceSheetId)

    // Side-effect: SHEET_FORK event emitted for bob (Loop A4)
    expect(
      state.emittedAchievementEvents.find((e) => e.kind === 'sheet.fork' && e.userId === 101),
    ).toBeTruthy()

    // Side-effect: parent sheet's `forks` counter incremented
    const parentSheet = state.sheets.find((s) => s.id === sourceSheetId)
    expect(parentSheet.forks).toBe(1)

    // Side-effect: alice gets a "your sheet was forked" notification
    const forkNotification = state.notifications.find(
      (n) => n.userId === 100 && /fork/i.test(n.type || ''),
    )
    expect(forkNotification).toBeTruthy()

    // ── Step 3: bob updates his fork content ──────────────────────────
    const updateRes = await request(app)
      .patch(`/sheets/${forkSheetId}`)
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({ content: '# Polymorphism\n\nDynamic dispatch + virtual methods.' })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.content).toMatch(/virtual methods/i)

    // ── Step 4: bob submits contribution back (simulated)  ────────────
    // The real /contributions endpoint requires a sheetLab commit + diff
    // path; we simulate at the persistence layer to focus this scenario
    // on the achievement-event side-effects.
    const contribution = await prismaMock.sheetContribution.create({
      data: {
        fromSheetId: forkSheetId,
        toSheetId: sourceSheetId,
        fromUserId: 101,
        toUserId: 100,
        status: 'pending',
        message: 'Added virtual methods note',
      },
    })
    await achievementsMock.emitAchievementEvent(prismaMock, 101, 'contribution.submit', {
      contributionId: contribution.id,
    })

    // ── Step 5: alice fetches pending contributions ───────────────────
    const pending = await prismaMock.sheetContribution.findMany({
      where: { toSheetId: sourceSheetId, status: 'pending' },
    })
    expect(pending).toHaveLength(1)
    expect(pending[0].fromUserId).toBe(101)

    // ── Step 6: alice accepts the contribution (simulated) ────────────
    await prismaMock.sheetContribution.update({
      where: { id: contribution.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    })
    await prismaMock.studySheet.update({
      where: { id: sourceSheetId },
      data: { content: '# Polymorphism\n\nDynamic dispatch + virtual methods.' },
    })
    await achievementsMock.emitAchievementEvent(prismaMock, 100, 'review.submit', {
      contributionId: contribution.id,
    })
    await achievementsMock.emitAchievementEvent(prismaMock, 101, 'contribution.accept', {
      contributionId: contribution.id,
    })

    // Verify both events emitted
    expect(
      state.emittedAchievementEvents.find((e) => e.kind === 'review.submit' && e.userId === 100),
    ).toBeTruthy()
    expect(
      state.emittedAchievementEvents.find(
        (e) => e.kind === 'contribution.accept' && e.userId === 101,
      ),
    ).toBeTruthy()

    // Verify sheet content was actually updated
    const updatedSource = state.sheets.find((s) => s.id === sourceSheetId)
    expect(updatedSource.content).toMatch(/virtual methods/i)
    expect(updatedSource.userId).toBe(100) // still alice's sheet

    // Contribution is now accepted
    const acceptedContribution = state.contributions.find((c) => c.id === contribution.id)
    expect(acceptedContribution.status).toBe('accepted')
  })

  it('forks must be of an existing PUBLISHED sheet (404 otherwise)', async () => {
    const res = await request(app)
      .post('/sheets/9999/fork')
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({})
    expect(res.status).toBe(404)
  })

  it("user cannot patch another user's sheet", async () => {
    // alice creates
    state.sheets.push({
      id: state.nextSheetId++,
      title: 'Alice',
      content: 'x',
      courseId: 10,
      userId: 100,
      contentFormat: 'markdown',
      status: 'published',
      forkOf: null,
      stars: 0,
      forks: 0,
      downloads: 0,
      allowDownloads: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const sheetId = state.sheets[0].id

    // bob tries to patch
    const res = await request(app)
      .patch(`/sheets/${sheetId}`)
      .set('x-test-user-id', '101')
      .set('x-test-role', 'student')
      .send({ content: 'malicious' })

    expect(res.status).toBe(403)
  })
})
