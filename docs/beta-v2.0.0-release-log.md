<!-- markdownlint-disable MD007 MD010 MD022 MD032 MD036 -->

# Beta v2.0.0 Release Log

## Date: 2026-04-15

### Notes Hardening v2 — local-first persistence, conflict resolution, diff/restore (feature flag)

**Fixes the long-standing "saved but empty" and "leave page lose work" bugs in the Notes editor by replacing the broken stale-closure autosave with a local-first state machine, IndexedDB draft cache, server-authoritative revision concurrency, and a non-destructive version diff/restore flow. Behind `flag_notes_hardening_v2`, default off; legacy autosave preserved as fallback.**

#### Schema (migration `20260415000001_notes_hardening`)

- `Note.revision` (Int default 0) — monotonic counter for optimistic concurrency.
- `Note.lastSaveId` (Uuid?) — client-generated save token for idempotent retries.
- `Note.contentHash` was already present from a prior migration; reused.
- `NoteVersion.revision`, `NoteVersion.parentVersionId` (Int? — `NoteVersion.id` is autoincrement Int, not UUID), `NoteVersion.bytesContent`.
- New enum `NoteVersionKind = AUTO | MANUAL | PRE_RESTORE | CONFLICT_LOSER`.
- New index `NoteVersion_noteId_createdAt_hard_idx` (ASC; complements existing DESC variant).

#### Backend

- **Rewritten `PATCH /api/notes/:id`**: dispatches on hardened-fields presence. New path returns 200/202/409/413 with `{ note, revision, savedAt, versionCreated }`; legacy clients fall through unchanged.
- **New `POST /api/notes/:id/chunks`**: chunked save for payloads >64 KB; in-memory `ChunkBuffer` with TTL.
- **Rewritten `POST /api/notes/:id/versions/:versionId/restore`**: atomic transaction creating a `PRE_RESTORE` snapshot before overwrite — non-destructive.
- **New `GET /api/notes/:id/versions/:versionId/diff?against=current|<vid>`**: server-side word diff via `diff` package, 60s cache.
- New helpers: `notes.concurrency.js` (`computeContentHash`, `isRevisionConflict`, `shouldCreateAutoVersion`), `notes.chunks.js`, `notes.diff.js`.
- Dedicated rate limiters: `notesPatchLimiter` 120/min, `notesChunkLimiter` 30/min, `notesRestoreLimiter` 10/min, `notesDiffLimiter` 60/min.
- New error codes: `NOTE_REVISION_CONFLICT`, `NOTE_PAYLOAD_TOO_LARGE`, `NOTE_CHUNK_OUT_OF_ORDER`, `NOTE_VERSION_NOT_FOUND`.
- Backfill script: `npm run backfill:note-version-bytes`.
- Feature flag seed: `npm run seed:notes-hardening-flag`.

#### Frontend

- **Local-first state machine** via new `useNotePersistence` hook (`useReducer` with explicit transitions: `idle → dirty → saving → saved → error/offline/conflict`). Closes the stale-closure bug by construction (refs hold latest editor state; debounced flush reads from refs, never from closures).
- **IndexedDB draft cache** (`noteDraftStore.js`, with `sessionStorage` fallback) keyed by `noteId`. Synchronous-ish per-keystroke writes survive tab crashes / browser close.
- **Mount sequence reconciles draft vs. server** before first render — no more "empty on return" race.
- **Lifecycle flushes**: `beforeunload` (via `navigator.sendBeacon`), `visibilitychange:hidden`, `online`, route-leave, manual `Ctrl/Cmd+S`.
- **Save-status chip** (`NoteSaveStatus.jsx`): dot + label + tooltip + inline "Save now" button. States: up-to-date / unsaved / saving / saved / error / offline / conflict.
- **Conflict resolution**: `NoteConflictBanner.jsx` + `ConflictCompareModal.jsx` (client-side word diff between local draft and server). Choices: keep-mine / use-theirs / cancel — every path produces a `CONFLICT_LOSER` snapshot so nothing is lost.
- **Cross-tab sync**: `BroadcastChannel('studyhub-notes')` — sibling tabs bump `baseRevision` after a save without false-conflicting.
- **Paste sanitization** (`notePaste.js`): TipTap `transformPastedHTML` runs Word/Docs HTML through `sanitize-html` whitelist (semantic tags only; Office namespaces, inline styles, classes, scripts dropped).
- **Version history overhaul** (`NoteVersionHistory.jsx`): kind pills (Manual / Auto / Before restore / Conflict loser), filter chips with localStorage persistence, byte-size badges, "View diff" button opening `NoteVersionDiff.jsx` modal (inline + side-by-side toggle), non-destructive Restore with confirm.
- **Service Worker scaffold** (`public/sw-notes.js`): offline replay logic, FIFO outbox, `note-save-retry` background sync, `sw-replay` trigger, 409 detection. NOT registered yet — existing `public/sw.js` owns root scope. Folded into the existing SW in a follow-up.
- **Legacy autosave gated**: `useNotesData.js` no-ops its broken debounced `autoSave` when the hardening flag is on (prevents double-PATCH races). Legacy path remains available for the OFF rollout cohort.

#### Tests

- Backend: 19 new (5 PATCH + 6 chunks + 3 restore + 5 diff) + 9 concurrency unit tests. Total backend pass: 1318+ (prior 2 file failures unchanged, unrelated).
- Frontend unit: 5 noteDraftStore + 13 reducer + 7 paste sanitizer = 25 new passing.
- Playwright: `tests/notes.persistence.spec.js` covers reload-persistence, crash-recovery, Ctrl+S, paste sanitization, route-leave flush. Suite enumerates clean; execution requires `npx playwright install` on the host.

#### Rollout

Behind `flag_notes_hardening_v2`. After deploy:

1. `DATABASE_URL=... npx prisma migrate deploy` (Railway)
2. `npm --prefix backend run seed:notes-hardening-flag` (creates flag disabled)
3. `npm --prefix backend run backfill:note-version-bytes` (one-time, populates `bytesContent` for legacy versions)
4. Toggle flag to internal admins → 10 % → 50 % → 100 %; watch `note_save_failed` rate and `note_conflict_*` volume.
5. After 7 days at 100 % stable, delete the legacy autosave block in `useNotesData.js` and the dispatch fork in `notes.controller.js`.

Frontend dev override available via `localStorage.setItem('flag_notes_hardening_v2', '1')`.

#### Out of scope (deferred)

- CRDT/Yjs real-time multi-device sync.
- Collaborative cursors / presence.
- Proper `useFeatureFlag` hook wiring (TODO comments mark the hook check sites).
- Folding the SW handlers into the primary `public/sw.js`.

#### Documents

- Spec: [`docs/superpowers/specs/2026-04-15-notes-hardening-design.md`](superpowers/specs/2026-04-15-notes-hardening-design.md)
- Plan: [`docs/superpowers/plans/2026-04-15-notes-hardening.md`](superpowers/plans/2026-04-15-notes-hardening.md)

---

## Date: 2026-04-13

### Security Recovery, Tutorial Refresh, and Study Queue Clarity

**The admin security surface now runs on real failed-login data, tutorials target the visible UI again, and Study Status finally reads like a meaningful workflow instead of a hidden menu toggle**

- Fixed the admin Security tab server error at the root by replacing the nonexistent `User.updatedAt` dependency with a real `lastFailedLoginAt` field, wiring failed and successful login paths to maintain it, clearing it on admin unlock, and adding the matching Prisma migration plus runtime schema repair so the beta stack can heal older databases on boot
- Refreshed the stale settings, messages, study-groups, and announcements tutorials, moved broken anchors off hidden controls onto visible entry points, and hardened the shared tutorial hook so late-mounted targets are resolved after render instead of silently dropping steps on first run
- Promoted Study Status from the sheet-viewer overflow menu into a visible header card that explains what each state means, lets users update it in place, and keeps the queue state persisted after reload so it now clearly feeds the existing dashboard study queue
- Replaced the admin moderation audit-log's static event-type filter list with live backend counts grouped from stored audit rows, so admins only see event categories backed by real data instead of selecting guaranteed-empty prefixes

**Deep Scan Summary / Deferred Risk**

- Study Status is now understandable and immediately visible on the sheet-viewer surface, but it remains local-device state in browser storage rather than a synced backend preference, so the queue still does not roam across browsers or accounts yet
- Audit event-type options now reflect live stored prefixes and current actor/search filters, which removes empty dead-end categories by design; the remaining visibility gap is upstream coverage for app actions that still do not emit audit events into `auditLog`

**Validation**

- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\backend"; npx vitest run test/admin.routes.test.js test/auth.routes.test.js`: passes (21 tests)
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\backend"; npx prisma validate`: passes
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\backend"; npx vitest run test/admin.routes.test.js`: passes (14 tests)
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\frontend\studyhub-app"; npx eslint src/lib/useStudyStatus.js src/pages/sheets/viewer/SheetHeader.jsx src/pages/sheets/viewer/SheetViewerPage.jsx src/pages/admin/moderation/AuditLogSubTab.jsx`: passes
- `npm run beta:down` and `npm run beta:start:oneclick`: rebuilt the local beta stack with the updated backend route and viewer UI
- Live localhost verification on the rebuilt stack: admin overview loaded, sheet viewer showed the new Study Status card, the `Studying` state persisted after reload, `/api/admin/audit-log/event-types` returned live auth counts, and `/api/admin/audit-log?event=auth` returned non-empty results

### Repo Lint Cleanup and Editor Bundle Splitting

**Repo-wide lint is clean again, and the remaining oversized frontend bundles were split at the owning surfaces instead of being hidden with a higher warning limit**

- Fixed the last blocking lint issues in backend support files by removing a stale ESLint suppression, restoring a missing sheet serializer import, and deleting an unused test local
- Replaced runtime `console` usage in backend bootstrap, moderation, request-timing, security-event, storage, feed, and sheet plagiarism paths with the shared structured logger, while scoping the `no-console` allowance down to CLI and Prisma script surfaces only
- Lazy-loaded Sheet Lab tab panels so the route shell no longer eagerly ships every panel, and switched feed and announcement video-upload entry points to direct lazy imports so the `video.js` surface is only loaded when the uploader is opened
- Split the Sheet Lab editor surface by mode, added dedicated Vite manual chunks for CodeMirror HTML editing, and replaced CodeMirror `basicSetup` with the specific HTML-editor extensions StudyHub actually uses, which dropped `codemirror-core` to `476.61 kB` and cleared the Vite chunk-size warning

**Deep Scan Summary / Deferred Risk**

- The previously oversized `video` and `SheetLabPage` bundles are now small lazy chunks; the largest remaining frontend vendor slices are intentional editor/chart chunks that stay under the current warning threshold but should still be watched if more editor features are added
- Runtime logging is now consistent with the shared backend logger on the touched app paths; remaining backend `console` calls are intentionally limited to local scripts/tooling surfaces

**Validation**

- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub"; npm run lint`: passes
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub"; npm run build`: passes

## Date: 2026-04-08

### Backend Test Harness Recovery

**Previously failing and skipped backend suites now match the current auth, routing, and response contracts**

- Repaired stale backend test mocks for newer auth middleware and route behavior, including optional-auth decoding, verified-email gates, full-text search helpers, feed summary helpers, and recently added Prisma models used by auth, notes, AI, and sheet workflow routes
- Realigned route-level tests with current backend contracts such as study-group soft delete and `204` delete/leave responses, `groupResource` model usage, the current interactive-preview message, and the moved sheet viewer file path used by frontend sandbox assertions
- Exported the Express `app` alongside `startServer` from the backend entrypoint so security-header and CORS tests can exercise the HTTP middleware surface directly without booting a live listener

**Deep Scan Summary / Deferred Risk**

- The repaired failures were test-harness drift, dependency damage, and outdated assertions rather than a newly introduced runtime regression in the current backend feature set
- The new `app` export is a testability-only surface layered on top of the existing `startServer` entrypoint; runtime startup behavior remains unchanged

**Validation**

- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\backend"; npx vitest run`: passes (83 files, 1296 tests, 0 skipped)

### Account Deletion Retention Hardening

**Account deletion now closes the highest-risk retention gaps before the user row disappears**

- Self-service and admin deletion now cancel an active Stripe subscription before local teardown so paid accounts cannot keep billing after their StudyHub user record is removed
- The delete flow now removes password-reset and verification-challenge artifacts for the account identity and clears the session cookie after self-service deletion so the browser is not left holding a stale authenticated cookie
- User-owned video-appeal rows are now cleared before owned videos are deleted, which removes the `VideoAppeal.originalVideoId` / uploader foreign-key blockers that could otherwise leave account deletion partially stuck

**Owned uploads are now collected up front and cleaned after the database delete succeeds**

- Extended local-file cleanup from avatars and sheet/feed attachments to also include profile cover images plus comment-image uploads tied to sheet, feed, and note comments that are removed as part of account deletion
- Captured user-owned video R2 refs before deleting the rows, then removed the original object, variants, manifest, thumbnail, and captions after the transaction completes
- Added robust R2 object-key extraction so announcement-image cleanup works whether the stored URL uses the public bucket URL or the proxied `/api/video/media/...` path
- Added embedded note-image cleanup for `/uploads/note-images/...` references found inside `Note.content` and `NoteVersion.content`, so account deletion now removes orphaned note editor uploads instead of only structured attachment rows

**The same note-image leak is now closed for ordinary note deletion as well**

- The note delete route now snapshots embedded note-image URLs from the current note body plus saved version history before deleting the note, then removes any now-unreferenced local note images after the delete succeeds

**Deep Scan Summary / Deferred Risk**

- Confirmed that some retention surfaces remain intentional or externally managed and were not deleted in this pass: audit logs, email delivery/suppression history, and payment-processor records still persist for operational or compliance reasons
- The previously deferred embedded-note-image cleanup gap is now closed for both account deletion and single-note deletion; audit/compliance retention remains the main intentional leftover surface

**Validation**

- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\backend"; npx vitest run test/settings.routes.test.js test/deleteUserAccount.test.js`: passes (19 tests)
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\backend"; npx eslint --quiet src/lib/deleteUserAccount.js src/lib/storage.js src/lib/r2Storage.js src/modules/video/video.service.js src/modules/announcements/announcements.routes.js src/modules/settings/settings.account.controller.js test/settings.routes.test.js test/deleteUserAccount.test.js`: passes
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\backend"; npx vitest run test/deleteUserAccount.test.js test/notes-enhancements.routes.test.js test/idor.notes.test.js`: passes (33 tests)
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\backend"; npx eslint --quiet src/lib/storage.js src/lib/deleteUserAccount.js src/modules/notes/notes.controller.js test/deleteUserAccount.test.js test/notes-enhancements.routes.test.js test/idor.notes.test.js`: passes

### Notification Preference Expansion

**Notification settings now map to the real activity categories StudyHub emits instead of a minimal flat toggle set**

- Expanded stored user preferences with dedicated email and in-app controls for comments and replies, social activity, study-group activity, mentions, and sheet contribution activity while keeping the existing digest setting intact
- Reworked the Settings notifications tab so the new categories are editable from one place and clearly labels moderation, billing, and legal notices as essential account alerts that remain enabled

**Backend notification delivery now respects those preferences at the root helper instead of relying on callers**

- Centralized notification category mapping inside the shared notify helper so optional in-app alerts are skipped before write time when the user has turned that category off
- Added opt-in email delivery for medium-priority activity types such as mentions and study-group updates, while preserving the existing high-priority email flow for moderation and billing-style alerts
- Kept account-critical types such as moderation, payment failures, legal reminders, and video-copy alerts mandatory in-app, and routed the remaining raw study-group and video notification writers through the shared helper so they use the same policy

**Validation**

- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub"; npm --prefix backend test -- --run test/settings.routes.test.js test/notify.test.js test/payments.test.js`: passes (67 tests)
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub"; npm --prefix backend test -- --run test/studyGroups.routes.test.js`: passes (8 tests)
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\backend"; npx eslint src/lib/notify.js src/modules/settings/settings.constants.js src/modules/payments/payments.service.js src/modules/studyGroups/studyGroups.sessions.routes.js src/modules/studyGroups/studyGroups.discussions.controller.js src/modules/video/video.service.js test/settings.routes.test.js test/notify.test.js`: passes
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\backend"; npx prisma validate`: passes
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\frontend\studyhub-app"; npx eslint src/pages/settings/NotificationsTab.jsx`: passes
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub"; npm --prefix frontend/studyhub-app run build`: passes

### Sheet Review Workflow, Recent Courses, and Admin Interactive Preview

**Owner-only sheet states now stay inside an interactive editor flow instead of falling into dead-end viewer routes**

- Hardened auth-token normalization and sheet-owner checks so legacy numeric-string session ids still count as the sheet owner for unpublished and under-review content
- Kept editable sheet states (`draft`, `pending_review`, `rejected`, `quarantined`) on the HTML upload/editor workflow from My Sheets and submit-time redirects instead of sending creators to the public viewer path
- Added direct draft-query loading on the upload page so creators can reopen a specific under-review sheet, keep editing it, and continue using preview from the same workspace

**HTML scan UX is quieter during editing but clearer after submission**

- Removed the auto-opening scan modal from background polling so scans keep running inline without interrupting editing sessions
- Added an explicit "View scan details" action in the upload form for flagged findings and kept acknowledgement gated there for tier-1 HTML findings
- Added a post-submit review notice modal that tells the creator the sheet is under review, keeps them in the editor, and points them to My Sheets and preview when available

**Sheets/feed/admin quality-of-life behavior is tighter**

- Recent courses on the sheets page now expire after one hour and are capped at seven entries instead of lingering indefinitely
- Sidebar navigation now scrolls the app back to the top on click, and the floating scroll-to-top control shifts left when the AI bubble is present so the two controls no longer overlap on feed-style pages
- The admin sheet-review window now includes an interactive preview tab powered by the existing HTML runtime endpoint so admins can inspect script-enabled behavior before approving a sheet

**Validation**

- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub"; npm --prefix backend test -- --run test/core-utils.test.js test/attachmentAccessControl.test.js`: passes (103 tests)
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\frontend\studyhub-app"; npx vitest run src/pages/sheets/upload/uploadSheetWorkflow.test.jsx src/pages/sheets/recentCoursesStorage.test.js`: passes (7 tests)
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\frontend\studyhub-app"; npx eslint src/components/sidebar/AppSidebar.jsx src/components/ScrollToTop.jsx src/components/sidebar/AppSidebar.responsive.test.jsx src/pages/sheets/upload/useUploadSheet.js src/pages/sheets/upload/uploadSheetActions.js src/pages/sheets/upload/UploadSheetPage.jsx src/pages/sheets/upload/UploadSheetFormFields.jsx src/pages/sheets/lab/HtmlScanModal.jsx src/pages/sheets/useSheetsData.js src/pages/sheets/recentCoursesStorage.js src/pages/sheets/recentCoursesStorage.test.js src/pages/admin/sheetReview/SheetReviewPanel.jsx src/pages/admin/sheetReview/SheetReviewDetails.jsx src/pages/sheets/SheetsPage.jsx src/pages/sheets/SheetListItem.jsx`: passes
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub"; npm --prefix frontend/studyhub-app run build`: passes
- `Set-Location -LiteralPath "C:\Users\Abdul PC\OneDrive\Desktop\studyhub\frontend\studyhub-app"; npx vitest run src/components/sidebar/AppSidebar.responsive.test.jsx`: still fails in the current workspace test environment because React Testing Library resolves `react-dom` from the root workspace `node_modules`, which then cannot resolve a matching root `react` package; this is an existing test-environment/module-resolution issue, not a compile error in the sidebar change itself

## Date: 2026-04-07

### Attachment Preview Action Polish

**Preview header actions now read as compact utility controls instead of oversized pills**

- Refined the attachment preview page header actions so Back and Download original use a tighter height, smaller radius, subtler spacing, and clearer secondary-versus-primary treatment
- Added the shared left-arrow affordance to the Back action so the header feels more directional without taking extra space

**Validation**

- `Set-Location -LiteralPath frontend/studyhub-app; npx eslint src/pages/preview/AttachmentPreviewPage.jsx`: passes

### Backend Review Cleanup, Google Books Noise Reduction, and Vite Alignment

**The open backend review comments are now resolved at the root cause**

- Reworked study-sheet full-text search to use structured Prisma SQL fragments instead of `$queryRawUnsafe`, which removes the unsafe raw-string assembly while keeping the existing ranking and filter behavior intact
- Standardized route error fallback responses through the shared `sendError` envelope so uncoded controller failures now return stable `{ error, code }` payloads instead of a one-off raw JSON shape

**Google Books failures and Prisma dev drift now behave more predictably**

- Added HTTP-status-aware error objects in the library service so upstream `429` responses carry `statusCode` metadata into monitoring and can be filtered as expected instead of surfacing as generic server noise
- Updated the backend Docker dev entrypoint to hash `prisma/schema.prisma` and re-run `prisma generate` when the schema changes, which closes the stale-client gap behind the recent runtime mismatch on newer Prisma fields such as `displayName`

**Vite resolution is aligned where the repo actually pins it**

- Pinned the frontend package manifests and package-locks to `vite` `8.0.5` in both the main app and the mirrored Claude worktree
- Refreshed the standalone backend lockfiles so their Vitest-owned Vite resolution also lands on `8.0.5`
- The workspace-root lockfiles still contain a separate hoisted `vite` `8.0.7` copy for Vitest, and the older mirrored worktree also routes plugin-react through that hoisted copy, while the frontend-scoped workspace entries are pinned to `8.0.5`; this is the resolved npm workspace graph, not a remaining invalid direct dependency pin

**Validation**

- `Set-Location -LiteralPath backend; npm test -- test/fullTextSearch.test.js test/http.errors.test.js test/library.service.test.js`: passes (6 tests)
- `Set-Location -LiteralPath backend; npx eslint src/lib/fullTextSearch.js src/core/http/errors.js src/modules/library/library.service.js scripts/dev-entrypoint.js test/fullTextSearch.test.js test/http.errors.test.js test/library.service.test.js`: passes
- `Set-Location -LiteralPath frontend/studyhub-app; npm run build`: passes

### Prisma Runtime Cleanup and Dependabot Resolver Unblock

**Additional Prisma/schema mismatches that were still surfacing in runtime monitoring are now removed from the live code path**

- Fixed admin engagement totals so sheet reactions no longer query a nonexistent `Reaction.createdAt` field; likes remain a lifetime total until the schema stores reaction timestamps explicitly
- Fixed the study-group activity feed to read `GroupResource.resourceType` instead of the nonexistent `type` field when building recent resource activity
- Fixed the sheet readme route to stop selecting a nonexistent `StudySheet.visibility` field before passing the sheet through the shared read-access guard

**Frontend Vite manifests are now simpler for Dependabot to resolve**

- Removed the redundant frontend-local `vite` overrides from both the main app manifest and the mirrored Claude worktree manifest, leaving the direct `vite` dependency pinned at `8.0.5`
- Refreshed both frontend lockfiles after the manifest cleanup so Dependabot no longer needs to reconcile a direct pin and an identical override in the same package

**Validation**

- `Set-Location -LiteralPath backend; npm test -- test/admin.routes.test.js test/sheets.read.routes.test.js test/studyGroups.activity.routes.test.js test/fullTextSearch.test.js test/http.errors.test.js test/library.service.test.js test/courses.routes.test.js`: passes (23 tests)
- `Set-Location -LiteralPath frontend/studyhub-app; npm run build`: passes

### PR #195 Follow-up Review Fixes

**Optional auth and maintenance middleware now behave consistently across mounted routes**

- Centralized optional-token decoding around a shared normalized auth-user helper so optional-auth surfaces no longer attach raw JWT payloads that are missing `userId`
- Updated guarded-mode allowlist matching to use the full mounted path instead of `req.path` alone, which keeps `/api/auth/google` and similar mounted auth routes usable during maintenance windows
- Activated restriction checks against normalized early auth context while exempting auth/session maintenance routes such as logout so restricted users can still clear their server session

**Google sign-up and verification gates were tightened**

- Switched Google account creation to race-safe username generation that retries on username uniqueness conflicts, respects the 20-character username limit when suffixes are appended, and handles `P2002` email or Google ID conflicts cleanly
- Standardized `requireVerifiedEmail` responses onto the shared error envelope with stable auth and verification error codes

**Small correctness drifts were cleaned up**

- Reset mention-regexp state on every extraction call so repeated mention parsing cannot skip matches
- Aligned the HTML upload kill-switch header comment with the actual `enabled` override behavior
- Tightened sanitized HTML previews by stripping form action targets instead of preserving submit destinations, and corrected the leaderboard helper comment so it matches the null-start all-time behavior

**Validation**

- `Set-Location -LiteralPath backend; npm test -- test/core-utils.test.js test/auth.google.routes.test.js test/releaseA.stability.middleware.test.js test/checkRestrictions.test.js test/mentions.test.js test/requireVerifiedEmail.test.js test/html.security.test.js`: passes (136 tests)
- `Set-Location -LiteralPath backend; npx eslint src/lib/authTokens.js src/core/auth/optionalAuth.js src/index.js src/middleware/checkRestrictions.js src/middleware/guardedMode.js src/middleware/requireVerifiedEmail.js src/lib/mentions.js src/lib/html/htmlKillSwitch.js src/lib/html/htmlPreviewDocument.js src/lib/leaderboard.js src/modules/auth/auth.google.controller.js src/modules/users/users.routes.js src/modules/library/library.routes.js src/modules/search/search.routes.js src/modules/feed/feed.discovery.controller.js src/modules/sheetLab/sheetLab.constants.js src/modules/payments/payments.routes.js test/auth.google.routes.test.js test/releaseA.stability.middleware.test.js test/checkRestrictions.test.js test/mentions.test.js test/requireVerifiedEmail.test.js test/html.security.test.js`: passes

### Profile Privacy, Supporter Receipts, and Payment History Export

**Profiles now support richer public metadata with tighter privacy controls**

- Added migration-backed profile fields for `displayName`, `bio`, labeled social links, and per-field visibility preferences so users can manage more than just avatar and cover state from Settings
- Added a dedicated settings profile update route that validates profile metadata, persists public fields in the core user record, and routes sensitive age/location storage through the existing encrypted PII vault with an explicit AWS KMS readiness check
- Updated the profile page so bios, display names, social links, and optional location/age surface when allowed, while private accounts now keep the requested limited-preview behavior by still showing the profile description before access is granted

**Payments now expose clearer donor privacy and better receipt/history flows**

- Donation completion now writes a payment-history record for authenticated donors, sends thank-you mail, and keeps anonymous donations off the public leaderboard while still aggregating them into a separate anonymous-support total
- Added payment receipt email delivery for successful subscription invoices and surfaced payment-history CSV export from Settings so users can download their transaction history directly
- Updated Pricing and Supporters copy so anonymous-donation behavior is explicit: private donors stay hidden from the named supporter list, but their contribution still counts toward the community total

**Validation**

- `Set-Location -LiteralPath backend; npm test -- test/settings.routes.test.js test/payments.test.js`: passes (63 tests)
- `Set-Location -LiteralPath backend; npx eslint src/lib/profileMetadata.js src/modules/settings/settings.service.js src/modules/settings/settings.account.controller.js src/modules/users/users.controller.js src/lib/email/emailTemplates.js src/lib/email/email.js src/modules/payments/payments.service.js src/modules/payments/payments.routes.js test/settings.routes.test.js test/payments.test.js`: passes
- `Set-Location -LiteralPath backend; npx prisma validate`: passes
- `Set-Location -LiteralPath frontend/studyhub-app; npx eslint src/pages/settings/SettingsPage.jsx src/pages/settings/ProfileTab.jsx src/pages/profile/UserProfilePage.jsx src/pages/settings/SubscriptionTab.jsx src/pages/supporters/SupportersPage.jsx src/pages/pricing/PricingPage.jsx`: passes
- `npm --prefix frontend/studyhub-app run build`: passes

### PR #195 Review Fixes for Auth and Middleware Hardening

**Auth and request-context handling now match the active session contract more closely**

- Normalized optional-auth request users back onto the `{ userId, username, role, trustLevel }` shape instead of leaving read paths with a raw JWT payload, and updated safe request redaction to capture `req.user.userId` instead of only the legacy `req.user.id`
- Added `POST /api/auth/google` to guarded-mode's write allowlist so Google sign-in stays usable during maintenance windows just like the other auth entry points
- Hardened Google OAuth account creation so new accounts only inherit verified-email state from Google's token response instead of being marked verified unconditionally

**Backend fallbacks now fail more predictably**

- Normalized unknown leaderboard periods back to the weekly window instead of accidentally collapsing to a near-empty date range
- Wrapped auth-cookie decoding so malformed cookie values fall back to the raw value instead of throwing during request parsing
- Changed verified-email enforcement to fail closed with Sentry capture and a retryable server response when the database lookup itself fails, instead of silently allowing writes through that middleware
- Added a repo ignore rule for LibreOffice lock artifacts and removed the checked-in `.~lock.*#` files from the tracked Claude worktree snapshot

**Validation**

- `Set-Location backend; npx vitest run test/releaseA.stability.middleware.test.js test/core-utils.test.js`: passes (81 tests)
- `Set-Location backend; npx eslint src/lib/redact.js src/core/auth/optionalAuth.js src/middleware/guardedMode.js src/modules/auth/auth.google.controller.js src/lib/leaderboard.js src/lib/authTokens.js src/middleware/requireVerifiedEmail.js test/releaseA.stability.middleware.test.js test/core-utils.test.js`: passes
- Editor diagnostics for the touched root backend files and mirrored `.claude/worktrees/q2-v1-sheet-polish` copies: no new errors

### Comment GIF-Only Rollout and Live Beta Visual Pass

**Comment surfaces now use GIF-only attachments instead of local image uploads**

- Replaced the feed comment and reply attachment flow with the shared Tenor GIF picker, removed the old local file-upload path from that UI, and tuned composer and posted-GIF sizing so previews stay readable without collapsing into narrow thumbnails or oversized blocks
- Added the same GIF-only comment capability to sheet viewer comments and note comments, including reply composition for notes, so the visible comment surfaces now share the same attachment behavior instead of mixing text-only and image-upload variants
- Consolidated the duplicated messaging/chat GIF search panels onto a single shared `GifSearchPanel` component so comment and messaging surfaces now pull from the same search experience and sizing controls

**Server-side comment validation now matches the new client behavior**

- Added a shared backend comment attachment validator that only allows one HTTPS GIF per comment and rejects non-GIF payloads even if someone bypasses the UI
- Updated feed, sheet, and note comment creation endpoints to allow GIF-only comments without text while still enforcing the existing 500-character text limit when content is present

**Editor warning noise was reduced for the touched CSS and markdown surfaces**

- Removed the unsupported `scrollbar-width`, `scrollbar-color`, and `-webkit-overflow-scrolling` declarations that were still generating browser-compatibility warnings in the shared frontend stylesheets
- Suppressed repetitive markdownlint noise in the active v2.0 implementation-plan document and this beta release log so the editor stops flagging known planning-log formatting patterns during normal work

**Live beta screenshots were captured for the requested surfaces**

- Added `frontend/studyhub-app/tests/polish-visual-pass.beta-live.spec.js`, a live beta Playwright pass that authenticates once, disables tutorial noise, waits for legal embeds to settle, and captures fresh screenshots for study groups, messages, supporters, feed, and the legal pages
- The latest run saved artifacts to `frontend/studyhub-app/test-results/polish-visual-pass.beta-li-6241c-equested-beta-surfaces-beta/` with per-surface PNGs for `study-groups`, `messages`, `supporters`, `feed`, `terms`, `privacy`, and `guidelines`

**Validation**

- `Set-Location frontend/studyhub-app; npx eslint src/pages/feed/CommentSection.jsx src/pages/sheets/viewer/SheetCommentsPanel.jsx src/pages/sheets/viewer/SheetViewerPage.jsx src/pages/sheets/viewer/useSheetViewer.js src/pages/notes/NoteCommentSection.jsx src/pages/notes/useNoteComments.js tests/polish-visual-pass.beta-live.spec.js`: passes
- `Set-Location backend; npx eslint src/lib/commentGifAttachments.js src/modules/feed/feed.social.controller.js src/modules/sheets/sheets.social.controller.js src/modules/notes/notes.controller.js`: passes
- Editor diagnostics for `frontend/studyhub-app/src/index.css`, `frontend/studyhub-app/src/styles/responsive.css`, and `docs/studyhub-v2.0-implementation-plan.md`: no remaining errors
- `Set-Location frontend/studyhub-app; npx playwright test -c playwright.beta.config.js tests/polish-visual-pass.beta-live.spec.js --reporter=line`: passes (1 test, 30.8s)

### Cross-Surface Social, Legal, and Messaging Polish

**Study groups now look more complete and support admin-managed group imagery end to end**

- Added `avatarUrl` support to study-group creation on the backend, normalized avatar updates, and wired the create/edit modals to the existing authenticated image-upload flow so admins can add, replace, or remove group images without leaving the modal
- Reworked study-group cards and detail headers into a more image-forward layout with better spacing, stronger action buttons, clearer stats, and more professional visual hierarchy so group imagery is visible across the directory and detail surfaces
- Improved the shared study-group helper and create flow error handling so uploaded image URLs resolve correctly and backend validation messages surface cleanly in the UI

**Feed, supporters, sheet viewer, and messaging spacing were tightened**

- Polished the supporters page card rhythm and CTA styling, and fixed the empty-state heart icon contrast so it remains clearly visible instead of fading into the background
- Tightened the feed toolbar and right-rail layout with dedicated responsive classes and a sticky desktop aside so filters, search, main content, and the leaderboard rail line up more cleanly across screen sizes
- Switched the sheet viewer author/about presentation to the shared `UserAvatar` component for more consistent identity rendering and a cleaner About panel
- Redesigned the messaging conversation sidebar with a richer header, clearer request/archive controls, and more elevated conversation cards so the left rail feels closer to the rest of the app's current visual language

**Legal embeds and referral status handling are more reliable**

- Updated the public legal document embed flow so Terms, Privacy, Cookie Policy, and Disclaimer pages reinitialize the hosted Termly snippet more reliably when the Termly script already exists on the page
- Adjusted the legal document embed container so the hosted snippet has enough space to render cleanly without the older cramped wrapper treatment
- Added derived referral-code inactivity handling so expired, maxed-out, or manually deactivated codes are represented accurately in both backend responses and the pricing-page referral UI instead of only relying on the raw `active` flag

**Validation**

- `Set-Location frontend/studyhub-app; npx eslint src/lib/useTermlyEmbed.js src/pages/legal/LegalDocumentPage.jsx src/pages/pricing/PricingPage.jsx src/pages/sheets/viewer/SheetHeader.jsx src/pages/sheets/viewer/SheetViewerSidebar.jsx src/pages/messages/components/ConversationList.jsx src/pages/supporters/SupportersPage.jsx src/pages/feed/FeedPage.jsx src/pages/feed/FeedAside.jsx src/pages/studyGroups/GroupModals.jsx src/pages/studyGroups/GroupCard.jsx src/pages/studyGroups/GroupDetailView.jsx src/pages/studyGroups/studyGroupsStyles.js src/pages/studyGroups/studyGroupsHelpers.js src/pages/studyGroups/useGroupList.js`: passes
- `Set-Location backend; npx eslint src/modules/payments/sprintE.routes.js src/modules/studyGroups/studyGroups.controller.js`: passes
- `npm --prefix frontend/studyhub-app run build`: passes
- `Set-Location backend; npm test -- test/payments.test.js test/studyGroups.routes.test.js`: passes (52 tests)

### Dark-Mode Public Surface Polish and Live Visual Smoke Coverage

**Only the homepage and selected public information pages now carry the enhanced dark presentation**

- Scoped the stronger dark-mode FX to the exact pages intended for the redesign: `/`, `/about`, `/terms`, `/privacy`, and `/guidelines`
- Removed the overscoped dark-mode treatment from feed, the rest of the authenticated app shell, and unrelated public pages so those routes keep their existing dark-mode presentation instead of inheriting the new ambient look
- Narrowed the final regression coverage to the same exact page list so future dark-mode checks protect only the homepage and selected legal/about surfaces

**Live localhost dark-mode regression checks are now committed**

- Added `frontend/studyhub-app/tests/dark-mode.beta-live.spec.js`, a Playwright beta-live snapshot suite that boots dark mode the same way as the successful localhost capture flow, disables tutorials, hides transient UI like the service-worker update banner, waits for legal documents to finish loading, and snapshots only the homepage hero/CTA plus the About, Terms, Privacy, and Guidelines pages
- Added dedicated frontend scripts for the new pass so the live dark visual check can be run directly with `test:e2e:dark:beta`, regenerated intentionally with `test:e2e:dark:beta:update`, or invoked under the visual alias `visual:dark:beta`
- Because the new spec uses the existing beta-live naming/config pattern, it is also picked up automatically by the repo's broader beta validation workflow

**Validation**

- Editor diagnostics for `frontend/studyhub-app/src/index.css`: no new errors; existing browser-support warnings only
- `Set-Location frontend/studyhub-app; npx eslint src/App.jsx src/pages/auth/LoginPage.jsx src/pages/auth/RegisterScreen.jsx src/pages/auth/ForgotPasswordPage.jsx src/pages/auth/ResetPasswordPage.jsx src/pages/pricing/PricingPage.jsx tests/dark-mode.beta-live.spec.js`: passes
- `Set-Location frontend/studyhub-app; npm run build`: passes
- `Set-Location frontend/studyhub-app; npm run test:e2e:dark:beta:update`: passes (1 test, homepage/about/legal surfaces)
- `Set-Location frontend/studyhub-app; npm run test:e2e:dark:beta`: passes (1 test, homepage/about/legal surfaces)

### Home Hero and CTA Backdrop Continuity

**Homepage dark backgrounds now share the same atmosphere instead of breaking into a flat slab**

- Added a dedicated homepage backdrop token and applied it to both the hero and bottom CTA so the dark-mode landing page keeps the same blue-violet atmosphere across both snapshots instead of dropping the CTA into a separate charcoal block
- Moved the homepage backdrop to a fixed canvas on the page shell, which keeps the visual field stable behind the landing experience while lighter middle sections and the footer continue to use their own explicit surfaces

**Validation**

- Editor diagnostics for `frontend/studyhub-app/src/index.css`: no new errors; existing browser-support warnings only
- `Set-Location frontend/studyhub-app; npm run build`: passes
- `Set-Location frontend/studyhub-app; npm run test:e2e:dark:beta:update`: passes (1 test, refreshed homepage/about/legal baselines)
- `Set-Location frontend/studyhub-app; npm run test:e2e:dark:beta`: passes (1 test)

### Beta Stack Runtime Hardening and Live Study-Group Verification

**Beta stack boot now survives mounted-volume permission drift**

- Moved the backend and frontend dev-container lock state out of `node_modules/.studyhub` and stopped treating a missing hash file as a forced reinstall, so stale local volumes no longer trigger unnecessary dependency refreshes on every beta boot
- Updated the backend dev entrypoint to skip `prisma generate` unless dependencies were freshly installed or the Prisma client is actually missing, which avoids write attempts into mounted `node_modules/.prisma` paths during normal restarts
- Updated the frontend dev entrypoint to start Vite with `--configLoader runner`, which avoids `.vite-temp` writes under mounted `node_modules` paths in the beta container
- Switched the local beta frontend and backend compose services to run as `root` so stale uploads paths and named volumes remain writable in the local dev stack

**Live browser coverage now exists for the highest-risk study-group flows**

- Added a dedicated live beta Playwright spec for pending approval, invite acceptance, moderator member removal rules, and school/course filtering
- Hardened the live beta browser setup so authenticated mutations include CSRF tokens, current legal documents are accepted during session bootstrap, cookie-consent prompts do not block interactions, and seeded cleanup remains reliable after test failures
- Confirmed the four requested study-group flows pass together on the repaired beta stack instead of only through local unit or route coverage

**Standard beta seeding is restored**

- Fixed `backend/prisma/seed.js` to load catalog data from the current `src/lib/catalog/catalogData` module instead of the removed legacy import path
- Re-ran the standard `beta:seed` pipeline end to end and confirmed it now completes through base seed, beta-user seed, and preview-fixture generation without the earlier seed-script import failure

**Validation**

- `npm run beta:seed`: passes
- `Set-Location frontend/studyhub-app; npx playwright test --config=playwright.beta.config.js tests/study-groups.beta-live.spec.js`: passes (4 tests)
- Live beta backend health check on `http://localhost:4000/health`: returns `{"api":"ok","database":"ok","status":"healthy"}`

### Study Groups Permission and Discovery Tightening

**Membership state handling now matches the backend contract**

- Fixed the join flow so private-group requests stay `pending`, invited users can accept their invitation instead of being blocked as "already a member", and banned users are rejected cleanly
- Updated the study-group detail page action area to reflect membership state instead of only `isMember`, so the CTA now distinguishes join, pending, invited, and leave behavior
- Normalized the detail hook's route-id comparisons and reloaded server truth after membership mutations so detail state does not drift after join actions

**Member management now matches the actual permission model**

- Fixed the invite flow drift between the username-based members UI and the hook payload so invites now send the backend-supported request shape
- Fixed member-management actions to target `userId` routes instead of membership-row ids, which prevents update/remove calls from hitting the wrong identifier
- Expanded the members list contract so admins and moderators can see pending and invited records while regular members still only see active members
- Added moderator invite/remove controls in the members tab while keeping role changes and pending-request approval admin-only

**School-aware discovery and overview context improved**

- Added `schoolId` filtering to the study-group list API, exposed course and school metadata on formatted group responses, and wired the frontend list view to the existing `/api/courses/schools` catalog so school and course filters are both populated and scoped correctly
- Improved group cards to show clearer course-school context, and expanded the overview tab with open-seat, pending-request, and outstanding-invite context for admins and moderators
- Switched overview activity avatars to `UserAvatar` for consistent user rendering across the study-groups surface

**Validation**

- `Set-Location backend; npm test -- test/studyGroups.routes.test.js`: passes (8 tests)
- `Set-Location backend; npx eslint src/modules/studyGroups/studyGroups.controller.js src/modules/studyGroups/studyGroups.helpers.js test/studyGroups.routes.test.js`: passes
- `Set-Location frontend/studyhub-app; npx eslint src/pages/studyGroups/useGroupDetail.js src/pages/studyGroups/useGroupMembers.js src/pages/studyGroups/useGroupList.js src/pages/studyGroups/useStudyGroupsData.js src/pages/studyGroups/GroupDetailView.jsx src/pages/studyGroups/GroupOverviewTab.jsx src/pages/studyGroups/GroupMembersTab.jsx src/pages/studyGroups/GroupListView.jsx src/pages/studyGroups/GroupListFilters.jsx src/pages/studyGroups/GroupCard.jsx`: passes
- `npm --prefix frontend/studyhub-app run build`: passes

### Notes Tag Discovery and Shareable Bookshelves

**Notes now filter and surface tags in-place**

- Extended the notes API list contract so note searches can match title, body content, and serialized tags while exact tag filters can be applied with a dedicated `tag` query parameter
- Normalized note list responses to return parsed tag arrays and current star state so the notes sidebar can render reliable tag chips and a working starred filter on first load
- Reworked the notes page state to use URL-backed filter/search parameters, added a note search box plus tag-chip filters in the sidebar, and made tag edits update the list immediately without waiting for a full reload

**Bookshelves can now be shared on profiles**

- Added `BookShelf.visibility` with a Prisma migration so shelves can remain private or be explicitly shown on a user profile
- Extended the existing library shelf create/update flow to validate and persist shelf visibility, and added owner controls on the library page for visibility toggles and shelf deletion
- Extended the existing user-profile payload with `sharedShelves`, then rendered those profile-visible shelves in the profile overview without exposing reading progress or private shelf data

**Validation**

- `Set-Location backend; npm test -- test/notes.routes.test.js test/search.routes.test.js`: passes (32 tests)
- `Set-Location backend; npx eslint src/modules/notes/notes.controller.js src/modules/search/search.routes.js test/notes.routes.test.js test/search.routes.test.js`: passes
- `Set-Location frontend/studyhub-app; npx eslint src/pages/notes/useNotesData.js src/pages/notes/NotesPage.jsx src/pages/notes/NotesList.jsx src/pages/notes/NoteEditor.jsx src/pages/notes/NoteTagsInput.jsx`: passes
- `npm --prefix frontend/studyhub-app run build`: passes

### Legacy Alias Token Removal

**Dead token bridge removed**

- Removed the legacy alias custom properties from the shared frontend stylesheet after verifying the active React app no longer consumes `var(--navy)`, `var(--blue)`, `var(--white)`, `var(--border)`, or the related alias family
- Confirmed the earlier marketing, legal, dashboard, and home cleanup passes were sufficient: no remaining shared utility selectors in `frontend/studyhub-app/src` still depended on the alias layer

**Audit scope**

- Scanned the active frontend source tree for live consumers across `.css`, `.js`, and `.jsx` files and found no remaining alias-variable references
- Ran a broader workspace safety pass and found only unrelated local test-gallery CSS variables in `frontend/studyhub-app/tests/screenshots/gallery.html`, which does not depend on the app stylesheet alias block

**Validation**

- PowerShell source-tree scan for `var(--navy|--blue|--white|--border|...)` across `frontend/studyhub-app/src`: no matches
- `npm --prefix frontend/studyhub-app run lint`: passes
- `npm --prefix frontend/studyhub-app run build`: passes

### Marketing, Legal, and Dashboard Token Cleanup

**Shared semantics promoted beyond Home**

- Added a broader shared token layer in the frontend stylesheet for dark-hero gradients, glass surfaces, dark-footers, premium accents, metallic supporter tiers, and reusable accent families like purple, cyan, indigo, pink, and neutral-slate
- Collapsed several Home-specific tokens onto those broader shared semantics so the landing page, legal pages, dashboard, pricing, and supporters surfaces can now reuse the same color decisions instead of each carrying separate palette logic

**Non-home surfaces aligned**

- Reworked the legal page shell, hero panels, sidecards, links, and footer to use the shared semantic tokens instead of direct hex values and legacy alias colors in the shared stylesheet
- Reworked the dashboard action cards, empty states, helper widgets, hero banner, quick-action accents, and summary-card color metadata to use shared semantic tokens
- Reworked the About, Pricing, and Supporters route style objects so their hero, CTA, badge, supporter-tier, and footer surfaces read from the shared token layer instead of embedding local palette literals

**Validation**

- `Set-Location frontend/studyhub-app; npx eslint src/pages/legal/AboutPage.jsx src/pages/pricing/PricingPage.jsx src/pages/supporters/SupportersPage.jsx src/pages/dashboard/DashboardPage.jsx src/pages/dashboard/DashboardWidgets.jsx src/pages/dashboard/useDashboardData.js`: passes
- `npm --prefix frontend/studyhub-app run lint`: passes
- `npm --prefix frontend/studyhub-app run build`: passes
- `rg -n "#[0-9A-Fa-f]{3,6}|rgba\([^)]*255[^)]*255[^)]*255|var\(--navy|var\(--blue|var\(--green|var\(--yellow|var\(--purple|var\(--white|var\(--border" frontend/studyhub-app/src/pages/legal/AboutPage.jsx frontend/studyhub-app/src/pages/pricing/PricingPage.jsx frontend/studyhub-app/src/pages/supporters/SupportersPage.jsx frontend/studyhub-app/src/pages/dashboard/DashboardPage.jsx frontend/studyhub-app/src/pages/dashboard/DashboardWidgets.jsx frontend/studyhub-app/src/pages/dashboard/useDashboardData.js`: no matches in the current worktree
- `rg -n "var\(--navy|var\(--blue|var\(--green|var\(--yellow|var\(--purple|var\(--white|var\(--border" frontend/studyhub-app/src/index.css`: no matches in the current worktree

### Home Page Token Cleanup

**Landing-page palette centralized**

- Added a dedicated home-page token set in the shared stylesheet for the hero gradient, CTA glow, footer colors, feature tones, proof marks, testimonial avatars, and the fork-tree illustration
- Replaced the remaining hardcoded SVG fill and stroke values in the Home hero and setup illustration with token-backed values so the page art now reads from the same shared palette source as the rest of the landing experience
- Moved testimonial and proof color metadata to token-backed constants and replaced the last home CTA color inline styles with semantic classes

**Broader tokenization follow-through**

- Rewired home feature cards, proof banner, testimonials, step badges, footer, and dark hero surfaces to use tokenized color decisions instead of local hex literals or legacy alias colors
- Kept the existing Home page visual language intact while removing palette choices from the component layer

### Library Reality Alignment and Payment Webhook Hardening

**Google Books contract enforced**

- Sanitized external Google Books description HTML at the backend boundary and re-sanitized on the book detail page before rendering
- Updated the Home page BookHub card to describe the actual shipped experience: Google Books previews plus shelves and bookmarks, not EPUB highlights or annotations
- Removed unused library highlight routes, handlers, tests, constants, and Prisma schema/model surface so the backend now matches the shipped Google Books reader contract
- Removed the unused `epubjs` chunk wiring from the frontend build so the app no longer carries dead reader bundling logic

**Payments hardening**

- Added a dedicated `paymentWebhookLimiter` and applied it to the Stripe webhook endpoint so checkout, portal, reads, and webhook traffic are all explicitly rate limited

**Docs alignment**

- Added supersession notes to the v2.0 implementation plan so older Gutendex and epub.js details are clearly marked as archival
- Updated the Railway deployment guide to validate the Google Books embed flow instead of an EPUB reader flow

**Validation**

- `npm --prefix frontend/studyhub-app run lint`: passes
- `npm --prefix frontend/studyhub-app run build`: passes
- `Set-Location frontend/studyhub-app; npx eslint src/pages/home/HomeHero.jsx src/pages/home/HomeSections.jsx src/pages/home/homeConstants.js`: passes
- `Set-Location backend; npx eslint src/modules/library/library.service.js src/modules/library/library.controller.js src/modules/library/library.routes.js src/modules/payments/payments.routes.js src/lib/rateLimiters.js test/library.routes.test.js`: passes
- `Set-Location backend; npm run test -- test/library.routes.test.js`: passes (16 tests)
- `Set-Location backend; npx prisma validate`: passes
- `npm --prefix frontend/studyhub-app run lint`: passes
- `npm --prefix frontend/studyhub-app run build`: passes
- `npm --prefix frontend/studyhub-app audit --omit=dev`: still reports `brace-expansion`, but `npm --prefix frontend/studyhub-app ls brace-expansion` traces it only through the dev-only ESLint toolchain, not the shipped app bundle
- `npm --prefix backend audit --omit=dev`: still reports `defu`, but `npm --prefix backend ls defu` returns no production dependency path, so the finding appears to come from retained tooling metadata rather than an active runtime package tree

## Date: 2026-04-04

### Legal Backup and Acceptance Enforcement

**Root Cause Fixed: Termly-only legal loading left registration and legal pages without an internal fallback**

- Added database-backed `LegalDocument` and `LegalAcceptance` models plus migration `20260405110000_add_legal_documents_and_acceptances`
- Seeded canonical backup copies of Terms, Privacy, Cookie Policy, Disclaimer, and Community Guidelines from the Word-document source of truth
- New backend legal module exposes:
  - `GET /api/legal/current`
  - `GET /api/legal/current/:slug`
  - `GET /api/legal/me/status`
  - `POST /api/legal/me/accept-current`
- Current required signup documents are versioned under `2026-04-04` and stored centrally so fallback rendering and acceptance records point to the same data

**Acceptance Persistence and Legacy Backfill**

- Local signup now records current required-document acceptances for both direct register and verified-email completion flows
- Google signup now requires legal acceptance for new accounts before account creation proceeds
- Existing users with legacy `termsAcceptedVersion` data are backfilled into per-document `LegalAcceptance` rows when the current version is already on file
- Session payloads now include `user.legalAcceptance` with `needsAcceptance`, missing document slugs, current version, and the remediation path

**Google Bypass Enforcement**

- Existing Google-authenticated users who previously bypassed acceptance are no longer silently ignored
- Backend now creates a one-time in-app notification linking directly to `/settings?tab=legal` when current required acceptance is missing
- Frontend now shows a blocking legal-enforcement modal on authenticated pages, except when the user is already on Settings > Legal so they can resolve the issue there
- Modal only offers two actions: go to Settings > Legal or sign out

**Frontend Legal Surface Consolidation**

- Public legal pages now load the current legal document from `/api/legal/current/:slug`
- Termly remains the first attempt for hosted documents, but on timeout the UI now renders the StudyHub backup copy inline instead of only linking away
- Registration `LegalAcceptanceModal` now uses the same backup source for Terms and Privacy fallbacks instead of external-link-only behavior
- Settings > Legal now shows document-aware status, required-document coverage, per-document acceptance state, and writes through the new legal API

**Validation**

- `npm --prefix backend run lint`: passes with the repo's existing warning-only baseline (67 pre-existing `no-console` warnings outside this change set)
- `npm --prefix frontend/studyhub-app run lint`: passes
- `npm --prefix frontend/studyhub-app run build`: passes
- `npm --prefix backend test`: still failing in pre-existing/unrelated suites including `test/notes.routes.test.js`, `test/security.headers.test.js`, and `test/sheet.workflow.integration.test.js`; no failure output referenced the new legal module or `/api/legal` routes

**Follow-up Validation (2026-04-05)**

- Applied `npm --prefix backend run db:migrate` locally and confirmed `20260405110000_add_legal_documents_and_acceptances` deployed to the local PostgreSQL instance
- Regenerated the backend Prisma client with `Set-Location backend; npx prisma generate`; local backend boot initially failed until the new `prisma.legalDocument` and `prisma.legalAcceptance` delegates were generated
- Added focused backend coverage in `backend/test/legal.routes.test.js` and `backend/test/auth.google.routes.test.js`
- `npm --prefix backend run test -- test/legal.routes.test.js test/auth.google.routes.test.js`: passes (8 tests)
- Live HTTP smoke passed against the running app stack on alternate local ports:
  - backend `GET /api/legal/current` and `GET /api/legal/current/terms` succeeded on `http://localhost:4001`
  - frontend public routes `/terms` and `/guidelines` returned `200` from Vite on `http://localhost:5174`
- Attempted a browser-level Playwright smoke for the fallback UI, but the local install is missing the underlying `playwright` package required by `@playwright/test`, so browser execution was not available in this environment

**Legal Modal Presentation Follow-up (2026-04-05)**

- Reworked the shared fallback legal renderer in `frontend/studyhub-app/src/components/LegalDocumentText.jsx` so flattened backup text is normalized into clearer titles, update metadata, section headings, callouts, lists, and table-of-contents blocks instead of rendering as a dense text wall
- Refined the signup legal review modal in `frontend/studyhub-app/src/pages/auth/LegalAcceptanceModal.jsx` with a wider card, stronger header hierarchy, better tab spacing, polished fallback document framing, and clearer hosted-copy fallback messaging
- Community Guidelines now render inside the same polished shell as the other required documents so the modal feels consistent across all three tabs
- `Set-Location frontend/studyhub-app; npx eslint src/components/LegalDocumentText.jsx src/pages/auth/LegalAcceptanceModal.jsx`: passes
- `npm --prefix frontend/studyhub-app run build`: passes

**PR #191 Review Follow-up (2026-04-05)**

- Fixed `frontend/studyhub-app/src/pages/settings/LegalTab.jsx` so refetches triggered by session changes reset `loading` and clear stale errors before calling `fetchMyLegalStatus()`, preventing the Settings > Legal view from getting stuck in an old error state after recovery
- Fixed `frontend/studyhub-app/src/pages/auth/LegalAcceptanceModal.jsx` so Terms and Privacy fallback branches are marked reviewed when the non-Termly backup content is displayed, which prevents `Accept All` from remaining disabled when embeds are intentionally absent or time out
- Fixed `frontend/studyhub-app/src/pages/legal/LegalDocumentPage.jsx` so the “StudyHub Backup Copy” badge only appears when a hosted Termly document timed out, not for internal-only documents like Community Guidelines
- Strengthened `backend/src/modules/legal/legal.seed.js` normalization so flattened legal source files regain clearer line breaks around titles, updated dates, table-of-contents sections, numbered headings, and known list blocks before being seeded into the database
- `Set-Location frontend/studyhub-app; npx eslint src/pages/settings/LegalTab.jsx src/pages/auth/LegalAcceptanceModal.jsx src/pages/legal/LegalDocumentPage.jsx`: passes
- `npm --prefix backend run lint`: passes with the repo's existing warning-only baseline (67 pre-existing `no-console` warnings outside this change set)
- `npm --prefix frontend/studyhub-app run build`: passes

### Subscription System Overhaul

**Root Cause Fixed: Invalid Date in Prisma upsert**

- All 4 subscription write paths (admin sync, user sync, webhook checkout, webhook update) were passing `new Date(undefined * 1000)` which produces `Invalid Date`
- Prisma rejects `Invalid Date` for DateTime fields, causing silent write failures
- Fixed with null-safe conversion: `sub.current_period_start ? new Date(sub.current_period_start * 1000) : null`
- This was the root cause of ALL subscription detection failures

**Webhook Error Handling**

- Webhook handler now returns 500 on DB failure (was returning 200, preventing Stripe from retrying)
- Sync endpoints now surface actual Prisma error messages instead of swallowing them

**PricingPage Redesign**

- Complete rewrite with proper subscribed state detection
- Shows "You are on Pro" badge and plan card when subscribed
- Subscribe buttons hidden for Pro users, show "Subscribed (Monthly/Yearly)"
- Special Offers, Referral Codes, Gift Subscription, Redeem Code moved FROM Settings
- Donation section with custom amounts
- FAQ accordion
- All colors use `--sh-*` CSS tokens (dark mode compatible)
- Entrance animations (fadeInUp, staggerEntrance)

**SubscriptionTab Redesign**

- Simplified from 1335 to 553 lines
- Plan status card with plan image (not letter "P")
- Usage dashboard: 4 metric cards with progress bars (sheets, AI messages, groups, video storage)
- Quick actions: Manage Payment Method, Cancel, Reactivate
- Payment history table with pagination and receipt links
- Sync recovery link at bottom

**SupportersPage Dark Mode**

- All hardcoded hex colors replaced with `--sh-*` tokens
- Hero gradient uses CSS variables

**Admin Revenue Tab**

- Sync now shows actual error message when it fails
- MetricCard colors fixed from hardcoded "white" to `var(--sh-heading)`

### Badge System

**DonorBadge Component Created**

- Green gradient "Supporter" badge matching ProBadge pattern
- Props: isDonor, donorLevel (bronze/silver/gold), size (xs/sm/md)
- Tooltip shows level-specific text

**Badges Wired Into Profile**

- UserProfilePage now uses ProBadge and DonorBadge components
- Replaced inline hardcoded badge styles

### Feed Fixes

**For You Feed**

- Fixed `undefined` values in `notIn` array causing Prisma query failure
- Added `.filter(Boolean)` to exclude undefined/null from blocked user IDs
- Error messages now surface actual backend error instead of generic "Could not load"
- Fixed follow button bug (was setting isFollowing=true in error handler)

**PR #190 Follow-up Hardening (2026-04-06)**

- Fixed admin analytics aggregation bugs in `backend/src/modules/admin/admin.analytics.controller.js`:
  - `/analytics/user-roles` now returns numeric counts from Prisma `groupBy(... _count._all)`
  - `/analytics/engagement-totals` now counts `UserFollow` records instead of the nonexistent `follow` delegate and only includes `status: 'active'`
- Hardened admin audit exports in `backend/src/modules/admin/admin.audit.controller.js` so nested arrays and objects redact sensitive keys recursively and mask nested email addresses instead of only sanitizing the top-level object
- Tightened feed discovery degradation in `backend/src/modules/feed/feed.discovery.controller.js` so missing-table cases still degrade gracefully, but unexpected Prisma/database errors are captured and rethrown instead of being silently swallowed
- Updated note and feed comment editing UI so the Edit action disappears after the 15-minute edit window instead of remaining visible with a no-op click
- Hardened feed-card sharing with clipboard failure handling, manual copy fallback, and toast-timer cleanup to avoid stale timers on unmount
- Added abort/cleanup handling to the admin audit-log user search debounce flow to prevent stale requests and post-unmount state updates
- Ignored `.superpowers/**/state/` runtime artifacts and removed tracked local state files from the repo

**Validation**

- `npm --prefix backend run test -- admin.routes.test.js`: passes (11 tests)
- `npm --prefix backend run lint`: passes with the repo's existing warning-only baseline (67 pre-existing `no-console` warnings outside this change set)
- `Set-Location frontend/studyhub-app; npx eslint src/pages/feed/FeedCard.jsx src/pages/feed/CommentSection.jsx src/pages/notes/NoteCommentSection.jsx src/pages/admin/moderation/AuditLogSubTab.jsx`: passes

**Deferred Risk Notes**

- No dedicated automated regression test was added yet for feed discovery missing-table/error propagation paths; the controller logic is hardened, but route-level coverage for `/api/feed/for-you` and `/api/feed/recommended-groups` is still a gap

### Block/Mute System

**New Endpoints Implemented**

- `POST /api/users/:username/block` - Block user (removes follows in both directions)
- `DELETE /api/users/:username/block` - Unblock user
- `POST /api/users/:username/mute` - Mute user (one-directional)
- `DELETE /api/users/:username/mute` - Unmute user
- All rate limited, idempotent, with graceful degradation

### Video Player

- Volume, muted state, and playback speed now persist via localStorage
- Restored on next page load

### Subscription Enforcement (from laptop session)

- Fork route now checks upload quota
- Study group privacy change checks private group limit
- AI message limits synced (10 free, 60 donor, 120 pro)
- Video duration display corrected (30 min free, not 5 min)
- getUserPlan/userBadges/getUserSubscription all include past_due as active

### Notes Rich Text Editor Upgrade

- Replaced markdown textarea with TipTap WYSIWYG editor
- Reuses existing RichTextEditor component from sheets
- Added `themeAware` prop for light/dark mode adaptation
- Backward compatible: detects markdown content and converts to HTML on load
- Full toolbar: headings, formatting, lists, code blocks, math (KaTeX), images, links, undo/redo
- CSS theme overrides in richTextEditor.css for note-specific styling

### Files Changed

Backend:

- `payments.routes.js` - Webhook 500 on failure, sync error surfacing, debug endpoint, user sync
- `payments.service.js` - Invalid Date fix in all handlers
- `feed.discovery.controller.js` - For You undefined fix, error surfacing
- `users.controller.js` - Block/mute endpoints
- `users.routes.js` - Block/mute routes, cleaned unused imports

Frontend:

- `PricingPage.jsx` - Complete redesign
- `SubscriptionTab.jsx` - Simplified redesign with plan images
- `SupportersPage.jsx` - Dark mode tokens
- `RevenueTab.jsx` - Error surfacing, color fix
- `DonorBadge.jsx` - New component
- `UserProfilePage.jsx` - ProBadge + DonorBadge wired in
- `ForYouSection.jsx` - Follow bug fix, error display
- `StudyHubPlayer.jsx` - Volume persistence
- `RichTextEditor.jsx` - themeAware prop
- `EditorToolbar.jsx` - themeAware prop
- `NoteEditor.jsx` - TipTap WYSIWYG upgrade
- `notesComponents.jsx` - HTML content renderer
- `notesConstants.js` - HTML word count

### Legal Compliance Integration (Termly)

**Consent Banner**

- Termly resource-blocker script added to `index.html` head
- Auto-blocks non-essential cookies until user consent
- Website UUID: `f44c5c0c-a4fc-4ca4-980b-89068e5aeb41`

**Registration Legal Acceptance Modal**

- Created `LegalAcceptanceModal.jsx` with 3-tab interface (Terms, Privacy, Guidelines)
- Terms and Privacy tabs load Termly-hosted policies via iframe
- Guidelines tab renders inline content with scroll-to-bottom tracking
- Accept button disabled until all 3 documents are viewed
- Checkbox on register page now opens modal (readOnly, not directly togglable)
- `termsVersion` sent to backend on registration, stored in User record

**New Legal Pages**

- `CookiePolicyPage.jsx` at `/cookies` - Termly cookie policy iframe
- `DisclaimerPage.jsx` at `/disclaimer` - Termly disclaimer iframe
- `DataRequestPage.jsx` at `/data-request` - Termly DSAR form iframe for GDPR/CCPA data requests
- Routes added to App.jsx

**Legal Page Layout Updates**

- `RELATED_LINKS` updated to include all 6 pages (Terms, Privacy, Cookies, Guidelines, Disclaimer, Data Request)
- Footer updated with all legal links + Consent Preferences trigger

**Settings Legal Tab**

- 9th tab added to SettingsPage: "Legal"
- Terms acceptance status with version checking
- Legal document cards grid linking to each page
- Privacy controls: Consent Preferences (Termly) + Data Request link

**App Footer**

- Created `AppFooter.jsx` component
- Links to all 6 legal pages + Consent Preferences
- Minimal design with `var(--sh-muted)` styling

**Backend: Terms Acceptance Tracking**

- Added `termsAcceptedVersion` (String?) and `termsAcceptedAt` (DateTime?) to User model
- Migration: `20260404200000_add_terms_acceptance_tracking`
- `GET /api/users/me/terms-status` - Returns accepted version, current version, needsUpdate flag
- `POST /api/users/me/terms-accept` - Records acceptance of terms version
- Registration endpoint stores `termsAcceptedVersion` and `termsAcceptedAt` on user creation

**Constants**

- `legalVersions.js` - CURRENT_TERMS_VERSION, Termly UUIDs, policy URLs, DSAR URL

### Donor Benefits System

**Donor Tier Added to PLANS**

- 15 uploads/month, 60 AI messages/day, 4 private groups, 100 bookmarks
- 45 min video, 1 GB file size, 1 GB storage
- Upload quota enforcement uses `getUserTier()` (resolves free/donor/pro)

**Subscription Tab Updates**

- Plan icon shows actual plan images (not letter "P")
- Donor plan shows `plan-donation.png`
- Donor status badge with green "Supporter" styling

**Video Upload Tier Enforcement**

- Drop zone shows tier-specific limits (size + duration)
- Client-side validation on file selection with duration check via video metadata
- Upload button disabled when file exceeds tier limits
- Clear error messages with upgrade suggestions

### For You Feed Fix

- Fixed `undefined` values in Prisma `notIn` array (`.filter(Boolean)`)
- Error messages now surface actual backend error

---

## Phase 2 — Fork & Contribute (2026-04-08)

### Backend

- `GET /api/sheets/:id/contributors` — lineage-wide top contributors
- `GET /api/sheets/:id/fork-tree` — nested tree of published forks
- `GET/POST/DELETE /api/sheets/contributions/:id/comments` — hunk-level inline comments
- Migration: `20260408000001_add_contribution_comments`
- 24 backend unit tests

### Frontend

- DiffViewer extended with line-selection + inline comments panel
- Pre-submit 3-checkbox checklist on Contribute tab
- TopContributorsPanel + ForkTreePanel on viewer sidebar
- Shared ForkTree component extracted from SheetLabLineage
- 6 Playwright E2E tests

## Phase 3 — Sheet Lab Editor Toggle (2026-04-08)

### Editor Mode Toggle

- Rich Text and HTML/Code as equal siblings; Markdown is legacy (one-way migration only)
- CodeMirror 6 HTML editor (~120KB gz) with syntax highlighting, autocomplete
- Lossy-conversion detector + confirmation modal before HTML to Rich Text switch
- `@tiptap/extension-table` 2.x — tables now round-trippable
- StackedEditorPane (vertical editor+preview, collapsible) on SheetLab + Upload page
- HTML preview iframes hardened to `sandbox=""`
- 18 Vitest unit tests, 3 Playwright E2E tests

### Bug Fixes

- AI bubble hides when Messages chat panel is open (ChatPanelProvider context)
- Rejected sheets show "Rejected" badge, not "PENDING REVIEW"
- Admin Interactive Preview tab no longer stuck on "Loading..."
- Fullscreen HTML preview: Escape key exits, stronger exit CTA

## Phase 4 — Study Groups Media + BookHub Art (2026-04-09)

### Track A — Group Media Paywall

- Migration: `20260409000001_add_group_media_and_backgrounds`
- Weekly media quota: free 5/week, pro 100/week, admin unlimited
- `POST /resources/upload` — multer diskStorage, 25MB cap, MIME allowlist
- `GET /resources/media-quota` — quota snapshot
- Resources + discussions accept structured media metadata + attachments
- GroupBackgroundPicker — owner-curated banner with gallery + custom upload
- 16 backend unit tests, 5 Playwright smoke tests

### Track B — BookHub Art

- Winslow Homer "Girl Reading Under an Oak Tree" behind BookHub hero
- `color-mix` gradient overlay, dark mode variant, on-image attribution

## Phase 5 — Trust & Safety Suite (2026-04-09)

### Report System

- Migration: `20260409000002_add_group_trust_and_safety` (GroupReport, GroupAppeal, GroupAuditLog, GroupBlock + moderation columns on StudyGroup/StudyGroupMember/GroupDiscussionPost)
- Full report flow: submit, auto-lock at 5 reporters/24h, admin review (dismiss/warn/lock/delete), appeal
- Reporter anonymity + reporter-hiding from list/search/detail
- Admin Group Reports tab with status filters + action buttons
- Private-group join notifications to full admin+mod team
- 24 backend unit tests

### Safety Features

- Block users from groups (endpoints + immediate membership removal)
- Mute users (time-boxed 1-90 days, enforced on resources + discussions)
- Member-list privacy toggle
- Join-gate message field (visible to mods)
- Post-approval queue (pending_approval status, approve/reject endpoints)
- Two-strikes auto-ban on mod-removed posts (30-day rolling window)
- Link safety check (static blocklist of bad TLDs, IP loggers, suspicious paths)
- Audit log endpoint (IP+UA redacted from non-platform-admins)

### Infrastructure

- Soft-delete for groups (30-day retention instead of hard delete)
- `@upstash/redis` installed; `redis.js` cached() helper operational
- Performance indexes migration (`20260409200000`)
- `groupJoinLimiter`, `groupReportLimiter`, `groupAppealLimiter` rate limiters
- docker-compose.yml: DIRECT_URL + password derivation fix
- Group Avatar vs Background labels clarified in Edit modal

### Test Coverage Added

- Backend: plagiarism, r2Storage, rateLimiters, socketio, storage, videoConstants, webauthn
- Frontend E2E: courses, dashboard, legal, library, playground

## Phase 0 — Waitlist System (2026-04-10)

### Module Refactor

- Inline waitlist route from `index.js` extracted into `backend/src/modules/waitlist/` (routes, service, index)
- Standard module pattern matching all other StudyHub modules

### Waitlist Signup (0.1 + 0.2)

- `POST /api/waitlist` — validates email + tier, creates row, fires confirmation email (fire-and-forget), creates in-app notification if caller is logged in
- Confirmation email personalized by tier (Pro vs Institution copy)
- Duplicate signups return 200 with "already on the waitlist" (no error)

### Admin Dashboard (0.3)

- `GET /api/admin/waitlist` — paginated list with tier/status/search filters
- `GET /api/admin/waitlist/stats` — aggregate counts (total, by tier, by status, daily signups last 30 days)
- `POST /api/admin/waitlist/export` — CSV download with formula-injection defense
- `POST /api/admin/waitlist/invite` — mark single entry as invited + send invitation email
- `POST /api/admin/waitlist/invite-batch` — invite first N entries by tier (max 500)
- `DELETE /api/admin/waitlist/:id` — soft-remove entry (status='removed')
- Frontend: `WaitlistTab.jsx` (lazy-loaded) with stat cards, data table, search, tier/status filters, Export CSV + Batch Invite buttons, pagination

### Schema

- Migration: `20260410000001_waitlist_status_fields`
- Waitlist model: added `status` (waiting/invited/converted/removed), `invitedAt`, `convertedAt`, `notes`

## Phase 5 — Security Hardening (2026-04-10)

### Input Sanitization Middleware

- `inputSanitizer.js` runs after `express.json()` on every request
- Rejects: null bytes, control characters, strings >10KB, JSON depth >5, arrays >1000, objects >200 keys, duplicate query params

### Password Breach Check (HIBP)

- `passwordSafety.js` — k-anonymity model (first 5 hex of SHA-1 sent to HIBP, suffix checked locally)
- Wired into registration + password-reset handlers
- Graceful degradation on HIBP timeout (3s)

### AI Prompt Injection Defense

- `ai.inputSanitizer.js` — scans for instruction overrides, role reassignment, system prompt extraction, delimiter injection
- Flagged messages logged to Sentry; still sent to Claude (which politely declines)
- Output scanning for leaked system prompt fragments + PII patterns

### Secret Validation on Startup

- `secretValidator.js` — checks required (JWT_SECRET, DATABASE_URL) + recommended (Stripe, Sentry, Redis, etc.) at boot
- Missing required secrets in production cause hard exit

## Phase 1 — AI Weekly Limits (2026-04-10)

### Weekly Message Ceilings

- `WEEKLY_LIMITS`: default 100, verified 250, donor 300, pro 600, admin 1000
- `getWeeklyLimit(user)`, `getWeeklyUsage(userId)`, `getUsageQuota(user)` in ai.service
- `streamMessage` checks weekly limit after daily limit
- `GET /api/ai/usage` returns both daily + weekly quota snapshot

### Frontend Quota Display

- AiBubble: `AiQuotaBar` component shows "12/30 today" + "85/100 this week" with thin progress bars
- AiPage: `QuotaRow` component with the same dual-bar display + "Upgrade for more messages" CTA when weekly limit hit
- Bars turn amber at >80% usage, red at 100%
- Backward-compatible with the legacy flat `messagesUsed/messagesLimit` response shape

## Phase 2 — User Product Reviews (2026-04-10)

### Settings ReviewTab

- Star rating picker (1-5 clickable stars with hover preview, CSS-only)
- Text feedback textarea with live character counter (500 max)
- Submit creates or updates via POST /api/reviews
- Existing pending reviews editable; approved reviews read-only with badge
- Success toast: "Thank you! Your review is pending approval."

### Admin ReviewsTab

- Already existed at 631 lines — list, approve/reject, AI report generation

### Public Reviews on About Page

- `PublicReviews` component fetches GET /api/reviews/public
- Card grid with star display, review text, student username
- Average rating calculated + displayed
- Hidden when no approved reviews exist

## Phase 5 Batch 2 — Security Dashboard + Approval Queue UI (2026-04-10)

### Admin Security Tab

- `GET /api/admin/security/stats` — total users, locked accounts, failed attempts (3+), signups (24h/7d), pending reviews, pending reports, waitlist, audit actions (24h)
- `POST /api/admin/security/unlock/:userId` — manually unlock a locked account
- `SecurityTab.jsx` (lazy-loaded): 9 stat cards, failed-login table with Unlock buttons

### Post-Approval Queue UI

- "Pending Approval" amber badge + "Removed" red badge on discussion posts
- Approve (green) / Reject (red) buttons for admins/mods on pending posts
- `approvePost()` + `rejectPost()` wired through useGroupDiscussions → useStudyGroupsData → GroupDetailView → GroupDiscussionsTab

### Confirmed Already Built

- Block/mute UI in GroupMembersTab (665 lines, fully wired to backend)
- GDPR data export (settings.export.controller, 225 lines)

## Phase 3 — Messaging Auto-Scroll (2026-04-10)

### Scroll UX Overhaul

- Instant scroll to bottom on conversation switch (behavior: 'instant')
- IntersectionObserver tracks "at bottom" state
- Auto-scroll on new messages only when already at bottom (sticky scroll)
- "Jump to latest" floating button with new-message count badge (capped at 99+)
- Typing indicator only scrolls when at bottom

---

## Phase 4 — Plagiarism Detection System (2026-04-10)

### Multi-Layer Detection Pipeline

- Layer 1: Multi-window SimHash (3/5/7 shingle widths) with FNV-1a 64-bit hashing for structural similarity
- Layer 2: N-gram frequency analysis (2-gram and 3-gram cosine similarity) plus structural fingerprinting (heading comparison)
- Layer 3: AI-powered analysis via Claude for ambiguous matches in the 0.70-0.85 similarity range with daily cap (50/day)
- `comprehensiveSimilarity()` in `contentFingerprint.js` combines all signals and returns per-method scores plus a best-of composite
- Full corpus scan (up to 2000 most-recent published sheets) on every sheet create/update, fire-and-forget

### Backend Module (`/api/plagiarism`)

- `GET /api/plagiarism/sheet/:id` — returns aggregate stats (totalMatches, highestScore, hasLikelyCopy) plus individual report cards with per-method scores, AI verdicts, and dispute status; author or admin only
- `POST /api/plagiarism/sheet/:id/dispute` — file a dispute with reason (min 10 chars, max 2000); creates PlagiarismDispute row
- `POST /api/plagiarism/sheet/:id/rescan` — clears pending reports and re-runs the full scan after content revision
- Module barrel, route mounting at `/api/plagiarism` in main index.js, rate limiters applied

### Database Schema

- `PlagiarismReport` model: sheetId, matchedSheetId, similarityScore, matchType (exact|simhash|ngram|ai), highlightedSections (JSON scores), aiVerdict, aiConfidence, status (pending|confirmed|dismissed|disputed)
- `PlagiarismDispute` model: reportId, userId, reason, status (pending|accepted|rejected), reviewedBy, reviewedAt
- Compound unique constraint on (sheetId, matchedSheetId) for upsert pattern
- Migration: `20260410000002_add_plagiarism_tables`

### Scan Triggers

- Sheet create controller (`sheets.create.controller.js`): fires Phase 4 `runPlagiarismScan` after legacy check
- Sheet update controller (`sheets.update.controller.js`): same fire-and-forget pattern on content changes
- Notifications: author receives plagiarism_flagged notification with link to `/sheets/:id/plagiarism`

### AI Analysis Layer

- Lazy-initialized Anthropic client (`getAiClient()`) with graceful degradation when API key unavailable
- Daily cap tracked via `PlagiarismReport` count where `matchType = 'ai'`
- AI verdict of `likely_copy` with confidence >= 0.7 upgrades matchType to `ai` and boosts score
- `coincidental`/`original` verdict caps score at 0.65 (effective dismissal)

### Frontend Report Page

- Route: `/sheets/:id/plagiarism` (lazy-loaded, PrivateRoute)
- Donut-style similarity gauge with color-coded severity (green < 0.70, yellow 0.70-0.85, red >= 0.85)
- Per-report cards showing matched sheet info (avatar, title, author), status badge, match type label, and per-method score bars (SimHash, 2-gram, 3-gram, Structure)
- AI verdict display panel when AI analysis was performed
- Inline dispute filing form (textarea, 10-2000 chars, submit/cancel)
- Rescan button with status feedback and auto-refetch after 3 seconds
- Clean/all-clear state with checkmark icon when no matches exist

### Validation

- Backend lint: `npx eslint src/modules/plagiarism/ src/index.js src/modules/sheets/sheets.create.controller.js src/modules/sheets/sheets.update.controller.js` — passes (0 errors, 2 pre-existing warnings)
- Frontend lint: `npx eslint src/pages/plagiarism/PlagiarismReportPage.jsx src/App.jsx` — passes
- Frontend build: `npm run build` — passes

---

### Session Management — Per-Device Session Tracking and Revocation

**Server-side session tracking enables per-device sign-out, session revocation, and active session visibility.**

Previously, the auth system was purely stateless JWT with no server-side tracking. Logout only cleared the browser cookie while the JWT remained valid until its 24-hour expiry. There was no way to revoke a specific device's access or see which devices were signed in.

#### Database Layer

- **New model**: `Session` in `schema.prisma` with fields: `id` (cuid), `userId` (FK to User), `jti` (unique JWT ID), `userAgent`, `ipAddress`, `deviceLabel` (auto-parsed), `lastActiveAt`, `expiresAt`, `revokedAt`, `createdAt`
- **Migration**: `20260405000001_add_session_table/migration.sql` — creates table, unique index on `jti`, indexes on `userId`, `jti`, `expiresAt`, foreign key with `ON DELETE CASCADE`

#### Backend Session Service (`backend/src/modules/auth/session.service.js`)

- `createSession({ userId, userAgent, ipAddress })` — generates cryptographic JTI (`crypto.randomUUID()`), parses user-agent into human-readable device label, stores session row with 24-hour expiry
- `validateSession(jti)` — checks exists + not revoked + not expired
- `touchSession(jti)` — updates `lastActiveAt` (fire-and-forget from middleware)
- `revokeSession(sessionId, userId)` — ownership-checked single session revocation
- `revokeSessionByJti(jti)` — used by logout to revoke current session
- `revokeAllOtherSessions(userId, currentJti)` — bulk revocation excluding current session
- `getActiveSessions(userId)` — lists non-revoked, non-expired sessions ordered by `lastActiveAt`
- `cleanupExpiredSessions()` — deletes sessions expired > 7 days (periodic cleanup)
- `parseDeviceLabel(ua)` — lightweight user-agent parser (Chrome/Firefox/Safari/Edge/Opera + Windows/macOS/Linux/Android/iOS/ChromeOS)

#### Auth Flow Integration

- **`authTokens.js`**: `signAuthToken(user, options)` now accepts optional `{ jti }` to embed in JWT payload
- **`auth.service.js`**: `issueAuthenticatedSession(res, userId, req)` now accepts `req` parameter, creates server-side session via `createSession()`, embeds JTI in JWT. Wrapped in try-catch for graceful degradation if Session table does not exist
- **`requireAuth` middleware**: When JWT contains a JTI, validates the session (checks not revoked/expired). Revoked sessions get `AUTH_EXPIRED` response. Attaches `req.sessionJti` for downstream use. Fires `touchSession()` for activity tracking. All session operations wrapped in try-catch for graceful degradation
- **Logout**: `POST /logout` now extracts JTI from token and revokes the session row before clearing the cookie
- **All 5 call sites updated**: login controller, register controller (2 paths), Google OAuth controller (2 paths) — all pass `req` as third argument to `issueAuthenticatedSession`

#### API Endpoints (mounted under `/api/auth/`)

- `GET /api/auth/sessions` — returns `{ sessions: [{ id, deviceLabel, ipAddress, lastActiveAt, createdAt, isCurrent }] }`. Current session is identified by matching JTI
- `DELETE /api/auth/sessions/:sessionId` — revokes a single session (ownership-checked)
- `DELETE /api/auth/sessions` — revokes all sessions except the current one

#### Frontend Sessions Tab (`frontend/studyhub-app/src/pages/settings/SessionsTab.jsx`)

- Added to `SettingsPage.jsx` as the third tab ("Sessions") between Security and Notifications
- Skeleton loading state, error state with retry button
- Session cards with: Material Symbols device icon (smartphone/laptop/desktop), device label, "This device" badge for current session, IP address, relative timestamp for last active and sign-in time
- Current session card highlighted with brand border and accent background
- Per-session "Revoke" button (danger style) with loading state
- "Sign Out Other Devices" section card (danger) with bulk revocation button, only shown when other sessions exist
- Action feedback via success/error messages

#### Backward Compatibility

- All session operations use try-catch with graceful degradation — the system works with pre-migration tokens (no JTI) and before the Session table is migrated
- Existing tokens without JTI continue to work normally (session validation is skipped)
- No breaking changes to the auth API contract

### Validation

- Backend lint: `npx eslint` on session.service.js, auth.session.controller.js, auth.service.js, auth.js, authTokens.js — passes
- Frontend lint: `npm run lint` — passes
- Frontend build: `npm run build` — passes

---

## Study Status: Backend Sync, Status Chips, and Nudges

**Study Status moves from local-only localStorage to a server-synced model, becomes visible on every sheet surface, and drives contextual nudges on the dashboard.**

### 1. Backend Sync (cross-device persistence)

#### Database

- New `StudyStatus` model in Prisma schema with composite PK `(userId, sheetId)`, `status` string, and `updatedAt` timestamp
- Migration: `20260413170000_add_study_status_table` — creates table, indexes on `(userId, status)` and `sheetId`, foreign keys to User and StudySheet with CASCADE delete

#### API (mounted at `/api/study-status`)

| Method | Path               | Description                                                                    |
| ------ | ------------------ | ------------------------------------------------------------------------------ |
| GET    | `/`                | All statuses for the authenticated user (with sheet title and course code)     |
| GET    | `/batch?ids=1,2,3` | Statuses for specific sheet IDs (max 100)                                      |
| PUT    | `/:sheetId`        | Set or clear a status (`to-review`, `studying`, `done`, or null to clear)      |
| POST   | `/sync`            | Bulk upsert from localStorage (one-time migration on first authenticated load) |

- Rate limiters: `studyStatusReadLimiter` (60/min), `studyStatusWriteLimiter` (30/min per user)
- Module follows standard pattern: `studyStatus.service.js`, `studyStatus.routes.js`, `index.js`

#### Frontend Hook Rewrite

- `useStudyStatus(sheetId)` — same API, now syncs to backend for authenticated users with optimistic updates
- `useAllStudyStatuses()` — same API, drives dashboard widgets from server state
- `useStudyStatusBatch(sheetIds)` — new hook for batch lookups on card list pages
- `clearStudyStatusCache()` — called on logout via `session.js`
- Guest fallback: localStorage read/write preserved for unauthenticated users
- Auto-migration: on first authenticated load, any existing localStorage entries are synced to the server via POST `/sync`, then localStorage is cleared

### 2. Status Chips on Sheet Cards

- New `StudyStatusChip` component (`src/components/StudyStatusChip.jsx`) — tiny pill with status-aware color (warning/brand/success)
- **SheetsPage**: `useStudyStatusBatch` derives statuses for visible sheets, passed to each `SheetListRow` via `studyStatus` prop; chip appears next to the title
- **FeedPage**: batch lookup for sheet-type feed items, threaded through `VirtualFeedList` to `FeedCard`; chip appears in the header row next to the course code
- **Profile page**: `PinnedSheetsSection`, `RecentSheetsSection`, `StarredSheetsSection` accept optional `studyStatusMap` prop; chips appear in the metadata row
- Status is personal — chips only appear for the viewing user's own study state, not on other users' profile views

### 3. Status-Driven Nudges

- New `StudyNudges` widget in `DashboardWidgets.jsx` with three nudge types:
  - **Stale review**: sheets marked "To review" for 7+ days — warning-colored card prompting review or clearing
  - **Resume studying**: sheets marked "Studying" not touched for 3+ days — info-colored card linking to the sheet
  - **Completion streak**: every 5th completed sheet — success-colored card celebrating progress
- Rendered on Dashboard (between ResumeStudying and content grid), own-profile Overview tab, and Study tab
- Each nudge is a clickable Link to the relevant sheet or sheets page

### Files Changed

Backend:

- `backend/prisma/schema.prisma` — added `StudyStatus` model and relations on User and StudySheet
- `backend/prisma/migrations/20260413170000_add_study_status_table/migration.sql` — new
- `backend/src/modules/studyStatus/studyStatus.service.js` — new
- `backend/src/modules/studyStatus/studyStatus.routes.js` — new
- `backend/src/modules/studyStatus/index.js` — new
- `backend/src/lib/rateLimiters.js` — added studyStatus limiters
- `backend/src/index.js` — import and mount at `/api/study-status`

Frontend:

- `frontend/studyhub-app/src/lib/useStudyStatus.js` — rewritten for backend sync
- `frontend/studyhub-app/src/lib/session.js` — clear study status cache on logout
- `frontend/studyhub-app/src/components/StudyStatusChip.jsx` — new
- `frontend/studyhub-app/src/pages/sheets/SheetListItem.jsx` — accept and render studyStatus prop
- `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx` — batch lookup and pass to rows
- `frontend/studyhub-app/src/pages/feed/FeedCard.jsx` — accept and render studyStatus prop
- `frontend/studyhub-app/src/pages/feed/VirtualFeedList.jsx` — thread studyStatusMap
- `frontend/studyhub-app/src/pages/feed/FeedPage.jsx` — batch lookup for feed items
- `frontend/studyhub-app/src/pages/profile/ProfileWidgets.jsx` — accept studyStatusMap on sheet sections
- `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx` — derive map, pass to widgets and tabs, add nudges
- `frontend/studyhub-app/src/pages/dashboard/DashboardWidgets.jsx` — added StudyNudges widget
- `frontend/studyhub-app/src/pages/dashboard/DashboardPage.jsx` — render StudyNudges
- `frontend/studyhub-app/src/pages/dashboard/useDashboardData.js` — expose studyDone

### Validation

- Backend lint: passes (0 errors)
- Backend tests: 83 files, 1300 tests pass
- Frontend lint: passes (0 errors)
- Frontend build: passes

---

## 2026-04-16 — Prisma 6.19 groupBy validation fixes + Google Books Sentry noise reduction

### Summary

Three Sentry issues against the production backend were traced to two root causes:

1. Prisma 6.19+ removed the `_all` pseudo-field from `orderBy._count`. Two call sites (`sheetCommit.groupBy` for sheet contributors, `studySheet.groupBy` for popular courses) still used it, triggering `PrismaClientValidationError` on every request.
2. The popular-courses query also carried a `NOT: [{ courseId: null }]` clause. `StudySheet.courseId` is a non-nullable `Int`, and Prisma 6.19+ now rejects null comparisons on required fields with "Argument `courseId` is missing."

A separate issue — `Error: Google Books search failed: 503` — was being logged to Sentry on every upstream 5xx even though the library service already falls back to the cached-book table. The capture now runs only when the fallback also has no data, so the signal reflects real user-impacting outages.

### Changes

Backend:

- `backend/src/modules/sheets/sheets.contributors.controller.js` — replace `_count: { _all: true }` / `orderBy: { _count: { _all: 'desc' } }` with the grouped column (`userId`); update the row accessor accordingly.
- `backend/src/modules/courses/courses.schools.controller.js` — drop the invalid `NOT: [{ courseId: null }]` clause (field is non-nullable), count/order by `courseId`, update the row accessor.
- `backend/src/modules/library/library.service.js` — in both `searchBooks` and `getBookDetail`, consult the cached-book fallback first and only call `captureError` when it also returns empty. Added `fallbackAvailable: false` context so the remaining Sentry events are always real degradations.

Tests:

- `backend/test/sheets.contributors.routes.test.js` — fixtures switched to `_count: { userId: N }`; asserted the new `_count` / `orderBy` shape.
- `backend/test/courses.routes.test.js` — fixtures switched to `_count: { courseId: N }`; asserted `where.NOT` is absent and the new `_count` / `orderBy` shape.

### Validation

- Backend lint: passes (0 errors)
- Changed-file tests (`sheets.contributors.routes`, `courses.routes`, `library.service`, `library.routes`): 32/32 pass
- Backend full suite: 1205 tests pass; the 13 file-level failures are pre-existing on `local-main` (module-load issues in unrelated users/attachments/security suites) and reproduce with the Prisma fixes stashed.
- Frontend build: passes

---

## 2026-04-16 — Remove Upstash Redis caching layer

### Summary

The Upstash Redis add-on was costing more than the cache was saving — traffic is low enough that the response-time delta per request is small, and the database can easily handle the uncached load. Every call site already had a graceful-degradation fallback (`if (!client) return fetcher()`), so removing the caching layer is safe and required no change to the API contract. Step 1 (unsetting `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN` in Railway and deleting the Upstash database) was done manually. This commit completes step 2 — removing the code and dependency.

### Changes

Backend:

- `backend/src/lib/redis.js` — deleted. All `cached()` / `invalidate()` / `ping()` call sites now talk to Prisma directly.
- `backend/src/modules/announcements/announcements.routes.js` — inlined `prisma.announcement.findMany` on the list endpoint; removed the two `invalidate('announcements:list')` calls on create/delete (no longer needed).
- `backend/src/modules/dashboard/dashboard.routes.js` — rewrote `GET /summary` to call Prisma directly; cleaned up the stray `return res.status(404).json(...)` that was returning through the old cached fetcher.
- `backend/src/modules/courses/courses.schools.controller.js` — inlined the `schools` and `popular` queries; the popular endpoint now early-returns `res.json([])` when there are no grouped rows.
- `backend/src/modules/feed/feed.leaderboard.controller.js` — inlined `getLeaderboard(prisma, period, limit)`.
- `backend/src/modules/feed/feed.discovery.controller.js` — inlined the three cached blocks in `/trending`, `/for-you`, and `/courses/:courseId/discover`.
- `backend/src/modules/public/public.routes.js` — inlined `/platform-stats`; removed the Redis leg from `/health` (database-only health check).
- `backend/src/modules/search/search.routes.js` — removed the anonymous-search cache wrapping (calls `executeSearch` directly).
- `backend/src/lib/secretValidator.js` — dropped the `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN` entries from the recommended-secrets list.
- `backend/package.json` — uninstalled `@upstash/redis`.

### Validation

- Backend lint: passes (0 errors)
- Repo-wide sweep: no remaining references to `@upstash/redis`, `lib/redis`, or `UPSTASH_REDIS_*` in `backend/src` or `backend/test`.
- Touched-file tests (`announcements.routes`, `dashboard.routes`, `courses.routes`, `feed.routes`, `public.routes`, `search.routes`, `sheets.contributors.routes`, `library.service`): 62/62 pass
- Backend full suite: 1205 tests pass; same 13 pre-existing file-level failures in unrelated suites (users / attachments / security / IDOR / sheet workflow), confirmed to reproduce on `local-main` with the Redis removal reverted.
- Frontend build: passes

---

## 2026-04-16 — Post-merge review fixes for Upstash Redis removal

### Summary

Addressed review feedback on the merged Upstash Redis removal PR. Also fixes a pre-existing `/api/feed/for-you` response-shape mismatch where the unauthenticated early-return used different keys than the authenticated path; the frontend `ForYouSection` reads `sheets`/`groups`/`people`/`trending` so the old unauthenticated keys (`recommendedSheets`/`courseActivity`/`recommendedPeople`/`trendingSheets`) were silently falling back to `[]` via `Array.isArray(result.sheets) ? ... : []`.

The reviewer comment that `dashboard /summary` lacks `requireAuth` was verified against the code and is incorrect: `dashboard.routes.js` calls `router.use(requireAuth)` on line 9 and the wrapper covers every route in the module.

### Changes

Backend:

- `backend/package-lock.json` — regenerated so `@upstash/redis` is no longer listed. Root `package-lock.json` similarly regenerated via the workspace install.
- `backend/src/modules/feed/feed.discovery.controller.js`:
  - `/trending` doc comment: replaced "Cached for 5 minutes per period" with the actual HTTP cacheControl settings (120s max-age + 300s stale-while-revalidate).
  - `/for-you` doc comment: replaced "Auth required. Cached for 2 minutes per user" with the real behavior (optionalAuth, unauthenticated callers get an empty payload matching the authenticated shape, no server-side caching).
  - `/for-you` handler: removed the unnecessary `await (async () => { ... })()` IIFE that was left over from inlining `redisCached`; the body now sits directly in the route handler with normal indentation.
  - `/for-you` unauthenticated response: keys changed from `{ recommendedSheets, courseActivity, recommendedPeople, trendingSheets }` to `{ sheets, groups, people, trending }` to match the authenticated shape and the frontend consumer.

### Not implemented

- Extracting a shared sheet-scoring helper across `/trending`, `/for-you` (sheets), and `/for-you` (trending). Deferred: the three scoring formulas differ materially (comments weight vs. none, different recency-decay time windows, per-user multipliers for the for-you sheets path), so any shared helper needs parameters for weights and decay hours. Worth doing, but it's a non-trivial refactor that deserves its own PR with test coverage.

### Validation

- Backend lint: passes (0 errors)
- Touched-file tests (`announcements.routes`, `dashboard.routes`, `courses.routes`, `feed.routes`, `search.routes`): 43/43 pass
- Backend full suite: 1205 tests pass, 75 skipped; same 13 pre-existing file-level failures on `local-main`, unrelated to these changes.
- Repo-wide sweep for `@upstash/redis` in lockfiles: 0 hits in `backend/package-lock.json` and 0 hits in the root `package-lock.json`.

---

## 2026-04-16 — Mobile app: bearer-token auth, native Google sign-in, Wave 2 AI tab

### Summary

The Capacitor Android shell could not complete login on device. Google sign-in opened Chrome and tried to return to `localhost/m/landing` (connection refused), the API base resolved to `http://localhost:4000` (device-side), and the session cookie could not flow across the Capacitor WebView origin. This change makes the mobile app a real native shell that shares accounts with the web but never depends on the web domain to work.

Approach: the backend already accepts `Authorization: Bearer <jwt>` via `getAuthTokenFromRequest` in `backend/src/lib/authTokens.js`. We wire the mobile shell to use that path — storing the JWT locally and attaching it to every API and Socket.io request. Web behavior is untouched: no cookie changes, no new endpoints required for the existing web flows, and no shared state that could leak the bearer token into web responses.

### Changes

Backend:

- `backend/src/modules/auth/auth.service.js` — added `isMobileClient(req)` and modified `issueAuthenticatedSession` to also return the raw JWT as `authToken` on the user payload when the request carries `X-Client: mobile`. Web clients never receive this field — the Set-Cookie header remains authoritative for them.
- `backend/src/lib/socketio.js` — auth middleware now accepts the JWT from the Socket.io `handshake.auth.token` field and from `Authorization: Bearer <token>` header, in addition to the existing cookie path. Web flow unchanged.

Frontend:

- `frontend/studyhub-app/src/lib/mobile/nativeToken.js` — new. Get/set/clear bearer token, plus `extractAndStoreNativeToken()` that strips `authToken` from a user payload and persists it to `localStorage` (Capacitor sandboxes localStorage per-app). No-op on web.
- `frontend/studyhub-app/src/lib/http.js` — the installed fetch shim now attaches `X-Client: mobile` and `Authorization: Bearer <token>` on every API request when running in the Capacitor native shell. Inner `/api/auth/me` bootstrap fetch includes the bearer header too, otherwise CSRF hydration 401s in a loop.
- `frontend/studyhub-app/src/lib/session.js` — `clearStoredSession()` also clears the native bearer token.
- `frontend/studyhub-app/src/lib/session-context.jsx` — `completeAuthentication` and `refreshSession` now route through `syncUser`, which calls `extractAndStoreNativeToken()` to persist the token and strip it from the cached user record.
- `frontend/studyhub-app/src/lib/useSocket.js` — on native, passes the stored bearer token through Socket.io's `auth.token` option on first connect.
- `frontend/studyhub-app/src/config.js` — native builds default to `https://studyhub-production-c655.up.railway.app` when neither `VITE_MOBILE_API_URL` nor `VITE_API_URL` is set. Web fallback to `http://localhost:4000` is preserved for dev.
- `frontend/studyhub-app/src/mobile/components/MobileGoogleButton.jsx` — rewritten. On native, opens the in-app Google account chooser via `@capgo/capacitor-social-login`, posts the returned ID token to `POST /api/auth/google` with `X-Client: mobile`, and calls `/api/auth/google/complete` with `accountType: 'student'` for brand-new accounts so sign-in is a single tap. The old redirect flow is preserved only as a web-dev fallback.
- `frontend/studyhub-app/src/mobile/components/MobileTopBar.jsx` — added an optional `left` slot so pages can render custom left-side actions (used by the AI drawer button).
- `frontend/studyhub-app/src/mobile/pages/MobileAiPage.jsx` — replaced the 32-line web-wrapper stub with a full native implementation: conversation drawer, SSE streaming via the existing `useAiChat` hook, daily usage chip, stop/continue controls, truncation continuation, markdown rendering, and an auto-sizing composer.
- `frontend/studyhub-app/src/mobile/pages/SigninBottomSheet.jsx` — sends `X-Client: mobile` explicitly on the login request (the shim also does this; explicit at the auth boundary documents intent).
- `frontend/studyhub-app/capacitor.config.json` — added `server.androidScheme: 'https'`, `server.hostname: 'localhost'`, and `server.allowNavigation` for the Railway domain + Google OAuth. The Capgo social-login plugin is initialized in JS at first tap, so no plugin block in capacitor.config is needed.
- `frontend/studyhub-app/package.json` — added `@capgo/capacitor-social-login@^8.3.14` dependency (the codetrix-studio package pins `@capacitor/core` to `^6`; Capgo supports Capacitor 8) and `mobile:build` / `mobile:sync` / `mobile:open` / `mobile:run` npm scripts.
- `frontend/studyhub-app/.env.mobile.production` — new. Pins `VITE_MOBILE_API_URL` to the Railway backend so the bundled Capacitor build never points at localhost; `VITE_GOOGLE_CLIENT_ID` is set at build time by whoever runs the pipeline.
- `frontend/studyhub-app/scripts/build-mobile.js` — new. Runs `vite build --mode mobile` then `npx cap sync android` so one command produces a synced Android project.

### Validation

- Backend lint: passes (0 errors).
- Frontend lint: passes (0 errors).
- Frontend build: succeeds (1.87s).
- Backend auth tests: 23/23 pass. Backend socket tests: 16/16 pass.
- Device verification: deferred to the user per agreement — once the deps are installed locally (`npm install` in `frontend/studyhub-app`), the user will run `npm run mobile:build` then `npx cap run android` to validate on the emulator/device.

---

## 2026-04-16 — Security hardening, dependency bumps, test coverage, mobile a11y + Google sign-in finalization

### Summary

Comprehensive hardening pass driven by a parallel security / dependency / test-coverage / accessibility audit. The session landed five security fixes across auth, payments, and Socket.io; bumped the only outstanding dependency advisory; added ~100 unit tests across three previously untested areas (rateLimiters, video, WebAuthn); applied six accessibility fixes to the mobile screens; and completed the missing pieces of the mobile native Google sign-in config that were blocking the Android build.

### Dependency hygiene

- `npm audit` across backend, frontend, and root workspaces: 1 moderate advisory (`sanitize-html` 2.17.2 — `GHSA-9mrh-v2v3-xpfm`, allowedTags bypass via entity-decoded text, CVSS 6.1). Auto-fixed in both backend and frontend via `npm audit fix`; package-locks regenerated. Post-fix: 0 vulnerabilities across all workspaces.

### Security fixes

Driven by an independent code review of the auth/payments/AI/socket layers. Verified each finding against the actual code before patching.

- **`isMobileClient` trusted an attacker-controllable header.** `backend/src/modules/auth/auth.service.js` — the `X-Client: mobile` header alone was the gate for returning the raw JWT in the response body. Any web-context code (XSS, rogue extension) could set the header and exfiltrate a 24-hour bearer, bypassing the `httpOnly` cookie protection. Now also requires `Origin` to match a Capacitor native scheme (`https://localhost` or `capacitor://localhost`). Browsers set `Origin` themselves and cross-origin attackers cannot override it, making this a non-forgeable second signal. Matching `Origin` values are already in the CORS allowlist (see `backend/src/index.js:104-106`) so no new configuration is needed.
- **Socket.io bearer-token fallback had no client-type gate.** `backend/src/lib/socketio.js` — the handshake auth / `Authorization: Bearer` fallback was accepted unconditionally. Now gated on the same Capacitor-origin check. Web XSS that captured a JWT cannot re-use it over WebSocket on the studyhub.com origin. Also refactored the middleware into an exported `authenticateSocketHandshake(socket, next)` so it can be unit-tested without booting a full Socket.io server.
- **Stripe `planFromPriceId` silently escalated unknown prices to pro_monthly.** `backend/src/modules/payments/payments.routes.js` — both the `/admin/sync-stripe` iterator and the `/subscription/sync` self-heal endpoint defaulted to `pro_monthly` when `planFromPriceId(priceId)` returned null. A user whose Stripe customer record picked up a non-pro subscription (e.g., a leftover test-mode price or discount variant) would have been auto-upgraded on the next sync. Both call sites now reject unknown price IDs and log a warning; the service-level `handleSubscriptionUpdated` path was already correct and is unchanged.
- **Stripe webhook had no Buffer guard.** `backend/src/modules/payments/payments.routes.js` — defense-in-depth: if `express.raw()` were ever removed or reordered in `index.js`, `constructEvent` would fail opaquely on a parsed body. Added a `Buffer.isBuffer(req.body)` check that fails fast with a clear signal before signature verification.
- **Google signup `tempToken` was replayable.** `backend/src/modules/auth/auth.google.controller.js` — the 15-minute signup JWT had no single-use guard, so an attacker who observed one could race the legitimate user to `/google/complete` and create the account with their chosen `accountType`. The token now carries a random `jti`, and `/google/complete` calls `markTokenUsed(jti, TTL)` before any Prisma write. Legacy tokens without `jti` are rejected and the user is asked to restart Google sign-in.
- **New library: `backend/src/lib/usedTokenCache.js`.** Process-local TTL cache for one-use JWT identifiers. Used by the Google tempToken flow today; callable from any future single-use JWT site. Scoped to single-instance deployment (sufficient for Railway); horizontal scaling would require migrating to a shared store (Redis was removed; DB table is the next option).

### Mobile native Google sign-in — completed config

The mobile-app release of 2026-04-16 wired the Capgo social-login plugin and the bearer-token auth path but referenced two configuration files that did not exist in the repo. Build of the APK was blocked on these. Both now exist:

- `frontend/studyhub-app/.env.mobile.production` — `VITE_MOBILE_API_URL` pinned to the Railway backend, `VITE_GOOGLE_CLIENT_ID` set to the web OAuth client ID (same value as backend `GOOGLE_CLIENT_ID` because Capgo issues idTokens for the web-registered client, which is what the backend `verifyIdToken({ audience })` check expects). File is `.env.*`-gitignored by the root `.gitignore`.
- `frontend/studyhub-app/android/app/src/main/res/values/strings.xml` — added `<string name="server_client_id">...</string>` so the Capgo plugin can complete the native OAuth flow.

Device verification still requires the user to run `npm run mobile:build && npx cap run android` — no device harness is available to this session.

### Mobile accessibility (WCAG 2.1 AA)

Code review of all mobile screens under `frontend/studyhub-app/src/mobile/`. Six fixes applied:

- `frontend/studyhub-app/src/mobile/mobile.css` — `.mob-topbar-back` bumped from 36×36 to 44×44 (meets iOS/Android 44pt HIG + WCAG 2.5.5 target size). Added a shared `:focus-visible` rule across the five primary interactive mobile classes (topbar back, tab bar item, auth submit, auth switch link, Google button) with `outline: 2px solid var(--sh-brand); outline-offset: 2px` so BT-keyboard users on mobile/tablet see focus.
- `frontend/studyhub-app/src/mobile/components/BottomSheet.jsx` — added `aria-labelledby` pointing at the sheet title, and an id on the `<h2>`.
- `frontend/studyhub-app/src/mobile/pages/MobileAiPage.jsx` — conversations drawer now has `role="dialog"` + `aria-modal="true"` + `aria-label`; error toast has `role="alert"` so failures are announced; loading area has `aria-busy="true"` and the spinner has `role="status"` + `aria-label`; composer textarea has `aria-label="Message Hub AI"`.
- `frontend/studyhub-app/src/mobile/pages/SigninBottomSheet.jsx` — error banner has `role="alert"`.
- `frontend/studyhub-app/src/mobile/pages/SignupBottomSheet.jsx` — both error banners (step 1 and step 2) have `role="alert"`.

### Test coverage — previously untested modules

- `backend/test/unit/rateLimiters.unit.test.js` (new) — 18 enforcement tests covering `authLoginLimiter`, `paymentCheckoutLimiter`, `paymentWebhookLimiter`, `messagingWriteLimiter`, `notesMutateLimiter`, `searchLimiter`, `videoUploadChunkLimiter`, the `RateLimit-*` header envelope, custom `keyGenerator` correctness, OPTIONS bypass, and the `createAiMessageLimiter` factory. Each describe block uses `vi.resetModules()` + dynamic import so limiter stores are hermetic. Combined with the existing export-shape file: 39/39 pass.
- `backend/test/unit/video.unit.test.js` (new) — 30 passing + 1 intentional skip (fs/stream-coupled `processVideo` happy path; covered note directs to integration tests). Uses `Module._load` patching for child_process, r2Storage, clamav, getUserPlan, prisma, and sentry; no real ffmpeg/ffprobe invoked.
- `backend/test/unit/webauthn-routes.unit.test.js` (new) — 21 passing tests across all 6 route handlers (register options/verify, authenticate options/verify, credentials list/delete). Mocks the `lib/webauthn/webauthn.js` verification barrel and `requireAdmin`; asserts session issuance via spies on `signAuthToken` / `setAuthCookie`.

### Notes Hardening v2 + Service Worker consolidation — confirmed complete

Review found these items already landed in prior work and do not need to be re-done: the `useNotesHardeningEnabled()` hook is wired at `frontend/studyhub-app/src/pages/notes/NoteEditor.jsx:268` and derivative sites, and `sw-notes.js` has already been folded into `public/sw.js` (see the "merged from sw-notes.js" comment at line 23 of `sw.js`). No source-level TODOs remain for these areas.

### Validation

- Backend lint: passes (0 errors).
- Frontend lint: passes (0 errors) before and after the a11y fixes.
- Frontend build: passes (31.80s; pre-existing Joyride tree-shaking warning unrelated to these changes).
- Backend touched-file tests: 129/129 pass on auth + socket + payments after the security fixes.
- New tests: rateLimiters 39/39, video 30 passing + 1 skip, webauthn-routes 21/21.
- `npm audit` (all workspaces): 0 vulnerabilities.

### Not implemented

- **Security regression test harness for the 5 fixes** — a dedicated `security-regressions.unit.test.js` was scoped but the session ended before its completion; the five fixes are each covered by existing touched-file test runs, but a single file that explicitly asserts each regression would shorten the review loop on future changes. Tracked for a follow-up PR.
- **iOS Capacitor target** — only Android is present in the repo. The `CAPACITOR_NATIVE_ORIGINS` set already includes `capacitor://localhost` so the iOS shell will work when added; no code change needed at that point beyond scaffolding the iOS project.
- **MAX_OUTPUT_TOKENS_SHEET documentation drift** — `ai.constants.js:52` is 16384 while `CLAUDE.md` says 8192. The constant is the source of truth for runtime behavior; leaving the code unchanged so sheet generation doesn't regress. CLAUDE.md should be updated in a follow-up to reflect 16384.

---

## 2026-04-16 — Test coverage expansion + Wave 2 mobile detail routes + deep linking

### Summary

Continued the hardening pass with five more parallel test-writing agents and started chipping away at mobile Wave 2. Added 177 new tests across SheetLab, plagiarism, r2Storage, storage, and video routes; closed all four "still untested" backend modules listed in CLAUDE.md. Fixed the AI sheet-gen token-count documentation drift. Added native deep linking (custom scheme + HTTPS App Links) plus the two missing mobile detail routes that were 404-ing from search and notes-list links.

### Documentation

- `CLAUDE.md` — `Max output tokens` line updated to reflect the actual `MAX_OUTPUT_TOKENS_SHEET = 16384` runtime constant (was documented as 8192). The constant in `ai.constants.js` remains the source of truth.

### Test coverage — closed every untested backend module CLAUDE.md flagged

- `backend/test/unit/sheetlab.unit.test.js` (new) — 33 tests across 8 describe blocks. Covers `sheetLab.constants` pure utilities (parsePositiveInt, computeChecksum determinism + null-safety, `canReadSheet` access matrix), `GET /commits` paginated/draft-gated, `POST /commits` with checksum + parent wiring + activity hooks + 500-char truncation, `POST /restore/:commitId` with transactional snapshot, `POST /sync-upstream` non-fork rejection + merge commit creation, `GET /uncommitted-diff`, `GET /lineage` (root-only and parent/children with `isCurrent` flag), `GET /compare-upstream` identical/diverged. SheetLab is the Git-style version control surface for sheets (commits, restore, fork sync, lineage browsing).
- `backend/test/unit/plagiarism.unit.test.js` (new) — 29 tests covering `src/lib/plagiarismService.js` and its pure-algorithm dependency `src/lib/contentFingerprint.js`. Algorithm: SHA-256 normalized-text hash for exact copies plus 64-bit SimHash from 3-word FNV-1a-hashed shingles for fuzzy paraphrase detection; similarity = `1 − hamming/64`, threshold 0.70, likely-copy at 0.85. Covers identical → 1.0, near-duplicates > 0.70, unrelated < 0.70, empty/whitespace returns null, exact-hash phase, same-user filter, sort order (older wins as likely original), and Prisma error fallback. Pre-existing `backend/test/plagiarism.unit.test.js` (Hamming/Union-Find tests) is untouched.
- `backend/test/unit/r2Storage.unit.test.js` (new) — 25 tests. Patches `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` via `Module._load`. Covers key generators (format, collision avoidance over 50 calls, deterministic base-dir sharing), partial-credential `isR2Configured` branch, single-object operations (`uploadObject`/`getObject`/`deleteObject`/`objectExists`), signed URL generation (download + upload), full multipart state machine (`createMultipartUpload` → `uploadPart` × 2 → `completeMultipartUpload` round-trip; `abortMultipartUpload` with Sentry capture), and URL helpers (`getPublicUrl` proxy fallback, `extractObjectKeyFromUrl` round-trip + unrelated-host rejection).
- `backend/test/unit/storage.unit.test.js` (new) — 25 tests. Filesystem-backed uploads abstraction (avatars, covers, attachments, content/note/group images, school logos). Covers URL builders for all six prefixes plus the `attachment://` private scheme; path-safety guards (`isManagedLeafFileName`, `isPathWithinRoot` accept/reject matrix); `resolveManagedUploadPath` traversal rejection; `safeUnlinkFile` outside-root rejection + null-byte basename rejection + EBUSY → Sentry capture; reference-counted cleanup helpers per asset type; `extractNoteImageUrlsFromTexts` dedup/type/prefix filtering; `validateUploadStorage` ensuring all 8 managed dirs are created and access-checked, with the `ALLOW_EPHEMERAL_UPLOADS` opt-in branch.
- `backend/test/unit/video-routes.integration.test.js` (new) — 40 tests complementing the existing `video.unit.test.js`. Mounts `/api/video/upload/chunk` with `express.raw({ type: '*/*', limit: '3mb' })` to mirror the production wiring. Covers chunk upload (missing headers, oversized real 2.5 MB body, wrong owner, magic-byte signature rejection, small-chunk happy buffering), upload complete (full multi-chunk flow forcing `completeMultipartUpload`, ClamAV-infected → R2 delete + status=failed), upload abort, stream endpoint with quality selection + `downloadable=false` non-owner 403, PATCH metadata allowlist enforcement (rejects `contentHash`/`userId`/`r2Key`/`status`), title/description truncation at 200/2000 chars, appeal flow (short reason, conflict on existing pending, no original found), captions upload + delete, language cap. Combined video test count: 70 passed + 1 skipped.

### Wave 4 — Native deep linking

- `frontend/studyhub-app/android/app/src/main/AndroidManifest.xml` — added two intent filters on the main activity: a custom-scheme filter (`getstudyhub://...`) for QR codes and inter-app testing, and an HTTPS App Links filter for `getstudyhub.org` with `android:autoVerify="false"` (the OS will show an "Open with" chooser the first time; flip to true once `/.well-known/assetlinks.json` is published on the domain).
- `frontend/studyhub-app/src/lib/mobile/deepLinking.js` (new) — exports a pure `routeForDeepLink(url)` mapping function and a `useDeepLinkRouter()` React hook that lazily imports `@capacitor/app` only on native and calls `navigate(route)` when an `appUrlOpen` event fires. No-op on web. Accepts both schemes for: `sheet`, `note`, `user`, `conversation`, `group`/`study-groups`, `search` (preserves query), `home`/`feed`, `profile`, `ai`/`hub-ai`. Unknown resources fall through to `/m/home`; unknown hosts on the HTTPS path are rejected.
- `frontend/studyhub-app/src/lib/mobile/deepLinking.test.js` (new) — 21 unit tests covering the route mapper for both schemes, query preservation, special-character encoding, foreign-host rejection, malformed URL rejection, and the alias coverage.
- `frontend/studyhub-app/src/mobile/App.mobile.jsx` — `MobileTabShell` now calls `useDeepLinkRouter()` so the listener is registered once at the mobile-app root.
- `frontend/studyhub-app/package.json` — added `@capacitor/app@^8.1.0` (the requested 8.3 isn't published yet; 8.1 is the latest compatible with Capacitor 8.3).

### Wave 2 — Closed the two routes that were 404-ing

The Wave 2 survey found that most mobile pages are already 70–95% complete (Home/Feed at 80%, Messages at 90%, Thread at 95%, Profile at 70%, Notes at 85%, Search at 90%, SheetDetail at 85%, GroupDetail at 80%). The most concrete blocker was navigation: search results and other links pointed at routes that didn't exist. Two new pages close that gap.

- `frontend/studyhub-app/src/mobile/pages/MobileUserProfilePage.jsx` (new) — public profile viewer for `/m/users/:username`. Fetches `GET /api/users/:username`, renders identity card with avatar fallback, four stat cells (sheets, followers, following, stars), follow/unfollow button with optimistic update + rollback on failure, and a "Message" button that routes to `/m/messages?dm=:userId` (existing DM auto-start handler in MessagesPage). Self-profile redirects to `/m/profile` to avoid showing the wrong layout. Private-account view hides stats and shows a "follow to see their activity" hint.
- `frontend/studyhub-app/src/mobile/pages/MobileNoteDetail.jsx` (new) — read-only viewer for `/m/notes/:noteId`. Fetches `GET /api/notes/:id` (which already supports the `optionalAuth` shared-or-owner gate), renders title, course tag, last-updated relative date, tags, and content. Edit/share/star are deliberately scoped to Wave 3 — Notes Hardening v2's persistence/conflict surface lives in the web `NoteEditor` and isn't reused here yet.
- `frontend/studyhub-app/src/mobile/App.mobile.jsx` — registered `/m/users/:username` and `/m/notes/:noteId` routes behind `MobilePrivateRoute`.

### Validation

- All new tests pass: SheetLab 33/33, plagiarism 29/29, r2Storage 25/25, storage 25/25, video routes 40/40 (combined video 70 passed + 1 skipped). Frontend `deepLinking.test.js` 21/21.
- Backend lint: passes.
- Frontend lint: passes.
- `npm audit` (all workspaces): still 0 vulnerabilities.

### Not implemented (carried forward, unchanged)

- **iOS** — needs macOS + Xcode; not feasible from Windows.
- **Push notifications (FCM)** — needs `google-services.json` from a Google Cloud / Firebase project the user controls. Client-side wiring is straightforward once that file exists; build will fail without it.
- **Biometric lock** — needs a plugin selection (`@capacitor-community/biometric-auth` is one option) and native manifest entries; deferred to keep this session focused.
- **Full offline mode** — significant architectural work (mobile-specific service worker strategy, IndexedDB queue for writes, conflict resolution); not a single-session item at the no-placeholders standard.
- **Wave 3 messaging composer + voice** — needs `@capacitor/voice-recorder` + audio storage pipeline; deferred.
- **Mobile Wave 2 polish** — top bar hide-on-scroll, Socket.io "new posts" pill, profile activity tabs, group members/resources/sessions sub-views, all-eight feed card type renderers. None are blocking; cherry-pick from the survey punch list as needed.

---

## 2026-04-16 — Production bug fixes: CSP broke BookHub; People-to-Follow label; SW respondWith crash; .gitignore hygiene

### Summary

Fix three user-reported production bugs (issue #246) plus a gitignore hygiene pass. The Library (BookHub) page was broken in production because the frontend CSP did not allow the Google Books image CDN, and the service worker's cross-origin fetch path was throwing `TypeError: Failed to convert value to 'Response'` when it landed on CSP-blocked URLs. The "People to Follow" widget showed `undefined follower(s)` and the "See more suggestions" link pointed to the first user's profile instead of anything useful.

### Frontend CSP — `frontend/studyhub-app/public/_headers`

- `connect-src` extended with `https://books.google.com`, `https://*.googleusercontent.com`, `https://www.googleapis.com`, `https://cdnjs.cloudflare.com`, `https://fonts.googleapis.com`, and `https://fonts.gstatic.com`. The browser enforces `connect-src` against the service worker's internal `fetch()` calls, so omitting those hosts caused every SW-intercepted request to them to fail. BookHub embeds cover images from `books.google.com/books/content?id=...`, which are declared under `img-src` (which already allows all `https:`) but are fetched by the SW as part of the image-caching strategy — the SW fetch is the one that hit the CSP wall.

### Service worker — `frontend/studyhub-app/public/sw.js`

- Added an early-return for cross-origin requests right after the protocol guard. `self.location.origin` vs `new URL(request.url).origin` comparison lets the browser handle every third-party resource natively with its own caching strategy, and the SW only keeps jurisdiction over `getstudyhub.org` / same-origin URLs. This eliminates the entire class of CSP-vs-SW conflicts going forward — even if a new third-party host is added to `img-src` without updating `connect-src`, the SW will no longer destabilize.
- Hardened the fallback path in every cache-strategy branch (hashed assets, fonts, images, catch-all) to resolve to a synthetic `new Response('', { status: 504 })` instead of `undefined`/`null`. The production error `TypeError: Failed to convert value to 'Response'` came from `cached || networkFetch` evaluating to `null` when both the cache miss and network error paths produced falsy values; `event.respondWith(null)` then throws. Now every branch guarantees a valid Response.

### `FeedFollowSuggestions.jsx`

- The backend returns `_count: { followers, studySheets }` via Prisma's `_count` selection, but the component read `user.followerCount` (never populated), so the sub-label rendered as `"undefined follower(s)"`. Also `user.reason === 'classmate'` was the branch for shared-courses copy, but the backend never sets `reason` or `sharedCourses` on the payload either. Fixed by normalizing the shape: `user.followerCount ?? user._count?.followers`, and falling back to the user's `displayName` when no count is available. The broken variants now just don't render a sub-label instead of rendering the string `"undefined"`.
- The "See more suggestions" link at the bottom used `to={`/users/${suggestions[0]?.username}`}` — it navigated to the _first suggestion's profile page_, which is obviously not "see more". Replaced with a `<button>` that toggles in-place between 4 and 8 visible suggestions, plus a "Show fewer" control when expanded. This also avoids the need for a dedicated `/suggestions` page that doesn't exist yet.

### `.gitignore` hygiene

- Added: `test-results/`, `playwright-report/` (Playwright artifacts regenerated every run), `coverage/` + `.nyc_output/`, Android build trees (`android/.gradle/`, `android/build/`, `android/app/build/`, `capacitor-cordova-android-plugins/build/`, `**/local.properties`), iOS build trees (for when the target is added), Vite cache (`**/.vite/`), OS cruft (`.DS_Store`, `Thumbs.db`, `desktop.ini`), editor swap files (`*.swp`, `*.swo`, `*~`), and npm/yarn/pnpm debug logs.
- Untracked the stray `test-results/.last-run.json` that had been committed before the ignore rule existed (`git rm --cached`).

### Not implemented

- **"My Notes is buggy"** (also in issue #246) — the report did not specify a concrete symptom, and the screenshots only show the editor saving normally and the notifications/messages pollers firing at the documented 30-second cadence. The notification polling is working as designed (30 s × 2 endpoints × preflight = the request volume shown). If there is a more specific repro, a follow-up issue with steps will let me act on it; without that, changing anything here would be shooting in the dark.
- **`.vscode/` workspace settings** — currently tracked (`settings.json`, `tasks.json`, two Checkmarx dev-assist markers). Left alone because the existing tracked files look like shared team config. If you want them gone, `git rm --cached .vscode/*` cleans up.

### Validation

- Frontend lint: passes.
- Frontend build: passes.
- No backend changes this round, so backend tests unchanged.

---

## 2026-04-16 — Follow-up: profile-page "People You May Know" + repo cleanup

### Summary

Screenshot review caught a second instance of the `undefined follower(s)` bug — this time on the profile-page "People You May Know" widget (a different component from the feed sidebar fixed in the previous entry) — plus confirmed that the repo had 2,715 tracked files of vendored `effect-ts` source (33 MB at the repo root as `package/`) and two stray Superpowers brainstorm artifacts. All three fixed in one pass.

### `FollowSuggestions.jsx` (profile page)

Same bug, same endpoint, different consumer: `GET /api/users/me/follow-suggestions` returns Prisma's `_count` object and does not populate `reason` / `sharedCourses` / `sheetCount`, but `frontend/studyhub-app/src/pages/profile/FollowSuggestions.jsx` read those flat properties directly. The screenshot in issue #246 shows six rows of `"undefined followers"` as a result. Applied the same normalization as the feed sidebar fix:

- `user.followerCount ?? user._count?.followers`
- `user.sheetCount ?? user._count?.studySheets`
- `sharedCourses` only used when the backend actually sets `reason === 'classmate'`
- Sub-label is omitted entirely when no count is available, instead of rendering the string `"undefined"`.

Also audited `frontend/studyhub-app/src/pages/feed/ForYouSection.jsx` — it consumes `/api/feed/for-you` which _does_ populate `sharedCourses` + `followerCount` on its `people` array, so no fix needed there.

### Repo cleanup — untracked 2,717 stray files

- `package/` — a vendored copy of `node_modules/effect/package/` source that had been committed into the repo root (2,715 files, 33 MB). No code in `backend/src` or `frontend/studyhub-app/src` imports from it; the `effect` dependency in `backend/package.json` resolves normally through `node_modules`. Untracked via `git rm -r --cached package/` and added `/package/` to `.gitignore`. Left on disk in case anyone still wants the source tree for reference.
- `.superpowers/brainstorm/1197-1775419202/` — two HTML files from a local Superpowers brainstorm session. Untracked; `.superpowers/brainstorm/` added to `.gitignore`.

### Validation

- Frontend lint: passes.
- The deletion set (2,717 files) is purely bookkeeping — no source references break because nothing was importing from `package/`.

---

## 2026-04-16 — Auto-refresh infrastructure: SW update detection, focus revalidation, Notes polling

### Summary

StudyHub users had to hard-refresh to pick up new deploys or see content saved from another device — behavior that falls short of Facebook / Instagram / GitHub-grade freshness expectations. Three changes close that gap without changing any page-level behavior the user has to think about.

### Service-worker update detection — `frontend/studyhub-app/src/main.jsx`

- Poll cadence bumped from **60 min → 10 min**. The previous hour-long window meant a deploy could take up to an hour to reach an active user; 10 min keeps every cache-warm window fresh without measurable bandwidth cost.
- Added explicit `window.focus`, `online`, and `document.visibilitychange` listeners that trigger `registration.update()` on the spot. Most users don't sit on one tab for 10 straight minutes — they tab away and come back, and that's exactly the moment to discover a new deploy.
- When the SW reports an update (`SW_UPDATED` postMessage or a newly-activated worker), the handler now flushes the in-memory SWR cache via `clearFetchCache()` before showing the refresh banner. This prevents the "I see stale data even after refresh was offered" footgun where a cached response served to a just-activated new SW could still look old.
- Refresh banner no longer auto-dismisses after 30 s. The old behavior silently removed the banner, so users who tabbed away and came back missed the update entirely. The banner now stays until the user clicks **Refresh** or the **x** dismiss button.

### `useFetch` focus revalidation — `frontend/studyhub-app/src/lib/useFetch.js`

- New default: any `useFetch(..., { swr: <ms> })` call now refetches when the tab regains focus (`window.focus` + `document.visibilitychange`). Throttled to at most one refetch per cacheKey per 10 s so rapid tab-switching doesn't hammer the backend.
- Opt-out: pass `revalidateOnFocus: false` on SWR-enabled fetches that shouldn't refresh on focus.
- Opt-in for non-SWR fetches: pass `revalidateOnFocus: true`. The default remains off for non-SWR fetches because most of those are one-shots (page-load stats, enum lists) where a focus refetch is wasted work.
- This is the pattern Vercel SWR, React Query, and Apollo all default to. Matches user expectation from every modern app.

### Notes page polling — `frontend/studyhub-app/src/pages/notes/useNotesData.js`

- Previously the note list fetched once on mount and never again. Shared notes from classmates (or saves from another device) required a hard refresh to appear.
- Extracted the inline fetch into a `loadNotes` callback and wired it through `useLivePolling` at a 60-s interval. The hook already honors `pauseWhenHidden` + `focus` / `online` / `visibilitychange`, so this is a cheap sidecar to the existing infrastructure.
- The initial mount toast is suppressed on background-refresh failures (`hasLoadedNotesOnceRef`) so a momentary network drop doesn't spam the user with "Failed to load notes" every minute.

### Tests

- `frontend/studyhub-app/src/lib/useFetch.test.js` — 4 new tests covering focus-revalidation behavior: refetches on focus when SWR is enabled, does NOT refetch when SWR is off, honors the explicit `revalidateOnFocus: true` opt-in, and throttles burst focus events to at most one refetch. Combined file: 15/15 pass.

### Validation

- Frontend lint: passes.
- Frontend build: passes.
- `useFetch.test.js`: 15/15.
- No backend changes this round; backend tests unchanged.

### Not implemented

- **Real-time Feed "N new posts" pill via Socket.io** — the feed currently relies on 30-s polling. Upgrading it to a Socket.io subscription would require a backend feed-broadcast channel that doesn't exist yet. Out of scope for this round; the focus-revalidation gives most of the same user-facing benefit because tabbing back pulls the latest feed.
- **Auto-reload on SW update** — considered and rejected. Silently reloading mid-typing would destroy unsaved work (compose boxes, note edits, etc.). The persistent banner is the safer pattern; users who want the update just click.

---

## 2026-04-17 — Silent auto-reload on SW update (Facebook/Instagram/GitHub pattern)

### Summary

Revisited the "don't show a banner, just refresh" decision from the previous release log entry. The user feedback was that a "Refresh" banner still requires a click, and StudyHub should feel like Facebook / Instagram / GitHub where deploys are invisible to the user. Implemented silent auto-reload that waits for the next safe moment (route change, tab return, or long idle) before swapping in the new bundle. No banner.

### How it works

- `frontend/studyhub-app/src/lib/swUpdateState.js` (new) — module-level state: `markSwUpdateAvailable()`, `isSwUpdateAvailable()`, `swUpdatePendingAgeMs()`, and a pub-sub `subscribeSwUpdate(cb)` for React components. Also tracks a page-load-level `reloadTriggered` guard via `hasReloadBeenTriggered()` / `markReloadTriggered()` so the reload only fires once per page even when multiple triggers line up.
- `frontend/studyhub-app/src/components/SwUpdateAutoReloader.jsx` (new) — mounted once inside the `BrowserRouter` tree (next to `RouteAnnouncer` / `RouteTelemetry`). Reads `useLocation()` and watches `pathname` for changes; on any route change AFTER the flag is set, calls `window.location.reload()`. Also listens for `visibilitychange` → visible and `window.focus` (the user coming back to the tab), and has a `setInterval` long-idle fallback that reloads after 30 minutes of pending-without-reload.
- `frontend/studyhub-app/src/main.jsx` — the SW update handler no longer builds a DOM banner. It just calls `clearFetchCache()` (flush stale SWR data) and `markSwUpdateAvailable()`. The banner code and the slide-up animation styles are gone.
- `frontend/studyhub-app/src/App.jsx` — mounted `<SwUpdateAutoReloader />` inside the authenticated web router. It's a null-rendering component; no visible UI.

### Safety rails

1. **Grace period** — nothing reloads within `INITIAL_GRACE_MS` (2 s) of the update flag being set. Guards against races where the user is mid-click when the new SW activates.
2. **Once-per-page guard** — `hasReloadBeenTriggered()` prevents duplicate `window.location.reload()` calls even if route change + visibility + subscription callback all fire in the same tick.
3. **No reload on initial mount** — the component compares against its mount-time path and only acts on _subsequent_ pathname changes. First render never reloads.
4. **Still no mid-typing reload** — reload only fires on route change or tab-return. A user actively typing on a single page won't be interrupted; they only pick up the new version when they navigate or tab away. The 30-minute long-idle fallback is the only automatic trigger, and 30 min of continuous typing in one form is an edge case worth the trade-off.

### Tests

- `frontend/studyhub-app/src/lib/swUpdateState.test.js` (new) — 8 tests covering initial state, `markSwUpdateAvailable` idempotency + age, subscription callback delivery, unsubscribe, listener-error isolation, and non-function-subscriber guards.
- `frontend/studyhub-app/src/components/SwUpdateAutoReloader.test.jsx` (new) — 5 tests: does not reload on initial mount, does not reload on route change without pending update, DOES reload on route change with pending past grace period, defers during grace period, reloads at most once across multiple triggers. Uses a `MemoryRouter` harness with nav buttons to drive route changes.
- Combined: 28/28 pass (8 swUpdateState + 5 SwUpdateAutoReloader + 15 pre-existing useFetch tests).

### Validation

- Frontend lint: passes.
- Frontend build: passes (1.38 s).
- All 3 related test files pass.
