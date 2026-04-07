# Beta v2.0.0 Release Log

## Date: 2026-04-07

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
