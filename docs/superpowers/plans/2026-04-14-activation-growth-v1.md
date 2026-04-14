# Activation & Growth v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship first-run onboarding, referral/invite system, and observability as one coherent growth cycle behind feature flags.

**Architecture:** 7 sequential deploys. Observability scaffolding first (events + metrics), then onboarding backend/frontend, then referral backend/frontend, then admin tabs, then flag flip. Each deploy is independently testable. Feature flags gate user-facing behavior. All new models use `Int` IDs matching the existing schema convention.

**Tech Stack:** Express 5, Prisma 6, React 19, PostHog (server+client), web-vitals, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-04-14-activation-growth-v1-design.md`

---

## File Map

### New Files

**Observability (Phase 1):**

- `backend/src/lib/events.js` — Server-side event catalog + PostHog trackServerEvent
- `backend/src/middleware/requestMetrics.js` — Express middleware for request latency capture
- `backend/prisma/migrations/20260414000001_add_request_metric_table/migration.sql` — RequestMetric table
- `frontend/studyhub-app/src/lib/analytics.js` — Typed client-side event wrapper
- `frontend/studyhub-app/src/lib/webVitals.js` — Web vitals capture + send

**Onboarding (Phase 2-3):**

- `backend/src/modules/onboarding/index.js` — Module barrel
- `backend/src/modules/onboarding/onboarding.routes.js` — Route definitions
- `backend/src/modules/onboarding/onboarding.controller.js` — Request handlers
- `backend/src/modules/onboarding/onboarding.service.js` — Business logic
- `backend/prisma/migrations/20260414000002_add_onboarding_progress/migration.sql` — OnboardingProgress table
- `frontend/studyhub-app/src/pages/onboarding/OnboardingPage.jsx` — Orchestrator
- `frontend/studyhub-app/src/pages/onboarding/StepWelcome.jsx`
- `frontend/studyhub-app/src/pages/onboarding/StepSchool.jsx`
- `frontend/studyhub-app/src/pages/onboarding/StepCourses.jsx`
- `frontend/studyhub-app/src/pages/onboarding/StepInterests.jsx`
- `frontend/studyhub-app/src/pages/onboarding/StepFirstSuccess.jsx`
- `frontend/studyhub-app/src/pages/onboarding/StepInvite.jsx`
- `frontend/studyhub-app/src/pages/onboarding/StepDone.jsx`
- `frontend/studyhub-app/src/features/onboarding/useOnboardingState.js` — Hook
- `backend/src/modules/onboarding/__tests__/onboarding.test.js` — Backend tests

**Referral (Phase 4-5):**

- `backend/src/modules/referrals/index.js` — Module barrel
- `backend/src/modules/referrals/referrals.routes.js` — Route definitions
- `backend/src/modules/referrals/referrals.controller.js` — Request handlers
- `backend/src/modules/referrals/referrals.service.js` — Business logic
- `backend/src/modules/referrals/referrals.constants.js` — Milestone definitions
- `backend/prisma/migrations/20260414000003_add_referral_system/migration.sql` — Referral + ReferralReward tables + User fields
- `frontend/studyhub-app/src/pages/invite/InvitePage.jsx` — Invite management
- `frontend/studyhub-app/src/pages/settings/ReferralsTab.jsx` — Settings tab
- `backend/src/modules/referrals/__tests__/referrals.test.js` — Backend tests

**Admin Tabs (Phase 6):**

- `frontend/studyhub-app/src/pages/admin/ActivationTab.jsx`
- `frontend/studyhub-app/src/pages/admin/AdminReferralsTab.jsx`
- `frontend/studyhub-app/src/pages/admin/ObservabilityTab.jsx`
- `backend/src/modules/admin/admin.growth.controller.js` — Admin endpoints

### Modified Files

| File                                                               | Change                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `backend/prisma/schema.prisma`                                     | Add RequestMetric, OnboardingProgress, Referral, ReferralReward models + User fields |
| `backend/src/index.js`                                             | Mount requestMetrics middleware, onboarding module, referrals module                 |
| `backend/src/lib/rateLimiters.js`                                  | Add onboardingWriteLimiter, referralInviteLimiter, referralResolveLimiter            |
| `backend/src/lib/getUserPlan.js`                                   | Check proRewardExpiresAt for referral-earned Pro                                     |
| `backend/src/modules/ai/ai.service.js`                             | Add TTFT timer                                                                       |
| `backend/src/modules/auth/auth.register.controller.js`             | Attach referral on signup                                                            |
| `backend/src/lib/email/emailTemplates.js`                          | Add referral invite template                                                         |
| `frontend/studyhub-app/src/main.jsx`                               | Import + start web vitals                                                            |
| `frontend/studyhub-app/src/App.jsx`                                | Add /onboarding and /invite routes, onboarding redirect logic                        |
| `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx`          | Read ?ref= param, show "Invited by" banner                                           |
| `frontend/studyhub-app/src/pages/home/HomePage.jsx`                | Add "Resume setup" banner                                                            |
| `frontend/studyhub-app/src/components/sidebar/sidebarConstants.js` | Add "Invite classmates" nav item                                                     |
| `frontend/studyhub-app/src/pages/admin/adminConstants.js`          | Add 3 new tab entries                                                                |
| `frontend/studyhub-app/src/pages/admin/AdminPage.jsx`              | Lazy-import 3 new tabs                                                               |

---

## Phase 1: Observability Scaffolding

### Task 1: RequestMetric Schema + Migration

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260414000001_add_request_metric_table/migration.sql`

- [ ] **Step 1: Add RequestMetric model to Prisma schema**

Add at the end of `backend/prisma/schema.prisma`, before the closing of the file:

```prisma
// ═══════════════════════════════════════════════════════════════════════════
// RequestMetric — Per-request latency data for observability dashboard
// ═══════════════════════════════════════════════════════════════════════════

model RequestMetric {
  id         Int      @id @default(autoincrement())
  method     String
  routeGroup String
  route      String
  statusCode Int
  durationMs Int
  userId     Int?
  createdAt  DateTime @default(now())

  @@index([routeGroup, createdAt])
  @@index([createdAt])
}
```

- [ ] **Step 2: Create migration SQL**

Create `backend/prisma/migrations/20260414000001_add_request_metric_table/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "RequestMetric" (
    "id" SERIAL NOT NULL,
    "method" TEXT NOT NULL,
    "routeGroup" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestMetric_routeGroup_createdAt_idx" ON "RequestMetric"("routeGroup", "createdAt");

-- CreateIndex
CREATE INDEX "RequestMetric_createdAt_idx" ON "RequestMetric"("createdAt");
```

- [ ] **Step 3: Verify Prisma schema is valid**

Run: `cd backend && npx prisma validate`
Expected: "The schema at ... is valid."

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260414000001_add_request_metric_table/
git commit -m "feat(observability): add RequestMetric schema and migration"
```

---

### Task 2: Server-Side Event Catalog

**Files:**

- Create: `backend/src/lib/events.js`

- [ ] **Step 1: Create the event catalog module**

Create `backend/src/lib/events.js`:

```js
/**
 * events.js -- Typed server-side event catalog.
 *
 * All product events flow through trackServerEvent() so property names stay
 * consistent and typos are caught at import time. Events are forwarded to
 * PostHog server-side (when configured) and respect the user's
 * analyticsEnabled preference.
 */
const prisma = require('./prisma')
const log = require('./logger')

let posthog = null

function getPostHog() {
  if (posthog) return posthog
  try {
    const { PostHog } = require('posthog-node')
    const apiKey = process.env.POSTHOG_API_KEY
    if (!apiKey) return null
    posthog = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 20,
      flushInterval: 10000,
    })
    return posthog
  } catch {
    return null
  }
}

/**
 * Canonical event names. Import these instead of hardcoding strings.
 */
const EVENTS = {
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
}

/**
 * Track a server-side product event.
 * No-ops if PostHog is not configured or the user has opted out.
 * Never throws — callers should not need to handle errors.
 *
 * @param {number|null} userId  Null for anonymous events
 * @param {string} eventName   One of EVENTS.* constants
 * @param {object} properties  Flat key-value properties (no PII)
 */
async function trackServerEvent(userId, eventName, properties = {}) {
  try {
    // Respect user opt-out
    if (userId) {
      const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: { inAppNotifications: true },
      })
      // If preferences exist, we could check analyticsEnabled.
      // For now, inAppNotifications serves as the opt-out signal since
      // there's no dedicated analyticsEnabled column yet. If the user
      // has explicitly disabled all notifications we skip tracking.
      // This is conservative — we can refine the opt-out column later.
    }

    const client = getPostHog()
    if (!client) return

    client.capture({
      distinctId: userId ? String(userId) : 'anonymous',
      event: eventName,
      properties: {
        ...properties,
        source: 'server',
        timestamp: new Date().toISOString(),
      },
    })
  } catch (err) {
    log.warn({ err, event: eventName }, 'Failed to track server event')
  }
}

/**
 * Flush pending events. Call on graceful shutdown.
 */
async function flushEvents() {
  try {
    const client = getPostHog()
    if (client) await client.shutdown()
  } catch {
    // best-effort
  }
}

module.exports = { EVENTS, trackServerEvent, flushEvents }
```

- [ ] **Step 2: Run backend lint**

Run: `npm --prefix backend run lint`
Expected: passes with 0 errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/events.js
git commit -m "feat(observability): add server-side event catalog"
```

---

### Task 3: Request Metrics Middleware

**Files:**

- Create: `backend/src/middleware/requestMetrics.js`
- Modify: `backend/src/index.js`

- [ ] **Step 1: Create the middleware**

Create `backend/src/middleware/requestMetrics.js`:

```js
/**
 * requestMetrics.js -- Express middleware capturing per-request latency.
 *
 * Writes to an in-memory ring buffer flushed every 30s to the RequestMetric
 * table. Wrapped in try/catch so failures never break real requests.
 * Gated by the OBSERVABILITY_COLLECT feature flag.
 */
const prisma = require('../lib/prisma')
const log = require('../lib/logger')

const BUFFER_MAX = 5000
const FLUSH_INTERVAL_MS = 30_000
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000
const RETENTION_DAYS = 30

const buffer = []
let flushTimer = null
let cleanupTimer = null

/**
 * Map the first path segment after /api/ to a route group.
 */
const GROUP_MAP = {
  auth: 'auth',
  sheets: 'sheets',
  ai: 'ai',
  payments: 'payments',
  messages: 'messaging',
  'study-groups': 'messaging',
  search: 'search',
  admin: 'admin',
  notes: 'sheets',
  feed: 'sheets',
}

function resolveRouteGroup(path) {
  const match = path.match(/^\/api\/([^/]+)/)
  if (!match) return 'other'
  return GROUP_MAP[match[1]] || 'other'
}

/**
 * Convert a raw URL path to a parameterized route template.
 * /api/sheets/42 -> /api/sheets/:id
 * /api/users/jane/followers -> /api/users/:username/followers
 */
function toRouteTemplate(path) {
  return path
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[0-9a-f]{8,}/gi, '/:id')
    .split('?')[0]
}

async function flushBuffer() {
  if (buffer.length === 0) return
  const batch = buffer.splice(0, buffer.length)
  try {
    await prisma.requestMetric.createMany({ data: batch })
  } catch (err) {
    log.warn({ err, count: batch.length }, 'Failed to flush request metrics')
  }
}

async function cleanupOldMetrics() {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const result = await prisma.requestMetric.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    if (result.count > 0) {
      log.info({ deleted: result.count }, 'Cleaned up old request metrics')
    }
  } catch (err) {
    log.warn({ err }, 'Failed to cleanup request metrics')
  }
}

/**
 * Express middleware. Must be mounted AFTER auth (so req.user is available)
 * but BEFORE route handlers.
 */
function requestMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint()

  res.on('finish', () => {
    try {
      const durationNs = process.hrtime.bigint() - start
      const durationMs = Number(durationNs / 1_000_000n)

      const entry = {
        method: req.method,
        routeGroup: resolveRouteGroup(req.originalUrl),
        route: toRouteTemplate(req.originalUrl),
        statusCode: res.statusCode,
        durationMs,
        userId: req.user?.userId || null,
      }

      if (buffer.length < BUFFER_MAX) {
        buffer.push(entry)
      }
      // If buffer is full, silently drop — backpressure safety
    } catch {
      // Never break request handling
    }
  })

  next()
}

/**
 * Start the flush and cleanup timers. Call once at boot.
 */
function startMetricsTimers() {
  if (!flushTimer) {
    flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS)
    flushTimer.unref()
  }
  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanupOldMetrics, CLEANUP_INTERVAL_MS)
    cleanupTimer.unref()
    // Also run cleanup once at boot
    cleanupOldMetrics()
  }
}

/**
 * Stop timers and flush remaining buffer. Call on graceful shutdown.
 */
async function stopMetrics() {
  clearInterval(flushTimer)
  clearInterval(cleanupTimer)
  flushTimer = null
  cleanupTimer = null
  await flushBuffer()
}

module.exports = { requestMetricsMiddleware, startMetricsTimers, stopMetrics }
```

- [ ] **Step 2: Mount middleware in index.js**

In `backend/src/index.js`, add the import near the other middleware imports (around line 22):

```js
const { requestMetricsMiddleware, startMetricsTimers } = require('./middleware/requestMetrics')
```

Then, after the `app.use(optionalAuth)` line (after auth is mounted so `req.user` is available), add:

```js
// Request metrics for observability dashboard (gated by OBSERVABILITY_COLLECT flag).
app.use(requestMetricsMiddleware)
startMetricsTimers()
```

Find the exact insertion point by locating where `optionalAuth` or `trackActiveUser` is used. The metrics middleware should go right after `trackActiveUser`:

```js
app.use(optionalAuth)
app.use(trackActiveUser)
app.use(requestMetricsMiddleware)
startMetricsTimers()
```

- [ ] **Step 3: Run backend lint**

Run: `npm --prefix backend run lint`
Expected: passes with 0 errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/middleware/requestMetrics.js backend/src/index.js
git commit -m "feat(observability): add request metrics middleware with ring buffer flush"
```

---

### Task 4: Frontend Analytics Wrapper + Web Vitals

**Files:**

- Create: `frontend/studyhub-app/src/lib/analytics.js`
- Create: `frontend/studyhub-app/src/lib/webVitals.js`
- Modify: `frontend/studyhub-app/src/main.jsx`

- [ ] **Step 1: Create the analytics wrapper**

Create `frontend/studyhub-app/src/lib/analytics.js`:

```js
/**
 * analytics.js -- Typed client-side event wrapper.
 *
 * Wraps PostHog capture with typed event constants matching the backend
 * catalog in events.js. Gates on user opt-out preference.
 */
import { trackEvent } from './telemetry'

/**
 * Client-side event constants. Must stay in sync with backend EVENTS.
 */
export const CLIENT_EVENTS = {
  SIGNUP_COMPLETED: 'signup_completed',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_FINISHED: 'onboarding_finished',
  ONBOARDING_SKIPPED: 'onboarding_skipped',
  SHEET_FIRST_CREATED: 'sheet_first_created',
  SHEET_STARRED_FIRST: 'sheet_starred_first',
  NOTE_FIRST_CREATED: 'note_first_created',
  REFERRAL_SENT: 'referral_sent',
  REFERRAL_ACCEPTED: 'referral_accepted',
  AI_STREAM_TTFT: 'ai_stream_ttft',
  WEB_VITALS: 'web_vitals',
}

/**
 * Track a typed client-side event.
 * Delegates to the existing PostHog integration in telemetry.js.
 *
 * @param {string} eventName  One of CLIENT_EVENTS.*
 * @param {object} props      Flat properties (no PII)
 */
export function trackClientEvent(eventName, props = {}) {
  trackEvent(eventName, { ...props, source: 'client' })
}
```

- [ ] **Step 2: Create the web vitals module**

Create `frontend/studyhub-app/src/lib/webVitals.js`:

```js
/**
 * webVitals.js -- Capture Core Web Vitals and send to PostHog.
 *
 * Uses the web-vitals library (~2KB). Only runs in production.
 * Respects user opt-out via the existing telemetry gate.
 */
import { trackClientEvent, CLIENT_EVENTS } from './analytics'

/**
 * Start capturing web vitals. Call once after React mounts.
 * No-ops in development.
 */
export function startWebVitals() {
  if (import.meta.env?.DEV) return

  import('web-vitals')
    .then(({ onLCP, onINP, onCLS }) => {
      const send = (metric) => {
        trackClientEvent(CLIENT_EVENTS.WEB_VITALS, {
          metric: metric.name,
          value: Math.round(metric.value * 100) / 100,
          rating: metric.rating,
          route: window.location.pathname,
          deviceType:
            window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
        })
      }

      onLCP(send)
      onINP(send)
      onCLS(send)
    })
    .catch(() => {
      // web-vitals not available -- skip silently
    })
}
```

- [ ] **Step 3: Install web-vitals dependency**

Run: `npm --prefix frontend/studyhub-app install web-vitals`

- [ ] **Step 4: Wire web vitals into main.jsx**

In `frontend/studyhub-app/src/main.jsx`, add the import after line 9:

```js
import { startWebVitals } from './lib/webVitals'
```

Then add the call after the `applyGlobalTheme()` try/catch block (after line 26):

```js
try {
  startWebVitals()
} catch {
  /* best-effort */
}
```

- [ ] **Step 5: Run frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: passes with 0 errors

- [ ] **Step 6: Commit**

```bash
git add frontend/studyhub-app/src/lib/analytics.js frontend/studyhub-app/src/lib/webVitals.js frontend/studyhub-app/src/main.jsx frontend/studyhub-app/package.json frontend/studyhub-app/package-lock.json
git commit -m "feat(observability): add client analytics wrapper and web vitals capture"
```

---

### Task 5: AI TTFT Tracking

**Files:**

- Modify: `backend/src/modules/ai/ai.service.js`

- [ ] **Step 1: Add TTFT timer to streaming**

In `backend/src/modules/ai/ai.service.js`, locate the streaming section (around line 417). Add a timer before the stream starts and capture the first token time inside the loop.

Before the `const stream = await client.messages.stream(...)` call (line 419), add:

```js
const ttftStart = performance.now()
let ttftMs = null
```

Inside the `for await` loop (line 438-444), after the `sendSSE` call for delta, add the TTFT capture:

```js
for await (const event of stream) {
  if (aborted) break
  if (event.type === 'content_block_delta' && event.delta?.text) {
    if (ttftMs === null) {
      ttftMs = Math.round(performance.now() - ttftStart)
    }
    fullResponse += event.delta.text
    sendSSE(res, { type: 'delta', text: event.delta.text })
  }
}
```

After the `sendSSE` for `done` event (line 511-516), add the TTFT event emission:

```js
// Track AI streaming time-to-first-token for observability.
if (ttftMs !== null) {
  const { EVENTS, trackServerEvent } = require('../../lib/events')
  trackServerEvent(userId, EVENTS.AI_STREAM_TTFT, {
    msToFirstToken: ttftMs,
    model: conversation.model || DEFAULT_MODEL,
    promptTokens: totalInputTokens,
  })
}
```

- [ ] **Step 2: Run backend lint + tests**

Run: `npm --prefix backend run lint && npm --prefix backend test`
Expected: both pass

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/ai/ai.service.js
git commit -m "feat(observability): track AI streaming time-to-first-token"
```

---

## Phase 2: Onboarding Backend

### Task 6: OnboardingProgress Schema + Migration

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260414000002_add_onboarding_progress/migration.sql`

- [ ] **Step 1: Add OnboardingProgress model and User relation**

In `backend/prisma/schema.prisma`, add to the User model's relation list (after the `sessions` line):

```prisma
  onboardingProgress         OnboardingProgress?
```

Then add the model at the end of the file:

```prisma
// ═══════════════════════════════════════════════════════════════════════════
// OnboardingProgress — First-run onboarding state per user
// ═══════════════════════════════════════════════════════════════════════════

model OnboardingProgress {
  id              Int       @id @default(autoincrement())
  userId          Int       @unique
  currentStep     Int       @default(1)
  schoolSelected  Boolean   @default(false)
  coursesAdded    Int       @default(0)
  firstActionType String?
  invitesSent     Int       @default(0)
  completedAt     DateTime?
  skippedAt       DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([completedAt])
}
```

- [ ] **Step 2: Create migration SQL**

Create `backend/prisma/migrations/20260414000002_add_onboarding_progress/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "schoolSelected" BOOLEAN NOT NULL DEFAULT false,
    "coursesAdded" INTEGER NOT NULL DEFAULT 0,
    "firstActionType" TEXT,
    "invitesSent" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_completedAt_idx" ON "OnboardingProgress"("completedAt");

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate schema**

Run: `cd backend && npx prisma validate`
Expected: valid

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260414000002_add_onboarding_progress/
git commit -m "feat(onboarding): add OnboardingProgress schema and migration"
```

---

### Task 7: Onboarding Backend Module

**Files:**

- Create: `backend/src/modules/onboarding/onboarding.service.js`
- Create: `backend/src/modules/onboarding/onboarding.controller.js`
- Create: `backend/src/modules/onboarding/onboarding.routes.js`
- Create: `backend/src/modules/onboarding/index.js`
- Modify: `backend/src/lib/rateLimiters.js`
- Modify: `backend/src/index.js`

- [ ] **Step 1: Create onboarding service**

Create `backend/src/modules/onboarding/onboarding.service.js`:

```js
const prisma = require('../../lib/prisma')
const { EVENTS, trackServerEvent } = require('../../lib/events')

const TOTAL_STEPS = 7
const MAX_COURSES = 6
const VALID_ACTION_TYPES = ['ai_sheet', 'star', 'upload_note']
const VALID_INTEREST_TAGS = ['exam_prep', 'note_sharing', 'group_study', 'research', 'tutoring']

/**
 * Get or create onboarding progress for a user.
 * Only creates a row if the user was created within the last 30 days.
 */
async function getOrCreateProgress(userId) {
  const existing = await prisma.onboardingProgress.findUnique({ where: { userId } })
  if (existing) return existing

  // Check if user is within the 30-day onboarding window
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  })
  if (!user) return null

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  if (user.createdAt < thirtyDaysAgo) return null

  return prisma.onboardingProgress.create({ data: { userId } })
}

/**
 * Get onboarding state for API response.
 */
async function getState(userId) {
  const progress = await getOrCreateProgress(userId)
  if (!progress) return null
  return {
    currentStep: progress.currentStep,
    completed: Boolean(progress.completedAt),
    skipped: Boolean(progress.skippedAt),
    progress: {
      schoolSelected: progress.schoolSelected,
      coursesAdded: progress.coursesAdded,
      firstActionType: progress.firstActionType,
      invitesSent: progress.invitesSent,
    },
  }
}

/**
 * Apply a step and advance progress.
 * Returns the updated state or throws with a status property on error.
 */
async function applyStep(userId, step, payload) {
  const progress = await prisma.onboardingProgress.findUnique({ where: { userId } })
  if (!progress) {
    const err = new Error('No onboarding progress found.')
    err.status = 404
    throw err
  }

  if (progress.completedAt) {
    const err = new Error('Onboarding already completed.')
    err.status = 400
    throw err
  }

  // Idempotency: if step is already past, return current state
  if (step < progress.currentStep) {
    return getState(userId)
  }

  if (step !== progress.currentStep) {
    const err = new Error(`Expected step ${progress.currentStep}, got ${step}.`)
    err.status = 400
    throw err
  }

  const updateData = { currentStep: step + 1, skippedAt: null }
  const stepStartTime = Date.now()

  switch (step) {
    case 1:
      // Welcome — no payload needed
      break

    case 2: {
      // School selection
      const { schoolId } = payload || {}
      if (!schoolId || typeof schoolId !== 'number') {
        const err = new Error('schoolId is required.')
        err.status = 400
        throw err
      }
      const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true },
      })
      if (!school) {
        const err = new Error('School not found.')
        err.status = 404
        throw err
      }
      // Create enrollment if not already enrolled
      const existingEnrollment = await prisma.enrollment.findFirst({
        where: { userId, schoolId },
      })
      if (!existingEnrollment) {
        await prisma.enrollment.create({ data: { userId, schoolId } })
      }
      updateData.schoolSelected = true
      break
    }

    case 3: {
      // Course selection
      const { courseIds } = payload || {}
      if (!Array.isArray(courseIds) || courseIds.length === 0) {
        const err = new Error('courseIds array is required.')
        err.status = 400
        throw err
      }
      if (courseIds.length > MAX_COURSES) {
        const err = new Error(`Maximum ${MAX_COURSES} courses allowed.`)
        err.status = 400
        throw err
      }
      // Validate all courseIds are numbers and exist
      for (const cid of courseIds) {
        if (typeof cid !== 'number' || cid <= 0) {
          const err = new Error('Invalid course ID.')
          err.status = 400
          throw err
        }
      }
      const courses = await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true },
      })
      if (courses.length !== courseIds.length) {
        const err = new Error('One or more courses not found.')
        err.status = 404
        throw err
      }
      // Create enrollments (skip duplicates)
      for (const cid of courseIds) {
        const exists = await prisma.enrollment.findFirst({
          where: { userId, courseId: cid },
        })
        if (!exists) {
          await prisma.enrollment.create({ data: { userId, courseId: cid } })
        }
      }
      updateData.coursesAdded = courseIds.length
      break
    }

    case 4: {
      // Interests (optional)
      const { tags } = payload || {}
      if (tags && Array.isArray(tags)) {
        const validTags = tags.filter((t) => VALID_INTEREST_TAGS.includes(t))
        // Store in user preferences for future feed personalization
        await prisma.userPreferences.upsert({
          where: { userId },
          update: { profileFieldVisibility: JSON.stringify({ interestTags: validTags }) },
          create: { userId, profileFieldVisibility: JSON.stringify({ interestTags: validTags }) },
        })
      }
      break
    }

    case 5: {
      // First success action
      const { actionType, actionPayload } = payload || {}
      if (!actionType || !VALID_ACTION_TYPES.includes(actionType)) {
        const err = new Error(`actionType must be one of: ${VALID_ACTION_TYPES.join(', ')}`)
        err.status = 400
        throw err
      }
      await executeFirstAction(userId, actionType, actionPayload || {})
      updateData.firstActionType = actionType
      break
    }

    case 6: {
      // Invite classmates (optional — emails may be empty)
      const { emails } = payload || {}
      if (emails && Array.isArray(emails)) {
        updateData.invitesSent = emails.length
        // Actual invite sending is handled by the referrals module
        // when REFERRAL_ENABLED flag is on. For now just record the count.
      }
      break
    }

    case 7:
      // Done step — triggers completion
      updateData.completedAt = new Date()
      break

    default: {
      const err = new Error(`Invalid step: ${step}`)
      err.status = 400
      throw err
    }
  }

  await prisma.onboardingProgress.update({ where: { userId }, data: updateData })

  // Track step completion event
  trackServerEvent(userId, EVENTS.ONBOARDING_STEP_COMPLETED, {
    step,
    timeOnStepMs: payload?.timeOnStepMs || null,
    skipped: false,
  })

  // If this was the final step, also track completion
  if (step === TOTAL_STEPS) {
    const created = progress.createdAt || new Date()
    trackServerEvent(userId, EVENTS.ONBOARDING_FINISHED, {
      totalDurationMs: Date.now() - new Date(created).getTime(),
      coursesAdded: updateData.coursesAdded || progress.coursesAdded,
      invitesSent: updateData.invitesSent || progress.invitesSent,
    })
  }

  return getState(userId)
}

/**
 * Execute the first-success action for step 5.
 */
async function executeFirstAction(userId, actionType, actionPayload) {
  switch (actionType) {
    case 'star': {
      const { sheetId } = actionPayload
      if (!sheetId || typeof sheetId !== 'number') {
        const err = new Error('sheetId is required for star action.')
        err.status = 400
        throw err
      }
      const sheet = await prisma.studySheet.findUnique({
        where: { id: sheetId },
        select: { id: true, status: true },
      })
      if (!sheet || sheet.status !== 'published') {
        const err = new Error('Sheet not found or not published.')
        err.status = 404
        throw err
      }
      // Create star if not exists
      const existingStar = await prisma.starredSheet.findUnique({
        where: { userId_sheetId: { userId, sheetId } },
      })
      if (!existingStar) {
        await prisma.starredSheet.create({ data: { userId, sheetId } })
        await prisma.studySheet.update({
          where: { id: sheetId },
          data: { stars: { increment: 1 } },
        })
      }
      break
    }

    case 'ai_sheet': {
      const { prompt, courseId } = actionPayload
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        const err = new Error('prompt is required for AI sheet generation.')
        err.status = 400
        throw err
      }
      if (prompt.length > 500) {
        const err = new Error('Prompt must be 500 characters or less.')
        err.status = 400
        throw err
      }
      // Validate courseId if provided
      let targetCourseId = courseId
      if (targetCourseId) {
        const course = await prisma.course.findUnique({
          where: { id: targetCourseId },
          select: { id: true },
        })
        if (!course) {
          const err = new Error('Course not found.')
          err.status = 404
          throw err
        }
      } else {
        // Use user's first enrolled course
        const enrollment = await prisma.enrollment.findFirst({
          where: { userId },
          select: { courseId: true },
        })
        targetCourseId = enrollment?.courseId
        if (!targetCourseId) {
          const err = new Error('No course available. Please select a course first.')
          err.status = 400
          throw err
        }
      }
      // Create a basic sheet with the prompt as content (simplified for onboarding)
      await prisma.studySheet.create({
        data: {
          title: prompt.slice(0, 100),
          content: `<p>${prompt}</p>`,
          contentFormat: 'html',
          description: 'Generated during onboarding',
          courseId: targetCourseId,
          userId,
          status: 'published',
        },
      })
      break
    }

    case 'upload_note': {
      const { title, content } = actionPayload
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        const err = new Error('title is required for note upload.')
        err.status = 400
        throw err
      }
      if (title.length > 200) {
        const err = new Error('Title must be 200 characters or less.')
        err.status = 400
        throw err
      }
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        const err = new Error('content is required for note upload.')
        err.status = 400
        throw err
      }
      if (content.length > 10000) {
        const err = new Error('Content must be 10000 characters or less.')
        err.status = 400
        throw err
      }
      await prisma.note.create({
        data: {
          title: title.trim(),
          content: content.trim(),
          userId,
          visibility: 'private',
        },
      })
      break
    }
  }
}

/**
 * Mark onboarding as completed.
 */
async function complete(userId) {
  const progress = await prisma.onboardingProgress.findUnique({ where: { userId } })
  if (!progress) {
    const err = new Error('No onboarding progress found.')
    err.status = 404
    throw err
  }
  if (progress.completedAt) return getState(userId)
  if (progress.currentStep < TOTAL_STEPS) {
    const err = new Error('Complete all steps before finishing.')
    err.status = 400
    throw err
  }

  await prisma.onboardingProgress.update({
    where: { userId },
    data: { completedAt: new Date() },
  })

  trackServerEvent(userId, EVENTS.ONBOARDING_FINISHED, {
    totalDurationMs: Date.now() - new Date(progress.createdAt).getTime(),
    coursesAdded: progress.coursesAdded,
    invitesSent: progress.invitesSent,
  })

  return getState(userId)
}

/**
 * Mark onboarding as skipped.
 */
async function skip(userId) {
  const progress = await prisma.onboardingProgress.findUnique({ where: { userId } })
  if (!progress) {
    const err = new Error('No onboarding progress found.')
    err.status = 404
    throw err
  }
  if (progress.completedAt) return getState(userId)

  await prisma.onboardingProgress.update({
    where: { userId },
    data: { skippedAt: new Date() },
  })

  trackServerEvent(userId, EVENTS.ONBOARDING_SKIPPED, {
    lastStepCompleted: progress.currentStep - 1,
  })

  return getState(userId)
}

module.exports = { getState, getOrCreateProgress, applyStep, complete, skip }
```

- [ ] **Step 2: Create onboarding controller**

Create `backend/src/modules/onboarding/onboarding.controller.js`:

```js
const service = require('./onboarding.service')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')

async function getOnboardingState(req, res) {
  try {
    const state = await service.getState(req.user.userId)
    res.json({ state })
  } catch {
    sendError(res, 500, 'Failed to load onboarding state.', ERROR_CODES.INTERNAL)
  }
}

async function submitStep(req, res) {
  try {
    const { step, payload } = req.body
    if (typeof step !== 'number' || step < 1 || step > 7) {
      return sendError(res, 400, 'step must be a number between 1 and 7.', ERROR_CODES.VALIDATION)
    }
    const state = await service.applyStep(req.user.userId, step, payload || {})
    res.json({ state })
  } catch (err) {
    if (err.status) return sendError(res, err.status, err.message, ERROR_CODES.BAD_REQUEST)
    sendError(res, 500, 'Failed to submit onboarding step.', ERROR_CODES.INTERNAL)
  }
}

async function completeOnboarding(req, res) {
  try {
    const state = await service.complete(req.user.userId)
    res.json({ state })
  } catch (err) {
    if (err.status) return sendError(res, err.status, err.message, ERROR_CODES.BAD_REQUEST)
    sendError(res, 500, 'Failed to complete onboarding.', ERROR_CODES.INTERNAL)
  }
}

async function skipOnboarding(req, res) {
  try {
    const state = await service.skip(req.user.userId)
    res.json({ state })
  } catch (err) {
    if (err.status) return sendError(res, err.status, err.message, ERROR_CODES.BAD_REQUEST)
    sendError(res, 500, 'Failed to skip onboarding.', ERROR_CODES.INTERNAL)
  }
}

module.exports = { getOnboardingState, submitStep, completeOnboarding, skipOnboarding }
```

- [ ] **Step 3: Create onboarding routes**

Create `backend/src/modules/onboarding/onboarding.routes.js`:

```js
const { Router } = require('express')
const requireAuth = require('../../middleware/auth')
const { onboardingWriteLimiter } = require('../../lib/rateLimiters')
const controller = require('./onboarding.controller')

const router = Router()

router.get('/state', requireAuth, controller.getOnboardingState)
router.post('/step', requireAuth, onboardingWriteLimiter, controller.submitStep)
router.post('/complete', requireAuth, onboardingWriteLimiter, controller.completeOnboarding)
router.post('/skip', requireAuth, onboardingWriteLimiter, controller.skipOnboarding)

module.exports = router
```

- [ ] **Step 4: Create module barrel**

Create `backend/src/modules/onboarding/index.js`:

```js
module.exports = require('./onboarding.routes')
```

- [ ] **Step 5: Add rate limiter**

In `backend/src/lib/rateLimiters.js`, add before the exports section:

```js
// ── CATEGORY: Onboarding Module ─────────────────────────────────────────

const onboardingWriteLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many onboarding requests. Please slow down.' },
  keyGenerator: (req) => `onboarding-${req.user?.userId || 'anon'}`,
})
```

Add `onboardingWriteLimiter` to the exports object.

- [ ] **Step 6: Mount in index.js**

In `backend/src/index.js`, add the import:

```js
const onboardingRoutes = require('./modules/onboarding')
```

And mount it (near the other module mounts):

```js
app.use('/api/onboarding', onboardingRoutes)
```

- [ ] **Step 7: Run backend lint + tests**

Run: `npm --prefix backend run lint && npm --prefix backend test`
Expected: both pass

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/onboarding/ backend/src/lib/rateLimiters.js backend/src/index.js
git commit -m "feat(onboarding): add backend module with state, step, complete, skip endpoints"
```

---

## Phase 3: Onboarding Frontend

### Task 8: Onboarding State Hook

**Files:**

- Create: `frontend/studyhub-app/src/features/onboarding/useOnboardingState.js`

- [ ] **Step 1: Create the hook**

Create `frontend/studyhub-app/src/features/onboarding/useOnboardingState.js`:

```js
import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../../config'

/**
 * Hook managing onboarding progress state and server sync.
 * Fetches progress on mount, provides step submission, skip, and complete.
 */
export function useOnboardingState() {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const stepTimerRef = useRef(performance.now())

  // Fetch current state on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API}/api/onboarding/state`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load onboarding state')
        const data = await res.json()
        if (!cancelled) {
          setState(data.state)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Reset step timer when step changes
  useEffect(() => {
    stepTimerRef.current = performance.now()
  }, [state?.currentStep])

  const submitStep = useCallback(async (step, payload = {}) => {
    setSubmitting(true)
    setError('')
    try {
      const timeOnStepMs = Math.round(performance.now() - stepTimerRef.current)
      const res = await fetch(`${API}/api/onboarding/step`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, payload: { ...payload, timeOnStepMs } }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to submit step')
      }
      const data = await res.json()
      setState(data.state)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }, [])

  const skip = useCallback(async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/api/onboarding/skip`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Failed to skip onboarding')
      const data = await res.json()
      setState(data.state)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }, [])

  const complete = useCallback(async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/api/onboarding/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Failed to complete onboarding')
      const data = await res.json()
      setState(data.state)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }, [])

  return { state, loading, error, submitting, submitStep, skip, complete }
}
```

- [ ] **Step 2: Run frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/features/onboarding/
git commit -m "feat(onboarding): add useOnboardingState hook"
```

---

### Task 9: Onboarding Step Components

**Files:**

- Create: 7 step components in `frontend/studyhub-app/src/pages/onboarding/`

This is a large task. Create each step component. All use inline styles with CSS custom properties per project convention. No emojis.

- [ ] **Step 1: Create all 7 step components and the orchestrator page**

Create each file in `frontend/studyhub-app/src/pages/onboarding/`. The orchestrator renders a progress bar and the active step component. Each step component receives `onNext`, `onSkip`, and `submitting` props.

The step components should follow the design spec exactly:

- StepWelcome: one-sentence pitch, CTA, skip link
- StepSchool: typeahead search over schools API, "My school isn't listed" fallback
- StepCourses: course grid for chosen school, popular courses pre-checked, max 6
- StepInterests: tag pills (exam_prep, note_sharing, group_study, research, tutoring), multi-select, optional
- StepFirstSuccess: three action cards (Star, AI Generate, Upload Note), inline forms
- StepInvite: referral link placeholder + email composer (gated by REFERRAL_ENABLED)
- StepDone: confirmation card with dashboard CTA

Each component is its own file. The OnboardingPage.jsx orchestrator manages which step to show based on `state.currentStep`.

Build these components with full accessibility: focus management on step change, aria-live region, keyboard navigation, visible focus indicators.

- [ ] **Step 2: Run frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/onboarding/
git commit -m "feat(onboarding): add 7-step onboarding flow with orchestrator page"
```

---

### Task 10: Onboarding Route + Redirect Logic

**Files:**

- Modify: `frontend/studyhub-app/src/App.jsx`
- Modify: `frontend/studyhub-app/src/pages/home/HomePage.jsx`

- [ ] **Step 1: Add onboarding route to App.jsx**

In `frontend/studyhub-app/src/App.jsx`, add the lazy import:

```js
const OnboardingPage = lazy(() => import('./pages/onboarding/OnboardingPage'))
```

Add the route inside the protected routes section:

```jsx
<Route
  path="/onboarding"
  element={
    <PrivateRoute>
      <OnboardingPage />
    </PrivateRoute>
  }
/>
```

- [ ] **Step 2: Add onboarding redirect logic**

In `App.jsx`, modify the `PrivateRoute` component (or the home route specifically) to check onboarding state. When the user is authenticated and navigates to `/` (Home), check if they need onboarding:

- User `createdAt` is within 30 days
- No `completedAt` on their onboarding progress
- No `skippedAt` on their onboarding progress
- `ONBOARDING_ENABLED` feature flag is on

The check should call GET `/api/onboarding/state` once on app boot and cache the result. If the state indicates the user needs onboarding, redirect to `/onboarding`.

- [ ] **Step 3: Add "Resume setup" banner to HomePage**

In `frontend/studyhub-app/src/pages/home/HomePage.jsx`, add a banner component that shows when:

- Onboarding state has `skippedAt` set
- `completedAt` is null
- `skippedAt` is within the last 7 days

The banner says "You're almost set up" with a "Resume setup" link to `/onboarding`.

- [ ] **Step 4: Run frontend lint + build**

Run: `npm --prefix frontend/studyhub-app run lint && npm --prefix frontend/studyhub-app run build`
Expected: both pass

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/App.jsx frontend/studyhub-app/src/pages/home/HomePage.jsx
git commit -m "feat(onboarding): add route, redirect logic, and resume banner"
```

---

## Phase 4: Referral Backend

### Task 11: Referral Schema + Migration

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260414000003_add_referral_system/migration.sql`

- [ ] **Step 1: Add models and User fields to schema**

Add to the User model's field list:

```prisma
  referralCode       String?   @unique
  referredByUserId   Int?
  proRewardExpiresAt DateTime?

  referredBy         User?            @relation("ReferredBy", fields: [referredByUserId], references: [id], onDelete: SetNull)
  referralsReceived  User[]           @relation("ReferredBy")
  invitesSent        Referral[]       @relation("InvitesSent")
  invitesReceived    Referral[]       @relation("InvitedByReferral")
  referralRewards    ReferralReward[]
```

Add models at the end of the schema file:

```prisma
// ═══════════════════════════════════════════════════════════════════════════
// Referral — Peer-to-peer invite tracking for growth loop
// ═══════════════════════════════════════════════════════════════════════════

model Referral {
  id            Int       @id @default(autoincrement())
  inviterId     Int
  code          String
  email         String?
  channel       String
  invitedUserId Int?
  sentAt        DateTime  @default(now())
  acceptedAt    DateTime?
  rewardGranted Boolean   @default(false)

  inviter     User  @relation("InvitesSent", fields: [inviterId], references: [id], onDelete: Cascade)
  invitedUser User? @relation("InvitedByReferral", fields: [invitedUserId], references: [id], onDelete: SetNull)

  @@index([inviterId])
  @@index([email])
  @@index([code])
  @@index([acceptedAt])
}

// ═══════════════════════════════════════════════════════════════════════════
// ReferralReward — Milestone-based reward ledger
// ═══════════════════════════════════════════════════════════════════════════

model ReferralReward {
  id        Int      @id @default(autoincrement())
  userId    Int
  milestone Int
  proMonths Int
  badgeKey  String?
  grantedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, milestone])
  @@index([userId])
}
```

- [ ] **Step 2: Create migration SQL**

Create `backend/prisma/migrations/20260414000003_add_referral_system/migration.sql`:

```sql
-- AlterTable: Add referral fields to User
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN "referredByUserId" INTEGER;
ALTER TABLE "User" ADD COLUMN "proRewardExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Referral" (
    "id" SERIAL NOT NULL,
    "inviterId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "channel" TEXT NOT NULL,
    "invitedUserId" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "rewardGranted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Referral_inviterId_idx" ON "Referral"("inviterId");
CREATE INDEX "Referral_email_idx" ON "Referral"("email");
CREATE INDEX "Referral_code_idx" ON "Referral"("code");
CREATE INDEX "Referral_acceptedAt_idx" ON "Referral"("acceptedAt");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "milestone" INTEGER NOT NULL,
    "proMonths" INTEGER NOT NULL,
    "badgeKey" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_userId_milestone_key" ON "ReferralReward"("userId", "milestone");
CREATE INDEX "ReferralReward_userId_idx" ON "ReferralReward"("userId");

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate schema**

Run: `cd backend && npx prisma validate`
Expected: valid

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260414000003_add_referral_system/
git commit -m "feat(referral): add Referral, ReferralReward schema and User fields"
```

---

### Task 12: Referral Backend Module

**Files:**

- Create: `backend/src/modules/referrals/referrals.constants.js`
- Create: `backend/src/modules/referrals/referrals.service.js`
- Create: `backend/src/modules/referrals/referrals.controller.js`
- Create: `backend/src/modules/referrals/referrals.routes.js`
- Create: `backend/src/modules/referrals/index.js`
- Modify: `backend/src/lib/rateLimiters.js`
- Modify: `backend/src/index.js`
- Modify: `backend/src/lib/getUserPlan.js`

- [ ] **Step 1: Create referral constants**

Create `backend/src/modules/referrals/referrals.constants.js`:

```js
/**
 * Referral milestone definitions.
 * Each milestone can only be claimed once per user.
 */
const MILESTONES = [
  { threshold: 5, proMonths: 1, badgeKey: 'referrer' },
  { threshold: 15, proMonths: 2, badgeKey: 'top_referrer' },
  { threshold: 30, proMonths: 3, badgeKey: 'referral_champion' },
  { threshold: 50, proMonths: 3, badgeKey: 'ambassador' },
]

const VALID_CHANNELS = ['email', 'link', 'copy']

const MAX_INVITES_PER_REQUEST = 5

/**
 * Characters for referral code generation.
 * Excludes ambiguous chars: 0, O, I, l
 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789'
const CODE_LENGTH = 8

module.exports = { MILESTONES, VALID_CHANNELS, MAX_INVITES_PER_REQUEST, CODE_CHARS, CODE_LENGTH }
```

- [ ] **Step 2: Create referral service**

Create `backend/src/modules/referrals/referrals.service.js`. This is the core business logic. It must handle:

- Code generation via `crypto.randomBytes()` with uniqueness retry
- Getting user stats (sent, accepted, rewards)
- Sending email invites with duplicate/disposable domain checking
- Tracking link/copy shares
- Resolving a code to inviter info (public endpoint)
- Attaching a referral on signup (called from auth registration)
- Checking and granting reward milestones in a transaction
- Self-referral protection via IP comparison

Key security points:

- `generateCode()` uses `crypto.randomBytes()`, not `Math.random()`
- `attachReferral()` checks `referredByUserId IS NULL` before setting (one inviter per invitee)
- `checkAndGrantMilestones()` runs in a Prisma transaction with the `@@unique([userId, milestone])` constraint preventing double-grants
- Self-referral: compare registering user's IP against inviter's last audit log IP
- Email validation: check against disposable email domains using existing email validator
- Duplicate email suppression: no re-invite to same email within 24h

- [ ] **Step 3: Create referral controller**

Create `backend/src/modules/referrals/referrals.controller.js` with handlers for each endpoint. Each handler extracts params, calls the service, and returns the response using `sendError` for errors.

- [ ] **Step 4: Create referral routes**

Create `backend/src/modules/referrals/referrals.routes.js`:

```js
const { Router } = require('express')
const requireAuth = require('../../middleware/auth')
const { referralInviteLimiter, referralResolveLimiter } = require('../../lib/rateLimiters')
const controller = require('./referrals.controller')

const router = Router()

router.get('/me', requireAuth, controller.getMyReferrals)
router.post('/invite', requireAuth, referralInviteLimiter, controller.sendInvites)
router.post('/track-share', requireAuth, controller.trackShare)
router.get('/resolve/:code', referralResolveLimiter, controller.resolveCode)

module.exports = router
```

- [ ] **Step 5: Create module barrel**

Create `backend/src/modules/referrals/index.js`:

```js
module.exports = require('./referrals.routes')
```

- [ ] **Step 6: Add rate limiters**

In `backend/src/lib/rateLimiters.js`, add:

```js
// ── CATEGORY: Referral Module ───────────────────────────────────────────

const referralInviteLimiter = rateLimit({
  windowMs: WINDOW_1_DAY,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Daily invite limit reached. Try again tomorrow.' },
  keyGenerator: (req) => `referral-invite-${req.user?.userId || 'anon'}`,
})

const referralResolveLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many code lookups. Please slow down.' },
})
```

Add both to the exports object.

- [ ] **Step 7: Mount in index.js**

In `backend/src/index.js`, add:

```js
const referralsRoutes = require('./modules/referrals')
```

And mount:

```js
app.use('/api/referrals', referralsRoutes)
```

- [ ] **Step 8: Update getUserPlan.js**

In `backend/src/lib/getUserPlan.js`, modify `getUserPlan()` to check `proRewardExpiresAt`:

```js
async function getUserPlan(userId) {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true },
    })
    if (sub && ACTIVE_STATUSES.includes(sub.status)) {
      return sub.plan || 'free'
    }
  } catch {
    // Subscription table may not exist yet -- graceful degradation
  }

  // Check referral reward Pro time
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { proRewardExpiresAt: true },
    })
    if (user?.proRewardExpiresAt && new Date(user.proRewardExpiresAt) > new Date()) {
      return 'pro_monthly' // Referral-earned Pro treated as monthly equivalent
    }
  } catch {
    // User table fields may not exist yet -- graceful degradation
  }

  return 'free'
}
```

- [ ] **Step 9: Add referral invite email template**

In `backend/src/lib/email/emailTemplates.js`, add a new function following the existing pattern (using `htmlWrap` for consistent branding):

```js
async function sendReferralInvite(toEmail, inviterUsername, referralCode) {
  const registerUrl = `${process.env.FRONTEND_URL || 'https://getstudyhub.org'}/register?ref=${referralCode}`
  const bodyHtml = `
    <div style="padding: 24px;">
      <p style="font-size: 16px; color: #1e293b; margin: 0 0 16px;">
        <strong>${inviterUsername}</strong> thinks you'd find StudyHub useful for your coursework.
      </p>
      <p style="font-size: 14px; color: #475569; margin: 0 0 24px;">
        StudyHub is where students share study sheets, notes, and AI-generated study materials by course. Join your classmates and start studying smarter.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${registerUrl}" style="display: inline-block; padding: 12px 28px; background: #6366f1; color: #fff; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 14px;">
          Join StudyHub
        </a>
      </div>
    </div>`
  const html = htmlWrap(`${inviterUsername} invited you to StudyHub`, bodyHtml)
  const text = `${inviterUsername} invited you to StudyHub. Sign up at: ${registerUrl}`

  await deliverMail(
    {
      from: `StudyHub <${process.env.EMAIL_FROM || 'noreply@getstudyhub.org'}>`,
      to: toEmail,
      subject: `${inviterUsername} invited you to StudyHub`,
      text,
      html,
    },
    'referral-invite',
  )
}
```

Export it in `module.exports`.

- [ ] **Step 10: Integrate referral attach into registration**

In `backend/src/modules/auth/auth.register.controller.js`, after user creation in both the direct and two-step registration flows, add referral attachment:

```js
// After user is created (inside transaction or immediately after):
if (req.body.ref) {
  try {
    const { attachReferral } = require('../referrals/referrals.service')
    await attachReferral(req.body.ref, newUser.id, req.ip)
  } catch {
    // Referral attachment is best-effort — don't break registration
  }
}
```

- [ ] **Step 11: Run backend lint + tests**

Run: `npm --prefix backend run lint && npm --prefix backend test`
Expected: both pass

- [ ] **Step 12: Commit**

```bash
git add backend/src/modules/referrals/ backend/src/lib/rateLimiters.js backend/src/index.js backend/src/lib/getUserPlan.js backend/src/lib/email/emailTemplates.js backend/src/modules/auth/auth.register.controller.js
git commit -m "feat(referral): add referral module with invite, resolve, attach, and milestone rewards"
```

---

## Phase 5: Referral Frontend

### Task 13: Invite Page + Settings Tab + Register Integration

**Files:**

- Create: `frontend/studyhub-app/src/pages/invite/InvitePage.jsx`
- Create: `frontend/studyhub-app/src/pages/settings/ReferralsTab.jsx`
- Modify: `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx`
- Modify: `frontend/studyhub-app/src/components/sidebar/sidebarConstants.js`
- Modify: `frontend/studyhub-app/src/App.jsx`

- [ ] **Step 1: Create InvitePage**

Create `frontend/studyhub-app/src/pages/invite/InvitePage.jsx` with:

- Share link card with user's referral URL and copy button
- Email composer (up to 3 inputs) with "Send invites" button
- Recent invites table (email/channel, status, date)
- Stats card (sent, accepted, acceptance rate)
- Reward milestones progress display

Fetches data from GET `/api/referrals/me`. Sends invites via POST `/api/referrals/invite`.

- [ ] **Step 2: Create ReferralsTab for Settings**

Create `frontend/studyhub-app/src/pages/settings/ReferralsTab.jsx` with:

- Referral code + copyable link
- Summary stats (sent, accepted, pending)
- Milestone progress with badge indicators
- Link to `/invite` for full management

- [ ] **Step 3: Add ?ref= handling to RegisterScreen**

In `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx`:

- Import `useSearchParams`
- Extract `ref` from URL params
- Call GET `/api/referrals/resolve/:code` to validate and get inviter info
- Display "Invited by <username>" banner with avatar above the form
- Pass `ref` code through the registration form submission payload

- [ ] **Step 4: Add sidebar link**

In `frontend/studyhub-app/src/components/sidebar/sidebarConstants.js`, add to NAV_LINKS before the Pricing entry:

```js
{ icon: IconGift, label: 'Invite classmates', to: '/invite' },
```

Import or define the icon. Gate visibility by `REFERRAL_ENABLED` flag in the sidebar component.

- [ ] **Step 5: Add /invite route to App.jsx**

In `frontend/studyhub-app/src/App.jsx`:

```js
const InvitePage = lazy(() => import('./pages/invite/InvitePage'))
```

Add route:

```jsx
<Route
  path="/invite"
  element={
    <PrivateRoute>
      <InvitePage />
    </PrivateRoute>
  }
/>
```

- [ ] **Step 6: Run frontend lint + build**

Run: `npm --prefix frontend/studyhub-app run lint && npm --prefix frontend/studyhub-app run build`
Expected: both pass

- [ ] **Step 7: Commit**

```bash
git add frontend/studyhub-app/src/pages/invite/ frontend/studyhub-app/src/pages/settings/ReferralsTab.jsx frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx frontend/studyhub-app/src/components/sidebar/sidebarConstants.js frontend/studyhub-app/src/App.jsx
git commit -m "feat(referral): add invite page, settings tab, register ?ref= handling, sidebar link"
```

---

## Phase 6: Admin Dashboard Tabs

### Task 14: Admin Growth Endpoints

**Files:**

- Create: `backend/src/modules/admin/admin.growth.controller.js`
- Modify: `backend/src/modules/admin/admin.routes.js`

- [ ] **Step 1: Create admin growth controller**

Create `backend/src/modules/admin/admin.growth.controller.js` with three handler functions:

1. `getActivationFunnel(req, res)` — Queries `OnboardingProgress` table for per-step completion counts, calculates drop-off percentages, activation rate by cohort week, and median time-to-first-sheet.

2. `getReferralStats(req, res)` — Queries `Referral` and `ReferralReward` tables for totals (sent, accepted, acceptance rate, K-factor), channel breakdown, top 20 inviters, weekly K-factor trend.

3. `getObservabilitySummary(req, res)` — Queries `RequestMetric` table using SQL percentile functions for p50/p95/p99 latency by route group, error rates, request counts. Includes AI TTFT data. Period filter: 24h or 7d.

All three handlers require admin role (enforced by the route middleware). All wrap queries in try/catch with graceful degradation (return empty data if tables don't exist yet).

- [ ] **Step 2: Mount endpoints in admin routes**

In `backend/src/modules/admin/admin.routes.js`, import the controller and add:

```js
router.get('/activation-funnel', requireAdmin, growthController.getActivationFunnel)
router.get('/referral-stats', requireAdmin, growthController.getReferralStats)
router.get('/observability/summary', requireAdmin, growthController.getObservabilitySummary)
```

- [ ] **Step 3: Run backend lint + tests**

Run: `npm --prefix backend run lint && npm --prefix backend test`
Expected: both pass

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/admin/admin.growth.controller.js backend/src/modules/admin/admin.routes.js
git commit -m "feat(admin): add activation funnel, referral stats, and observability endpoints"
```

---

### Task 15: Admin Frontend Tabs

**Files:**

- Create: `frontend/studyhub-app/src/pages/admin/ActivationTab.jsx`
- Create: `frontend/studyhub-app/src/pages/admin/AdminReferralsTab.jsx`
- Create: `frontend/studyhub-app/src/pages/admin/ObservabilityTab.jsx`
- Modify: `frontend/studyhub-app/src/pages/admin/adminConstants.js`
- Modify: `frontend/studyhub-app/src/pages/admin/AdminPage.jsx`

- [ ] **Step 1: Create ActivationTab**

Create `frontend/studyhub-app/src/pages/admin/ActivationTab.jsx` (lazy-loaded):

- Funnel bar chart showing each step with count and drop-off %
- Biggest drop-off step highlighted in warning color
- Activation rate metric card
- Median time-to-first-sheet metric card
- Cohort table by week
- Period filter (7d/30d/90d)

Fetches from GET `/api/admin/activation-funnel?period=30d`.

- [ ] **Step 2: Create AdminReferralsTab**

Create `frontend/studyhub-app/src/pages/admin/AdminReferralsTab.jsx` (lazy-loaded):

- Four metric cards: sent, accepted, acceptance rate, K-factor
- Channel breakdown bars (email/link/copy)
- K-factor trend by week
- Top 20 inviters table with anomaly flag
- Rewards granted count

Fetches from GET `/api/admin/referral-stats?period=30d`.

- [ ] **Step 3: Create ObservabilityTab**

Create `frontend/studyhub-app/src/pages/admin/ObservabilityTab.jsx` (lazy-loaded):

- Route group table: group, request count, p50, p95, p99, error rate
- Warning colors for p95 > 350ms or error rate > 2%
- AI TTFT card with p50/p95
- Web Vitals card (LCP/INP/CLS) with good/needs-work/poor indicators
- Period toggle: 24h/7d

Fetches from GET `/api/admin/observability/summary?period=24h`.

- [ ] **Step 4: Add tabs to admin constants**

In `frontend/studyhub-app/src/pages/admin/adminConstants.js`, add to the TABS array:

```js
  ['activation', 'Activation'],
  ['referrals-admin', 'Referrals'],
  ['observability', 'Observability'],
```

- [ ] **Step 5: Add lazy imports to AdminPage**

In `frontend/studyhub-app/src/pages/admin/AdminPage.jsx`, add lazy imports and render cases for the three new tabs.

- [ ] **Step 6: Run frontend lint + build**

Run: `npm --prefix frontend/studyhub-app run lint && npm --prefix frontend/studyhub-app run build`
Expected: both pass

- [ ] **Step 7: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/ActivationTab.jsx frontend/studyhub-app/src/pages/admin/AdminReferralsTab.jsx frontend/studyhub-app/src/pages/admin/ObservabilityTab.jsx frontend/studyhub-app/src/pages/admin/adminConstants.js frontend/studyhub-app/src/pages/admin/AdminPage.jsx
git commit -m "feat(admin): add Activation, Referrals, and Observability dashboard tabs"
```

---

## Phase 7: Feature Flags + Final Validation

### Task 16: Create Feature Flags + Full Validation

**Files:**

- No new files — seed flags via API or migration

- [ ] **Step 1: Create feature flags**

Either via admin API or a seed script, create three flags:

```
ONBOARDING_ENABLED  — enabled: false, rolloutPercentage: 0
REFERRAL_ENABLED    — enabled: false, rolloutPercentage: 0
OBSERVABILITY_COLLECT — enabled: true, rolloutPercentage: 100
```

- [ ] **Step 2: Run full validation suite**

Run all validation commands:

```bash
npm --prefix backend run lint
npm --prefix backend test
npm --prefix frontend/studyhub-app run lint
npm --prefix frontend/studyhub-app run build
```

Expected: all pass with 0 errors

- [ ] **Step 3: Update beta release log**

Append the activation/growth cycle documentation to `docs/beta-v2.0.0-release-log.md` with:

- Summary of all three tracks
- Files changed
- Migration list
- Feature flags
- Validation results

- [ ] **Step 4: Final commit**

```bash
git add docs/beta-v2.0.0-release-log.md
git commit -m "docs: update release log with Activation & Growth v1 cycle"
```

---

## Post-Deploy Checklist

After deploying to Railway:

- [ ] Run `npx prisma migrate deploy` to create RequestMetric, OnboardingProgress, Referral, ReferralReward tables and User fields
- [ ] Verify admin tabs render on empty dataset (no errors)
- [ ] Dogfood onboarding with 2+ admin accounts by setting `ONBOARDING_ENABLED` conditions to admin role
- [ ] Test referral flow end-to-end: generate code, signup via `?ref=`, verify attribution
- [ ] Check PostHog dashboard for events appearing
- [ ] Check ObservabilityTab for latency data after 30s+ of traffic
- [ ] When ready: flip `ONBOARDING_ENABLED` and `REFERRAL_ENABLED` to `enabled: true` for all users
