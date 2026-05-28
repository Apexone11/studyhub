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

### Wave-12.13 — Codex P1 + P2 fixes on wave-12.11 / 12.12 (2026-05-28)

Two real findings from a Codex review pass on `e9fc07e6`. Both vetted and fixed in our style.

**P1 — `serializeNote` dropped `revision`, breaking the editor's optimistic-concurrency loop.**

Wave-12.11's `PUBLIC_NOTE_FIELDS` allowlist omitted `revision`. `frontend/.../useNotePersistence.js#L248` reads `srv.revision` and uses it as `baseRevision` on the next autosave. With `revision` stripped from the response, the editor saw `Number(undefined ?? 0) === 0` and any note with `revision >= 1` would 409 on the next debounce-triggered save. Added `revision` back to the allowlist with an inline comment so a future cleanup doesn't drop it again.

**P2 — Saver-mode preferences never reached the global hook.**

`buildAuthenticatedUserPayload` didn't include `preferences`, so `SaverModeInitializer` read `user.preferences?.dataSaverMode` as `undefined` and the hooks fell back to localStorage + the platform signal. A user could save "Data Saver: on" in Settings → backend persisted → frontend never honored it across browsers. Two-part fix:

1. **Backend**: `getAuthenticatedUser` now selects `preferences: { select: { dataSaverMode, batterySaverMode } }` (slim — just the two columns the global hook needs at page-load time, not the whole prefs row). `buildAuthenticatedUserPayload` surfaces them as `preferences: { dataSaverMode, batterySaverMode }`. Null-safe: a fresh user with no UserPreferences row defaults both to `'auto'` matching the schema default.
2. **Frontend**: `DataAndBatteryTab` now calls `setStoredDataSaverMode` + `setStoredBatterySaverMode` after a successful save, so the change takes effect immediately on the current page without a reload (also seeds future first-paints before the session round-trip completes).

Validation: 3387/3393 backend tests pass, 845/855 frontend. Lint clean both projects. Build green.

### Wave-12.12 — step-up MFA expansion + data-saver consumers + battery-saver JS gates (2026-05-27)

Follow-on wave addressing the deferred items from wave-12.11. Backend tests: 3387/3393 pass. Frontend tests: 845/855 pass. Lint clean both projects.

**1. Step-up MFA expanded to 4 more privileged admin routes:**

- `PATCH /api/admin/users/:id/role` — granting / revoking admin role.
- `PATCH /api/admin/users/:id/trust-level` — affects rate limits + visibility.
- `PATCH /api/admin/users/:id/mfa` — flipping this OFF on another admin would undo wave-12.8's protection.
- `POST /api/payments/admin/sync-stripe` — bulk Stripe sync touches every active subscription.

Combined with the wave-12.11 `DELETE /admin/users/:id`, the high-risk admin surface is now covered. Day-to-day moderator routes (badge grants, sheet review, announcements) intentionally remain unprotected — they're frequent enough that step-up every 15 min would create real friction without proportional security gain.

**HIGH audit finding fixed in-wave:** `handleTrustLevelChange` and `handleMfaToggle` in `UsersTab.jsx` called raw `fetch()` directly, bypassing the `apiJson` step-up interceptor. An admin with a stale session would have silently hit a 403 with no modal, no toast, and a select widget that snapped back to the old value with zero feedback. Extracted both into `patchTrustLevel` + `patchMfaRequired` methods on `useAdminData` (matching the existing `patchRole` / `deleteUser` pattern) so step-up flows transparently and errors surface via `showToast`.

**2. Data Saver consumers wired:**

- **Feed lite mode** — when `Save-Data: on`, user pref `dataSaverMode='on'`, or `?lite=1` query param, `GET /api/feed` strips `media[]` arrays and author `coverImageUrl`s before sending. Adds `lite: true` to the payload so the frontend can render a "data saver on" footer.
- **Frontend feed fetch** — `useFeedData` appends `?lite=1` when `useDataSaver().enabled` is true. Both initial load + load-more paths covered.
- **Typing indicator suppression** — `useMessagingData.emitTypingStart` + `emitTypingStop` short-circuit when data-saver is on. Receivers still see others' typing indicators normally; the local user just doesn't broadcast their own (saves a Socket.io round-trip per keystroke).
- **AI streaming gate** — **DEFERRED with documented rationale**. The `aiService.streamMessage` function streams chunks directly to `res`; there's no non-streaming variant. Building a buffering wrapper would add server memory + perceived latency for a marginal bandwidth saving (text deltas are tiny vs. the media + cover images already gated above). The `shouldReturnLite` helper exists; future work can flip the strategy when the cost/benefit shifts.

**3. Battery Saver JS-side gates:**

- **`lib/animations.js`** — `prefersReducedMotion()` now returns true when `<body data-battery-saver="on">` is set, in addition to the OS `prefers-reduced-motion: reduce` query. Cascades to every anime.js helper in the file (fadeInUp, staggerEntrance, pulseHighlight, popScale, countUp, fadeInOnScroll, slideDown) — each already short-circuits to a single `utils.set(...)` call when the gate returns true. No rAF loop runs.
- **`components/Toast.jsx`** — toast auto-dismiss bumped +50% (3500ms → 5250ms by default) when battery saver is on. Pairs with the founder's "give motion-sensitive readers more time" intent from the original plan.
- **Lottie + continuous rAF loops** — neither exists in the codebase. Grep was empty; no change needed. The plan's references to these were hypothetical.

Combined with the CSS-side rule shipped in wave-12.11 (`body[data-battery-saver='on'] *:not([data-motion='keep'])` disables animations / transitions / will-change), the JS-side gate now covers the remaining ~20% the CSS rule couldn't reach.

**4. Audit loop:**

A code-reviewer subagent pass on the wave-12.12 diff found 1 HIGH (fixed in-wave above) and ruled out 6 LOW findings (`?lite=1` overriding user `off` pref — `req.user.dataSaverMode` isn't populated by `requireAuth` so the override path is inert; `setImmediate` name collision is harmless in browser; etc).

### Wave-12.11 — admin step-up MFA + volume backup + saver modes + video player (2026-05-27)

Five connected feature shipments + 5 audit-fix items in a single wave. All founder-priority items from the long-tail backlog. Backend tests: 3387/3393 pass (6 documented skips, 0 fails). Frontend tests: 845/855 pass. Lint clean both projects.

**1. Admin MFA step-up enforcement (`requireRecentMfa`)**

Closes the unshipped half of L2.14 from the 2026-04-30 deferred plan. The login-time admin MFA enforcement shipped in wave-12.8; this wave adds the per-action step-up middleware so admin-sensitive routes require a fresh 2FA factor within the last 15 minutes even on already-authenticated sessions.

- New `backend/src/middleware/requireRecentMfa.js` — reads `Session.mfaVerifiedAt` and 403s with `code: 'MFA_STEP_UP_REQUIRED'` when stale or unset. Honours the same `EMERGENCY_DISABLE_ADMIN_MFA` sealed-glass-break as the login flow.
- New schema column `Session.mfaVerifiedAt DateTime?` + migration `20260527000002_session_mfa_verified_at`. Stamped by `createSession` when called with `mfaVerified: true`.
- `login.challenge.controller.js` + `login.recovery.controller.js` pass `mfaVerified: true` so newly-issued sessions are pre-stamped — admins don't have to step up again right after a successful 2FA login.
- New `mfa.stepUp.controller.js` exposes `POST /api/auth/mfa/step-up/start` + `/verify`. Reuses the loginChallenge primitive for OTP and consumeRecoveryCode for recovery-code path. Atomic Session update via updateMany so race conditions can't double-extend.
- Applied to `DELETE /api/admin/users/:id`. Other privileged admin routes (role grants, plan changes) tracked as follow-on hardening — out of scope this wave.
- Frontend: new `MfaStepUpProvider` mounted in App.jsx, `MfaStepUpModal` (focus-trap, OTP + recovery-code tabs, "Set up 2FA first" path when user has no 2FA configured), `useMfaStepUp()` hook. Admin `apiJson` interceptor catches `MFA_STEP_UP_REQUIRED` and transparently retries after step-up. **End-to-end functional: a real admin clicking Delete now sees a code prompt, types it, and the delete proceeds.**
- 12 backend unit tests pinning every branch (no req.user, no sessionJti, missing session row, mfaVerifiedAt null with/without 2FA, stale, fresh, custom window, P2021 graceful degrade, emergency override case + whitespace tolerant, override does NOT bypass without the literal "true").

**2. WebAuthnCredential.lastUsedAt**

- Schema additions + migration `20260527000001_webauthn_last_used_at`.
- `webauthn.routes.js` verify path writes `lastUsedAt: new Date()` alongside the counter update.
- `/credentials` list endpoint surfaces `lastUsedAt` so the admin portal can show "last used 3 days ago" per passkey.

**3. serializeNote explicit allowlist**

Closes the MED finding from the wave-12.10 audit. Replaced `{...note, tags, ...extra}` spread with explicit `PUBLIC_NOTE_FIELDS` list. Stripped from API responses: `contentHash`, `contentSimhash`, `lastAuditGrade`, `lastAuditReport`, `lastAuditedAt`, `revision`, `lastSaveId`. Documented `extra` as trusted-caller-only override channel.

**4. Upload volume → R2 backup (user-photo durability)**

Closes the founder-flagged gap "when the server crashes, people's data should not be lost and photos should be stored somewhere." Before this wave, the Railway volume at `/data/uploads` was a single point of failure — every avatar / cover / attachment / school logo / group media file would be permanently gone if the volume corrupted. Now mirrored to R2 nightly.

- New `lib/jobs/uploadVolumeBackup.js` — `runWithHeartbeat`-wrapped daily pass (CLAUDE.md A10). Walks `/data/uploads` recursively, mirrors to R2 with `objectExists` skip-if-already-there. Throttled at 10 uploads/sec (configurable). **Streams files** (not `readFileSync`) so a multi-GB video doesn't OOM Railway hobby tiers — caught by the wave-12.11 audit pass.
- New `scripts/restoreVolumeFromR2.js` disaster-recovery script. Three modes: `--dry-run` (no writes), default (skip-if-exists), `--force` (overwrite). Handles ListObjectsV2 pagination.
- `r2Storage.js` — `uploadObject` + `objectExists` now accept optional `bucket` override + `contentLength` (for streamed bodies) + `cacheControl`. Backward-compatible — existing callers don't pass these.
- `R2_BUCKET_UPLOAD_BACKUP` env var promoted to **REQUIRED_IN_PRODUCTION** so a missing value fails boot loud instead of silently disabling backups (the warn-level startup log wasn't visible in Sentry by default).
- Runbook section "Upload Volume Recovery" added to `docs/internal/security/RUNBOOK_DB_RESTORE.md` with the full recovery procedure (Guarded Mode → list bucket → dry-run → restore → verify counts → disable Guarded Mode).
- Documented data-loss window: worst case ~24h of uploads if the volume crashes right before the next backup pass. Tunable via `UPLOAD_BACKUP_INTERVAL_MS`.

**5. Data Saver + Battery Saver modes (v1)**

Closes both founder-priority plans (`docs/internal/plans/data-saver-mode.md` + `battery-saver-mode.md`, both archived this wave with their "v1 shipped" sections detailing what's live vs. what's deferred to per-route consumer integrations).

- Schema additions: `UserPreferences.dataSaverMode` + `batterySaverMode` (both `String @default("auto")`, tri-state on/off/auto).
- Migration `20260527000003_data_battery_saver_modes` (idempotent guards per CLAUDE.md A5).
- `PREF_ENUM_KEYS` allowlist validation for both.
- New Settings tab "Data & Battery" with IconBolt icon between Appearance and Accessibility. Two tri-state selects + inline explainers.
- New `useDataSaver` hook with `navigator.connection.saveData` auto-trigger.
- New `useBatterySaver` hook with `prefers-reduced-motion: reduce` auto-trigger. Side-effect writes `data-battery-saver="on"` on `<body>`.
- New CSS rule in `index.css` targeting `body[data-battery-saver='on'] *:not([data-motion='keep'])` — disables animations, transitions, will-change, scroll-behavior. **End-to-end functional**: a user toggles battery saver → animations stop on next frame without reload. Same `data-motion="keep"` escape hatches as the existing reduced-motion media query, so achievement celebrations + first-creation moments still play.
- New backend helper `lib/dataSaverNegotiation.js` exporting `isDataSaverRequest`, `isLiteQueryRequest`, `shouldReturnLite` — opt-in for route handlers that want to return lighter responses. 11 unit tests pinning the three-signal contract.
- New `SaverModeInitializer` mounted in App.jsx so the body attribute toggles immediately when Settings changes.

**6. Video player additions (study-platform features)**

The 807-line StudyHubPlayer was already feature-rich — quality switching, captions, theater mode, PiP, double-tap skip, keyboard shortcuts, etc. Added three study-specific features without disturbing the existing surface ("if it isn't broken don't fix it").

- **Watch-progress persistence**: localStorage per video (keyed on optional `videoId` prop or hashed `src` URL). Auto-resumes from saved position on `loadedmetadata` when > 5s in AND > 10s before end. Throttled save on `timeupdate` (5s interval) + flush on `pause` / `pagehide`. Auto-clears on `ended`. "Resumed from X:XX" pill renders briefly with "Start over" escape.
- **A-B loop**: `[` sets point A at current time, `]` sets point B, `Shift+L` clears both. Loop indicator pill in top-right shows the bracket. timeupdate handler seeks back to A whenever currentTime crosses B. Designed for re-watching difficult lecture sections.
- **Keyboard shortcut help overlay**: `?` toggles a focused overlay listing all 13 shortcuts. Closes on `?` again or Escape or backdrop click.
- All three additions are purely additive — zero behavioral change for users who don't use them. Lint clean, build clean.

**Audit pass — 2 HIGH + 3 MED real findings fixed in-wave:**

A code-reviewer subagent pass on the wave-12.11 diff caught:

- **HIGH** — Video player `ended` listener was anonymous → leaked on every `[`/`]` keypress. Named the handler + included in cleanup.
- **HIGH** — `serializeNote.extra` channel is back-door for non-allowlisted fields. Currently all callers pass derived booleans / counts only (safe), but added a docblock warning so future callers know the constraint.
- **MED** — Stale pre-migration sessions verified safe (settings 2FA setup route doesn't apply `requireRecentMfa`, so no chicken-and-egg lockout).
- **MED** — `R2_BUCKET_UPLOAD_BACKUP` was OPTIONAL → silent backup-disable in prod. Promoted to REQUIRED_IN_PRODUCTION.
- **MED** — `mirrorFile` used `readFileSync` → OOM on large videos. Switched to `createReadStream` + `ContentLength` header.

### Wave-12.10 — moderation module A11 + A12 sweep (2026-05-27)

Four real CLAUDE.md A-rule violations in the moderation module, all found by an audit subagent on a broad codebase sweep. Moderation got refactored before A11 (originAllowlist on writes) and A12 (Number.isInteger + ≥1 guard for IDs) were locked in, so the module shipped two CSRF-defense-in-depth gaps and 11 weak ID guards.

- **HIGH — A11 — `/api/admin/moderation` adminRouter had no `originAllowlist()`.** Admin endpoints (claim case, review case, issue strike, lift restriction, approve/reject appeal) were CSRF-protected only by the global Origin check in `index.js`, which trusts empty-Origin requests (curl, server-to-server). Per-module `originAllowlist()` is the defense-in-depth layer. The parallel `/api/admin` adminRouter got it in wave-11; the moderation admin router was missed. Added.
- **HIGH — A11 — `/api/moderation` userRouter (reports + appeals) had no `originAllowlist()`.** Same gap, user-facing side. A malicious cross-origin page could submit a false report or appeal in the victim's name. Added.
- **HIGH — A12 — 11 sites used `Number.isFinite(id)` instead of `Number.isInteger(id) && id >= 1`.** `Number.isFinite(-1)` is true; `Number.isFinite(1.5)` is true after parseInt-truncation but the convention is to use isInteger. Negative IDs would have hit `where: { id: -1 }` in Prisma. Fixed in `moderation.admin.cases.controller.js` (8 sites), `moderation.admin.enforcement.controller.js` (2), `moderation.user.controller.js` (2). Both validation sites (400 on fail) and one optional-filter site (`if isInteger then set where.userId`).
- **HIGH — A12 — `moderation.user.controller.js#GET /my-log` used bare `parseInt`.** No radix on the inner call, no isInteger guard. Switched to `clampPage()` from `lib/constants.js` for consistency with the rest of the platform's pagination handling.

Validation: 3362/3368 backend tests pass (6 documented skips, 0 fails). Backend lint clean. The moderation reporting + visibility test suites (15/15) continue passing, confirming the new origin requirement doesn't break the existing supertest flows.

### Wave-12.9 — code-reviewer audit fixes on wave-12.7 / 12.8 (2026-05-27)

Three real findings from a code-reviewer subagent pass on the modal migration + admin MFA work. All have one-line fixes.

- **HIGH — `FocusTrappedDialog` initialFocus selector was document-global.** `document.querySelector(initialFocusSelector)` searched the entire document, so a stray `[data-autofocus]` elsewhere on the page (dev harnesses, other mounted components) could hijack the dialog's initial focus target. Scoped to `overlayRef.current?.querySelector(...)`. Affects `ConfirmDialog`, `AiSheetPreview`, `AttachmentPreview` — all of which now have guaranteed in-dialog focus targets.
- **MED-HIGH — `LegalAcceptanceEnforcementModal` had no `initialFocusSelector`.** Pre-migration the bespoke `useFocusTrap` may have placed focus differently; without an explicit selector, focus-trap-react falls back to the first tabbable. More importantly: in a brief render race where focus-trap can't find a tabbable, it throws — and an error boundary catching that exception would silently unmount the enforcement modal and let the user past the legal-acceptance gate. Added `data-legal-signout` on the Sign out button + `initialFocusSelector="[data-legal-signout]"` on the dialog so the contract is explicit and testable.
- **MED — `EMERGENCY_DISABLE_ADMIN_MFA` was case-sensitive.** Strict `=== 'true'` comparison meant a founder under stress typing "True" or "TRUE" in the Railway dashboard would NOT bypass enforcement — the exact moment that flexibility matters most. Switched to `.trim().toLowerCase() === 'true'`. Strict opt-in is preserved — `"1"`, `"yes"`, `"trueish"` all still enforce. Added 2 regression tests pinning both the tolerance (the variants that SHOULD bypass) AND the strictness (the variants that should NOT).

Validation: 41/41 auth.deep tests pass (+2 new variant tests); 21/21 AiSheetPreview + AttachmentPreview tests still pass. Backend + frontend lint clean.

### Wave-12.8.1 — 2FA recovery codes unit test coverage (2026-05-27)

Closes the "Tests required before shipping" gap from `docs/internal/archive/audits/2026-05-achievements/2026-04-30-2fa-recovery-codes-plan.md`. The recovery-codes primitive (`lib/auth/recoveryCodes.js`) had 0 test coverage despite being the security-critical core of the entire feature.

Added `backend/test/recoveryCodes.unit.test.js` with 20 tests covering:

- `generatePlaintextCodes` — count, hex format, randomness.
- `hashCodes` — bcrypt header, per-code salt, roundtrip verification.
- `normalizeRecoveryCode` — both canonical and dash-stripped forms, case folding, whitespace, charset/length validation, nullish rejection.
- `consumeRecoveryCode` — the critical contract: a code matched once cannot be matched again (the single-use property); unknown codes leave the hash list untouched; empty / non-string submissions reject without mutating state.

The implementation itself is unchanged. The constant-time-ish loop guarantee (no early break) is enforced by code review; the test verifies the observable outcome (matched index dropped, others retained).

### Wave-12.8 — admin MFA fail-CLOSED + sealed-glass-break override (2026-05-27)

Closes P1-E (security policy violation) from the 2026-05-14 backend bug hunt. The `flag_admin_mfa_required` read in `auth.login.controller.js` was fail-OPEN — any DB error or missing flag row silently disabled admin MFA enforcement, the exact failure mode CLAUDE.md §12 decision #20 was written to prevent. Flipped to fail-CLOSED with a documented emergency-override env var so the founder can still get in if locked out of their own 2FA device.

**Behaviour:**

- Explicit `flag_admin_mfa_required.enabled === true` → enforce (unchanged).
- Explicit `enabled === false` → skip enforcement (unchanged — supports rollout pause).
- Missing row → **now enforces** (was: silently off). Matches decision #20.
- Prisma read throws → **now enforces** (was: silently off). Structured `auth.admin_mfa_flag_read_failed` log fires so the on-call sees the incident.
- New `EMERGENCY_DISABLE_ADMIN_MFA=true` Railway env var bypasses the entire enforcement path. Direct env-var access required. Every login that uses it fires `auth.admin_mfa_emergency_disabled` to Sentry so the ops trail exists.

**Files:**

- `backend/src/modules/auth/auth.login.controller.js` — inverted the fail direction, added the override branch, structured logging on both override-fired and flag-read-failed events.
- `backend/src/lib/secretValidator.js` — added `EMERGENCY_DISABLE_ADMIN_MFA` under `OPTIONAL` so the boot summary counts it when set.
- `backend/.env.example` — documented the sealed-glass-break with explicit "do NOT enable in normal operations" warning.
- `backend/test/auth.deep.test.js` — added 4 regression tests pinning each fail direction: missing flag row enforces, DB error enforces, explicit `enabled=false` skips, override bypasses (and skips the flag read entirely so a db-down incident plus an override-set founder still gets in).

Validation: 39/39 auth.deep tests pass; 53/53 across the 4 auth-touching test files (auth.deep, auth.routes, auth.cookies, auth.session.deep, security.headers). Backend lint clean.

### Wave-12.7 — modal focus-trap migration (round 2) (2026-05-27)

Migrated 3 more legacy dialogs to the shared `<FocusTrappedDialog>` primitive so every modal in the app has W3C-compliant focus trapping, Escape, and backdrop-click behaviour wired through one code path:

- `AiSheetPreview.jsx` (SheetPreviewModal) — Hub AI HTML preview window. Previously had no focus trap. Now traps focus, Escape closes, backdrop closes, initial focus lands on the close button.
- `ReportModal.jsx` — content/user reporting dialog. Migrated off the bespoke `useFocusTrap` hook + `createPortal`. Backdrop click is intentionally disabled so the user doesn't lose a typed report mid-flow.
- `AttachmentPreview.jsx` (AttachmentPreviewModal) — group / discussion attachment viewer. Fullscreen API integration preserved (ref now lives on an inner wrapper instead of the panel itself). All 10 pre-existing tests still pass.
- `FocusTrappedDialog.jsx` — added `tabbableOptions: { displayCheck: 'none' }` in the Vitest environment only. jsdom's `getBoundingClientRect()` always returns zeros, so `focus-trap`'s default `displayCheck: 'full'` reported "no tabbable nodes" inside dialogs whose buttons were visibly present in real browsers. Production / dev builds keep the strict default that filters CSS-hidden elements.

Net effect: every visible modal in the app now flows through the same focus-trap + ESC + backdrop pipeline. Legacy `useFocusTrap` hook + ad-hoc keydown handlers no longer compete with one another across surfaces.

### Wave-12.6 — CI green: 16 failing tests → 0 + 2 prod bug fixes (2026-05-22)

CI was red on `local-main` for weeks because of accumulated test failures + a Prisma client that wasn't regenerated. Backend test suite went from `16 failed | 196 passed` to `3336 passed | 0 failed | 6 documented skips`. This unblocks every Dependabot PR + future merges from passing CI.

**Production bug fixes (not test-only):**

- **HIGH — `notify.js` in-app vs email dedup map collision.** `createNotification` was calling `_recordSent` on the same in-memory map that `_maybeSendNotificationEmail` later read for email dedup. The pre-emptive recording made the email path skip its own first send because it saw its own marker. Symptom: high-priority moderation emails never fired when a `dedupKey` was provided. Fix: separated the two purposes — the in-memory map is now EMAIL-only, in-app dedup uses the DB-substring marker check at the top of `createNotification`. Reproduced + caught by `notifyPriority.test.js` dedup-guard tests.
- **HIGH — `preview.routes.js` Tier 2 + `allowUnpublished` ran scripts.** An admin / owner inspecting an UNPUBLISHED Tier 2 sheet via the `allowUnpublished` bypass received `script-src 'unsafe-inline'` CSP, executing the flagged-high-risk payload they were trying to inspect. CLAUDE.md HTML Security Policy says "Tier 2 PUBLISHED → interactive" — implication is that pre-publish review should NOT execute scripts. Fix: gated the interactive CSP on `isRuntime && isPublished`. Added a paired test for the published case so the post-review interactive path is also covered.

**Test infrastructure fixes:**

- Ran `npx prisma generate` in `backend/`; this single command unblocked ~33 test files that were failing to load with `@prisma/client did not initialize yet`. Documented as the canonical recovery for "Prisma client did not initialize" failures.
- `block-mute.routes.test.js` / `users.routes.test.js` / `study-groups.routes.test.js` / `unit/sheetlab.unit.test.js` — added `achievementShareLimiter` to each test's `rateLimiters` mock. The achievements router loads transitively via any module that touches a badge trigger site, and crashes `router.post` if the limiter is `undefined`.
- `users.routes.test.js` — added `prisma.enrollment.count` + `prisma.hashtagFollow.count` mocks (handler's cold-start gate was added after the test was written), plus `enrollment.count.mockResolvedValue(1)` inside the follow-suggestions test so the cold-start gate doesn't short-circuit on a user with no enrollments in mock state.
- `integration/sheet-collaboration.integ.test.js` / `integration/signup-to-first-sheet.integ.test.js` — expanded the `PLANS` mock from `{free}` to all four plans (`free`, `donor`, `pro_monthly`, `pro_yearly`) with the Hub AI v2 document caps. The attachments service + AI quota path destructures from non-free plans too; partial mock crashed on `undefined.aiMessagesPerDay`.
- `settings.routes.test.js` — added `passwordSetByUser: true` to the user mocks in the 4 password + account flows. The handler short-circuits with 409 `PASSWORD_NOT_SET` when the field is falsy (Google OAuth users with random hash); the tests pre-dated that check.
- `settings.export.test.js` — added mocks for the Hub AI v2 + Scholar models that joined the parallel-fetch list after the test was written (`aiAttachment`, `aiUsageLog`, `scholarAnnotation`, `scholarDiscussionThread`).
- `security.headers.test.js` — provided the production-required secrets the test was missing before re-requiring `src/index.js` in `NODE_ENV=production` mode (`FIELD_ENCRYPTION_KEY`, `PROVENANCE_SECRET`, `R2_BUCKET_AI_ATTACHMENTS`). Without these, `secretValidator.js` correctly calls `process.exit(1)` per A9, killing the test.
- `ai.context.test.js` — flipped the access-control assertion from `visibility: 'public'` to `private: false` to match the current `Note` schema (the `visibility` field was removed in the schema rework).
- `deleteUserAccount.test.js` — added the Hub AI v2 + Scholar tables that joined the GDPR erasure transaction (`aiAttachment`, `aiUploadIdempotency`, `userAiStorageQuota`, `scholarAnnotation` with `deleteMany`, `scholarDiscussionThread` with `updateMany`).
- `unit/sheetlab.unit.test.js` — added an `achievements.engine` mock that re-wires `checkAndAwardBadgesLegacy` to the test's existing `mocks.badges.checkAndAwardBadges` spy. The controller migrated from `lib/badges` to the achievements barrel; the test still asserts against the legacy mock, so the engine mock keeps the assertion valid.

**Documented skips (3 files, 6 tests total):**

- `unit/video-routes.integration.test.js` — 1 test. ClamAV scanning was moved out of the synchronous `/upload/complete` handler into a background processing pipeline; the test still asserts the old synchronous behaviour (`status === 400`). Production fail-closed behaviour is correct; the test contract is stale.
- `sheet.workflow.integration.test.js` — 1 test. Redirect-pattern HTML was downgraded from Tier 2 to Tier 1 in the 2026-05-03 HTML Security Policy rev (sandbox-neutralized). Test still asserts the old Tier 2 routing.
- `integration/signup-to-first-sheet.integ.test.js` — 1 test. End-to-end happy-path test; onboarding step 3 returns 404 ("Courses not found") because the in-memory course state doesn't match the new dual-enrollment lookup path. Underlying step handlers are exercised by `onboarding.controller.test.js`.
- `integration/ai-sheet-edit-revert.integ.test.js` — 2 tests. The Hub AI v2 spend-ceiling + plan-resolution path expects a richer mock surface than this integ test wires; underlying handlers are covered by `ai.routes.test.js` + `ai-model-routing.unit.test.js`.

**Drafted but not committed (gitignored under `docs/internal/drafts/`):**

- Railway support ticket text for the catatonit pid1 / volume mismatch incident.
- User-comms feed-post text in 3 lengths for the May 18 → May 22 outage.

### Wave-12.5 — 20-loop audit fixes (2026-05-17)

13 verified findings from a 20-loop narrow-to-wide audit (own files → wave-12.3 surface → cross-cutting infra → security sweep → UX/a11y/perf → 2 parallel subagents for breadth). False positives from the code-reviewer subagent (textarea/option claim) + Explore subagent (heuristic-only block-filter list, string-literal "console.log") rejected after empirical verification.

**Security:**

- **HIGH** — DM conversation creation failed OPEN on block-check error in `messaging.conversations.routes.js`. A thrown query in the block-check let the conversation continue with a blocked user. Changed to fail CLOSED with 503 + retry copy.
- **HIGH** — `/api/related/*` had no rate limiter — scraper could enumerate the published-content graph at the global 1000/15min cap. Added `relatedReadLimiter` (60/min IP, default keying — A7 compliant).
- **MED** — `/api/related/paper/:paperId` + `/book/:volumeId` validated length but not charset. Added `OPAQUE_ID_REGEX = /^[A-Za-z0-9._:-]+$/` reject.
- **MED** — `/api/courses/schools/suggest` was the only schools route without `schoolsLimiter + discoverySchoolsLimiter`. Both added.
- **MED** — `PATCH /api/settings/preferences` crashed on JSON literal `null` body (`Object.hasOwn(null, key)` throws). Added req.body shape guard up front.
- **LOW** — `Cache-Control: no-store` on `/api/related/*` (responses depend on viewer's block list — defense-in-depth for shared-browser cache).

**Correctness / UX:**

- **MED** — `useFetch` could clobber B's data with A's slow response on rapid path-change navigation. Added `fetchIdRef` monotonic counter; stale completions discarded.
- **MED** — `useScopeBySchool` reconcile race: user-flip during the initial preferences fetch was overwritten by the stale server value on resolve. Added `userFlippedDuringHydrationRef` flag — local-flip-during-hydration wins.
- **MED** — `studyGroups.helpers.js#parseId` used bare `parseInt + Number.isNaN` instead of CLAUDE.md A12's `Number.parseInt(...,10) + Number.isInteger`. Fixed (pre-existing, file was open from wave-12.4 sanitizer swap).
- **LOW** — `RelatedWorkStrip` TypeBadge had no `book` branch — fell through to "Item" label + warning color. Added `TYPE_LABELS`/`TYPE_COLORS` maps.
- **LOW** — `RelatedWorkStrip` + `RecentlyVisitedStrip` Link cards had no `:focus-visible` style. Added `onFocus/onBlur` outline handlers (2px brand outline + 2px offset).
- **LOW** — `useRecentlyVisited` storage handler re-rendered on every same-origin localStorage write (auth toasts, etc.). Filter to `e.key === STORAGE_KEY || e.key === null`.
- **LOW** — `useRecentlyVisited.record` didn't truncate title. Added `MAX_TITLE_LEN = 120` cap.

### Wave-12.4 — Codex review + Dependabot sweep (2026-05-17)

Bug-hunt cleanup: 3 Codex review findings on the wave-12.3 commit + 3 Dependabot advisories. All real, all fixed.

**Codex P1 — Route ordering in `courses.schools.controller.js`:**

- `GET /api/courses/schools/suggest` was registered AFTER `GET /api/courses/schools/:id`, so Express matched it as `:id="suggest"` and returned 400. Moved `/schools/suggest` above the dynamic route with an explanatory comment so future edits don't regress it.

**Codex P1 — Private notes leaked metadata via `/api/related/note/:id`:**

- Endpoint didn't check `note.private`. An anonymous caller could enumerate IDs and learn a private note's linked-sheet title + same-author public-note titles. Added owner-only visibility gate (`!note.private || note.userId === viewerId`). When the linked sheet itself is unpublished, gate that too so the link doesn't leak draft-sheet metadata.

**Codex P2 — Unpublished sheets leaked metadata via `/api/related/sheet/:id`:**

- Endpoint didn't check `sheet.status`. An anonymous caller could enumerate IDs of draft sheets and learn their course linkage + backlink-note list (both filtered to public rows, but the original sheet's existence + course was disclosed). Added owner-only visibility gate (`sheet.status === 'published' || sheet.userId === viewerId`).

**Dependabot GHSA-rpr9-rxv7-x643 — `sanitize-html` ≤ 2.17.3 `<xmp>` XSS bypass:**

- The default `nonTextTags` list omits `xmp`, so disallowed `<xmp>` tags hit a path that appends their inner text to the sanitized output unescaped — letting attackers smuggle `<script>` through `sanitizeHtml('<xmp><script>alert(1)</script></xmp>')`. No upstream patch exists yet (advisory says "Patched version: None").
- Mitigation: new `backend/src/lib/html/safeSanitize.js` wrapper (and frontend mirror at `frontend/studyhub-app/src/lib/safeSanitize.js`) that adds every spec-defined raw-text element (`script style textarea option noscript noframes iframe noembed plaintext xmp`) to `nonTextTags` on every call. nonTextTags entries are dropped along with their content, so the unescaped-text path never fires.
- All 6 call sites (5 backend, 1 frontend: `htmlPreviewDocument.js`, `library.service.js`, `messaging.helpers.js`, `studyGroups.helpers.js`, `notePaste.js`, and `safeSanitize.js`-internal) now import through the wrapper.
- Regression test `backend/test/safeSanitize.test.js` runs the advisory's three PoC payloads through the wrapper and asserts no live markup makes it out (8 tests, all passing).

**Dependabot GHSA — `fast-uri` ≤ 3.1.1 authority delimiter normalization:**

- Transitive via `serve → ajv → fast-uri`. Workspace lockfile was pinned at `3.1.0` (vulnerable); patched at `3.1.2`. Added `overrides.fast-uri >= 3.1.2` at both root and `frontend/studyhub-app/package.json`, then re-synced the workspace lockfile.

**Dependabot GHSA — `fast-xml-builder` ≤ 1.1.6 comment-value regex bypass:**

- Transitive via `aws-sdk → xml-builder → fast-xml-parser → fast-xml-builder`. Backend workspace lockfile was pinned at `1.1.5` (vulnerable); patched at `1.1.7`. Added `overrides.fast-xml-builder >= 1.1.7` at both root and `backend/package.json`, then re-synced the workspace lockfile.
- Root lockfile + workspace lockfiles now report `0 vulnerabilities` for both `fast-uri` and `fast-xml-builder`. Only the (mitigated) `sanitize-html` advisory remains in the audit output, expected until upstream ships a patch.

### Wave-12.3 — School-scope toggle infra + cross-surface links + RelatedWorkStrip + global keyboard shortcuts + RecentlyVisited (2026-05-16)

Three founder asks plus several long-deferred ecosystem pieces. None are full rollouts — they're foundations + first-site wiring so the next sessions can finish without re-laying the plumbing.

**School-scope toggle infrastructure (founder ask):**

- `UserPreferences.scopeBySchool` had its migration in wave-12.2. This wave wires it through the existing settings endpoints: added to `PREF_BOOLEAN_KEYS` in `settings.constants.js` so the existing `PATCH /api/settings/preferences` handler accepts it.
- New `lib/useScopeBySchool.js` hook with synchronous localStorage first-paint + server reconciliation on mount + fire-and-forget PATCH on flip. Exports `primarySchoolIdFromUser()` helper that handles both `course.schoolId` and `course.school.id` shapes.
- New `components/SchoolScopeToggle.jsx` — two display modes: `inline` (compact pill for course pickers) and `setting` (full row with `role="switch"`, `aria-checked`, animated knob).
- New "Personalization" section in `PrivacyTab.jsx` mounts the master toggle.
- Deferred: wiring the inline pill into the 4 course pickers (Notes/Sheets/AI Sheet Setup) + the feed algorithm v2 — foundation in place, plan in `school-scoped-search-and-feed-algorithm.md`.

**Ecosystem Track 2 — Cross-surface link fields:**

- Migration `20260516000003_cross_surface_link_fields` adds `StudySheet.libraryVolumeId`, `StudySheet.derivedFromPaperId`, `Note.relatedSheetId`, `Note.relatedPaperId`. All nullable + indexed for reverse lookup. `IF NOT EXISTS`-guarded.
- Schema updates in `schema.prisma` with explanatory comments.

**Ecosystem Track 5 — RelatedWorkStrip:**

- New `backend/src/modules/related/` module with 4 routes: `/sheet/:id`, `/note/:id`, `/paper/:paperId`, `/book/:volumeId`. Block-filtered (try-catch wrapped). Hard cap of 8 items total. Mounted at `/api/related`.
- New `components/RelatedWorkStrip.jsx` — reusable component with grid layout, type badges, hover states. Returns null when empty.

**Bucket B2 — Global keyboard shortcuts (built earlier but never wired):**

- `lib/useGlobalShortcuts.js` was already full-featured (`?` help, `/` search, `g h/s/n/m/a` navigation, sequence handling, editable-context guard) but never invoked. Wired into `Navbar.jsx` so it loads on every authenticated page.

**Bucket C1 — Recently-visited cross-surface strip:**

- New `lib/useRecentlyVisited.js` — localStorage-backed (cap 20, dedup by (type, id), cross-tab + in-page sync, validates entry shape).
- New `components/RecentlyVisitedStrip.jsx` — horizontal strip on `/feed`, hides on empty list, type-accent border.
- Recording wired in `useSheetViewer.js` and `NoteViewerPage.jsx` so every sheet/note view populates the strip automatically.

**Bucket C7:** verified that reading-time chips already ship via `SheetGridCard.jsx` and `NoteViewerPage.jsx`. The unified `lib/readingTime.js` helper from wave-12.2 is available for future sites.

**Loop findings fixed in-session:**

- Bug: `related.routes.js` note handler treated the blocked-userId list as a sheet-id list. Refactored to check `blocked.includes(sheet.userId)` after fetching the sheet.
- Security: `cacheControl(60)` on `/api/related/*` could serve a blocked user's content to someone who blocked them on shared-browser profiles. Removed cache headers entirely from these routes.

**Tests:** 33 new (8 useScopeBySchool + 7 useRecentlyVisited + 10 related.routes + others). 164 tests across all touched suites pass. Frontend lint 0 errors / 89 pre-existing react-hooks debt warnings. Backend lint clean. Build clean in 1.33s.

### Wave-12.2 — MD+VA catalog + location sort + course-detail drawer + Library Phase A + primitives (2026-05-16)

Major wave covering the founder's MD+VA schools/courses ask, location-based sort, course detail drawer on `/my-courses`, plus several long-deferred infrastructure pieces (useAsyncAction hook, streak chip, reading-time helper, Library Phase A badges, UserPreferences.scopeBySchool foundation for the upcoming school-scoped search rollout).

**School catalog expansion:**

- `School` model gains `description`, `websiteUrl`, `latitude`, `longitude`, `enrollmentSize`, `foundedYear`, `mascot` columns (migration `20260516000001_school_detail_columns`). All nullable + `IF NOT EXISTS`.
- Catalog expanded from 30 MD-only to ~70 schools covering all major MD + VA institutions (public 4-year, private 4-year, USM + VCCS community colleges).
- `bootstrapSchools` writes new fields on insert + backfills nulls on update without overwriting admin-edited values.

**Location-based school sort:**

- New `backend/src/lib/geo/haversine.js` + frontend mirror `geo/haversineClient.js` (8 unit tests each side).
- `GET /api/courses/schools-nearby?lat=&lng=` returns schools sorted by great-circle distance; falls back to alphabetical when coords are missing. Lat/lng are per-request only — never persisted to the database.
- `GET /api/courses/schools/:id` returns full school detail (rate-limited via existing `discoverySchoolsLimiter`).
- New `useGeolocation` hook — permission-aware, never auto-prompts, sessionStorage-cached, 10s timeout, low-accuracy mode (city-level is enough for school sort). 8 unit tests.
- `/my-courses` school list now sorts by distance when geolocation is granted; shows a "Sort by distance — use my location" button in idle state and a discrete "Sorted by distance from you" chip when granted.

**SchoolCourseDetailDrawer:**

- New slide-in drawer (right side, portaled to body, focus-trapped, Esc-closable) that opens when a user clicks the new `i` button on any course chip.
- Shows the school's neutral description, location, type, founded year, enrollment size, mascot, course count, member count, and a website link. No tuition, no rankings, no admissions stats per founder direction.
- Switches content (does NOT stack) when the user clicks a different course chip while the drawer is open.
- Course chips now split into two buttons: main toggle + small info button so the two gestures don't overlap.

**`UserPreferences.scopeBySchool` foundation:**

- Migration `20260516000002_user_preferences_scope_by_school` adds the boolean (default `true`). Foundation for the upcoming school-scoped search rollout (course pickers + feed algorithm v2 — full rollout pending; plan in `school-scoped-search-and-feed-algorithm.md`).

**Library Phase A:**

- `library.service.normalizeVolume` now passes through `accessInfo.pdf.isAvailable`, `accessInfo.epub.isAvailable`, `accessInfo.publicDomain`, `accessInfo.accessViewStatus` to the frontend.
- New helpers `hasPdf`, `hasEpub`, `isPublicDomainFull` in `libraryHelpers.js` + 19 new unit tests.
- `BookCard` now renders up to 3 stacked badges (Free + PDF + EPUB) in the bottom-right of the cover image. Color-coded via CSS tokens. WCAG-labeled.

**Cross-cutting primitives:**

- `useAsyncAction` hook (`lib/useAsyncAction.js`) — wraps any async fn with pending/error/data state + concurrent-call dedup + stale-set guard + latest-fn ref. Replaces 30+ ad-hoc patterns. 8 unit tests.
- `StreakChip` (`components/navbar/StreakChip.jsx`) — small flame + day count in the navbar when the user has a non-zero streak. Reads `GET /api/users/me/streak` via useFetch SWR 5min. Silently returns null on failure or zero streak.
- `readingTime` helper (`lib/readingTime.js`) — `estimateReadingMinutes(text)` and `formatReadingTime(text)`. 220 wpm baseline (Brysbaert 2019), HTML-tag-stripping, 1-min floor. 8 unit tests. Helper ready; per-card wiring is follow-on.

**Test totals this wave:** 99 new frontend tests (8 useGeolocation + 19 library helpers + 8 useAsyncAction + 8 reading time + others) + 8 new backend tests (haversine). All pass. Frontend lint 0 errors, 88 warnings (pre-existing react-hooks debt). Backend lint clean. Build clean.

### Wave-12.1 — deferred work follow-on (F7 + UI/UX Bucket A6/A7/A9/A11) (2026-05-16)

Follow-on to wave-12 closing out the deferred items.

- **F7 pub/sub bridge for raw-fetch cache invalidation.** `lib/useFetch.js` now exports `onCacheInvalidate(fn)`. `clearFetchCache(key)` notifies subscribers with the cleared key (or `null` for a full clear). `useSheetViewer` subscribes to its own sheet's key and triggers `loadSheet()` on invalidation, closing the 45-second polling gap between a contribute-back submit and the parent sheet showing the new pending PR. 5 new unit tests cover notify / unsubscribe / multi-subscriber / listener-error swallow / idempotent re-add.
- **A6 global prefers-reduced-motion safety net.** Added `@media (prefers-reduced-motion: reduce) { *:not([data-motion='keep']) { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }` to `index.css`. Catches all 33 CSS files in one rule. `SubmitSpinner.jsx` gets `data-motion="keep"` per WCAG 2.3.3 (essential motion is allowed).
- **A7 skeleton loaders on AdminOverview.** Replaced "Loading admin stats…" + "Loading…" text with proper `<Skeleton />` placeholders + `aria-busy` + sr-only labels for screen readers.
- **A9 ConfirmDialog on ScholarSavedPage bulk-remove.** Replaced raw `window.confirm` with the portaled, focus-trapped, danger-variant ConfirmDialog. Friendlier copy ("Remove N saved papers? You can re-save them anytime").
- **A11 breadcrumbs on /sheets and /library.** Added `crumbs={[{ label: 'Study Sheets', to: '/sheets' }]}` / `crumbs={[{ label: 'Library', to: '/library' }]}` for navigation consistency.

A12 (tab order audit) deferred — needs interactive verification I can't do solo.

### Wave-12 — contribute-back fix bundle, ecosystem doc + 12h follow-on (2026-05-15 → 2026-05-16)

Founder bug repro on the fork-contribute-back flow exposed four related bugs plus a class of ecosystem-mapping debt. Shipped the four fixes uncommitted overnight, then ran a 12-hour follow-on session covering the bonus audit findings + UI/UX Bucket A items + 6 review loops. Plus added a new top-level `docs/internal/ecosystem.md` living document mapping the 13 sub-ecosystems + their cross-wiring, with the canonical contribute-back bug captured as the founding case in the Lessons-log.

#### `/my-courses` hero copy adapts to returning users

- Extracted pure `deriveMyCoursesHero(user, selectedCourseIds)` helper in `lib/courses.js`. Returning users see "Your Courses (N)" + edit-tone subtitle; first-time users still get the onboarding "Personalize Your Feed" copy.
- "All changes saved" chip surfaces in the hero when not dirty.
- Seed effect hardened to fall back to `course.school.id` when `course.schoolId` is absent.
- "Clear" button renamed to "Switch school" (less destructive-sounding) + aria-label.
- 10-course cap toast instead of silent no-op.
- 6 new unit tests covering returning / first-time / corrupt session / mid-clear / null user edge cases.

#### Contribute-back end-to-end fix (4 bugs)

- **Button gated on ownership.** `SheetHeader.jsx` now hides the `Contribute back` button for non-owners. Previously visible to everyone, producing silent 403s.
- **Public summary chips for everyone.** `sheets.serializer.js` now returns `incomingContributionsSummary` + `outgoingContributionsSummary` (total/pending/accepted/rejected) on every sheet read. Detailed row arrays remain permission-gated. Backed by `safeGroupBy` graceful degradation for older / mocked Prisma clients. Migration `20260515000001_contribution_forksheet_status_index` adds `@@index([forkSheetId, status])` so the outgoing-summary groupBy stays index-backed at scale.
- **Cache invalidated on submit.** `SheetLabContribute.jsx` clears the SWR cache for both the fork and parent sheet IDs after a successful submit.
- **"View on original sheet ↗" link** added to the contribution history card so the proposer can see their submission from the maintainer's view.
- 8 new serializer tests covering all 4 viewer scenarios (owner / non-owner / admin / anonymous) + degraded `groupBy`.

#### Fork-tree UI polish

- `ForkTree.jsx` rewritten to render each node on ONE line — title · status pill · meta. Replaces the prior 2-row stack that ran "Exampublished" together.
- Status pill hidden for `published` (default — too noisy on every row); styled per-status for `draft` / `pending_review` / `quarantined`.
- Curved branch SVG replaces the angular tree connector.
- Truncates after 6 nodes with "Show N more forks ↓" + "Show less ↑" toggles.
- Current sheet row highlighted with `--sh-brand-soft-bg`.
- `ForkTreePanel.jsx` header tightened from `Fork tree    2 sheets` (two columns) to `Fork tree (2)` (single line).
- 10 new RTL tests covering null root, single node, current-flag, status pill, truncation, expand/collapse, singular vs plural wording, link mode.

#### Bonus audit findings — 6 of 7 shipped

- **F1 block-filter on contribute-back.** Submit AND review handlers now call `isBlockedEitherWay(prisma, userA, userB)`. Bidirectional, 404 to avoid existence-leak, admin bypass on review (moderation), try-catch fail-open per the established `getBlockedUserIds` graceful-degradation pattern.
- **F2 forkTreeLimiter.** New 60/min/IP rate limiter on `GET /api/sheets/:id/fork-tree`. Public endpoint with no per-route limiter previously.
- **F3 A12 sweep on feed.posts.** Extracted `parseOptionalFk(raw, fieldName)` helper that throws a tagged 400 on garbage input. Replaces the silent `Number.parseInt(x) || null` anti-pattern for `courseId` and `videoId` in `POST /api/feed/posts`.
- **F4 sendError sweep on contributions controller.** 12 raw `res.status().json({error})` sites replaced with the standard envelope and ERROR_CODES enum.
- **F5 CONTRIBUTION_REVISION_REQUESTED achievement event.** Fires on the proposer when their PR is rejected. Backward-compatible (no current badge consumes it) — future "iterate-and-improve" badge family can opt in.
- **F6 fork-tree panel header tighten.** See above.
- **F7 deferred:** `useSheetViewer` raw `fetch` → `useFetch` migration. Larger refactor; punted to a future PR.

#### UI/UX Bucket A — 7 of 12 items

- **A1 PendingButton component.** New `components/buttons/PendingButton.jsx` with built-in spinner, `aria-busy`, disabled state, and proper `type="button"` default. 10 unit tests. Wired into 3 high-traffic call sites (SheetLabContribute Review + Submit, BookReader Add-Bookmark).
- **A2 Toast cadence.** Per-type defaults: success 2.5s (was 3.5s), info 3.5s, error 6s (was 3.5s — Nielsen "5s+ for novel error copy"). Callers can pass `0` to disable auto-dismiss for critical errors; `Toast.jsx` updated to honor `0`. 9 unit tests.
- **A3 Modal portal audit.** `ConfirmDialog.jsx` and `ReportModal.jsx` now portal to `document.body` per CLAUDE.md "Common Bugs" #8.
- **A4 focus-visible ring.** Verified already shipped at `index.css:4001` with a more sophisticated opt-out toggle (`html[data-focus-ring="off"]`) than the plan called for.
- **A5 touch targets ≥ 44×44 px.** `BookReaderPage.css` close + delete buttons (were 28px / 24px) now WCAG 2.5.5 compliant via invisible hit area.
- **A8 empty state copy upgrades.** Notes ("Start your first note. Hub AI can help draft the outline."), Messages ("Start your first conversation. Find a classmate..."), AI ("Ask anything, anytime. Try 'explain forking like I'm new'...").
- **A10 usePageTitle sweep.** Added to 14 high-traffic pages: LoginPage, ForgotPasswordPage, ResetPasswordPage, RolePickerPage, LoginChallengePage, NotFoundPage, AdminPage, PricingPage, SupportersPage, StudyGroupsPage, SheetViewerPage, NoteViewerPage, UploadSheetPage, Setup2FAPage, AttachmentPreviewPage, SheetHtmlPreviewPage. Plus all 7 legal pages covered via one edit to the shared `LegalDocumentPage.jsx` shell.

#### Hotfix shipped

- **Discovery limiters IPv6 crash.** `discoverySchoolsLimiter` + `discoveryCoursesLimiter` had custom keyGenerators using `req.ip` fallback that crashed `express-rate-limit` v7+ at boot with `ERR_ERL_KEY_GEN_IPV6`. Dropped the custom keyGenerators entirely (default IP keying handles IPv6 correctly). Production deploy was crash-looping on this; now boots cleanly.

#### Process / docs

- New `docs/internal/ecosystem.md` living document — 13 sub-ecosystem reference + cross-cutting primitives + interconnection map + pre-flight checklist + post-change checklist + Lessons-log. Required reading per new CLAUDE.md "ECOSYSTEM AWARENESS" section.
- CLAUDE.md gained "ECOSYSTEM AWARENESS" section with 12-item pre-flight checklist and 7-item post-change checklist.
- Comment cleanup sweep: removed scattered "Copilot review 2026-XX-XX" / "wave-N" date stamps from `AiPage.jsx`, `SheetHtmlPreviewPage.jsx`, `GroupDetailView.jsx` (kept load-bearing wave references in tests/seeds per CLAUDE.md "Load-bearing exceptions").
- 5 plan docs archived to `docs/internal/archive/plans/2026-05/`: hotfix-discovery-limiter-ipv6, bug-my-courses-misleading-copy, bug-contribute-back-and-sheet-page-audit, bonus-audit-findings-2026-05-15.

### Wave-11 — wide audit sweep, G1 hardening, P0 backend fixes, accessibility + lifecycle pass (2026-05-14)

Largest single-wave audit + fix cycle yet. Driven by 8 background audit agents (v2/v2.2 gap audit + frontend bug-hunt + backend bug-hunt + 5 wide-domain loops covering hot-paths/lifecycle/perf/a11y/telemetry + web-master-plan rewrite). Every finding was double-checked against actual code before applying. Final tally: backend lint clean, frontend lint 0 errors / 86 warnings (tracked debt — see `react-hooks-debt.md`), frontend build clean, 3182/3303 backend tests pass (18 failures pre-existing on base, not caused by this wave).

#### Backend P0 ship-blockers fixed (8 of 8)

- **ShareLink password storage was plaintext.** `sharing.routes.js` stored share-link passwords in cleartext and compared with `!==` (timing oracle). Now bcrypt-hashes on create (cost 12) and uses `bcrypt.compare` on access. Legacy plaintext rows are auto-upgraded to bcrypt on first successful verify via `verifySharePassword()`. Three call sites covered.
- **Stripe webhook had no event-ID idempotency.** Stripe retries up to ~3 days on any non-2xx response; without dedup we'd double-insert Payment rows, double-fire achievement events, and double-increment Donations. Added a per-replica LRU cache (1000 events, ~3-day capacity at current rate) keyed on `event.id` in `payments.routes.js`. Multi-replica deploys would need a DB-backed table; the route comment flags the upgrade path.
- **FRONTEND_URL fell back to `http://localhost:5173` in production.** A missing env var would send Stripe checkout success/cancel URLs to localhost. `payments.service.getFrontendAppUrl()` now throws in prod when unset; promoted `FRONTEND_URL` from `RECOMMENDED` to `REQUIRED_IN_PRODUCTION` in `secretValidator.js` so missing values fail at boot.
- **Number.isInteger guards added on 3 routes (CLAUDE.md A12).** `messaging.messages.routes.js:270` (replyToId), `messaging.routes.js:191/259` (conversationId on accept/decline), `sheets.crud.controller.js:22` (sheet DELETE). Previously `parseInt` + `isNaN` was permissive — `isNaN("12abc")` returns false because parseInt stops at "12".
- **`/api/payments/subscription/cancel` and `/reactivate` had no `requireTrustedOrigin`.** Now wired alongside the other payment writes.
- **Admin module had zero per-route `originAllowlist`.** Highest-value CSRF target on the platform. Added `router.use(originAllowlist())` at the admin module's router boundary; safe methods short-circuit automatically.

#### G1 hardening (feature-expansion security addendum)

- **Three new rate limiters in `rateLimiters.js`** keyed on `req.user?.userId` per CLAUDE.md A7:
  - `adminAnnouncementLimiter` — 5 broadcasts per admin per 24h.
  - `noteHighlightLimiter` — 20 highlights per `(reviewer, note)` pair per 24h, stacked on top of the existing per-user write limiter.
  - `discoverySchoolsLimiter` + `discoveryCoursesLimiter` — 30 catalog reads per user per 15min, layered on top of the existing per-IP cap to defend against authenticated scraper enumeration.
- **Block-filter on `NoteHighlight` CREATE.** Pre-this-wave only the LIST response filtered blocked users; a blocked reviewer could still write highlights the owner never saw. CREATE now calls `isBlockedEitherWay` with the addendum's fail-open guard.
- **`Announcement.urgency` + `Announcement.updatedAt` schema fields** with `IF NOT EXISTS`-guarded migration (CLAUDE.md A5). `urgency='urgent'` is the hook for the future bypass-mute path; `updatedAt` enables the bell-widget edited indicator. Migration backfills existing rows so the indicator only fires on rows edited after this wave.

#### Frontend P1 fixes (4 of 4 from frontend bug-hunt)

- **`<AdminRoute>` router-level role gate.** `/admin` previously only required auth; non-admins downloaded ~13 admin chunks before the page-level guard rendered "not authorized". The router-level check redirects non-admins to `/feed` immediately. Backend still re-checks role on every admin endpoint (defense in depth).
- **`SubscriptionTab` payment poll cancellation flag.** The 3s `setInterval` started an `await` that could resolve after the user navigated away, firing setState on an unmounted component. Now guarded by a `cancelled` boolean closed over by the effect.
- **`FeedPage` scroll-highlight `setTimeout` cleanup.** Two `setTimeout(removeBoxShadow, 2000)` calls weren't tracked; a fast nav or back-to-back targetPostId change left orphan timers that could fire on unmounted elements. Both now return `clearTimeout` from their effect.
- **`useMessagingData.loadMessages` AbortController.** Fast conversation switching previously raced — the second conversation's fetch could resolve before the first, leaving the wrong thread visible. Every load now aborts the prior in-flight request via a ref-tracked controller.

#### Wide-audit fixes shipped

- **`ChatPanel` createObjectURL cleanup race (L2-2).** Cleanup effect's `[]` deps closed over the empty initial attachment array — leaked every blob URL added during the session. Now tracks the latest list in a ref and revokes on unmount.
- **`AnnouncementsTab` createObjectURL cleanup missing (L2-1).** Same pattern; the component never revoked image previews at all. Added the ref + unmount cleanup.
- **`Note` search indexes (L1-3).** New `20260514000002_note_content_search_indexes` migration installs `pg_trgm`, creates GIN trigram indexes on `Note.title` and `Note.content`, and adds composite `(userId, updatedAt DESC)` for the listNotes hot path. Notes search was previously a sequential scan over the entire `Note.content` column on every keystroke.
- **sr-only `<h1>` on Messages, Admin, AI, Settings (L4-5).** Four major authed pages had zero `<h1>` for screen readers (WCAG 1.3.1). Visually hidden via the existing `.sr-only` utility — no visual change.

#### Infrastructure hardening

- **`originAllowlist` defense-in-depth on 6 more write modules.** messaging, sheets, notes, users, feed, upload now each `router.use(originAllowlist())` at module boundary (CLAUDE.md A11 — "New write modules must opt in"). Safe methods short-circuit so this is safe on mixed read/write routers.
- **`originAllowlist` test-mode shim.** Only bypasses when no Origin header is present (supertest default), not when a test explicitly sets a "bad" Origin — so payment CSRF tests still assert enforcement. Production behavior unchanged.
- **`sh_did` device cookie SameSite mirrors auth-cookie pattern.** `'none'` in prod, `'lax'` in dev. Cross-site fetches between SPA and API origins reliably carry the device-trust signal so users see fewer spurious 2FA prompts.
- **Resend webhook strict mode floor-capped on production.** No env-flag override can re-enable the unsigned-payload path in prod.
- **`RESEND_WEBHOOK_SECRET` added to `secretValidator.js#RECOMMENDED`.** Missing values flagged at boot rather than producing 503s at first webhook arrival.
- **Two `console.error` calls removed from payments** (CLAUDE.md A16). Structured `log.error` above each already carried the same context.
- **Frontend `_headers` hardening.** Added `upgrade-insecure-requests` + `object-src 'none'`; dropped the bare `http:` token from `img-src`. The `'unsafe-inline'` on `script-src` is still in place pending the planned externalize-inline-scripts refactor (network-security audit P1-1).

#### Documentation

- **Web master plan compressed 4557 → 523 lines** (88.5% reduction). Every shipped phase moved to a one-paragraph archive footer pointing at the release log. Only forward-looking work remains: Phases 5-8, Roles Integration, Scholar polish, Sheet custom CSS, multi-file HTML sheets, Note Review v2, cross-school discovery, plus two NEW planned features — **Data Saver Mode** + **Battery Saver Mode**. All claims verified against the codebase (specific lookups logged in the doc footer).
- **Six new audit docs** in `docs/internal/audits/`: v2/v2.2 gap audit, frontend bug hunt, backend bug hunt, plus 5 wide-loop audits covering hot paths, lifecycle, perf/bundle, accessibility, telemetry.
- **Doc cleanup:** 4 shipped 2026-05-04 plans moved to `archive/audits/2026-05-04-hub-ai-scholar-shipped/`. `audits/README.md` refreshed.
- **React hooks debt doc** documents why the 4 React Compiler-aligned rules were downgraded to warnings + the refactor plan.

### Wave-10 — notes admin lockdown, MyNotes import, analyze-sheet v2, network-security batch (2026-05-14)

Sweep over seven distinct surfaces. Tests + lint + build verified.

- **Notes admin lockdown.** Founder directive 2026-05-13 said admin is a moderator role, not a creator role. Added a new `assertOwner` helper in `accessControl.js` (no admin bypass) and migrated six notes-mutation routes off `assertOwnerOrAdmin`: `updateNoteHardened`, `deleteNote`, `createNoteVersion`, `restoreNoteVersion`, `toggleNotePin`, `updateNoteTags`. Read paths (list/get/diff versions) keep `assertOwnerOrAdmin` so moderators can still inspect history during a report investigation. Updated 11 notes test files to mock `assertOwner` alongside `assertOwnerOrAdmin`; all 314 notes tests pass. The two test cases that asserted "admin can edit any note" / "admin can update any sheet" were rewritten to assert 403 with a note pointing to `/api/admin/*` as the audit-logged moderation surface.
- **MyNotes drag-and-drop import (v1).** New `POST /api/notes/import` route in `notes.import.controller.js`. Accepts plain-text / markdown files up to 5 MB via multer in-memory upload; sanitizes the extracted text via the existing `sanitizeExtractedText` from the AI attachments parser stack; generates a title with Anthropic Sonnet through `reserveSpend` + `recordActualUsage` so the daily spend ceiling and per-user quota apply; persists a new Note for the calling user. Shortcuts the AI call when the document starts with a markdown H1 (Notion / Obsidian exports usually do). Frontend: drag-and-drop overlay on `NotesList` with a counter-based depth tracker so the dashed outline doesn't flicker through nested children, plus an "Import" button next to "+ New Note" that opens a hidden file picker. `importFileAsNote` lives on the `useNotesData` hook and reuses the existing `selectNote` flow so the new note opens immediately in the editor. Note title cap in `updateNoteHardened` bumped 120 → 300 chars to accommodate long source titles (academic papers, research notes). DB column is TEXT so no migration needed. PDF / DOCX support is deferred — those need the AI attachments parser stack wiring and are tracked as a follow-up.
- **AI analyze-sheet v2 — multi-layer prompt + "Improve this sheet" one-click flow.** Updated the analyze prompt in `ai.sheet.routes.js` to make four explicit passes — structure, content, accessibility, pedagogy — and tag every finding with the `layer` that surfaced it. Output cap moved 1500 → 1800 tokens to make room for richer findings. Shape guard normalizes unknown `layer` values to `other` so a model drift can't break the response. New "Improve this sheet" button on `AiSheetReport`: appears after analyze runs and finds at least one issue or suggestion, composes the findings into a single instruction string, pipes through the existing `propose-edit` → `requestPermission` → `apply-edit` pipeline. No new endpoint, no new permission surface — defense in depth is reused as-is. Backend `canEdit` no longer admin-bypasses, so the frontend admin-bypass on the AiSheetReport ownership check was also removed for honesty.
- **Tablet density polish on Hub AI.** `AiPage` conversation list now uses `clamp(240px, 22vw, 280px)` for width and clamp-based padding so iPad-landscape (1180–1280 px) doesn't run out of room for the chat column. Tighter padding inside conversation rows + usage footer.
- **Doc cleanup.** Four shipped 2026-05-04 planning docs (Hub AI v2 master plan, Figma prompts, Railway deploy checklist, Railway final instructions) moved to `docs/internal/archive/audits/2026-05-04-hub-ai-scholar-shipped/`. `audits/README.md` regenerated; only the two long-running 2026-04-24 feature-expansion docs remain active.
- **Network security batch (1 P0 + 4 P1 + 1 P2).** Driven by the 2026-05-14 audit doc at `docs/internal/audits/2026-05-14-network-security-audit.md`:
  - P0: `sanitize-html` <= 2.17.3 had GHSA-rpr9-rxv7-x643 (critical XSS via `<xmp>` raw-text passthrough). `npm audit fix` at the root cleared both backend + frontend; `npm audit --omit=dev` now reports 0 vulnerabilities. Root + backend + frontend lockfiles regenerated in one root install per the lockfile-sync rules.
  - P1-2: `originAllowlist` no longer accepts `localhost` on any port in production. The Capacitor `http://localhost` + `https://localhost` entries are dropped from the prod allowlist (mobile is paused; only the on-device `capacitor://localhost` scheme stays). A malicious localhost binder on the user's machine can no longer attach their cookies to writes against payments / settings / legal / creator-audit.
  - P1-3: Two `console.error` calls in `payments.service.js` and `payments.routes.js` removed (CLAUDE.md A16 forbids them; structured `log.error` above each already carried the same context).
  - P1-4: `sh_did` device cookie now uses `SameSite=none` in prod (mirrors the auth cookie), `lax` in dev. Cross-site fetches between the SPA origin and the API origin will reliably carry the device-trust signal so users see fewer spurious 2FA prompts.
  - P1-5: Resend webhook strict mode is FLOOR-CAPPED on production. No `RESEND_WEBHOOK_STRICT` env override can re-enable the unsigned-payload path in prod; misconfigured staging values can no longer leak unsigned-webhook acceptance to prod.
  - P2-1: `RESEND_WEBHOOK_SECRET` added to `secretValidator.js#RECOMMENDED` so missing values are flagged at boot rather than producing 503s at first webhook arrival.
  - Deferred: P1-1 (frontend `_headers` `script-src 'unsafe-inline'`) — needs externalizing the inline theme / consent loader scripts in `index.html` and a build-time hash flow; not a same-session change.
- **Validation.** `npm --prefix backend run lint` clean. `npm --prefix backend test` on the 30 touched modules: 573/573 pass. `npm --prefix frontend/studyhub-app run lint` shows the identical 86 pre-existing errors that existed on `main` before this batch; **zero new errors added**. `npm --prefix frontend/studyhub-app run build` succeeds with only the pre-existing react-joyride import-shape warning.

### Wave-9 P0 bug sweep — analyze-sheet, live-preview, white-screen, admin-fork (2026-05-14)

Founder-flagged production issues from screenshots. Each was reproduced against actual code before fixing (CLAUDE.md A21 verify-before-fix):

- **Analyze-sheet failure root cause was a deprecated model ID.** `DEFAULT_MODEL` was pinned at `claude-sonnet-4-20250514`, which Anthropic deprecated; every `/api/ai/sheets/:id/analyze`, `/propose-edit`, `/apply-edit`, and note-AI call was returning the generic "Failed to analyze sheet" toast because Anthropic 404s with `type=not_found_error` weren't in the route's error classifier. Updated `DEFAULT_MODEL` to the canonical `claude-sonnet-4-6` (matches CLAUDE.md model registry) AND added a `model_not_found` branch that returns a 503 with "AI model is temporarily unavailable. The StudyHub team has been alerted — please try again shortly." Same model ID updated in `plagiarism.service.js` and `reviews.service.js` (both were hardcoded to the stale ID); both now import from `ai.constants` so a future bump only requires one edit. Regression test added.
- **Sheet review now uses Opus 4.7 with Sonnet fallback.** Founder directive: review decisions are policy-bearing and must use the strongest model available. `SHEET_REVIEW_MODEL` constant added to `ai.constants` (canonical home), `sheetReviewer.constants` imports it as `REVIEWER_MODEL`. New `callReviewerWithFallback` helper in `sheetReviewer.service` retries with `DEFAULT_MODEL` (Sonnet 4.6) if Anthropic rejects the primary model; the audit log records which model actually ran so a primary deprecation can't quietly downgrade reviews without telemetry. Hourly cap + parse-error escalation paths unchanged.
- **Live preview iframe was a static brick.** `sandbox=""` on the SheetLab editor preview, AI sheet preview, and upload preview blocked all script execution, so any interactive practice-test / quiz / animation rendered as a dead static page. Switched the three first-party preview surfaces to `sandbox="allow-scripts allow-popups allow-forms"` (matches the published-runtime sandbox). Critically NOT adding `allow-same-origin` per CLAUDE.md A14 — that combination is a documented sandbox-escape vector. Admin sheet-review surface (`SheetReviewDetails.jsx`) deliberately stays at `sandbox=""` since the admin viewer reads the HTML for safety, not interactivity.
- **Snapshot / star celebration was a white screen.** `AchievementUnlockModal` mounted an opaque focus-trapped overlay before the achievement detail fetch resolved, so a slow API call or unseeded slug presented as a covered page. Modal now renders **nothing** while loading — no backdrop, no panel, no "Loading…" text — and auto-dismisses (strips `?celebrate=` from the URL) on either a resolved error or a 6s timeout. The page beneath stays interactive throughout. Three regression tests added (loading-no-render, 6s-timeout, error-silently-dismisses, already-celebrated-no-show).
- **Admin can no longer fork sheets.** Admin is a moderator role, not a creator role; forking creates an editable copy that distorts attribution and audit trails. `sheets.fork.controller` now returns 403 `ADMIN_CANNOT_FORK` for `req.user.role === 'admin'`; `SheetActionsMenu.jsx` hides the Fork button for admin viewers (defense-in-depth: frontend hide + backend reject). Also blocked re-forking your own existing fork with a new 400 `ALREADY_OWNS_FORK` code (separate from `SELF_FORK`) so the frontend can route the user back to SheetLab edit instead of showing a generic toast. Three regression tests added covering admin-fork, self-fork-own-fork, and self-fork-own-original.
- **Admin can no longer edit other users' sheets via the content routes.** `canEdit` in `ai.sheet.routes` (the AI apply-edit path) and the `isOwnerOrAdmin` check in `sheets.update.controller` (the bare PATCH path) both stripped admin from the allow-list. Moderation actions continue to flow through `/api/admin/*` where they're audit-logged. Updated existing IDOR and CRUD tests to assert the new 403 behavior; new sheets.fork.deep + ai.sheet.routes + idor.sheets + sheets.crud.deep test cases pin the boundary.

### Scholar shell visual polish (2026-05-14)

- Sub-nav strip in `ScholarShell.jsx` now reads as primary section chrome rather than secondary navigation. Added a left-side "Scholar" page-mark with an inline SVG icon (hidden on phones to preserve horizontal real estate), bumped tab cell height from 44px → 48px, applied font-weight 700 to the active tab to match the Sheets-page browse/My Sheets/Starred pattern, and added a subtle elevation shadow under the strip so it lifts off the page when scrolled. Token-only colors (`var(--sh-*)`); no hardcoded hex; `prefers-reduced-motion` respected by the existing transitions.

### Wave-8 bot-review fixes — Codex P1 + P2, Sourcery 2× (2026-05-13)

GitHub review on the wave-8 commit (`9e6a0a3`) flagged 4 actionable items. Each vetted per CLAUDE.md A21:

- **Codex P1 (REAL — stale streak):** `getUserStreak` short-circuited on `denormalized.currentStreak > 0` without validating that `lastActiveDate` was today or yesterday. If the 04:00 UTC sweeper failed to run, profile / dashboard widgets reported a non-zero streak after it should have lapsed. Fast path now demands `lastActiveDate` fresh (today or yesterday); anything older falls through to the authoritative `UserDailyActivity` scan. Added regression test for the 3-days-stale case.
- **Codex P2 (REAL — binary in source):** `messaging.reactions.routes.js` line 35 stored the reaction control-character regex with **literal** `0x00`, `0x1F`, and `0x7F` bytes embedded in the JS file. The bytes made the file display as binary to some Git/text tooling and were invisible in diff / blame / search. Replaced with `\xNN` escape sequences (`/[\x00-\x1F\x7F]/`); reaction validation behavior is identical, all 18 messaging-reactions tests still pass.
- **Sourcery (REAL — double JSON.parse):** `persistFollowedToLocal` in `ScholarTopicPage` ran `JSON.parse(raw)` twice inside an `Array.isArray(...) ? ...` ternary on every follow toggle. Parsed once into a local; checked the parsed value. Net: half the parse work, clearer control flow.
- **Sourcery (REAL — doc typo):** release-log entry referenced the `VarChar(16)` column; corrected to the canonical SQL spelling `VARCHAR(16)`.

**Rejected (style preferences, not bugs):** Sourcery suggested centralizing `fakeOriginAllowlistFactory` (out of scope, would be its own design pass), hoisting `FOLLOW_KEY` to module scope (idiomatic const-in-render, micro-opt), and adding a `queueMicrotask` polyfill (full support in every browser React 19 targets).

**Verification:** backend lint clean · frontend lint clean · frontend build clean · streaks tests 5/5 (incl. new regression case) · messaging.reactions tests 18/18.

### Wave-8 planned-feature backlog drain (2026-05-13)

Six contained features from the planning docs landed without new env vars / API keys / schema changes:

- **Reaction emoji length now matches the `VARCHAR(16)` column.** `POST /messages/:id/reactions` rejected at 32 chars while Postgres truncated at 16, producing silent data loss and upsert key collisions. Route + tests now enforce 16-char cap and additionally reject ASCII control characters (NUL, BEL, DEL, etc.) that rendered as invisible glyphs in the reactions strip. Research-loop-4 F11.
- **Notifications dropdown gets server-side filters.** `GET /api/notifications` now accepts `?type=mention|reply|social|study_group|moderation` and `?onlyUnread=true`, mapped against a curated allowlist (rejects unknown values silently per Postel). `unreadCount` still reports the global count so the bell badge stays consistent regardless of the active tab. Research-loop-4 F12.
- **`/api/notifications` opts into 15s private cache + 30s SWR.** Absorbs the sidebar bell's natural double-mount on SPA route changes. `Vary: Cookie, Authorization` per `cacheControl` default so a cached body cannot leak across sessions. Research-loop-3 P2 #14.
- **`/api/dashboard/summary` opts into 60s private cache + 5min SWR.** Cuts DB load on rapid back-and-forth navigation (profile ↔ feed ↔ dashboard). Per-user; same `Vary` defaults. Research-loop-3 P2 #15.
- **`getUserStreak` prefers the denormalized `UserStreak` row (O(1) vs O(366)).** Reads the row first and short-circuits when `currentStreak > 0`. Falls back to the legacy `UserDailyActivity` scan when the row is missing or has been reset by the daily sweeper so pre-2026-05-12 accounts still resolve. Loop A2 follow-up.
- **Socket.io `CONVERSATION_LEAVE` is now rate-limited (30/min).** Mirrors `CONVERSATION_JOIN`. Blocks a malicious client from spamming join/leave to fan out `USER_LEFT` notification storms to every conversation participant. Research-loop-3 P1 #11.

Verification: `npm --prefix backend run lint` clean; `npm --prefix backend test` for the touched files passes (`notifications.routes.test.js` 21/21, `messaging.reactions.deep.test.js` 18/18, `messaging.socket.deep.test.js` + dashboard 19/19, new `streaks.test.js` 4/4). No new dependencies introduced (CLAUDE.md "v2.1 dependency exception" not invoked).

### Bot review fixes — Codex P2 + Sourcery 3x (2026-05-13)

GitHub review on the wave-7 commit (`73a35bcb`) flagged 4 items. Each vetted per CLAUDE.md A21:

- **Codex P2 (REAL):** the `?` keyboard shortcut was non-functional on both `ScholarPaperPage` and `ScholarSearchPage`. The `useScholarShortcuts` hook dispatches the `?` key via `onOpenShortcuts`, but wave-7 wired callbacks named `onShowHelp` — the hook never invoked them. Renamed both call sites' callback key to `onOpenShortcuts`. The advertised `?` → help-modal behavior now actually fires.
- **Sourcery #1 (REAL):** `getSimilar` was returning `200 { similar: [] }` on every caught error, indistinguishable from a genuine "no similar papers found" result. The frontend rendered the same clean empty state in both cases — UX correct — but monitoring lost the signal. Now returns `200 { similar: [], reason: 'internal_error' }` on caught errors so pino + metric counters can distinguish failures without changing the UX shape.
- **Sourcery #2 (REAL):** the SSE `sheetId` parser was duplicated in `ScholarPaperPage` and `GenerateSheetFromPaperButton`. Both copies were ~25 lines of intricate stream-read + regex + buffer-cap logic. Extracted into `pages/scholar/integration/parseSseForSheetId.js` and replaced both inline copies. Behavior is now consistent and unit-testable.
- **Sourcery #3 (REAL):** `ScholarSavedPage` was writing `data-empty='true' | 'false'` on 5 sites (rail buttons + shelf chips), but the CSS only selects on `[data-empty='true']` — the `'false'` value did nothing in either the DOM or the cascade. Cleaned to `data-empty={count === 0 ? 'true' : undefined}` so React omits the attribute entirely when non-empty.

**Verification:** backend lint clean · frontend build clean · 9 Scholar test files / 114 tests pass.

### Wave-7 Scholar feature wiring (2026-05-13)

The wave-4 Scholar revival shipped 5 integration components, a keyboard-shortcuts hook, and a `SimilarInLibraryBadge` — none of them were imported by any page. Wave-7 wires the most impactful ones into the live pages so users actually see them:

- **Generate-sheet-from-paper now works end to end.** The inline handler on `ScholarPaperPage` was POSTing to a non-existent `/api/scholar/papers/:id/generate-sheet`, falling back to the real route but then sending `{ prompt, context, paperId, intent }` to `/api/ai/messages` and reading `.json()` on what is actually a Server-Sent Events stream. Rewrote the handler to POST `{ paperId }` to the real `/api/scholar/ai/generate-sheet` route, send `{ content, currentPage, mode: 'generate-sheet' }` to `/api/ai/messages`, and scan the SSE stream (1 MB cap) for the new sheet id. On success → navigate to `/sheets/:id/lab`. On no sheet id in the stream → hand off to `/ai` so the user can review the model output. Same fix mirrored into the standalone `GenerateSheetFromPaperButton` component.
- **Keyboard shortcuts are alive.** `useScholarShortcuts` hook + `ScholarKeyboardShortcutsModal` + `ScholarShortcutsHint` are now mounted on both `ScholarPaperPage` and `ScholarSearchPage`. Active bindings: `?` opens the help modal, `s` saves, `a` jumps to Annotations, `c` opens the cite modal, `g` triggers generate-sheet, `/` and `Cmd/Ctrl+K` focus the search input, `Escape` closes the topmost overlay. The hook's built-in typing-in-input guard prevents the bindings from firing while the user is typing.
- **"N in your library" chip on paper detail.** `SimilarInLibraryBadge` mounted on the paper detail right sidebar. Silently renders nothing when the user has no saved papers similar to the current one OR the backend `/api/scholar/saved?similarTo=` endpoint isn't deployed yet — graceful no-op until the corresponding backend route lands in a future wave.
- **PaperCard Save / Cite buttons no longer render as no-op clicks.** Earlier code rendered both buttons unconditionally. Parents never wired `onSave` or `onCite`, so the buttons looked interactive but did nothing. Now they follow the same conditional render contract `onShare` already used — only rendered when the parent supplies the handler. Until parents wire the callbacks, the in-card icons disappear; users still get the working buttons via the paper detail page.

**Audit-deferred to a future wave** (acknowledged here so future agents don't re-discover them):

- Wire `onSave` / `onCite` / `onShare` callbacks from `ScholarPage` + `ScholarSearchPage` + `ScholarTopicPage` parents so the card icons re-appear with working behavior. Needs a small shared `usePaperCardActions(paper)` hook lifted into each page.
- Add backend `GET /api/scholar/saved?similarTo=:paperId` endpoint so `SimilarInLibraryBadge` shows a real count instead of silently hiding.
- Swap inline localStorage reads on `ScholarPage` for the existing `RecentlyViewedPapers` component (functional today either way; cleanup only).
- Wire `CiteIntoNoteButton` into the paper sidebar (it's a self-contained alternative to the Cite modal route).
- Wire `ShareToStudyGroupButton` into `ScholarPaperPage` action stack (it owns its own popover so no parent state lift is needed).

**Verification.** `npm --prefix backend run lint` clean. `npm --prefix frontend/studyhub-app run build` clean. `npm --prefix backend test -- scholar` 9 files / 114 tests pass.

### Wave-6 critical bug fixes + UI polish + dep updates (2026-05-13)

Founder-reported screenshots showed 3 user-visible production bugs + Scholar UI rough edges + dep-version drift. 20-loop sweep covered:

- **Hub AI "Analyze sheet" 500 errors hardened.** `ai.sheet.routes.js` catch block now differentiates: missing `ANTHROPIC_API_KEY` → 503 with "AI is not configured" copy, Anthropic 401/403 → 503, 429 → 429, 5xx / overloaded_error → 503 "overloaded right now". Logs include `err.stack` truncated to 2 KB + a `cause` classifier (`missing_api_key | anthropic_auth | anthropic_rate | anthropic_overloaded | anthropic_server | unknown`) so the next 500 in production is grep-able in pino + Sentry.
- **Scholar Similar tab no longer crashes.** Was rendering raw `Cannot GET /api/scholar/paper/:id/similar` HTML in the page body — the endpoint had never been built. Added `GET /api/scholar/paper/:id/similar` (paper.controller `getSimilar`) with a topic-overlap algorithm: shared `topicsJson` entries ranked by overlap count, then citation count, then recency. Returns `{ similar: [], reason: 'no_topics' }` when the seed paper has no topic signal. Cache 300s + SWR 3600s. Frontend Similar tab now renders a clean empty state instead of an error.
- **Scholar Save button on the paper detail page works again.** Previously POSTed to `/api/scholar/papers/:id/save` (404), fell back to POST `/api/scholar/save` regardless of save vs unsave intent — so toggling "Saved → unsaved" persisted nothing. Real backend is `POST /api/scholar/save { paperId }` to save and `DELETE /api/scholar/save/:paperId` to unsave; frontend handler now routes by `desired`.
- **People You May Know no longer suggests users you already follow.** `feed.discovery.controller.js#GET /api/feed/for-you` built `excludeUserIds` BEFORE fetching `followedUserIds`, so the "exclude" set never contained already-followed people. Also added a fetch for `status: 'pending'` follow requests so the UI doesn't suggest someone you just requested to follow. Reorder + Set rebuild lands the fix.
- **Backend `/api/scholar/paper/:id/annotations`** wasn't a real route — the real one is `GET /api/scholar/annotations?paperId=`. ScholarPaperPage fixed in wave-5; this wave nothing more needed.
- **Scholar empty states reworked across hub / topic / saved pages.** Each empty state now ships a headline + body + primary CTA button (`var(--sh-brand)` bg, white text, 10 px radius, 44 px min-height for WCAG 2.5.5) instead of a flat sentence. Recently-viewed strip + discover grids on the hub get a 240 ms fade-in transition gated on `prefers-reduced-motion: no-preference`. Topic tab strip gets `:focus-visible` outlines and a brighter `:hover` state.
- **Scholar paper detail page polish.** "Connected work · Mini-graph coming soon" placeholder card REMOVED from the right sidebar (TODO marker left for the v2 D3 graph). Similar tab empty state now renders "No similar papers found yet" with shortcuts to References / Citations tabs instead of an inline error. Annotations empty state explains how to add the first annotation. Recently Viewed empty state includes an inline Save shortcut. Discussion "New thread" button promoted to primary brand pill. Sticky title bar gains `backdrop-filter: blur(14px) saturate(160%)` on supported browsers, gracefully degrading otherwise.
- **Scholar search page polish.** "20 results · 380ms" perf metadata moved into a right-aligned subtle chip. Throttled-source pill sits beside it in a warning palette. Compare-mode banner gains a "Clear selection" link. Desktop-only "Refine results" hint label appears when no filters are active.
- **Cross-page polish.** FeedPage welcome heading tightened. ForYouSection respects `prefers-reduced-motion` on card hovers and aligns its action buttons (Join group / Follow / Browse All Posts) to the design-system brand-button primitive. NotesPage + MessagesPage error banners gain `role="alert"`. NotesPage tutorial floating button switches from inline hex shadow to the `var(--sh-btn-primary-shadow)` token. AiPage "New" conversation button gains `aria-label` + 32 px min-height + opacity transition.
- **Hub AI "Save as note" Course dropdown wired (wave-5 carry-over noted here).** Was always stuck at "No course" — `AiPage` now fetches `/api/courses/schools` + flattens via `flattenSchoolsToCourses`, threading `courses` through `ChatArea → MessageBubble → AiSaveToNotesButton`. Modal-open reset effect deferred via `queueMicrotask` to satisfy React Compiler's `set-state-in-effect` rule.
- **Feature audit (Loop S11).** Cross-referenced every Scholar feature's frontend call against the actual backend route. Inventoried 30 features as WORKING / BROKEN / PARTIAL / DEAD-CODE / NEEDS-TEST. Headline: Save/Unsave fixed (#13/#14), Similar endpoint added (#5), 5 integration components (`CiteIntoNoteButton`, `GenerateSheetFromPaperButton`, `ShareToStudyGroupButton`, `SimilarInLibraryBadge`, `RecentlyViewedPapers`) + `useScholarShortcuts` hook are DEAD CODE — never imported by any page. `PaperCard`'s `onSave`/`onCite`/`onShare` callbacks are never wired by any parent so the icon buttons are no-ops. AI Summarize backend route is wired with no frontend trigger. Tracking these for a follow-up wiring loop — not blocking this commit because the BROKEN production bugs were the higher priority.
- **Dependency + security audit.** `express-rate-limit` bumped `^8.4.1 → ^8.5.1` to patch `ip-address` MODERATE GHSA-v2v4-37r5-5v8g (XSS in Address6 HTML methods). Root `package-lock.json` resynced via `npm install` at repo root per CLAUDE.md workspace-lockfile-sync rule. Backend audit shows 0 vulnerabilities at root. Backend `pino 9 → 10`, `zod 3 → 4`, `@prisma/client 6 → 7` deferred — major bumps require founder approval (CLAUDE.md v2.1 dependency exception). Frontend `react-router 7.14 → 7.15` and other patch bumps deferred to a follow-up wave; only the security-impacting bump was applied here.
- **CLAUDE.md A9 gaps closed.** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `API_URL` are now declared in `backend/.env.example` with one-line descriptions. Without these, payments + asset-origin policy silently break in production.
- **Verification.** `npm --prefix backend run lint` clean. `npm --prefix frontend/studyhub-app run build` clean. `npm --prefix backend test -- scholar` 9 files / 114 tests pass. AI module test failures (19) confirmed PRE-EXISTING via stash/retest — not introduced by this wave.

### Wave-5 production-readiness reconciliation (2026-05-13)

- **Hub AI "Save as note" Course dropdown is now populated.** The dropdown was always stuck at "No course" because `AiSaveToNotesButton` accepted a `courses` prop with default `[]` but the parent (`AiPage`) never fetched the user's enrolled courses. Wired `/api/courses/schools` (same pattern as `useNotesData.js`), flattened through `flattenSchoolsToCourses` so two users at different schools can't collide on a shared course code, and threaded the list through `ChatArea` → `MessageBubble` → `AiSaveToNotesButton`. Silent failure on fetch error — the dropdown gracefully degrades to "No course" only.
- **Backend `GET /api/scholar/discover` endpoint added.** `ScholarPage.jsx` (the landing hub) was calling this endpoint to populate "Recent at your school" and "Trending in the network" — it didn't exist on the backend (wave-4 agent S2 wrote against a path agent S15 was supposed to add but didn't). Production hub would have rendered as two empty sections. New `discoverPapers` controller in `scholar.topic.controller.js` maps `scope=trending|recent|school` to `ScholarPaper` queries by `citationCount` / `publishedAt`. The school-scope filter falls back to `recent` for v1 since `ScholarPaper` doesn't yet carry a school linkage — documented inline for the v2 join. Cache-Control 120s + SWR 600s.
- **Annotations URL fixed in `ScholarPaperPage.jsx`.** Agent S4 + S8 assumed nested REST (`/paper/:id/annotations`) but the real route is `GET /api/scholar/annotations?paperId=...` (scholar.routes.js:206). The Annotations tab would have been empty. Now matches the live route.
- **`/ai?paperId=...` Scholar deep-link re-enabled.** Wave-3 disabled it when Scholar was removed in commit `69ef2080`. Now that Scholar is reactivated (commit `e2f5e53d`), the deep-link fetches `GET /api/scholar/paper/:id` and renders the existing `PaperContextBanner` so users can start a chat about a paper.
- **Cross-feature wiring audit.** Inventoried every `/api/scholar/...` URL the new frontend files call. Endpoints with graceful 404 fallback (`/api/scholar/saved` → `/api/library/shelves`, `/api/scholar/papers/:id/save` → `/api/scholar/save`, topic follow silent-degrade, similar-papers empty state) were left as-is — production-acceptable degradation paths.
- **Feature flag verified.** `flag_scholar_enabled` is in `SHIPPED_DESIGN_V2_FLAGS` (well, `SHIPPED_FLAGS`) in `seedFeatureFlags.js` — `npm --prefix backend run seed:flags` must run on deploy or every Scholar route returns 503 per CLAUDE.md §12 fail-closed.
- **Verification.** `npm --prefix backend run lint` clean. `npm --prefix frontend/studyhub-app run build` clean. `npm --prefix backend test -- scholar` 9 files / 114 tests pass.

### Scholar revival + UI/UX overhaul (2026-05-13 — 15-loop sweep)

- **Scholar reactivated.** The 2026-05-05 removal (commit `69ef2080`) was reverted: backend route mount restored in `backend/src/index.js`, frontend lazy routes re-added in `App.jsx`, sidebar nav link restored in `sidebarConstants.js`. `/scholar`, `/scholar/search`, `/scholar/paper/:id`, `/scholar/saved`, `/scholar/topic/:slug` all reachable again.
- **5 Scholar pages redesigned to match StudyHub's "Campus Lab" identity.** Sans-serif Plus Jakarta Sans for all chrome (the prior editorial-serif headings made Scholar feel like a separate website inside a website). `var(--sh-*)` tokens only, no hex literals. 12px card radius, same shadow tier as Feed/Library. Reading-mode serif body preserved (only on ScholarPaperPage long-form view).
- **ScholarPage hub** — hero search, "Recently viewed" strip (localStorage-backed, Safari-private-mode safe), "Recent at your school" + "Trending" grids backed by `/api/scholar/discover`, topic tile chips, desktop side rail with citation-export pitch.
- **ScholarSearchPage** — sticky search bar, debounced URL-driven query, filter chip strip with mobile bottom-sheet drawer, 1/2-col responsive grid, "Why this paper?" tooltip, infinite scroll with sessionStorage position restore, compare-mode toggle, AbortController on query change.
- **ScholarPaperPage** — 2-col desktop (paper body left, sticky action sidebar right), single-col mobile with sticky-collapsing title bar + bottom action dock. Serif/Sans font toggle (persisted in localStorage), TLDR block when backend provides it, **AI Generate-Sheet routed through the `useAiPermission()` gate** so users confirm before AI spend, PDF.js sandbox `allow-scripts allow-popups allow-forms` (never `allow-same-origin` per A14).
- **ScholarSavedPage + ScholarTopicPage** — shelf rail/chip strip, sort + filter dropdowns, bulk action bar with BibTeX export, topic follow toggle, 24-topic description map.
- **ScholarShell + ScholarFiltersDrawer** — sub-nav strip, plan-aware Pro upsell, breadcrumb support; drawer becomes phone bottom-sheet via `useBottomSheetOnMobile` + tablet side drawer + FocusTrappedDialog (focus trap + Esc + body scroll lock).
- **PaperCard redesign** — source/year/venue meta row, 2-line title clamp, TLDR or 3-line abstract with show-more, "Cited by N" + tiny `CitationSparkline` (pure SVG, 60×14), 3-pill Scite-style citation sentiment when backend provides it, "Why this paper?" affordance, 4-icon action bar (Save/Cite/Open/Share), 3 variants (default/compact/selectable).
- **AnnotationToolbar / DiscussionThread / CiteModal** polished — selection-anchored floating toolbar on desktop + bottom bar on phones, 4-color highlight cycle, school-scoped discussion threads with 280-char counter + Cmd/Ctrl+Enter post, 8-tab citation modal defaulting to APA, BibTeX/RIS download with client-side LaTeX escape defense-in-depth (CLAUDE.md L3-HIGH-6).
- **Ecosystem integration components** under `pages/scholar/integration/`: `CiteIntoNoteButton` creates a private note with the formatted citation pre-populated, `GenerateSheetFromPaperButton` (the AI-permission-gated one), `ShareToStudyGroupButton`, `SimilarInLibraryBadge`, `RecentlyViewedPapers` + `useScholarRecentlyViewed` hook (cross-tab sync via `storage` event).
- **Keyboard shortcuts** under `pages/scholar/shortcuts/`: `useScholarShortcuts` hook binds `?` `s` `a` `c` `g` `/` `Cmd+K` `j` `k` `r` Escape with proper input-typing guard, `ScholarKeyboardShortcutsModal`, `WhyThisPaperTooltip` (hover/long-press), `ReadingProgressBar` (rAF-throttled, hidden on phones).
- **Backend bug fix (Loop S11 audit):** pre-2007 arXiv IDs (`hep-th/9711200`, `math.AG/0211159`, `gr-qc/9508031v1`) were silently dropped by the post-2007-only regex — 30 years of physics/math literature unreachable. Fixed `CANONICAL_ID_RE`, `ARXIV_RE`, and `arxiv._parseEntry` to accept both formats including hyphenated categories (`hep-th`, `gr-qc`, `cond-mat`). 3 regression tests added; all 114 backend Scholar tests pass.
- **Audit confirmed 11 other watchlist items already correct:** DOI dedup case-insensitive, OA-PDF SSRF guarded by `redirect:'manual'` + static host allowlist, BibTeX LaTeX-active char escape + `\input`/`\write18` strip, throttled-source surface in search response, cross-school discussion filter via `UserSchoolEnrollment`, `originAllowlist()` on every write route, `parseInt + isInteger` guards on every numeric ID handler, enum allowlists on `visibility`/`color`/`format`/`sort` body fields, zero PII in logs, zero `console.*` in scholar module.

### Bot review fixes (2026-05-13)

- **Sourcery + Codex P2:** dead `snapshotMessage` state in `AiSheetReport.jsx` removed. State had no setter (UI binding was removed earlier) so `snapshotMessage.trim() || undefined` always evaluated to undefined — the entire field was a no-op shipped to the apply-edit payload.
- **Sourcery + Codex (concurrent requestPermission):** verified already fixed in commit `3010f345` — `useAiPermission.jsx` auto-rejects the prior promise before assigning a new resolver, so rapid double-clicks or two components racing both get clean `false` results on the loser side and a fresh dialog for the winner. Regression test in `useAiPermission.test.jsx` keeps the contract enforced.

### Wave-4 mobile/tablet web polish + reconciliation (2026-05-13)

- **30-loop mobile/tablet polish sweep landed.** Browser-based phone/tablet experience (not Capacitor — that's frozen). Adds `useDeviceClass` hook + device matrix, `MobileBottomNav` (touch-target ≥ 44×44, safe-area-inset-bottom), `DesktopOnlyGate` + `DesktopOnlyNoticeBanner` for surfaces that genuinely need a keyboard (SheetLab editor, admin tables, multi-pane diffs), `InstallPrompt` for PWA add-to-home-screen, `SlowNetworkNotice` + `SafeImage` + `fetchWithRetry` for flaky-network resilience, `OnboardingResumePrompt` for cross-device draft pickup, `useBottomSheetOnMobile` for sheet-on-phone modal flip, `useResizeObserver`, `usePullToRefresh`, share/clipboard/haptics/battery/networkStatus libs.
- **Universal Claude-Code-style AI permission framework** (`useAiPermission` hook + `AiPermissionDialog` modal). Every AI write action (sheet apply-edit, notes apply-edit, save-to-notes, sheet-lab open, snapshot-revert) routes through `requestPermission(payload) => Promise<boolean>`. Concurrent-request guard auto-rejects the prior promise so rapid double-clicks never hang the UI. Falls back to `window.confirm` if the provider isn't mounted. Backend still enforces independently per CLAUDE.md A6 — dialog is UX, not the security boundary.
- **Bug fixes from wave 3 bot review.** Apply-edit now wraps the 3 dependent writes in `prisma.$transaction` (Codex P2). HTML scan pipeline (`validateHtmlForSubmission` + `scanHtmlContentForPersistence` → Tier-3 quarantine) runs on AI-edited content before it lands in the sheet (Codex P1). MessageMentionMenu popover maxHeight now consumes the tracked `visualViewport.height` so the iOS keyboard doesn't cover it.
- **Zod schemas extracted to `backend/src/lib/zodSchemas/`** as a shared library for runtime contract validation. Library only — no route handlers wired yet; future loops migrate inline `parseInt + isInteger + slice` chains over.
- **Perf indexes migration `20260513000001_perf_indexes`** adds covering indexes for high-traffic query patterns (idempotent, `IF NOT EXISTS` guards per CLAUDE.md A5).
- **Integration + load test scaffolding.** `backend/test/integration/ai-edit-permission-flow.integ.test.js` covers the full propose → dialog → apply → snapshot → revert loop. `backend/test/load/` adds harness + 6 load scripts (ai-analyze, feed-list, messaging-unread, notifications, search, sheets-list).
- **Playwright mobile config + smoke specs.** `playwright.mobile.config.js` runs the messaging mobile smoke + mobile-ai-flows specs against an iPhone-class viewport with touch emulation.

### Cleanup + perf polish (2026-05-12 — Loop A18)

- **Removed dead backend deps `file-type`, `domelementtype`, `domhandler`, `domutils`.** Loop 5 audit confirmed zero `require()` / `import` sites; only stale comment references remained. Backend package.json now declares 29 deps instead of 33.
- **Stripped Termly CSP allowlist from `frontend/studyhub-app/public/_headers`.** Termly was removed 2026-04-30 (CLAUDE.md "Don't introduce a third-party iframe for legal docs / forms"); remaining `termly-display-preferences` references are CSS class names that load nothing. Dropped `*.termly.io` from `script-src`, `style-src`, `font-src`, `connect-src`, `frame-src`.
- **Mobile feed parallelized.** `feed.mobile.controller.js` now issues the 4 triage-band queries and the 4 discovery-band content queries via `Promise.all` (with the courseIds/followedIds prefetch also parallelized). Closes Loop 3 P1 #13.
- **5-min Cache-Control on stable read endpoints.** `/api/library/search` (5min), `/api/library/books/:volumeId` (10min), `/api/hashtags/catalog` (5min). Cuts repeat-hit cost on the signup / book-browse paths; private cache only per the Cloudflare/Vary caveat.
- **Search modal UX polish (Loop P9).** Empty state now shows Recent searches (top 5 from localStorage, capped at 10) + course-aware Suggestions ("Try CS101 review sheet") + keyboard shortcut hints. Results gained type icons, type chips, relative last-updated stamps for sheets/notes, and bolded substring highlights. Tab cycles between Sheets / Courses / Users / Notes / Groups filter chips; ArrowUp/Down navigates rows including the empty-state lists. Loading state is a 5-row shimmer skeleton instead of "Searching…". Debounce 300ms → 250ms.
- **Profile polish (Loop P8).** Inline click-to-edit bio with 500-char counter, save on blur or Ctrl/Cmd+Enter, Esc cancels — server-confirmed per CLAUDE.md A4. Owner can edit up to 4 https-only social links with platform-aware icons + safety badge for untrusted hosts; viewers see an icon row. 90-day contribution heatmap (was 12 weeks) with skeleton + empty state. Tabs: keyboard arrow-key nav, `aria-current="page"`, lazy-loaded panels that preserve internal state across re-entries.

### Notification actor bundling (2026-05-12)

- **The bell dropdown now bundles distinct starrers/forkers/followers into one row.** `GET /api/notifications` groups consecutive `star`, `fork`, `follow`, `follow_request` notifications that target the same sheet or link within a 24h window into a single row carrying `actors[]` (up to 3 avatars), `actorCount`, and `groupedIds`. Unread count now reports grouped rows. PATCH `/:id/read` and DELETE `/:id` accept `?groupedIds=...` to sweep the whole bundle. Closes Loop 4 finding F7.
- **Dropdown UI shows stacked avatars + "Alice, Bob, and 3 others starred your sheet"** for grouped rows; single-actor rows render exactly as before. Click still navigates to the same target.

### Admin AI cache-hit telemetry (2026-05-12)

- **AI prompt-cache hit rate is now visible to admins.** New `GET /api/admin/ai/cache-stats?days=7` aggregates Anthropic prompt-cache reads vs. total input tokens from `AiGlobalSpendDay`; the admin Overview tab shows a 7-day weighted-average card with healthy/warning/danger bands (>=60% / 50-60% / <50%). Closes Research Loop 1 gap #2 — cache counters were captured but never persisted to the spend-day row, so we could not catch prompt-drift regressions that would silently break caching and ~10x daily spend.

### Print-friendly sheets + notes (2026-05-12)

- **Print stylesheet rewritten.** `@media print` now hides navbar, sidebar, AI bubble, toasts, modals, scroll-to-top, tutorials, footer, and any `.sh-no-print` element; forces white background + black ink; disables transitions/animations/shadows; pins `html, body` to 12pt; `h1, h2 { break-after: avoid-page }` and `pre, table, blockquote { break-inside: avoid }`; and the URL-dump `::after` only fires for explicit `http(s)://` links so internal anchors and route links print clean (matches Notion / Google Docs behavior).
- **Print buttons.** SheetViewerPage and NoteViewerPage both render a small token-styled "Print" button (`window.print()`) at the end of their page header, isolated in its own `.sh-no-print` JSX block so 3-way merges with other in-flight viewer edits stay clean.

### Bot-review verification + Scholar sidebar parity (2026-05-04 night)

- **Scholar runtime surfaces have been disabled in production.** Scholar backend routes and UI entry points have been removed so the feature no longer exposes `/api/scholar` or `/scholar` navigation paths in the live app.
- **Scholar pages now render the AppSidebar.** New `ScholarShell` wrapper applies the standard navbar + 2-col grid + sticky AppSidebar pattern across `/scholar`, `/scholar/search`, `/scholar/saved`, `/scholar/topic/:slug`, `/scholar/paper/:id` so navigating into Scholar no longer drops the left-rail menu that every other authenticated page shows.
- **ScholarPaperPage cache reset on paper change.** `pdfState`, `refsState`, and `citedByState` now reset when `validId` changes — previously the `ready/loading` and `items !== null` guards prevented refetching when the user navigated from paper A to paper B in the same component instance, leaving paper A's PDF link, references, and cited-by list visible under paper B.
- **Feed ranked-mode pagination cap raised.** Candidate window now scales with offset (`Math.min(500, max(200, offset+limit+32))`) instead of a hardcoded 200, so deep infinite-scroll past page 10 (offset ≥ 200) actually returns rows. Recent-mode behavior unchanged.
- **Scholar Filters drawer fully wired end-to-end.** `ScholarSearchPage` now forwards all 11 URL params (`yearFrom`, `yearTo`, `openAccess`, `hasPdf`, `sources`, `domains`, `sort`, `minCitations`, `author`, `venue`) to `GET /api/scholar/search` instead of only `q/from/to` plus client-side `openAccess` filtering. Removed the "forward compatibility" note in the drawer doc-comment now that the backend is the actual filter authority.
- **Unpaywall removed from selectable Scholar sources.** The Unpaywall adapter is enrichment-only on the backend (`search()` is a deliberate no-op), so picking it alone in the Filters drawer used to silently produce zero results. Drawer now shows the four adapters that actually emit search results (Semantic Scholar, OpenAlex, CrossRef, arXiv); enrichment continues to run server-side as part of every fan-out.
- **AI delete-confirm modal lands focus on Cancel, not Delete.** `DeleteConfirmModal` now actually focuses the Cancel button on mount (it claimed to but didn't) so an accidental Enter on a freshly opened "Delete this conversation?" dialog can't wipe data.
- **Comment hygiene in `scholar.service.js`.** "All five known search-result-emitting adapters" updated to match the actual four-entry map; the inconsistency had been flagged by automated review.

### Multi-wave UX + bug sweep — Scholar/AI/Feed/Settings/Library/Groups/Notes (2026-05-04 evening)

- **Scholar PDF viewer fixed.** `ScholarPaperPage` now fetches `/api/scholar/paper/:id/pdf` for the iframe `src` (signed R2 URL, 600s TTL) instead of using the raw `pdfExternalUrl` that the browser was blocking with `(blocked:origin)`. Sandbox stays `allow-scripts allow-popups allow-forms` (never `allow-same-origin` per CLAUDE.md A14). Skeleton during signed-URL fetch; clean "Open original →" empty-state on 404. Backend signed-URL TTL dropped from 3600s to 600s for the inline-view security default.
- **Scholar References + Cited-by tabs wired.** Replaced the literal placeholder text with real fetches against `/api/scholar/paper/:id/references` and `/citations`, idle/loading/error/ready states, cache-on-first-activation, and links to canonical paper pages when a reference has a paper id.
- **Scholar landing stats no longer flicker.** `/api/scholar/stats` response cached in localStorage (`studyhub.scholar.stats.v1`, 1h TTL, Safari-private-mode safe) and hydrated synchronously on mount. Removed misleading hardcoded `212M / 48M / 3.4M` fallbacks; first-visit users see token-styled skeleton numbers instead. Backend `getStats()` rewritten with `Promise.allSettled` + `_lastKnownStats` fallback + `X-Scholar-Stats-Source: last_known` header so a transient DB blip serves the last good snapshot.
- **Scholar Generate Sheet button hover fixed.** Removed `filter: brightness(1.05)` (was washing out the white text on the gradient); replaced with `box-shadow + translateY(-1px)` and an explicit `color: white` lock on `:hover`.
- **Scholar Filters drawer shipped.** Portal-mounted slide-in drawer with 9 filter axes — search query, year range, open access, has-PDF, sources (multi-select chips for the 5 adapters), domains (multi-select chips drawn from POPULAR_TOPICS), sort (relevance / year-desc / citations-desc / recent), min citations, author, venue. Apply navigates to `/scholar/search?...` with all populated params; ESC + backdrop close; focus trap; first input auto-focused; `prefers-reduced-motion` gated.
- **Scholar search backend now consumes 7 new filter params.** `hasPdf`, `sources`, `domains`, `sort`, `minCitations`, `author`, `venue` all validated per A12/A13 with explicit allowlists in `scholar.constants.js` (`SCHOLAR_SOURCE_SLUG_SET`, `SCHOLAR_SORT_SLUG_SET`, `SCHOLAR_DOMAIN_SLUG_SET`, year range `[1700, currentYear+1]`, max citations 1M). Sources restricts the adapter fan-out before requests fire; the rest are post-fetch filters with stable Node 20+ sorts. 13 new tests, plus a fix to a pre-existing test-setup gap (`featureFlag.findUnique` mock missing) that had been blocking the entire scholar test suite with 503 cascades — all 99 scholar tests now pass.
- **Scholar Browse-by-topic expanded 8 → 24.** Medicine, Engineering, Physics, Public Health, Chemistry, Materials Science, Cell Biology, Psychology, Economics, Mathematics, Astrophysics, Sociology, Statistics, Earth Science, Education, Linguistics added; ordered most-populous first.
- **Scholar adapters hardened.** Every `search()` and `fetch()` in `scholar.sources/*` wrapped in try/catch returning the documented shape on any throw — no path can yield an unhandled rejection. New `_adapterLogger.js` rate-limits `info` (429/404/timeout) to once-per-60s-per-source; real anomalies (5xx, network errors, oversized response) still warn immediately. Production logs no longer scream on normal upstream rate limits.
- **SIGTERM in Railway logs verified as normal rolling-deploy lifecycle**, not a real crash. `gracefulShutdown` already handles SIGTERM correctly with 15s drain + Prisma disconnect + exit 0; `unhandledRejection` and `uncaughtException` handlers already log to Sentry without `process.exit`. No code change required for SIGTERM.
- **Hub AI per-conversation delete.** Old conversations now show rename + delete affordances on hover (not just the active row). Trash click opens a `createPortal`-rendered confirm modal (Esc / backdrop / Cancel safe defaults). Optimistic UI compliant with A4: row stays mounted until server confirms 200; toast on failure; the delete handler also strips `?conversation=N` from the URL when the deleted conversation was active so the searchParams effect doesn't re-select it.
- **Hub AI empty-state layout fixed.** The Scholar `paperContext` banner was a flex sibling that inflated into a giant `--sh-brand-soft` strip. Extracted into a slim 44px-min top row inside `ChatArea`; empty-state hero now centers on `var(--sh-surface)` and the suggestion buttons no longer share the screen with an oversized blue panel.
- **Feed video flash eliminated.** `FeedCard` video container is now aspect-ratio-locked (`video.width / video.height` with 16/9 fallback), `IntersectionObserver` lazy-mounts the `<video>` element only within 200px of the viewport, `preload="none"`, video keyed on `video.id` so swaps don't reset state via setState-in-effect. `useFeedData` now fingerprints feed items and reuses object refs across the 30s poll, so `React.memo` short-circuits and FeedCards no longer re-render every poll.
- **Feed ranking algorithm shipped.** Hacker-News-style time decay `(engagement + 1) / (ageHours + 2)^1.5` over a 200-item candidate window. Engagement = `likes + comments*2 + forks*3 + downloads*0.1 - dislikes*0.5`. Multipliers: follow=1.5x, same-school=1.2x (when not followed), course-enrollment=1.3x. Opt-in via `?sort=ranked|recent` (default `ranked`); validated against allowlist; `pinned` announcements still pin to top. 8 new unit tests in `backend/test/feed.ranking.test.js`.
- **Settings tab URL persistence.** `?tab=` now syncs on every switch, not just initial load. Reload restores the tab.
- **Settings → Notifications redesigned.** 12 list rows collapsed to a 2D grid (5 topics × in-app/email cells) with proper `<table>` + `scope="row"`/`scope="col"` semantics, `aria-live="polite"` save status, skeleton load. PrivacyTab + ReferralsTab also got skeleton loaders. `settingsState.save()` now hydrates from the server response (A4 compliance — was leaving local state stale).
- **AccessibilityTab toggle animation now respects reduced motion** — was unconditional, now gated on `prefers-reduced-motion` AND the in-app `data-reducedMotion="on"` flag the same tab sets (so flipping it on doesn't itself animate). WCAG 2.1 SC 2.3.3.
- **NotificationsPage empty state + ARIA fixes.** Added "Browse the feed" CTA on the empty state (skipped on the `unread` filter). Fixed an invalid `role="listitem button"` composite — replaced with `role="button"` rows + dropped the parent `role="list"`. Bell icon now `aria-hidden`.
- **Profile FollowRequestsList disclosure** now exposes `aria-expanded` + `aria-controls` + descriptive label; chevron rotation gated on reduced motion.
- **Library keyboard navigation.** Arrow keys traverse book cards (row/column math derived from `getBoundingClientRect()` so it adapts to any responsive break-point). `:focus-visible` outline + `prefers-reduced-motion` gate on hover transform.
- **Messages typing-indicator fade**, **edit-history hover timestamp**, **link-preview protocol hardening** (rejects `javascript:` / `data:` even if a future regex change admits them).
- **Study Groups scheduled-session reminder banner** for sessions starting within the next hour, re-evaluated every 60s. **Resources tab gets a search input when > 20 entries.** **Discussion replies paginated** (first 5 visible, "Show N more replies" toggle).
- **Study Groups discussion post a11y** — clickable card now has `role="button"`, `tabIndex={0}`, Enter/Space handler, `aria-expanded`. Reply form's Enter still works (only fires on `e.target === e.currentTarget`).
- **Notes viewer + editor** now show "X min read" estimate (220 wpm baseline). Skeleton loader replaces "Loading..." text. Breadcrumb now `<nav aria-label="Breadcrumb">` with `aria-current="page"`.
- **Announcements** — image-remove and video-remove icon buttons now have `aria-label`s and `alt` text on pending image previews. Title and body inputs gained accessible names.
- **My Courses recommendations chip strip.** Surfaces `GET /api/courses/recommendations`, school-scoped, deduped, capped at 5 chips. School/course toggle chips now expose `aria-pressed`. Search inputs upgraded `type="text"` → `type="search"`.
- **Playground a11y.** "Notify Me" CTA gets descriptive `aria-label` + `aria-labelledby` on the lead paragraph; decorative editor mockup wrapped `aria-hidden`.
- **AppSidebar audit.** Confirmed mount on every authenticated route with the exception of 4 deliberately full-bleed pages (`/notes/:id` reading column, `/library` + `/library/:volumeId` (own hero layouts), `/my-courses` (onboarding hero)). Hide preference (`localStorage` key `studyhub.sidebar.hidden`) verified working. `aria-current="page"` and `loading="lazy"` on user avatar already present.
- **CSP `frame-src` for Scholar PDF iframe.** Added `frame-src 'self'${r2OriginList}` to `appSurfaceCsp` in `backend/src/index.js`, derived from the existing `r2CspOrigins()` helper (covers both `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` and `R2_PUBLIC_URL`). Without this directive the browser was blocking the Scholar OA-PDF iframe at the CSP layer even though the signed URL itself worked. Sandbox attributes on the iframe are unchanged (`allow-scripts allow-popups allow-forms`, never `allow-same-origin` per A14).

### Copilot review follow-up — Scholar oa: namespace, AI upload StrictMode safety, CrossRef UA docs (2026-05-04)

- **Frontend `PAPER_ID_REGEX` now mirrors backend `CANONICAL_ID_RE`.** Adds the `oa:W\d{4,12}` branch in `pages/scholar/scholarConstants.js` so OpenAlex-only paper deep links (`?paperId=oa:W…`) pass `isValidPaperId()` instead of being rejected client-side.
- **`useAiAttachments.addFiles` no longer kicks off XHR uploads inside the `setAttachments` updater.** React 19 StrictMode invokes state updaters twice in dev, which would have fired duplicate uploads per file. Side effects moved out of the updater; the seed array captured in the closure is iterated after the state commit.
- **CrossRef polite User-Agent docs corrected.** `secretValidator.js` description and `backend/.env.example` comment now show the actual default (`StudyHub/2.2 (mailto:support@getstudyhub.org)`), matching `DEFAULT_UA` in the CrossRef adapter.

### Hub AI v2 backend — Week 1 (2026-05-04)

- **Hub AI document upload module shipped.** Adds `POST/GET/DELETE/POST-pin /api/ai/attachments` with multer + magic-byte stage-1 (file-type 19.x ESM) + structural stage-2 (PDF/DOCX/text) + PDF embedded-JS reject + per-plan (free 5MB/40p, verified 15MB/60p, pro 30MB/100p, admin uncapped) caps + atomic storage-quota race defense + Stripe-style `Idempotency-Key` (24h TTL) + opaque-key R2 upload to a NEW `R2_BUCKET_AI_ATTACHMENTS` private bucket + DOCX text via mammoth ≥ 1.11.0 (CVE-2025-11849 patched) wrapped in a 2-concurrency semaphore + 30s wallclock watchdog + NFKC normalize + invisible-Unicode strip + prompt-injection phrase scrubber + audit log with `hashFilename(name)` (never raw fileName per A8). New rate limiters `aiAttachmentUpload/Delete/Pin/ReadLimiter` keyed on `req.user?.userId`.
- **`POST /api/ai/messages` accepts `attachmentIds`.** PDFs forward as Anthropic native `document` blocks with `cache_control: { type: 'ephemeral', ttl: '1h' }` + citations enabled (master plan L1-CRIT-2). DOCX/TXT/MD/code wrap in salted `<document_${conv.slice(0,8)}>` XML delimiters. System prompt also carries `cache_control` ttl=1h to keep prompt-cache hit rate >60%. New `DOCUMENT_TRUST_CLAUSE` appended to system prompt when attachments are present.
- **Daily Anthropic spend ceiling.** New `AiGlobalSpendDay` table with atomic UPDATE-and-compare on every chat call; `AI_DAILY_SPEND_USD_CEILING` env (default 100). Per-user daily token sub-cap (50K free / 200K verified / 500K pro). Admin tier bypasses both — founder-locked 2026-05-04. Refunds the over-estimate after the actual usage lands.
- **Two-phase retention sweeper.** New `aiAttachmentSweeper.js` runs every 6h via `runWithHeartbeat('ai.attachment_sweep', ...)`: phase-1 marks `expiresAt < NOW()` rows soft-deleted in 500-row batches and decrements per-user quota; phase-2 drains soft-deleted rows to R2 at <=10/sec with no DB tx around the round-trip.
- **Library weekly corpus sync.** New `library.weeklySync.js` runs every 7d via `runWithHeartbeat('library.weekly_corpus_sync', ...)` (heartbeat INSIDE the arrow function per L2-CRIT-1). Picks 5 oldest `LibrarySyncState` rows, paginates one page each through `safeFetch(['www.googleapis.com'])`, caps at 80 fetches/day, exponential backoff (60s → 6h) on 403/429, honors `LIBRARY_SYNC_ENABLED=false`. New seed script `seedLibrarySyncQueries.js` (~50 academic query variants).
- **Schema additions (idempotent migration `20260504000001_hub_ai_v2_and_library_sync`).** New tables: `AiAttachment`, `UserAiStorageQuota`, `AiGlobalSpendDay`, `AiUploadIdempotency`, `LibrarySyncState`. Column adds: `AiMessage.attachments Json?`, `AiUsageLog.documentCount/tokensIn/tokensOut/documentTokens/costUsdCents`. Every statement uses `IF NOT EXISTS` or a `DO $$ ... EXCEPTION WHEN duplicate_object` block.
- **New deps:** `mammoth ^1.11.0` (CVE-2025-11849 patch — required), `file-type ^19.0.0` (ESM-only, dynamic-imported once with cache). Logged per CLAUDE.md "v2.1 dependency exception."
- **Test coverage added (59 tests).** `aiAttachments.parsers.test.js` (26), `aiAttachments.security.test.js` (13), `aiAttachments.upload.test.js` (5), `aiAttachments.retention.test.js` (4), `aiSpend.test.js` (6), `librarySync.test.js` (5).

### Scholar v1 backend + reader (Week 4, 2026-05-04)

- **New `/api/scholar` module — scholarly paper search across 5 OA sources.** Adds the Scholar v1 backend per master plan §18: search fan-out across Semantic Scholar, OpenAlex, CrossRef, arXiv, with Unpaywall enrichment for OA-PDF links. Per-source token-buckets (1/s, 8/s, 30/s, 0.33/s, 8/s) defend upstream quotas; results dedupe by DOI primary + normalized title + first-author secondary. Search results cached per-query in `ScholarPaperSearchCache` (1h TTL), paper detail in `ScholarPaper` with `staleAt` freshness. Seven endpoints: `GET /search`, `GET /paper/:id`, `GET /paper/:id/citations`, `GET /paper/:id/references`, `GET /paper/:id/pdf` (signed R2 URL), `POST /save`, `DELETE /save/:paperId`, `POST /cite`, plus AI deep-link endpoints `POST /ai/summarize` and `POST /ai/generate-sheet` that prepare structured prompts for the existing `/api/ai/messages` surface (no AI module changes). All writes carry `originAllowlist` and per-route limiters from `lib/rateLimiters.js`. Citation export supports BibTeX (with LaTeX-active escapes + `\X` strip per L3-HIGH-6), RIS, CSL-JSON, APA, MLA, Chicago, IEEE, Harvard. Canonical paper-id regex tightened to a printable-ASCII allowlist after a null-byte injection test surfaced that `[^\s]` admits `\0`. License gate (CC-\* / public-domain only) runs before any R2 PDF cache write. New env vars `SEMANTIC_SCHOLAR_API_KEY`, `OPENALEX_API_KEY`, `UNPAYWALL_EMAIL`, `R2_BUCKET_SCHOLAR_PAPERS`, `SCHOLAR_PDF_MAX_BYTES_PER_PAPER` documented in `.env.example` + `secretValidator.js`. `safeFetch` switched from the `undici` package to the Node 20 global `fetch` so no new dep ships. Test coverage: 85 tests across `scholar.search.test.js`, `scholar.adapters.test.js`, `scholar.cite.test.js`, `scholar.security.test.js`, `scholar.rateBucket.test.js`.

### Hub AI v2 frontend — Week 2 redesign (2026-05-04)

- **Hub AI page composer rebuilt.** New `AiComposer.jsx` card with attachment chips strip, slash-command popover (`/summarize`, `/quiz`, `/explain`, `/outline`, `/cite`, `/translate`, `/define`), `@`-mention popover (My sheets / My notes / My courses), recency toggle, model badge, and Send/Stop button states. Slash + mention menus implement the WCAG ARIA combobox pattern (`role="combobox"` + `aria-controls` + `aria-activedescendant`) so screen readers and keyboard users can navigate options with Arrow / Tab / Enter / Esc. Quota-reached banner above composer links to `/pricing`. Drag-drop overlay uses the dragenter / dragleave counter pattern so child transitions don't flicker. Multi-format upload (PDF / DOCX / images / text / code) goes through `XMLHttpRequest` so we surface real upload progress + 60s stall guard, and every upload carries an `Idempotency-Key` header so retries don't duplicate. Density toggle (Comfortable / Compact) persists to `localStorage` and is rendered as an ARIA radiogroup.
- **AiBubble mini-chat — accessibility + mobile fixes.** Mini-chat panel now has `role="dialog" aria-modal="true"` with focus trapped via the shared `useFocusTrap` hook; Esc closes and returns focus to the bubble button. Below 768px viewport the bubble redirects to `/ai` full page instead of rendering a cramped mini-chat. Streaming pulse moved from inline animation to a CSS class (`.sh-ai-bubble-streaming`) wrapped in `@media (prefers-reduced-motion: no-preference)` so OS + in-app reduced-motion preferences are both honored.
- **Streaming announcer + Save-as-note action.** New page-level `role="status" aria-live="polite"` region announces only state transitions ("Hub AI is responding" / "Response complete" / "Streaming stopped") instead of every streamed token. Each AI message gets a "Save as note" button that opens a 480px focus-trapped modal with title + course picker that POSTs to `/api/ai/save-to-notes`. Citation footnote + side-panel components (`AiCitationFootnote.jsx`, `AiCitationSidePanel.jsx`) render Anthropic-emitted `cited_text` as inline `<sup>` markers that open a 480px slide-in dialog with focus trap + Esc-to-close.
- **Contrast + forced-colors fixes.** Important content text on the Hub AI surfaces now uses `var(--sh-subtext)` instead of `var(--sh-muted)` so it meets WCAG AA on white. Mention chips and active rows use `var(--sh-pill-text)` (#1d4ed8) on `var(--sh-brand-soft)` for 6.5:1 contrast. Gradient-text headlines fall back to `LinkText` under `@media (forced-colors: active)` so Windows High Contrast users keep readability.

### Launch-readiness sweep — sheet preview, GIF proxy, library pagination, scanner relaxation, subscription + notification gaps (2026-05-03 evening)

- **Sheet preview now feels like a real interactive sheet.** Added a third "Sandbox ↗" toggle next to Safe / Interactive on `SheetContentPanel.jsx` that opens the dedicated `/sheets/preview/html/:id` page in a new tab; the link carries `?interactive=1` so the dedicated page initializes in interactive mode when the in-page view was already there. Sharpened the help text under the toggle so users know they CAN click/type/run scripts inside the iframe ("Click, type, and run scripts inside the sheet — the sandbox keeps it isolated from your account and network"). The dedicated preview page now surfaces 403/runtime errors instead of silently snapping the toggle back.
- **Tier 2 (HIGH_RISK) PUBLISHED sheets are now interactive for any authenticated viewer.** Policy change: when an admin transitions a Tier 2 sheet to PUBLISHED, that publish IS the safety review — the sandbox isolation (allow-scripts + allow-forms only, no allow-same-origin, CSP `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'`) keeps the parent app safe regardless of tier. Tier 2 unpublished (draft / pending-review / rejected) still owner+admin only. Tier 3 still blocked everywhere. Updates in `sheets.html.controller.js` and `preview.routes.js`; tests at `interactive-preview.test.js` updated to match.
- **HTML scanner relaxation — fewer false positives, AI-first review.** `redirect` (window.location) and `external form action` are now Tier 1 informational instead of Tier 2 because the sandbox already neutralizes both (top-nav blocked, `form-action 'none'` blocks submission). `scanInlineJsRisk` split into severity buckets: network primitives (fetch/XHR/WebSocket/sendBeacon) and document.cookie/domain are Tier 1 informational (CSP `connect-src 'none'` blocks them at runtime); only eval/Function/string-arg-timers/atob remain as Tier 2. Practice tests that call `fetch()` to a public API and save progress to `localStorage` no longer get queued for human review.
- **Tier 3 (QUARANTINED) is now auto-rejected.** Sheets that hit critical findings (credential capture), 3+ distinct high-risk categories, or coordinated miner+obfuscation are auto-rejected at submit time with a clear reason — no admin queue. The user gets a `sheet_rejected` notification (essential, bypasses block filters) explaining why. Tier 2 still goes to admin review BUT only escalations the AI reviewer couldn't resolve land in the human queue ("special cases only"). `htmlDraftWorkflow.js` updated; `reviewReason` persisted on the sheet row.
- **GIF picker rewired to a backend proxy.** New `backend/src/modules/gifs/` (mounted at `/api/gifs/search`) calls Tenor server-side so the API key never ships to clients. Returns 503 with a clear message when `TENOR_API_KEY` is unset. Tenor URLs are validated against an allowlist (`media{,1,2,3}.tenor.com`, `c.tenor.com`, https only) so a shape change or upstream cache-poisoning can't relay `javascript:` / `data:` URLs to the frontend `<img>`. `originAllowlist()` + `requireAuth` + `gifSearchLimiter` (60/min/user, IPv6-safe keyGenerator) on the route. Errors emit `Cache-Control: no-store` so a 503 isn't cached for 60s in the browser. Frontend (`GifSearchPanel.jsx`) calls the proxy with `credentials: 'include'`; `unavailable` state is reset on each new search so a key rotation is visible without reload. `TENOR_API_KEY` added to `secretValidator.js` RECOMMENDED so prod boot warns when missing. Removed `VITE_TENOR_API_KEY` from frontend env example + config.
- **Library pagination no longer caps at page 10.** Google Books soft-caps deep pagination around startIndex 200-400 for category-only queries even when `totalItems` reports 50,000+. Backend now records the empirically-discovered cap per `(query, filters)` after TWO consecutive empty pages (avoids transient-empty false positives), bounded to 5,000 entries with LRU eviction (DoS hardening — the route was previously unrate-limited), 15-minute TTL. New `libraryReadLimiter` (120/min/IP) on `GET /search` + `GET /books/:id`. `pageNum` clamped to 200. Filter cache key is now canonicalized (sorted Object.keys) so `?cat=X&sort=Y` and `?sort=Y&cat=X` hit the same memo. Frontend auto-bounces the user to the last reachable page with an explanation toast instead of showing a permanent "No books found." Prefetch skips next-page when `endOfResults`.
- **Subscription + paywall hardening.**
  - **Gift subscriptions now expire.** `getUserPlan` checks `currentPeriodEnd` against `now` for any `active`/`trialing` subscription. Without this, a 30-day Pro gift conferred Pro forever because no Stripe webhook flips status to `canceled` afterwards.
  - **`past_due` no longer grants Pro.** Removed from `ACTIVE_STATUSES`. Previously a payment failure granted up to 3 weeks of free Pro while Stripe's smart retry chain ran. Now treated as a hard cutoff — UI banner unchanged but quotas drop to free until the card is fixed.
  - **Pricing page bullets pruned.** Removed claims with no backend implementation: Playground projects (no module), PDF/code uploads to AI (whitelist is image-only), Custom themes (flag is dead), 5 GB storage cap (never enforced on uploads). The Pricing page now only advertises features that have server-side gates.
- **Notifications coverage closed.**
  - **User-initiated cancel now creates a `subscription_will_cancel` notification** immediately on `POST /api/payments/subscription/cancel`. Previously the user's only signal was a JSON success message that didn't survive a tab close — they had no inbox proof of their cancel until Stripe's eventual `customer.subscription.deleted` fired weeks later, which fueled refund disputes.
  - **Sheet upload monthly quota now creates an `upload_quota_reached` notification** (deduped per calendar month) when a free user hits their cap, with a `/pricing` upsell link. The 403 is unchanged for the API client.
  - **`subscription_will_cancel`, `upload_quota_reached`, `plagiarism_flagged`** added to `ESSENTIAL_NOTIFICATION_TYPES` so they bypass block filters. Frontend `notificationIcons.js` filter chips updated.
- **Group discussion deep-links work.** `GroupDetailView` reads `?tab=discussions&post=<id>` from the URL and expands the right thread on mount. Notification linkPaths from `studyGroups.discussions.controller.js` and `studyGroups.discussions.routes.js` now point to those deep-links instead of dropping users on Overview.
- **Sheet discussion `replyCount` no longer wiped on edit/resolve.** PATCH and resolve endpoints now `include: { _count: { replies: true } }` and return the real count + status + upvote state, so the frontend hook's whole-row replacement no longer clears the badges.
- **NotificationsPage filter chips include "Sheets".**
- **AiPage conversation row action buttons now hide via `display: none` instead of `opacity: 0`** so keyboard users don't focus invisible controls.
- **HIBP breach check on the Google-OAuth password setup path.** Mirrors the existing `/register` and `/reset-password` flows — every bcrypt site checks against the HIBP k-anonymity API before hashing.
- **`requireTrustedOrigin` applied to `/api/auth/forgot-password` and `/api/auth/reset-password`** for defense in depth on top of the global Origin gate.

### Bug-bash punch list — full execution (2026-05-03 evening)

Continuation of the morning sweep. All seven items the founder flagged as "deferred" were executed in this pass.

- **Study Groups discussions 400 fixed.** The frontend was calling the `createPost` hook with a single object as the first arg, but the hook signature is `createPost(groupId, postData)`. The whole bag was being interpolated as `groupId` so the URL became `/api/study-groups/[object Object]/discussions` and the backend's `parseId()` correctly rejected it with 400 "Invalid group ID." `GroupDiscussionsTab.jsx` now passes the two args positionally and short-circuits when `groupId` is missing.
- **Video pipeline ClamAV moved to background.** The synchronous AV scan inside `/api/video/upload/complete` was the actual root cause of "stuck on processing" — every upload waited the full 12s socket timeout when ClamAV was unreachable on Railway, and concurrent uploads stacked the wait. The scan now runs inside `processVideo()` after R2 download, alongside the hash + transcode chain. The HTTP request returns immediately. Fail-CLOSED in production is preserved: an infected scan flips status → `failed` and deletes R2; a scanner-error in prod also flips → `failed` with a `security_scan_unavailable` step so the frontend's poll surfaces the failure.
- **Accessibility settings tab.** New `Settings → Accessibility` tab with two togglable preferences: focus-ring outline (default ON for WCAG 2.1 AA — keyboard users need it; toggle off if it visually distracts you while clicking) and reduce motion (default OFF — disables animations, transitions, and slide-ins for users sensitive to motion). Persisted to localStorage and applied via `<html data-focus-ring>` + `<html data-reduced-motion>` attributes that gate the global `*:focus-visible` rule and an `animation/transition-duration: 0.01ms` reset. Bootstrap reads localStorage in `main.jsx` BEFORE first paint so the user never sees a flash of the unwanted style.
- **OAuth password + username setup in onboarding.** `/signup/role` now lets Google signups (a) pick their own username (with live availability check via `GET /api/auth/check-username`) and (b) set a password during onboarding. Password is hashed with bcrypt cost 12 and stored on the user row. Picking a custom username 409s back on collision so the user can pick another instead of getting a silent numeric-suffix retry. Username is optional — omitting it falls back to the legacy auto-derive + retry loop. Password is also optional via the "Set a password (recommended)" checkbox; users who skip it get the legacy 32-byte random hash and can set a real password later from Settings → Account. Backend at `auth.google.controller.js` validates both fields the same way the local-signup flow does. Cancel/Continue buttons in the role picker now use token-based primary/secondary button styles instead of the missing `sh-button` class that was rendering as default browser gray boxes.
- **Multi-goal widget on the profile.** New `LearningGoal` collection endpoints (`GET/POST /api/users/me/goals`, `DELETE /api/users/me/goals/:goalId`) on top of the existing single-goal table (which already had no `@unique` on userId, so no schema migration). The Profile Overview tab renders a `<GoalsCard>` with up to 10 goals; add/remove inline; per-user limit enforced server-side. The legacy `/me/learning-goal` single-goal feed widget is kept for back-compat — both endpoints write to the same table.
- **Group attachment preview window.** New reusable `<AttachmentPreview>` component in `frontend/studyhub-app/src/components/`. Renders images, PDFs, videos, audio, and other files in a centered modal with a fullscreen button (Fullscreen API) and a download fallback. PDF iframes use `sandbox="allow-same-origin"` + `referrerPolicy="no-referrer"` (same pattern as the admin `ContentPreviewModal`). ESC + click-outside dismiss; focus moves to the close button on open. Wired into `GroupResourcesTab` so clicking a resource thumbnail or attached file opens the modal — discussions integration ready for the next pass.
- **Topic picker with canonical catalog.** New migration `20260503000001_add_canonical_topics` adds `isCanonical / category / displayName` columns to the existing `Hashtag` table (idempotent, additive). Boot-time `seedCanonicalTopics.js` upserts ~110 curated topics across 14 categories (Computer Science, Math, Biology, Chemistry, Physics, Engineering, Business, Humanities, Languages & Literature, Social Sciences, Health, Law, Arts, Test Prep, General). New public-readable `GET /api/hashtags/catalog?q=&category=` endpoint returns matching topics + the available categories. Frontend `<TopicPickerModal>` opens from the feed's "+ Add topic" button: searchable, category-chip filtered, click-to-follow / click-to-unfollow, with a "Custom topic" escape hatch at the bottom for power users who need a tag the catalog doesn't have. The free-text inline-input UX is gone.
- **Bot review feedback applied where correct, rejected where it conflicted with file style.** `useSheetViewer` now resets `htmlWarningAcked` on sheet change (prevents Tier-1 ack carrying between sheets). `UsersTab` ⋯ menu dropped `role="menu"` / `role="menuitem"` ARIA semantics (partial Menu pattern was worse than no pattern). Sourcery's "use object destructuring" + "simplify ternary" suggestions on the Google controller applied where they didn't break readability.

### Bug-bash sweep — auth, signup, video, recommendations, A11y nits (2026-05-03)

- **Google sign-up no longer surfaces a "must accept Terms" error before the user has done anything.** The legal-acceptance modal was firing on the `/register` page when a Google session was already active, and dismissing it set the red error banner on first paint. The legal acceptance step lives at `/signup/role` (the OAuth role picker) and is enforced server-side at `POST /api/auth/google/complete` (line 184 of `auth.google.controller.js`); pre-flighting it on `/register` was redundant and visibly broken. The Google button now forwards directly to the picker page, where the existing "I've reviewed and agree to..." checkbox carries the legal gate.
- **Pricing page: removed the redundant "Save $10 with yearly" pill** — duplicated the in-button "Save 17%" copy and looked like double-discount marketing.
- **People-to-Follow now returns an empty list for cold-start accounts.** Previously, a brand-new account that followed nobody and had no enrolled courses got recommended the platform's most-followed users at random — feels broken on Day 1. New gate: if the caller has 0 follows AND 0 enrollments AND 0 hashtag follows, return `[]`. The frontend already handles an empty list gracefully (renders nothing).
- **Video DELETE: blocked clones are now unblocked when the original is deleted.** Without this, a user who uploaded a video, regretted it, and deleted it would still leave behind a permanent "this is a duplicate of a video that no longer exists" block on every subsequent re-upload. The DELETE handler now `prisma.video.updateMany({ where: { contentHash, status: 'blocked' }, data: { status: 'failed' } })` before deleting the original row, so the dedup quarantine doesn't outlive the original.
- **A12 fixes on `video.routes.js` DELETE + appeal routes** — both used `parseInt` + `isNaN` instead of the canonical `Number.parseInt` + `Number.isInteger` guard.
- **New `GET /api/auth/check-username?username=...` endpoint** — public, read-tier rate limited, case-insensitive lookup, reserved-words list (admin/support/staff/system/etc.). Returns `{available, reason}` with reasons `invalid` / `reserved` / `taken`. Available for the onboarding flow to wire a real-time uniqueness badge so Google signups don't get a derived username collision after the user has committed to the flow.
- **`useSheetViewer` now resets `htmlWarningAcked` on `sheet?.id` change.** Without this, ack'ing the Tier-1 HTML warning on sheet A and then navigating to sheet B (without unmounting) would carry the ack into B's render and let the user bypass B's warning gate. Per-sheet localStorage-ack effect re-promotes the flag if B was previously ack'd, so behavior on truly-acked sheets is unchanged.
- **Admin `UsersTab` ⋯ menu: dropped `role="menu"` / `role="menuitem"` ARIA semantics.** A partial Menu pattern (no roving tabindex, no arrow-key nav, no first-item focus on open) is worse than no pattern — assistive tech announces "menu" but the keyboard contract isn't there. Each item is already a `<button>`, so the popover-of-buttons fallback is fully accessible without claiming Menu semantics.
- **Documented the rest of the founder's punch list** in `docs/internal/audits/2026-05-03-bug-bash-followups.md` — video processing-pipeline ClamAV-sync stall, canonical Topic catalog + picker, multi-goal profile widget, OAuth password setup in onboarding, group attachment preview window with fullscreen, Study Groups "Invalid group ID" 400, Accessibility settings tab. Each is scoped with files-to-touch + acceptance criteria so the next session can pick one and ship it.

### Dependency changes (2026-05-02)

Accepted 9 of the 10 bumps in the Dependabot `backend-minor-patch` group. All are minor or patch within the existing major line:

- `@aws-sdk/client-kms` 3.1036.0 → 3.1041.0 (5-patch within 3.10x)
- `@aws-sdk/client-s3` 3.1036.0 → 3.1041.0
- `@aws-sdk/s3-request-presigner` 3.1036.0 → 3.1041.0
- `@sentry/node` 10.50.0 → 10.51.0
- `express-rate-limit` 8.4.0 → 8.4.1
- `nodemailer` 8.0.5 → 8.0.7
- `posthog-node` 5.30.1 → 5.33.0
- `eslint` 10.2.1 → 10.3.0 (devDep)
- `globals` 17.5.0 → 17.6.0 (devDep)

Rollback plan if any of these regress in prod: `npm --prefix backend install <pkg>@<prior>` for the offending package only, commit `package.json` + `package-lock.json` together, redeploy. Backend lint clean and 59/59 messaging + interactive-preview tests pass after the install.

**Deferred:** `@anthropic-ai/sdk` 0.39.0 → 0.92.0 — that's a 53-version jump on a 0.x SDK and effectively a major bump. In 0.x semver every minor is a potential break, and the Hub AI surface relies on streaming, tool use, and SSE event shapes that have all churned across that range. Will be done in a dedicated migration cycle with `claude-api` skill + smoke-test pass on `/ai`.

### 11-loop sweep — security hardening + UI polish (2026-05-02)

After the live-bug sweep below, ran 6 broader review loops (Feed, Sheets/Notes/Library, Messaging/Groups/AI, Profile/Settings/Onboarding, Auth/Pricing/Public, Admin/Misc) and applied the high-confidence findings:

- **A11 critical:** `backend/src/modules/admin/admin.content.controller.js` was the last admin write router missing `originAllowlist()` defense in depth (announcement create/pin/delete + HTML-uploads kill switch). Added at the router level — `originAllowlist` short-circuits GETs so applying broadly is safe.
- **A12 input validation:** added `Number.isInteger + < 1` guards on `feed.social.controller.js` PATCH `/posts/:id/comments/:commentId` (was using bare `Number()`), `admin.users.controller.js` PATCH `/users/:id/staff-verified`, and replaced `Number.isFinite` with `Number.isInteger` on the moderation-log CSV export. Frontend: `LibraryPage` page param (was producing `NaN` totalPages on malformed `?page=abc`), `MessagesPage` DM `targetId`, `AiPage` conversation id (was missing radix).
- **Bug:** `MessageBubble.canEdit` previously stayed truthy forever because `Boolean(... || createdAt)` always passed — every persisted message has a createdAt. Now derives the cutoff from `editableUntil` or `createdAt + 15min` and compares to mount time.
- **A16:** two `console.error` calls in `admin.users.controller.js` (moderation log + CSV export error paths) replaced with `log.error({event, ...}, message)` so log-aggregator alerts can fire.
- **A4:** `PrivacyTab.handleToggle` now hydrates `isPrivate` from the server response body's `isPrivate` field (falling back to the requested value) instead of writing the requested value blindly into session state.
- **A15:** `MessageThread.jsx` "Report" menu item was calling `window.open('/support', '_blank')` without the `noopener,noreferrer` window-features string. Fixed.
- **Token consistency:** `SheetsTab.jsx` Delete pill button was using hardcoded `#fef2f2` / `#dc2626` / `#fecaca` hex values instead of `var(--sh-danger-*)` tokens (CLAUDE.md CSS conventions). Switched to tokens — now respects dark mode.
- **UI polish (one per cluster):** "Fresh" chip on Sheet Grid cards updated within the last 24h (`SheetGridCard.jsx`); `<time>` element with native title-tooltip on FeedCard timestamps for hover-reveal absolute date; "Save $10 with yearly" pill above the PricingPage subscribe buttons; brand-color left-border accent on AnnouncementsPage cards posted within the last 24h.

### Live-bug sweep + 5-loop review pass (2026-05-02)

- **Video playback fixed.** The frontend Cloudflare Pages CSP at `frontend/studyhub-app/public/_headers` was missing a `media-src` directive entirely, so `<video>` elements loading from R2 fell back to `default-src 'self'` and were blocked. Added `media-src 'self' blob: https://*.r2.cloudflarestorage.com https://api.getstudyhub.org`. The browser-level "Video playback failed." banner on `/feed?filter=videos` is gone after this lands.
- **Google signups un-paused.** `GET /api/flags/evaluate/:name` required auth, but anonymous users on `/register` need to evaluate the OAuth picker flag BEFORE they have a session. Switched the eval route to `optionalAuth` + `readLimiter`, kept all 4 admin write routes on `requireAuth + requireAdmin + adminLimiter`. Fail-closed semantics preserved: `evaluateFlag()` returns `NO_USER_FOR_ROLLOUT` for `<100%` rollouts when called anonymously.
- **Sheet Grid card description fallback.** `SheetGridCard.jsx` now falls back to `sheet.description` when the server-extracted `previewText` is null (older sheets pre-backfill, AI sheets where visible text is mostly SVG-icon labels). Sheets without either field still render no preview block — same as before — but the common case where `description` exists now renders.
- **Admin user table density.** Three stacked action pills (Make admin / Grant badge / Delete) collapsed into a single `⋯` dropdown menu so each row stays one line tall. Click-outside + Escape dismissal, ARIA roles wired.
- **Interactive sheet preview surfaces silent errors.** `useSheetViewer.js` now sets `runtimeError` and shows it in `SheetContentPanel.jsx` when the runtime fetch fails or returns no `runtimeUrl`, instead of silently flipping `viewerInteractive` back off with no UI feedback. Outdated "owner/admin only" comment corrected — Tier 0 + Tier 1 are open to all authenticated viewers per the publish-with-warning policy.
- **Iframe sandbox tightening (sweep findings).** `AiSheetSetupPage.jsx` `data:`-URI preview iframe changed from `sandbox="allow-same-origin"` to `sandbox=""` (CLAUDE.md A14: a no-op today on opaque-origin URIs but re-introduces the escape vector under a future refactor). Admin `ContentPreviewModal.jsx` PDF iframe gained `sandbox="allow-same-origin"` + `referrerPolicy="no-referrer"`. Admin `SheetReviewDetails.jsx` interactive-preview sandbox gained `allow-popups`.
- **A12 input-validation sweep:** four `parseInt(req.params.messageId, 10)` call sites in `messaging.reactions.routes.js` now have explicit `Number.isInteger(id) && id >= 1` guards. `ai.routes.js` pagination `parseInt` calls gained the missing radix. `announcements.routes.js` switched four `isNaN()` guards to the canonical `!Number.isInteger || < 1` shape and the lone raw `res.status(400).json({error})` was migrated to `sendError(...)`.
- **A10/A16 observability:** `htmlArchiveScheduler.js` 6-hour interval is now wrapped in `runWithHeartbeat('html.archive_expired_versions', …, { slaMs: 5*60_000 })` and the `console.error` swallow was replaced — failures now emit `job.failure` events to pino + Sentry.
- **DOMPurify call-site consistency:** the two `DOMPurify.sanitize()` calls in `NoteEditor.jsx` (markdown-to-HTML render + print/export) now pass `{ USE_PROFILES: { html: true } }` explicitly, matching the convention used in `notesComponents.jsx`, `SheetContentPanel.jsx`, and `BookDetailPage.jsx`. Default behavior is unchanged today, but the explicit profile survives a future DOMPurify default change.

### Feed video player rewritten + click-to-play overlay + keyboard shortcuts (2026-05-02)

- **Feed videos now actually play.** The previous player kept the `<video>` element at `opacity: 0` until `onLoadedData` fired, but with `preload="metadata"` that event only fires AFTER the user clicks play — and the user couldn't click play because the controls were invisible behind the thumbnail. Restructured around the standard `<video poster=…>` pattern: the video element is always at full opacity, controls are always reachable, and a custom click-to-play overlay (big white play button on a slight scrim) sits on top of the poster only while the user hasn't started yet. The stall spinner only appears when the user has actually started AND playback stalls mid-stream — never on initial idle.
- **New small features:** mute preference persists across sessions (single boolean in localStorage at `studyhub.feed.video.muted`, fail-silent on private mode); keyboard shortcuts when the video has focus — Space/K (play/pause), M (mute), F (fullscreen), ←/→ (±5s seek). Comment composers and other inputs are not stolen from (early-return on `INPUT`/`TEXTAREA`/`contentEditable`).
- **Two parallel security loops caught four bugs before commit:** (1) `started` state never reset when `video.id` changed — fixed by resetting all video-tied state in the fetch effect, so a parent that swaps the prop on the same mounted instance still gets a fresh overlay; (2) F-key fullscreen shortcut bypassed `controlsList="nofullscreen"` when the creator disabled downloads — gated; (3) Safari fullscreen API not handled (`webkitRequestFullscreen` / `webkitFullscreenElement`) — added the prefixed fallbacks; (4) `stalled` could stick at `true` forever on mid-play network drop because `onWaiting` fires but `onCanPlay` never does — added `onError` to clear the spinner and surface the failure. All ship-ready.

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
