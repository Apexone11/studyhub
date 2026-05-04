# CLAUDE.md

Read this file before starting any task in StudyHub.

## ⛔ AGENT BEHAVIORAL CONTRACT (READ FIRST, NON-NEGOTIABLE)

These rules apply to **every AI agent (Claude, Copilot, any reviewer or builder)** that touches this repo. They take precedence over your default behavior. Violating them produces real bugs and failed CI runs and Abdul has to clean up after — don't.

### A1 — Use every available skill, tool, and subagent

You have access to specialized tools (Grep, Glob, Read, Edit, Agent, etc.) and to subagents (`code-reviewer`, `Explore`, `feature-dev:*`, `Plan`, `general-purpose`). **Use them.** A "I think the answer is X" response is unacceptable when you can verify in seconds.

- Before answering anything non-trivial, run the relevant searches. "I'd guess this is in `auth.routes.js`" → no, `Grep` for it.
- For audits, security passes, or open-ended investigations spanning >3 files, dispatch a subagent. Don't try to keep 50 file findings in main context.
- For any change touching >5 files, run a `code-reviewer` subagent on the diff before reporting "done."
- Run lint and build at the end of every change. Not "I think it's fine" — actually run them.

If you skip available tooling because you "remember the answer," you are gambling with the user's time. Don't.

### A2 — CI must be green before any "done"

The user has been burned by red CI for weeks. Every PR-bound change must include:

1. `npm --prefix backend run lint` clean (run it, paste the result if asked).
2. `npm --prefix frontend/studyhub-app run lint` clean.
3. `npm --prefix frontend/studyhub-app run build` succeeds.
4. `npm --prefix backend test` passes (skip only if the tests are unrelated to your change AND would take >5 min).
5. The release log entry exists in `docs/release-log.md`.

If any of these fail, the change is **not done**. Fix it before reporting back. "Tests will pass" is not a substitute for running them.

### A3 — Read before edit, every time

Code may have changed since memory or CLAUDE.md was last updated. Before editing a file:

- Use the `Read` tool. Don't write blind.
- Verify imports actually resolve in the current schema (e.g., `core/db/prisma` re-exports `lib/prisma` — confirm before assuming).
- Verify migrations match `schema.prisma`. Schema drift causes silent prod failures.

### A4 — No optimistic UI without server confirmation

Never assume a write succeeded by toggling local state to the inverse of what was sent. Always:

1. Await the response.
2. Hydrate UI from the response body's persisted value (or fall back to the requested value if the server didn't echo it).
3. Surface errors via toast — don't swallow.

Pattern that has caused production bugs: `onSuccess({ field: !current.field })`. Replace with: `const persisted = data.field ?? requested; onSuccess({ field: persisted })`. The toggle that "doesn't work" almost always traces back to optimistic-merge masking a silent persistence failure.

### A5 — Migrations must be idempotent

Every migration SQL must be safe to re-run. Use `IF NOT EXISTS`, `DO $$ ... EXCEPTION ... END $$`, or equivalent guards. Non-idempotent `ALTER TABLE ADD COLUMN` without a guard is forbidden — it breaks `prisma migrate deploy` on retry. Reviewer must reject. Existing offenders should be migrated to the safe form alongside any other change touching that file.

### A6 — Defense in depth on every owner-control / privacy toggle

When you add a feature with a "private," "downloads disabled," "members only," etc. toggle, the rule is **enforce in three places**:

1. **Frontend visibility** — hide the affected button/tab.
2. **Backend route handler** — return 403/404 even if the frontend was bypassed.
3. **Backend serializer** — strip fields the user shouldn't see (e.g., `attachmentUrl` for non-allowed-download).

Hiding only in the UI is a phishing-tier pseudo-fix. The user can hit `curl` directly. If a toggle exists, all three layers must enforce.

### A7 — Rate limiters: IPv6-safe `keyGenerator`s only

`express-rate-limit` v7+ rejects raw `req.ip` in custom keyGenerators (`ERR_ERL_KEY_GEN_IPV6`). Production has crashed on this. Allowed patterns:

- `keyGenerator: (req) => \`prefix-${req.user?.userId || 'anon'}\``(auth-required routes; the`'anon'`fallback never fires when`requireAuth` precedes the limiter).
- Default IP keying (no `keyGenerator` field) — express-rate-limit v8+ handles IPv6 normalization safely.

**Forbidden:** `req.ip` as the key fallback in a custom keyGenerator. **Required:** optional chain `req.user?.userId`. Never `req.user.userId` without the `?.` — even if auth precedes the limiter today, a future middleware reorder will crash production at boot.

### A8 — PII never enters logs unredacted

Never pass `email`, `phone`, `ssn`, full names, IP addresses, or password fragments into a log call's context object — pino's redact list does NOT cover these. Use the `hashEmail()` pattern (sha256, last 8 chars) for correlation. Sentry `captureError` extras go through `redactObject` but the same rule applies — pass an `entryId`/`userId`, not the email itself.

### A9 — Secrets: documented in `.env.example`, validated at boot, fail-closed in prod

Every `process.env.X` your code reads must:

1. Be listed in `.env.example` with a comment describing what it does.
2. Be in `secretValidator.js` under `REQUIRED`, `REQUIRED_IN_PRODUCTION`, `RECOMMENDED`, or `OPTIONAL`.
3. If used for crypto / signing / auth, fail-closed in production: `if (!secret && process.env.NODE_ENV === 'production') throw ...`.

Never use a hardcoded dev fallback in code that's reachable in production. The `PROVENANCE_SECRET` incident is the canonical example — a dev fallback derived from a public string was silently used in prod for weeks.

### A10 — Background jobs use `runWithHeartbeat`

Every `setInterval` (and recursive `setTimeout` chain) must wrap its body in `runWithHeartbeat('job.name', fn, { slaMs })` from `lib/jobs/heartbeat.js`. This emits `event: 'job.start'` / `'job.success'` / `'job.failure'` to pino + Sentry. Bare `setInterval(() => fn().catch(() => {}))` is forbidden — it makes silent hung jobs invisible.

`.unref()` every interval that doesn't need to keep the process alive. Tests fail to exit otherwise.

### A11 — CSRF defense in depth on writes

Every POST/PATCH/PUT/DELETE that touches user/payment/legal/auth state must apply `originAllowlist()` (alias `requireTrustedOrigin`) middleware in addition to the global Origin check. Settings, payments, exams, AI, legal, creator-audit are the canonical examples. New write modules must opt in.

`originAllowlist` short-circuits GET/HEAD/OPTIONS, so applying it at the `router.use(...)` level on a module is safe even if the module mixes reads and writes.

### A12 — parseInt is unsafe — use `Number.parseInt(x, 10) + Number.isInteger`

`parseInt(req.params.id)` without a radix returns `NaN` for non-numeric input, which Prisma may coerce to `undefined` and produce surprising query behavior (or worse, return all rows). The required pattern:

```js
const id = Number.parseInt(req.params.id, 10)
if (!Number.isInteger(id) || id < 1) {
  return sendError(res, 400, 'Invalid id.', ERROR_CODES.BAD_REQUEST)
}
```

This is the FIRST validation in any handler that touches a numeric ID from the URL or body. Don't skip it because "Express type-checks the route" — it doesn't.

### A13 — Enum / type validation on every body field

Any string from `req.body` that lands in a Prisma `where` or `data` clause must be validated against an explicit allowlist before it touches the DB. The messaging `type` field incident (clients could persist arbitrary `type` values to `Message.type`) is the canonical bug. Pattern:

```js
const ALLOWED_TYPES = new Set(['text', 'image', 'gif', 'system'])
if (!ALLOWED_TYPES.has(type)) return sendError(res, 400, 'Invalid type.', ERROR_CODES.BAD_REQUEST)
```

### A14 — Iframe sandbox: never `allow-scripts allow-same-origin` together

That combination is a documented sandbox escape vector (the iframe can rewrite `parent.frames[0].location` and execute in the parent origin). Allowed combinations:

- `sandbox=""` — strictest, for pure preview of untrusted HTML.
- `sandbox="allow-scripts allow-popups allow-forms"` — third-party iframe that needs JS but no DOM access to the parent.
- `sandbox="allow-same-origin"` — first-party preview that needs to read same-origin cookies but never executes script.

`data:` URIs always have an opaque origin, so `allow-same-origin` on a data URI is a no-op today but still wrong — future refactors that swap to a blob: or backend URL re-introduce the escape. Use `sandbox=""` for those.

### A15 — `target="_blank"` requires `rel="noopener noreferrer"`

Both. Always. `noreferrer` implies `noopener` in modern browsers, but the project convention is to write both — and convention is what reviewers grep for. Inconsistency means the next reviewer can't tell at a glance which links are reviewed and which were missed.

### A16 — console.\* is forbidden in `backend/src/`

Use `log.info/warn/error/fatal` from `lib/logger.js` with the structured shape:

```js
log.warn({ event: 'module.action_failed', ...ctx }, 'Human-readable message')
```

The `event` field is the alert key — without it, log aggregator alerts can't fire. `console.error` bypasses pino, loses request-id correlation, and is silent in test (where logger is `level: 'silent'`).

### A17 — Never `--no-verify` git commits

If a pre-commit hook fails, fix the failure. Bypassing it ships broken code to CI which then fails for the user, who has to push another commit, which is exactly what they're trying to stop.

### A18 — Don't fabricate green CI

When asked "did the tests pass?", you must have actually run them. "Should pass" / "I expect them to pass" / "in theory they pass" — these are lies dressed as caveats. If you didn't run them, say so. Then run them.

### A19 — Read CHANGELOG.md and release-log.md before claiming a feature is unimplemented

Half the "let me build feature X" requests are for features that already exist. Grep for the feature name first. The user's #1 frustration is duplicated work.

### A20 — Stop saying "I think" — verify or say "I don't know"

"I think this is wired up" → either verify it (in <30 seconds with grep) or say "I haven't verified this." Never both. The user can handle "I don't know yet, let me check"; they cannot handle "yes" that turns out to be "no."

### A21 — Vet every Copilot / external bot bug report before acting on it

Bot reviewers (GitHub Copilot, Sourcery, Codex, Dependabot security advisories, anything that opens a PR comment unprompted) are NOT a source of truth. They have no project context, they don't know our coding conventions, and they hallucinate "issues" that are either non-existent or stylistically inconsistent with the rest of the codebase. Blindly applying their suggestions has, in this repo, _introduced_ bugs and _broken_ established naming/style consistency more than once.

Before touching code in response to a bot finding:

1. **Reproduce or refute it against the actual code.** Read the file at the cited line. Run the test that supposedly fails. Grep for the function/variable. If you can't reproduce the issue, the finding is wrong — close the comment with a one-line "verified, false positive" and move on. Do NOT change code to "make the bot happy."
2. **Cross-check against an industry standard.** Is the suggestion an MDN-documented best practice, an OWASP rule, a NIST control, an established a11y pattern (W3C ARIA), a CLAUDE.md A-rule, or a published library convention (Express, Prisma, React)? If none of these, the bot is offering style preference, not a bug — and bot style preferences usually don't match this codebase's preferences.
3. **Refute it if it conflicts with an existing CLAUDE.md A-rule.** If the bot says "use `parseInt` without a radix" and A12 says "always pass radix + `Number.isInteger` guard," CLAUDE.md wins. If the bot says "wrap this in try/catch" but the surrounding module trusts internal callers, the bot is wrong.
4. **Refute it if it breaks our coding-style consistency.** If the bot suggests `snake_case` in a `camelCase` file, `function expr` in an `arrow fn` file, `console.error` instead of `log.error`, raw `res.status().json({error})` instead of `sendError()`, or any other variant of "different from how the rest of the file/module is written" — reject the suggestion. Consistency is a feature; bot-induced drift is a regression.
5. **If the finding IS real, fix it in our existing style.** Don't copy the bot's snippet verbatim. Match the surrounding code's naming, error envelope, log shape, validation pattern, and import order. A genuine bug fix that breaks our style is still a regression.
6. **One bot finding ≠ one commit.** Batch real findings into a single coherent commit with a clear message. Don't spam the history with "address copilot review #1, #2, #3" if the underlying changes are trivial — that's bot-driven noise.

The goal: bot review is an _input_ to the developer's judgment, not a directive. Treat it like a junior reviewer's comment — sometimes useful, sometimes wrong, always requires verification before action.

---

## Project Overview

StudyHub is a GitHub-style collaborative study platform for college students. Core product ideas:

- Share study sheets by course.
- Fork, improve, and contribute changes back.
- Discover materials through course directories, the public feed, and global search.
- Support student collaboration through comments, stars, follows, announcements, notes, and notifications.
- Real-time messaging (DMs and group chats) between students.
- Study groups with shared resources, scheduled sessions, and discussion boards.
- Block/mute system for user safety across all social features.

Primary repo layout:

- `backend/`: Express API, Prisma data layer, Vitest tests.
- `frontend/studyhub-app/`: React 19 + Vite SPA, ESLint, Vitest, Playwright.
- `docs/`: release and beta-cycle documentation.

## Current Tech Stack

Frontend:

- React 19
- React Router 7
- Vite 8
- ESLint
- Vitest
- Playwright
- anime.js
- socket.io-client 4.8 (real-time messaging)
- Sentry + PostHog telemetry

Backend:

- Node.js 20+
- Express 5
- Prisma 6.x (PostgreSQL)
- Socket.io 4.8 (WebSocket server)
- Vitest + Supertest
- Sentry
- Railway (production deployment)

## Architecture Notes

### Pages and Routing Reality (READ BEFORE PLANNING ANY PAGE WORK)

**There is no dedicated Dashboard page.** Planning against a phantom `/dashboard` page has burned previous agents. The truth, verified April 19, 2026 against `frontend/studyhub-app/src/App.jsx`:

- **Authenticated landing page: `/feed` (`FeedPage.jsx`).** `getAuthenticatedHomePath` in `frontend/studyhub-app/src/lib/authNavigation.js` returns `/feed` for students, `/admin` for admins. This is where every non-admin user lands after login.
- **`/dashboard` is a 2-line redirect**, not a page. `DashboardRedirect` at App.jsx ~line 100 forwards authenticated users to `/users/:username`. App.jsx line 20 comment: `/* DashboardPage removed — /dashboard now redirects to /users/:me via DashboardRedirect */`.
- **The "personal overview" UX lives on `UserProfilePage.jsx`** at `/users/:username`. The same page serves both "my profile" (when viewing yourself) and "other user's profile" (when viewing someone else). It has Overview / Study / Sheets / Posts / Achievements tabs and already imports `DashboardWidgets` + hits `/api/dashboard/summary`.
- **Admin landing: `/admin` (`AdminPage.jsx`).** Admins never land on `/feed` or `/dashboard`.
- **Sidebar chrome is shared.** `AppSidebar.jsx` renders on every authenticated route. Changes to it affect every page.

Authoritative list of real pages (check `App.jsx` Routes block, lines ~353–655, before trusting anything else):

- Public: `/` (HomePage), `/login`, `/register`, `/signup/role`, `/login/challenge/:id`, `/terms`, `/privacy`, `/guidelines`, `/cookies`, `/disclaimer`, `/data-request`, `/about`, `/pricing`, `/supporters`, `/forgot-password`, `/reset-password`
- Authenticated: `/feed`, `/sheets`, `/sheets/upload`, `/sheets/new/lab`, `/sheets/:id/edit`, `/sheets/:id/lab`, `/sheets/:id/plagiarism`, `/sheets/:id`, `/sheets/preview/html/:id`, `/preview/:scope/:id`, `/tests`, `/tests/:id`, `/notes`, `/notes/:id`, `/messages`, `/study-groups`, `/study-groups/:id`, `/ai`, `/library`, `/library/:volumeId/read`, `/library/:volumeId`, `/playground`, `/announcements`, `/submit`, `/my-courses`, `/invite`, `/review`, `/admin`, `/settings`, `/onboarding`, `/users/:username`
- Redirect-only: `/dashboard` → `/users/:username`

Dead / legacy code (do NOT plan features against these files, and remove them when safe):

- `frontend/studyhub-app/src/pages/dashboard/DashboardPage.jsx` — not imported by App.jsx, not rendered anywhere
- `frontend/studyhub-app/src/pages/profile/.fuse_hidden*` — filesystem artifacts from rename operations

Live files inside `pages/dashboard/` (KEEP — imported by UserProfilePage):

- `pages/dashboard/DashboardWidgets.jsx` — imported by `UserProfilePage.jsx`
- `pages/dashboard/dashboardConstants.js` — imported by `UserProfilePage.jsx` and the features barrel
- `pages/dashboard/useDashboardData.js` — verify usage before removing; currently re-exported by `features/dashboard/index.js`

**Rule for future agents:** Before planning or editing a "dashboard" feature, run `grep -n "<FileName>" App.jsx` to confirm the file is actually mounted as a Route element. If it's not in App.jsx, it's dead code regardless of what the file contains or what other agents' docs claim.

### General

- URL parameters are the source of truth for list/search/filter pages such as `SheetsPage` and `FeedPage`.
- Backend is fully modularized under `backend/src/modules/<name>/` with `index.js`, `*.routes.js`, `*.controller.js`, `*.service.js`, `*.constants.js` pattern (21+ modules). The largest route files (studyGroups, library, notes, users) have been split into thin route files + controller files.
- Type definitions: `backend/src/types/` and `frontend/studyhub-app/src/types/` contain `.d.ts` declaration files for core shared modules. Both projects have `jsconfig.json` with `checkJs: true` for IDE type checking.
- Frontend uses feature barrels under `frontend/studyhub-app/src/features/<name>/index.js` that re-export from `pages/`. New feature logic goes in `features/`, pages import from barrels. Migration is incremental.
- Files that mix React components with non-component exports must be split: constants/helpers in `.js`, components in `.jsx`. The `.js` file re-exports from `.jsx` for backward compatibility (satisfies `react-refresh/only-export-components`).
- Large pages (>200 lines) should be decomposed into thin orchestrator shells. Extract composable child components (composers, asides, empty states, nav action bars) that own their rendering. Pages own layout, routing state, and hook wiring only.

### API URL Convention

- All backend routes are mounted under `/api/<resource>` in `backend/src/index.js`.
- Frontend fetch calls MUST use `${API}/api/<resource>`, never `${API}/<resource>` without the `/api` prefix. This has caused 404 bugs before (e.g., study groups).
- The `API` constant comes from `frontend/studyhub-app/src/config.js` and resolves to the backend origin (e.g., `http://localhost:4000` in dev, Railway URL in prod). It does NOT include `/api` -- that must be added in each fetch URL.
- Frontend image URLs for user/profile/school/group uploads MUST use `resolveImageUrl()` from `frontend/studyhub-app/src/lib/imageUrls.js` instead of hand-joining `${API}${url}`. The helper prefixes slash-relative paths with the API origin, rejects scriptable/local-file URLs, and upgrades public `http:` image URLs to `https:` so production pages do not render mixed-content broken image icons.
- HTML sheet preview URLs are generated by `resolvePreviewOrigin()` in `backend/src/modules/sheets/sheets.service.js`. It honors `HTML_PREVIEW_ORIGIN` when set and otherwise uses `X-Forwarded-Proto` + Host so HTTPS production pages do not receive `http://.../preview/html` iframe URLs.

### Search System

- Global search is handled by `frontend/studyhub-app/src/components/SearchModal.jsx` and `backend/src/modules/search/search.routes.js`.
- The sheets page uses `GET /api/sheets` with query params like `search`, `schoolId`, `courseId`, `mine`, `starred`, and `sort`.
- The global search modal uses `GET /api/search?q=...&type=all&limit=...`.
- The search API response format is `{ results: { sheets, courses, users, notes, groups }, query, type }`. When consuming search results, always access `data.results.users` (not `data.users`).
- User profile visibility is enforced through `backend/src/lib/profileVisibility.js` and reused by both user routes and search routes.

### Authentication and Sessions

- As of the current v2.2.0 behavior, login issues a session directly. Login is no longer gated on email verification or 2FA during the login flow.
- JWT auth is stored in HTTP-only cookies (cookie name: `studyhub_session`).
- All authenticated API calls must include `credentials: 'include'` in fetch options.
- The `authHeaders()` helper from `pages/shared/pageUtils` provides the correct headers for authenticated requests.

### Messaging System (StudyHub Connect)

- Backend routes: `backend/src/modules/messaging/messaging.routes.js` mounted at `/api/messages`.
- Frontend page: `frontend/studyhub-app/src/pages/messages/MessagesPage.jsx`.
- Data hook: `frontend/studyhub-app/src/pages/messages/useMessagingData.js`.
- Helpers: `frontend/studyhub-app/src/pages/messages/messagesHelpers.js`.
- Socket.io connection: `frontend/studyhub-app/src/lib/useSocket.js` (connects to backend origin with `withCredentials: true`).
- Socket.io events (backend names): `message:new`, `message:edit`, `message:delete`, `typing:start`, `typing:stop`, `conversation:join`, `message:read`, `reaction:add`, `reaction:remove`.
- Per-socket rate limiting in `backend/src/lib/socketio.js`: typing events (20/min), join events (30/min).
- Message write rate limiter: 60 req/min on POST and PATCH message endpoints.
- Max message length: 5000 characters (validated on both frontend and backend).
- Messages use soft delete (`deletedAt` field). Edit window is 15 minutes.
- DM auto-start from profile: `/messages?dm=userId` URL parameter triggers conversation creation.
- Unread counts are computed per conversation by comparing `lastReadAt` against message timestamps.

### Study Groups

- Backend routes: `backend/src/modules/studyGroups/studyGroups.routes.js` mounted at `/api/study-groups`.
- Frontend page: `frontend/studyhub-app/src/pages/studyGroups/StudyGroupsPage.jsx`.
- Data hook: `frontend/studyhub-app/src/pages/studyGroups/useStudyGroupsData.js`.
- Sub-resources: members, resources, sessions (scheduled study sessions), discussions (Q&A board).

### Block/Mute System

- Backend helpers: `backend/src/lib/social/blockFilter.js` exports `getBlockedUserIds`, `getMutedUserIds`, `blockFilterClause`, `hasBlocked`, `isBlockedEitherWay`.
- Block filtering is bidirectional: if A blocks B, neither sees the other.
- Mute filtering is one-directional: only the muter's feed is affected.
- Any endpoint calling `getBlockedUserIds` or `getMutedUserIds` MUST wrap the call in try-catch for graceful degradation, because these queries will fail if the block/mute tables are temporarily unavailable or not yet migrated.

### Payment System (Stripe)

- Backend module: `backend/src/modules/payments/` with routes, service, constants, and barrel index.
- Backend routes mounted at `/api/payments` in `backend/src/index.js`.
- Stripe SDK: `stripe` v22.0.0 (lazy-initialized via `getStripe()` in service).
- Environment variables (Railway): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO` (monthly), `STRIPE_PRICE_ID_PRO_YEARLY`, `STRIPE_PRICE_ID_DONATION`, `FRONTEND_URL`.
- Database tables: `Subscription`, `Payment`, `Donation` (migration: `20260403000001_add_payment_tables`).
- Plans: `free`, `pro_monthly`, `pro_yearly`. Plan definitions and feature limits in `payments.constants.js`. `planFromPriceId()` maps Stripe price IDs back to plan names.
- Checkout flow: Frontend calls `POST /api/payments/checkout/subscription` or `POST /api/payments/checkout/donation`, receives a Stripe Checkout Session URL, and redirects the user to Stripe's hosted page.
- Webhook: `POST /api/payments/webhook` mounted BEFORE `express.json()` in `index.js` with `express.raw()` for signature verification via `stripe.webhooks.constructEvent()`. Handles 5 events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
- Customer Portal: `POST /api/payments/portal` creates a Stripe Customer Portal session for self-service subscription management (card updates, plan changes, cancellation).
- Donation checkout uses `price_data` with custom `unit_amount` (variable amounts), not a fixed price ID. Min $1, max $1000.
- Security: CSRF origin check on all payment POST routes (checkout, portal). Webhook rate limited at 100/min by IP. Checkout rate limited at 10/15min per user. No Stripe keys in frontend code.
- Frontend pages:
  - Pricing: `frontend/studyhub-app/src/pages/pricing/PricingPage.jsx` at route `/pricing`.
  - Supporters: `frontend/studyhub-app/src/pages/supporters/SupportersPage.jsx` at route `/supporters` (public leaderboard + Pro showcase).
  - Settings Subscription tab: `frontend/studyhub-app/src/pages/settings/SubscriptionTab.jsx` (plan status, portal link, payment history).
  - Admin Revenue tab: `frontend/studyhub-app/src/pages/admin/RevenueTab.jsx` (lazy-loaded, 4 metric cards + recent transactions).
- Rate limiters: `paymentCheckoutLimiter` (10/15min), `paymentPortalLimiter` (10/15min), `paymentReadLimiter` (60/min), `paymentWebhookLimiter` (100/min by IP). All defined in `rateLimiters.js`.

### Hub AI (AI Assistant)

- Backend module: `backend/src/modules/ai/` with routes, service, constants, and context builder.
- Backend routes mounted at `/api/ai` in `backend/src/index.js`.
- Claude API integration: `@anthropic-ai/sdk` with streaming via SSE (Server-Sent Events).
- API key: stored as `ANTHROPIC_API_KEY` environment variable in Railway (never in code).
- Default model: `claude-sonnet-4-20250514`. Detailed system prompt defined in `ai.constants.js` (personality, capabilities, academic integrity rules, full HTML generation spec, context awareness instructions).
- AI-generated sheets use full HTML documents (`<!DOCTYPE html>` with `<head>`, `<style>`, `<body>`) -- NOT fragments. The AI is instructed to include inline `<style>` blocks but NEVER `<script>` tags (scripts trigger Tier 1+ in the security scanner). Sheets flow through the same scan pipeline as user-uploaded HTML.
- Max output tokens: 2048 for Q&A, 16384 for sheet generation (full HTML documents need the larger budget; `MAX_OUTPUT_TOKENS_SHEET` in `ai.constants.js` is the source of truth).
- Database tables: `AiConversation`, `AiMessage`, `AiUsageLog` (migration: `20260331000004_add_ai_assistant_tables`).
- Frontend page: `frontend/studyhub-app/src/pages/ai/AiPage.jsx` at route `/ai`.
- Floating bubble: `frontend/studyhub-app/src/components/ai/AiBubble.jsx` (rendered on all authenticated pages via `createPortal`).
- Chat hook: `frontend/studyhub-app/src/lib/useAiChat.js` manages conversations, SSE streaming, and state.
- API service: `frontend/studyhub-app/src/lib/aiService.js` wraps all `/api/ai` endpoints.
- Context chips: `frontend/studyhub-app/src/lib/useAiContext.js` provides page-aware suggestion prompts.
- Sheet preview: `frontend/studyhub-app/src/components/ai/AiSheetPreview.jsx` extracts HTML from AI responses and offers preview/publish.
- Image upload: `frontend/studyhub-app/src/components/ai/AiImageUpload.jsx` handles file selection, validation, and base64 conversion.
- Markdown renderer: `frontend/studyhub-app/src/components/ai/AiMarkdown.jsx` (lightweight, no external dependency).
- Rate limits: 30 messages/day (regular), 60 (verified), 120 (pro), 120 (admin). Tracked in `AiUsageLog` table. Plan resolved via `getUserPlan()` in `ai.service.js` with graceful degradation.
- Context injection: `ai.context.js` builds dynamic system prompt sections from user's courses, sheets, notes, and current page.
- Streaming: POST `/api/ai/messages` returns SSE stream. Events: `delta` (token), `title` (auto-title), `done` (completion), `error`.
- Sidebar nav link uses `IconSpark` icon. Bubble hidden on `/ai`, `/login`, `/register` pages.

### Achievements V2 (2026-04-30 — DO NOT REVERT)

- Backend module: `backend/src/modules/achievements/` (constants, engine, service, routes, controller, index). Mounted at `/api/achievements` in `index.js`. Public reads use `optionalAuth`; pin / unpin / visibility writes require auth + originAllowlist + writeLimiter.
- Catalog: 54 badges across 10 categories (`authoring`, `forking`, `reviewing`, `notes`, `groups`, `social`, `ai`, `streaks`, `special`, `community`). Tiers are bronze / silver / gold / platinum / diamond + `secret`. Secret badges are hidden from non-holders in all listings.
- XP per tier: 25 / 75 / 200 / 500 / 1500 (secret = variable). Levels derive from total XP via `LEVEL_BRACKETS` in `achievements.constants.js` — keep frontend `levelMath.js` brackets in sync if edited.
- Award engine: `emitAchievementEvent(prisma, userId, kind, metadata)`. Fire-and-forget. Criteria types: `count`, `sum`, `distinct_count`, `streak`, `event_match`, `timed`, `plan_active`, `created_before`, `max_forks_per_sheet`, `max_members_in_owned_group`, `admin_grant`. New trigger sites must use `EVENT_KINDS.*` constants — never raw strings.
- Legacy `lib/badges.js` is now a thin shim that re-exports `checkAndAwardBadges` from the new engine. The 5 original v1 trigger sites (sheet create, fork, contribution submit, sheetLab commit, follow) keep working unchanged. New triggers live in `notes.controller.js`, `studyGroups.controller.js`, `ai.service.js`.
- Schema: `Badge` extended with `xp / isSecret / displayOrder / iconSlug / criteria / updatedAt`. `UserBadge` extended with `pinned / pinOrder / sharedAt`. New tables `AchievementEvent` (event log for time-windowed criteria) and `UserAchievementStats` (denormalized XP cache, also stores `achievementsHidden` privacy flag). Migration `20260501000001_achievements_v2` is additive-only and `IF NOT EXISTS`-guarded.
- Frontend: `frontend/studyhub-app/src/features/achievements/` — `AchievementHexagon`, `AchievementCard`, `AchievementGallery`, `PinnedBadgesStrip`, `LevelChip`, `AchievementUnlockModal`, `AchievementsPage` (route `/achievements`), `AchievementDetailPage` (route `/achievements/:slug`). Tier styles use `--sh-bronze/silver/gold/platinum/diamond/secret` tokens defined in `index.css` for both light and dark mode.
- The `AchievementUnlockModal` is mounted globally at `App.jsx` root and fires when `?celebrate=:slug` appears in the URL. localStorage key `studyhub.achievements.celebrated` records every fired slug so refresh / share-link cannot re-fire. The modal reads the slug directly from the URL each render and strips the param on dismiss — no setState-in-effect.
- Profile integration: `UserProfilePage` Achievements tab uses the new `AchievementGallery`. Both Overview tabs (own + other) render `PinnedBadgesCard` near the top.
- Block / privacy: `/api/achievements/users/:username` honours `isBlockedEitherWay` (try-catch wrapped) and `UserAchievementStats.achievementsHidden` (returns 404 to non-owner viewers). Detail page recent-unlockers list filters via `getBlockedUserIds`.
- Seed: `seedBetaUsers.js` calls `seedAchievementsV2` which seeds the 54-badge catalog and unlocks ~15 badges (3 secrets, 6 pinned) for `beta_student1`. Required for CLAUDE.md §11 — `seed:beta` must produce a visible-end-to-end demo state.
- Plan + decisions: `docs/internal/audits/2026-04-30-achievements-v2-plan.md`. Founder-locked decisions A1–A8 documented there.

### Hub AI v2 — document upload (2026-05-04)

- Backend submodule: `backend/src/modules/ai/attachments/{routes,service,parsers,constants}.js`. Mounted at `/api/ai/attachments` in `index.js`. Routes apply `requireAuth + requireTrustedOrigin + aiAttachment*Limiter` AND `requireFeatureFlag('flag_hub_ai_attachments')` (L20-CRIT-1 fail-closed kill switch).
- Endpoints: `POST /api/ai/attachments` (multer + R2 + parse), `GET /api/ai/attachments` (paginated list), `DELETE /api/ai/attachments/:id` (soft-delete; sweeper drains R2 later), `POST /api/ai/attachments/:id/pin` (extend retention up to per-plan max), `POST /api/ai/save-to-notes` (persist an AI message as a private note).
- Format support: PDF (Anthropic native `document` block), DOCX (mammoth ≥ 1.11.0 — CVE-2025-11849 fix), TXT/MD/code (UTF-8 inline), images (existing vision block). PPTX/RTF/ODT/XLSX/CSV deferred to v3.
- Per-plan caps: `payments.constants.js#PLANS[plan].aiDocument*`. Free 5 MB / 40 pages / 3 docs/day, verified 15 / 60 / 5, pro 30 / 100 / 20, admin 30 / 100 / unlimited. Per-plan caps enforced at the upload route BEFORE R2 write (CLAUDE.md A4 + L3-HIGH-3 atomic-storage-quota race fix).
- `cache_control: { type:'ephemeral', ttl:'1h' }` on system prompt + every document content block (master plan L1-CRIT-2). Verify cache-hit fraction via `usage.cache_read_input_tokens` in the SSE response — target ≥ 60% across active doc-Q sessions.
- Anthropic spend ceiling: `AI_DAILY_SPEND_USD_CEILING` env var (default 100, in dollars). Atomic UPDATE-and-compare on `AiGlobalSpendDay` per call. **Setting to 0 is a true kill switch** for all non-admin Anthropic calls (L20-HIGH-5). Admin tier always bypasses (founder-locked 2026-05-04, unlimited messages AND unlimited spend).
- R2 bucket isolation: `R2_BUCKET_AI_ATTACHMENTS` is REQUIRED in production (separate from public-image bucket). Opaque keys via `crypto.randomBytes(32).toString('hex')`. Signed URL TTL ≤ 10 min. `Cache-Control: private, no-store` on every PUT.
- Two-phase retention sweeper (`backend/src/lib/jobs/aiAttachmentSweeper.js`, scheduled every 6h via `runWithHeartbeat`): mark `deletedAt` first, then drain R2 at ≤ 10 deletes/sec with no DB transaction wrapping the round-trip.
- Idempotency-Key support on uploads: 24h TTL via `AiUploadIdempotency`. Cross-user reuse treated as a miss.
- Salted XML wrapper around document content per Anthropic prompt-injection guidance: `<document_${conversationId.slice(0,8)}>` in `attachments.constants.js`. Plus 9-defense prompt-injection list per master plan §4.6 (NFKC normalize, vision-block trust clause, PDF metadata strip, etc.).
- Frontend composer: `components/ai/{AiComposer, AiAttachmentUpload, AiSlashCommandMenu, AiMentionMenu, AiStopButton, AiSaveToNotesButton, AiCitationFootnote, AiCitationSidePanel, AiDensityToggle, AiStreamAnnouncer}.jsx`. Slash menu + mention menu use the WAI-ARIA APG combobox-with-listbox pattern (Tab/Enter confirms — L4-F1).
- Streaming flicker fix (Bug D): 5-layer fix — `useFetch` SWR `keepPreviousData` semantics, `streamState` refcount + 5-min watchdog, `useLivePolling` attention-throttle + `isStreamingActive()` skip, call-site `loading && !data` skeleton guards, `useAiChat` provider-unmount cleanup that aborts the controller AND decrements the refcount (L16-HIGH-3).

### Scholar v1 + v1.5 (2026-05-04)

- Backend module: `backend/src/modules/scholar/{routes, *.controller, service, constants, rateBucket, sources/*}.js`. Mounted at `/api/scholar`. Routes apply `requireAuth + requireFeatureFlag('flag_scholar_enabled')` (L20-CRIT-2 fail-closed kill switch). Writes also apply `originAllowlist`.
- 5 v1 source adapters (`scholar.sources/*.js`): Semantic Scholar, OpenAlex, CrossRef, arXiv, Unpaywall. CORE + PubMed deferred to v1.5. Per-source token bucket (`rateBucket.js`) enforces upstream rate-limit etiquette (S2 1/s, OpenAlex 8/s with key, CrossRef 30/s, arXiv 0.33/s = 1 per 3s per arXiv ToS, Unpaywall 8/s).
- OpenAlex requires API key as of Feb 13 2026 — `OPENALEX_API_KEY` is RECOMMENDED in `secretValidator.js`. `SEMANTIC_SCHOLAR_API_KEY` raises rate from 1/s to 10/s when present.
- Search dedupe: DOI primary, then `(normalized title, first-author)` hash. Search results cached in `ScholarPaperSearchCache` (1h TTL, sweeper required).
- Paper detail / citations / references / pdf: read-side cache via `cacheControl(maxAge=300, sMaxAge=3600)` on stable endpoints. Topic feed at `cacheControl(60)`.
- OA-PDF cache: license-gate `isOpenAccessLicense()` BEFORE any R2 write. Static `SCHOLAR_PDF_HOST_ALLOWLIST` (arxiv, pmc, plos, peerj, mdpi, etc.) — derived-from-upstream allowlist was the L1-CRIT-2 SSRF amplification bug, now fixed.
- 8-style citation export (`scholar.cite.controller.js`): BibTeX, RIS, CSL JSON, APA, MLA, Chicago, IEEE, Harvard. BibTeX exporter escapes the 10 LaTeX-active chars + strips bare `\letter` to neutralize `\input{}` / `\write18{}` (L3-HIGH-6 fix).
- v1.5: `ScholarAnnotation` (highlight, color, body, visibility=private/school/public) + `ScholarDiscussionThread` (school-scoped peer-review). Annotation `school` visibility filters by `viewerSchoolId` joined through `UserSchoolEnrollment` per L13-HIGH-3 — earlier code leaked annotations cross-school.
- AI deep-link endpoints (`POST /api/scholar/ai/summarize`, `POST /api/scholar/ai/generate-sheet`) return `{ context, suggestedPrompt, quotaCostMessages }` only — they do NOT call the AI module internally. Frontend forwards to `POST /api/ai/messages` so spend ceiling + per-user quota stay enforced in one place.
- Frontend pages: `frontend/studyhub-app/src/pages/scholar/{ScholarPage, ScholarSearchPage, ScholarPaperPage, ScholarSavedPage, ScholarTopicPage}.jsx`. Editorial-serif headings (`var(--font-paper)`: Noto Serif → Noto Sans CJK/Arabic/Devanagari → Georgia → serif). PDF.js iframe sandbox is `allow-scripts allow-popups allow-forms` — NEVER `allow-same-origin` (CLAUDE.md A14).
- Plan + decisions: `docs/internal/audits/2026-05-04-master-plan-hub-ai-library-bugs.md`. Figma direction at `docs/internal/audits/2026-05-04-figma-prompt-hub-ai-scholar.md`. All 91 findings from the 5-loop pre-implementation review folded in §24; ~245 findings from the 20-loop post-implementation review tracked across that doc + the deploy checklist.

### Library — weekly corpus sync (2026-05-04)

- New job in `backend/src/modules/library/library.weeklySync.js` paged through Google Books to grow `CachedBook` ~5K rows/week via 49 rotating academic queries (`scripts/seedLibrarySyncQueries.js`).
- Scheduled in `index.js` via `runWithHeartbeat('library.weekly_corpus_sync', fn, { slaMs })` INSIDE the `setInterval` arrow (CLAUDE.md A10 + L2-CRIT-1).
- `LIBRARY_SYNC_ENABLED=false` is the kill switch. `LIBRARY_SYNC_CONTACT_EMAIL` populates Google Books polite-pool User-Agent (CRLF-stripped per L2-MED-4 to defeat header injection).
- After ~10 weeks the corpus reaches ~50K titles; the read path can flip to "local-first, Google-fallback" — addresses the page-10-of-50K cap users hit pre-cycle.

### Performance Infrastructure

- `useFetch` hook (`frontend/studyhub-app/src/lib/useFetch.js`) supports opt-in SWR caching via `swr` option (ms). Cached data is returned instantly while a background revalidation fetch runs. Cache is a module-level `Map` exported as `cache`.
- `clearFetchCache(cacheKey?)` invalidates one or all cache entries. Called automatically on logout in `session.js`.
- Cache expiry: `sweepCache()` runs every 60 seconds, evicting entries older than 10 minutes (`CACHE_MAX_AGE_MS`) and enforcing a 50-entry cap (`MAX_CACHE_SIZE`). The sweep timer starts lazily on first SWR cache hit.
- `prefetch.js` (`frontend/studyhub-app/src/lib/prefetch.js`) warms the SWR cache on sidebar link hover via `requestIdleCallback`. Maps 9 routes to API endpoints with 30-second debounce.
- `cacheControl.js` (`backend/src/lib/cacheControl.js`) is an Express middleware for HTTP `Cache-Control` headers. Applied to stable public endpoints (platform-stats, schools, popular courses, preferences).
- All pages use skeleton loading placeholders from `frontend/studyhub-app/src/components/Skeleton.jsx` instead of bare "Loading..." text.
- Rate limiters are centralized in `backend/src/lib/rateLimiters.js` (49+ limiters). All time windows use shared constants from `constants.js` (`WINDOW_1_MIN`, `WINDOW_5_MIN`, `WINDOW_15_MIN`, `WINDOW_1_HOUR`, `WINDOW_1_DAY`). Never define inline rate limiters in route files.
- Shared constants: `backend/src/lib/constants.js` exports pagination helpers (`clampLimit`, `clampPage`, `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`), time window constants, and content limit constants (`MAX_MESSAGE_LENGTH`, `MAX_ANNOUNCEMENT_LENGTH`, `MAX_DONATION_MESSAGE_LENGTH`).
- Socket.io event constants: `backend/src/lib/socketEvents.js` and `frontend/studyhub-app/src/lib/socketEvents.js` define all Socket.io event names as constants. Always import from these files instead of hardcoding event strings.
- Error codes: `backend/src/middleware/errorEnvelope.js` exports `sendError(res, status, message, code, extra)` and `ERROR_CODES` with common HTTP codes (`UNAUTHORIZED`, `VALIDATION`, `NOT_FOUND`, `INTERNAL`, `BAD_REQUEST`, `CONFLICT`, `RATE_LIMITED`) plus domain-specific codes. New routes should use `sendError` instead of raw `res.status().json({ error })`.

### CSS and Styling

- Inline style colors must use CSS custom property tokens from `index.css`. Semantic tokens (`--sh-danger`, `--sh-success`, `--sh-warning`, `--sh-info` with `-bg`, `-border`, `-text` variants), slate scale (`--sh-slate-50` through `--sh-slate-900`), and surface tokens (`--sh-surface`, `--sh-soft`, `--sh-border`). Exceptions: dark-mode-always editor panels, unique per-metric palette colors, white text on colored buttons.
- Modals inside animated containers must use `createPortal(jsx, document.body)`. Any ancestor with `transform` (e.g., anime.js `fadeInUp`) creates a new containing block that breaks `position: fixed` viewport centering.
- Emoji policy (decided April 19, 2026 as part of the v2 design refresh): emoji are permitted ONLY inside user-generated content (feed posts, messages, note bodies, group discussions, comments, profile bios). Emoji are NEVER permitted in UI chrome — no emoji in component copy, buttons, headings, labels, toasts, modals, empty states, nav items, tab labels, or placeholder text. When rendering user content that contains emoji, treat it as normal text; do not strip it. This supersedes the earlier "no emojis anywhere" rule.

### HTML Security Policy (revised 2026-05-03 — AI-first review)

- All HTML is accepted at submission. `validateHtmlForSubmission()` only checks empty/size. The scan pipeline (`detectHtmlFeatures` → `classifyHtmlRisk` → tier 0-3) classifies risk and routes content. Nothing is auto-blocked by tag name.
- **Tier 0 (CLEAN)** — auto-publish.
- **Tier 1 (FLAGGED)** — auto-publish after the user acknowledges the findings. Now includes sandbox-neutralized behaviors that used to escalate: network primitives (fetch/XHR/WebSocket/sendBeacon/EventSource — runtime CSP `connect-src 'none'` blocks them), `document.cookie`/`document.domain` access (iframe has no parent cookies), `window.location` redirects (sandbox blocks top-nav), external `<form action="https://...">` (CSP `form-action 'none'` blocks submission), plus the original Tier 1 features (script tags, iframes, inline handlers, dangerous URLs).
- **Tier 2 (HIGH_RISK)** — pending admin review, BUT the AI reviewer (`backend/src/modules/sheetReviewer`) runs immediately and either approves (→ published), rejects (→ rejected), or escalates for human review when confidence is low. Admins are paged ONLY on escalations. Tier 2 triggers are narrow: heavy obfuscation (≥8 `String.fromCharCode` or ≥10 hex/unicode escapes), `eval()`/`Function()`/string-arg `setTimeout`/`setInterval`/`atob()`, keylogging-with-network-exfil (all three: key listener + reads `event.key` + fetch/XHR/sendBeacon), known crypto-miner signatures.
- **Tier 2 PUBLISHED → interactive for all authenticated viewers.** Once an admin (or the AI reviewer) flips a Tier 2 sheet to `status='published'`, the interactive runtime opens to any authenticated viewer. The sandbox (`allow-scripts allow-forms` only, never `allow-same-origin` per A14, runtime CSP with `connect-src 'none'`) keeps the parent app safe regardless of tier. Un-publishing invalidates outstanding runtime tokens via `updatedAt` versioning (5-min TTL).
- **Tier 3 (QUARANTINED)** — AUTO-REJECTED at submit. User receives a `sheet_rejected` notification (essential, bypasses block filters) with the reason. No admin queue. Tier 3 triggers: critical-severity findings (credential capture = external form + password/sensitive name field), 3+ distinct Tier 2 high-risk categories, coordinated miner+obfuscation, ClamAV detection.
- **Why the relaxation.** Day-1 thresholds were calibrated for "scanner is the safety net." With the sandbox CSP blocking the actual exploit channels (network exfil, top-nav, form submit), Tier 1 is the right home for those informational findings. Tightened Tier 2 catches genuine exploit primitives only; Tier 3 catches unambiguous malware. Manual admin review at scale is impossible (target: 1k+ sheets/week), so the AI reviewer handles ~98% and admin sees only escalated edge cases.

## Database and Migrations

### Prisma Conventions

- Schema location: `backend/prisma/schema.prisma`.
- Prisma version: 6.x. Use `NOT: [{ courseId: null }]` (array form at the where level) for null-exclusion in `groupBy` and `where` clauses. Do NOT use `field: { not: null }` -- Prisma 6.19+ rejects `null` as the value for `not` with "Argument `not` must not be null."
- All relation fields must use correct Prisma syntax. Test queries against the actual schema before committing.

### Migration Rules (CRITICAL)

- Every new Prisma model MUST have a corresponding migration SQL file before deployment. If you add a model to `schema.prisma`, you MUST also create a migration in `backend/prisma/migrations/<timestamp>_<description>/migration.sql`.
- Migration naming convention: `YYYYMMDDHHMMSS_description` (e.g., `20260330000004_add_messaging_tables`).
- Migrations must be idempotent-safe SQL: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ADD CONSTRAINT` with proper `ON DELETE` / `ON UPDATE` behavior.
- After deploying new code with migrations, run `npx prisma migrate deploy` on the production server (Railway).
- Never assume a table exists just because the Prisma model is defined. Always verify there is a migration file that creates the table.
- When adding features that touch new tables, check `backend/prisma/migrations/` to confirm the table creation migration exists. If it does not, create one.

### Current Migration Inventory

Tables with migrations (safe to query):

- User, StudySheet, Course, School, Announcement, Note, FeedPost, Contribution, and all v1.0 tables (migration: `20260315000000_v1_complete`)
- Email-related tables (multiple migrations from `20260316` - `20260317`)
- Google OAuth, Preferences, Moderation tables (migration: `20260318040000`)
- School/Course rework (migration: `20260319020000`)
- Staff verification (migration: `20260326100000`)
- Contribution checksums (migration: `20260329000001`)
- StudyGroup, StudyGroupMember, GroupResource, GroupSession, GroupSessionRSVP, GroupDiscussionPost, GroupDiscussionReply (migration: `20260330000001`)
- ShareLink, ContentShare (migration: `20260330000002`)
- UserBlock, UserMute (migration: `20260330000003`)
- Conversation, ConversationParticipant, Message, MessageReaction (migration: `20260330000004`)
- Note.pinned, Note.tags columns (migration: `20260331000002_add_note_pinned_and_tags`)
- NoteStar, NoteVersion (migration: `20260331000003_add_note_star_and_note_version`)
- AiConversation, AiMessage, AiUsageLog (migration: `20260331000004_add_ai_assistant_tables`)
- Subscription, Payment, Donation (migration: `20260403000001_add_payment_tables`)
- StudyGroup trust & safety (moderation, mute, strikes, GroupReport, GroupAppeal, GroupAuditLog, GroupBlock) — migration `20260409000002_add_group_trust_and_safety` (rewritten 2026-05-04 with full `IF NOT EXISTS` / `DO $$ EXCEPTION WHEN duplicate_object` guards per CLAUDE.md A5 — closes Bug A "Failed to load groups").
- Hub AI v2 + library weekly sync — migration `20260504000001_hub_ai_v2_and_library_sync`. Adds `AiAttachment`, `UserAiStorageQuota`, `AiGlobalSpendDay`, `AiUploadIdempotency`, `LibrarySyncState` tables + `AiMessage.attachments` + `AiUsageLog.{documentCount,tokensIn,tokensOut,documentTokens,costUsdCents}`.
- Scholar v1 + v1.5 — migration `20260504000002_scholar_v15`. Adds `ScholarPaper`, `ScholarPaperSearchCache`, `ScholarAnnotation`, `ScholarDiscussionThread` + `ShelfBook.sourceType` / `paperId`.

## Internal Documentation Layout (added 2026-04-30)

All internal planning, security, and runbook docs live under `docs/internal/` and are gitignored. Find a doc by its purpose, not by guessing the filename:

```text
docs/internal/
├── README.md                                  Index — start here
├── api-reference.md                           Backend API contract
├── audit-routines.md                          Sweepers and recurring jobs
├── beta-v2.0.0-release-log.md                 Private cycle log (gitignored)
├── figma-design-guide.md                      Design tokens / component kit
├── hub-ai-v2-plan.md                          AI assistant master plan
├── mobile-archive.md                          Mobile companion plan + dev-testing (paused)
├── playground-v1-plan.md                      Playground feature plan
├── railway-deployment-guide-v2.0.md           Production deploy reference
├── roles-and-permissions-plan.md              Role model + OAuth picker
├── web-master-plan.md                         8-phase web refresh + roles + Creator Audit
│
├── audits/                                    ACTIVE plans + reports only
│   ├── README.md                              What's active and why
│   ├── 2026-04-24-feature-expansion-roadmap.md       Multi-week roadmap (active)
│   ├── 2026-04-24-feature-expansion-security-addendum.md  Per-track security checklists (active)
│   ├── 2026-04-30-final-report.md             Loops 1-10 outcome + Railway checklist
│   ├── 2026-04-30-deferred-plans.md           Admin MFA + modal focus traps plans
│   ├── 2026-04-30-2fa-recovery-codes-plan.md  Deferred — needs founder approval
│   └── 2026-04-30-achievements-v2-plan.md     Parallel agent's active work
│
├── archive/                                   COMPLETED / superseded — historical context
│   ├── README.md
│   ├── audits/
│   │   ├── 2026-04/                           Closed handoffs from April 2026
│   │   └── 2026-04-30-loops/                  Working notes superseded by final-report
│   └── superpowers/                           Older planning docs
│
├── logs/                                      Activity logs (gitignored)
│
└── security/                                  Runbooks and security playbooks
    ├── CONTACTS.md                            Who to call for what
    ├── INCIDENT_PLAYBOOK.md                   Incident response steps
    ├── RUNBOOK_DB_RESTORE.md                  Database backup / restore + monthly verification
    ├── RUNBOOK_OUTAGE.md                      Outage response
    ├── RUNBOOK_SECRETS_ROTATION.md            Rotating JWT, OAuth, API keys
    ├── RUNBOOK_SECURITY.md                    General security runbook
    ├── RUNBOOK_SWEEPERS.md                    Background sweeper operations
    ├── html-finding-categories.md             HTML scanner finding glossary
    ├── html-moderation-playbook.md            Tier 0-3 admin review flow
    └── security-overview.md                   Threat model summary
```

**Rules for finding the right doc:**

- Latest session report is always the most recent `audits/YYYY-MM-DD-final-report.md` (or `*-handoff.md` for older cycles). Read this first to understand what's in flight.
- A plan that's been shipped or superseded moves to `archive/audits/<bucket>/`. The active `audits/` folder stays lean.
- Operational runbooks (incident, outage, restore, rotation) NEVER move to archive — they're load-bearing for ops.
- The `security/` folder is the canonical home for anything an on-call would grep for during an incident.

**When you finish work:**

1. If a doc described that work, move it to the appropriate `archive/audits/<bucket>/` subfolder.
2. Update `audits/README.md` to reflect what's still active.
3. Update CLAUDE.md only if the path-pattern itself changed (e.g. new top-level subfolder created).

## Repo Workflow Conventions

- Scan existing implementation patterns before editing. Follow the established style unless correctness requires a change.
- Keep changes incremental and pattern-aligned.
- Prefer fixing root causes over local patches.
- Two release logs run in parallel:
  - **Public, tracked log:** `docs/release-log.md`. CI (`Enforce release log update` in `.github/workflows/ci.yml`) requires every PR that touches `backend/`, `frontend/`, `scripts/`, `.github/workflows/`, `docker-compose.yml`, or `package.json` to add a one-line entry under the most recent cycle heading. Keep entries factual and user-visible.
  - **Private, gitignored log:** `docs/internal/beta-v2.0.0-release-log.md`. After each beta implementation cycle, document the full deliverables, decisions, security checklists, validation results, and agent hand-offs here. This file is the canonical internal record but is never tracked in git, so it cannot satisfy the CI gate on its own.
- For frontend validation in this repo, `npm --prefix frontend/studyhub-app run lint` is the reliable full-lint command.
- Use quoted paths in PowerShell because the workspace path contains spaces.
- `.git-blame-ignore-revs` at the repo root lists commits skipped by `git blame`. Enable locally with `git config blame.ignoreRevsFile .git-blame-ignore-revs`. GitHub honors it automatically. Add new revs when landing mechanical commits (reformats, mass renames, codemods) that would otherwise pollute blame.

## UI / Design Conventions

- Design baseline: Plus Jakarta Sans, token-based styles in `frontend/studyhub-app/src/index.css`, modern clean cards/gradients, and consistent icon treatment.
- Preserve the current HomePage visual language unless a task explicitly calls for a redesign.
- UserAvatar component (`frontend/studyhub-app/src/components/UserAvatar.jsx`) must be used everywhere a user's profile picture is displayed. It handles fallback avatars automatically.

## Comment Policy

Comments answer **why**, not **what**. The code is the source of truth for what it does; comments earn their keep by capturing context that the code can't.

**KEEP** — comments that explain WHY:

- A business rule or invariant that isn't obvious from the code itself.
- A non-obvious decision rationale or trade-off (with the reasoning).
- A security or correctness constraint (e.g., "must run before X because Y").
- A reference to an external spec, RFC, issue, or doc by URL.
- A reference to a founder-locked decision (e.g., "decision #17", "decision #20") — these are anchors that future agents check against the master plan, not metadata.

**DELETE** — comments that add noise:

- Sprint number, cycle number, PR number, reviewer attribution ("Cycle 4", "Sprint X", "Copilot review #4", "fixed for round 3").
- Version/date stamps on individual lines ("Added in v1.7.0", "Changed 2026-04-12") — git already has this.
- Comments that restate what the code literally does (`// increment counter` above `counter++`).
- Stale TODOs that no longer apply, or `TODO(name)` with departed-author handles.
- Process meta-commentary ("done in this PR", "see chat", "as discussed").

**CONVERT** — historical comments that contain a load-bearing fact:

- "Changed in v1.7.0 to fix X" → either delete (if the rationale is obvious now) or keep just the rationale ("Order matters: must precede Y").
- Date-stamped notes only when the date itself is the load-bearing fact (e.g., "Mobile work paused 2026-04-23, files preserved for resume").

### Load-bearing exceptions (do NOT sweep these even if they look like metadata)

- Test-file names like `cycle36-decomposed-pages.smoke.spec.js` and Playwright grep tags like `@cycle36-smoke` — these are CI selectors.
- `describe()` block names that contain a cycle/phase tag and surface as test IDs in CI output.
- `Phase N` tags in `scripts/seedFeatureFlags.js` and on shipped `design_v2_*` flag definitions — these are the canonical pointer back to the master plan and required by CLAUDE.md §12.
- `decision #N` references — explicit anchors to founder-locked decisions in roadmap + security addendum.
- Date stamps where the date itself is the load-bearing fact (e.g., "Mobile work paused 2026-04-23, files preserved for resume").
- Any constant whose name happens to match the metadata regex (e.g., `CYCLE_LENGTH_MS`, `PHASE_2_TIMEOUT`).

When in doubt, leave the comment and flag it for the founder.

## Validation Commands

Root workspace:

- `npm --prefix backend test`
- `npm --prefix backend run lint`
- `npm --prefix frontend/studyhub-app run lint`
- `npm --prefix frontend/studyhub-app run build`
- `npm --prefix frontend/studyhub-app run test:e2e:beta`
- `npm run beta:validate`

Full workspace shortcuts:

- `npm run lint`
- `npm run build`
- `npm run test`

## Common Bugs and Pitfalls

These have been encountered and fixed. Do not reintroduce them.

1. **Missing `/api` prefix in frontend fetch URLs.** All backend routes are mounted under `/api/`. The `API` config constant is the origin only (e.g., `http://localhost:4000`). Every fetch must use `${API}/api/...`. Forgetting this causes 404s in production.

2. **Search response shape mismatch.** The `/api/search` endpoint returns `{ results: { sheets, courses, users, notes, groups } }`. Always access nested: `data.results.users`, not `data.users`.

3. **Prisma 6.x null syntax.** Use `NOT: [{ field: null }]` (array form at the where level) for null-exclusion. Do NOT use `field: { not: null }` -- Prisma 6.19+ rejects it with "Argument `not` must not be null."

4. **Socket.io event name mismatches.** Frontend must use exact backend event names: `message:edit` (not `message:edited`), `message:delete` (not `message:deleted`), `typing:start`/`typing:stop` (not `typing:update`), `conversation:join` (not `message:room:join`).

5. **Missing database migrations.** Adding a Prisma model without a migration means the table does not exist in production. Always create the migration SQL file.

6. **Unguarded `getBlockedUserIds`/`getMutedUserIds` calls.** These will throw if the UserBlock/UserMute tables do not exist. Always wrap in try-catch with graceful degradation (empty array fallback).

7. **`createdAt` vs `timestamp` field names.** Backend API returns `createdAt`. Some frontend code may use `timestamp`. Always prefer `msg.createdAt || msg.timestamp` when grouping or sorting messages.

8. **Modals broken inside animated containers.** Use `createPortal(jsx, document.body)` for any modal that might be rendered inside a component with CSS `transform`.

9. **useFetch infinite loop from inline `transform`.** Never put `transform` in `useCallback` or `useEffect` dependencies. The hook stores it in a `useRef` to avoid re-fetch loops from inline arrow functions.

10. **Rate limiter name mismatches after centralization.** When importing from `rateLimiters.js`, the export names follow `<context><Action>Limiter` (e.g., `uploadAvatarLimiter`). Verify the exact export name matches the import before deploying.

## Current Search Logic Map

Search entry points:

- Landing-page hero search in `frontend/studyhub-app/src/pages/home/HomePage.jsx`
- Global modal search in `frontend/studyhub-app/src/components/SearchModal.jsx`
- Sheets page search/filter state in `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`
- Unified backend search endpoint in `backend/src/modules/search/search.routes.js`
- Sheet listing search in `backend/src/modules/sheets/` routes

## Current Search Consistency Status

- SheetsPage and global search now share the same sheet text-search clauses through `backend/src/lib/sheetSearch.js`.
- Browser coverage now includes legacy SheetsPage URL normalization in `frontend/studyhub-app/tests/search.regression.spec.js`.
- Live beta-stack privacy coverage now exists in `frontend/studyhub-app/tests/search.privacy.beta-live.spec.js` for unauthenticated and non-classmate viewers.
- SearchModal search requests must keep `credentials: 'include'` so authenticated global search works on the split-origin beta stack.

## Testing Gaps To Close

- Extend browser coverage for the auth-gated HomePage search flow to assert the post-login return behavior if StudyHub later preserves destination after redirecting public users to `/login`.
- Add integration tests for messaging endpoints once the messaging tables are deployed.
- Add E2E tests for the DM auto-start flow (profile -> `/messages?dm=userId` -> conversation creation).
- Backend test coverage recently added for: payments module (45 tests), core utilities (70 tests: constants, cache, authTokens), validation middleware (60+ tests). Still untested: video module, SheetLab, WebAuthn, rateLimiters, r2Storage, socketio, storage, plagiarism.
- Frontend E2E coverage recently added for: pricing page, settings page (subscription tab), AI page, user profile page. Still untested: library/books pages, dashboard page, courses page, legal pages, playground page.

## Working Agreement For AI Agents

When handling a new task:

1. Read this file first.
2. Explain how the relevant feature currently works before proposing edits.
3. Produce a file-by-file plan before coding for non-trivial changes.
4. Before writing any new backend feature, verify that all required database tables have corresponding migrations in `backend/prisma/migrations/`. If a migration is missing, create it before proceeding with the feature code.
5. All frontend API calls must use `${API}/api/...` (never omit the `/api` prefix).
6. Validate changes with the smallest relevant lint/test/build commands, then broader checks if the surface area is wider.
7. Update both release logs when a beta-cycle code change is completed: a one-line entry in the tracked public log (`docs/release-log.md`, required by CI) and the full cycle write-up in the private log (`docs/internal/beta-v2.0.0-release-log.md`).
8. Do not put emoji in UI chrome (component copy, buttons, headings, labels, nav, empty states, toasts). Emoji are allowed only inside user-generated content surfaces (feed posts, messages, notes, comments, group discussions, profile bios). See "CSS and Styling" for the full policy.
9. All inline style colors must use CSS custom property tokens (`var(--sh-*)`).
10. Wrap any call to `getBlockedUserIds` or `getMutedUserIds` in try-catch for graceful degradation.
11. **Every feature that adds a new UI surface MUST include a seed update so `npm run seed:beta` produces a localhost state where the feature is visible end-to-end for `beta_student1` without manual data setup.** Tests passing is necessary but not sufficient — a feature that only renders with hand-inserted DB rows is invisible during smoke tests and every downstream design/UX/timing decision is made blind. If the feature is flag-gated, seed the flag row as enabled. If it requires domain data (exams, sheets, groups, etc.), seed a plausible example. The rule is: `git pull && npm run seed:beta && log in as beta_student1` must result in every new Day-N feature rendering on its intended page with realistic data. Retroactive application is expected when touching an existing feature that shipped dark.
12. **Flag evaluation is fail-CLOSED in all environments (decision #20, 2026-04-24).** The client's `designV2Flags.js` hook treats every non-green signal as DISABLED: missing `FeatureFlag` row (`FLAG_NOT_FOUND`), network error, non-200 response, malformed JSON. Only an explicit `{ enabled: true }` turns a flag on. The trade is chosen deliberately: a missing row in prod makes a shipped feature visibly invisible (user ticket, 30-second fix — run the seed) rather than letting an in-flight WIP surface silently leak to real users. Flag provisioning is centralized in `backend/scripts/seedFeatureFlags.js`, which is safe for any environment (no user data, upsert-only, idempotent). Run `npm --prefix backend run seed:flags` as part of prod deployment and whenever a phase ships. Local dev inherits the same seed automatically through `seed:beta`. The canonical list of shipped flag names lives in `SHIPPED_DESIGN_V2_FLAGS` inside `scripts/seedFeatureFlags.js`. When a phase ships: add its flag name to `SHIPPED_DESIGN_V2_FLAGS` and run `seed:flags` in the same deploy — no row for an in-flight flag means the gate stays closed, which is now the correct default and does not need an explicit `enabled=false` row. `IN_FLIGHT_DESIGN_V2_FLAGS` in `scripts/seedBetaUsers.js` is documentation-only; it exists so the in-flight roster is visible at a glance but no longer drives behavior.
    Roles v2 flags follow the same fail-closed rule in `frontend/studyhub-app/src/lib/rolesV2Flags.js`; run `node backend/scripts/seedRolesV2Flags.js` before relying on those shipped role surfaces in an environment.

## Active Design Refresh Cycle (v2, April 2026)

Founder-approved design refresh in progress. Context for any agent picking up this work:

- Web master plan, roles integration, week-2-to-5 execution log, scholar tier (web portion), cloud import, creator audit, sheet custom CSS — all consolidated into `docs/internal/web-master-plan.md` (sections 1-7). Read the relevant section before editing any page it covers.
- Mobile companion plan is archived at `docs/internal/mobile-archive.md` — section 5 (v2 companion plan) + section 6 (dev-testing procedures: LAN IP auto-sync, firewall setup, APK build flow). Mobile work is paused as of 2026-04-23; do not start new mobile work unless Abdul explicitly reopens it.
- Role model + OAuth picker flow (underlying the roles integration above): `docs/internal/roles-and-permissions-plan.md`.
- **All internal planning docs live in `docs/internal/` and are gitignored.** Do not recreate planning docs at the `docs/` root. Do not reference them by the old root path.
- Identity: stay "Campus Lab" (warm paper, `#f6f5f2`, ink typography, blue `#2563eb` accent). Gradients remain accent moments on hero/auth only; do NOT gradient-fill inner app pages.
- Emoji policy (see above): user content only, never UI chrome. The mockup's "Welcome back, Jaden 👋" renders as "Welcome back, Jaden" in our implementation.
- Sheets browse Grid/List toggle: default List for all users; may revisit default for new users later.
- Sheet card preview: adding `previewText` column to `StudySheet` (server-extracted from sanitized HTML on create/update). New migration required per the Migration Rules.
- Top nav: keep existing `NavBar` + `--sh-nav-bg` chrome. Spacing/search polish only.
- Phase 1: UserProfilePage widgets, AppSidebar — SHIPPED 2026-04-23 behind `design_v2_phase1_dashboard`.
- Phase 2: Upcoming Exams (read + write, preparednessPercent column, /api/exams CRUD, component-kit foundation) — SHIPPED 2026-04-24 behind `design_v2_upcoming_exams`, fail-CLOSED per decision #20.
- Phase 3: Inline Hub AI suggestion card (AiSuggestion model, /api/ai/suggestions endpoints, PII redaction, shared daily quota with Hub AI) — SHIPPED 2026-04-28 behind `design_v2_ai_card`.
- Phase 4: Sheets browse refresh (Grid/List toggle, server-extracted previewText cards, Search across StudyHub cross-school toggle, filter pill `selected` state on Chip primitive, §1 school-scoped sheet discovery) — SHIPPED 2026-04-27 behind `design_v2_sheets_grid`.
- Phase 5 auth split remains parked while Path A advances. Current in-flight path: Creator Audit backend foundation behind `design_v2_creator_audit` (consent table, audit-grade columns, `/api/creator-audit`, five audit primitives) is implemented; next Creator Audit slice is the frontend consent/audit UI, publish-flow wiring, seed fixtures, and backfill job. Sheet custom CSS still chains after Creator Audit.
- Creator Audit currently has no dedicated deploy secrets; it inherits the normal database, CSRF/origin checks, Sentry, and centralized rate limiter configuration. If a future audit webhook or AI integration is added, document the new env vars in `backend/.env.example` in the same change.
- Hard rules for this cycle (with the v2.1 dependency exception carved out below):
  - No auth logic changes without founder approval.
  - No git commits without founder approval.
  - No hardcoded colors — always use `var(--sh-*)` tokens.
  - No ad-hoc npm dependency churn. Do not add unused packages "just in case". Do not swap one library for another because you prefer it.

- **v2.1 dependency exception (updated April 22, 2026).** The earlier blanket ban on `package.json` and `package-lock.json` changes is relaxed in the following narrow circumstances. This exception exists because discovery during v2 implementation surfaced cases (like the missing `idb` install on `/notes`) where the alternatives — rewriting library internals from scratch, or shipping broken routes — waste more time than a clean, auditable dependency change. **Abuse the exception and it gets revoked.**
  - **Allowed without prompting again:** running `npm install` at the root of a workspace when the package is already declared in `dependencies` / `devDependencies` (i.e., you are syncing `node_modules` and at most regenerating `package-lock.json` to match the existing declaration). This is not a "new dep" — it is an install step a new developer would run.
  - **Allowed when it is the ONLY viable path** — e.g., the page is crash-broken because of a missing module, there is no realistic inline-rewrite option within a few hours, and there is no existing dep that already solves the same problem:
    1. Add exactly one dependency at a time.
    2. Pin to a specific `~` or `^` range that matches the repo's existing styling.
    3. Update both `package.json` and `package-lock.json` in the same commit.
    4. Do not add transitive helpers ("while I'm in here…"). One problem → one dep.
    5. Log the add in `docs/internal/beta-v2.0.0-release-log.md` under a `### Dependency changes` subsection with: date, package name + version, why no existing dep solved the need, and a one-line rollback plan. Add a one-line bullet to `docs/release-log.md` as well so the public log mentions the new dep.
  - **Still forbidden without an explicit founder "yes" in chat:**
    - Major version bumps of React, React Router, Vite, Prisma, Express, Socket.io, Tailwind, or any auth/crypto library.
    - Replacing a library the repo already uses with a competitor.
    - Adding runtime deps for purely internal developer-experience wins (formatters, linters, test reporters). Those go in `devDependencies` only, and still need founder approval.
    - Adding anything that pulls native binaries or postinstall scripts into CI (Capacitor plugins, sharp, canvas, puppeteer, etc.).
  - **Preferred order of remediation when an import is missing:**
    1. Check whether the package is already declared in `package.json`. If yes, it is a sync problem — run `npm install` at that workspace; no founder approval required.
    2. If the code is using <50 LOC worth of the library (like `idb` was) and there is a first-party standard API that replaces it (IndexedDB, fetch, FormData, URL, Intl, crypto.subtle, etc.), rewrite inline with no new dep.
    3. If neither option works, follow the "Allowed when it is the ONLY viable path" checklist above and log the exception.
  - **`package-lock.json` rules specifically:** never hand-edit. Only regenerate via `npm install`. If `package-lock.json` changes because of a legitimate install, commit it with the matching `package.json` change in the same commit so bisect stays clean.

### Workspace lockfile sync — non-negotiable (added 2026-05-04)

This repo is an **npm workspaces** project (root `package.json` declares `workspaces: ["backend", "frontend/studyhub-app"]`). That setup has one quirk that has bitten us: **the ROOT `package-lock.json` is the lockfile CI and Cloudflare Pages use, not the per-workspace lockfiles.** Local dev tooling sometimes regenerates `backend/package-lock.json` or `frontend/studyhub-app/package-lock.json` independently, and the standalone files can drift out of sync with the root.

**The exact failure mode:** if you run `npm --prefix backend install` after editing `backend/package.json`, the backend lockfile updates but the **root `package-lock.json` does NOT**. Cloudflare Pages and Railway deploy by running `npm clean-install` from the repo root. `npm ci` is strict — if any workspace `package.json` declares a version the root lock doesn't reflect, the build fails with `EUSAGE: lock file's X@1.2.3 does not satisfy X@2.0.0`. Production deploy stops. Real example (2026-05-04, commit d3eb22d5): bumped `@anthropic-ai/sdk` in `backend/package.json` only, root lockfile stayed at the old version, Cloudflare deploy failed.

**Hard rules — every dependency change MUST follow these:**

1. **Run `npm install` at the REPO ROOT, not in a workspace prefix.** A root install regenerates the root `package-lock.json` AND the workspace lockfiles in one pass, keeping all three in sync. Never run `npm --prefix backend install` or `npm --prefix frontend/studyhub-app install` as your only install step — those commands only update their own lockfile and leave the root drifting.

2. **Commit ALL three lockfiles in the same commit as the `package.json` change.** That's `package-lock.json` (root), `backend/package-lock.json`, and `frontend/studyhub-app/package-lock.json`. Skipping any of them poisons future bisects and risks the same EUSAGE failure on the next deploy.

3. **Before pushing a dependency commit, verify the root lockfile is in sync.** Run:

   ```powershell
   git status package-lock.json backend/package-lock.json frontend/studyhub-app/package-lock.json
   ```

   If the root lockfile is NOT in the diff after a `package.json` change, the root is out of sync — go back and run `npm install` at the root before committing.

4. **CI and Cloudflare Pages run `npm clean-install` (`npm ci`), which fails closed on lockfile drift.** This is the intended behaviour — silent drift would let prod deploy a different dependency tree than was tested locally. Treat any `npm ci` "lock file does not satisfy" error as a P0 deploy block.

5. **Never delete `backend/package-lock.json` or `frontend/studyhub-app/package-lock.json` to "fix" drift.** The root lockfile alone is not enough for `npm --prefix <ws> ci` to work in CI sub-steps. Keep all three; sync them via root `npm install`.

6. **The "v2.1 dependency exception" §1 above already says you can run `npm install` at a workspace root** to sync `node_modules`. That exception still stands for local dev convenience, but for any commit that lands on `main`, the **root** `npm install` is the canonical command — every other invocation must be followed by it before commit.

If you skip rule #1, your commit lands on `main`, Cloudflare or Railway deploys, and the deploy fails with `EUSAGE`. The fix is always: `npm install` at root → commit the regenerated root lockfile → push. Don't try to hand-merge the lockfiles.

## Feature Expansion Plan (post-Phase-2)

Founder-approved 2026-04-24. Live plan for all forward feature work beyond the 8-phase master plan. Every new feature slots into this plan before code starts.

Two docs form the plan:

- `docs/internal/audits/2026-04-24-feature-expansion-roadmap.md` — four new tracks (school-scoped discovery, admin video announcements, multi-file HTML/CSS sheets, Note Review subsystem), Figma coverage cadence, phase sequencing, interconnection map.
- `docs/internal/audits/2026-04-24-feature-expansion-security-addendum.md` — security gaps per track, severity-ranked, with required-before-build checklists. Every phase handoff must reference this addendum's checklist for the relevant track.

Both docs live in `docs/internal/` and are gitignored — read them at those paths, don't reference them by repo-root paths.

### Locked decisions (bake into every phase handoff)

<!-- markdownlint-disable MD029 -->

Roadmap decisions:

1. Dual-enrollment → parallel schools, not single-primary.
2. Self-learner cross-school browsing → allowed, read-only, Explore tab.
3. Teacher+student overlap → `teacherOf[]` + `studentOf[]` relations, not enum.
4. Admin video captions → required for official, optional for internal beta.
5. Max video length → 10 minutes.
6. Multi-file sheets folder structure → flat v1, nested v2 if asked.
7. Multi-file preview refresh → auto with 500ms debounce + pause toggle.
8. Note Review default visibility → creator+commenter private, public is opt-in per note with confirmation modal.
9. AI summarization trigger → 20 highlights default, user-togglable.
10. AI quota on Note Review → counts against creator's daily AI quota.
11. Figma cadence → +1 week buffer for Note Review + Multi-file Sheets specifically.
12. Post-Phase-2 priority order → Phase 3 (Hub AI card) before the comment sweep (task #43).

Security decisions:

13. Sheet rendering → serve multi-file sheets from `sheets.getstudyhub.org` separate subdomain. Non-negotiable before multi-file ships.
14. Enrollment verification roadmap → self-claim → email-domain → SSO.
15. Video embeds → uploads only for v1 (no URL embeds, no SSRF surface).
16. Admin blockability → un-blockable, mutable. Add `Announcement.urgency` field; urgent bypasses mute.
17. AI PII redaction → strip emails/phones from both input AND output to AI calls.
18. HMAC on AI suggestions → belt-and-suspenders, add.
19. Video captions → same as #4 above (required for official only).

Platform decisions:

20. Flag evaluation is fail-closed in all environments. Missing rows, network errors, and non-200 responses all return disabled. Only an explicit `enabled=true` row returns enabled. Flag seeding is centralized in `scripts/seedFeatureFlags.js` (safe for any env, idempotent, SHIPPED flags only) and runs as part of prod deployment. See CLAUDE.md §12 for the full rule.
<!-- markdownlint-enable MD029 -->

### Required-before-build checklists

Every phase handoff must include the relevant track's required-before-build checklist from §7 of the security addendum, copied into the handoff doc verbatim. Checklists cover IDOR tests, rate limiters, sanitization, anchor validation, audit logs — phase-specific.

### Plan maintenance

Both docs have a §10 covering how to update them as work progresses. When a phase closes, mark it complete in the roadmap. When a new feature request arrives, it gets the same treatment (roadmap brainstorm → security pass → founder approval → promotion). See roadmap §10 for the exact flow.

## Language policy (2026-04-30, founder-locked)

StudyHub is JavaScript-only. The brief TypeScript adoption from earlier in 2026-04-30 was reverted the same day:

- Backend runtime is CommonJS Node 20, executed via `nodemon src/index.js` / `node scripts/start.js`. There is no transpiler step.
- Frontend is React 19 + Vite 8. Vite handles `.ts` natively but the codebase ships `.js` / `.jsx` only.
- All new files are `.js` (backend) or `.jsx` (frontend). Never create `.ts` / `.tsx` / `.d.ts` files in this repo.
- No `tsconfig.json`, no `typescript` devDependency, no `npm run typecheck` script, no `shared/types/` directory.
- For type hints in editor / IDE, use JSDoc `@param` / `@returns` / `@typedef` comments. The repo's `jsconfig.json` already wires up VS Code IntelliSense without TypeScript.

Anyone who proposes re-adding TypeScript: do not. The founder rejected the migration after seeing the runtime cost (no transpiler) outweighed the static-analysis benefit. Use JSDoc.

---

## Industry-Standard Practices We Follow (added 2026-04-30)

This section captures security and quality decisions audited and verified during the 2026-04-30 loop sweep. Future agents: read this before introducing patterns that conflict with what's already in place. If you discover a gap that isn't covered here, fix it AND add a new bullet so we don't re-audit the same thing twice.

### Authentication & sessions

- **Cookies are httpOnly + secure-in-prod + SameSite=none-in-prod / lax-in-dev.** Wired in `backend/src/lib/authTokens.js`. Cross-origin frontend on a different domain requires `SameSite=none`; never relax `httpOnly`.
- **Passwords hashed with bcrypt cost factor 12.** Used in register, login, password reset, Google OAuth, settings flows. Industry recommendation is 10-12 in 2024-2026; we picked 12.
- **HIBP password breach check at register + reset.** `backend/src/lib/passwordSafety.js` uses the k-anonymity API — only the first 5 chars of SHA-1 leave the server. NIST 800-63B §5.1.1.2 explicitly recommends this. Fail-OPEN if HIBP is unreachable.
- **Login challenge + email-OTP 2FA.** Login flow does not gate on email verification or 2FA in v2.2.0. 2FA recovery codes deferred — see `docs/internal/audits/2026-04-30-2fa-recovery-codes-plan.md`.
- **Admin MFA enforcement is not yet active.** Documented plan at `docs/internal/audits/2026-04-30-deferred-plans.md` — DO NOT add admin MFA without that plan's review pass.

### Rate limiting

- **All limiters live in `backend/src/lib/rateLimiters.js`.** Never define inline rate limiters in route files. New limiters use shared `WINDOW_*` constants from `lib/constants.js`.
- **DSAR limiter (3/hr/IP), legal-accept limiter (10/hr/user) added 2026-04-30.** Pattern: stricter limit + `keyGenerator` keyed on `userId` for authenticated routes.
- **Global limiter (1000 req / 15 min / IP)** is the floor; per-route limiters refine.

### CSRF / Origin protection

- **Global Origin / Referer check in `index.js`.** Every non-GET request without a trusted origin is 403'd. Empty Origin (curl, server-to-server) passes — relies on cookies' SameSite for those.
- **`originAllowlist()` middleware applied per-route on sensitive writes.** Defense in depth on top of the global check. Apply on: payments, exams, legal, creator audit, AI suggestions, and any new write endpoint that touches PII or auth state.

### Content security headers

- **Helmet handles HSTS / X-Frame-Options / nosniff / XSS-Protection / referrer-policy.** Don't disable individual ones unless you understand why; the only intentional disables are `crossOriginEmbedderPolicy` and `crossOriginResourcePolicy` (would break public images).
- **HSTS in prod: `max-age=31536000; includeSubDomains; preload`.** Submitted to [hstspreload.org](https://hstspreload.org) on 2026-04-30. Removing the `preload` directive triggers slow removal eligibility — DO NOT regress this without understanding the multi-week reversal cost.
- **CSP `frame-ancestors 'none'` on app surface, `'self' + trusted origins` on preview surface.** Two-profile split lives in `index.js`.
- **CSP `upgrade-insecure-requests` on app surface.** Defense-in-depth for HSTS — auto-upgrades any stray `http://` to `https://`.
- **CSP `report-uri` emitted when `CSP_REPORT_URI` env var is set.** Wire this to a Sentry CSP intake URL in prod for visibility into in-the-wild violations.
- **Permissions-Policy** disables camera, microphone, geolocation, payment unless explicitly needed.

### XSS prevention

- **Every `dangerouslySetInnerHTML` call site is wrapped in `DOMPurify.sanitize(..., { USE_PROFILES: { html: true } })`.** Verified call sites: `notesComponents.jsx`, `BookDetailPage.jsx`, `SheetContentPanel.jsx`, `SheetLabPanels.jsx`, `ContributionInlineDiff.jsx`. The sheet preview iframe renders unsanitized but lives behind a sandboxed CSP profile (`previewSurfaceCsp`) that blocks scripts/connects.
- **HTML scanner classifies risk in tiers 0-3** (`backend/src/lib/html/htmlSecurityScanner.js`). Tier-0/1 publishes; tier-2 admin review; tier-3 quarantines. Thresholds tuned 2026-04-30 (`String.fromCharCode` → 8 occurrences) to stop false-positives on legit quiz code.
- **Multi-file HTML sheets MUST be served from `sheets.getstudyhub.org` subdomain** (decision #13). This is the primary XSS isolation boundary. Not yet built; non-negotiable before multi-file ships.

### File uploads

- **`multer` with `fileSize` limits + `fileFilter` allowlist on every upload route.** No raw `multer()` calls without both.
- **ClamAV scan on video uploads with fail-CLOSED in production.** Set `CLAMAV_DISABLED=true` in dev only. Wired in `video.routes.js` after the 2026-04-30 sweep.
- **R2 signed URLs default to 1h download / 10min upload TTL.** Don't extend without justification.

### Compliance / privacy

- **DSAR endpoint** (`POST /api/legal/data-request`) persists to `LegalRequest` BEFORE attempting email — DB write is the durability guarantee, not the email. Honeypot field + 3/hr/IP rate limit + origin allowlist.
- **GDPR data export** at `GET /api/settings/export` — JSON dump of every personal-data row.
- **Account deletion** in `lib/deleteUserAccount.js` — cascade-deletes user-owned content, soft-deletes shared content where appropriate.
- **PII redacted from Sentry** via `redactObject` / `redactHeaders` (`monitoring/sentry.js`). Never bypass.
- **Legal documents are self-hosted from `backend/src/modules/legal/content/*.txt`.** Termly removed 2026-04-30. NEVER re-introduce a third-party legal viewer; the bodyText path is the only path.

### Observability

- **Structured logging via `pino` (`backend/src/lib/logger.js`).** Use `log.info({ event, ...ctx }, message)` — never `console.log` (lint will reject it). The `event` field is the alert key.
- **`pino-http` request-id correlation** via `x-request-id` header + `crypto.randomUUID()` fallback. Every log line carries the request id.
- **Sentry captures everything 5xx** with redacted PII. 4xx is logged but not sent (noise-reduction).
- **Background jobs should use `lib/jobs/heartbeat.js#runWithHeartbeat`** added 2026-04-30. Wraps a task with structured `job.start` / `job.success` / `job.failure` events + SLA breach warnings.

### Database

- **Prisma is the only ORM.** No raw SQL except in `bootstrapSchema.js` (idempotent ALTER TABLE bootstraps), health-check `SELECT 1`, and a few read-only analytics aggregations using template-literal `$queryRaw` (auto-parameterized).
- **Every Prisma model needs a corresponding migration file.** No exceptions. CLAUDE.md §"Migration Rules (CRITICAL)" enforces this.
- **`onDelete: SetNull`** on cross-resource references that must outlive a deleted user (audit logs, legal requests, moderation cases).
- **Soft-delete (`deletedAt`)** on shared content where deletion would orphan others' references (messages, study groups, achievements).
- **Backups verified monthly + DR drill quarterly** per `docs/internal/security/RUNBOOK_DB_RESTORE.md` §"Backup Verification Cadence".

### Frontend

- **`useFetch` hook with opt-in SWR caching** for repeated reads. `clearFetchCache()` on logout. Module-level cap of 50 entries / 10-minute TTL.
- **Skeleton placeholders, not "Loading..."** for any list/page that takes >100ms.
- **`prefers-reduced-motion`** respected in `index.css` + 6+ component CSS files. Animations gated on `(prefers-reduced-motion: no-preference)`.
- **`react-error-boundary` wraps the route tree** at App.jsx — a render crash in one route doesn't blank the app.
- **axe-core a11y smoke test** on public pages runs in CI (`tests/a11y.smoke.spec.js`). Blocks build on any new "serious" or "critical" WCAG 2.1 AA violation.

### Supply chain

- **Dependabot** weekly Mondays for backend / frontend / GitHub Actions. Major bumps to React/Prisma/Express/Socket.io/Vite ignored automatically.
- **`npm audit` clean on both workspaces** (verified 2026-04-30).
- **`@axe-core/playwright`** added 2026-04-30 with founder approval. Pattern documented in CHANGELOG + release log.
- **No new runtime dep without founder approval.** Subresource Integrity (SRI) on the one static external resource (Font Awesome). Dynamic Clarity/gtag loads gated by CSP `script-src` allowlist instead of SRI (SDK URLs are moving targets).

### Operations

- **Trust proxy `1` in prod** (Railway is one hop). `req.ip` reflects real client.
- **`Cache-Control: no-store` default on every `/api/*` response.** Routes that legitimately benefit from caching opt in via `cacheControl()` middleware.
- **Strict `application/json` content-type** on `express.json()`. Routes that accept urlencoded must opt in explicitly.
- **Health endpoint at `/api/public/health`** returns `{ status }` only. No uptime / memory leak.
- **`security.txt` at `/.well-known/security.txt`** (RFC 9116). Update `Expires:` annually.

### Don't do these (anti-patterns we've corrected)

- **Don't hand-edit `package-lock.json`.** Always regenerate via `npm install`. Commit `package.json` + `package-lock.json` in the same commit.
- **Don't add a new dep "while you're in there".** One problem → one dep. CLAUDE.md "v2.1 dependency exception" governs.
- **Don't introduce a third-party iframe for legal docs / forms.** Termly removal taught us: third-party privacy widgets get blocked by privacy browsers (Brave, Safari ITP, Firefox strict mode), break trust, and create CSP exceptions. Self-host.
- **Don't gate features on flag names with no consumers.** A flag without a UI consumer is dead weight; either build the consumer or delete the flag name. Phase-5/6/7/8 design_v2 flag names were deleted 2026-04-30 for this reason.
- **Don't add raw `multer()` calls.** Always use `limits.fileSize` + `fileFilter`.
- **Don't use `setInterval` without `lib/jobs/heartbeat.js`.** Silent hung jobs are invisible to the on-call.
- **Don't use `console.log` in backend code.** Project lint rejects it. Use `log.info({event, ...ctx}, message)` from `lib/logger.js`. Only `console.error` and `console.warn` are allowed by the lint config and only for legacy paths.
- **Don't add `.clean` backup files.** They're untracked, useless, and rot. Use git branches if you need a snapshot.

### When you change something security-relevant

1. **Audit the call sites.** Grep for the old pattern — don't trust your IDE's rename.
2. **Add a regression test.** Vitest for unit, Playwright for E2E.
3. **Update this section.** If you discover a new industry-standard gap and fix it, add a one-line bullet here so the next agent doesn't waste cycles re-discovering it.
4. **Update CHANGELOG.md** under the "Security" subsection of `[Unreleased]`.
5. **Update `docs/internal/security/RUNBOOK_*.md`** if the change affects incident response.
