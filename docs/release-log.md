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

## v2.2.0 — public launch ship (2026-04-30)

### Security-loop fixes on the 2026-05-01 work (2026-05-02)

- **Structured `clamav.scan_*` pino events now emitted from `lib/clamav.js`** so the alerting guidance in `RUNBOOK_CLAMAV.md` has something to alert on. Three event keys (`clamav.scan_clean` info, `clamav.scan_infected` warn, `clamav.scan_failed` warn) carry `engine` + `bytes` + threat / message context. Logger loaded lazily so a require-time failure can never block scans.
- **`R2_ACCOUNT_ID` is now slug-validated** (`/^[a-f0-9]{8,64}$/i`) before being interpolated into the CSP `media-src` / `img-src` directives in `backend/src/index.js`. `R2_PUBLIC_URL` is now also restricted to http(s) origins. Defense in depth on the Railway secret pipeline — a stray `;` or quote in an env value can no longer corrupt the CSP header.
- **`RUNBOOK_CLAMAV.md` corrected** from "`CLAMAV_HOST` is RECOMMENDED" to the actual `OPTIONAL` classification in `secretValidator.js`.

### Video playback, interactive preview clicks, and player flash fixed (2026-05-01)

- **Videos now actually play.** The `appSurfaceCsp` `media-src` directive was `'self'` only, but the stream endpoint returns signed R2 URLs pointing at `https://<account>.r2.cloudflarestorage.com/...` — a different origin. Browsers blocked every `<video src=…>` against the signed URL with a CSP violation that does NOT show up in the Network tab as a failed request, so "video doesn't play" had no obvious diagnostic. Fixed by deriving R2 origins from `R2_ACCOUNT_ID` and (optional) `R2_PUBLIC_URL` and adding them to both `media-src` and `img-src` in `backend/src/index.js`. Matches Cloudflare's documented CSP guidance for self-hosted players.
- **Interactive Preview clicks now register on Tier 1 sheets.** `backend/src/modules/preview/preview.routes.js:168` always sent `SAFE_PREVIEW_DIRECTIVES` (with `script-src 'none'`) for Tier 1 sheets, even on the runtime endpoint that's specifically meant to allow interactivity. So the iframe loaded an interactive HTML doc with `<script>` tags but the CSP header silently blocked their execution — clicks did nothing. Fixed to switch to `RUNTIME_DIRECTIVES` when `isRuntime=true`. Three new regression tests in `backend/test/preview.routes.test.js` lock the Tier 1 runtime CSP, the Tier 1 preview CSP, and the Tier 2 always-safe CSP in place.
- **Play-button flash removed.** `FeedVideoPlayer` in `frontend/studyhub-app/src/pages/feed/FeedCard.jsx` was unmounting the poster `<img>` the moment `buffering` flipped to false, which left the `<video>` element to paint its default (transparent/white) backdrop for one frame before its first decoded frame appeared. Now both layers stay mounted and cross-fade over 180ms; the `<video>` element gets `background:#000` so transitions never pass through a brighter color, and the poster `<img>` is `pointer-events:none` so it can't swallow native-control clicks during the fade. Pattern mirrors video.js / Mux Player / YouTube Embed.
- **CLAUDE.md A-rule sweep on the video module:** swapped two `console.warn`/`console.error` calls in `video.service.js` for structured `log.warn`/`log.error` with stable `event` keys (A16); wrapped the fire-and-forget `processVideo` and `deleteVideoAssets` background jobs in `runWithHeartbeat('video.process')` / `runWithHeartbeat('video.delete_assets')` with explicit SLA budgets so silent stalls now produce `job.failure` events in pino + Sentry instead of disappearing (A10); added an explicit allowlist enum-validator on the `?quality=` query param in `GET /api/video/:id/stream` so only `360p|720p|1080p|original` reach the `variants` lookup (A13). Backend lint clean; preview / interactive-preview / clamav suites green (39/39).

### ClamAV antivirus wired to production (2026-05-01)

- **ClamAV sidecar is now live on Railway.** The `clamav/clamav:stable` image runs as a private service at `clamav.railway.internal:3310`; backend `CLAMAV_HOST`/`CLAMAV_PORT`/`CLAMAV_DISABLED` are wired so video uploads now fail-CLOSED in production per CLAUDE.md, and HTML sheet submissions get a real "antivirus clean" signal instead of the soft "scanner unavailable" warning.
- **Wire-protocol fix in `backend/src/lib/clamav.js`.** The streaming command was `INSTREAM\0` (legacy format); clamd 1.x+ rejects that with `UNKNOWN COMMAND`, which surfaced in the UI as "Antivirus scanner unavailable — Details: UNKNOWN COMMAND" on every sheet upload and "Security scanner unavailable. Please retry." in the feed composer. Command is now `zINSTREAM\0` (NUL-terminated mode prefix). New regression test under `backend/test/clamav.adapter.test.js` spins up a mock TCP server and asserts the wire bytes — the protocol cannot silently regress again.
- **New runbook** at `docs/internal/security/RUNBOOK_CLAMAV.md` documents the Railway sidecar setup, smoke test, failure modes (incl. emergency `CLAMAV_DISABLED=true` bypass with a 1-hour window), and the wire-protocol gotcha so future operators don't re-hit it.

### Fork gate + Tier-1 interactive preview opened to all viewers (2026-05-01)

- **Fork is now gated on `allowEditing`.** When a sheet creator turns OFF "Allow others to edit," the Fork button disappears for non-owners on the sheet viewer, sheet browse cards, and the mobile detail view; the backend `POST /api/sheets/:id/fork` returns 403 `FORK_DISABLED` for the same case (CLAUDE.md A6 defense in depth — frontend hide + backend reject). Owners never saw Fork on their own sheets to begin with (backend already 400'd self-forks).
- **Interactive Preview now works for non-owner viewers on Tier 1 (FLAGGED) sheets.** Previously, AI-generated study tools that include `<script>` (flashcards, quiz, match game, etc.) tripped Tier 1 and the runtime token endpoint was owner-only — meaning the creator saw the working interactive UI but every other viewer got Safe Preview only. The HTML risk policy already documents Tier 1 as "publish with warning, viewable by all" — gate is now `tier <= RISK_TIER.FLAGGED` on `canInteract`, and the runtime route requires owner/admin only at Tier 2 (HIGH_RISK). Sandbox stays `allow-scripts allow-forms` (never combined with `allow-same-origin` per A14), so the parent app stays isolated regardless of tier. New regression tests in `backend/test/interactive-preview.test.js` lock the `<= FLAGGED` gate and the new HIGH_RISK 403 message in place.

### Post-deploy polish + Google signups deploy-safe (2026-05-01)

- **Admin tab pills** get more breathing room — pill row now has `padding: 14px 18px`, `gap: 12`, `rowGap: 10`, and `flexWrap: wrap` so the tab cluster doesn't look cramped at narrower widths.
- **Public Navbar logo** swapped from the static `LogoMark` to the `AnimatedLogoMark` for the landing/auth/marketing routes (where `isLanding || !user`). Authenticated app chrome keeps the static mark.
- **Google signups deploy-safe.** `scripts/seedRolesV2Flags.js` now supports `forceEnabled: true` per flag — `flag_roles_v2_oauth_picker` is now force-enabled at every Railway boot, so an accidental admin-UI flip-off self-heals on the next deploy. Operators can opt out for incident-response kill-switching by setting `ROLES_V2_HONOR_ADMIN_TOGGLES=true`. New env-var documented in `backend/.env.example`.
- **Creator Audit Consent Log empty state** rewritten with a proper subtitle ("Read-only audit trail of CreatorAuditConsent rows for legal disputes…") and a polished "No consent rows yet / No revoked consents" body that explains _why_ the table is empty and how rows get populated.
- **Achievements page chrome fixed.** `/achievements` and `/achievements/:slug` now use the canonical authenticated-app layout (`Navbar` + `AppSidebar` + `app-two-col-grid` + `pageShell('app')`) — previously they rendered the sidebar without the top Navbar, producing a cut-off avatar header and no visible Hide button.
- **`docs/internal/security/RUNBOOK_CLAMAV.md`** added — Railway sidecar setup procedure for the ClamAV daemon (resolves the "Security scanner unavailable" 503 on prod video uploads + HTML drafts), with the `CLAMAV_DISABLED=true` emergency-bypass path documented as the founder-approved exception.

### 2FA recovery codes + Admin MFA enforcement scaffolding (2026-05-01)

- **2FA recovery codes** (NIST 800-63B AAL2 alt-factor pattern). Generates 10 single-use 64-bit codes (`xxxxx-xxxxx` hex), stores bcrypt hashes, exposes plaintext once at generation. Endpoints: `POST /api/settings/2fa/recovery-codes/regenerate`, `GET /api/settings/2fa/recovery-codes/status`, `POST /api/auth/login/recovery-code`. Behind `flag_2fa_recovery_codes` (ships disabled, founder flips on after testing).
- **Admin MFA enforcement (L2.14).** `User.mfaRequired` column + login flow gate. When `flag_admin_mfa_required` is on AND user is admin with mfaRequired: forces challenge band on every login. Fail-CLOSED on flag-read errors so the founder cannot self-lock.
- **Migrations:** `20260501000004_add_2fa_recovery_codes`, `20260501000005_add_admin_mfa`. Both use `IF NOT EXISTS` for redeploy safety.
- **Copilot review fixes** from PR #289: `/api/*` `Cache-Control` + `X-Robots-Tag` middleware moved before webhook mounts (now applies to every API response); DSAR audit log redacted (no requesterName/Email/IP — 8-char SHA-256 prefix only); `LegalRequest` + `AiMessage flag` migrations made idempotent; `loadEnv.js` adopted by `index.js`.
- **`lib/useFocusTrap.js` consolidated** to use the same `focus-trap` engine as `FocusTrappedDialog`. One trap engine across the app instead of two.

### Modal focus traps + accessible dialog primitive (2026-05-01)

- **`components/Modal/FocusTrappedDialog.jsx`** — single accessible dialog primitive that wraps `focus-trap-react`. Tab/Shift+Tab cycle stays inside, Escape closes (configurable), backdrop click closes (configurable), focus restores to the trigger on close, body siblings receive `inert` + `aria-hidden` while open. Industry-standard implementation per W3C ARIA Authoring Practices §3.9 (Modal Dialog Pattern).
- **9 modals migrated:** `HtmlDownloadWarningModal`, `RoleTile` Modal, `LegalAcceptanceModal` (signup blocker), `CreatorAuditConsentModal` (publish-flow), `KeyboardShortcuts`, `ConfirmLossyConversionModal`, `AvatarCropModal`, `CoverCropModal`, `VideoThumbnailEditor`, `AchievementUnlockModal`.
- **Dependency add:** `focus-trap-react@^11.0.6` (~3 KB gzipped) under v2.1 dependency exception. Founder-approved.
- **New Playwright smoke test:** `tests/modal-focus-trap.smoke.spec.js` verifies Tab focus stays inside the dialog through 5 forward + 5 backward Tab presses on the legal-acceptance modal.

### TypeScript adoption reverted (founder-locked)

- **TypeScript removed from the project.** The brief TS adoption shipped earlier on 2026-04-30 was reverted the same day. Backend has no transpiler step (runtime is plain Node 20 CommonJS via `nodemon src/index.js`), so `.ts` files cannot run in production without adding ts-node or a build step neither of which the founder approved. Removed: `typescript` + `@types/*` devDependencies from both workspaces, `tsconfig.json` files (truncated to 0 bytes, safe to delete locally), `npm run typecheck` scripts, `--ext .ts` flag on backend lint script, `shared/types/` references in docs. The repo is JavaScript-only going forward; new files are `.js` / `.jsx`. JSDoc carries the type-hint role. CLAUDE.md "Language policy" section is the canonical rule.

### Achievements V2 — full system overhaul

- **54-badge catalog across 10 categories.** Authoring, Forking & Contribution, Reviewing, Notes, Study Groups, Social, Hub AI, Streaks & Consistency, Special (secret), and Founder/Community. Five visible rarity tiers (bronze / silver / gold / platinum / diamond) plus a secret tier hidden until earned.
- **XP + Level system** layered over the catalog. Each tier carries a fixed XP value (25 / 75 / 200 / 500 / 1500); user level is a function of total XP. New `LevelChip` component renders the user's level next to their username with a colour matching their highest-tier badge.
- **Hexagon SVG visual** replaces the legacy circular FontAwesome coins. New `AchievementHexagon` component supports 4 states (unlocked, locked-progress, locked-secret, recent) with reduced-motion-aware glow animation. All tier colours come from new `--sh-bronze/silver/gold/platinum/diamond/secret` tokens in `index.css` (light + dark mode).
- **Event-driven award engine.** New `backend/src/modules/achievements/` module: `achievements.engine.js` exports `emitAchievementEvent(prisma, userId, kind, metadata)` which routes events to typed criteria evaluators (count, sum, distinct_count, streak, event_match, timed, plan_active, created_before). Replaces the v1 polling check; engine is fire-and-forget, never throws back to the caller. Legacy `lib/badges.js` is now a thin shim that delegates to the new engine for back-compat with the 5 existing trigger sites.
- **Full read API.** `GET /api/achievements` (catalog), `GET /api/achievements/stats` (own level/xp), `GET /api/achievements/users/:username` (user gallery, block-aware), `GET /api/achievements/users/:username/pinned` (compact strip), `GET /api/achievements/:slug` (detail page with global stats + recent unlockers). All public endpoints use optionalAuth.
- **Pin / unpin / privacy writes.** `POST /api/achievements/pin`, `DELETE /api/achievements/pin/:slug` (max-6 enforced server-side), `PATCH /api/achievements/visibility` (toggles `achievementsHidden` flag). All require auth + originAllowlist + writeLimiter.
- **Profile integration.** `UserProfilePage` Achievements tab rebuilt with the new `AchievementGallery` (filter chips per category, sort dropdown, full locked + unlocked + secret rendering, owner pin controls). New `PinnedBadgesCard` shows the user's pinned-6 strip on the Overview tab for both own and other profiles.
- **Dedicated `/achievements` and `/achievements/:slug` routes.** Full-page own gallery and a public detail page (badge art, criteria, holderCount + percent of users, top-10 most-recent unlockers with block-filter, pin/unpin CTA when held).
- **Unlock celebration modal** mounted globally at the App root. Driven by `?celebrate=:slug` query param; localStorage tracks already-celebrated slugs to suppress duplicates. Hexagon scale-in animation respects `prefers-reduced-motion`.
- **Schema migration `20260501000001_achievements_v2`.** Additive only (`IF NOT EXISTS`-guarded). Extends `Badge` with xp / isSecret / displayOrder / iconSlug / criteria / updatedAt; extends `UserBadge` with pinned / pinOrder / sharedAt; adds `AchievementEvent` (per-event log for time-windowed criteria) and `UserAchievementStats` (denormalized XP cache). Two new indexes on Badge, one on UserBadge.
- **Trigger sites wired across the product.** `sheets.create.controller` now emits `sheet.publish` with `{hour, courseId}` so early-bird / night-owl / multi-course criteria match. New `note.create`, `group.create`, `group.join`, `ai.message` triggers in their respective controllers. Existing 5 trigger sites continue to work via the back-compat shim.
- **Seed updates.** `seedBetaUsers.js` now seeds the full 54-badge catalog and unlocks ~15 badges (including 3 secrets, 6 pinned) on `beta_student1` so a fresh `npm run seed:beta` produces a usable demo state per CLAUDE.md §11.

### Static-headers test path-anchored

- **`staticHeaders.test.js` now resolves its file paths from `import.meta.url` instead of `process.cwd()`** so the test passes regardless of where vitest is launched from (root, workspace dir, monorepo runner). Renamed from `.ts` to `.js` to match the JavaScript-only language policy adopted on 2026-04-30.

### Pre-deploy hardening pass (post-screenshot bug review)

- **HTML preview iframe blank-page bug fixed.** When `FRONTEND_URL` env was missing in production, `allowedOrigins` collapsed to `['https://localhost']` and `frame-ancestors` blocked the real `getstudyhub.org` parent. Added `PROD_FRONTEND_FALLBACKS = ['https://getstudyhub.org', 'https://www.getstudyhub.org']` so the frame-ancestors directive always permits the canonical production frontends. Also: Tier 0 safe preview now sets the CSP header explicitly instead of relying on the global preview-surface middleware, so a future route-ordering change can't reintroduce the same blank-iframe failure mode.
- **`resolvePreviewOrigin` Host fallback hardened.** When no `HTML_PREVIEW_ORIGIN` is configured and the Host header doesn't match the trusted preview allowlist, the fallback now uses `https://api.getstudyhub.org` in production instead of `localhost:4000`.
- **Notifications routes use the strict write-rate limiter and the `sendError` envelope.** `PATCH /read-all`, `PATCH /:id/read`, `DELETE /read`, `DELETE /:id` now hit `writeLimiter` (60/min) instead of `readLimiter` (200/min), and every error response carries an `ERROR_CODES.*` code so the frontend can branch consistently.
- **6 latent bugs caught by post-pass review:**
  - `useSocket` cleanup now removes manager-level listeners and nulls `socketRef` so duplicate listeners can't accumulate across login cycles.
  - `NotificationsPage` shows a staleness banner when a refresh fails on a non-empty inbox, instead of silently displaying cached data.
  - `NavbarNotifications.refreshNotifications` guards against missing `startTransition` so a future direct invocation can't crash with a TypeError.
  - `creatorAudit.acceptConsent` idempotent re-POST no longer crashes when `acceptedAt` is null on a backfilled row.
  - `notify._maybeSendNotificationEmail` now falls back to `type` for the dedup key when none is provided, closing the email-spam path for social events (`star`, `fork`, `follow`).
  - `getForkLineageIds` BFS now hard-stops at `MAX_VISITED` inside the inner loop so a wide fork tree can't blow past 500 IDs and trip PostgreSQL's bind-parameter limit on the resulting `notIn:` query.
- **Modal backdrop guard.** `CreatorAuditConsentModal` no longer dismisses on backdrop click when an error banner is visible — the user has to use the Cancel button so they don't lose the error context.
- **`UploadSheetPage` consent-gate stability.** `handleGatedSubmit` destructures stable primitives from the `useCreatorConsent` hook return rather than capturing the whole `consent` object, eliminating the per-keystroke nav-action re-render.
- **Backfill script logs progress every 100 users** so an operator running it on a large production user table sees the script is alive.

### Creator Audit promotion + gap closures + version bump

- **Public README now points to the canonical `.org` domain.** GitHub-facing resources now use `https://www.getstudyhub.org`, with `.net` documented only as the backup domain.
- **HTML sheet previews render on the `.org` production frontend again.** The static frontend CSP now allows preview iframes from `https://api.getstudyhub.org` and the future `https://sheets.getstudyhub.org` isolated preview host instead of only Railway's raw `*.up.railway.app` host.
- **Creator Audit flag promoted to SHIPPED.** `design_v2_creator_audit` is now in `SHIPPED_DESIGN_V2_FLAGS`. Prod deploy order is documented in code: deploy → `prisma migrate deploy` → `backfill:creator-consent --prod-confirm` → `seed:flags`. Skipping the backfill step shows the consent modal to existing users on next publish — disruptive, not destructive, and recoverable by running the backfill afterward.
- **CreatorAuditConsent gets soft-delete + provenance.** New migration `20260430000001_add_consent_provenance_and_soft_delete` adds `acceptanceMethod` (`'user'` / `'backfill'` / `'seed'`) and `revokedAt` columns. Revocation now soft-deletes (preserves the audit trail), and the controller treats a revoked row as "not accepted" while still allowing seamless re-acceptance.
- **Notification fan-out dedup keyed on (recipient, type, actor, sheet).** A user starring 50 different sheets by the same author still produces 50 notifications; the same user starring the same sheet twice in an hour produces one. Critical types (mention, reply, contribution, moderation) are never deduped.
- **EU IP-detection is fail-closed.** When a request reaches the backend without a trusted geo header (Cloudflare or Vercel) in production, `persistedIp` now hashes the IP rather than storing plaintext — protects against direct-to-Railway requests, edge changes, and header spoofing without the right country code.
- **Backfill script gets a `--prod-confirm` guard.** Running `backfill:creator-consent` against a production-shaped `DATABASE_URL` without the explicit flag now refuses, preventing accidental writes when a developer has the wrong env exported.
- **Versions bumped to 2.2.0** across `backend/package.json`, `frontend/studyhub-app/package.json`, the in-app About page Roadmap section, and CLAUDE.md auth note. AboutPage replaces V2.0.0 with V2.2.0 + the new "what's shipped since V2.0.0" features.
- **ROADMAP.md** refreshed with the V2.2.0 feature summary, V2.5 next-up (browser push, notification grouping, cloud import, Creator Audit follow-ups), and V3.0 future (Scholar tier).
- **PUBLIC-LAUNCH-PLAN.md** added at the repo root with the actual current state of the codebase (LICENSE/CONTRIBUTING/CODE_OF_CONDUCT/SECURITY/PRIVACY all already present, TypeScript wired, OWASP headers in place) so the next session doesn't redo work.
- **payments.test.js** assertion updated from `aiMessagesPerDay: 10` to `30` (with `aiMessagesPerDayVerified: 60`) — the test was drifting behind the pricing-page change shipped earlier in the cycle. **Backend test suite now: 1985/1985 passing.**
- **RUNBOOK_SWEEPERS.md** added to `docs/internal/security/` documenting how to enable orphan-video and inactive-session sweepers via Railway Cron (not always-on, to avoid thundering herd across replicas).
- **Master plan §4.2 refreshed** to document that Phase 1 actually shipped against `FeedPage.jsx` + `UserProfilePage.jsx`, not the deleted `DashboardPage.jsx` referenced in earlier drafts.
- **AI streaming + HTML preview origin hardening.** Hub AI now streams safe redacted deltas again, and preview URLs reject untrusted Host-header fallbacks unless `HTML_PREVIEW_ORIGIN` is configured.
- **Review follow-ups for Creator Audit, notifications, and multi-school profiles.** Creator Consent requests now send auth headers correctly, socket notification pushes include actor data immediately, notification fan-out dedup has a matching DB index, and `/api/users/me` chooses stable sorted school fields for dual-enrolled users.

## v2.0.0-beta — in progress

### Public-launch prep + TypeScript adoption + Creator Audit ship

- **Plagiarism on legitimate forks is fixed.** A user forking a sheet and making a small edit no longer trips the plagiarism notification. A shared `getForkLineageIds` helper walks the entire fork tree (ancestors + descendants + siblings) and excludes those IDs from every similarity scan path (`findSimilarSheets`, `findSimilarContent`, the deep AI scan). The notification copy is also softer: instead of "your sheet may contain plagiarism," users now get an actionable "review the report — if this is intentional reuse, add a citation or fork the original."
- **Notifications now push in real time.** A new `notification:new` Socket.io event is emitted from `notify.js` when a notification is persisted, and `NavbarNotifications` listens on the user's personal socket room so the bell updates without waiting for the 30s polling cycle. Polling stays as a fallback. Notification rows now render a type-coloured icon (light/dark token-driven) instead of a flat plus-mark, and a new full-screen `/notifications` page adds filter chips (Social, Content, Groups, System) and bulk actions.
- **TypeScript is now the project language going forward.** Both workspaces have `tsconfig.json` with `allowJs: true`, a `typecheck` script, and the `shared/types/` directory holds API request/response shapes for cross-workspace import. `CLAUDE.md` §13 documents the conventions: all new files are `.ts`/`.tsx`, no new `.js`/`.jsx`, never `any`, explicit return types on exports. Existing JavaScript continues to work; migration is incremental.
- **Creator Audit is shipped.** The backend foundation already merged in a prior cycle; this cycle adds the frontend consent modal (`CreatorAuditConsentModal` + `useCreatorConsent`), wires it into `UploadSheetPage` so publish is gated behind consent when the flag is on, seeds beta-user consent rows so `seed:beta` produces a usable local state, adds a `backfill:creator-consent` script for production migration, and promotes `design_v2_creator_audit` from in-flight to shipped in `seedFeatureFlags.js`.
- **Security gap closures.** `FIELD_ENCRYPTION_KEY` is now hard-required at production startup (a missing key would previously have caused PII columns to silently store plaintext). A new `ssrfGuard.js` allowlist + private-IP block is in place ahead of Scholar tier and Hub AI v2 citation fetching (decision #15). Frontend `.env.example` now documents every `VITE_*` variable used in the codebase. New public `PRIVACY.md` at the repo root.
- **Quality-control sweep.** Explicit `requireAuth` on the feed `POST /posts/:id/react` route closes the inheritance gap flagged by code review.

### Dependency changes

- **Added** `typescript@~5.6.3`, `@types/node`, `@types/express`, `@types/cors`, `@types/jsonwebtoken`, `@types/multer`, `@types/sanitize-html`, `@types/compression`, `@types/bcryptjs` (backend `devDependencies`); `typescript@~5.6.3`, `@types/react@~19.2.0`, `@types/react-dom@~19.2.0` (frontend `devDependencies`). Reason: project-wide TypeScript adoption per the public-launch plan; founder-approved 2026-04-30. No existing dep solves the need (we cannot statically check JavaScript without a TypeScript compiler). Rollback plan: remove devDependencies and the two `tsconfig.json` files; nothing in production runtime depends on them.

### Subscription-tier alignment fixes (post-merge audit pass)

- **Video duration cap was flat 10 minutes for every plan**, contradicting the pricing page's Free=30/Donor=45/Pro=60-minute claims. `VIDEO_DURATION_LIMITS` and `VIDEO_SIZE_LIMITS` in `backend/src/modules/video/video.constants.js` now derive from the canonical `PLANS` spec in `payments.constants.js` so the two files can't drift again. Admin uploads (used for announcements) keep a separate 90-minute cap. Test pin added so a future regression that re-flattens the durations fails CI.
- **Pricing page now matches the actual AI quotas** — Free tier reads "30 AI messages per day (60 once you verify your email)" instead of "10 AI messages per day". Backend `DAILY_LIMITS` (default=30, verified=60) was already enforcing the higher numbers; this aligns the UI claim with reality and surfaces the email-verification perk as a sales lever. `payments.constants.js:PLANS.free` records both `aiMessagesPerDay: 30` and `aiMessagesPerDayVerified: 60` for documentation parity.
- **TestTakerPage hardcoded slate hex colors** (background / borders / heading / muted / link) are now `var(--sh-*)` tokens so the "planned for v2" holding page themes correctly in dark mode.

### Expanded security hardening sweep

- **A deeper 10-loop security sweep closed privacy, upload, HTML, socket, and enrollment edge cases.** Hub AI now redacts PII before and after model calls, socket leave events only broadcast for rooms the caller actually joined, multi-school users keep their full enrollment set in `/api/users/me`, video uploads honor the tiered plan caps from `PLANS`, uploads validate magic bytes instead of MIME alone, direct HTML sheet create/update paths persist risk-tier scans and quarantine Tier 3 content, and note HTML word counts now use inert parsing instead of an `innerHTML` sink.

### Creator Audit backend foundation

- **Creator Audit now has backend audit primitives behind a fail-closed in-flight flag.** Added consent storage, audit-grade columns, five audit checks, owner-checked `/api/creator-audit` endpoints, centralized rate limits, and regression tests for PII redaction, ReDoS resistance, malformed asset URLs, report caps, consent privacy, and route auth/CSRF behavior.

### Profile media + HTML preview hotfix

- **Profile photos, cover images, school logos, and HTML sheet previews no longer break from mixed-origin URLs.** Shared image URL normalization now prefixes slash-relative paths through the API origin, rejects unsafe image sources, upgrades public `http:` images to `https:`, and the sheet preview origin now honors forwarded HTTPS headers so sandbox iframes do not get mixed-content blocked in production.
- **Editor uploads and moderation attachment previews now use the same safe media URL rules.** Uploaded editor images go through shared URL normalization, and moderation previews recover image/PDF attachments from MIME types while keeping PDF iframes restricted to backend-relative URLs.
- **Creator Audit persistence and consent metadata are hardened.** Audit reports no longer save onto content that changed mid-run, consent IP/user-agent metadata is validated before persistence, accessibility parsing is bounded, and truncated reports now keep severity counts.
- **Creator Audit schema indexing was cleaned up.** The consent table now relies on its existing unique `userId` index without creating a duplicate non-unique index.
- **Roles v2 feature flags now fail closed.** Missing rows, network errors, malformed responses, and non-200 flag responses keep Roles v2 surfaces disabled unless the backend returns `enabled: true`.
- **GIF search no longer ships a hardcoded Tenor key.** Tenor is now configured through `VITE_TENOR_API_KEY` / runtime config, and the GIF picker stays disabled without making external requests when no key is configured.

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

- Streaming Claude integration
