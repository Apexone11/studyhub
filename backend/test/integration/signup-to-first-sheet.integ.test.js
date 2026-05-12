/**
 * signup-to-first-sheet.integ.test.js — Loop T10 deep integration test.
 *
 * Scenario: a brand new user
 *   1. registers (POST /auth/register) → 201 + cookie session
 *   2. fetches onboarding state (GET /onboarding/state) → currentStep=1
 *   3. submits onboarding step 1 (welcome) → advances to step 2
 *   4. submits onboarding step 2 (school) → advances to step 3
 *   5. submits onboarding step 3 (courses) → advances to step 4
 *   6. skips remaining onboarding (POST /onboarding/skip)
 *   7. creates first sheet (POST /sheets) → 201 with firstCreation:true
 *
 * The test exercises the real Express routes + controllers, with Prisma and
 * every external service mocked. Side-effects asserted:
 *   - First-creation analytics event was emitted (Loop A2 / Loop 5 finding F2)
 *   - SHEET_PUBLISH achievement event fired (Loop A4)
 *   - User daily activity is tracked (streak foundation)
 *   - Sheet response has firstCreation:true
 *
 * Mocking strategy: Module._load patch — see _helpers.js. We use the proven
 * pattern from backend/test/sheet.workflow.integration.test.js.
 */
import Module, { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)

// ── In-memory store ─────────────────────────────────────────────────
const state = {
  nextUserId: 100,
  nextSheetId: 1,
  nextOnboardingId: 1,
  nextEnrollmentId: 1,
  nextActivityId: 1,
  nextAchievementEventId: 1,
  users: [],
  sheets: [],
  onboarding: [],
  enrollments: [],
  userDailyActivities: [],
  achievementEvents: [],
  notifications: [],
  // Test sentinels
  trackedEvents: [],
  emittedAchievementEvents: [],
}

function reset() {
  state.nextUserId = 100
  state.nextSheetId = 1
  state.nextOnboardingId = 1
  state.nextEnrollmentId = 1
  state.nextActivityId = 1
  state.nextAchievementEventId = 1
  state.users.length = 0
  state.sheets.length = 0
  state.onboarding.length = 0
  state.enrollments.length = 0
  state.userDailyActivities.length = 0
  state.achievementEvents.length = 0
  state.notifications.length = 0
  state.trackedEvents.length = 0
  state.emittedAchievementEvents.length = 0
}

// Seed reference data once
const COURSE = {
  id: 10,
  code: 'CMSC131',
  name: 'Object-Oriented Programming I',
  schoolId: 1,
  school: { id: 1, name: 'University of Maryland', short: 'UMD' },
}
const SCHOOL = { id: 1, name: 'University of Maryland', short: 'UMD' }

// ── Prisma mock ─────────────────────────────────────────────────────
const prismaMock = {
  $transaction: async (fnOrArr) => {
    if (typeof fnOrArr === 'function') return fnOrArr(prismaMock)
    return Promise.all(fnOrArr)
  },
  $queryRaw: vi.fn(async () => []),
  user: {
    findUnique: vi.fn(async ({ where, select } = {}) => {
      const user = state.users.find(
        (u) =>
          (where.id && u.id === where.id) ||
          (where.email && u.email === where.email) ||
          (where.username && u.username === where.username),
      )
      if (!user) return null
      if (!select) return { ...user }
      const out = {}
      for (const k of Object.keys(select)) {
        if (select[k]) out[k] = user[k]
      }
      return out
    }),
    create: vi.fn(async ({ data, select }) => {
      const user = {
        id: state.nextUserId++,
        createdAt: new Date(),
        emailVerified: true,
        accountType: 'student',
        ...data,
      }
      state.users.push(user)
      if (!select) return { ...user }
      const out = {}
      for (const k of Object.keys(select)) {
        if (select[k]) out[k] = user[k]
      }
      return out
    }),
    update: vi.fn(async ({ where, data }) => {
      const user = state.users.find((u) => u.id === where._id)
      if (!user) {
        const err = new Error('Record not found')
        err.code = 'P2025'
        throw err
      }
      Object.assign(user, data)
      return { ...user }
    }),
  },
  legalAcceptance: {
    createMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(async () => null),
  },
  onboardingProgress: {
    findUnique: vi.fn(async ({ where }) => {
      const row = state.onboarding.find((r) => r.userId === where.userId)
      return row ? { ...row } : null
    }),
    create: vi.fn(async ({ data }) => {
      const row = {
        id: state.nextOnboardingId++,
        userId: data.userId,
        currentStep: 1,
        completedAt: null,
        skippedAt: null,
        schoolSelected: false,
        coursesAdded: 0,
        firstActionType: null,
        invitesSent: 0,
        createdAt: new Date(),
      }
      state.onboarding.push(row)
      return { ...row }
    }),
    update: vi.fn(async ({ where, data }) => {
      const row = state.onboarding.find((r) => r.userId === where.userId)
      if (!row) {
        const err = new Error('Record not found')
        err.code = 'P2025'
        throw err
      }
      Object.assign(row, data)
      return { ...row }
    }),
  },
  school: {
    findUnique: vi.fn(async ({ where }) => (where.id === SCHOOL.id ? { ...SCHOOL } : null)),
  },
  course: {
    findUnique: vi.fn(async ({ where, select }) => {
      if (where.id !== COURSE.id) return null
      if (!select) return { ...COURSE }
      const out = {}
      for (const k of Object.keys(select)) {
        if (select[k]) out[k] = COURSE[k]
      }
      return out
    }),
    findMany: vi.fn(async ({ where, select }) => {
      const ids = where?.id?.in || []
      return ids
        .filter((id) => id === COURSE._id)
        .map(() => {
          if (!select) return { ...COURSE }
          const out = {}
          for (const k of Object.keys(select)) {
            if (select[k]) out[k] = COURSE[k]
          }
          return out
        })
    }),
  },
  enrollment: new Proxy(
    {
      findFirst: vi.fn(async ({ where }) => {
        return (
          state.enrollments.find(
            (e) => e.userId === where.userId && e.courseId === where.courseId,
          ) || null
        )
      }),
      create: vi.fn(async ({ data }) => {
        const row = { id: state.nextEnrollmentId++, ...data, createdAt: new Date() }
        state.enrollments.push(row)
        return row
      }),
      // Onboarding service uses createMany with skipDuplicates to bulk-insert
      // course enrollments (single round-trip vs N findFirst+create pairs).
      createMany: vi.fn(async ({ data, skipDuplicates }) => {
        const rows = Array.isArray(data) ? data : [data]
        let count = 0
        for (const row of rows) {
          const exists = state.enrollments.find(
            (e) => e.userId === row.userId && e.courseId === row.courseId,
          )
          if (exists) {
            if (!skipDuplicates) {
              const err = new Error('Unique constraint failed')
              err.code = 'P2002'
              throw err
            }
            continue
          }
          state.enrollments.push({ id: state.nextEnrollmentId++, ...row, createdAt: new Date() })
          count += 1
        }
        return { count }
      }),
    },
    {
      get(target, prop) {
        if (!(prop in target)) return async () => null
        return target[prop]
      },
    },
  ),
  userPreferences: {
    findUnique: vi.fn(async () => null),
    upsert: vi.fn(async () => null),
  },
  starredSheet: {
    create: vi.fn(async () => null),
  },
  studySheet: {
    findUnique: vi.fn(async ({ where, select }) => {
      const sheet = state.sheets.find((s) => s.id === where._id)
      if (!sheet) return null
      if (!select) return { ...sheet }
      const out = {}
      for (const k of Object.keys(select)) {
        if (select[k]) out[k] = sheet[k]
      }
      return out
    }),
    count: vi.fn(async ({ where } = {}) => {
      let rows = state.sheets
      if (where?.userId) rows = rows.filter((s) => s.userId === where.userId)
      if (where?.createdAt?.gte) {
        rows = rows.filter((s) => new Date(s.createdAt) >= where.createdAt.gte)
      }
      return rows.length
    }),
    create: vi.fn(async ({ data, include: _include }) => {
      const sheet = {
        id: state.nextSheetId++,
        ...data,
        forks: 0,
        stars: 0,
        downloads: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        course: COURSE,
        author: {
          id: data.userId,
          username: state.users.find((u) => u.id === data.userId)?.username || `user${data.userId}`,
        },
        htmlVersions: [],
      }
      state.sheets.push(sheet)
      return { ...sheet }
    }),
  },
  achievementEvent: {
    create: vi.fn(async ({ data }) => {
      const row = {
        id: state.nextAchievementEventId++,
        userId: data.userId,
        kind: data.kind,
        metadata: data.metadata || {},
        createdAt: new Date(),
      }
      state.achievementEvents.push(row)
      state.emittedAchievementEvents.push(row)
      return row
    }),
  },
  userDailyActivity: {
    findMany: vi.fn(async () => []),
    upsert: vi.fn(async ({ where, create, update }) => {
      const existing = state.userDailyActivities.find(
        (a) => a.userId === where.userId_date?.userId && a.date === where.userId_date?.date,
      )
      if (existing) {
        Object.assign(existing, update)
        return { ...existing }
      }
      const row = { id: state.nextActivityId++, ...create }
      state.userDailyActivities.push(row)
      return row
    }),
  },
  moderationCase: { create: vi.fn(async () => null) },
  provenanceManifest: { upsert: vi.fn(async () => null) },
  sheetCommit: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => null),
  },
  badge: {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
  },
  userBadge: {
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    create: vi.fn(async () => null),
  },
  featureFlag: { findUnique: vi.fn(async () => ({ enabled: true })) },
}

// ── External-service mocks ──────────────────────────────────────────
const notifyMock = {
  createNotification: vi.fn(async (_prisma, payload) => {
    const record = { id: state.notifications.length + 1, ...payload }
    state.notifications.push(record)
    return record
  }),
}

const eventsMock = {
  EVENTS: {
    SIGNUP_COMPLETED: 'signup_completed',
    ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
    ONBOARDING_FINISHED: 'onboarding_finished',
    ONBOARDING_SKIPPED: 'onboarding_skipped',
    SHEET_FIRST_CREATED: 'sheet_first_created',
    SHEET_STARRED_FIRST: 'sheet_starred_first',
    NOTE_FIRST_CREATED: 'note_first_created',
    REFERRAL_SENT: 'referral_sent',
    REFERRAL_ACCEPTED: 'referral_accepted',
    REFERRAL_REWARD_GRANTED: 'referral_reward_granted',
    AI_STREAM_TTFT: 'ai_stream_ttft',
  },
  trackServerEvent: vi.fn((userId, event, props) => {
    state.trackedEvents.push({ userId, event, props })
  }),
  flushEvents: vi.fn(async () => undefined),
}

const sentryMock = {
  captureError: vi.fn(),
  redactObject: (o) => o,
  redactHeaders: (h) => h,
}

const passwordSafetyMock = {
  checkPasswordBreach: vi.fn(async () => ({ breached: false, count: 0 })),
}

// authTokens — used by issueAuthenticatedSession + optionalAuth
const authTokensMock = {
  getAuthTokenFromRequest: vi.fn(() => null),
  getOptionalAuthUserFromRequest: vi.fn(() => null),
  verifyAuthToken: vi.fn(() => null),
  getJwtSecret: vi.fn(() => 'test-jwt-secret-32-chars-minimum-required'),
  signAuthToken: vi.fn(() => 'fake.jwt.token'),
  setAuthCookie: vi.fn(),
  clearAuthCookie: vi.fn(),
}

// Override req.user auth header style — middleware/auth replaces JWT cookie auth
function fakeAuthMiddleware(req, res, next) {
  const headerId = req.headers['x-test-user-id']
  if (!headerId) {
    return res.status(401).json({ error: 'Login required.', code: 'AUTH_REQUIRED' })
  }
  const userId = Number(headerId)
  const role = String(req.headers['x-test-role'] || 'student')
  const username = String(req.headers['x-test-username'] || `user${userId}`)
  req.user = { userId, role, username }
  next()
}
fakeAuthMiddleware.default = fakeAuthMiddleware

function fakeOptionalAuth(req, _res, next) {
  const headerId = req.headers['x-test-user-id']
  if (!headerId) return next()
  req.user = {
    userId: Number(headerId),
    role: String(req.headers['x-test-role'] || 'student'),
    username: String(req.headers['x-test-username'] || `user${headerId}`),
  }
  next()
}

function fakeRequireVerifiedEmail(_req, _res, next) {
  next()
}

function fakeOriginAllowlistFactory() {
  return function (_req, _res, next) {
    next()
  }
}
fakeOriginAllowlistFactory.normalizeOrigin = (v) => v
fakeOriginAllowlistFactory.buildTrustedOrigins = () => new Set()

// All rate-limiters become pass-throughs
const passthroughLimiter = (_req, _res, next) => next()
passthroughLimiter.default = passthroughLimiter
const rateLimitersMock = new Proxy(
  {},
  {
    get(_t, key) {
      if (key === 'default') return passthroughLimiter
      if (key === '__esModule') return true
      if (typeof key === 'string' && key.startsWith('create')) return () => passthroughLimiter
      return passthroughLimiter
    },
  },
)

// Achievements mock — record kind + return awarded=[]
const achievementsMock = {
  checkAndAwardBadges: vi.fn(async () => undefined),
  checkAndAwardBadgesLegacy: vi.fn(async () => undefined),
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

// HTML scanner used during sheet create — passthrough for markdown
const htmlSecurityMock = new Proxy(
  {
    validateHtmlForSubmission: () => ({ ok: true, issues: [] }),
    RISK_TIER: { CLEAN: 0, FLAGGED: 1, HIGH_RISK: 2, QUARANTINED: 3 },
    detectHtmlFeatures: () => ({ findings: [] }),
    classifyHtmlRisk: () => ({ tier: 0, findings: [] }),
    scanHtml: () => ({ tier: 0, findings: [] }),
    normalizeContentFormat: (v) => (v === 'html' ? 'html' : 'markdown'),
    generateRiskSummary: () => '',
    generateTierExplanation: () => '',
    RISK_TIER_LABELS: { 0: 'clean', 1: 'flagged', 2: 'high_risk', 3: 'quarantined' },
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop]
      // Default: return a no-op function. Avoids cascading "X is not a
      // function" errors as the route stack walks helper imports it does
      // not actually exercise in markdown-only happy paths.
      return () => null
    },
  },
)
const htmlDraftValidationMock = {
  scanHtmlContentForPersistence: async () => null,
}
const htmlKillSwitchMock = { isHtmlUploadsEnabled: async () => ({ enabled: true }) }
const moderationEngineMock = {
  isModerationEnabled: () => false,
  scanContent: async () => null,
}
const plagiarismFingerprintMock = { updateFingerprint: vi.fn(async () => null) }
const plagiarismMock = { findSimilarSheets: vi.fn(async () => []) }
const plagiarismScanMock = { runPlagiarismScan: vi.fn(async () => null) }
const activityTrackerMock = {
  trackActivity: vi.fn(async (_p, userId, kind) => {
    // Simulate user daily activity insert
    const today = new Date().toISOString().slice(0, 10)
    const existing = state.userDailyActivities.find((a) => a.userId === userId && a.date === today)
    if (existing) {
      existing[kind] = (existing[kind] || 0) + 1
    } else {
      state.userDailyActivities.push({
        id: state.nextActivityId++,
        userId,
        date: today,
        commits: 0,
        sheets: 0,
        reviews: 0,
        comments: 0,
        [kind]: 1,
      })
    }
  }),
}
const abuseDetectionMock = { runAbuseChecks: vi.fn(async () => null) }
const provenanceMock = { createProvenanceToken: () => 'token' }
const previewTextMock = {
  extractPreviewText: (s) => String(s || '').slice(0, 200),
}
const getUserPlanMock = {
  getUserPlan: vi.fn(async () => 'free'),
  getUserTier: vi.fn(async () => 'free'),
}
const paymentsConstantsMock = {
  PLANS: {
    free: {
      uploadsPerMonth: -1, // unlimited for the test
      privateGroups: 0,
      aiMessagesPerDay: 30,
      storageMb: 50,
    },
    pro_monthly: { uploadsPerMonth: -1, privateGroups: 5, aiMessagesPerDay: 120, storageMb: 1000 },
  },
  DONATION_MIN_CENTS: 100,
  DONATION_MAX_CENTS: 100000,
  DONATION_MESSAGE_MAX_LENGTH: 280,
  planFromPriceId: () => null,
}

// Notification mock — fan-in writes to state.notifications
const notifyModuleMock = notifyMock

// Legal service mock — needed by auth/register
const legalServiceMock = {
  CURRENT_LEGAL_VERSION: '1.0',
  LEGAL_ACCEPTANCE_SOURCES: { REGISTER: 'register' },
  recordCurrentRequiredLegalAcceptancesTx: vi.fn(async () => undefined),
}

// trustGate mock — register uses TRUST_LEVELS
const trustGateMock = {
  TRUST_LEVELS: { UNVERIFIED: 'unverified', VERIFIED: 'verified', TRUSTED: 'trusted' },
  shouldAutoPublish: (_user) => true, // tests run as trusted users
}

// auth.service mock — we intercept just enough so register can run
let issuedSessions = []
const authServiceMock = {
  validateRegistrationInput: (body) => {
    if (!body.username || body.username.length < 3) {
      const e = new Error('Username must be at least 3 characters.')
      e.status = 400
      throw e
    }
    if (!body.email || !body.email.includes('@')) {
      const e = new Error('Valid email required.')
      e.status = 400
      throw e
    }
    if (!body.password || body.password.length < 8) {
      const e = new Error('Password must be at least 8 characters.')
      e.status = 400
      throw e
    }
    return {
      username: body.username,
      email: body.email,
      password: body.password,
      accountType: body.accountType || 'student',
    }
  },
  sendVerificationCodeEmail: vi.fn(async () => undefined),
  issueAuthenticatedSession: vi.fn(async (_res, userId) => {
    const user = state.users.find((u) => u.id === userId)
    issuedSessions.push({ userId })
    return {
      id: userId,
      username: user?.username,
      email: user?.email,
      role: user?.accountType || 'student',
      twoFaEnabled: false,
    }
  }),
  handleAuthError: (req, res, error) => {
    const status = error.status || 500
    res
      .status(status)
      .json({ error: error.message, code: status === 500 ? 'INTERNAL' : 'AUTH_ERROR' })
  },
  AppError: class extends Error {
    constructor(status, message) {
      super(message)
      this.status = status
    }
  },
}

const verificationChallengesMock = {
  VERIFICATION_PURPOSE: { SIGNUP: 'signup' },
  consumeChallenge: vi.fn(async () => undefined),
  createSignupChallenge: vi.fn(async () => ({ challenge: {}, code: '000000' })),
  findChallengeByToken: vi.fn(async () => null),
  mapChallengeForClient: vi.fn(() => ({})),
  resendSignupChallenge: vi.fn(async () => ({ challenge: {}, code: '000000' })),
  verifyChallengeCode: vi.fn(async () => null),
}

const referralsServiceMock = {
  attachReferral: vi.fn(async () => undefined),
}

const authConstantsMock = {
  USERNAME_REGEX: /^[a-zA-Z0-9_]{3,20}$/,
  PASSWORD_MIN_LENGTH: 8,
  COURSE_CODE_REGEX: /^[A-Z0-9-]{2,20}$/,
  loginLimiter: passthroughLimiter,
  registerLimiter: passthroughLimiter,
  verificationLimiter: passthroughLimiter,
  forgotLimiter: passthroughLimiter,
  logoutLimiter: passthroughLimiter,
  googleLimiter: passthroughLimiter,
}

// ── Mock targets ────────────────────────────────────────────────────
const mockTargets = new Map([
  [require.resolve('../../src/lib/prisma'), prismaMock],
  [require.resolve('../../src/middleware/auth'), fakeAuthMiddleware],
  [require.resolve('../../src/middleware/requireVerifiedEmail'), fakeRequireVerifiedEmail],
  [require.resolve('../../src/middleware/originAllowlist'), fakeOriginAllowlistFactory],
  [require.resolve('../../src/core/auth/requireAuth'), fakeAuthMiddleware],
  [require.resolve('../../src/core/auth/optionalAuth'), fakeOptionalAuth],
  [require.resolve('../../src/core/auth/requireVerifiedEmail'), fakeRequireVerifiedEmail],
  [require.resolve('../../src/core/db/prisma'), prismaMock],
  [require.resolve('../../src/core/monitoring/sentry'), sentryMock],
  [require.resolve('../../src/monitoring/sentry'), sentryMock],
  [require.resolve('../../src/lib/rateLimiters'), rateLimitersMock],
  [require.resolve('../../src/lib/notify'), notifyModuleMock],
  [require.resolve('../../src/lib/events'), eventsMock],
  [require.resolve('../../src/lib/passwordSafety'), passwordSafetyMock],
  [require.resolve('../../src/lib/authTokens'), authTokensMock],
  [require.resolve('../../src/lib/trustGate'), trustGateMock],
  [require.resolve('../../src/lib/badges'), achievementsMock],
  [require.resolve('../../src/modules/achievements'), achievementsMock],
  [require.resolve('../../src/lib/html/htmlSecurity'), htmlSecurityMock],
  [require.resolve('../../src/lib/html/htmlDraftValidation'), htmlDraftValidationMock],
  [require.resolve('../../src/lib/html/htmlKillSwitch'), htmlKillSwitchMock],
  [require.resolve('../../src/lib/moderation/moderationEngine'), moderationEngineMock],
  [require.resolve('../../src/lib/plagiarismService'), plagiarismFingerprintMock],
  [require.resolve('../../src/lib/plagiarism'), plagiarismMock],
  [require.resolve('../../src/modules/plagiarism/plagiarism.service'), plagiarismScanMock],
  [require.resolve('../../src/lib/activityTracker'), activityTrackerMock],
  [require.resolve('../../src/lib/abuseDetection'), abuseDetectionMock],
  [require.resolve('../../src/lib/provenance'), provenanceMock],
  [require.resolve('../../src/lib/sheets/extractPreviewText'), previewTextMock],
  [require.resolve('../../src/lib/getUserPlan'), getUserPlanMock],
  [require.resolve('../../src/modules/payments/payments.constants'), paymentsConstantsMock],
  [require.resolve('../../src/modules/legal/legal.service'), legalServiceMock],
  [
    require.resolve('../../src/lib/verification/verificationChallenges'),
    verificationChallengesMock,
  ],
  [require.resolve('../../src/modules/referrals/referrals.service'), referralsServiceMock],
  [require.resolve('../../src/modules/auth/auth.service'), authServiceMock],
  [require.resolve('../../src/modules/auth/auth.constants'), authConstantsMock],
])

const originalLoad = Module._load
let app

const onboardingRoutePath = require.resolve('../../src/modules/onboarding')
const sheetsRoutePath = require.resolve('../../src/modules/sheets')

beforeAll(() => {
  Module._load = function patchedLoad(requestId, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      if (mockTargets.has(resolved)) return mockTargets.get(resolved)
    } catch {
      /* fall through */
    }
    return originalLoad.apply(this, arguments)
  }

  // Clear and re-require route modules so they pick up the patched loads.
  // Note: we don't mount the real /auth router — it pulls in webauthn,
  // google OAuth, panic-mode controllers, etc. The signup step here is
  // simulated via a direct call to authService.validateRegistrationInput +
  // a User.create on the mock. Real auth flows are covered by the dedicated
  // auth.routes.test.js / auth.cookies.test.js tests.
  delete require.cache[onboardingRoutePath]
  delete require.cache[sheetsRoutePath]

  const onboardingRouter = require('../../src/modules/onboarding')
  const sheetsRouter = require('../../src/modules/sheets')

  app = express()
  app.use(express.json({ limit: '2mb' }))

  // Simulated /auth/register endpoint — exercises the same validation +
  // user-create + legal-acceptance code paths that the real controller
  // would hit, but skips the OAuth / WebAuthn imports.
  app.post('/auth/register', async (req, res) => {
    try {
      const { username, email, password, accountType } = authServiceMock.validateRegistrationInput(
        req.body || {},
      )
      const breach = await passwordSafetyMock.checkPasswordBreach(password)
      if (breach.breached) {
        return res.status(400).json({
          error: `Password appeared in ${breach.count} breaches.`,
          code: 'BREACHED_PASSWORD',
        })
      }
      // Conflict checks
      const existingU = await prismaMock.user.findUnique({
        where: { username },
        select: { id: true },
      })
      if (existingU) {
        return res.status(409).json({ error: 'Username taken.', code: 'CONFLICT' })
      }
      const existingE = await prismaMock.user.findUnique({ where: { email }, select: { id: true } })
      if (existingE) {
        return res.status(409).json({ error: 'Email in use.', code: 'CONFLICT' })
      }
      const user = await prismaMock.user.create({
        data: {
          username,
          email,
          accountType,
          passwordHash: 'bcrypt-hash-stub',
          emailVerified: true,
          createdAt: new Date(),
          termsAcceptedVersion: legalServiceMock.CURRENT_LEGAL_VERSION,
        },
      })
      await legalServiceMock.recordCurrentRequiredLegalAcceptancesTx(prismaMock, user.id, {
        acceptedAt: new Date(),
        source: 'register',
      })
      const sessionUser = await authServiceMock.issueAuthenticatedSession(res, user.id, req)
      // PostHog: signup event
      eventsMock.trackServerEvent(user.id, eventsMock.EVENTS.SIGNUP_COMPLETED, { method: 'email' })
      res.status(201).json({ message: 'Account created!', user: sessionUser })
    } catch (err) {
      authServiceMock.handleAuthError(req, res, err)
    }
  })

  app.use('/onboarding', onboardingRouter.default || onboardingRouter)
  app.use('/sheets', sheetsRouter.default || sheetsRouter)

  // Express default error handler — controllers send their own 500s, so this
  // is only a safety net for unexpected throws.
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err?.message || 'Server error' })
  })
})

afterAll(() => {
  Module._load = originalLoad
  delete require.cache[onboardingRoutePath]
  delete require.cache[sheetsRoutePath]
})

beforeEach(() => {
  vi.clearAllMocks()
  reset()
  issuedSessions = []
})

// ─────────────────────────────────────────────────────────────────────
// Scenario
// ─────────────────────────────────────────────────────────────────────

describe('Integration: signup → onboarding → first sheet', () => {
  it('walks a new user from registration through their first published sheet', async () => {
    // ── Step 1: register ────────────────────────────────────────────
    const registerRes = await request(app)
      .post('/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send({
        username: 'newstudent',
        email: 'newstudent@example.com',
        password: 'CorrectHorseBatteryStaple1!',
        accountType: 'student',
      })

    expect(registerRes.status).toBe(201)
    expect(registerRes.body.message).toMatch(/Account created/i)
    expect(registerRes.body.user).toMatchObject({
      username: 'newstudent',
      email: 'newstudent@example.com',
    })

    // The new user is now in our in-memory store
    const newUserId = registerRes.body.user.id
    expect(state.users.find((u) => u.id === newUserId)).toBeTruthy()

    // ── Step 2: GET onboarding state ────────────────────────────────
    // The onboarding service uses User.createdAt to gate access. Our
    // mock User.create stamps `createdAt: new Date()` so the user is
    // eligible.
    const stateRes = await request(app)
      .get('/onboarding/state')
      .set('x-test-user-id', String(newUserId))
      .set('x-test-role', 'student')

    expect(stateRes.status).toBe(200)
    expect(stateRes.body.onboarding).toMatchObject({
      currentStep: 1,
      completed: false,
      skipped: false,
    })

    // ── Step 3: submit step 1 (welcome) ─────────────────────────────
    const step1Res = await request(app)
      .post('/onboarding/step')
      .set('x-test-user-id', String(newUserId))
      .set('x-test-role', 'student')
      .send({ step: 1, payload: {} })

    expect(step1Res.status).toBe(200)
    expect(step1Res.body.onboarding.currentStep).toBe(2)

    // ── Step 4: submit step 2 (school) ──────────────────────────────
    const step2Res = await request(app)
      .post('/onboarding/step')
      .set('x-test-user-id', String(newUserId))
      .set('x-test-role', 'student')
      .send({ step: 2, payload: { schoolId: 1 } })

    expect(step2Res.status).toBe(200)
    expect(step2Res.body.onboarding.currentStep).toBe(3)
    expect(step2Res.body.onboarding.progress.schoolSelected).toBe(true)

    // ── Step 5: submit step 3 (courses) ─────────────────────────────
    const step3Res = await request(app)
      .post('/onboarding/step')
      .set('x-test-user-id', String(newUserId))
      .set('x-test-role', 'student')
      .send({ step: 3, payload: { courseIds: [10] } })

    expect(step3Res.status).toBe(200)
    expect(step3Res.body.onboarding.currentStep).toBe(4)
    expect(step3Res.body.onboarding.progress.coursesAdded).toBe(1)
    // Side-effect: enrollment row created via createMany.
    expect(state.enrollments.find((e) => e.userId === newUserId && e.courseId === 10)).toBeTruthy()

    // ── Step 6: skip the rest ────────────────────────────────────────
    const skipRes = await request(app)
      .post('/onboarding/skip')
      .set('x-test-user-id', String(newUserId))
      .set('x-test-role', 'student')

    expect(skipRes.status).toBe(200)
    expect(skipRes.body.onboarding.skipped).toBe(true)

    // ── Step 7: create first sheet ──────────────────────────────────
    const sheetRes = await request(app)
      .post('/sheets')
      .set('x-test-user-id', String(newUserId))
      .set('x-test-role', 'student')
      .send({
        title: 'My first study sheet',
        content: '# Lecture 1\n\nIntroduction to OOP.',
        courseId: 10,
        contentFormat: 'markdown',
      })

    expect(sheetRes.status).toBe(201)
    // Loop A2: first sheet creation surfaces a flag the frontend uses to
    // route into the celebration toast.
    expect(sheetRes.body.firstCreation).toBe(true)
    expect(sheetRes.body.title).toBe('My first study sheet')

    // ── Side-effect: SHEET_FIRST_CREATED PostHog event ──────────────
    const sheetFirstCreatedEvent = state.trackedEvents.find(
      (e) => e.event === 'sheet_first_created' && e.userId === newUserId,
    )
    expect(sheetFirstCreatedEvent).toBeTruthy()
    expect(sheetFirstCreatedEvent.props.sheetId).toBe(sheetRes.body._id)

    // ── Side-effect: SHEET_PUBLISH achievement event emitted (Loop A4) ──
    const sheetPublishEvent = state.emittedAchievementEvents.find(
      (e) => e.kind === 'sheet.publish' && e.userId === newUserId,
    )
    expect(sheetPublishEvent).toBeTruthy()
    expect(sheetPublishEvent.metadata.sheetId).toBe(sheetRes.body._id)

    // ── Side-effect: activity tracker was called for streak foundation ──
    expect(activityTrackerMock.trackActivity).toHaveBeenCalledWith(
      expect.anything(),
      newUserId,
      'sheets',
    )

    // ── Side-effect: an onboarding step completed analytics event fired ──
    const onboardingEvents = state.trackedEvents.filter(
      (e) => e.event === 'onboarding_step_completed',
    )
    expect(onboardingEvents.length).toBeGreaterThanOrEqual(3) // steps 1, 2, 3

    // ── Second create should NOT carry firstCreation:true ───────────
    const secondSheetRes = await request(app)
      .post('/sheets')
      .set('x-test-user-id', String(newUserId))
      .set('x-test-role', 'student')
      .send({
        title: 'My second study sheet',
        content: '# Lecture 2',
        courseId: 10,
        contentFormat: 'markdown',
      })
    expect(secondSheetRes.status).toBe(201)
    expect(secondSheetRes.body.firstCreation).toBe(false)
    // SHEET_FIRST_CREATED should NOT fire again
    const firstCreatedEvents = state.trackedEvents.filter((e) => e.event === 'sheet_first_created')
    expect(firstCreatedEvents).toHaveLength(1)
  })

  it('rejects sheet creation when not authenticated', async () => {
    const res = await request(app)
      .post('/sheets')
      .send({ title: 'No auth', content: 'x', courseId: 10 })
    expect(res.status).toBe(401)
  })

  it('rejects onboarding step submission when not authenticated', async () => {
    const res = await request(app).post('/onboarding/step').send({ step: 1, payload: {} })
    expect(res.status).toBe(401)
  })

  it('rejects onboarding step 2 without schoolId', async () => {
    // Seed an onboarding row at step 2 directly
    state.users.push({ id: 200, username: 'u200', email: 'u200@x.com', createdAt: new Date() })
    state.onboarding.push({
      id: state.nextOnboardingId++,
      userId: 200,
      currentStep: 2,
      completedAt: null,
      skippedAt: null,
      schoolSelected: false,
      coursesAdded: 0,
      firstActionType: null,
      invitesSent: 0,
    })

    const res = await request(app)
      .post('/onboarding/step')
      .set('x-test-user-id', '200')
      .set('x-test-role', 'student')
      .send({ step: 2, payload: {} })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/schoolId is required/i)
  })
})
