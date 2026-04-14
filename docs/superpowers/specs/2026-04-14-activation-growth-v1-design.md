# StudyHub Activation & Growth v1 — Design Spec

**Date**: 2026-04-14
**Scope**: First-run onboarding, referral/invite system, and observability
**Deploy strategy**: Sequential tracks with independent deploys behind feature flags
**Timeline**: ~2-3 weeks

---

## 1. Executive Summary

Three tightly coupled tracks ship as one coherent cycle:

- **Track 1 (Onboarding)**: 7-step guided flow for new users, inline first-success actions, persistent progress
- **Track 2 (Referral)**: Per-user stable invite code, email/link/copy channels, milestone-based rewards with Pro time and badges
- **Track 3 (Observability)**: Typed event catalog, request metrics middleware with `RequestMetric` table, web vitals, AI TTFT tracking
- **Cross-cutting**: Three new admin dashboard tabs (Activation, Referrals, Observability)

Each track deploys independently behind feature flags. Observability ships first so every subsequent track emits measurable events from day one.

### Success Metrics (90-day targets)

| Metric                 | Definition                                                                    | Target    |
| ---------------------- | ----------------------------------------------------------------------------- | --------- |
| Activation rate        | % new users completing onboarding AND creating/starring 1+ item within 7 days | >= 55%    |
| Time to first sheet    | Median minutes from signup to first published or starred sheet                | <= 4 min  |
| Invite acceptance rate | % of sent invites resulting in attributed signup                              | >= 20%    |
| Viral K-factor         | (avg invites per user) x (acceptance rate)                                    | >= 0.3    |
| Day-7 retention        | % new users returning between day 5 and 8                                     | >= 40%    |
| API p95 latency        | 95th percentile response time for authenticated reads                         | <= 350 ms |

---

## 2. Design Decisions (from brainstorming)

| Decision                       | Choice                                                                                                                              | Rationale                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Existing referral system       | Keep as-is (promo codes/gifts). New `Referral` model layered alongside for peer invites.                                            | Different purposes: admin promo vs. peer growth. Merging would compromise both.         |
| ID types                       | `Int @id @default(autoincrement())` and `Int` foreign keys for all new models.                                                      | Matches every existing model in the schema.                                             |
| Existing-user guard            | 30-day `createdAt` check only, no backfill.                                                                                         | Every existing user was created >30 days ago by definition. No migration script needed. |
| First-success UX               | All actions inline within `/onboarding` step 5. No navigation away.                                                                 | Navigating away during onboarding is the #1 funnel drop-off cause.                      |
| Request metrics storage        | `RequestMetric` PostgreSQL table with 30-day retention cleanup.                                                                     | Fast SQL percentile queries. No PostHog API dependency for admin dashboard.             |
| Referral reward for free users | Internal ledger via `User.proRewardExpiresAt`. No Stripe subscriptions for non-paying users.                                        | Avoids phantom Stripe subscriptions. `getUserPlan()` is the single source of truth.     |
| Reward progression             | Milestone tiers with mixed rewards (Pro time + permanent badges). No lifetime or 6-month grants. Max cumulative exposure: 9 months. | Clear goals, easy to communicate, capped cost exposure.                                 |

---

## 3. Track 1 — Observability Scaffolding

Ships first. No UI. Every subsequent track emits events from day one.

### 3.1 Backend Event Catalog (`backend/src/lib/events.js`)

Single `trackServerEvent(userId, eventName, properties)` function writing to PostHog server-side. Event names exported as constants — typos caught at import time.

```js
// Usage:
const { EVENTS, trackServerEvent } = require('../../lib/events')
trackServerEvent(userId, EVENTS.SIGNUP_COMPLETED, { method: 'email', schoolId: 5 })
```

**Canonical events:**

| Event                       | Trigger             | Key Properties                                   |
| --------------------------- | ------------------- | ------------------------------------------------ |
| `signup_completed`          | Registration commit | `method`, `hasReferralCode`, `schoolId`          |
| `onboarding_step_completed` | Each step done      | `step`, `timeOnStepMs`, `skipped`                |
| `onboarding_finished`       | Final step done     | `totalDurationMs`, `coursesAdded`, `invitesSent` |
| `onboarding_skipped`        | User skips          | `lastStepCompleted`                              |
| `sheet_first_created`       | First sheet publish | `source` (ai/upload/fork), `msSinceSignup`       |
| `sheet_starred_first`       | First star          | `msSinceSignup`                                  |
| `note_first_created`        | First note          | `msSinceSignup`                                  |
| `referral_sent`             | POST invite         | `channel` (email/link/copy)                      |
| `referral_accepted`         | Attach on signup    | `inviterId`, `channel`, `msFromSendToAccept`     |
| `referral_reward_granted`   | Milestone hit       | `milestone`, `rewardType`, `proMonths`           |
| `ai_stream_ttft`            | First SSE token     | `model`, `msToFirstToken`, `promptTokens`        |

**Privacy rules:**

- All events respect `analyticsEnabled` user preference. If false, `trackServerEvent` is a no-op.
- Never log raw email, message content, or sheet HTML. Only IDs, sizes, counts, booleans, durations.
- Admin aggregation endpoints enforce minimum group size of 5 users.

### 3.2 Request Metrics Middleware (`backend/src/middleware/requestMetrics.js`)

Express middleware capturing `method`, route template (not raw URL with params), `statusCode`, `durationMs`, `userId` (nullable for unauthenticated requests).

**Implementation:**

- Writes to in-memory ring buffer capped at 5000 entries.
- `setInterval` flushes to `RequestMetric` table every 30 seconds via `prisma.requestMetric.createMany()`.
- Route template extraction: strips path parameters (e.g., `/api/sheets/42` becomes `/api/sheets/:id`).
- Route groups for aggregation: `auth`, `sheets`, `ai`, `payments`, `messaging`, `search`, `admin`, `other`. Mapped from the first path segment after `/api/`.
- Entire middleware wrapped in try/catch — a failure never breaks the request.
- Gated by `OBSERVABILITY_COLLECT` feature flag (checked once at boot, not per-request).

**Security:**

- No request/response bodies logged. No headers logged. No query parameters logged.
- `userId` is the integer ID only — no PII.
- Route template uses parameterized form, never raw URLs that could contain tokens or sensitive query strings.

### 3.3 Database: `RequestMetric` Table

```prisma
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

Migration: `20260414000001_add_request_metric_table`

**Cleanup job:** Runs daily via a scheduled function (or on app boot + setInterval 24h). Deletes rows where `createdAt < now() - 30 days`. Uses `prisma.requestMetric.deleteMany({ where: { createdAt: { lt: cutoff } } })`.

### 3.4 Frontend Analytics Wrapper (`frontend/studyhub-app/src/lib/analytics.js`)

Wraps PostHog client with typed event names matching the backend catalog. Exports `trackClientEvent(name, props)`. Gates on user opt-out preference.

```js
// Usage:
import { CLIENT_EVENTS, trackClientEvent } from '../lib/analytics'
trackClientEvent(CLIENT_EVENTS.WEB_VITALS, { metric: 'LCP', value: 1800, route: '/feed' })
```

Existing `trackEvent` calls in `telemetry.js` continue working. New code uses `analytics.js`. No migration of existing calls required — they coexist.

### 3.5 Web Vitals (`frontend/studyhub-app/src/lib/webVitals.js`)

Uses `web-vitals` npm package (~2KB). Captures LCP, INP, CLS. Sends to PostHog via `trackClientEvent`. Only runs in production. Respects opt-out. Called from `main.jsx` after React mounts.

CSP safe: `web-vitals` is bundled via Vite (self-hosted), posts to PostHog over `https://us.i.posthog.com` which is already in the CSP `connect-src`.

### 3.6 AI TTFT Tracking

In `backend/src/modules/ai/ai.service.js`:

- Start timer when SSE response begins (`res.write` for first header).
- Capture timestamp of first `delta` event written to the stream.
- Emit `ai_stream_ttft` with `msToFirstToken`, `model`, `promptTokens`.
- No changes to the streaming protocol — measurement only.

### 3.7 Files

| File                                                                              | Change                                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `backend/src/lib/events.js`                                                       | NEW: `trackServerEvent()`, event constants, PostHog server-side integration |
| `backend/src/middleware/requestMetrics.js`                                        | NEW: Express middleware, ring buffer, flush logic                           |
| `backend/prisma/schema.prisma`                                                    | Add `RequestMetric` model                                                   |
| `backend/prisma/migrations/20260414000001_add_request_metric_table/migration.sql` | NEW                                                                         |
| `backend/src/index.js`                                                            | Mount `requestMetrics` middleware after auth (so `userId` is available)     |
| `backend/src/modules/ai/ai.service.js`                                            | Add TTFT timer around SSE streaming                                         |
| `frontend/studyhub-app/src/lib/analytics.js`                                      | NEW: typed event wrapper over PostHog                                       |
| `frontend/studyhub-app/src/lib/webVitals.js`                                      | NEW: web-vitals capture + send                                              |
| `frontend/studyhub-app/src/main.jsx`                                              | Call `webVitals.start()` in production                                      |
| `package.json` (frontend)                                                         | Add `web-vitals` dependency                                                 |

---

## 4. Track 2 — Onboarding

### 4.1 Database: `OnboardingProgress` Model

```prisma
model OnboardingProgress {
  id              Int       @id @default(autoincrement())
  userId          Int       @unique
  currentStep     Int       @default(1)
  schoolSelected  Boolean   @default(false)
  coursesAdded    Int       @default(0)
  firstActionType String?   // "ai_sheet" | "star" | "upload_note"
  invitesSent     Int       @default(0)
  completedAt     DateTime?
  skippedAt       DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([completedAt])
}
```

Migration: `20260414000002_add_onboarding_progress`

User model gets: `onboardingProgress OnboardingProgress?`

### 4.2 Backend Module (`backend/src/modules/onboarding/`)

Pattern: `index.js`, `onboarding.routes.js`, `onboarding.controller.js`, `onboarding.service.js`

**Endpoints** (all require auth, rate-limited via `onboardingWriteLimiter` — 30 req / 15 min per user):

| Method | Path                       | Description                                                                                                                                |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/onboarding/state`    | Returns current progress or `null`. Creates row on first call for users created < 30 days ago.                                             |
| POST   | `/api/onboarding/step`     | Body: `{ step, payload }`. Validates `step === currentStep`, applies payload, increments `currentStep`. Emits `onboarding_step_completed`. |
| POST   | `/api/onboarding/complete` | Sets `completedAt`. Only valid when `currentStep >= 7`. Emits `onboarding_finished`.                                                       |
| POST   | `/api/onboarding/skip`     | Sets `skippedAt`. Calling `/step` later clears `skippedAt` (resume).                                                                       |

**Step payloads and side effects:**

| Step              | Payload                         | Side Effect                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (Welcome)       | `{}`                            | None. Acknowledgement only.                                                                                                                                                                                                                  |
| 2 (School)        | `{ schoolId }`                  | Creates enrollment. Sets `schoolSelected = true`. Validates school exists.                                                                                                                                                                   |
| 3 (Courses)       | `{ courseIds: [1,2,3] }`        | Creates enrollments (max 6). Sets `coursesAdded` count. Validates courses belong to selected school.                                                                                                                                         |
| 4 (Interests)     | `{ tags: ["exam_prep"] }`       | Stored on user preferences. Optional — empty array accepted.                                                                                                                                                                                 |
| 5 (First success) | `{ actionType, actionPayload }` | Routes to appropriate service (see below). Sets `firstActionType`.                                                                                                                                                                           |
| 6 (Invite)        | `{ emails: [] }`                | When `REFERRAL_ENABLED`: forwards to referral invite logic, sends emails, records `invitesSent`. When flag is off: records `invitesSent` count only (no emails sent), step UI shows "Invites coming soon" placeholder. Skippable either way. |
| 7 (Done)          | `{}`                            | Triggers `/complete` automatically.                                                                                                                                                                                                          |

**Step 5 action routing:**

- `actionType: "star"`, `actionPayload: { sheetId }` — calls existing star logic. Validates sheet exists and is published.
- `actionType: "ai_sheet"`, `actionPayload: { prompt, courseId }` — calls AI service with the prompt, publishes the generated sheet to the user's account. Validates prompt length (max 500 chars), courseId belongs to user's enrollments.
- `actionType: "upload_note"`, `actionPayload: { title, content }` — creates a note. Validates title (max 200 chars) and content (max 10000 chars).

**Security:**

- All payloads validated server-side. No trust in client-supplied step numbers — the server enforces `step === currentStep`.
- `schoolId` and `courseIds` validated against existing database records.
- Step 5 action payloads go through the same validation as their respective full endpoints (sheet star, AI generation, note creation).
- Rate limiter prevents brute-force step submission.
- `userId` comes from the auth cookie, never from the request body.

**Idempotency:** Re-submitting the same step number with the same payload returns current state without side effects. Checked via `currentStep > submittedStep`.

### 4.3 Redirect Logic

In `AppRoutes.jsx`, after authentication resolves:

1. Fetch `/api/onboarding/state` once on app boot. Cache in session context.
2. Redirect to `/onboarding` if ALL of:
   - User `createdAt` is within the last 30 days
   - No `OnboardingProgress` row with `completedAt` set
   - No `OnboardingProgress` row with `skippedAt` set
   - Current route is not already `/onboarding`, `/login`, `/register`, or `/logout`
3. "Resume setup" banner on HomePage when `skippedAt` is set AND `completedAt` is null AND `skippedAt` is within last 7 days.

The onboarding state is fetched once per session, not on every navigation. Completing or skipping onboarding updates the cached state immediately.

### 4.4 Frontend: Onboarding Flow

**Page:** `frontend/studyhub-app/src/pages/onboarding/OnboardingPage.jsx`

Thin orchestrator. Renders:

- Progress bar (step X of 7) with `role="progressbar"` and `aria-valuenow`
- Active step component
- Skip link (except on step 7)

**Hook:** `frontend/studyhub-app/src/features/onboarding/useOnboardingState.js`

- Fetches progress from `/api/onboarding/state`
- Provides `submitStep(step, payload)`, `skip()`, `complete()`
- Tracks `timeOnStepMs` per step using `performance.now()` delta
- Handles optimistic UI (advance step immediately, revert on error)

**Step components:**

| Step | Component              | Renders                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `StepWelcome.jsx`      | One-sentence pitch, user's avatar/name, "Let's get you set up in 2 minutes" CTA. Skip link.                                                                                                                                                                                                                                                                                          |
| 2    | `StepSchool.jsx`       | Typeahead search over schools. "My school isn't listed" link. Selected school shown as card.                                                                                                                                                                                                                                                                                         |
| 3    | `StepCourses.jsx`      | Course grid for chosen school. Popular courses pre-checked. Toggle to add/remove. Max 6 indicator.                                                                                                                                                                                                                                                                                   |
| 4    | `StepInterests.jsx`    | Tag pills (exam prep, note-sharing, group study, research, tutoring). Multi-select. Optional — "Skip" clearly available.                                                                                                                                                                                                                                                             |
| 5    | `StepFirstSuccess.jsx` | Three side-by-side cards. Each expands inline on click to show the action form. "Generate with AI": single prompt textarea + generate button, shows result preview. "Star a popular sheet": 3-5 popular sheet cards from enrolled courses with inline star button. "Upload a note": title + textarea + save button. Completing any one shows success confirmation and auto-advances. |
| 6    | `StepInvite.jsx`       | Referral link with copy button + 3-slot email composer. When `REFERRAL_ENABLED` is off, shows "Invites coming soon" placeholder. Skip link prominent.                                                                                                                                                                                                                                |
| 7    | `StepDone.jsx`         | Confirmation card. "Explore your dashboard" primary CTA. Secondary links to /ai and /library.                                                                                                                                                                                                                                                                                        |

**Accessibility:**

- Focus moves to step heading on each transition.
- `aria-live="polite"` region announces step changes.
- All form inputs keyboard-navigable with visible focus indicators.
- Step 5 cards are keyboard-selectable (Enter/Space to expand).
- Error messages associated via `aria-describedby`.

### 4.5 Files

| File                                                                             | Change                                                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `backend/prisma/schema.prisma`                                                   | Add `OnboardingProgress` model, `User.onboardingProgress` relation |
| `backend/prisma/migrations/20260414000002_add_onboarding_progress/migration.sql` | NEW                                                                |
| `backend/src/modules/onboarding/index.js`                                        | NEW                                                                |
| `backend/src/modules/onboarding/onboarding.routes.js`                            | NEW                                                                |
| `backend/src/modules/onboarding/onboarding.controller.js`                        | NEW                                                                |
| `backend/src/modules/onboarding/onboarding.service.js`                           | NEW                                                                |
| `backend/src/index.js`                                                           | Mount at `/api/onboarding`                                         |
| `backend/src/lib/rateLimiters.js`                                                | Add `onboardingWriteLimiter` (30/15min per user)                   |
| `frontend/studyhub-app/src/pages/onboarding/OnboardingPage.jsx`                  | NEW                                                                |
| `frontend/studyhub-app/src/pages/onboarding/StepWelcome.jsx`                     | NEW                                                                |
| `frontend/studyhub-app/src/pages/onboarding/StepSchool.jsx`                      | NEW                                                                |
| `frontend/studyhub-app/src/pages/onboarding/StepCourses.jsx`                     | NEW                                                                |
| `frontend/studyhub-app/src/pages/onboarding/StepInterests.jsx`                   | NEW                                                                |
| `frontend/studyhub-app/src/pages/onboarding/StepFirstSuccess.jsx`                | NEW                                                                |
| `frontend/studyhub-app/src/pages/onboarding/StepInvite.jsx`                      | NEW                                                                |
| `frontend/studyhub-app/src/pages/onboarding/StepDone.jsx`                        | NEW                                                                |
| `frontend/studyhub-app/src/features/onboarding/useOnboardingState.js`            | NEW                                                                |
| `frontend/studyhub-app/src/AppRoutes.jsx`                                        | Add redirect logic                                                 |
| `frontend/studyhub-app/src/pages/home/HomePage.jsx`                              | Add "Resume setup" banner                                          |

---

## 5. Track 3 — Referral and Invite System

### 5.1 Database Models

**Referral:**

```prisma
model Referral {
  id            Int       @id @default(autoincrement())
  inviterId     Int
  code          String
  email         String?
  channel       String    // "email" | "link" | "copy"
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
```

**ReferralReward:**

```prisma
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

**User additions:**

```prisma
referralCode       String?   @unique  // 8-char base62, generated lazily
referredByUserId   Int?
proRewardExpiresAt DateTime?

referredBy         User?            @relation("ReferredBy", fields: [referredByUserId], references: [id], onDelete: SetNull)
referralsReceived  User[]           @relation("ReferredBy")
invitesSent        Referral[]       @relation("InvitesSent")
invitesReceived    Referral[]       @relation("InvitedByReferral")
referralRewards    ReferralReward[]
```

Migration: `20260414000003_add_referral_system`

The existing `ReferralCode` and `ReferralRedemption` tables are untouched. They continue serving promo code and gift subscription purposes.

### 5.2 Reward Milestones

| Milestone   | Pro Months | Badge Key           | Badge Label       |
| ----------- | ---------- | ------------------- | ----------------- |
| 5 accepted  | 1          | `referrer`          | Referrer          |
| 15 accepted | 2          | `top_referrer`      | Top Referrer      |
| 30 accepted | 3          | `referral_champion` | Referral Champion |
| 50 accepted | 3          | `ambassador`        | Ambassador        |

Defined as constants in `referrals.constants.js`. Max cumulative Pro time: 9 months.

**Pro time grant logic (`proRewardExpiresAt`):**

- If null or in the past: set to `now() + proMonths`.
- If in the future: extend by `proMonths`.
- Stripe-paying users: reward time is banked. It only activates after their paid subscription lapses.

**`getUserPlan()` change** (in `backend/src/lib/getUserPlan.js`):
After checking Stripe subscription status, also check `proRewardExpiresAt > now()`. If true and user has no active paid subscription, return `"pro"`.

**Badges:** Stored in `ReferralReward.badgeKey`. Surfaced via the existing badge display system. Once earned, permanent — they never expire even when Pro time does.

### 5.3 Backend Module (`backend/src/modules/referrals/`)

Pattern: `index.js`, `referrals.routes.js`, `referrals.controller.js`, `referrals.service.js`, `referrals.constants.js`

**Endpoints:**

| Method | Path                           | Auth     | Description                                                                                                         |
| ------ | ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/referrals/me`            | Required | User's referral code (lazy-generated on first call), stats, recent invite history.                                  |
| POST   | `/api/referrals/invite`        | Required | Body: `{ emails: [...] }`. Max 5 per request. Sends invite emails. Creates `Referral` rows with `channel: "email"`. |
| POST   | `/api/referrals/track-share`   | Required | Body: `{ channel: "link" or "copy" }`. Creates a Referral row without email for K-factor tracking.                  |
| GET    | `/api/referrals/resolve/:code` | Public   | Returns `{ valid, inviterUsername, inviterAvatarUrl }`. For the register page "Invited by X" banner.                |
| POST   | `/api/referrals/attach`        | Internal | Called during registration. Associates referral, sets `acceptedAt`, checks/grants milestones.                       |

**Security:**

- **Referral code generation**: 8-char base62, ambiguous characters excluded (0, O, I, l). Generated via `crypto.randomBytes()`, not `Math.random()`. Uniqueness enforced by database constraint + retry loop (max 3 attempts).
- **Self-referral protection**: If registering user's IP matches the inviter's last known IP (from audit log or session), the `Referral` row is created for tracking but `acceptedAt` is NOT set. The referral does not count toward milestones. No error surfaced to the user.
- **Email validation**: Disposable email domains blocked at invite time using the existing email validator. Emails normalized (lowercase, trim) before duplicate check.
- **Duplicate prevention**: Same email cannot be invited by the same user within 24 hours (silently dropped, no error to prevent enumeration).
- **One inviter per invitee**: `referredByUserId` is set once during registration. If multiple codes are attempted, the first one processed wins. Enforced by checking `referredByUserId IS NULL` before setting.
- **Rate limiters**: `referralInviteLimiter` (20/day per user), `referralResolveLimiter` (60/min by IP).
- **Reward idempotency**: `@@unique([userId, milestone])` constraint. Reward check runs inside a Prisma transaction: count accepted referrals, determine unclaimed milestones, insert `ReferralReward` rows, update `proRewardExpiresAt`. If the unique constraint fires, the transaction is harmless.
- **No reward stacking**: Each milestone can only be claimed once. The milestone thresholds (5, 15, 30, 50) are fixed constants, not user-configurable.
- **Admin anomaly flag**: Any inviter with acceptance rate > 200% of the global median gets a warning flag visible in admin ReferralsTab. No auto-action — manual review only.

### 5.4 Email Template

`backend/src/modules/email/templates/referral-invite.html`

Subject: `"<inviterUsername> invited you to StudyHub"`

Body: Inviter's name, one-line pitch ("Join your classmates on StudyHub"), CTA button linking to `/register?ref=CODE`. No sensitive data in the email body. Unsubscribe link included per existing email template pattern.

### 5.5 Registration Integration

In `backend/src/modules/auth/auth.service.js`, during the registration transaction:

1. Check if signup payload includes `ref` code.
2. Call `referrals.service.resolveCode(code)` to validate.
3. If valid and not self-referral: set `referredByUserId` on new user, call `referrals.service.acceptReferral(code, newUserId)`.
4. Generate a `referralCode` for the new user (lazy — only if they visit `/invite`; not at registration).

### 5.6 Frontend

**`/invite` page** (`frontend/studyhub-app/src/pages/invite/InvitePage.jsx`):

- Share link card: user's referral URL with copy button
- Email composer: up to 3 email inputs + "Send invites" button
- Recent invites table: email/channel, status (pending/accepted), date
- Stats card: sent count, accepted count, acceptance rate
- Reward milestones: visual progress bar showing current position, unlocked/locked tiers

**Register page** (`RegisterScreen.jsx`):

- Read `?ref=CODE` from URL params
- GET `/api/referrals/resolve/:code` to validate + get inviter info
- Display "Invited by <username>" banner with avatar above the form
- Forward `ref` code through registration payload

**Settings > Referrals tab** (`ReferralsTab.jsx`):

- Referral code + copyable link
- Counts: sent, accepted, pending
- Milestone progress with unlocked badges
- Link to `/invite`

**Sidebar**: "Invite classmates" nav item with gift icon. Gated by `REFERRAL_ENABLED`.

### 5.7 Files

| File                                                                         | Change                                                |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| `backend/prisma/schema.prisma`                                               | Add `Referral`, `ReferralReward` models, User fields  |
| `backend/prisma/migrations/20260414000003_add_referral_system/migration.sql` | NEW                                                   |
| `backend/src/modules/referrals/index.js`                                     | NEW                                                   |
| `backend/src/modules/referrals/referrals.routes.js`                          | NEW                                                   |
| `backend/src/modules/referrals/referrals.controller.js`                      | NEW                                                   |
| `backend/src/modules/referrals/referrals.service.js`                         | NEW                                                   |
| `backend/src/modules/referrals/referrals.constants.js`                       | NEW                                                   |
| `backend/src/modules/email/templates/referral-invite.html`                   | NEW                                                   |
| `backend/src/modules/auth/auth.service.js`                                   | Add referral attach during registration               |
| `backend/src/index.js`                                                       | Mount at `/api/referrals`                             |
| `backend/src/lib/rateLimiters.js`                                            | Add `referralInviteLimiter`, `referralResolveLimiter` |
| `backend/src/lib/getUserPlan.js`                                             | Update `getUserPlan()` to check `proRewardExpiresAt`  |
| `frontend/studyhub-app/src/pages/invite/InvitePage.jsx`                      | NEW                                                   |
| `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx`                    | Add `?ref=` handling + "Invited by" banner            |
| `frontend/studyhub-app/src/pages/settings/ReferralsTab.jsx`                  | NEW                                                   |
| `frontend/studyhub-app/src/components/sidebar/AppSidebar.jsx`                | Add "Invite classmates" link                          |

---

## 6. Cross-Cutting — Admin Dashboard Tabs

Three new lazy-loaded tabs in the admin panel.

### 6.1 ActivationTab

**Endpoint:** GET `/api/admin/activation-funnel?period=7d|30d|90d`

Queries `OnboardingProgress` table for per-step completion counts, drop-off, and activation rate by cohort week.

**Response:**

```json
{
  "funnel": [
    { "step": 1, "label": "Welcome", "reached": 420, "completed": 395 },
    { "step": 2, "label": "School", "reached": 395, "completed": 370 },
    ...
  ],
  "activationRate": 0.52,
  "medianTimeToFirstSheet": 3.4,
  "cohorts": [
    { "week": "2026-W15", "signups": 105, "activated": 55, "rate": 0.524 }
  ]
}
```

**UI:** Horizontal funnel bar chart. Biggest drop-off highlighted. Activation rate + time-to-first-sheet metric cards. Cohort table. Period filter.

### 6.2 ReferralsTab

**Endpoint:** GET `/api/admin/referral-stats?period=7d|30d|90d`

Queries `Referral` and `ReferralReward` tables.

**Response:**

```json
{
  "totals": { "sent": 850, "accepted": 190, "acceptanceRate": 0.224, "kFactor": 0.34, "rewardsGranted": 12 },
  "channelBreakdown": [ { "channel": "email", "sent": 400, "accepted": 120 }, ... ],
  "topInviters": [ { "userId": 42, "username": "jane", "sent": 35, "accepted": 18, "flagged": false } ],
  "weeklyKFactor": [ { "week": "2026-W15", "kFactor": 0.28 } ]
}
```

**UI:** Four metric cards (sent, accepted, rate, K-factor). Channel breakdown bars. K-factor trend line. Top 20 inviters table with anomaly flag.

### 6.3 ObservabilityTab

**Endpoint:** GET `/api/admin/observability/summary?period=24h|7d`

Queries `RequestMetric` table for percentile latencies. Web vitals from PostHog API (graceful degradation if unavailable).

**Response:**

```json
{
  "period": "24h",
  "routeGroups": [
    {
      "group": "sheets",
      "p50": 45,
      "p95": 180,
      "p99": 420,
      "requestCount": 12400,
      "errorRate": 0.003
    }
  ],
  "aiTtft": { "p50": 850, "p95": 2100, "sampleCount": 340 },
  "webVitals": {
    "LCP": { "p50": 1800, "p95": 3200 },
    "INP": { "p50": 120, "p95": 280 },
    "CLS": { "p50": 0.05, "p95": 0.15 }
  }
}
```

**UI:** Route group table (p50/p95/p99, request count, error rate — warning colors for >350ms p95 or >2% error rate). AI TTFT card. Web Vitals card with good/needs-work/poor indicators. Period toggle.

### 6.4 Files

| File                                                                        | Change                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `backend/src/modules/admin/admin.routes.js` or `admin.growth.controller.js` | Add 3 admin endpoints                                         |
| `frontend/studyhub-app/src/pages/admin/ActivationTab.jsx`                   | NEW (lazy-loaded)                                             |
| `frontend/studyhub-app/src/pages/admin/ReferralsTab.jsx`                    | NEW (lazy-loaded, distinct from existing revenue referral UI) |
| `frontend/studyhub-app/src/pages/admin/ObservabilityTab.jsx`                | NEW (lazy-loaded)                                             |
| `frontend/studyhub-app/src/pages/admin/adminConstants.js`                   | Add 3 new tab entries                                         |

---

## 7. Feature Flags and Rollout

### 7.1 Flags

| Flag                    | Default | Purpose                                                             |
| ----------------------- | ------- | ------------------------------------------------------------------- |
| `ONBOARDING_ENABLED`    | `false` | Gates `/onboarding` redirect and "Resume setup" banner              |
| `REFERRAL_ENABLED`      | `false` | Gates `/invite`, sidebar link, `?ref=` banner, Settings > Referrals |
| `OBSERVABILITY_COLLECT` | `true`  | Gates request metrics middleware                                    |

### 7.2 Deploy Sequence

1. Observability scaffolding (events + metrics + web vitals + TTFT)
2. Onboarding backend (module + migration)
3. Onboarding frontend (pages + redirect + banner)
4. Referral backend (module + migration + email template + auth integration + getUserPlan change)
5. Referral frontend (/invite + register ?ref= + settings tab + sidebar)
6. Admin tabs (ActivationTab + ReferralsTab + ObservabilityTab + endpoints)
7. Flag flip (enable ONBOARDING_ENABLED + REFERRAL_ENABLED for all users)

### 7.3 Rollback

- **Onboarding**: Disable flag. Redirect stops. Data stays in `OnboardingProgress`.
- **Referral**: Disable flag. UI hidden. `?ref=` still silently accepted at registration so in-flight links work.
- **Observability**: Disable `OBSERVABILITY_COLLECT`. Middleware stops. Existing data remains queryable.

### 7.4 Launch Checklist

- [ ] All migrations deployed (`npx prisma migrate deploy`)
- [ ] `proRewardExpiresAt` field confirmed in production schema
- [ ] PostHog events visible in dashboard
- [ ] Admin tabs render on empty, partial, and populated datasets
- [ ] `npm run lint`, `npm run test`, `npm run build`, `npm run beta:validate` all green
- [ ] Beta release log updated
- [ ] Onboarding dogfooded by 2+ admin accounts
- [ ] Referral flow tested end-to-end: invite -> signup -> accepted count -> milestone -> Pro time grant
- [ ] Security review: self-referral protection confirmed, rate limiters active, no PII in events

---

## 8. Security Checklist

Consolidated security requirements across all three tracks:

### Authentication & Authorization

- All onboarding and referral write endpoints require auth cookie.
- Admin endpoints require `role === "admin"`.
- `userId` always derived from auth token, never from request body.
- `/api/referrals/resolve/:code` is the only public endpoint (read-only, rate-limited).

### Input Validation

- All step payloads validated server-side: `schoolId`, `courseIds`, `actionType`, `actionPayload`.
- Referral emails validated against disposable domain blocklist + format validation.
- Referral code: 8-char alphanumeric only. Reject anything else at the route level.
- Step 5 action payloads enforce the same limits as their full endpoints (prompt length, note content length).
- Max array sizes enforced: `courseIds` max 6, `emails` max 5.

### Rate Limiting

- `onboardingWriteLimiter`: 30 req / 15 min per user.
- `referralInviteLimiter`: 20 per day per user.
- `referralResolveLimiter`: 60 per min by IP.
- Existing global limiter (1000 req / 15 min) applies to all routes.

### Anti-Abuse

- Self-referral: IP comparison blocks same-device invites from counting toward rewards.
- Reward idempotency: unique constraint `[userId, milestone]` prevents double-grant.
- Duplicate email invite suppression within 24h.
- Admin anomaly detection: flagged inviters with >200% median acceptance rate.
- No user-controllable reward amounts. Milestones are server-side constants only.

### Data Privacy

- Events never log raw content (email bodies, sheet HTML, message text).
- Request metrics log route templates, not raw URLs (no tokens/query params).
- Admin aggregation endpoints enforce minimum group size of 5.
- All telemetry respects `analyticsEnabled` user preference.
- Referral email template includes unsubscribe link.

### No Backdoors

- No admin-override endpoints that skip validation.
- No debug/test endpoints that bypass auth in production.
- Feature flags control UI gating only — backend validation always runs regardless of flag state.
- Referral reward logic uses server-side constants, not client-supplied values.
- `proRewardExpiresAt` can only be set by the reward grant transaction, not by any user-facing endpoint.

---

## 9. Testing Requirements

### Backend Unit Tests (vitest + supertest)

- Onboarding: each endpoint, auth + rate limit, step validation, idempotency on re-submit, step ordering enforcement.
- Referral: code generation uniqueness, attribution transaction, reward milestone idempotency, self-referral rejection, duplicate email suppression.
- Events: `trackServerEvent` is a no-op when `analyticsEnabled` is false.
- Request metrics: correct route template extraction for dynamic routes.

### Frontend Unit Tests (vitest)

- `useOnboardingState` hook: step progression, skip/resume, error handling.
- `analytics.js`: respects opt-out, event names match constants.

### E2E Tests (Playwright)

- Onboarding: new user signs up, redirected to `/onboarding`, completes all 7 steps, lands on dashboard.
- Onboarding resume: user abandons mid-flow, sees "Resume setup" banner, clicks it, resumes at correct step.
- Referral: inviter generates link, new user signs up via `?ref=CODE`, "Invited by X" banner shown, inviter's accepted count updates.
- Regression: existing users (createdAt > 30 days) are NOT redirected to onboarding.

### Accessibility

- All onboarding step components: keyboard-only walkthrough, focus management on step change, `aria-live` for transitions.
- Step 5 action cards: keyboard-selectable, screen reader announces selected state.

---

## 10. Not in Scope

Explicitly excluded from this cycle:

- Mobile apps or responsive-first redesign (v3)
- SEO / Open Graph cards / public leaderboards (separate "Discovery & SEO v1" cycle)
- Weekly digest emails, streaks, badge gamification beyond referral badges (separate "Retention v1" cycle)
- Institution landing page / sales pipeline (separate "Institution v1" cycle)
- Full WCAG 2.1 AA app-wide audit (onboarding flow will meet AA, but app-wide audit is separate)
- Internationalization / localization (v3)
- Migration of existing `trackEvent` calls to the new `analytics.js` wrapper (coexistence is fine)
