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

### General

- URL parameters are the source of truth for list/search/filter pages such as `SheetsPage` and `FeedPage`.
- Backend is fully modularized under `backend/src/modules/<name>/` with `index.js`, `*.routes.js`, `*.controller.js`, `*.service.js`, `*.constants.js` pattern (21+ modules).
- Frontend uses feature barrels under `frontend/studyhub-app/src/features/<name>/index.js` that re-export from `pages/`. New feature logic goes in `features/`, pages import from barrels. Migration is incremental.
- Files that mix React components with non-component exports must be split: constants/helpers in `.js`, components in `.jsx`. The `.js` file re-exports from `.jsx` for backward compatibility (satisfies `react-refresh/only-export-components`).
- Large pages (>200 lines) should be decomposed into thin orchestrator shells. Extract composable child components (composers, asides, empty states, nav action bars) that own their rendering. Pages own layout, routing state, and hook wiring only.

### API URL Convention

- All backend routes are mounted under `/api/<resource>` in `backend/src/index.js`.
- Frontend fetch calls MUST use `${API}/api/<resource>`, never `${API}/<resource>` without the `/api` prefix. This has caused 404 bugs before (e.g., study groups).
- The `API` constant comes from `frontend/studyhub-app/src/config.js` and resolves to the backend origin (e.g., `http://localhost:4000` in dev, Railway URL in prod). It does NOT include `/api` -- that must be added in each fetch URL.

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

### Hub AI (AI Assistant)

- Backend module: `backend/src/modules/ai/` with routes, service, constants, and context builder.
- Backend routes mounted at `/api/ai` in `backend/src/index.js`.
- Claude API integration: `@anthropic-ai/sdk` with streaming via SSE (Server-Sent Events).
- API key: stored as `ANTHROPIC_API_KEY` environment variable in Railway (never in code).
- Default model: `claude-sonnet-4-20250514`. Detailed system prompt defined in `ai.constants.js` (personality, capabilities, academic integrity rules, full HTML generation spec, context awareness instructions).
- AI-generated sheets use full HTML documents (`<!DOCTYPE html>` with `<head>`, `<style>`, `<body>`) -- NOT fragments. The AI is instructed to include inline `<style>` blocks but NEVER `<script>` tags (scripts trigger Tier 1+ in the security scanner). Sheets flow through the same scan pipeline as user-uploaded HTML.
- Max output tokens: 2048 for Q&A, 8192 for sheet generation.
- Database tables: `AiConversation`, `AiMessage`, `AiUsageLog` (migration: `20260331000004_add_ai_assistant_tables`).
- Frontend page: `frontend/studyhub-app/src/pages/ai/AiPage.jsx` at route `/ai`.
- Floating bubble: `frontend/studyhub-app/src/components/ai/AiBubble.jsx` (rendered on all authenticated pages via `createPortal`).
- Chat hook: `frontend/studyhub-app/src/lib/useAiChat.js` manages conversations, SSE streaming, and state.
- API service: `frontend/studyhub-app/src/lib/aiService.js` wraps all `/api/ai` endpoints.
- Context chips: `frontend/studyhub-app/src/lib/useAiContext.js` provides page-aware suggestion prompts.
- Sheet preview: `frontend/studyhub-app/src/components/ai/AiSheetPreview.jsx` extracts HTML from AI responses and offers preview/publish.
- Image upload: `frontend/studyhub-app/src/components/ai/AiImageUpload.jsx` handles file selection, validation, and base64 conversion.
- Markdown renderer: `frontend/studyhub-app/src/components/ai/AiMarkdown.jsx` (lightweight, no external dependency).
- Rate limits: 30 messages/day (regular), 60 (verified), 120 (admin). Tracked in `AiUsageLog` table.
- Context injection: `ai.context.js` builds dynamic system prompt sections from user's courses, sheets, notes, and current page.
- Streaming: POST `/api/ai/messages` returns SSE stream. Events: `delta` (token), `title` (auto-title), `done` (completion), `error`.
- Sidebar nav link uses `IconSpark` icon. Bubble hidden on `/ai`, `/login`, `/register` pages.

### Performance Infrastructure

- `useFetch` hook (`frontend/studyhub-app/src/lib/useFetch.js`) supports opt-in SWR caching via `swr` option (ms). Cached data is returned instantly while a background revalidation fetch runs. Cache is a module-level `Map` exported as `cache`.
- `clearFetchCache(cacheKey?)` invalidates one or all cache entries. Called automatically on logout in `session.js`.
- `prefetch.js` (`frontend/studyhub-app/src/lib/prefetch.js`) warms the SWR cache on sidebar link hover via `requestIdleCallback`. Maps 9 routes to API endpoints with 30-second debounce.
- `cacheControl.js` (`backend/src/lib/cacheControl.js`) is an Express middleware for HTTP `Cache-Control` headers. Applied to stable public endpoints (platform-stats, schools, popular courses, preferences).
- All pages use skeleton loading placeholders from `frontend/studyhub-app/src/components/Skeleton.jsx` instead of bare "Loading..." text.
- Rate limiters are centralized in `backend/src/lib/rateLimiters.js` (49 limiters). Never define inline rate limiters in route files.

### CSS and Styling

- Inline style colors must use CSS custom property tokens from `index.css`. Semantic tokens (`--sh-danger`, `--sh-success`, `--sh-warning`, `--sh-info` with `-bg`, `-border`, `-text` variants), slate scale (`--sh-slate-50` through `--sh-slate-900`), and surface tokens (`--sh-surface`, `--sh-soft`, `--sh-border`). Exceptions: dark-mode-always editor panels, unique per-metric palette colors, white text on colored buttons.
- Modals inside animated containers must use `createPortal(jsx, document.body)`. Any ancestor with `transform` (e.g., anime.js `fadeInUp`) creates a new containing block that breaks `position: fixed` viewport centering.
- Do not use emojis anywhere in code or UI text.

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

## Repo Workflow Conventions

- Scan existing implementation patterns before editing. Follow the established style unless correctness requires a change.
- Keep changes incremental and pattern-aligned.
- Prefer fixing root causes over local patches.
- After each beta implementation cycle, document changes and validation results in `docs/beta-v1.7.0-release-log.md`.
- For frontend validation in this repo, `npm --prefix frontend/studyhub-app run lint` is the reliable full-lint command.
- Use quoted paths in PowerShell because the workspace path contains spaces.

## UI / Design Conventions

- Design baseline: Plus Jakarta Sans, token-based styles in `frontend/studyhub-app/src/index.css`, modern clean cards/gradients, and consistent icon treatment.
- Preserve the current HomePage visual language unless a task explicitly calls for a redesign.
- UserAvatar component (`frontend/studyhub-app/src/components/UserAvatar.jsx`) must be used everywhere a user's profile picture is displayed. It handles fallback avatars automatically.

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

## Working Agreement For AI Agents

When handling a new task:

1. Read this file first.
2. Explain how the relevant feature currently works before proposing edits.
3. Produce a file-by-file plan before coding for non-trivial changes.
4. Before writing any new backend feature, verify that all required database tables have corresponding migrations in `backend/prisma/migrations/`. If a migration is missing, create it before proceeding with the feature code.
5. All frontend API calls must use `${API}/api/...` (never omit the `/api` prefix).
6. Validate changes with the smallest relevant lint/test/build commands, then broader checks if the surface area is wider.
7. Update the beta release log when a beta-cycle code change is completed.
8. Do not use emojis in code, comments, or UI text.
9. All inline style colors must use CSS custom property tokens (`var(--sh-*)`).
10. Wrap any call to `getBlockedUserIds` or `getMutedUserIds` in try-catch for graceful degradation.
