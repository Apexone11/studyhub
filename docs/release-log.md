<!-- markdownlint-disable MD024 MD032 -->

# StudyHub Release Log

This is the public-facing changelog for the StudyHub platform. Every PR
that touches `backend/`, `frontend/`, `scripts/`, `.github/workflows/`,
`docker-compose.yml`, or `package.json` MUST add a one-line entry under
the most recent cycle heading. CI enforces this via the
`Enforce release log update` step in `.github/workflows/ci.yml`.

Detailed internal cycle notes (decisions, security checklists, agent
hand-offs, day-by-day breakdowns) live in `docs/internal/` and are
intentionally not tracked in git. Promote individual entries from the
internal log into this file when they describe user-visible behavior.

## How to add an entry

1. Find the most recent cycle heading below.
2. Add a single bullet under it summarizing the change in <120 chars.
3. Include the PR number if you have it (`(#267)`).
4. If your change is the first entry for a new beta cycle, add a new
   `## v<MAJOR>.<MINOR>.<PATCH>-beta — <date>` heading above the previous
   one and add your bullet there.
5. Keep entries factual and user-visible. Skip purely internal
   refactors and metadata churn — those belong in the private log.

---

## v2.0.0-beta — in progress

### Reviewer follow-ups (Sourcery + Codex)

- **SSE compression bypass actually works.** Filter now gates on URL path (`/api/ai/messages`) instead of `Content-Type`, since the response Content-Type isn't set yet when `compression()` evaluates its filter on first write.
- **`?fresh=1` no longer overwrites the previously-open draft.** The fresh-draft branch now resets `draftId`, title, course, description, attachment, and `saved` flag so the first autosave creates a new StudySheet row instead of patching the prior one.
- **My-drafts switch flushes pending edits.** `DraftsPickerModal` accepts an `onBeforeNavigate` callback wired to `saveDraftNow`; without it the unsaved-changes blocker (pathname-only diff) didn't catch query-string-only navigations between drafts.

### Hub AI, drafts, preview, notes, video

- **Hub AI streaming no longer feels frozen.** Skipped gzip compression for `text/event-stream` responses and added `flushHeaders()` + per-delta `res.flush()` so the bubble shows tokens as they arrive instead of buffering for 5–20 s.
- **Hub AI Stop button now actually stops the stream.** `aiService.sendMessage` returns a real `AbortController`; `stopStreaming` aborts the fetch, which trips `req.on('close')` on the backend and aborts Claude immediately.
- **Sheet preview no longer shows "This content is blocked".** Safe-preview iframe stops emitting `sandbox=""` (which Chrome rendered as a hard block) and CSP-protected previews now allow https/http URLs in href/src/srcset.
- **AI sheet reviewer is less trigger-happy.** Reworded reviewer system prompt + narrowed the scanner's keylogging detector so practice tests using `localStorage` for progress + `addEventListener('keydown', …)` for shortcuts no longer auto-escalate to Tier 2.
- **Multiple sheet drafts.** New `GET /api/sheets/drafts` + `DELETE /api/sheets/drafts/:id` and a "My drafts" picker modal in the upload page; `?fresh=1` opens a clean editor without overwriting an existing draft.
- **My Notes sidebar/search/title now stay in sync.** Introduced a single `noteHtml.js` helper consumed by `NotesList`, `useNotesData`, and `NoteEditor` so HTML-stripping rules can no longer drift between the three surfaces.
- **Video pipeline hardening.** Added `BLOCKED` to `VIDEO_STATUS` constants, replaced string literals in feed-post gating, added `writeStream.on('error')` handlers to `processVideo` + `regenerateThumbnailFromFrame`, mapped multer thumbnail upload errors to 4xx, removed the 3-second cap that prevented the editor from picking later frames.
- **Orphan-video sweeper safer + faster.** `sweepStalledProcessing` now requires `feedPosts: { none: {} }`, `announcementMedia: { none: {} }` and folds the pending-appeal check into one query (no more N+1).
- **Operations docs.** Documented `SWEEP_ORPHAN_VIDEOS_ON_START` in `backend/.env.example`.

### CI / infrastructure

- **CI branch coverage hotfix.** StudyHub CI and CodeQL now run for
  `approved-branch` pull requests and pushes in addition to `main`.
- **CI hotfix (Day 2.5).** Pin `github/codeql-action` init + analyze to
  `@v3` to restore CodeQL Advanced runs, and switch the release-log gate
  to track this public file at `docs/release-log.md` instead of the
  gitignored internal log so PRs can satisfy it.
- **Railway preDeploy now provisions SHIPPED design_v2 flags.** Chained
  `npm run seed:flags` between `prisma migrate deploy` and the geoip
  refresh in `backend/railway.toml`. Closes the activation gap where
  fail-closed flag evaluation rendered Phase 1/2/3 features invisible
  in production whenever a deploy preceded the manual seed step. Seed
  failure aborts the deploy by design (no `||` fallback).
- **Boot-time FeatureFlag auto-provisioning.** `backend/scripts/start.js`
  now runs `seedFeatureFlags`, `seedRolesV2Flags`, and
  `seedNotesHardeningFlag` after `prisma migrate deploy` on every Railway
  boot, so shipped features self-activate without an operator running
  `seed:flags` from a Railway shell. Idempotent (upsert-only); a seed
  failure logs loudly but does not block API startup. Gated by
  `SEED_FEATURE_FLAGS_ON_START` (defaults on when Railway env vars are
  detected). `railway.toml` `preDeployCommand` slimmed to just the
  best-effort GeoIP refresh; the two flag-seed scripts that previously
  only had a CLI now also export reusable helpers.
- **CORS hardening — drop `public: true` from CDN-cached endpoints.**
  `/api/courses/schools`, `/api/courses/popular`, `/api/feed/trending`,
  and `/api/platform-stats` no longer mark themselves `public` for
  shared-CDN caching. Cloudflare ignores `Vary: Origin` on non-
  Enterprise plans, so a shared cache could replay one origin's CORS
  headers to every other origin. Browser cache (per-user, honors Vary)
  keeps the same user-perceived speedup. Also drops `/tests` from the
  sidebar hover-prefetch map since that page has no backend route yet.
- **Backend test-isolation fix (Task #56 — backend half).** Removed
  the per-test `vi.resetModules()` + `await import(...)` dance from
  `cacheControl.unit.test.js` (replaced with a single static ESM import;
  `cacheControl.js` has zero module-level state) and hoisted the
  repeated `await import('express')` / `node:path` / `node:fs` /
  `node:os` calls in `security.headers.test.js` to top-of-file ESM
  imports. Both files passed in isolation but flaked under the full
  parallel backend suite on Windows due to the heavy per-test dynamic
  imports timing out worker IO. 29 tests now stable; both files lint-
  clean. Frontend Playwright smoke flakes (auth.smoke, app.responsive,
  feed.preview-and-delete, sheets.html-security-tiers, tracks-1-3,
  tracks-4-6, teach-materials, navigation.regression) are NOT covered
  by this fix — they share the `mockAuthenticatedApp` catch-all
  `**/api/**` → `{ status: 200, json: {} }` pattern in
  `tests/helpers/mockStudyHubApi.js` which crashes any component that
  does `data.slice()` after a truthy guard on an unmocked endpoint
  (same root cause as the FollowSuggestions fix in Phase 2 Day 4). That
  half needs a Playwright run + per-spec mock additions; tracked
  separately.
- **Onboarding step 2 silent-failure fix (Task #65).** Removed dead
  `prisma.enrollment.create({ data: { userId, schoolId } })` call at
  `onboarding.service.js:188` that has been silently throwing on every
  step-2 submission since it was written — `Enrollment` is course-level
  (no `schoolId` column; see `schema.prisma`). Error was caught + logged
  as a warning, so monitoring + tests never surfaced it. School
  membership continues to be derived from enrolled courses; a proper
  `UserSchoolEnrollment` table is Phase R1 / Task #64. 6 new unit tests
  pin the post-fix invariant + the missing/invalid/unknown payload paths.
- **Same-site backend domain — incognito sign-in unblocked (Task #73).**
  Frontend `RAILWAY_BACKEND_URL` swapped from the raw Railway hostname
  (`studyhub-production-c655.up.railway.app`) to the same-site
  subdomain `api.getstudyhub.org` (CNAME → `fl8bi234.up.railway.app`,
  DNS-only, not proxied). The session cookie was previously third-
  party from the frontend's perspective and silently dropped by Chrome
  incognito, Brave, Safari, and Firefox strict mode — blocking sign-in
  entirely for any user with strict privacy settings. Cookies now flow
  as first-party. Single-line change in `frontend/studyhub-app/src/config.js`.
- **Upload + chunked-notes "Invalid request payload" hotfix.** The
  global `inputSanitizer` middleware was rejecting any single string
  field longer than 10 KB with a generic "Invalid request payload"
  error before the route ever ran — silently blocking imported HTML
  sheets, AI-generated sheets, 32 KB note save chunks, and large Hub AI
  prompts. Bumped `MAX_FIELD_LENGTH` to 5 MB to match the body parser
  limit and raised `express.json()` to `{ limit: '5mb' }` (was the
  Express 100 KB default, which would have surfaced as a 413 once the
  field cap was lifted). Null-byte and control-char rejection still
  runs on every string regardless of length.
- **Notes M6 — sidebar refreshes on every autosave.** `useNotesData`
  exposes a new `patchNoteLocally(noteId, partial)` that `NoteEditor`
  calls on each fresh `saved` transition with the latest title,
  content, and `updatedAt`. Previously the sidebar list stayed stale
  until the 60-second background poll, which made autosave look broken
  even though `useNotePersistence` was working. Pinned/starred state
  is preserved through partial patches.
- **Notes M2 — auto-derive title from first heading / first line.**
  When a freshly created "Untitled Note" gets content, the editor now
  pulls a title candidate from the first `<h1>` (then `<h2>`, then the
  first sentence of plain text), capped at 80 chars. A
  `titleManuallyEditedRef` flag stops auto-derive the moment the user
  edits the title input. Behavior matches Google Docs / Notion's "use
  the first line" convention.
- **Notes M4 — title input polish.** Larger 20px font, friendlier
  "Add a title — or just start writing" placeholder, focus-only
  bottom border, and autofocus on freshly opened untitled notes (not
  on phone, to avoid an unwanted keyboard pop).
- **Video pipeline V1 — feed gating, R2 cleanup, orphan sweep,
  thumbnail editor.** Five fixes in one cycle:
  1. Backend `POST /api/feed-posts` with `videoId` now returns 409 if
     the video is still `processing`/`failed`/`blocked`, with a
     specific message for each — composer surfaces the right copy
     instead of dropping a broken card into followers' feeds.
  2. `video.service.processVideo` now calls `deleteVideoAssetRefs`
     whenever a video transitions to FAILED (duration cap or
     pipeline error). Previously the raw upload + any partial
     variants stayed in R2 forever, bleeding storage cost on every
     failed upload.
  3. `video.routes.js` chunk-buffer sweep was destructively wiping
     ALL in-flight uploads when 100+ buffers existed. Replaced with
     per-buffer `lastTouched` TTL eviction every 5 min — only idle
     > 30 min buffers are evicted, active uploads are never
     > interrupted.
  4. New `scripts/sweepOrphanVideos.js` — reclaims R2 bytes from
     stalled processing (>6h in `processing`/`failed`/`blocked`,
     skipping rows with a pending `VideoAppeal`) and ready-but-never-
     attached uploads (>24h with no FeedPost or AnnouncementMedia).
     Logs MB freed per run. Wired into `scripts/start.js` behind
     `SWEEP_ORPHAN_VIDEOS_ON_START` (off by default — flip on
     exactly one Railway worker), runs on boot then every 6h. Also
     exposed as `npm --prefix backend run sweep:orphan-videos` for
     manual one-off runs.
  5. New `PATCH /api/video/:id/thumbnail` — owner can pick a frame
     timestamp (re-runs ffmpeg server-side) or upload a custom JPG/
     PNG (≤2 MB, magic-byte validated, rate-limited 15/min). Same
     R2 key is overwritten so existing public URLs stay valid; client
     gets a `?v=<timestamp>` cache-buster so the new image renders
     immediately. New `VideoThumbnailEditor.jsx` modal + entry-point
     button in `VideoUploader.jsx` post-processing state. Also
     surfaces three quick-pick frames (start / middle / end) and a
     full scrubber via the existing stream URL.
  6. FeedComposer Post button is now state-aware: gray "Waiting for
     video…" while processing, red "Remove video to post" on failure,
     green "Post video ✓" when ready. Backend 409 still enforces; the
     button is the fast-feedback layer.
- **Phase R1 — `UserSchoolEnrollment` additive schema (Task #11/#64).**
  New table + Prisma model + relations on `User.schoolEnrollments` and
  `School.enrollments` to give school membership its own first-class
  row. Today school membership is inferred from
  `Enrollment -> Course -> School`, which can't represent dual-enrolled
  or self-learner users. This deploy is additive only — no backfill,
  no read cutover. R2 backfills, R3 switches reads. Migration
  `20260428000004_add_user_school_enrollment` is `IF NOT EXISTS`-guarded
  and safe to redeploy. Full backend test suite green (1869 pass / 1
  skip / 118 files).
- **Defensive Playwright catch-all + widget mocks (Task #56 second
  half).** `tests/helpers/mockStudyHubApi.js` catch-all now returns
  `[]` for collection-shaped GET paths (`/popular`, `/trending`,
  `/recent`, `/leaderboard`, `/me/courses`, etc.) and `{}` for single-
  resource paths, so components doing `data.X.slice()` after a truthy
  guard no longer crash on unmocked endpoints — same root cause as
  the Phase 2 Day 4 FollowSuggestions fix. Added explicit mocks for
  `/api/users/me/follow-suggestions`, `/api/exams/upcoming`,
  `/api/ai/suggestions`, `/api/feed/trending`, `/api/announcements`,
  `/api/study-groups`, `/api/messages/conversations`,
  `/api/library/popular`, and `/api/platform-stats` so the Phase 1/2/3
  v2 widgets that load on every authenticated page don't trip the
  smoke specs that exercise navigation regression / app responsive /
  feed preview / sheets html security tiers / tracks-1-3 / tracks-4-6
  / teach-materials / auth.smoke.

### Sheets

- **`StudySheet.previewText` column + extractor + backfill (#267).**
  Sheet create/update now persists a server-extracted plain-text preview
  (≤240 chars, emoji-safe truncation). Existing rows are populated by
  `npm --prefix backend run backfill:previewText`. Powers the Sheets
  Grid card preview without re-rendering sanitized HTML on the client.
- **`SheetContribution.reviewComment` migration (#267).** Idempotent
  `ADD COLUMN IF NOT EXISTS` migration to heal production schema drift
  that was causing reviewer-comment writes to fail.
- **Sheet Lab history deep-linking (#267).** History tab now reads
  `?tab=history&commit=<id>` and expands the matching commit on load,
  and the commit toggle keeps the URL in sync so links can be shared.
- **`previewText` consistency hotfix (Task #72).** Centralized sheet
  content writes through a new `withPreviewText(content)` helper at
  `backend/src/lib/sheets/applyContentUpdate.js`. Threaded it through
  contribution-merge accept (`sheets.contributions.controller`),
  Sheet Lab sync-upstream + restore-to-commit (`sheetLab.operations
.controller`), and fork creation (`sheets.fork.controller`). Before
  this fix, those four write paths overwrote `StudySheet.content`
  without re-extracting `previewText`, so the Sheets Grid card
  preview went stale after a contribution merged or a Lab restore
  ran. 10 new unit tests pin the helper contract.

### Phase 4 — Sheets browse refresh (2026-04-27)

- Sheets page now offers a Grid/List view toggle (List default; choice
  persists in localStorage; URL `?view=grid` or `?view=list` overrides).
- New "Search across StudyHub" toggle on Sheets bypasses the school filter
  for cross-school discovery.
- Filter pills now show an active selected state when applied.
- Sheet cards in Grid view show a 3-line preview extracted from the sheet
  body (new `previewText` column, backfilled for existing sheets).
- Behind `design_v2_sheets_grid` feature flag (now SHIPPED in production).

### Phase 3 — Inline Hub AI suggestion card (2026-04-28)

- New `AiSuggestion` model with daily quota shared with Hub AI's
  `AiUsageLog`. Three endpoints under `/api/ai/suggestions`
  (`GET /`, `POST /refresh`, `POST /:id/dismiss`).
- Frontend `AiSuggestionCard` mounted on the own-profile Overview tab
  below the Phase 2 Upcoming Exams card. 5-state matrix (loading /
  happy / empty / quota_exhausted / error). Refresh disables itself
  after a 429; dismiss is optimistic with reconciliation on 5xx.
- Email + phone PII redacted from both the AI input and the AI output
  before persistence.
- Gated behind the `design_v2_ai_card` feature flag.

### Phase 2 Day 4 — Upcoming Exams write-path UI (2026-04-24)

- Author-side create / edit / delete UI for `UpcomingExam` rows on the
  own-profile Overview, fed by the existing `/api/exams` CRUD endpoints
  and the `preparednessPercent` column added in Phase 2.
- Gated behind the `design_v2_upcoming_exams` flag.

### Phase 2 — Upcoming Exams (2026-04-24)

- New `UpcomingExam` schema + migration with `preparednessPercent`
  column. New `/api/exams` CRUD module with full security baseline
  (`requireAuth`, `originAllowlist` on writes, per-endpoint rate
  limiters, owner check on update/delete).
- Component-kit foundation (`Card`, `Button`, `Chip`, `Skeleton`)
  introduced for use across v2 phases.

### Phase 1 — UserProfilePage widgets + AppSidebar refresh (2026-04-23)

- Personal overview widgets on `UserProfilePage` (Overview / Study /
  Sheets / Posts / Achievements tabs) replace the legacy `/dashboard`
  page; `/dashboard` now redirects to `/users/:me`.
- `AppSidebar` v2 chrome refresh: token-driven colors, refined nav
  spacing, and role-label helper for self-learner / student / teacher.

### Phase 0 — Design refresh foundation (2026-04-19 → 2026-04-23)

- Plus Jakarta Sans + warm-paper (`#f6f5f2`) "Campus Lab" identity.
  CSS custom-property tokens (`--sh-*`) become the source of truth for
  colors, spacing, and surfaces.
- Emoji policy locked: emoji are permitted only inside user-generated
  content (feed posts, messages, notes, comments, group discussions,
  profile bios) and never in UI chrome.
- Feature-flag evaluation switched to fail-closed in all environments
  with centralized seeding via `scripts/seedFeatureFlags.js`.

---

## v1.x — pre-v2 highlights

Selected user-visible changes from the v1 line are summarized here for
historical context. Full v1 detail lives in the internal log.

### Messaging & social

- Real-time DM and group chat (`/messages`) with Socket.io, soft delete
  on messages, 15-minute edit window, per-conversation unread counts,
  and a `/messages?dm=<userId>` profile auto-start flow.
- Bidirectional block / one-directional mute system across feed,
  search, and messaging.

### Study Groups

- `/study-groups` with member roles, group resources, scheduled study
  sessions (`GroupSession` + RSVPs), and a Q&A discussion board.

### Hub AI assistant

- Streaming Claude integration at `/ai` with full-page chat plus a
  floating bubble on every authenticated route. Per-plan daily message
  quotas (regular / verified / pro / admin) tracked in `AiUsageLog`.
- Sheet generation produces full HTML documents that flow through the
  same security scan tier-system as user-uploaded HTML.

### Payments

- Stripe Checkout for monthly / yearly Pro subscriptions plus variable
  donations. Customer Portal for self-service plan management. Public
  `/supporters` leaderboard. Admin Revenue tab.

### Notes

- `MyNotes` system with pinning, tags, stars, and `NoteVersion` history
  for revert / compare flows.

### Trust & safety

- Plagiarism detection on study sheet uploads, admin moderation
  dashboard, approval queue UI, weekly AI usage caps, and waitlist
  onboarding for new schools.
