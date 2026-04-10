<!-- markdownlint-disable MD007 MD010 MD022 MD032 MD036 -->

# Beta v2.0.0 Release Log

## Date: 2026-04-08

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
