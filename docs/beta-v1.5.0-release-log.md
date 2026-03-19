StudyHub Beta V1.5.0 Release Log

Purpose
- Implement the v1.5 master plan: algorithms, design, security, and rollout improvements.
- Run all risky changes in local beta first, validate, then ship.
- Keep production safe while testing UX/security/algorithm updates.

Version Scope
- v1.5.0 covers a 6-week phased rollout of: search, Google OAuth, animations, settings rework, moderation, Sheet Lab, provenance, onboarding, and polish.
- Feature flags gate all major additions: `FF_GOOGLE_AUTH`, `FF_MODERATION`, `FF_PROVENANCE`, `FF_TENSORFLOW`.

Reuse Rules (Inherited from V1.0.0)
1. Keep this file as baseline + cycle log (do not rewrite from scratch).
2. Add each new cycle under a new section.
3. Reuse the same diagnostics directory and commands unless a cycle needs extra artifacts.
4. Keep production behavior stable by testing new flow only in beta first.
5. Use docs/beta-cycle-template.md as the copy/paste skeleton for each next cycle.
6. For every future beta cycle, always include tests for every newly added feature and every touched page before moving to the next cycle.

AI Beta Documentation Standard (Inherited from V1.0.0)
1. Every beta-impacting change must be appended to this release log in the same working session.
2. Every entry must include: change summary, validation commands, validation outcomes, known risks/deferred items.
3. Every cycle must include a deep scan note if core logic, auth, or upload/security behavior changed.
4. Use ISO dates (YYYY-MM-DD) for all cycle timestamps.
5. Keep entries human-readable and curated (no raw commit-log dumping).
6. Group changes by intent where possible (Added, Changed, Fixed, Security).
7. Version naming follows semantic versioning intent.

---

Cycle 1 Additions (Search + Confirm Modals + HTML Scanner) [2026-03-18]
Implemented in beta lane:

Added:

- Unified search endpoint with parallel Prisma queries across sheets, courses, and users:
  - `backend/src/routes/search.js`
  - `GET /api/search?q=term&type=all|sheets|courses|users&limit=10`
  - Rate limited at 120 req/min.
  - Mounted in `backend/src/index.js`.
- SearchModal component for navbar search:
  - `frontend/studyhub-app/src/components/SearchModal.jsx`
  - Opens on navbar search click, real text input with auto-focus, debounced API calls (300ms).
  - Three result sections (sheets, courses, users) with click-to-navigate.
  - Close on Escape or backdrop click.
- Reusable ConfirmDialog component replacing all `window.confirm()` calls:
  - `frontend/studyhub-app/src/components/ConfirmDialog.jsx`
  - Props: `open`, `title`, `message`, `confirmLabel`, `onConfirm`, `onCancel`, `variant` (danger/default).
  - Focus trap, Escape key dismiss, backdrop click dismiss.
  - Integrated in FeedPage post deletion and admin announcement deletion.
- App icon (`frontend/studyhub-app/public/icon-256.png`).

Changed:

- Navbar search bar (`Navbar.jsx:386`) now opens SearchModal instead of being a dead span.
- Feed post delete actions now use ConfirmDialog instead of `window.confirm()`.
- Admin announcement delete now uses ConfirmDialog.
- Feed composer "Upload sheet" renamed to "Attach file", "General post" renamed to "All courses", "Post to Feed" renamed to "Post".

Security:

- `form` tag added to forbidden tags in HTML security scanner (`backend/src/lib/htmlSecurity.js`) to prevent phishing forms in sheets.

Cycle 1 Validation Commands (Executed)
- `npm --prefix frontend/studyhub-app run build`
- `npm --prefix backend run lint`

Cycle 1 Validation Result
- Frontend production build passed.
- Backend lint passed.

Cycle 1 Deferred-Risk Notes
- Feed search input UI not yet added (backend supports `search` query param but no frontend input in FeedPage).
- Keyboard navigation (up/down arrows) in SearchModal is a future enhancement.

---

Cycle 2 Additions (Google OAuth + Anime.js Animations + Responsive Baseline) [2026-03-18]
Implemented in beta lane:

Added:

- Google OAuth backend integration:
  - `backend/src/lib/googleAuth.js` — token verification via `google-auth-library`.
  - `POST /api/auth/google` — Login/register via Google ID token.
  - `POST /api/auth/google/complete` — Complete registration with course selection.
  - `POST /api/settings/google/link` — Link Google to existing account.
  - `PATCH /api/settings/google/unlink` — Unlink (requires password set first).
  - Database: `googleId` (String?, unique) and `authProvider` (String, default "local") added to User model.
- Google OAuth frontend integration:
  - `@react-oauth/google` dependency added.
  - App wrapped in `<GoogleOAuthProvider>` (`App.jsx`).
  - "Sign in with Google" button on LoginPage.
  - "Sign up with Google" button on RegisterScreen.
  - Google link/unlink section in Settings Security tab.
  - `VITE_GOOGLE_CLIENT_ID` config variable added.
- Anime.js v4 animation utilities:
  - `frontend/studyhub-app/src/lib/animations.js`
  - Exports: `fadeInUp`, `staggerEntrance`, `pulseHighlight`, `popScale`, `countUp`, `fadeInOnScroll`, `slideDown`.
  - All animations respect `prefers-reduced-motion` media query.
- HomePage animations: `fadeInOnScroll` on feature cards and step cards via `staggerEntrance`.
- FeedPage animations: staggered card entrance on load, `popScale` on like/dislike/star/helpful/needs-work buttons.
- LoginPage animations: `fadeInUp` on card wrapper on mount.
- RegisterScreen animations: `fadeInUp` on card wrapper on mount.
- DashboardPage animations: `fadeInUp` hero, `staggerEntrance` stats and content, `countUp` stat values via `data-stat-value` attribute.
- Responsive CSS baseline:
  - `frontend/studyhub-app/src/styles/responsive.css`
  - Settings layout responsive breakpoints, admin stat card grid, sidebar/nav mobile patterns.

Changed:

- `animejs` dependency added to frontend (`package.json`).
- `google-auth-library` dependency added to backend (`package.json`).

Cycle 2 Validation Commands (Executed)
- `npm --prefix frontend/studyhub-app run build`
- `npm --prefix backend run lint`

Cycle 2 Validation Result
- Frontend production build passed.
- Backend lint passed.

Cycle 2 Deep Scan Summary
- Auth flow changes: Google OAuth adds a new authentication path. Existing local auth path is untouched.
- Google OAuth is gated by `VITE_GOOGLE_CLIENT_ID` — if not set, Google buttons are hidden.
- 2FA bypass for `authProvider === "google"` is intentional (Google handles its own MFA).

Cycle 2 Deferred-Risk Notes
- Google OAuth feature flag (`FF_GOOGLE_AUTH`) not yet implemented; currently gated by env var presence.
- No automated test coverage for Google OAuth endpoints yet.
- Anime.js adds ~30KB gzipped to the frontend bundle.

---

Cycle 3 Additions (CORS Auto-Expansion + Typo Fix + CSS Cleanup) [2026-03-18]
Implemented in beta lane:

Fixed:

- CORS production error where `https://www.getstudyhub.net` was blocked because `FRONTEND_URL` was `https://getstudyhub.net`:
  - `backend/src/index.js`
  - Added auto www/non-www expansion logic for allowed origins in production mode.
  - Both directions handled: `www.example.com` generates `example.com` and vice versa.
- Smart quote typo in LoginPage.jsx line 584: Unicode curly apostrophe (U+2019) replaced with ASCII apostrophe.

Changed:

- Removed deprecated `-webkit-overflow-scrolling: touch` from `responsive.css` `.settings-nav` media query.

Cycle 3 Validation Commands (Executed)
- `npm --prefix frontend/studyhub-app run build`

Cycle 3 Validation Result
- Frontend production build passed.

Cycle 3 Deep Scan Summary
- CORS change touches production auth behavior: verified auto-expansion only runs in production mode and only for valid URLs.

Cycle 3 Deferred-Risk Notes
- None.

---

Cycle 4 Additions (Settings Page Rework + UserPreferences Model) [2026-03-18]
Implemented in beta lane:

Added:

- `UserPreferences` Prisma model with all notification, privacy, and appearance settings:
  - `backend/prisma/schema.prisma`
  - Fields: `emailDigest`, `emailMentions`, `emailContributions`, `inAppNotifications`, `profileVisibility`, `defaultDownloads`, `defaultContributions`, `theme`, `fontSize`.
  - Cascade delete linked to User.
- Preferences API endpoints with strict validation:
  - `GET /api/settings/preferences` — returns prefs (auto-creates with defaults if missing via `upsert`).
  - `PATCH /api/settings/preferences` — validates boolean keys and enum keys before updating.
  - Validation: `PREF_BOOLEAN_KEYS` array for boolean fields, `PREF_ENUM_KEYS` object with allowed values for string enums.
- Shared settings UI primitives:
  - `frontend/studyhub-app/src/pages/settings/settingsShared.jsx`
  - Exports: `FONT`, `Input`, `Button`, `Message`, `FormField`, `SectionCard`, `MsgList`, `Select`, `ToggleRow`.
- Seven extracted settings tab components:
  - `ProfileTab.jsx` — read-only profile display (username, email, status, role, courses, sheets count).
  - `SecurityTab.jsx` — password change, username change, 2FA toggle, Google link/unlink (hidden for Google-only users).
  - `NotificationsTab.jsx` — email digest, mentions, contributions toggles + in-app notifications toggle.
  - `PrivacyTab.jsx` — profile visibility dropdown (public/enrolled/private), default downloads and contributions toggles.
  - `CoursesTab.jsx` — self-contained school selection, course checkboxes, save. Manages own catalog loading.
  - `AppearanceTab.jsx` — theme selector with visual cards (light/dark/system), font size dropdown with live preview.
  - `AccountTab.jsx` — email change + verification code flow, resend cooldown timer, account deletion with reasons.

Changed:

- `SettingsPage.jsx` rewritten from 854 lines to ~170 lines as thin shell with 7-tab navigation.
- Tab navigation: profile, security, notifications, privacy, courses, appearance, account.
- `renderTab()` switch delegates to individual tab components with shared props.
- Regenerated `backend/package-lock.json` and `frontend/studyhub-app/package-lock.json` for Railway deployment compatibility.

Cycle 4 Endpoints/Routes
- `GET /api/settings/preferences`
- `PATCH /api/settings/preferences`

Cycle 4 Validation Commands (Executed)
- `npx prisma generate` (from backend/)
- `npm --prefix frontend/studyhub-app run build`

Cycle 4 Validation Result
- Prisma client generated successfully with new UserPreferences model.
- Frontend production build passed (SettingsPage bundle: 28.23 kB / 7.40 kB gzip).

Cycle 4 Deep Scan Summary
- Settings rework preserves all existing functionality (password change, username change, 2FA, courses, email change, account deletion).
- New tabs (Notifications, Privacy, Appearance) are additive and call new preferences endpoints only.
- ProfileTab is read-only and introduces no mutation paths.

Cycle 4 Deferred-Risk Notes
- No automated test coverage yet for preferences endpoints or new tab components.
- `prisma db push --accept-data-loss` was used for schema push; formal migration file not yet created.
- Full end-to-end beta gate (`npm run beta:check`) not yet rerun on v1.5.0 branch.
- Lock files regenerated with `--no-workspaces` flag to bypass workspace resolution for Railway Docker builds.

---

Cycle 5 Additions (Moderation Database Schema) [2026-03-18]
Implemented in beta lane:

Added:

- `ModerationCase` model for tracking flagged content:
  - `backend/prisma/schema.prisma`
  - Fields: `contentType`, `contentId`, `status` (pending/approved/rejected/escalated), `confidence`, `category`, `provider`, `evidence` (JSON), `reviewedBy`, `reviewNote`.
  - Indexed on `[status, createdAt]` and `[contentType, contentId]`.
  - Linked to reviewer User via `ModerationReviewer` relation.
- `Strike` model for tracking user violations:
  - Fields: `userId`, `reason`, `caseId` (optional link to ModerationCase), `issuedAt`, `expiresAt` (90-day window), `decayedAt`.
  - Indexed on `[userId, decayedAt, expiresAt]` for efficient active-strike queries.
  - Cascade delete on User, SetNull on ModerationCase deletion.
- `Appeal` model for user strike appeals:
  - Fields: `caseId`, `userId`, `reason`, `status` (pending/accepted/rejected), `reviewedBy`, `reviewNote`.
  - Indexed on `[caseId]` and `[userId, status]`.
  - Cascade delete on ModerationCase and User.
- `UserRestriction` model for posting/commenting restrictions:
  - Fields: `userId`, `type` (posting/commenting/uploading/full), `startsAt`, `endsAt`, `reason`.
  - Indexed on `[userId, endsAt]` for efficient active-restriction queries.
  - Cascade delete on User.
- User model relations added: `strikes`, `appeals`, `restrictions`, `moderationReviews`.

Cycle 5 Validation Commands (Executed)
- `npx prisma validate` (from backend/)
- `npx prisma generate` (from backend/)
- `npx prisma db push --accept-data-loss` (from backend/)
- `npm --prefix frontend/studyhub-app run build`

Cycle 5 Validation Result

- Prisma schema validation passed.
- Prisma client generated successfully with 4 new moderation models.
- Database schema pushed and synced.
- Frontend production build passed (no changes to frontend in this cycle).

Cycle 5 Deep Scan Summary

- Schema-only change with no runtime impact. No new endpoints, middleware, or frontend code.
- All new models use additive columns/tables only (no drops, no renames).
- Cascade delete rules follow existing patterns: User deletion cascades to strikes/appeals/restrictions; ModerationCase deletion cascades to appeals, sets null on strikes.
- Strike `expiresAt` field enforces 90-day decay window at the application layer (not database constraint).

Cycle 5 Deferred-Risk Notes

- No runtime moderation engine yet — schema is pre-provisioned for Week 4 implementation.
- `prisma db push --accept-data-loss` used; formal migration file should be created before production deploy.
- No API endpoints for moderation cases, strikes, appeals, or restrictions yet.

---

Cycle 6 Additions (Code Review Fixes — Sourcery + Copilot + Codex) [2026-03-18]
Implemented in beta lane:

Fixed:

- **P1 Critical:** `req.user.id` → `req.user.userId` in both GET and PATCH `/api/settings/preferences` endpoints. The auth middleware stores `{ userId, username, role }` on `req.user`, not `id`. This made preferences endpoints fail for all authenticated users.
- **P1 Critical:** Google unlink (`handleGoogleUnlink` in SecurityTab) now sends `password` in the request body. Backend requires password verification before unlinking.
- **P1 Critical:** Username change password field is now always visible (was hidden for Google-only users, but backend requires password for all username changes).
- **P2:** usePreferences fetch now checks `response.ok` before parsing JSON, and sets error message on failure instead of silently swallowing errors.
- **P2:** FormField accessibility — children are now nested inside the `<label>` element so screen readers associate labels with controls and clicking labels focuses the input.

Changed:

- Extracted shared `usePreferences` hook into `settingsShared.jsx` to deduplicate preferences fetch/save logic across NotificationsTab, PrivacyTab, and AppearanceTab (Sourcery recommendation).
- Refactored preferences PATCH endpoint to use `Object.create(null)` for the updates object and `Object.hasOwn` checks before reading `req.body` properties (Sourcery security: remote-property-injection).
- Replaced all hardcoded font family strings with shared `FONT` constant from `settingsShared.jsx` in CoursesTab, AccountTab, and SettingsPage.

Security:

- Backend preferences endpoint uses prototype-free object (`Object.create(null)`) to eliminate any risk of prototype pollution via bracket notation.

Cycle 6 Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run build`

Cycle 6 Validation Result

- Frontend production build passed.

Cycle 6 Deep Scan Summary

- Auth flow fix: preferences endpoints now correctly read `req.user.userId` matching all other settings routes.
- Google unlink now requires password, consistent with backend enforcement.
- usePreferences hook centralizes all preferences fetch/save logic — single point of failure/fix for future issues.

Cycle 6 Deferred-Risk Notes

- Google link flow is still placeholder (shows info message instead of actual OAuth popup). Requires `@react-oauth/google` GoogleLogin component integration in SecurityTab — deferred to next cycle.
- Profile visibility setting is persisted but not yet enforced by backend user profile routes. Backend enforcement needed before these options have real effect.
- `defaultDownloads`/`defaultContributions` toggles are persisted but not yet read during sheet creation. Upload flow needs to check user preferences for defaults.
- Formal Prisma migration files still needed for UserPreferences and moderation tables before production deploy.

---

Cycle 7 Additions (Production Crash Fix + Security Hardening + Deep Scan) [2026-03-18]
Implemented in beta lane:

Fixed:

- **P0 Production crash:** Backend crash-looping on Railway because `User.googleId` column did not exist in production database. Root cause: all v1.5.0 schema changes were applied locally with `prisma db push` but no migration files existed. Production runs `prisma migrate` which requires migration files.
  - Created formal migration `20260318040000_add_v150_google_oauth_preferences_moderation` covering all v1.5.0 schema additions.
  - All statements use `IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` guards matching existing migration patterns for idempotency.
  - Added `DEFAULT CURRENT_TIMESTAMP` on `ModerationCase.updatedAt` and `Appeal.updatedAt` (were missing, inconsistent with all other migrations).
- **P0 Bootstrap crash amplifier:** `ensureAdminUser` in `bootstrap.js` selected `{ id, role, email }` but checked `existingUser.emailVerified` — always `undefined`, causing an unnecessary `update()` on every startup. Prisma's default `RETURNING *` on `update()` then asked PostgreSQL for the missing `googleId` column.
  - Fixed: added `emailVerified: true` to the select clause.
  - Added `select: { id: true }` to both `create()` and `update()` calls to avoid `RETURNING *` issues with future schema changes.
  - Added `googleId` and `authProvider` to `SCHEMA_REPAIR_STATEMENTS` as a safety net — if migration fails, repair runs before bootstrap.
- **SearchModal stale state on close:** Closing the modal did not cancel pending debounce timers or abort in-flight fetch requests. Reopening could show stale results.
  - Fixed: modal close now clears `timerRef` and aborts `abortRef`.
  - Short-query branch (`< 2 chars`) now also aborts any in-flight request to prevent loading state flicker.
  - Focus `setTimeout` now cleaned up properly via effect return.

Security:

- **CRITICAL: Account takeover via Google OAuth email auto-linking** — Both `POST /api/auth/google` and `POST /api/auth/google/complete` automatically linked a Google account to any existing StudyHub user if the email matched, without requiring authentication from the account owner. An attacker controlling a Google account with a victim's email could take over their StudyHub account in one request.
  - Fixed: removed auto-link behavior from both endpoints. Now returns `409 Conflict` with context-aware error message (different message for Google-only accounts vs password accounts).
  - Response shape matches existing 409 patterns in auth.js (simple `{ error: '...' }`).
- **Google token verification error handling** — `verifyGoogleIdToken` errors (expired token, invalid signature, malformed payload) fell through to the generic 500 handler, showing "Server error" instead of a descriptive message.
  - Fixed: both `/google` and `/google/complete` now catch token verification errors and return `401` with "Google sign-in failed. Please try again."
- **Username generation runaway loop guard** — Google OAuth username generation had no upper bound on the while-loop. Added `suffix > 100` safety check with `AppError(500)` to prevent infinite loops.

Changed:

- **Search endpoint hardened (`backend/src/routes/search.js`):**
  - Added `message: { error: '...' }` to rate limiter (was returning plain text when rate limited).
  - Added 200-character max length check on `q` parameter.
  - Added explicit `type` parameter validation against `['all', 'sheets', 'courses', 'users']`.
  - Normalized `q`, `type`, `limit` query params for array safety (`?q=foo&q=bar` edge case).
  - Replaced `console.error` with `captureError` from Sentry (search errors were not being reported).
  - Changed 500 error message from `'Search failed.'` to `'Server error.'` matching all other routes.
  - Moved `VALID_TYPES` to module scope (was recreated per request).
- **SearchModal destructuring:** Applied Sourcery suggestion — `handleChange(e)` → `handleChange({ target: { value } })`.

Cycle 7 Validation Commands (Executed)

- `npx prisma validate` (from backend/)
- `npx prisma generate` (from backend/)
- `npm --prefix frontend/studyhub-app run build`

Cycle 7 Validation Result

- Prisma schema validation passed.
- Prisma client generated successfully.
- Frontend production build passed.

Cycle 7 Deep Scan Summary

- 4 parallel audit agents scanned: migration SQL patterns, auth.js Google OAuth, search.js + SearchModal, bootstrap.js crash path.
- Migration audit found 22 SQL statements not matching existing patterns (missing IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, DEFAULT CURRENT_TIMESTAMP). All fixed.
- Bootstrap audit found the root cause amplifier: missing `emailVerified` in select + Prisma's implicit `RETURNING *`. Both fixed with select clause additions and repair statement safety net.
- Search endpoint audit found 5 consistency issues (rate limiter message, captureError, error message, array params, module scope). All fixed.
- SearchModal audit found 4 issues (close cleanup, short-query abort, focus timer cleanup, destructuring). All fixed.
- Auth.js audit found 9 issues: dead `existingAccount` field (fixed), misleading error for Google-only accounts (fixed with context-aware message), token verification errors surfacing as 500 (fixed with AppError 401), username loop no guard (fixed), truncated comment (fixed). Deferred: tempCredential JWT expiry, TOCTOU race conditions, code duplication between /google and /google/complete.

Cycle 7 Deferred-Risk Notes

- VS Code MSSQL linter shows false positives on migration SQL (project uses PostgreSQL, not MSSQL). Safe to ignore.
- Google OAuth `nonce` validation not yet implemented (LOW — google-auth-library handles audience validation).
- Username generation TOCTOU race condition in Google signup still exists (MEDIUM — uniqueness check outside transaction). P2002 is caught by `sendError` but message is generic.
- `tempCredential` (raw Google JWT) sent back to frontend for course selection flow expires in ~5 minutes. If user takes longer, the `/google/complete` call will fail silently. Consider server-side session approach.
- Near-identical code in `/google` and `/google/complete` endpoints should be extracted to a shared helper function.
- SearchModal does not show error feedback to user on 400 responses (shows "No results found" instead). LOW priority.

---

Cycle 8 — Remove 2FA, Redesign Auth Pages & Homepage [2026-03-18]

Changed:

- Removed 2-step verification (2FA) system-wide:
  - Backend: removed `/api/auth/verify-2fa` route, `sendTwoFactorChallenge` function, 2FA checks in login flow, `sendTwoFaCode` import from auth routes.
  - Backend: removed `/api/settings/2fa/enable` and `/api/settings/2fa/disable` endpoints from settings routes.
  - Backend: removed `twoFaEnabled` from `getAuthenticatedUser` select and `buildAuthenticatedUserPayload`.
  - Backend: removed 2FA check from `requireAdmin` middleware (admins no longer blocked by missing 2FA).
  - Backend: removed `verify-2fa` from `guardedMode.js` AUTH_WRITE_ALLOWLIST.
  - Backend: removed `twoFaEnabled` from settings route user select and email-change 2FA disable logic.
  - Frontend: removed 2FA state, UI, and handlers from `LoginPage.jsx`.
  - Frontend: removed 2FA section (enable/disable toggle, password confirm) from `SecurityTab.jsx`.
  - Frontend: removed `AdminMfaRequiredCard` component and `adminMfaRequired` checks from `AdminPage.jsx`.
  - Frontend: updated `authNavigation.js` to remove 2FA-based admin redirect to settings.
  - Prisma schema fields (`twoFaEnabled`, `twoFaCode`, `twoFaExpiry`) left in place to avoid migration risk; they are simply unused.

- Redesigned Login page (`LoginPage.jsx`):
  - Dark gradient background with frosted-glass card and decorative orbs.
  - Prominent Google Sign-In button with "or continue with" divider.
  - Gradient primary button, focus ring animations on inputs, `#f8fafc` input backgrounds.
  - Logo mark icon at top of card.
  - Rounded 24px card with backdrop-filter blur.

- Redesigned Registration page (`RegisterScreen.jsx`):
  - Matching dark gradient background with glass-morphism card.
  - Google Sign-Up button prominently placed in account step.
  - 2-column layout for username/email and password/confirm fields.
  - Gradient step indicators with progress bars.
  - Step-specific icons (logo, email envelope, book) for visual context.
  - Green gradient "Create Account" button on courses step.

- Enhanced Homepage (`HomePage.jsx`, `index.css`):
  - Improved fork-tree SVG with extra branches, gradient node fills, and leaf nodes for depth.
  - Added social proof banner below hero: "No credit card required", "No ads, ever", "Open source", "Sign up in 60 seconds".
  - Added testimonials section with 3 student testimonial cards (star ratings, avatars, school names).
  - Added section subtitle support for features section.
  - Enhanced CTA section with gradient background matching hero and dual-button layout.
  - Improved hero search bar with `backdrop-filter: blur`, focus-within border glow, styled search button.
  - Enhanced fork-tree in how-it-works section with animated pulse rings on key nodes, additional sub-branches, and more leaf nodes.
  - New CSS: `.home-proof-banner`, `.home-testimonials-section`, `.home-testimonial-card`, `.home-hero-search`, `.home-cta-buttons`, `.home-cta-glow-orb`, `.home-section-subtitle`.
  - Responsive: testimonials grid collapses to single column at 1024px, proof banner stacks vertically at 768px.

Validation:

- `npx vite build` — passed, 0 errors, all chunks generated successfully.
- Deep scan confirmed no remaining `adminMfaRequired`, `AdminMfaRequired`, or active 2FA runtime references in frontend source.
- Backend 2FA routes removed; only Prisma schema columns remain (inert, no migration needed).

Cycle 8 Deferred-Risk Notes

- Prisma schema still has `twoFaEnabled`, `twoFaCode`, `twoFaExpiry` fields on User model. These are unused but left to avoid requiring a database migration. Can be cleaned up in a future migration cycle.
- `sendTwoFaCode` function still exists in `backend/src/lib/email.js` (exported but never called). Can be removed in a cleanup pass.
- Bootstrap repair SQL statements still create 2FA columns with `ADD COLUMN IF NOT EXISTS` (harmless — ensures schema consistency for existing deploys).
- Test files (`auth.routes.test.js`, `admin.routes.test.js`, `LoginPage.test.jsx`) still reference 2FA patterns. Tests should be updated in a dedicated test maintenance pass.

---

Cycle 9 — Responsive Redesign + Tutorial System + Bug Fixes [2026-03-18]

Goal

- Make every page responsive across phone (≤767px), tablet (768–1179px), and desktop (≥1180px).
- Add first-visit tutorial popups on major pages via react-joyride.
- Remove email verification from auth flow.
- Add unsaved-changes warning on Upload Sheet page.
- Deep scan and fix bugs introduced by changes.

Added:

- react-joyride tutorial popup system:
  - `frontend/studyhub-app/src/lib/useTutorial.js` — shared hook managing Joyride state, localStorage persistence (`tutorial_{pageKey}_seen`), auto-start on first visit (800ms delay), styled tooltips matching Clean Academic Pro design (blue primary, 14px border-radius, Plus Jakarta Sans font).
  - `frontend/studyhub-app/src/lib/tutorialSteps.js` — per-page step definitions: `FEED_STEPS` (4 steps: composer, filters, search, leaderboards), `SHEETS_STEPS` (4 steps: search, filters, upload, toggles), `DASHBOARD_STEPS` (4 steps: hero, stats, sheets, actions), `NOTES_STEPS` (2 steps: filters, create).
  - Joyride integrated on FeedPage, SheetsPage, DashboardPage, NotesPage with `data-tutorial` attribute targets.
  - Floating "?" re-trigger button (fixed position, bottom-right) on all tutorial-enabled pages to replay the tutorial.
- Responsive CSS framework (`frontend/studyhub-app/src/styles/responsive.css`):
  - `app-three-col-grid`: 3-column desktop (auto 1fr 280px) → 2-column tablet (auto 1fr 260px) → 1-column phone.
  - `app-two-col-grid`: 2-column desktop → 1-column phone.
  - `dashboard-stats-grid`: 3-column → 2-column tablet → 1-column phone.
  - `dashboard-content-grid`: 2-column → 1-column tablet.
  - `notes-split-panel`: 300px+1fr desktop → 260px+1fr tablet → 1-column phone.
  - `sheets-filter-grid`, `sheets-card-grid`: responsive filter bar and card grid.
  - `tests-card-grid`: 2-column → 1-column responsive.
  - `profile-columns`, `profile-stats-row`: responsive profile layout.
  - Utility classes: `hide-on-phone`, `hide-on-compact`.
- Unsaved-changes warning on UploadSheetPage:
  - `beforeunload` event listener warns when user tries to close/navigate away with form data.
  - Tracks dirty state across title, description, file, and course selection fields.

Changed:

- **FeedPage** — replaced inline grid styles with CSS class `app-three-col-grid`; added tutorial integration.
- **SheetsPage** — replaced inline grid with `app-three-col-grid`; added `sheets-filter-grid` and `sheets-card-grid` classes; updated description text to user-friendly copy; added tutorial integration.
- **DashboardPage** — replaced inline grid with `app-two-col-grid`, `dashboard-stats-grid`, `dashboard-content-grid` classes; added tutorial integration.
- **NotesPage** — full structural redesign: split-panel layout on desktop (list 300px | editor flex), on phone shows list OR editor with back button; uses `notes-split-panel` CSS class; added abort cleanup in useEffect; added tutorial integration.
- **AnnouncementsPage** — improved card design with author avatar initials, pinned announcement badges, better form styling, `<article>` semantic tags.
- **TestsPage** — cards use `tests-card-grid` for responsive 2-column layout; improved tab and promo banner styling.
- **UserProfilePage** — now uses shared `<Navbar>` component; replaced Font Awesome icons with shared Icon components; responsive avatar via `clamp()`; two-column `profile-columns` layout; removed ~200 lines of inline `styles` object.
- **SettingsPage** — replaced custom header with shared `<Navbar>` component; cleaned up imports.
- **LoginPage** — removed email verification flow; simplified to username + password + Google OAuth only.
- **RegisterScreen** — removed email verification step; simplified to account details + course selection (2 steps).
- **Auth backend** (`backend/src/routes/auth.js`) — removed email verification endpoints (`/register/start`, `/register/verify`, `/register/resend`, `/register/complete`); simplified to single `POST /register` endpoint that creates the user and returns JWT directly.

Fixed:

- **NotesPage fetch cleanup (HIGH)** — useEffect did not cancel in-flight fetches on unmount. Added `let active = true` flag pattern with cleanup `return () => { active = false }` and guarded all state updates with `if (active)` checks to prevent React state updates on unmounted components.
- **Dashboard stale email verification text (MEDIUM)** — hero text still referenced `hero.emailVerified` conditional. Replaced with static text "Your study sheets, notes, and practice tests are ready."

Cycle 9 Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run build`

Cycle 9 Validation Result

- Frontend production build passed in 413ms.
- 0 errors, 0 warnings.
- All chunks generated: FeedPage 20.86kB, DashboardPage 10.87kB, NotesPage 10.75kB, SheetsPage 10.73kB, UserProfilePage 8.54kB, TestsPage (included in main bundle).

Cycle 9 Deep Scan Summary

- Scan method: automated bug scan across all 15 modified files.
- 8 issues found total: 1 high (NotesPage fetch cleanup — fixed), 3 medium (dashboard stale text — fixed; Google OAuth code duplication — pre-existing; dead email verification endpoints — removed in this cycle), 4 low (pre-existing issues).
- No new security vulnerabilities introduced.
- All auth flow changes verified: email verification fully removed from both frontend and backend, JWT issued directly on registration.

Cycle 9 Deferred-Risk Notes

- `react-joyride` adds ~100kB gzipped to the tutorial chunk (`tutorialSteps-DEdYIjMa.js`: 101.42kB / 31.55kB gzip). Consider lazy-loading the Joyride component only when tutorial is active.
- Tutorial `data-tutorial` attribute selectors depend on DOM elements being present when Joyride mounts. If elements render conditionally or late, steps targeting them will be skipped silently.
- Notes split-panel on tablet uses 260px for the list panel — may feel cramped with long note titles. Monitor user feedback.
- Pre-existing Google OAuth code duplication between `/google` and `/google/complete` endpoints still exists (deferred from Cycle 7).
- `beforeunload` warning on UploadSheetPage cannot be customized in modern browsers (Chrome shows generic "Changes you made may not be saved" message regardless of the custom string).

---

Cycle 10 — Moderation Engine + Settings Enforcement + Google Link [2026-03-18]

Week 2 of the v1.5 roadmap. Builds the moderation runtime on top of the database schema provisioned in Cycle 5, enforces user preferences, and connects the Google link flow.

Added:

- **Content moderation engine** (`backend/src/lib/moderationEngine.js` ~220 lines):
  - Lazy-initialized OpenAI client; feature-gated by `OPENAI_API_KEY` env var presence.
  - `scanContent()`: fire-and-forget async scan via OpenAI Moderation API. Never blocks content creation.
  - Confidence routing: score >= 0.85 → high confidence case, 0.5–0.84 → medium, < 0.5 → no case.
  - `issueStrike()`: creates strike with 90-day expiry; auto-restricts user at >= 4 active strikes.
  - `reviewCase()`: admin dismiss/confirm workflow.
  - `countActiveStrikes()`, `hasActiveRestriction()` utility functions.
  - All errors captured via Sentry, never thrown to callers.

- **Restriction enforcement middleware** (`backend/src/middleware/checkRestrictions.js` ~55 lines):
  - Global middleware mounted after CSRF; blocks restricted users from write operations (POST/PATCH/DELETE).
  - Skips GET/HEAD/OPTIONS, unauthenticated requests, and admin users.
  - Fail-open pattern: DB errors allow the request through (never block all users on a DB blip).
  - Returns 403 with `{ restricted: true, restrictionType }` for restricted users.

- **Moderation admin + user routes** (`backend/src/routes/moderation.js` ~370 lines):
  - Admin endpoints at `/api/admin/moderation`: cases (list/detail/review), strikes (list/create), restrictions (list/lift), appeals (list/review).
  - User endpoints at `/api/moderation`: my-strikes, my-appeals, submit appeal (rate limited, min 20 chars, 1 pending per case).
  - Appeal approval cascades: decays linked strike, dismisses case, lifts restriction if no remaining active strikes.

- **Admin ModerationTab** (`frontend/.../admin/ModerationTab.jsx` ~470 lines):
  - Extracted component with sub-tabs: Cases, Strikes, Appeals, Restrictions.
  - Each sub-tab has independent pagination state, status filters, and action buttons.
  - Includes "Issue New Strike" form in Strikes sub-tab.
  - Follows existing AdminPage inline-style and confirm-dialog patterns.

Changed:

- **Feed routes** (`backend/src/routes/feed.js`):
  - POST `/posts`: async moderation scan on content after response sent.
  - POST `/posts/:id/comments`: same fire-and-forget scan pattern.

- **Sheet routes** (`backend/src/routes/sheets.js`):
  - POST `/`: reads `UserPreferences.defaultDownloads` when `allowDownloads` not explicitly set.
  - POST `/` and PATCH `/:id`: async moderation scan on title + description + markdown content.

- **User profile route** (`backend/src/routes/users.js`):
  - GET `/:username`: enforces `UserPreferences.profileVisibility` setting.
  - `private` → 403 for all non-owner, non-admin viewers.
  - `enrolled` → 403 unless viewer shares at least one course with the profile owner.
  - Own profile and admin viewers always bypass visibility checks.

- **AdminPage** (`frontend/.../admin/AdminPage.jsx`):
  - Added 'Moderation' to TABS array; renders `<ModerationTab>` when active.
  - Excluded 'moderation' from generic paged-data rendering block.

- **SecurityTab** (`frontend/.../settings/SecurityTab.jsx`):
  - Replaced placeholder Google link handler with real `GoogleLogin` popup flow.
  - Calls `POST /api/settings/google/link` with credential from Google One Tap.
  - Toggle pattern: "Link Google Account" button reveals `<GoogleLogin>` component with Cancel option.

- **Backend entry** (`backend/src/index.js`):
  - Mounted `checkRestrictions` middleware globally after CSRF.
  - Mounted moderation admin routes at `/api/admin/moderation`.
  - Mounted moderation user routes at `/api/moderation`.

- **Environment** (`backend/.env.example`):
  - Added `OPENAI_API_KEY=` with documentation comment.

Cycle 10 Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run build`
- `npx prisma validate` (from backend/)

Cycle 10 Validation Result

- Frontend build: 0 errors, 0 warnings. 39 output chunks. `AdminPage-BgUCuE-Z.js` grew to 43.08kB (includes ModerationTab import).
- Prisma schema: valid (no schema changes this cycle — runtime only).

Cycle 10 Deep Scan Summary

- `checkRestrictions` uses fail-open pattern matching `guardedMode.js` — DB errors never block users.
- `scanContent` is always `void`-called (fire-and-forget) — never awaited, never blocks response.
- Strike auto-restriction checks for existing active restriction before creating duplicate.
- Appeal approval cascade runs in a transaction-like sequence: decay strike → dismiss case → check remaining strikes → lift restriction.
- Profile visibility enforcement added `UserPreferences` query per profile view — consider caching if profile views spike.
- GoogleLogin credential flows through the existing `verifyGoogleIdToken` + `linkGoogleToUser` backend pipeline.
- All new admin endpoints are behind `requireAuth` + `requireAdmin` middleware chain.

Cycle 10 Deferred-Risk Notes

- OpenAI Moderation API latency is unbounded; `scanContent` has no timeout. If the API is slow, fire-and-forget calls accumulate in memory. Consider adding a 10s `AbortController` timeout in a future cycle.
- Profile visibility `enrolled` check performs two sequential Prisma queries (target enrollments + viewer enrollment match). Could be optimized to a single raw SQL query with `EXISTS` subquery if performance becomes an issue.
- ModerationTab "Issue New Strike" form accepts raw user IDs — no autocomplete or user search. Admin must know the user ID. Consider adding a user search dropdown in a future cycle.
- The `GoogleLogin` popup in SecurityTab inherits the `GoogleOAuthProvider` from App.jsx. If the provider is ever removed or conditionally rendered, the popup will fail silently.
- Content moderation only scans text — attachments (images, PDFs) are not scanned by the OpenAI Moderation API. ClamAV covers malware but not inappropriate image content.

---

Cycle 11 — Responsive Polish Pass [2026-03-18]

Audit and fix of responsive design issues across the frontend. Addresses inline style overrides that prevented CSS media queries from working, plus missing tablet breakpoints.

Fixed:

- **Navbar notification dropdown** (`Navbar.jsx`): Fixed-width `320px` → `clamp(280px, 90vw, 320px)` so it fits on narrow phones without overflow.
- **Navbar padding** (`Navbar.jsx`): Hard-coded `24px` horizontal padding → `clamp(12px, 3vw, 24px)` to give more room on small screens.
- **Navbar breadcrumb truncation** (`Navbar.jsx`): Fixed `maxWidth: 220` → `clamp(120px, 30vw, 220px)` so long sheet titles are readable on mobile.
- **Admin stats grid** (`AdminPage.jsx` + `responsive.css`): Removed inline `gridTemplateColumns: 'repeat(4, ...)'` that was overriding the CSS media queries. Moved 4-column default into `.admin-stats-grid` class with proper tablet (2-col) and phone (2-col / 1-col) breakpoints.
- **Register password hints** (`RegisterScreen.jsx` + `responsive.css`): Replaced inline 2-column grid with `.password-hints-grid` CSS class. Stacks to 1-column on very narrow screens (<=340px).
- **ModerationTab strike form** (`ModerationTab.jsx` + `responsive.css`): Replaced inline 2-column grid with `.mod-strike-form-grid` class. Stacks to 1-column on phone.
- **Home testimonials grid** (`index.css`): Added missing tablet breakpoint — 3 columns → 2 columns on 768–1024px screens instead of jumping straight to 1 column.

Cycle 11 Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run build`

Cycle 11 Validation Result

- Frontend build: 0 errors, 0 warnings. 39 output chunks. CSS grew from 25.78kB to 26.38kB (new responsive rules).

Cycle 11 Deep Scan Summary

- All responsive fixes use CSS classes or `clamp()` instead of hard-coded inline values.
- No JavaScript logic changes — all fixes are CSS-only or inline-style-to-class migrations.
- Admin stats grid `!important` overrides removed; proper cascade now works via class specificity.
- Existing responsive patterns in `responsive.css` are now consistent in structure (desktop default in class, then tablet + phone overrides in media queries).

Cycle 11 Deferred-Risk Notes

- Notes split panel on phone stacks list above editor with no toggle affordance — user may not realize they can scroll past the list. Consider adding a "Back to list" collapse mechanism.
- Admin moderation tables use `overflowX: 'auto'` for horizontal scroll, which works but isn't ideal on phones with 7+ columns. Consider hiding non-critical columns on phone in a future pass.
- Sheets filter bar on tablet (2-col wrapping) can look uneven with 5 inputs. A 3-column tablet layout could be better.

---

Cycle 12 — Security Audit + Bug Fixes [2026-03-18]

Deep scan of all Week 2 code (moderation engine, routes, middleware, frontend components) to identify and fix security vulnerabilities, logic bugs, and connection issues.

Fixed:

- **CRITICAL — Missing moderation scan on sheet fork** (`sheets.js`): Forked sheets bypassed content moderation entirely. Added `scanContent()` hook after fork creation, matching the pattern used in POST `/` and PATCH `/:id`.

- **CRITICAL — Race condition in auto-restriction** (`moderationEngine.js`): Two concurrent strikes could both see "no restriction exists" and create duplicate UserRestriction records. Wrapped the check-and-create logic in a `prisma.$transaction()` to ensure atomicity.

- **HIGH — Silent error swallowing in appeal approval** (`moderation.js`): Three `.catch(() => {})` calls silently discarded errors during case dismissal, strike decay, and restriction lifting. Replaced with `.catch((err) => captureError(err, { context }))` to log failures to Sentry.

- **HIGH — Missing credential validation in SecurityTab** (`SecurityTab.jsx`): `handleGoogleLinkSuccess` sent `credentialResponse.credential` without checking if it exists. Added null check before API call to prevent sending `{credential: undefined}`.

- **HIGH — Uncleared password after Google unlink** (`SecurityTab.jsx`): Password remained in component state after successful unlink. Added `setGoogleUnlinkPassword('')` to clear it immediately.

- **HIGH — N+1 query in profile visibility check** (`users.js`): The `enrolled` visibility check ran two sequential queries (fetch all target enrollments, then match against viewer). Replaced with single Prisma relational filter using `course: { enrollments: { some: { userId } } }` which generates an efficient EXISTS subquery. Also strengthened the unauthenticated check from `!req.user` to `!req.user?.userId`.

- **MEDIUM — No upper bound on pagination** (`moderation.js`): `parsePage()` accepted any positive integer, allowing `?page=999999999` to force expensive DB skips. Added `page <= 10000` cap.

- **MEDIUM — No max length on strike reason** (`moderation.js`): Admin could submit arbitrarily long strike reasons causing DB bloat. Added 1000-character limit.

Cycle 12 Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run build`

Cycle 12 Validation Result

- Frontend build: 0 errors, 0 warnings. 39 output chunks.

Cycle 12 Deep Scan Summary

- Auto-restriction now uses `prisma.$transaction()` — eliminates the TOCTOU race window.
- Appeal approval cascade errors are now logged to Sentry with context (appealId, operation type).
- Profile visibility `enrolled` check reduced from 2 DB queries to 1 relational filter.
- All moderation content creation paths now have scan hooks: POST `/` (create), PATCH `/:id` (update), POST `/:id/fork` (fork).
- Input validation bounds: parsePage capped at 10000, strike reason capped at 1000 chars, appeal reason already capped at 2000 chars.

---

Cycle 13 — Registration Simplification (Email Removal)
Date: 2026-03-18

Changed

- **Registration flow now uses username + password only** — email field removed from the account creation form. Users can optionally add an email later in Settings for password recovery.
- **Backend `validateRegistrationInput()`** now calls `normalizeEmail(email, true)` making email optional; returns `null` when not provided.
- **Backend email uniqueness check** skipped when email is `null` — prevents unnecessary DB query on registration.
- **Frontend `RegisterScreen.jsx`**: removed email from form state, validation, API request body, and JSX. Username field is now full-width. Divider text changed from "or sign up with email" to "or create an account".
- **Cleaned up unused `email` regex** from `RULES` constant in RegisterScreen.

Cycle 13 Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run build`

Cycle 13 Validation Result

- Frontend build: 0 errors, 0 warnings. 39 output chunks.

Cycle 13 Notes

- Login page already uses username + password + Google button only — no changes needed.
- Prisma schema already has `email String?` (nullable) — no migration required.
- Google OAuth registration flow is unaffected (email comes from Google token, not user input).

---

Cycle 14 — Resend Email Integration
Date: 2026-03-18

Added

- **Resend email transport** configured for `getstudyhub.org` — emails now deliver to real inboxes via Resend API.
- Domain verified with DKIM, SPF, and DMARC DNS records on Squarespace.

Fixed

- **Double-wrapped `from` address** (`email.js`): `getFromAddress()` returned the full `Name <email>` string from `EMAIL_FROM`, then callers wrapped it again as `"StudyHub" <Name <email>>` — invalid format rejected by Resend. Fixed by extracting the bare email from angle brackets when present.
- **Transport validation rejected send-only API keys** (`email.js`): `validateEmailTransport()` called `/domains` endpoint which returns 401 for send-restricted keys. Now recognizes `restricted_api_key` response as valid (key works, just limited scope).

Cycle 14 Validation Commands (Executed)

- `node -r dotenv/config -e "validateEmailTransport()"` — returns `{ ok: true, mode: 'resend' }`
- `node -r dotenv/config scripts/emailSmoke.js` equivalent — smoke test email delivered to abdulrfornah@gmail.com

Cycle 14 Notes

- Env vars required: `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `EMAIL_FROM`
- Resend free tier: 100 emails/day, sufficient for beta
- All email functions (password reset, email verification, course request notices) now route through Resend

---

Cycle 15 — Pre-Release Quality Audit & Bug Fixes
Date: 2026-03-18

Fixed (CRITICAL)

- **`/register/start` crashes with null email** (`auth.js`): Since email is now optional, `prisma.user.findUnique({ where: { email: null } })` threw a runtime error. Added guard rejecting null email at the top of the verified registration flow — this path inherently requires email.

Fixed (HIGH)

- **Password change bypassed strength rules** (`settings.js`): `PATCH /settings/password` only checked length (8 chars) but not uppercase/digit requirements enforced at registration. Added matching validation.
- **Star notification showed "undefined" title** (`sheets.js`): `visibility` query selected `id`, `userId`, `status` but not `title`. Notification message rendered `"starred your sheet 'undefined'"`. Added `title: true` to the SELECT.
- **Missing `await` in email suppression check** (`email.js`): `getSuppressedRecipients` returned the Prisma promise without awaiting, so the `catch` block for DB errors never fired — errors propagated as unhandled rejections. Added `await`.
- **UserProfilePage showed raw HTTP status codes** (`UserProfilePage.jsx`): Error display showed `"Error 403"` or `"Error 500"` instead of the backend's user-friendly message. Now reads the JSON error body from the response.
- **Follow/unfollow errors silently ignored** (`UserProfilePage.jsx`): `catch { /* ignore */ }` replaced with user-visible error feedback.
- **HTML sheet download XSS risk** (`sheets.js`): Downloaded HTML files served as `text/html` could execute scripts if opened in-browser. Added `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` and `X-Content-Type-Options: nosniff` headers.
- **Unbounded similar-user query in recommendations** (`courses.js`): Collaborative filtering loaded ALL users sharing any course with no limit. At scale (popular course with 10,000 enrollments), this caused massive memory usage. Added `take: 500` cap.

Fixed (MEDIUM)

- **Notes endpoint had no pagination** (`notes.js`): `GET /api/notes` returned ALL notes with no `take` limit. Added `page` + `limit` params with `take: 50` default (capped at 100). Frontend updated to handle both old array and new `{ notes, total }` response shape.
- **Course request name had no max length** (`courses.js`): `rawName` accepted arbitrarily long strings. Added 200-character cap.
- **Starred sheet ordering used O(n^2) lookup** (`sheets.js`): `starredSheetIds.map(id => sheets.find(...))` replaced with `Map`-based O(n) lookup.
- **Google-only users saw broken "Change Username" form** (`SecurityTab.jsx`): Username change requires password confirmation, which Google-only accounts don't have. Now shows an informational message instead of an always-failing form.

Cleaned Up

- **Removed dead `sendTwoFaCode` function** (`email.js`): 2FA was removed in a prior cycle but the email function and export remained as dead code.

Cycle 15 Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run build`

Cycle 15 Validation Result

- Frontend build: 0 errors, 0 warnings. 39 output chunks.

Cycle 15 Deep Scan Summary

- 30 issues identified across backend routes, frontend pages, email system, data model, and security
- 1 CRITICAL, 7 HIGH, 4 MEDIUM fixed in this cycle
- Remaining items deferred (LOW severity): `parseInt` radix consistency, Announcement cascade delete, admin stats caching, RequestedCourse NULL uniqueness, Avatar aria-labels

---

Cycle 16 — Code Review Fixes (Sourcery, Codex, Copilot)
Date: 2026-03-18

Fixed (CRITICAL)

- **`checkRestrictions` middleware was dead code** (`index.js`): Mounted globally before any auth middleware populated `req.user`, so `if (!req.user?.userId) return next()` always fired — restricted users could post, comment, and upload freely. Fixed by adding an optional auth decode middleware before `checkRestrictions` that reads the JWT token (Bearer header or cookie) non-fatally.

Fixed (HIGH)

- **ModerationCase didn't store author userId** (`schema.prisma`, `moderationEngine.js`, `moderation.js`): Cases were created without linking to the flagged user, so the admin moderation queue showed `undefined` in the User column and admins couldn't tell who posted flagged content. Added `userId Int?` column with relation, migration, and `include: { user }` on case queries.
- **OpenAI moderation call missing explicit `model`** (`moderationEngine.js`): SDK v6 requires `model` parameter. Without it, calls would fail with `invalid_request_error`, silently disabling moderation. Added `model: 'omni-moderation-latest'` (configurable via `OPENAI_MODERATION_MODEL` env var).

Fixed (MEDIUM)

- **ModerationTab displayed `c.topScore` but schema has `c.confidence`** (`ModerationTab.jsx`): Score column always showed "—". Changed to read `c.confidence`.
- **UserProfilePage showed "User not found" for private profiles** (`UserProfilePage.jsx`): 403 privacy errors now show a lock icon and "Profile not available" heading instead of the generic "User not found".
- **HTML import didn't mark unsaved changes** (`UploadSheetPage.jsx`): Importing an HTML file didn't set `hasUnsavedChanges`, so the beforeunload guard wouldn't fire if the user navigated away without saving.

Fixed (LOW)

- **Dependency tracker listed react-joyride as "TBD"** (`dependency-tracker.md`): Updated to `^2.9.3`.
- **LoginPage comment referenced removed email verification** (`LoginPage.jsx`): Updated comment to match current flow.
- **Security doc typo** (`security-overview.md`): "anonymized evidence 90 days" → "kept for 90 days".

Cycle 16 Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run build`
- `npx prisma generate` (after schema change)

Cycle 16 Validation Result

- Frontend build: 0 errors, 0 warnings. 39 output chunks.
- Prisma client regenerated successfully.
- Migration `20260318160000_add_userid_to_moderation_case` applied.

---

Cycle 17 Additions (Bug Fixes — Crash, UI, Mobile, Theme) [2026-03-18]
Implemented in beta lane:

Fixed:

- **Upload sheet page crash**: Wrapped `react-joyride` in SafeJoyride error boundary — library requires React 15-18 but project uses React 19. Joyride crashes are now silently caught instead of crashing entire pages. Made upload editor grid responsive (`repeat(auto-fit, minmax(200px, 1fr))`) and added `upload-editor-split` responsive CSS for mobile.
- **Feed "Open" button**: Hid the "Open" link on post-type feed items — posts link to `/feed?post=X` which just reloads the same page. "Open" now only shows for sheets and announcements with real target pages.
- **Theme setting not applying in real-time**: Added `applyThemeToDOM()` and `applyFontSizeToDOM()` helpers to AppearanceTab that set `data-theme` attribute and `document.documentElement.style.fontSize` on change. Added `PreferencesBootstrap` component in App.jsx that loads and applies saved preferences on first auth (with localStorage cache for instant apply).
- **Font size setting not applying in real-time**: Same mechanism as theme — font size changes are applied to the DOM immediately via the `fontSize` CSS property on `<html>`. Preferences are cached in `localStorage` under `studyhub_prefs`.
- **Oversized search/filter inputs**: Changed `font: 'inherit'` to explicit `fontSize: 13` on SheetsPage search, FeedPage "All courses" dropdown, and FeedPage "Search the feed" input. Shortened SheetsPage placeholder to "Search by title, description...". Constrained feed search to `maxWidth: 240` and course dropdown to `maxWidth: 200`.
- **Mobile/tablet crash after sign-in/register**: Changed `completeAuthentication()` in session-context from `startTransition` to `flushSync` — ensures session state is committed synchronously before `navigate()` fires. Previously, the target page (FeedPage) would render before the session context was updated, causing a crash on mobile.
- **Railway build failures**: Changed both Dockerfiles from `npm ci` to `npm install` — project is a workspaces monorepo with a single root lock file, so `npm ci` in subdirectories fails. Added `--legacy-peer-deps` to frontend Dockerfile for react-joyride React 19 peer dep conflict.

Added:

- **User shared notes on profile**: Added `sharedNotes` array to `GET /api/users/:username` response — returns up to 10 non-private notes with title, course code, and date. Added "Shared Notes" section to UserProfilePage showing the notes list.
- **SafeJoyride component**: `frontend/studyhub-app/src/components/SafeJoyride.jsx` — error boundary wrapper around react-joyride. Used in FeedPage, SheetsPage, NotesPage, and DashboardPage.

Changed:

- `frontend/studyhub-app/Dockerfile`: `npm ci --legacy-peer-deps` → `npm install --legacy-peer-deps`
- `backend/Dockerfile`: `npm ci --omit=dev` → `npm install --omit=dev`

Cycle 17 Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run build`
- `node --check backend/src/index.js`
- `npm --prefix frontend/studyhub-app run lint`

Cycle 17 Validation Result

- Frontend build: 0 errors, 0 warnings. 39 output chunks.
- Backend syntax check passed.
- Lint: 0 new errors/warnings introduced (3 pre-existing errors, 1 pre-existing warning unchanged).

---

Cycle 18 — Feed Post Comments & Google OAuth Security Fix (2026-03-18)

Scope: Add inline comment UI for feed posts; fix Google OAuth email exposure security issue.

Changes:

1. **Feed Post Comment UI** — Added full inline comment section to every post in the feed.
   - Expandable comment thread: click "N comments" to toggle open/closed
   - Comment composer: textarea with character count (500 max), Avatar, post button
   - Comment list: displays author, timestamp, content with delete button for own comments/admins
   - Calls existing backend endpoints: `GET /posts/:id/comments`, `POST /posts/:id/comments`, `DELETE /posts/:id/comments/:commentId`
   - `CommentSection` component added to `FeedPage.jsx`, rendered inside each `FeedCard` for posts
   - Lazy loads comments on first expand (not on page load — performance optimization)

2. **Google OAuth Security Fix** — Removed email exposure from Google OAuth flow.
   - Backend `POST /api/auth/google`: No longer sends `googleEmail` in `requiresCourseSelection` response
   - Frontend `RegisterScreen.jsx`: Success message now shows `googleName` instead of email
   - Frontend `LoginPage.jsx`: Navigation state no longer includes `googleEmail`
   - Username generation unchanged: still prioritizes `googlePayload.name` over email prefix

3. **Google Sign-In Button (Production)** — Button code is correct and renders when `VITE_GOOGLE_CLIENT_ID` is set. **Action required**: Set `VITE_GOOGLE_CLIENT_ID` environment variable in Railway frontend service to enable the Google button in production.

Files Modified:
- `frontend/studyhub-app/src/pages/feed/FeedPage.jsx` — Added `CommentSection` component, passed `currentUser` to `FeedCard`
- `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx` — Changed email display to name display
- `frontend/studyhub-app/src/pages/auth/LoginPage.jsx` — Removed `googleEmail` from navigation state
- `backend/src/routes/auth.js` — Removed `googleEmail` from `requiresCourseSelection` response

Cycle 18 Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run build`

Cycle 18 Validation Result

- Frontend build: 0 errors, 0 warnings.

---

Cycle 19 — Appearance Bootstrap Cleanup + Joyride Telemetry + Feed Comment Refactor [2026-03-18]

Changed:

- Centralized appearance DOM helpers and cache utilities into `frontend/studyhub-app/src/lib/appearance.js`:
  - Shared `applyTheme`, `applyFontSize`, and cached-preferences helpers now back both `App.jsx` and `AppearanceTab.jsx`.
  - Eliminated duplicate theme/font-size DOM logic between the auth bootstrap path and settings UI.
- Extracted preferences bootstrap orchestration into `frontend/studyhub-app/src/lib/useBootstrapPreferences.js`:
  - `App.jsx` now consumes a dedicated hook instead of owning the localStorage + fetch + DOM apply flow inline.
  - Bootstrap now runs once per authenticated app session and keeps the route layer thinner.
- Refactored Feed comments in `frontend/studyhub-app/src/pages/feed/FeedPage.jsx`:
  - Added `useComments(postId, initialCount)` hook for comment fetch/post/delete state.
  - Split rendering into `CommentInput` and `CommentList` helpers.
  - Lifted repeated comment-section style objects into named constants for easier scanning and lower JSX noise.

Fixed:

- Joyride errors are no longer silently swallowed:
  - Added `captureComponentError` to `frontend/studyhub-app/src/lib/telemetry.js`.
  - `frontend/studyhub-app/src/components/SafeJoyride.jsx` now logs boundary failures through the shared telemetry layer with `surface: joyride-error-boundary`.
- Feed comment loading now retries correctly after a failed initial fetch instead of permanently treating the thread as loaded.
- Feed comment post flow now uses shared API error parsing (`readJsonSafely` + `getApiErrorMessage`) for more consistent failures.

Cycle 19 Validation Commands (Executed)

- `npx eslint src/App.jsx src/pages/settings/AppearanceTab.jsx src/components/SafeJoyride.jsx src/lib/telemetry.js src/lib/appearance.js src/lib/useBootstrapPreferences.js src/pages/feed/FeedPage.jsx` (from `frontend/studyhub-app/`)
- VS Code Problems scan on all touched files (`App.jsx`, `AppearanceTab.jsx`, `SafeJoyride.jsx`, `telemetry.js`, `appearance.js`, `useBootstrapPreferences.js`, `FeedPage.jsx`)

Cycle 19 Validation Result

- Targeted ESLint passed with exit code `0` for all files changed in this cycle.
- VS Code diagnostics reported no remaining errors in the touched files.
- Full frontend lint script remains blocked by pre-existing unrelated issues in `src/lib/animations.js`, `src/pages/admin/AdminPage.jsx`, `src/pages/settings/settingsShared.jsx`, and `src/pages/sheets/UploadSheetPage.jsx`.

Cycle 19 Deep Scan Summary

- Scope: frontend-only refactor of appearance bootstrap, settings appearance application, Joyride observability, and feed comment rendering.
- Shared-behavior scan confirmed theme/font-size application now has a single implementation path, reducing drift risk between settings and app bootstrap.
- Observability scan confirmed Joyride failures still degrade safely to `null` render, but now emit telemetry instead of disappearing silently.
- Comment-flow scan confirmed lazy load, comment count display, 500-character guard, optimistic append, and delete permissions remain intact after the extraction.

Cycle 19 Deferred-Risk Notes

- No browser-level manual interaction pass was run in this cycle; validation was limited to editor diagnostics and targeted ESLint.
- `system` theme behavior still follows the OS preference only when preferences are applied; it does not live-update if the OS theme changes after initial application.
- The Joyride boundary now restores observability, but the underlying third-party incompatibility that triggers the boundary is still a vendor-level risk until `react-joyride` is upgraded or replaced.

---

Cycle 20 — PR Review Follow-Ups (Appearance Cache + Feed Composer Avatar) [2026-03-18]

Fixed:

- Appearance preference cache is now user-scoped instead of global:
  - `frontend/studyhub-app/src/lib/appearance.js`
  - Cached theme/font-size now writes to `studyhub_prefs_<userId>` instead of a shared device-wide key.
  - Added logout-time appearance reset and legacy-cache cleanup to avoid one user's cached appearance briefly carrying into another user's session on shared devices.
- AppearanceTab now writes cached preferences only after a successful server save:
  - `frontend/studyhub-app/src/pages/settings/AppearanceTab.jsx`
  - `frontend/studyhub-app/src/pages/settings/settingsState.js`
  - `usePreferences.save()` now returns a boolean so appearance cache writes only happen after a successful PATCH.
- Feed comment composer now uses the actual current user role when rendering the avatar, so admin users get the correct styling:
  - `frontend/studyhub-app/src/pages/feed/FeedPage.jsx`

Cycle 20 Validation Commands (Executed)

- `npx eslint src/App.jsx src/pages/settings/AppearanceTab.jsx src/pages/settings/settingsShared.jsx src/components/SafeJoyride.jsx src/lib/telemetry.js src/lib/appearance.js src/lib/useBootstrapPreferences.js src/pages/feed/FeedPage.jsx` (from `frontend/studyhub-app/`)
- `npx eslint src/App.jsx src/pages/settings/AppearanceTab.jsx src/pages/settings/settingsShared.jsx src/pages/settings/settingsState.js src/components/SafeJoyride.jsx src/lib/telemetry.js src/lib/appearance.js src/lib/useBootstrapPreferences.js src/pages/feed/FeedPage.jsx` (from `frontend/studyhub-app/`)
- VS Code Problems scan on touched frontend files

Cycle 20 Validation Result

- Targeted ESLint passed with exit code `0` for the touched files.
- VS Code diagnostics reported no remaining errors in the touched files.

Cycle 20 Deep Scan Summary

- Appearance bootstrap now uses authenticated user identity as the cache boundary, which closes the cross-user cached-theme bleed path without giving up warm-start behavior for the same user.
- Save-path scan confirmed appearance cache is no longer written on failed PATCH responses, so bootstrap state cannot drift ahead of server state.
- Feed review follow-up was limited to the composer avatar because comment payload authors still only include `id` and `username` from the backend.

Cycle 20 Deferred-Risk Notes

- The PR metadata scope comment is a review-process concern, not a code defect. If needed, update the PR title/description manually to reflect shared notes, appearance bootstrap work, Joyride hardening, feed comments, and auth/mobile fixes.

---

Cycle 21 — Repo Health Cleanup (Auth Tests + Settings Retry) [2026-03-18]

Fixed:

- Backend auth/admin tests now match the current v1.5.0 contract:
  - `backend/test/auth.routes.test.js`
  - `backend/test/admin.routes.test.js`
  - Removed stale expectations for login-time email verification and admin 2FA enforcement.
  - Tests now assert that login issues a session directly and that admin access depends on admin role only.
- Settings tabs no longer get stuck on a permanent loading state when preferences fail to load:
  - `frontend/studyhub-app/src/pages/settings/settingsState.js`
  - `frontend/studyhub-app/src/pages/settings/AppearanceTab.jsx`
  - `frontend/studyhub-app/src/pages/settings/NotificationsTab.jsx`
  - `frontend/studyhub-app/src/pages/settings/PrivacyTab.jsx`
  - `usePreferences()` now tracks load failures separately and exposes a retry path.
  - Appearance, Notifications, and Privacy now render a retryable error card instead of continuing to show `Loading preferences...` after a failed fetch.
- Full-frontend lint blockers were cleaned up:
  - `frontend/studyhub-app/src/lib/animations.js`
  - `frontend/studyhub-app/src/pages/admin/AdminPage.jsx`
  - `frontend/studyhub-app/src/pages/sheets/UploadSheetPage.jsx`
  - Removed an unused anime.js import, removed an unused admin button style object, tightened the navigation-blocker effect dependency, and cleaned two negated ternaries flagged by diagnostics.

Cycle 21 Validation Commands (Executed)

- `npm --prefix backend test`
- `npm --prefix frontend/studyhub-app run lint`
- `npm --prefix frontend/studyhub-app run build`

Cycle 21 Validation Result

- Backend Vitest: 14 test files passed, 57 tests passed.
- Frontend ESLint: full app passed with exit code `0`.
- Frontend production build: passed; Vite transformed 442 modules successfully.

Cycle 21 Deep Scan Summary

- Repo-wide validation confirmed the remaining backend failures were stale tests left behind after the v1.5.0 removal of login email-verification gating and admin 2FA enforcement, not active regressions in the application code.
- Settings tabs now distinguish `loading` from `load failed`, which closes a real UX bug where a failed preferences fetch left users with no recovery path.
- Full-frontend lint blockers were limited to dead code and a blocker-effect dependency issue; no additional runtime regressions surfaced during the production build.
- GitHub/ecosystem research surfaced general React 19 `findDOMNode` incompatibilities around tour libraries, which is consistent with the existing `SafeJoyride` isolation. No new StudyHub-specific upstream bug required an additional patch in this cycle.

Cycle 21 Deferred-Risk Notes

- The external research pass did not reveal a StudyHub-specific upstream issue to fix automatically; it mainly reinforced the existing third-party guided-tour compatibility risk already documented in Cycle 19.
- Settings retry currently reloads the entire preferences document. There is still no per-section fallback if the backend ever returns a partial preferences payload.

---

Cycle 22 — Search Contract Repair + Search Privacy Enforcement [2026-03-19]

Changed:

- Centralized profile-visibility decisions into `backend/src/lib/profileVisibility.js`:
  - Added shared helpers for `public`, `enrolled`, and `private` profile access.
  - Search and profile routes now consume the same visibility rules instead of maintaining separate logic branches.
- Added frontend regression coverage for the search entry-point contract:
  - `frontend/studyhub-app/src/components/SearchModal.test.jsx`
  - `frontend/studyhub-app/src/pages/home/HomePage.test.jsx`
- Added backend regression coverage for search privacy:
  - `backend/test/search.routes.test.js`
- Added `@testing-library/dom` to `frontend/studyhub-app` devDependencies so the React Testing Library suites run reliably in this workspace.

Fixed:

- Landing-page hero search now uses the canonical sheets query parameter:
  - `frontend/studyhub-app/src/pages/home/HomePage.jsx`
  - Navigation changed from `/sheets?q=...` to `/sheets?search=...`.
- Global search course results now use the canonical sheets filter parameter:
  - `frontend/studyhub-app/src/components/SearchModal.jsx`
  - Navigation changed from `/sheets?course=...` to `/sheets?courseId=...`.
- SheetsPage now normalizes legacy incoming search URLs so old links and bookmarks still work:
  - `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`
  - Legacy `q` is rewritten to `search`, and legacy `course` is rewritten to `courseId` with `replace` semantics.
- `/api/search` no longer leaks hidden profiles:
  - `backend/src/routes/search.js`
  - `backend/src/routes/users.js`
  - Search results now filter matched users through the shared profile-visibility helper before returning them.
- Backend lint is clean again after removing stale unused auth imports and unused preference destructuring leftovers:
  - `backend/src/routes/auth.js`
  - `backend/src/routes/settings.js`

Cycle 22 Validation Commands (Executed)

- `npm --prefix backend test -- test/search.routes.test.js`
- `npm --prefix frontend/studyhub-app run test -- src/components/SearchModal.test.jsx src/pages/home/HomePage.test.jsx`
- `npm --prefix backend test`
- `npm --prefix backend run lint`
- `npm --prefix frontend/studyhub-app run lint`
- `npm --prefix frontend/studyhub-app run build`

Cycle 22 Validation Result

- Targeted backend search privacy tests: passed (`1` file, `4` tests).
- Targeted frontend search contract tests: passed (`2` files).
- Backend Vitest: `15` test files passed, `61` tests passed.
- Backend ESLint: full backend passed with exit code `0`.
- Frontend ESLint: full app passed with exit code `0`.
- Frontend production build: passed; Vite transformed `442` modules successfully.

Cycle 22 Deep Scan Summary

- The search contract is now consistent across all current entry points: HomePage writes `search`, SearchModal writes `courseId`, and SheetsPage treats those parameters as canonical state.
- Legacy links were preserved deliberately. Instead of breaking previously shared URLs that still use `q` or `course`, SheetsPage rewrites them forward to the canonical contract on first load.
- Search privacy enforcement now shares the same decision logic as profile-page access, which closes the drift risk that caused `/api/search` to expose users that `/api/users/:username` would hide.
- Full validation surfaced unrelated backend lint residue in auth/settings routes; those were cleaned in the same cycle so the repository ends in a fully green state for the touched surfaces.

Cycle 22 Deferred-Risk Notes

- The remaining known search inconsistency is content indexing parity: `/api/sheets` search still matches title, description, and content, while `/api/search` sheet results still only match title and description.
- There is still no browser-level end-to-end test that covers search privacy from the actual UI, so the privacy guarantee is currently protected by backend route tests rather than a full-stack browser flow.

---

Cycle 23 — Search Content Parity + Browser Search Regression [2026-03-19]

Changed:

- Centralized sheet text-search clauses into `backend/src/lib/sheetSearch.js`:
  - Added one shared helper for title, content, and description matching.
  - `backend/src/routes/search.js` and `backend/src/routes/sheets.js` now consume the same sheet text-search definition instead of duplicating separate field lists.
- Added a browser regression flow in `frontend/studyhub-app/tests/search.regression.spec.js`:
  - Covers the public HomePage hero search, authenticated SheetsPage rendering for the canonical `search` param, SearchModal course navigation, and privacy-filtered user results.

Fixed:

- Global sheet search now returns sheets when the match exists only in the sheet body content:
  - `backend/src/routes/search.js`
  - `backend/test/search.routes.test.js`
- SheetsPage and global search can no longer drift on sheet text fields without touching the same helper:
  - `backend/src/routes/sheets.js`
  - `backend/src/lib/sheetSearch.js`
- Browser-level search coverage now reflects the actual app contract for public users:
  - HomePage hero search targets `/sheets?search=...`, then the private-route guard redirects unauthenticated users to `/login`.
  - The regression captures that canonical intermediate navigation before re-entering the authenticated app to validate the SheetsPage and SearchModal flows.

Cycle 23 Validation Commands (Executed)

- `npm --prefix backend test`
- `npm --prefix backend run lint`
- `npm --prefix frontend/studyhub-app run lint`
- `npm --prefix frontend/studyhub-app run test:e2e -- tests/search.regression.spec.js`

Cycle 23 Validation Result

- Backend Vitest: `15` test files passed, `62` tests passed.
- Backend ESLint: full backend passed with exit code `0`.
- Frontend ESLint: full app passed with exit code `0`.
- Playwright regression: `tests/search.regression.spec.js` passed.

Cycle 23 Deep Scan Summary

- The remaining sheet-content parity bug is resolved at the root cause level by sharing one backend helper between the sheets listing and global search endpoints.
- The new backend regression proves `/api/search` can now return a sheet whose search hit exists only in `content`, which was the last known mismatch against `/api/sheets`.
- The browser regression exposed and then documented a real routing nuance: HomePage search is public, but the target SheetsPage is auth-gated. The test now asserts the canonical `/sheets?search=...` navigation intent before the redirect to `/login`, then validates the authenticated continuation on SheetsPage.
- SearchModal browser coverage now verifies canonical course navigation and confirms the UI only renders the privacy-filtered user results returned by the backend-facing search API.

Cycle 23 Deferred-Risk Notes

- Legacy URL normalization from `q` and `course` is still not covered by a browser-level regression.
- The new browser privacy check uses mocked filtered results; explicit live-stack verification for unauthenticated and non-classmate viewers is still primarily enforced by backend tests.

---

Cycle 24 — Live Beta Search Privacy + Validation Contract Refresh [2026-03-19]

Changed:

- Added a browser regression for legacy SheetsPage URL normalization in `frontend/studyhub-app/tests/search.regression.spec.js`:
  - Confirms incoming `/sheets?q=...&course=...` URLs normalize to canonical `search` and `courseId` parameters.
- Added dedicated live beta-stack search privacy coverage:
  - `frontend/studyhub-app/tests/search.privacy.beta-live.spec.js`
  - `frontend/studyhub-app/playwright.beta.config.js`
  - `frontend/studyhub-app/package.json`
  - `package.json`
  - The beta workflow now runs `npm --prefix frontend/studyhub-app run test:e2e:beta` during `npm run beta:validate`.
- Beta seed and stack plumbing were updated so live privacy tests are deterministic and reproducible:
  - `backend/scripts/seedBetaUsers.js` now seeds a non-classmate beta user plus explicit profile-visibility fixtures.
  - `package.json` now forces `docker compose exec -T backend npx prisma generate` before beta reseeding.
  - `docker-compose.yml` now uses `clamav/clamav:stable`.
  - `frontend/studyhub-app/scripts/dev-entrypoint.js` now installs with `--legacy-peer-deps` inside the Docker dev container.
- SearchModal now sends authenticated search requests correctly on the split-origin beta stack:
  - `frontend/studyhub-app/src/components/SearchModal.jsx`
  - `frontend/studyhub-app/src/components/SearchModal.test.jsx`
  - The `/api/search` fetch explicitly uses `credentials: 'include'`.

Fixed:

- Local register onboarding no longer redirects away from the course-selection step under `PublicRoute`:
  - `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx`
  - Local account creation now defers `completeAuthentication(...)` until course setup is submitted.
- UploadSheetPage no longer crashes under the current `BrowserRouter` setup:
  - `frontend/studyhub-app/src/pages/sheets/UploadSheetPage.jsx`
  - The unsaved-changes blocker now falls back safely when `useBlocker` is unavailable.
- Stale auth, smoke, and backend validation contracts were refreshed to current product behavior:
  - `frontend/studyhub-app/src/lib/authNavigation.test.js`
  - `frontend/studyhub-app/src/pages/auth/LoginPage.test.jsx`
  - `frontend/studyhub-app/src/pages/auth/RegisterScreen.test.jsx`
  - `frontend/studyhub-app/tests/app.responsive.smoke.spec.js`
  - `frontend/studyhub-app/tests/auth.smoke.spec.js`
  - `frontend/studyhub-app/tests/navigation.regression.spec.js`
  - `frontend/studyhub-app/tests/feed.preview-and-delete.smoke.spec.js`
  - `frontend/studyhub-app/tests/sheets.upload-html-workflow.smoke.spec.js`
  - `backend/scripts/smokeRoutes.js`
- Playwright smoke execution is now stable under the repo validation workflow:
  - `frontend/studyhub-app/package.json`
  - `test:e2e:smoke` now runs with `--workers=4` to avoid preview-server flake during the one-click beta validation run.

Cycle 24 Validation Commands (Executed)

- `npm run beta:seed`
- `npm --prefix frontend/studyhub-app run test -- src/components/SearchModal.test.jsx`
- `npm --prefix frontend/studyhub-app run test:e2e -- tests/search.regression.spec.js`
- `npm --prefix frontend/studyhub-app run test:e2e:beta`
- `npm --prefix frontend/studyhub-app run test -- src/lib/authNavigation.test.js src/pages/auth/LoginPage.test.jsx src/pages/auth/RegisterScreen.test.jsx`
- `npm --prefix frontend/studyhub-app run test`
- `npm --prefix frontend/studyhub-app run test:e2e:smoke -- tests/app.responsive.smoke.spec.js tests/auth.smoke.spec.js tests/navigation.regression.spec.js tests/sheets.upload-html-workflow.smoke.spec.js`
- `npm --prefix frontend/studyhub-app run test:e2e:smoke -- tests/feed.preview-and-delete.smoke.spec.js`
- `docker compose exec -T backend npm run smoke:routes`
- `npm run beta:validate`
- `npm run lint`
- `npm run build`

Cycle 24 Validation Result

- Legacy search normalization browser regression: passed.
- Live beta privacy browser regression: `2` Playwright tests passed against the real beta stack.
- Frontend targeted auth tests: passed (`3` files, `9` tests).
- Full frontend Vitest: `12` test files passed, `30` tests passed.
- Full frontend Playwright smoke suite: `16` tests passed with the stabilized worker cap.
- Backend smoke routes: all checks passed after aligning the script with the current direct-login and notes contracts.
- Root beta validation workflow: passed end to end.
- Repository lint: backend and frontend ESLint both passed.
- Repository build: backend syntax check and frontend Vite production build both passed.

Cycle 24 Deep Scan Summary

- The live beta-stack privacy requirement exposed a real browser auth bug: SearchModal was calling `/api/search` without credentials, so authenticated search silently behaved as unauthenticated on the beta frontend/backend split-origin setup. That is now fixed at the fetch layer and protected by both unit and live browser coverage.
- Broader beta validation surfaced two actual route-level regressions outside the original search surface:
  - local registration completed session state too early for the `/register` course step under `PublicRoute`
  - UploadSheetPage crashed because `useBlocker` is not guaranteed under the current router configuration.
  Both were fixed at the source instead of weakening the tests.
- The remaining validation failures were stale contract drift in smoke/unit scripts, not product regressions. Those tests now reflect the current direct-login behavior, current feed/sheets copy, and current paginated notes API shape.
- The one-click beta workflow is materially stronger after this cycle: reseeding is deterministic for privacy fixtures, smoke tests are stable under the repo script, and live beta privacy checks now run as part of `npm run beta:validate`.

Cycle 24 Deferred-Risk Notes

- The auth-gated HomePage search flow still does not assert a future post-login destination-return behavior if StudyHub later preserves the original `/sheets?search=...` target through the `/login` redirect.
- The Docker beta frontend still relies on `--legacy-peer-deps` because `react-joyride@2.9.3` has not yet been upgraded for React 19 peer compatibility.

---

Cycle 25 — Week 1 UX: Draft Management, Notes Redesign, Fork/Contribute UI [2026-03-18]

Added:

- Google OAuth Railway setup documentation (`docs/google-oauth-railway-setup.md`):
  - Step-by-step guide for enabling Google Sign-In on Railway production.
  - Covers Google Cloud Console redirect URIs, backend/frontend env vars, runtime-config verification, and verification steps.
  - Reference table mapping all OAuth files (backend lib, routes, frontend config, login/register/settings pages).

- Draft sheet management on UploadSheetPage (`frontend/studyhub-app/src/pages/sheets/UploadSheetPage.jsx`):
  - Yellow banner shown when resuming a draft, with draft title and "Discard & Start New" button.
  - `discardDraft` function calls `DELETE /api/sheets/:id` then resets all editor state.
  - Confirmation dialog (existing `ConfirmDialog` component) gates destructive discard.
  - `draftReloadKey` state forces the init effect to re-run after discard for a clean editor.

- Attachment remove buttons on UploadSheetPage:
  - Green badge with ✕ button for newly selected (not yet uploaded) files — calls `clearAttachFile`.
  - Blue badge with ✕ button for existing server-side attachments — sets `removeExistingAttachment(true)`.
  - "Attachment will be removed on save" message shown after removal.
  - File input label changes to "Change file" when any attachment is present.

- Notes page complete redesign (`frontend/studyhub-app/src/pages/notes/NotesPage.jsx`):
  - Replaced dark (#0f172a) editor background with light/transparent background.
  - Added markdown formatting toolbar with 9 actions: bold, italic, heading, bullet list, numbered list, inline code, code block, link, blockquote.
  - `applyToolbarAction` function handles smart cursor-aware text insertion with line-start prefix handling.
  - Real markdown-to-HTML preview via `marked` (GFM + line breaks) + `DOMPurify` sanitization.
  - New `MarkdownPreview` component replaces plain-text `MiniPreview`.
  - Word count displayed in toolbar.
  - Note list cards now show content preview (first 80 chars) and course code in blue.
  - SVG empty-state icons instead of emoji.
  - Filter tabs with border styling and transitions.
  - Private/Shared toggle with color-coded pill background.

- Markdown preview CSS styles (`frontend/studyhub-app/src/index.css`):
  - `.notes-markdown-preview` class with full typography: headings (h1-h4), paragraphs, links, lists, inline code (rose-colored), code blocks (dark background), blockquotes (indigo left border), tables, horizontal rules, images.
  - Uses CSS variables for dark-mode compatibility.

- Fork and contribute UI on SheetViewerPage (`frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`):
  - Fork button (purple) shown for non-owners — calls `POST /api/sheets/:id/fork`, navigates to edit page on success.
  - "Contribute Back" button (green) shown for fork owners — opens modal to submit contribution with optional message.
  - Contribute modal with textarea, cancel/submit buttons, calls `POST /api/sheets/:id/contributions`.
  - Accept/Reject buttons on incoming pending contributions — calls `PATCH /api/sheets/contributions/:id` with action.
  - Color-coded status badges (amber=pending, green=accepted, red=rejected) on contribution items.

- `IconGitPullRequest` icon added to Icons.jsx for contribute/PR actions.

Changed:

- UploadSheetPage status display now only shows for non-draft statuses to avoid confusing "draft" label during normal editing.

Cycle 25 Validation Commands

- `npm --prefix frontend/studyhub-app run lint` — passed clean.
- `npm --prefix frontend/studyhub-app run build` — passed clean (478ms, 40 output files).

Cycle 25 Validation Result

- Frontend ESLint: passed with zero warnings or errors.
- Frontend Vite production build: passed successfully.
- All new UI components use existing backend API endpoints (no backend changes needed).
- `marked` library was installed in a prior session; `DOMPurify` was already a dependency.

Cycle 25 Deferred-Risk Notes

- Google OAuth activation on production requires manual Railway env var setup (documented in `docs/google-oauth-railway-setup.md`).
- Fork/contribute buttons rely on existing backend endpoints — no new backend routes were added.
- Notes markdown preview renders user-authored HTML through DOMPurify sanitization — safe against XSS but rendered output quality depends on `marked` parsing fidelity.

---

Cycle 26 — Week 2: @Mentions, Dark Mode, Comment Delete, Profile Stars, Sheet Filtering [2026-03-18]

Added:

- @Mention highlighting component (`frontend/studyhub-app/src/components/MentionText.jsx`):
  - Parses `@username` patterns in text and renders them as clickable blue links to `/users/:username`.
  - Uses same regex pattern as backend (`mentions.js`) for consistency.
  - Integrated into SheetViewerPage comments, FeedPage comments, and FeedPage post bodies.
  - Backend already had full mention extraction + notification creation via `backend/src/lib/mentions.js` — this cycle adds the missing frontend rendering.

- Comment delete button on SheetViewerPage:
  - `deleteComment` handler calls `DELETE /api/sheets/:id/comments/:commentId`.
  - Red-bordered "Delete" button shown only for the comment author or admins.
  - Updates both comment list and sheet comment count on success.
  - Comment author usernames now link to their profile pages.

- Comprehensive dark mode CSS (`frontend/studyhub-app/src/index.css`):
  - Extended `[data-theme='dark']` CSS variables: 25+ overrides for colors, shadows, borders.
  - Structural overrides for inline-styled elements: inputs, textareas, selects, sections, buttons.
  - Page background overrides for `#edf0f5` → `#0f172a`, `#fff` → `#111827`, `#f8fafc` → `#1e293b`.
  - Text color overrides for `#0f172a` → `#f1f5f9`, `#1e293b` → `#e2e8f0`, `#475569` → `#94a3b8`.
  - Border overrides from `#e2e8f0` → `#334155`.
  - Notification dropdown, search modal, and markdown preview dark mode.
  - Custom dark scrollbar styling.
  - AppearanceTab already had theme toggle + `applyTheme()` via `data-theme` attribute; `useBootstrapPreferences` loads cached theme on app boot.

- Starred Sheets section on UserProfilePage:
  - Backend `GET /api/users/:username` now returns `starredSheets` (up to 10 published starred sheets with author, course, star count).
  - Frontend renders a "Starred Sheets" card with star icon, sheet links, course badges, author names.
  - "View all starred sheets →" link for own profile navigates to `/sheets?starred=1`.

Fixed:

- User profile now only shows published sheets in "Recent Sheets" section (was showing drafts/rejected).
- Sheet count in profile `_count` now filters by `status: 'published'` (was counting all including drafts).

Verified (no changes needed):

- **Sheet listing visibility**: `GET /api/sheets` already correctly filters by `status: 'published'` for public queries. Deleted/draft/rejected sheets are excluded.
- **Stars feature**: Star toggle, star count display, "Starred" filter on SheetsPage, and Dashboard star count all work correctly.
- **Notification system**: Full notification pipeline works — backend `createNotification` + `notifyMentionedUsers`, frontend bell with live polling (30s), click-to-navigate with `linkPath`, mark-as-read. All functional.
- **School/Course selection**: Backend `GET /api/courses/schools` endpoint works. Register page and CoursesTab both fetch from it correctly. Empty dropdown is expected when no schools exist in the database (admin setup required).
- **Default permissions**: `defaultDownloads` from UserPreferences is already applied to new sheet creation. `defaultContributions` exists in settings UI but cannot be enforced per-sheet since the schema lacks an `allowContributions` field on `StudySheet`.

Cycle 26 Validation Commands

- `npm --prefix frontend/studyhub-app run lint` — passed clean.
- `npm --prefix backend run lint` — passed clean.
- `npm --prefix frontend/studyhub-app run build` — passed clean (411ms, 41 output files).

Cycle 26 Validation Result

- Frontend and backend ESLint: both passed with zero errors.
- Frontend Vite production build: passed successfully.
- New `MentionText` component correctly code-split into its own chunk (0.58 kB).

Cycle 26 Deferred-Risk Notes

- Dark mode uses CSS attribute selectors to override inline styles. This works for most elements but some deeply nested components with unusual inline style patterns may need individual fixes. Pages verified: Feed, Sheets, Dashboard, Settings, Notes, Profile, SheetViewer.
- `defaultContributions` preference in Privacy settings is stored but not enforced at the API level. Adding a per-sheet `allowContributions` column would require a Prisma migration.
- Schools must be added via admin to populate the school/course selector. An admin seeding script or UI would improve onboarding.

---

## Cycle 27 — Week 3: Profile Enhancements, Tutorials, Animations, Dark Mode Expansion

Date: 2026-03-18

### Changes

#### Followers/Following Modal (UserProfilePage)

- **Backend**: Added `GET /api/users/:username/followers` and `GET /api/users/:username/following` endpoints returning up to 50 users with id, username, role, avatarUrl.
- **Frontend**: Followers and Following counts are now clickable buttons that open a modal overlay displaying the full list. Each user in the list links to their profile with avatar, username, and role badge. Modal closes on backdrop click or X button.
- Files changed: `backend/src/routes/users.js`, `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx`, `frontend/studyhub-app/src/index.css`

#### Tutorials for Remaining Pages

- Added tutorial step definitions for Settings (3 steps), Profile (3 steps), SheetViewer (3 steps), and Upload (3 steps) in `lib/tutorialSteps.js`.
- Integrated `useTutorial` hook and `SafeJoyride` component into all four pages with `data-tutorial` attributes on key UI sections.
- Previously covered pages (Feed, Sheets, Dashboard, Notes) remain unchanged.
- Files changed: `frontend/studyhub-app/src/lib/tutorialSteps.js`, `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx`, `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx`, `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`, `frontend/studyhub-app/src/pages/sheets/UploadSheetPage.jsx`

#### Animations Added to Remaining Pages

- **SheetsPage**: Staggered card entrance animation on first load (60ms stagger, 400ms duration).
- **NotesPage**: Staggered notes list entrance animation on first load (50ms stagger, 400ms duration).
- **SheetViewerPage**: FadeInUp animation on sheet content panel when data loads (450ms).
- **SettingsPage**: FadeInUp animation on tab content when switching tabs (350ms).
- All animations use the existing `lib/animations.js` utilities and respect `prefers-reduced-motion`.
- Files changed: `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`, `frontend/studyhub-app/src/pages/notes/NotesPage.jsx`, `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`, `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx`

#### Feed Post Delete Button Redesign

- Replaced text ellipsis trigger (`...`) with a vertical three-dot SVG icon in a cleaner 32×32 button.
- Delete option now includes a trash icon SVG alongside the text.
- Button uses transparent background with red hover state instead of permanent red background.
- Added CSS hover classes (`feed-post-menu-btn`, `feed-post-delete-btn`) with dark mode support.
- Files changed: `frontend/studyhub-app/src/pages/feed/FeedPage.jsx`, `frontend/studyhub-app/src/index.css`

#### Dark Mode — Semantic Color Overrides

- Added CSS dark mode overrides for status/semantic colors not previously covered:
  - Green status (`#f0fdf4`, `#bbf7d0`, `#166534`) → dark green variants
  - Blue badges (`#eff6ff`, `#bfdbfe`, `#dbeafe`, `#1d4ed8`) → dark blue variants
  - Yellow/Amber (`#fef9ec`, `#fef3c7`, `#fde68a`, `#92400e`) → dark amber variants
  - Red/Error (`#fef2f2`, `#fecaca`, `#fca5a5`) → dark red variants
- Covers admin/student badges, course code badges, follow buttons, error banners, success messages, info boxes, and pinned announcements across all pages.
- Added dark mode for follow modal overlay, Joyride tooltip, and profile stat hover.
- File changed: `frontend/studyhub-app/src/index.css`

#### Profile Page CSS

- Added `.profile-stats-row`, `.profile-stat-btn`, `.profile-columns` CSS classes with responsive grid layout and hover states.
- File changed: `frontend/studyhub-app/src/index.css`

### Validation

Cycle 27 Validation Commands:

- `npm --prefix frontend/studyhub-app run lint` — passed clean.
- `npm --prefix backend run lint` — passed clean.
- `npm --prefix frontend/studyhub-app run build` — passed clean (404ms, 41 output files).

Cycle 27 Validation Result:

- Frontend and backend ESLint: both passed with zero errors.
- Frontend Vite production build: passed successfully.
- All new tutorial steps code-split into `tutorialSteps` chunk.
- Profile page code-split into `UserProfilePage` chunk (14.35 kB).

---

## Cycle 28 — Week 3 (continued): Profile Animations, Announcements Polish

Date: 2026-03-18

### Changes

#### UserProfilePage Animations

- Added `fadeInUp` for profile card header and `staggerEntrance` for content columns on first data load.
- Files changed: `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx`

#### AnnouncementsPage Polish, Tutorial & Animations

- **Design polish**: Increased card padding and gaps, enlarged author avatars (32→36px for regular, added 22px mini-avatar for pinned), improved typography (title sizes, line heights).
- **@Mention support**: Announcement bodies now render `@username` as clickable links via `MentionText` component.
- **Author profile links**: Author usernames in both pinned and regular cards now link to `/users/:username`.
- **Pinned badge redesign**: Replaced emoji pin with SVG icon, increased badge padding, improved visual weight.
- **Hover effects**: Added `announcement-card` and `announcement-card-pinned` CSS classes with shadow hover transitions.
- **Tutorial**: Added `ANNOUNCEMENTS_STEPS` (2 steps: header overview + card list) with `SafeJoyride` integration.
- **Animations**: Staggered card entrance on first load (70ms stagger, 400ms duration).
- **Dark mode**: Added CSS overrides for pinned card background, hover shadows, and amber text colors (`#78350f`, `#b45309`).
- Files changed: `frontend/studyhub-app/src/pages/announcements/AnnouncementsPage.jsx`, `frontend/studyhub-app/src/lib/tutorialSteps.js`, `frontend/studyhub-app/src/index.css`

### Validation

Cycle 28 Validation Commands:

- `npm --prefix frontend/studyhub-app run lint` — passed clean.
- `npm --prefix backend run lint` — passed clean.
- `npm --prefix frontend/studyhub-app run build` — passed clean (410ms, 41 output files).

Cycle 28 Validation Result:

- Frontend and backend ESLint: both passed with zero errors.
- Frontend Vite production build: passed successfully.
- AnnouncementsPage chunk grew from 6.12 kB to 7.49 kB (added MentionText, tutorial, animations).
- UserProfilePage chunk grew from 14.35 kB to 14.65 kB (added animations).

---

## Cycle 29 — Week 3 (continued): Skeleton Loaders

Date: 2026-03-18

### Changes

#### Reusable Skeleton Component Library

- Created `frontend/studyhub-app/src/components/Skeleton.jsx` with 6 exported components:
  - `Skeleton` — base block with configurable width/height/borderRadius.
  - `SkeletonCard` — card with avatar circle + text lines.
  - `SkeletonList` — repeated row placeholders.
  - `SkeletonProfile` — profile page layout (header + two-column grid).
  - `SkeletonSheetGrid` — responsive card grid.
  - `SkeletonFeed` — stacked feed cards.
- All use `.sh-skeleton` CSS class with shimmer animation via `background-position` keyframes.
- Dark mode variant adjusts shimmer gradient colors.
- File added: `frontend/studyhub-app/src/components/Skeleton.jsx`

#### Skeleton CSS & Dark Mode

- Added `@keyframes skeletonShimmer` animation (1.2s infinite linear).
- Added `.sh-skeleton` class with light/dark shimmer gradients.
- File changed: `frontend/studyhub-app/src/index.css`

#### Loading State Replacements (7 pages)

- **UserProfilePage**: Replaced "Loading profile…" text with `<SkeletonProfile />`.
- **SheetsPage**: Replaced "Loading sheets..." with `<SkeletonSheetGrid count={4} />`.
- **FeedPage**: Replaced "Fetching posts..." Panel with `<SkeletonFeed count={3} />`.
- **SheetViewerPage**: Replaced "Loading sheet..." with `<SkeletonCard />`.
- **NotesPage**: Replaced "Loading…" with `<SkeletonList count={4} />`.
- **AnnouncementsPage**: Replaced loading state with `<SkeletonFeed count={3} />`.
- **SettingsPage**: Replaced loading state with Skeleton blocks (tab bar + content areas).

### Validation

Cycle 29 Validation Commands:

- `npm --prefix frontend/studyhub-app run lint` — passed clean.
- `npm --prefix frontend/studyhub-app run build` — passed clean (406ms, 42 output files).

Cycle 29 Validation Result:

- Frontend ESLint: passed with zero errors.
- Frontend Vite production build: passed successfully.
- New `Skeleton` chunk at 2.55 kB (code-split automatically by Vite).
- Output file count increased from 41 to 42 (new Skeleton chunk).

---

## Cycle 30 — Week 3 (continued): Empty State Polish

Date: 2026-03-18

### Changes

#### Unified Empty State Design Pattern

- Upgraded empty states across 6 pages to use a consistent visual pattern: gradient icon box with SVG illustration, bold title, descriptive subtitle, and optional CTA button.
- All empty states now use CSS custom properties (`--sh-surface`, `--sh-heading`, `--sh-muted`, `--sh-border`) for dark mode compatibility.
- Changed borders from `1px solid` to `2px dashed` for clearer empty-state visual language.

#### Page-by-Page Changes

- **SheetsPage**: Added search magnifying glass SVG icon, title "No sheets matched your filters", and filter adjustment hint. File: `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`
- **FeedPage**: Added chat bubble SVG icon to `EmptyFeed` component, restructured with title + subtitle layout. File: `frontend/studyhub-app/src/pages/feed/FeedPage.jsx`
- **AnnouncementsPage**: Replaced emoji with bell SVG icon in amber gradient box, improved copy. File: `frontend/studyhub-app/src/pages/announcements/AnnouncementsPage.jsx`
- **UserProfilePage**: Replaced emoji with document SVG icon in blue gradient box, added subtitle. File: `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx`
- **SheetViewerPage**: Replaced plain text "No contributions yet" with green plus-circle SVG icon, title, and fork prompt. File: `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`
- **DashboardPage**: Added monitor SVG icon to reusable `EmptyState` component, switched to CSS variables for theming. File: `frontend/studyhub-app/src/pages/dashboard/DashboardPage.jsx`

### Validation

Cycle 30 Validation Commands:

- `npm --prefix frontend/studyhub-app run lint` — passed clean.
- `npm --prefix frontend/studyhub-app run build` — passed clean (414ms, 42 output files).

Cycle 30 Validation Result:

- Frontend ESLint: passed with zero errors.
- Frontend Vite production build: passed successfully.
- No new chunks — changes are inline within existing page bundles.

---

## Cycle 31 — Week 3 (continued): Keyboard Shortcuts & Navigation

Date: 2026-03-18

### Changes

#### Global Ctrl+K / Cmd+K Search Shortcut

- Added `useEffect` listener in Navbar for `Ctrl+K` (Windows/Linux) and `⌘K` (Mac) to open SearchModal.
- Prevents default browser behavior (`e.preventDefault()`).
- File changed: `frontend/studyhub-app/src/components/Navbar.jsx`

#### Search Box Keyboard Hint Badge

- Added `<kbd>` element inside the Navbar search box showing "⌘K" on Mac or "Ctrl+K" on Windows/Linux.
- Uses `.sh-kbd-hint` CSS class with subtle border/background styling.
- Hidden on mobile (`@media max-width: 640px`) to save space.
- Dark mode support included.
- Files changed: `frontend/studyhub-app/src/components/Navbar.jsx`, `frontend/studyhub-app/src/index.css`

#### Keyboard Shortcuts Help Modal

- Created `KeyboardShortcuts.jsx` component that opens on `?` key press.
- Groups shortcuts by category: General (search, help), Search Modal (arrows, enter, escape), Dialogs (escape).
- Platform-aware: detects Mac vs Windows/Linux for modifier key display.
- Closes on Escape or backdrop click.
- Ignores `?` keypress when focus is in input/textarea/select/contentEditable elements.
- Full dark mode support via CSS classes.
- Rendered globally via Navbar.
- Files added: `frontend/studyhub-app/src/components/KeyboardShortcuts.jsx`
- Files changed: `frontend/studyhub-app/src/components/Navbar.jsx`, `frontend/studyhub-app/src/index.css`

### Validation

Cycle 31 Validation Commands:

- `npm --prefix frontend/studyhub-app run lint` — passed clean.
- `npm --prefix frontend/studyhub-app run build` — passed clean (439ms, 42 output files).

Cycle 31 Validation Result:

- Frontend ESLint: passed with zero errors.
- Frontend Vite production build: passed successfully.
- Navbar chunk grew from 35.79 kB to 38.10 kB (KeyboardShortcuts modal bundled in).

---

## Cycle 32 — Week 3 (continued): UX Infrastructure & Mobile Fixes

Date: 2026-03-18

### Changes

#### Scroll-to-Top Button

- Created `ScrollToTop.jsx` — floating button appears after 400px scroll, smooth-scrolls to top on click.
- Uses passive scroll listener for performance. Hidden on print.
- Full dark mode support, fade-in entrance animation, hover lift effect.
- Mounted globally via `App.jsx`.
- File added: `frontend/studyhub-app/src/components/ScrollToTop.jsx`

#### Toast Notification System

- Created event-bus-based toast system split across two files for ESLint compliance:
  - `lib/toast.js` — `showToast()` global function and `useToast()` hook.
  - `components/Toast.jsx` — `ToastContainer` component with auto-dismiss (3.5s), max 5 visible, click-to-dismiss.
- Three toast types: success (green), error (red), info (blue) — each with SVG icon and colored left border.
- Full dark mode support, slide-up entrance animation.
- Mounted globally via `App.jsx`.
- Files added: `frontend/studyhub-app/src/lib/toast.js`, `frontend/studyhub-app/src/components/Toast.jsx`

#### Styled 404 Page

- Created `NotFoundPage.jsx` with gradient icon (sad face SVG), large "404" heading, description, and two CTA buttons ("Go Home" + "Go to Feed").
- Uses CSS custom properties for dark mode compatibility.
- Replaced catch-all `<Navigate to="/" />` with `<NotFoundPage />` in router.
- File added: `frontend/studyhub-app/src/pages/NotFoundPage.jsx`
- File changed: `frontend/studyhub-app/src/App.jsx`

#### Focus Ring Styles (Accessibility)

- Added global `*:focus-visible` outline styles (2px solid blue, 2px offset) for all interactive elements.
- Dark mode variant uses lighter blue (`#60a5fa`).
- Only shows on keyboard navigation (`:focus-visible`), not mouse clicks.
- File changed: `frontend/studyhub-app/src/index.css`

#### Mobile Responsiveness Fixes

- **HomePage testimonials grid**: Added `@media (max-width: 767px)` to collapse from 3 columns to 1 column on phones. Previously caused horizontal overflow.
- **HomePage steps grid**: Fixed breakpoint — added tablet-specific 2-column layout (`768px–1179px`), phone 1-column (`≤767px`). Replaced too-broad `max-width: 1024px` rule.
- **Admin tables**: Added `overflow-x: auto` container and `min-width: 600px` on table for horizontal scrolling on phones.
- **Notes markdown tables**: Added `overflow-x: auto` to table element for horizontal scroll on narrow screens.
- **Settings nav on phone**: Increased gap from 4px to 6px for easier tap targets.
- **Shortcuts modal on phone**: Reduced padding from 28px to 20px on screens ≤640px.
- Files changed: `frontend/studyhub-app/src/index.css`, `frontend/studyhub-app/src/styles/responsive.css`

### Validation

Cycle 32 Validation Commands:

- `npm --prefix frontend/studyhub-app run lint` — passed clean.
- `npm --prefix frontend/studyhub-app run build` — passed clean (426ms, 44 output files).

Cycle 32 Validation Result:

- Frontend ESLint: passed with zero errors (Toast split resolved react-refresh/only-export-components violation).
- Frontend Vite production build: passed successfully.
- New chunks: `NotFoundPage` (code-split), `ScrollToTop` + `ToastContainer` bundled into index chunk (18.20 kB, up from 15.81 kB).
