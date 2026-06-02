/**
 * _helpers.js — Shared helpers for deep integration tests.
 *
 * These helpers build a self-contained Express app wired to in-memory Prisma
 * mocks, with all external services (Anthropic, Stripe, R2, Google Books, etc.)
 * stubbed out. Each scenario file builds its own state but reuses the patching
 * logic here to keep mock targets and store shape consistent.
 *
 * The mocking strategy follows the proven pattern in
 *   backend/test/sheet.workflow.integration.test.js
 * which uses Module._load patching to intercept every `require()` and swap in
 * our shared mocks. This lets us run the real Express route handlers, real
 * controllers, real serializers, and real middleware without booting Prisma,
 * Stripe, or Anthropic.
 *
 * Integration tests for full user flows.
 */
const Module = require('node:module')

/**
 * Build an in-memory store with tables we touch across scenarios. Each test
 * file can extend the returned object before installing the mock; the table
 * surface here is the union of every endpoint we exercise in T10.
 */
function buildStore() {
  return {
    nextUserId: 1,
    nextSheetId: 1,
    nextNoteId: 1,
    nextCommitId: 1,
    nextContributionId: 1,
    nextConversationId: 1,
    nextMessageId: 1,
    nextHighlightId: 1,
    nextSubscriptionId: 1,
    nextNotificationId: 1,
    nextOnboardingId: 1,
    nextAchievementEventId: 1,
    nextUserBadgeId: 1,
    nextStarId: 1,
    nextStreakId: 1,
    users: [],
    sheets: [],
    sheetCommits: [],
    sheetContributions: [],
    notes: [],
    noteHighlights: [],
    noteComments: [],
    conversations: [],
    messages: [],
    notifications: [],
    onboardingProgress: [],
    achievementEvents: [],
    userBadges: [],
    userDailyActivity: [],
    starredSheets: [],
    subscriptions: [],
    payments: [],
    courses: [
      {
        id: 10,
        code: 'CMSC131',
        name: 'Object-Oriented Programming I',
        schoolId: 1,
        school: { id: 1, name: 'University of Maryland', short: 'UMD' },
      },
    ],
    schools: [{ id: 1, name: 'University of Maryland', short: 'UMD' }],
    enrollments: [],
    badges: [
      // Minimal catalog so emitAchievementEvent's evaluators can find a target
      {
        slug: 'first-sheet',
        category: 'authoring',
        criteria: { type: 'count', target: 'sheet.publish', threshold: 1 },
        xp: 25,
      },
      {
        slug: 'first-fork',
        category: 'forking',
        criteria: { type: 'count', target: 'sheet.fork', threshold: 1 },
        xp: 25,
      },
    ],
    feedItems: [],
    // Sentinel that tests can read post-mortem
    events: [],
  }
}

/**
 * Make a tiny notification mock that records every notification it would have
 * sent. Tests assert on the resulting array. Mirrors the real createNotification
 * signature: createNotification(prisma, { userId, type, message, linkPath, priority, dedupKey })
 */
function buildNotifyMock(store) {
  return {
    createNotification: async function createNotification(_prisma, payload) {
      const record = {
        id: store.nextNotificationId++,
        ...payload,
        createdAt: new Date().toISOString(),
      }
      store.notifications.push(record)
      return record
    },
  }
}

/**
 * Build a minimal `req.user`-injecting auth middleware. Tests set
 * `x-test-user-id` / `x-test-role` headers to switch identity per request.
 */
function buildAuthMiddleware() {
  return function fakeAuth(req, res, next) {
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
}

function buildOptionalAuthMiddleware() {
  return function fakeOptionalAuth(req, _res, next) {
    const headerId = req.headers['x-test-user-id']
    if (!headerId) return next()
    const userId = Number(headerId)
    const role = String(req.headers['x-test-role'] || 'student')
    const username = String(req.headers['x-test-username'] || `user${userId}`)
    req.user = { userId, role, username }
    next()
  }
}

function passthroughMiddleware(_req, _res, next) {
  next()
}

function passthroughLimiter(_req, _res, next) {
  next()
}
passthroughLimiter.default = passthroughLimiter

/**
 * A no-op originAllowlist factory — wraps the import shape the real module
 * uses (the call returns a middleware).
 */
function buildOriginAllowlist() {
  const fn = function originAllowlistFactory() {
    return passthroughMiddleware
  }
  fn.normalizeOrigin = (v) => v
  fn.buildTrustedOrigins = () => new Set()
  fn.default = fn
  return fn
}

function buildRateLimitersMock() {
  // Every limiter the modules we touch import — they're all no-ops in tests.
  const limiter = passthroughLimiter
  return new Proxy(
    {},
    {
      get(_target, key) {
        if (key === 'default') return limiter
        if (key === '__esModule') return true
        // Functions that return a limiter (e.g. createAiMessageLimiter)
        if (typeof key === 'string' && key.startsWith('create')) return () => limiter
        return limiter
      },
    },
  )
}

/**
 * Install the patched Module._load. Returns a cleanup function the caller
 * MUST run in afterAll.
 */
function installModuleLoadPatch(mockTargets) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(requestId, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(requestId, parent, isMain)
      if (mockTargets.has(resolved)) {
        return mockTargets.get(resolved)
      }
    } catch {
      // fall through to original
    }
    return originalLoad.apply(this, arguments)
  }
  return function restore() {
    Module._load = originalLoad
  }
}

module.exports = {
  buildStore,
  buildNotifyMock,
  buildAuthMiddleware,
  buildOptionalAuthMiddleware,
  buildOriginAllowlist,
  buildRateLimitersMock,
  installModuleLoadPatch,
  passthroughMiddleware,
  passthroughLimiter,
}
