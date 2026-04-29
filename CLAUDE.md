# CLAUDE.md

Read this file before starting any task in StudyHub.

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

- As of the current v1.5.0-beta behavior, login issues a session directly. Login is no longer gated on email verification or 2FA during the login flow.
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

### HTML Security Policy

- All HTML is accepted at submission. `validateHtmlForSubmission()` only checks empty/size. The scan pipeline (`detectHtmlFeatures` -> `classifyHtmlRisk` -> tier 0-3) classifies risk and routes content. Tier 0 publishes, Tier 1 publishes with warning, Tier 2 goes to admin review, Tier 3 is quarantined. Nothing is auto-blocked by tag name. Tier 3 triggers: critical-severity findings (credential capture), 3+ distinct high-risk behavior categories, obfuscated crypto-miner, or ClamAV detection.

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
                                                                                                                                                                                                                                                                                  
