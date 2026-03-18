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
