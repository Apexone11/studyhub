StudyHub Beta V1.0.0 Release Log

Purpose
- Run all risky changes in local beta first, validate, then ship.
- Keep production safe while testing UX/security/algorithm updates.

Core One-Command Flow
1. npm run beta:bootstrap
   Starts Docker services (frontend, backend, postgres, pgAdmin) and seeds local beta data.
2. npm run beta:check
   Runs diagnostics blocker first, then full validation checks.
3. npm run beta:down
   Stops the local stack.

Core Helper Commands
- npm run beta:capture:feed
  Captures /api/feed network payload, backend stack logs, and frontend console trace.
- npm run beta:validate
  Runs backend tests, frontend tests, smoke e2e, and backend route smoke checks.
- npm run beta:seed
  Seeds catalog/sample data plus local beta users.

Diagnostics Output (Reusable Across Cycles)
Directory: beta-diagnostics/
- feed-network.json
- backend-stack.log
- frontend-console.json

Local Beta Credentials (Seeded)
- studyhub_owner / AdminPass123
- beta_admin / BetaAdmin123!
- beta_student1 / BetaStudent123!
- beta_student2 / BetaStudent123!

Cycle 2 Additions (Feed UX + Attachment Preview)
Implemented in beta lane:
- Post top-right action menu with Delete post
- Delete visible only to post owner or admin
- Confirm dialog + optimistic remove + rollback on API failure
- Inline attachment preview (image/PDF/doc types where browser can render)
- Full preview page route
- Preview endpoints:
  - GET /api/feed/posts/:id/attachment/preview
  - GET /api/sheets/:id/attachment/preview
- Large image preview compression enabled; downloads remain original quality

Cycle 2 Validation Command (Targeted)
- npx playwright test tests/feed.preview-and-delete.smoke.spec.js
Checks:
- owner sees delete menu
- non-owner does not
- preview endpoints render for image/pdf

Cycle 3 Additions (HTML Draft + Review Workflow)
Implemented in beta lane:
- `StudySheet.contentFormat` added (`markdown | html`, default `markdown`)
- `StudySheet.status` added (`draft | pending_review | published | rejected`, default `published`)
- HTML mode in sheet editor with file import (`.html`/`.htm`)
- Draft autosave and restore via:
  - `GET /api/sheets/drafts/latest`
  - `POST /api/sheets/drafts/autosave`
- Full sandbox HTML preview:
  - `GET /api/sheets/:id/html-preview`
  - frontend route: `/sheets/preview/html/:id`
- HTML submission security checks on create/update
- HTML publish flow moves sheets to `pending_review`
- Admin review queue + actions:
  - `GET /api/admin/sheets/review`
  - `PATCH /api/admin/sheets/:id/review` (`approve`/`reject`)
- Public sheet listing + feed now include published sheets only
- Markdown flow remains publish-first and backward compatible

Cycle 3 Validation Commands (Targeted)
- npm --prefix backend run test
- npm --prefix frontend/studyhub-app run test
- npm --prefix frontend/studyhub-app run build

Cycle 3 Exit Criteria
- editor can switch markdown/html without regression
- draft is restored on `/sheets/upload` for the same user
- html submit becomes `pending_review`
- admin can approve to `published` or reject to `rejected`
- non-owners cannot see non-published sheets in feed/listing

Cycle 4 Additions (Regression Speed + Synthetic Activity)
Implemented in beta lane:
- Reproducible mixed synthetic load actions were added to `backend/scripts/loadTraffic.js`
  (seeded posts/comments/reactions/stars/download counters/searches and attachment uploads)
- Playwright beta snapshot flow added:
  - script: `frontend/studyhub-app/scripts/captureBetaSnapshots.mjs`
  - command: `npm run beta:snapshots`
  - outputs full-page screenshots + report in `beta-artifacts/playwright-snapshots/<run-id>/`
- One-click beta orchestration aliases:
  - `npm run beta:start:oneclick`
  - `npm run beta:validate:oneclick`
- VS Code tasks added:
  - `Beta: Start (One Click)`
  - `Beta: Validate (One Click)`

Cycle 4 Test Coverage Added
- Frontend unit:
  - delete permission visibility helper
  - attachment preview endpoint mapping + preview kind rules
- Backend unit:
  - HTML security allow/deny cases
  - attachment preview MIME/render-kind rules
- Backend integration:
  - draft create/edit/resume
  - submit to pending review
  - approve/reject transitions
- E2E smoke:
  - owner delete visible, non-owner hidden
  - inline preview render (image/PDF)
  - full preview route + original download endpoint unchanged
  - HTML preview sandbox isolation + blocked security verdict surface

Cycle 4 Validation Commands (Targeted)
- npm --prefix backend run test
- npm --prefix frontend/studyhub-app run test
- npm --prefix frontend/studyhub-app run test:e2e:smoke
- npm run beta:snapshots
- npm --prefix backend run load:test

Cycle 4 Exit Criteria
- all new tests pass in local beta lane
- snapshot report and screenshots are generated
- synthetic mixed-action load run completes without failures
- diagnostics blocker (`npm run beta:capture:feed`) remains clean

Reuse Rules For Future Beta Versions
1. Keep this file as baseline + cycle log (do not rewrite from scratch).
2. Add each new cycle under a new section:
   - Cycle N Goal
   - Changes
   - Validation commands
   - Exit criteria
3. Reuse the same diagnostics directory and commands unless a cycle needs extra artifacts.
4. Keep production behavior stable by testing new flow only in beta first.
5. Use docs/beta-cycle-template.md as the copy/paste skeleton for each next cycle.
6. For every future beta cycle, always include tests for every newly added feature and every touched page before moving to the next cycle.

Cycle 5 Additions (HTML-Only Secure Upload Revision)
Implemented in beta lane:
- `/sheets/upload` now runs strict HTML upload-first workflow for new drafts
  (direct post from empty editor disabled until `.html/.htm` import)
- Versioned HTML draft tracking added:
  - one `original` version
  - one `working` version
- New HTML workflow endpoints:
  - `POST /api/sheets/drafts/import-html`
  - `PATCH /api/sheets/drafts/:id/working-html`
  - `GET /api/sheets/drafts/:id/scan-status`
  - `POST /api/sheets/drafts/:id/scan-status/acknowledge`
  - `POST /api/sheets/:id/submit-review`
- Scan state lifecycle added: `queued | running | passed | failed`
- Security checks now use policy + antivirus scan gate before HTML submit-review
  (submit blocked on risky findings; warning flow with acknowledgement)
- Upload tutorial modal added for first-time users on upload page
- Full preview button emphasized with distinct visual style and state preserved through draft workflow
- 20-day original HTML archival/compression job added:
  - runtime scheduler in API process
  - manual runner script: `npm --prefix backend run archive:html-originals`

Cycle 5 Validation Commands (Targeted)
- npm --prefix backend run test -- htmlSecurity.test.js sheet.workflow.integration.test.js clamav.adapter.test.js htmlDraftWorkflow.test.js htmlArchive.test.js
- npm --prefix frontend/studyhub-app run test -- src/pages/uploadSheetWorkflow.test.jsx
- npm --prefix frontend/studyhub-app run test:e2e:smoke -- tests/sheets.upload-html-workflow.smoke.spec.js tests/sheets.html-preview.sandbox.smoke.spec.js

Cycle 5 Exit Criteria
- strict upload page blocks submit until HTML import exists
- scan status polling and acknowledge flow are visible and stable
- HTML submit-review blocks on failed scan and passes on clean scan
- draft metadata (title/course/description/content) persists across preview return
- original/working version records are created for HTML workflow

Cycle 6 Additions (Release A Stabilization + Release B Structure/Responsive Baseline)
Implemented in beta lane:
- Backend auth/csrf/guarded-mode error envelope now includes stable `code` values:
  - `AUTH_REQUIRED`
  - `AUTH_EXPIRED`
  - `FORBIDDEN`
  - `CSRF_INVALID`
  - `GUARDED_MODE`
- Auth-expired middleware responses now use `401` so only real session expiry forces logout.
- Guarded-mode write protection remains active for non-admin writes while login/logout/reset flows stay usable.
- Migration readiness flow expanded for release sequencing:
  - `npm --prefix backend run migrate:readiness`
  - `npm --prefix backend run migrate:readiness:deploy`
  - `npm --prefix backend run migrate:readiness:smoke`
  - `npm --prefix backend run migrate:readiness:deploy:smoke`
- Frontend session policy updated:
  - `401` clears cached session and triggers authenticated-route redirect
  - `403` keeps session and surfaces inline permission/security messaging
- Protected route crash containment now shows a safe fallback with a telemetry reference ID.
- Frontend page refactor now uses direct subfolder imports with no top-level compatibility exports:
  - `src/pages/feed/*`
  - `src/pages/sheets/*`
  - `src/pages/settings/*`
  - `src/pages/admin/*`
  - `src/pages/auth/*`
  - `src/pages/legal/*`
  - `src/pages/preview/*`
- Remaining routed pages were moved into domain folders:
  - `src/pages/home/*`
  - `src/pages/dashboard/*`
  - `src/pages/profile/*`
  - `src/pages/tests/*`
  - `src/pages/notes/*`
  - `src/pages/announcements/*`
  - `src/pages/submit/*`
- `PlaceholderPages.jsx` was removed and its live routes now have one source file each.
- Route-adjacent tests now live with their feature folders instead of the top-level `pages/` directory.
- Shared responsive layout tokens and sidebar drawer mode added for key app surfaces.

Cycle 6 Validation Commands (Targeted)
- npm --prefix backend run test -- test/releaseA.stability.middleware.test.js test/auth.routes.test.js
- npm --prefix frontend/studyhub-app run test -- src/lib/session-context.test.jsx src/components/RouteErrorBoundary.test.jsx src/pages/auth/LoginPage.test.jsx src/pages/auth/RegisterScreen.test.jsx
- npm --prefix frontend/studyhub-app run test -- src/lib/ui.test.js src/components/AppSidebar.responsive.test.jsx src/pages/feed/feedHelpers.test.jsx src/pages/sheets/uploadSheetWorkflow.test.jsx
- npm --prefix frontend/studyhub-app run build
- npm --prefix frontend/studyhub-app run test:e2e:responsive
- npm run beta:cycle6

Cycle 6 Manual / Release Gate Notes
- Before Release A deploy:
  - take DB backup or snapshot
  - run Prisma deploy
  - verify clean migration status
  - capture feed diagnostics artifacts before and after fix
- Keep Release B behind Release A gate:
  - no move to wider responsive/regression rollout until logout loop and white-screen artifacts are clean

Cycle 6 Final Validation (V1.0.0)
- Responsive Playwright smoke now covers desktop/tablet/mobile for:
  - `/feed`
  - `/sheets`
  - `/sheets/:id`
  - `/dashboard`
  - `/settings`
  - `/notes`
  - `/announcements`
  - `/admin`
- Beta snapshot capture now uses route-level screenshots for all three viewports and writes:
  - `beta-artifacts/playwright-snapshots/<run-id>/route--viewport.png`
  - `beta-artifacts/playwright-snapshots/<run-id>/snapshot-report.json`
- Beta seed/snapshot flow now provisions a stable attachment preview fixture before snapshot capture:
  - backend script: `npm --prefix backend run preview:fixture`
  - root wrapper: `npm run beta:snapshots`
- `beta:seed` now applies migrations before seeding and also creates the preview fixture.
- Dashboard summary route regression was fixed and covered by `backend/test/dashboard.routes.test.js`.

Cycle 6 Full Gate Result
- `npm run beta:cycle6` passed end-to-end on 2026-03-17.
- Diagnostics artifacts were regenerated cleanly:
  - `beta-diagnostics/feed-network.json`
  - `beta-diagnostics/frontend-console.json`
  - `beta-diagnostics/backend-stack.log`
- Synthetic load completed with:
  - `903` mixed actions
  - `0` failures
  - `506` throttled
- High-volume read waves produced `429` throttling as expected under rate limits, but no effective failures or resets.

Cycle 6 Full Gate Result (Refreshed Rerun)
- `npm run beta:cycle6` passed end-to-end again on 2026-03-17 after stabilization fixes.
- Migration readiness and route smoke checks passed.
- Backend test suite passed:
  - `11` files
  - `35` tests
- Frontend unit/integration suite passed:
  - `9` files
  - `19` tests
- Frontend smoke e2e suite passed:
  - `15` tests
- Diagnostics artifacts were regenerated cleanly:
  - `beta-diagnostics/feed-network.json`
  - `beta-diagnostics/frontend-console.json`
  - `beta-diagnostics/backend-stack.log`
- Snapshot capture completed and wrote:
  - `beta-artifacts/playwright-snapshots/2026-03-17T21-18-49-392Z/snapshot-report.json`
- Synthetic load completed with:
  - `900` mixed actions
  - `0` failures
  - `502` throttled
- High-volume read waves continued to produce expected `429` throttling under rate limits with no effective failures or resets.

Cycle 7 Additions (Code Scanning + CI Security Hardening)
Implemented in beta lane:
- GitHub Actions least-privilege token permissions added at workflow scope:
  - `.github/workflows/ci.yml`
  - `.github/workflows/nightly-regression.yml`
- Clear-text sensitive logging reduced in backend scripts:
  - `backend/scripts/ensurePreviewFixture.js` now logs a generic failure message only
  - `backend/scripts/seedBetaUsers.js` no longer prints plaintext passwords
- Helmet configuration hardened in API bootstrap:
  - removed explicit `contentSecurityPolicy: false`
  - removed explicit `frameguard: false`
  - existing custom CSP/frame header middleware remains active
- Feed attachment preview now enforces `allowDownloads` parity with download endpoint:
  - `GET /api/feed/posts/:id/attachment/preview` now returns forbidden when downloads are disabled
- Preview policy error-code clarity improved:
  - added `PREVIEW_HTML_BLOCKED` envelope code
  - HTML policy rejection now uses `PREVIEW_HTML_BLOCKED` (instead of token-invalid code)
- Admin middleware 500 response now uses stable envelope code:
  - added `SERVER_ERROR` in shared error envelope constants
- File signature detector made fail-safe for open/read/close errors:
  - `backend/src/lib/fileSignatures.js`
- HTML archival compression moved off synchronous event-loop blocking path:
  - `backend/src/lib/htmlArchive.js` now uses async gzip
- ReDoS-hardening updates:
  - `backend/src/lib/htmlSecurity.js` regex-based scanning replaced with deterministic bounded parsers
  - new deterministic email validator `backend/src/lib/emailValidation.js`
  - `backend/src/routes/auth.js` and `backend/src/routes/settings.js` switched to deterministic email validation
- CodeQL test-only missing-rate-limit finding addressed in stability middleware tests:
  - `backend/test/releaseA.stability.middleware.test.js` now applies explicit rate limiting before auth/csrf middleware in the targeted test apps
- Local compose deterministic image pin:
  - `docker-compose.yml` pins ClamAV to `clamav/clamav:1.3.1`
- Sidebar drawer accessibility improvements:
  - `frontend/studyhub-app/src/components/AppSidebar.jsx`
  - adds `aria-expanded`/`aria-controls`, dialog id wiring, Escape close, and focus transfer into dialog on open

Cycle 7 Validation Commands (Executed)
- `npm run beta:check`
- `npm --prefix backend run lint`
- `npm --prefix backend run build`
- `npm --prefix frontend/studyhub-app run build`

Cycle 7 Validation Result
- `npm run beta:check` passed end-to-end on 2026-03-17:
  - backend Vitest: `11` files, `35` tests passed
  - frontend Vitest: `9` files, `19` tests passed
  - frontend Playwright smoke: `15` tests passed
  - backend route smoke checks passed
- Backend lint passed.
- Backend build check passed.
- Frontend production build passed.
- Feed diagnostics capture remained clean and regenerated artifacts:
  - `beta-diagnostics/feed-network.json`
  - `beta-diagnostics/frontend-console.json`

Cycle 7 Follow-Up Notes
- Frontend lint follow-up has been resolved in subsequent updates:
  - `frontend/studyhub-app/src/pages/shared/pageScaffold.jsx` now exports components only.
  - `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx` callback dependencies were aligned.
- Sourcery review bot diff-limit warning (`>20000` lines) is a PR-size/platform constraint; mitigation is to split future large releases into smaller reviewable PRs.

Cycle 8 Validation (Frontend Regression Check + Build Safety)
Executed on 2026-03-17:
- `npm --prefix frontend/studyhub-app run test`
- `npm --prefix frontend/studyhub-app run build`

Cycle 8 Validation Result
- Frontend unit/integration tests passed:
  - `9` files
  - `19` tests
- Frontend production build passed successfully.
- Regression status: no behavior regression detected in current frontend test suite.

Cycle 8 Deep Code Scan (Half-Finished/Risk Review)
Deep scan methods used:
- targeted repository pattern scan for unfinished markers
- focused code review of feature-toggle and maintenance guards
- manual verification of production-impacting placeholder surfaces

Deep scan findings summary:
- No unfinished marker debt in core app code:
  - no `TODO`/`FIXME`/`HACK`/`WIP`/`TBD` markers found in `backend/src` and `frontend/studyhub-app/src`.
- Intentional, user-visible "coming soon" placeholders remain (non-blocking, but product-debt):
  - `frontend/studyhub-app/src/pages/tests/TestsPage.jsx`
  - `frontend/studyhub-app/src/pages/tests/TestTakerPage.jsx`
  - `frontend/studyhub-app/src/pages/submit/SubmitPage.jsx`
- Documentation drift found in skill/reference docs that still mention removed `PlaceholderPages.jsx` (non-runtime risk):
  - `skills/studyhub-codebase/SKILL.md`
  - `skills/studyhub-codebase/references/repo-map.md`
- Operational risk flags (configuration-dependent, currently intentional):
  - `backend/src/lib/clamav.js`: `CLAMAV_DISABLED=true` bypasses scanning.
  - `backend/src/middleware/guardedMode.js`: guarded-mode flags can block writes globally.

Cycle 8 Deep Scan Assessment
- Immediate runtime blocker: none found.
- Recommended follow-up hardening:
  1. add startup warning logs when scanner bypass is enabled outside test.
  2. add startup warning logs when guarded mode is enabled.
  3. optionally gate "coming soon" routes behind a feature flag or explicit roadmap badge policy.

AI Beta Documentation Standard (Draft, Effective Immediately)
All AI-assisted beta work must follow this process:
1. Every beta-impacting change must be appended to this release log in the same working session.
2. Every entry must include:
   - change summary
   - exact validation commands run
   - validation outcomes (pass/fail with counts where available)
   - known risks/deferred items
3. Every cycle must include a deep scan note if core logic, auth, or upload/security behavior changed.
4. Use ISO dates (`YYYY-MM-DD`) for all cycle timestamps.
5. Keep entries human-readable and curated (no raw commit-log dumping).
6. Group changes by intent where possible (`Added`, `Changed`, `Fixed`, `Security`) following changelog best practices.
7. Version naming must follow semantic versioning intent (`MAJOR.MINOR.PATCH`) and be reflected in document title/file naming.

External guidance reference used for this standard:
- Keep a Changelog principles (human-curated, grouped changes, release-date clarity).
- Semantic Versioning 2.0.0 principles (version intent and release immutability).

Cycle 9 Additions (Final Hardening + CI Beta Log Enforcement)
Implemented in beta lane:
- URL scheme hardening for HTML submission parser:
  - `backend/src/lib/htmlSecurity.js` now blocks `javascript:`, `vbscript:`, and all `data:` URLs in `href`/`src` attributes.
- Session refresh now always sends cookies explicitly:
  - `frontend/studyhub-app/src/lib/session-context.jsx` adds `credentials: 'include'` to `/api/auth/me` refresh fetch.
- Upload signature mismatch responses now use stable error envelopes:
  - `backend/src/middleware/errorEnvelope.js` adds `UPLOAD_SIGNATURE_MISMATCH`.
  - `backend/src/routes/upload.js` now returns signature failures via `sendError(..., code)`.
- Admin gate regression coverage expanded:
  - `backend/test/admin.routes.test.js` now verifies `ADMIN_MFA_REQUIRED` response when admin 2FA is disabled.
- Sidebar drawer accessibility focus restoration strengthened:
  - `frontend/studyhub-app/src/components/AppSidebar.jsx` now restores focus to the trigger button first when the drawer closes.
- Diagnostics credential hardening (removed insecure password fallbacks):
  - `backend/scripts/captureFeedNetwork.js`
  - `frontend/studyhub-app/scripts/captureFeedConsole.mjs`
  - `frontend/studyhub-app/scripts/captureBetaSnapshots.mjs`
  - backend feed-network capture now uses explicit password when configured, otherwise a local signed-token fallback for diagnostics.
  - frontend console/snapshot captures still require explicit `BETA_DIAG_PASSWORD` or `BETA_OWNER_PASSWORD` when session-cookie reuse is unavailable.
- Startup warning visibility added for safety-sensitive toggles:
  - `backend/src/index.js` now warns when `CLAMAV_DISABLED=true` (outside test) and when guarded mode is enabled.
- CI policy enforcement added:
  - `.github/workflows/ci.yml` now fails PRs with code changes when `docs/beta-v<MAJOR.MINOR.PATCH>-release-log.md` was not updated.

Cycle 9 Validation Commands (Executed)
- `npm run beta:check`
- `npm --prefix backend run lint`
- `npm --prefix frontend/studyhub-app run lint`
- `npm --prefix backend run test`
- `npm --prefix frontend/studyhub-app run test`
- `npm --prefix backend run build`
- `npm --prefix frontend/studyhub-app run build`

Cycle 9 Validation Result
- Full beta gate passed (`npm run beta:check`):
  - feed diagnostics capture passed
  - backend Vitest: `11` files, `36` tests
  - frontend Vitest: `9` files, `19` tests
  - frontend Playwright smoke: `15` tests
  - backend route smoke checks passed
- Backend lint passed.
- Frontend lint passed.
- Backend test suite passed:
  - `11` files
  - `36` tests
- Frontend test suite passed:
  - `9` files
  - `19` tests
- Backend build check passed.
- Frontend production build passed.

Cycle 9 Operational Notes
- The CI beta-log gate is scoped to pull requests and checks for code-impacting path changes.
- Diagnostic capture scripts now fail fast with a clear message when credentials are missing.

Cycle 10 Additions (PR Review Closure + Preview Coverage) [2026-03-18]
Implemented in beta lane:
- HTML archive scheduler now reuses the shared Prisma singleton instead of creating an extra client pool:
  - `backend/src/lib/htmlArchiveScheduler.js`
  - adds archive failure logging for observability while preserving best-effort behavior.
- HTML preview sanitizer now allows `blob:` URLs to align with preview CSP behavior:
  - `backend/src/lib/htmlPreviewDocument.js`
- Backend email smoke script now loads dotenv from explicit backend path for cwd-safe execution:
  - `backend/scripts/emailSmoke.js`
- Drawer focus-capture reliability improved for accessibility on close/restore:
  - `frontend/studyhub-app/src/components/AppSidebar.jsx`
- New route-level preview coverage added:
  - `backend/test/preview.routes.test.js`
  - validates missing/invalid token handling, version mismatch rejection, unpublished access policy, and `PREVIEW_HTML_BLOCKED` issue surfacing.

Cycle 10 Validation Commands (Executed)
- `npm --prefix backend run test -- preview.routes.test.js admin.routes.test.js htmlArchive.test.js`
- `npm --prefix backend run lint`
- `npm --prefix frontend/studyhub-app run lint`

Cycle 10 Validation Result
- Targeted backend tests passed:
  - `3` files
  - `10` tests
- Backend lint passed.
- Frontend lint passed.

Cycle 10 Deep Scan Summary
- Focused deep scan over review-comment surfaces found only three unresolved items before this cycle:
  - scheduler Prisma client reuse/logging
  - preview sanitizer scheme/CSP alignment
  - missing dedicated `/preview/html` route tests
- All three were implemented and validated in this cycle.

Cycle 10 Deferred-Risk Notes
- Full end-to-end beta gate (`npm run beta:check`) was not rerun in this targeted closure pass.
- Recommended before final release cut:
  1. rerun full beta gate once on latest PR head.
  2. capture fresh diagnostics artifacts after merge-ready state.

Cycle 11 Additions (Post-Review Security + UX Hardening) [2026-03-18]
Implemented in beta lane:
- Route telemetry duplicate-pageview risk removed by splitting effects by concern:
  - `frontend/studyhub-app/src/App.jsx`
  - page views now track on route changes only, user identify/clear runs on session-user changes.
- ClamAV stream protocol corrected for raw chunk transport:
  - `backend/src/lib/clamav.js`
  - switched command from `zINSTREAM` to `INSTREAM` for uncompressed chunked payloads.
- Upload error envelope consistency expanded across avatar/attachment handlers:
  - `backend/src/middleware/errorEnvelope.js`
  - `backend/src/routes/upload.js`
  - added and used `UPLOAD_INVALID`, `UPLOAD_MISSING_FILE`, and `UPLOAD_SAVE_FAILED` stable codes for early and persistence failures.
- HTML security parser micro-optimization applied:
  - `backend/src/lib/htmlSecurity.js`
  - ASCII whitespace stripping now uses array collection + join to avoid repeated string concatenation overhead.
- Sidebar drawer keyboard accessibility improved:
  - `frontend/studyhub-app/src/components/AppSidebar.jsx`
  - added `aria-haspopup="dialog"` and Tab focus-trap cycling within the open modal drawer.
- Auth navigation logic now has explicit unit coverage:
  - `frontend/studyhub-app/src/lib/authNavigation.test.js`
  - includes null user, student, admin with 2FA, admin without 2FA, and unexpected role path assertions.
- Local ClamAV host exposure removed from compose stack:
  - `docker-compose.yml`
  - dropped `3310:3310` host mapping while preserving service-to-service connectivity on Docker network.

Cycle 11 Validation Commands (Executed)
- `npm --prefix backend run test -- test/clamav.adapter.test.js test/htmlSecurity.test.js test/admin.routes.test.js test/preview.routes.test.js`
- `npm --prefix backend run lint`
- `npm --prefix frontend/studyhub-app run test -- src/lib/authNavigation.test.js src/components/AppSidebar.responsive.test.jsx`
- `npm --prefix frontend/studyhub-app run lint`

Cycle 11 Validation Result
- Targeted backend tests passed:
  - `4` files
  - `16` tests
- Backend lint passed.
- Targeted frontend tests passed:
  - `2` files
  - `6` tests
- Frontend lint passed.

Cycle 11 Deep Scan Summary
- Focused scan of latest Copilot findings showed these unresolved items before this cycle:
  - RouteTelemetry dependency coupling (`location` + `user`) causing duplicate pageview events.
  - ClamAV streaming command mismatch (`zINSTREAM` with raw payload).
  - Upload route early exits still returning non-enveloped JSON in key branches.
  - Drawer modal lacked keyboard focus trapping on Tab navigation.
  - Auth navigation helper lacked direct unit tests.
- All listed items were implemented and validated in this cycle.

Cycle 11 Deferred-Risk Notes
- CI beta-log enforcement rule in `.github/workflows/ci.yml` remains intentionally strict to versioned release logs; this cycle keeps that policy unchanged.
- Full end-to-end beta gate (`npm run beta:check`) was not rerun in this targeted pass.

Cycle 12 Additions (Resend Email Transport + Verification Cooldown UX) [2026-03-17]
Implemented in beta lane:
- Resend API transport support was added as a first-class backend email mode:
  - `backend/src/lib/email.js`
  - new mode detection supports `EMAIL_TRANSPORT=resend` (or `EMAIL_PROVIDER=resend`) and automatic fallback selection when only `RESEND_API_KEY` is configured.
  - startup validation now checks Resend API key reachability through the domains endpoint and honors strict startup mode behavior.
  - outbound email delivery now supports Resend API send flow, preserving existing SMTP/json transport behavior.
- Verification resend cooldown UX was added to auth/settings surfaces:
  - `frontend/studyhub-app/src/pages/auth/LoginPage.jsx`
  - `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx`
  - `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx`
  - resend actions are disabled during cooldown windows and display a live countdown timer.
- Test coverage expanded for email delivery reliability and cooldown behavior:
  - `backend/test/auth.routes.test.js`
  - `frontend/studyhub-app/src/pages/auth/LoginPage.test.jsx`
  - `frontend/studyhub-app/src/pages/auth/RegisterScreen.test.jsx`
  - backend now covers login/signup verification email send failures and challenge cleanup behavior; frontend now covers cooldown-disabled resend state.
- Deployment documentation updated for Railway + Resend rollout:
  - `backend/.env.example`
  - `docs/railway-deployment-checklist.md`
  - production guidance now prefers Resend with strict startup validation and includes SMTP fallback variables only when needed.

Cycle 12 Validation Commands (Executed)
- `npm --prefix backend run test -- test/auth.routes.test.js`
- `npm --prefix frontend/studyhub-app run test -- src/pages/auth/LoginPage.test.jsx src/pages/auth/RegisterScreen.test.jsx`
- `npm --prefix backend run lint`
- `npm --prefix frontend/studyhub-app run lint`

Cycle 12 Validation Result
- Targeted backend auth tests passed:
  - `1` file
  - `6` tests
- Targeted frontend auth tests passed:
  - `2` files
  - `4` tests
- Backend lint passed.
- Frontend lint passed.

Cycle 12 Deep Scan Summary
- Focused scan before implementation confirmed these operational gaps:
  - email provider lock-in on SMTP/gmail and fragile production delivery path for strict verification login gates.
  - missing user-facing resend cooldown feedback despite backend cooldown enforcement.
  - missing automated coverage for verification email send-failure handling in critical auth paths.
- All three gaps were addressed in this cycle with code and tests.

Cycle 12 Deferred-Risk Notes
- Full end-to-end beta gate (`npm run beta:check`) was not rerun in this targeted cycle.
- Resend webhook ingestion, delivery-event persistence, and outbox/retry worker are still pending in follow-up cycles for full delivery observability and asynchronous retry resilience.

Cycle 13 Additions (Resend Webhook Ingestion + Delivery Event Logging) [2026-03-17]
Implemented in beta lane:
- Signed Resend webhook ingestion route added with strict verification controls:
  - `backend/src/routes/webhooks.js`
  - endpoint: `POST /api/webhooks/resend`
  - verifies `svix-*` headers with `RESEND_WEBHOOK_SECRET` when configured.
  - strict mode fails closed when secret is missing (`RESEND_WEBHOOK_STRICT=true`).
  - duplicate webhook replays are handled idempotently.
- Webhook route boot order wired for raw-body signature verification:
  - `backend/src/index.js`
  - mounted webhook routes before global JSON parsing, guarded-mode write blocks, and CSRF middleware so signed payload verification remains deterministic.
- Durable event logging schema added for delivery analytics and incident triage:
  - `backend/prisma/schema.prisma`
  - new model: `EmailDeliveryEvent`
  - migration: `backend/prisma/migrations/20260317193000_add_email_delivery_events/migration.sql`
  - stores provider, event type, provider message ID, recipient, subject, event timestamp, full payload, and receive time.
- Resend webhook configuration guidance expanded:
  - `backend/.env.example`
  - `docs/railway-deployment-checklist.md`
  - added `RESEND_WEBHOOK_SECRET` and `RESEND_WEBHOOK_STRICT` guidance plus production registration note for `/api/webhooks/resend`.
- Route-level test coverage added for webhook safety behavior:
  - `backend/test/webhooks.routes.test.js`
  - covers successful signed ingest, invalid signature rejection, strict-mode missing secret rejection, unsigned ingest in non-strict mode, and duplicate replay idempotency.

Cycle 13 Validation Commands (Executed)
- `npm --prefix backend run test -- test/webhooks.routes.test.js test/auth.routes.test.js`
- `npm --prefix backend run test -- test/webhooks.routes.test.js`
- `npm --prefix backend run lint`
- `npm --prefix backend run build`
- `npx prisma validate --schema prisma/schema.prisma` (from `backend/`)

Cycle 13 Validation Result
- Webhook + auth targeted backend tests passed:
  - `2` files
  - `10` tests
- Webhook route targeted backend tests passed:
  - `1` file
  - `5` tests
- Backend lint passed.
- Backend build check passed.
- Prisma schema validation passed.

Cycle 13 Deep Scan Summary
- Focused scan of middleware order and route protections confirmed webhook risks were handled by:
  - raw-body verification before JSON parsing.
  - strict-mode fail-closed behavior when signing secrets are missing.
  - idempotent replay handling via unique provider webhook IDs.

Cycle 13 Deferred-Risk Notes
- Webhook ingestion currently stores delivery events but does not yet trigger automated bounce/suppression actions.
- End-to-end Railway webhook replay testing against a live Resend endpoint is still pending and should be completed during production cutover validation.

Cycle 14 Additions (Automatic Suppression Actions from Webhook Events) [2026-03-17]
Implemented in beta lane:
- Automatic suppression persistence was added for delivery-risk events:
  - `backend/src/routes/webhooks.js`
  - permanent bounce events (`email.bounced` with permanent classification) now upsert suppression state.
  - complaint events (`email.complained`) now upsert suppression state.
  - transient bounces are logged but do not trigger suppression.
- Durable suppression schema added:
  - `backend/prisma/schema.prisma`
  - new model: `EmailSuppression`
  - migration: `backend/prisma/migrations/20260317200000_add_email_suppressions/migration.sql`
  - stores recipient email, reason, provider source metadata, status, and suppression timestamps.
- Outbound email delivery now enforces suppression state:
  - `backend/src/lib/email.js`
  - before send, recipient list is checked against active suppressions.
  - suppressed recipients fail fast with explicit `EMAIL_RECIPIENT_SUPPRESSED` delivery error.
- Suppression behavior test coverage added/expanded:
  - `backend/test/webhooks.routes.test.js`
  - `backend/test/email.suppression.test.js`
  - webhook tests now cover complaint suppression, permanent-bounce suppression, and transient-bounce no-suppress behavior.
  - email tests now cover blocked delivery for suppressed recipients and normal delivery for unsuppressed recipients.
- Deployment checklist now includes suppression-action verification at go-live:
  - `docs/railway-deployment-checklist.md`

Cycle 14 Validation Commands (Executed)
- `npm --prefix backend run test -- test/webhooks.routes.test.js test/email.suppression.test.js test/auth.routes.test.js`
- `npm --prefix backend run lint`
- `npm --prefix backend run build`
- `npx prisma validate --schema prisma/schema.prisma` (from `backend/`)

Cycle 14 Validation Result
- Targeted backend tests passed:
  - `3` files
  - `15` tests
- Backend lint passed.
- Backend build check passed.
- Prisma schema validation passed.

Cycle 14 Deep Scan Summary
- Focused scan of webhook processing and outbound send flow confirmed:
  - suppression actions are now tied directly to logged webhook events.
  - replayed webhook events remain idempotent through unique provider webhook IDs.
  - outbound email checks now prevent repeated sends to known-bad recipients.

Cycle 14 Deferred-Risk Notes
- No unsuppress admin workflow has been added yet; suppression lifecycle is currently write-only from webhook events.
- End-to-end production replay tests for complaint/bounce flows on Railway should still be run before final cutover sign-off.

Cycle 15 Additions (Admin Unsuppress Workflow + Suppression Audit Trail) [2026-03-17]
Implemented in beta lane:
- Admin suppression management workflow API added:
  - `backend/src/routes/admin.js`
  - `GET /api/admin/email-suppressions?status=active|inactive|all&page=1&q=email`
  - `PATCH /api/admin/email-suppressions/:id/unsuppress` (requires reason >= 8 chars)
  - `GET /api/admin/email-suppressions/:id/audit?page=1`
  - all routes inherit existing admin role + admin 2FA gate via `requireAdmin` middleware.
- Durable suppression audit trail schema added:
  - `backend/prisma/schema.prisma`
  - new model: `EmailSuppressionAudit`
  - migration: `backend/prisma/migrations/20260317203000_add_email_suppression_audits/migration.sql`
  - captures action type, reason, actor, context metadata, and timestamps.
- Webhook auto-suppression now writes audit entries:
  - `backend/src/routes/webhooks.js`
  - automatic suppression decisions now produce `auto-suppress` audit records tied to each suppression row.
- Existing outbound suppression guard remains enforced:
  - `backend/src/lib/email.js`
  - recipients stay blocked while suppression is active; manual unsuppress now provides a controlled recovery path.
- Test coverage expanded for admin workflow and audit lifecycle:
  - `backend/test/admin.routes.test.js`
  - `backend/test/webhooks.routes.test.js`
  - admin tests now cover suppression listing, unsuppress with required reason, and audit retrieval.
  - webhook tests now assert suppression audit writes for auto-suppress events.
- Deployment checklist expanded for recovery operations:
  - `docs/railway-deployment-checklist.md`
  - includes explicit validation steps for list/unsuppress/audit endpoints.

Cycle 15 Validation Commands (Executed)
- `npm --prefix backend run test -- test/admin.routes.test.js test/webhooks.routes.test.js test/email.suppression.test.js test/auth.routes.test.js`
- `npm --prefix backend run lint`
- `npm --prefix backend run build`
- `npx prisma validate --schema prisma/schema.prisma` (from `backend/`)

Cycle 15 Validation Result
- Targeted backend tests passed:
  - `4` files
  - `22` tests
- Backend lint passed.
- Backend build check passed.
- Prisma schema validation passed.

Cycle 15 Deep Scan Summary
- Focused scan confirmed suppression lifecycle is now complete for operations:
  - webhook events can auto-suppress risky recipients.
  - admin operators can manually unsuppress after mailbox recovery.
  - all unsuppress actions and auto-suppress actions are audit-tracked.

Cycle 15 Deferred-Risk Notes
- A dedicated frontend admin UI for suppression review/unsuppress actions is not yet implemented; current workflow is API-driven.
- Optional future hardening: add reason enums/workflow states for support-team policy consistency across manual unsuppress decisions.

Cycle 16 Additions (Admin Suppression Frontend Panel) [2026-03-18]
Implemented in beta lane:
- Admin suppression operations are now available in frontend admin UI:
  - `frontend/studyhub-app/src/pages/admin/AdminPage.jsx`
  - new `Email Suppressions` tab added to existing admin tab shell.
  - suppression list now loads from `GET /api/admin/email-suppressions` with status filter (`active|inactive|all`) and email query search.
  - per-recipient unsuppress action wired to `PATCH /api/admin/email-suppressions/:id/unsuppress` with client-side reason validation (minimum 8 chars).
  - suppression audit timeline drawer wired to `GET /api/admin/email-suppressions/:id/audit` with paged entries.
  - panel includes row-level error messaging, success confirmation, and active/inactive status pill rendering.
- Frontend regression coverage expanded for suppression workflow:
  - `frontend/studyhub-app/src/pages/admin/AdminPage.test.jsx`
  - adds tests for suppression list/audit rendering and unsuppress validation + success path behavior.

Cycle 16 Validation Commands (Executed)
- `npm --prefix frontend/studyhub-app run test -- src/pages/admin/AdminPage.test.jsx`
- `npm --prefix frontend/studyhub-app run lint`
- `npm --prefix frontend/studyhub-app run build`

Cycle 16 Validation Result
- Targeted frontend admin tests passed:
  - `1` file
  - `5` tests
- Frontend lint passed.
- Frontend production build passed.

Cycle 16 Deep Scan Summary
- Focused scan of existing admin tab architecture confirmed reuse of stable patterns:
  - shared paged tab loading (`createPageState` + `loadPagedData`) was extended rather than forked.
  - existing admin auth/session error handling (`apiJson`) remains the single transport path.
  - suppression audit is isolated to explicit user action and does not alter existing overview/users/sheets behavior.

Cycle 16 Deferred-Risk Notes
- Suppression table currently renders raw provider/source labels with light formatting; future UX pass may introduce richer event taxonomy badges.
- Full e2e admin suppression workflow (UI + API + real webhook-produced records) is still pending and should be added before final production cutover.

Cycle 17 Additions (Admin Suppression Playwright Flow) [2026-03-17]
Implemented in beta lane:
- Added a dedicated Playwright smoke scenario for the admin suppression lifecycle:
  - `frontend/studyhub-app/tests/admin.email-suppressions.smoke.spec.js`
  - covers end-to-end UI flow in one test:
    - suppression list rendering in `Email Suppressions` tab
    - audit timeline open and event visibility
    - unsuppress action with reason
    - post-unsuppress filter transition from active to inactive
    - audit timeline includes manual-unsuppress actor/reason after action
- Route-mocked e2e harness was used to match current frontend smoke test strategy and keep execution deterministic in CI/local beta checks.

Cycle 17 Validation Commands (Executed)
- `npm --prefix frontend/studyhub-app run test:e2e -- tests/admin.email-suppressions.smoke.spec.js`
- `npm --prefix frontend/studyhub-app run lint`

Cycle 17 Validation Result
- Targeted Playwright e2e test passed:
  - `1` file
  - `1` test
- Frontend lint passed.

Cycle 17 Deep Scan Summary
- Focused scan verified selector and route stability for the new flow:
  - replaced one ambiguous text assertion with a strict table-cell role assertion to avoid duplicate-text strict-mode collisions.
  - API route mocks now exercise status/query filtering and suppression state transitions across list/audit/unsuppress endpoints.

Cycle 17 Deferred-Risk Notes
- This e2e uses mocked admin APIs (consistent with existing smoke strategy); an additional live-stack validation run with real webhook-produced suppression records remains recommended before final production cutover.
