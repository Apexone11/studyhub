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

### Review follow-ups (round 3)

- **Cookie consent banner no longer silently dismisses on storage failure.** Codex + Copilot flagged that Safari Private mode (and other no-localStorage contexts) caused `writeConsent` to return null, but the click handler still set `dismissed=true` — analytics never loaded and the user couldn't retry. Banner now keeps itself visible on persistence failure, renders an inline `role="alert"` warning with a "Dismiss anyway" escape hatch, and fires a non-persistent `studyhub:consent-changed` event (with `persisted: false`) so this-session analytics still load at the user's request. Two new component tests pin the failure-path behavior using a mocked `Storage.prototype.setItem`.
- **`CourseSelect` resolvedValue can no longer be undefined.** Sourcery flagged that `value ?? (allowEmpty ? emptyValue : '')` becomes undefined when a consumer passes `value=undefined` AND `emptyValue=undefined` AND `allowEmpty=true` — flipping the `<select>` from controlled to uncontrolled. Trailing `?? ''` guard added.
- **`handleSignOut` declaration hoisted above `renderTab`** in `SettingsPage.jsx`. Previous textual order (declaration AFTER the function that closes over it) was a closure-resolves-at-call-time accident that worked but would break if `renderTab` got refactored to an inline arrow or IIFE. Sourcery flagged the textual TDZ; defensive hoist is the right move.
- **Release log Sign-out capitalization** standardized to match the actual UI label ("Sign out").

### Self-hosted cookie consent banner (Task #70 — Option A locked)

- **Termly resource-blocker replaced with a self-hosted React banner.** Termly's third-party cookies were being aggressively stripped by Chrome incognito / Brave / Safari / Firefox-strict, so the consent prompt re-appeared on every page load and the user's choice never persisted. The new flow lives entirely in our origin: `lib/cookieConsent.js` (read/write + `studyhub:consent-changed` event), `components/CookieConsentBanner.jsx` (bottom-anchored non-modal bar, mounted once at the app root, native shell short-circuits via `window.__SH_NATIVE__`), and a two-phase loader in `index.html` (in-session event listener + returning-visitor immediate-fire).
- **Microsoft Clarity + Google Ads only fire after explicit "Accept all"** per the founder-locked Option A. Idempotent loader so duplicate consent events can't double-load. Essential-only consent persists the choice without firing analytics.
- **`*.termly.io` stays in the CSP** because the legal-document embed (Terms / Privacy / Cookie Policy) still loads from app.termly.io. Documented inline in `_headers`.
- **5 Playwright specs updated** to pre-seed `studyhub.cookieConsent = essential` via `addInitScript` so the new banner short-circuits in tests (route aborts kept as defense in depth).
- **12 new tests:** 7 component (first-visit render / repeat-visit suppression for both choices / Accept-all + dispatched event / Essential-only / Cookie-settings link to /cookies / native-shell skip), 5 helper (read null on empty / read parsed value / read null on malformed JSON / write all + event / hasAnalyticsConsent gate). Plus a defensive bonus test rejecting unknown choice strings.

### Hub AI prompt hand-off — Copilot R2 follow-ups

- **AiPage now resets ChatArea via a `key` prop when a new `?prompt=` arrives.** Replaces the previous in-component setState-during-render dance with React's documented "reset state via key" pattern. Eliminates the focus-effect-leak case where a user-typed message could have its caret moved when a new prompt was consumed-but-not-applied.
- **Strip-effect deps simplified** to `[promptParam, setSearchParams]` using the functional `setSearchParams(prev => …)` form — drops the redundant `searchParams` dep so the effect only re-runs when the prompt itself changes.
- **CourseSelect's `emptyValue` contract honored.** Previous `value ?? ''` shortcut broke when a consumer set `emptyValue="__none__"` (etc.) — the select had no matching option and rendered a phantom selection. Now falls back to `emptyValue` when value is undefined and the placeholder is enabled. Test updated + new test pinning the undefined-value-with-custom-emptyValue branch.

### Settings page polish (S1 from the bug-sweep handoff)

- **Sign out moved out of the top header into the Account tab.** The button was wedged next to the Search bar in the navbar — visually it read as a search peer, not a destructive nav action. Now lives as a dedicated "Sign out" SectionCard right above Danger Zone, with a right-aligned secondary button.
- **Settings card sections breathe.** Bumped `SectionCard` `marginBottom` 18→24 and `<h3>` `marginBottom` 6→12 so the right-panel spacing doesn't read as cramped between Email Address / Sign out / Danger Zone.
- **"Change role" + "Revert to" + "Save Privacy Preferences" buttons are right-aligned now.** All three were rendering as full-width inside their cards; wrapping in `flex justify-content: flex-end` puts them at the card edge as natural-width buttons.

### Avatar / AI hand-off / metadata-toast / dropdown-sizing fixes

- **Six surfaces silently rendered the wrong avatar.** `UserAvatar` only accepted `username` + `avatarUrl` as separate props, but six call sites (admin Analytics, admin Reviews, NoteCommentSection x2, NoteViewerPage, PlagiarismReportPage) all passed `user={...}`. The shortcut prop was being ignored, so every comment / row in those surfaces fell back to the `?` initials placeholder. Extended `UserAvatar` to accept a `user` shortcut (destructured internally with explicit-prop precedence) — all six surfaces start showing real avatars without touching call sites.
- **AI Suggestion card "Start Practice" CTA was a dead-end.** The `open_chat` action navigated to `/ai` with no context, so the user landed on an empty Hub AI chat and lost the suggestion text. The CTA now forwards the suggestion text as `?prompt=` (URL-encoded, capped at 1000 chars); `AiPage` reads it via lazy-init on the `ChatArea` input so the textarea is pre-filled and focused with the caret at the end. The query param is stripped from the URL after read so refresh doesn't re-prefill.
- **"Failed to update note settings" toast now surfaces the server error.** The catch block silently dropped the server's error message, so users saw a generic toast for everything from CSRF failures to course-enrollment 403s. Now reads `errBody.error` and includes it in the toast (`Failed to update note settings: <message>`).
- **"No course" dropdown on the notes editor was unreadable.** 6×10px padding + no min-width left the placeholder rendering as a tiny pill. Bumped padding to 8×14, set min/max width 160/240, fontSize 13, fontWeight 600, and shifted color from `--sh-muted` to `--sh-heading` so the selected course code is legible.

### Selected-chip CSS fix + register role picker

- **`.sh-chip--active` was silently broken everywhere.** A duplicate `.sh-chip` baseline block in `styles/motion.css` (loaded after `index.css`) overrode the active rule's background at equal specificity, so every chip in the app — sheets filters, feed filters, the register "I am a..." picker — was applying the active class but rendering with the inactive background. Removed the duplicate; bumped the active selector to `.sh-chip.sh-chip--active` so any future source-order accident can't reproduce the bug.
- **Register role picker has unmistakable selected feedback now.** New `.sh-chip--role-pick` modifier paints the selected role with solid brand fill + white text + a brief 220ms scale-bounce. Reduced-motion users get only the color change. Added `role="radiogroup"` / `role="radio"` / `aria-checked` so screen readers announce selection correctly.
- **Homepage link audit.** Verified all 10 homepage CTA / footer links (`/register`, `/sheets`, `/supporters`, `/pricing`, `/about`, `/docs`, `/terms`, `/privacy`, `/cookies`, `/guidelines`) resolve to mounted routes — no broken targets.

### Study group uploads + reviewer follow-ups (round 2)

- **Group banner / discussion / resource uploads no longer 403.** `uploadGroupMedia` was a raw XHR that bypassed the `window.fetch` shim that auto-injects `X-CSRF-Token`, so file POSTs hit the server with no CSRF header and got rejected. Helper now resolves the cached CSRF token (bootstrapping via `/api/auth/me` if absent), sets `X-Requested-With`, and on Capacitor adds `X-Client: mobile` + `Authorization: Bearer <native>`. Repairs **all** study-group uploads, not just backgrounds.
- **`/uploads/group-media` and `/uploads/note-images` now have static handlers.** Files were being uploaded successfully but the served URLs would 404 in the browser because no `express.static` mount existed at those paths. Added with `nosniff`, `Cache-Control`, and `default-src 'none'; img-src 'self'` CSP per the existing avatar/cover pattern.
- **Background picker UX expanded.** Drag-and-drop onto the preview pane, client-side image-mime + 10 MB size validation (fast friendly errors before the upload fires), confirm-on-clear when there's a saved background, inline upload progress bar, and quota-aware copy on 429. Char counter on the attribution field.
- **Late-response race fixed in `persistMetadataChange`.** Switching notes mid-PATCH no longer leaks the original note's revert (or success-side `setEditorAllowDownloads`) into the newly-selected note's editor state. Gated the editor-level side effects on an `activeNoteIdRef` check; list-row patches stay keyed by id.
- **Sandbox regression test now asserts safe-preview is exactly `allow-same-origin`.** Earlier version accepted any string containing the token, which would have allowed silent privilege widening (`allow-same-origin allow-popups`, etc.). Captures the safe-branch literal and asserts equality.
- **Course dropdown helper migration completed for study-groups list.** `useGroupList.js` was still doing the naive flatMap the shared helper was meant to replace, producing visible course-code duplicates for multi-enrolled users. Migrated to `flattenSchoolsToCourses` and extended the helper to expose `schoolId`/`schoolShort` (additive — required by `GroupListFilters` school filter).
- **PATCH /api/notes/:id/metadata test coverage added.** 17 tests covering id validation, field-type validation, owner-only auth + admin override, private→allowDownloads server-side normalization, individual field persistence, and course-enrollment 403 (with admin bypass).

### Reviewer follow-ups (Copilot + security pass)

- **Sheet viewer iframe also got the cross-subdomain fix.** `SheetContentPanel.jsx` had the same `sandbox=''` bug in its safe-preview branch as the standalone preview page; both now grant `allow-same-origin` only on the script-stripped path so production Chrome no longer renders the embedded sheet as `(blocked:origin)`.
- **Sandbox regression test now asserts the safe-preview branch HAS allow-same-origin** (and is parameterized over both iframe-bearing files), so a future revert to an empty sandbox attribute fails CI instead of silently shipping the placeholder bug again.
- **Rollback path in notes-metadata persist no longer corrupts courseId.** A security scan caught a tautological `!value === false ? !value : !value` (always `!value`) in the optimistic-update revert that flipped numeric `courseId` rows into booleans on save failure. Now snapshots the prior list-row value before the optimistic patch and restores it verbatim.
- Reworded a stale "screenshot 1" comment in `SheetHtmlPreviewPage.jsx` to describe the Chrome behavior directly.

### Notes metadata persistence

- **Private/Shared toggle, course picker, and Downloads checkbox now actually save.** New `PATCH /api/notes/:id/metadata` endpoint (parallels `/star`/`/pin`/`/tags`) accepts `{private, courseId, allowDownloads}` with owner-only auth and an enrollment check on `courseId`. Frontend handlers in `useNotesData` now optimistically apply the change, hit the endpoint, sync the sidebar list row, and revert on failure with a toast. Lives outside the hardened content-save path so toggling Private doesn't trigger a version snapshot or get suppressed by content-hash no-op detection.

### Course dropdown dedup

- **Course pickers no longer show duplicate course codes.** The `/api/courses/schools` response groups courses by school; if a user is enrolled at multiple schools that share a code (CHEM101 / BIOL101 / etc.), the naive flatMap in five different pages produced visible duplicates. New shared `lib/courses.js` helper dedupes by course id and disambiguates collisions by appending the school name. Applied to Notes, Sheet Upload, and AI Sheet Setup pages.

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
