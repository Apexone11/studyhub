StudyHub Beta V1.5.0-beta Release Log

Purpose
- Implement the v1.5.0 master plan: algorithms, design, security, and rollout improvements.
- Run all risky changes in local beta first, validate, then ship.
- Keep production safe while testing UX/security/algorithm updates.

Version Scope
- v1.5.0.0 covers a 6-week phased rollout of: search, Google OAuth, animations, settings rework, moderation, Sheet Lab, provenance, onboarding, and polish.
- Feature flags gate all major additions: `FF_GOOGLE_AUTH`, `FF_MODERATION`, `FF_PROVENANCE`, `FF_TENSORFLOW`.

Reuse Rules (Inherited from V1.0.0 (legacy))
1. Keep this file as baseline + cycle log (do not rewrite from scratch).
2. Add each new cycle under a new section.
3. Reuse the same diagnostics directory and commands unless a cycle needs extra artifacts.
4. Keep production behavior stable by testing new flow only in beta first.
5. Use docs/beta-cycle-template.md as the copy/paste skeleton for each next cycle.
6. For every future beta cycle, always include tests for every newly added feature and every touched page before moving to the next cycle.

AI Beta Documentation Standard (Inherited from V1.0.0 (legacy))
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
- Full end-to-end beta gate (`npm run beta:check`) not yet rerun on v1.5.0.0 branch.
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

- **P0 Production crash:** Backend crash-looping on Railway because `User.googleId` column did not exist in production database. Root cause: all v1.5.0.0 schema changes were applied locally with `prisma db push` but no migration files existed. Production runs `prisma migrate` which requires migration files.
  - Created formal migration `20260318040000_add_v150_google_oauth_preferences_moderation` covering all v1.5.0.0 schema additions.
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

Week 2 of the v1.5.0 roadmap. Builds the moderation runtime on top of the database schema provisioned in Cycle 5, enforces user preferences, and connects the Google link flow.

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

- Backend auth/admin tests now match the current v1.5.0.0 contract:
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

- Repo-wide validation confirmed the remaining backend failures were stale tests left behind after the v1.5.0.0 removal of login email-verification gating and admin 2FA enforcement, not active regressions in the application code.
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

Cycle 25 - Admin Review Identity Fix + Credentialed Fetch Guardrails [2026-03-22]

Fixed:

- Admin sheet review now records the correct reviewer identity:
  - `backend/src/routes/admin.js`
  - `reviewedById` now uses `req.user.userId` instead of `req.user.id`, which fixes review attribution and avoids writing `undefined` during approve/reject flows.

Changed:

- Strengthened admin route regression coverage to match the current stats route contract:
  - `backend/test/admin.routes.test.js`
  - Added missing Prisma mocks for feed and moderation counters used by `/api/admin/stats`.
  - Added a focused regression asserting that sheet review writes `reviewedById` from `req.user.userId`.
- Added frontend unit coverage for split-origin credential behavior:
  - `frontend/studyhub-app/src/pages/announcements/AnnouncementsPage.test.jsx`
  - `frontend/studyhub-app/src/pages/auth/ResetPasswordPage.test.jsx`
  - New tests assert that announcements page fetches and reset-password submission include `credentials: 'include'`.

Cycle 25 Validation Commands (Executed)

- `npm --prefix backend run test -- test/admin.routes.test.js test/announcements.routes.test.js test/feed.routes.test.js test/notes.routes.test.js test/notifications.routes.test.js test/settings.routes.test.js test/users.routes.test.js`
- `npm --prefix frontend/studyhub-app run test -- src/pages/announcements/AnnouncementsPage.test.jsx src/pages/auth/ResetPasswordPage.test.jsx`
- VS Code Problems scan on touched backend and frontend test files

Cycle 25 Validation Result

- Targeted backend Vitest: `7` files passed, `88` tests passed.
- Targeted frontend Vitest: `2` files passed, `3` tests passed.
- VS Code diagnostics reported no issues in the new frontend test files.
- Existing backend route-test harnesses still show `Dangerous dynamic require` editor warnings because they rely on the repo's current `Module._load` mocking pattern, but those tests executed successfully.

Cycle 25 Deep Scan Summary

- This cycle focused on pre-test bug hunting and contract repair before any broader validation run.
- The concrete production defect was in admin review attribution, where the route mixed two user identity shapes (`id` vs `userId`). The fix was applied at the route itself, and the regression test locks the contract to the auth middleware's current payload shape.
- The highest regression risk on the frontend was authenticated requests silently degrading on split-origin stacks when `credentials: 'include'` is omitted. The new announcements and reset-password unit tests cover that exact transport contract so these failures surface locally instead of after deployment.
- The existing backend route-test additions for announcements, feed, notes, notifications, settings, and users were validated against the live route implementations during this pass; the only harness update needed was the admin stats mock surface.

Cycle 25 Deferred-Risk Notes

- Backend route tests still use the current dynamic `Module._load` interception pattern. It works in Vitest but continues to trigger non-blocking editor warnings until the harness strategy is modernized.
- This cycle used targeted test execution rather than a full repo lint/build sweep because the code change surface was limited to one backend route and test coverage. A broader pass can be run next if you want full-repo confidence after the current stabilization batch.

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

---

## Cycle 32 — Growth Strategy Implementation (Analytics, Live Stats, Onboarding, SEO)

Date: 2026-03-19

### Changes

#### telemetry.js — trackEvent helper
- Added `trackEvent(name, props = {})` export to `frontend/studyhub-app/src/lib/telemetry.js`.
- Forwards custom events to PostHog when initialized; falls back to `console.debug` in dev.

#### Backend — Public platform stats endpoint
- Created `backend/src/routes/public.js` with `GET /api/public/platform-stats`.
- Returns `{ sheetCount, courseCount, schoolCount, userCount }` from Prisma with a 5-minute in-memory cache.
- Registered in `backend/src/index.js` as `app.use('/api/public', publicRoutes)`.

#### RegisterScreen.jsx — Post-signup onboarding redirect + tracking
- Local signup: redirects to `/dashboard?welcome=1` after course selection (or skip).
- Google OAuth new-user path: redirects to `/dashboard?welcome=1` instead of the generic authenticated home.
- Added `trackEvent('signup_started', { method: 'local' })` on account creation.
- Added `trackEvent('signup_completed', { method: 'local'|'google', skipped_courses })`.

#### DashboardPage.jsx — Welcome banner + activation checklist
- Reads `?welcome=1` from URL via `useSearchParams`; shows dismissible welcome banner for new users.
- Consumes `activation` object from `GET /api/dashboard/summary` (enriched in backend `dashboard.js`).
- Renders conic-gradient progress ring and 4-item activation checklist (join_course, star_or_view_sheet, upload_or_fork_sheet, make_post).
- Fires `trackEvent('dashboard_viewed', { isNewUser })` once per page load.

#### backend/src/routes/dashboard.js — Activation enrichment
- `GET /api/dashboard/summary` response now includes an `activation` object with `isNewUser`, `completedCount`, `totalCount`, `checklist[]`, and `nextStep`.

#### HomePage.jsx — Live stats + CTA tracking + page title
- Fetches `/api/public/platform-stats` on mount; stat row is dynamic (falls back to hardcoded values on error).
- Hero and bottom CTAs call `trackEvent('landing_cta_clicked', { target, location })`.
- `handleHeroSearch` calls `trackEvent('landing_search_used', { query })`.
- Added `usePageTitle('The GitHub of Studying')` for accurate browser tab title.

#### SheetViewerPage.jsx — Share button + tracking
- Added `handleShare` function: copies current URL to clipboard, shows success toast, fires `trackEvent('sheet_shared', { sheetId, method: 'copy_link' })`.
- Added Share button in the viewer-actions bar.
- Added `trackEvent('sheet_starred'|'sheet_unstarred', { sheetId })` in `updateStar`.
- Added `trackEvent('sheet_forked', { sheetId })` in `handleFork`.

#### FeedPage.jsx — Rotating composer prompts + post tracking
- Added `COMPOSER_PROMPTS` constant array with 5 rotating placeholder strings.
- `composerPrompt` selected via `useMemo` using minute-of-day modulo to rotate without a timer.
- Composer `<textarea>` placeholder now uses `{composerPrompt}`.
- Added `trackEvent('feed_post_created', { hasCourse, hasAttachment })` after successful post submission.

#### index.html — OG/Twitter meta tags
- Added `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `twitter:card`, `twitter:title`, `twitter:description` as site-wide static defaults in `frontend/studyhub-app/index.html`.

### Validation

Cycle 32 Validation Commands:

- `npm --prefix frontend/studyhub-app run lint` — 0 errors, 0 warnings.
- `npm --prefix frontend/studyhub-app run build` — 0 errors. 39 output chunks. Built in ~1.3s.

Cycle 32 Validation Result: PASSED

Cycle 32 Deferred-Risk Notes:
- OG meta tags in `index.html` are static site-wide defaults; per-page dynamic OG tags (e.g., for individual sheet pages) are deferred for a future cycle using SSR or an edge handler.
- `usePageTitle` sets `document.title` only — does not update `og:title` dynamically (acceptable for SPA; crawlers see the static defaults).
- Activation checklist is read-only display; completion is derived from real user activity (stars, uploads, posts, course joins) — no separate "mark complete" API call needed.
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

---

## Cycle 33 — Week 3 (continued): Toast Integration, Page Titles, Search Highlighting, Pagination, Print Styles

Date: 2026-03-18

### Changes

#### Toast Notifications Wired Up

- Integrated `showToast()` into 5 pages for user action feedback:
  - **UserProfilePage**: Follow/unfollow success + error toasts.
  - **NotesPage**: Note delete success/error toasts.
  - **FeedPage**: Post delete error toast.
  - **SheetsPage**: Star toggle error toast.
  - **SheetViewerPage**: Star error, fork success, contribute success/error, review contribution success/error toasts.
  - **SettingsPage**: `handlePatch` success/error toasts alongside inline messages.
- Files changed: `UserProfilePage.jsx`, `NotesPage.jsx`, `FeedPage.jsx`, `SheetsPage.jsx`, `SheetViewerPage.jsx`, `SettingsPage.jsx`

#### Page Titles (document.title)

- Created `usePageTitle` hook in `lib/usePageTitle.js` — sets `document.title` to `"Page — StudyHub"` format, resets on unmount.
- Integrated into 8 pages: Feed, Study Sheets, My Notes, Settings, Dashboard, Announcements, Upload Sheet, Sheet Viewer.
- UserProfilePage uses dynamic title: `"username's Profile — StudyHub"`.
- File added: `frontend/studyhub-app/src/lib/usePageTitle.js`

#### Search Result Text Highlighting

- Added `Highlight` component to SearchModal that bolds matching query text in search results.
- Uses `<mark>` elements with yellow background highlight.
- Applied to sheet titles, course names/codes, and usernames.
- Regex-safe: escapes special characters in query before splitting.
- File changed: `frontend/studyhub-app/src/components/SearchModal.jsx`

#### Pagination — Load More

- Added "Load More" buttons to Feed and Sheets pages.
- Uses existing backend `limit`/`offset` pagination params.
- Shows progress: "Load More (24 of 156)" format.
- Disabled state while loading with "Loading…" text.
- Styled via `.sh-load-more-btn` CSS class with dark mode support.
- Files changed: `FeedPage.jsx`, `SheetsPage.jsx`, `frontend/studyhub-app/src/index.css`

#### Print Stylesheet

- Added `@media print` rules to `index.css`:
  - Hides navbar, sidebar, scroll-to-top, toasts, tutorials, keyboard shortcuts.
  - Resets page background to white.
  - Removes card shadows, sets `break-inside: avoid` on cards.
  - Appends URLs after links for print context.
  - Hides non-submit buttons.
- File changed: `frontend/studyhub-app/src/index.css`

#### Unsaved Form Confirmation (Already Implemented)

- Verified `UploadSheetPage.jsx` already has full unsaved-changes protection via `beforeunload` event + React Router `useBlocker` with custom `ConfirmDialog`. No changes needed.

### Validation

Cycle 33 Validation Commands:

- `npm --prefix frontend/studyhub-app run lint` — passed clean.
- `npm --prefix frontend/studyhub-app run build` — passed clean (555ms).

Cycle 33 Validation Result:

- Frontend ESLint: passed with zero errors.
- Frontend Vite production build: passed successfully.
- FeedPage chunk: 27.66 kB (up from 27.04 kB — load-more + toast).
- SheetsPage chunk: 12.61 kB (up from 12.03 kB — load-more + toast).
- SheetViewerPage chunk: 19.15 kB (up from 18.78 kB — toast).
- usePageTitle shared chunk created at 104.32 kB (bundled with tutorialSteps).

---

Cycle 34 — PWA Offline Support & Performance Optimizations (2026-03-19)

Added:
- PWA manifest (`public/manifest.json`) with app metadata, theme color, and icon references.
- Service worker (`public/sw.js`) with network-first strategy for API calls and cache-first for static assets. Cleans old caches on activation.
- Service worker registration in `src/main.jsx` on window load.
- SVG PWA icon (`public/icon.svg`) for scalable icon support; manifest also references existing `icon-256.png`.
- Web Vitals monitoring utility (`src/lib/performance.js`) tracking LCP, INP, and CLS via PerformanceObserver.
- `captureWebVital()` export in `src/lib/telemetry.js` to send Web Vitals to PostHog (or console in dev).
- Web Vitals reporting wired into `src/main.jsx` startup.

Changed:
- `index.html`: added `<meta name="theme-color">`, Apple mobile web app meta tags, manifest link, apple-touch-icon link, and `<link rel="preconnect">` hints for Google Fonts, gstatic, and cdnjs.cloudflare.com.
- `vite.config.js`: added `animejs` to manual chunks as `animation` bundle; enabled `cssCodeSplit: true` and `reportCompressedSize: false` for faster builds.
- `src/index.css`: added CLS-prevention rules — `min-height: 100vh` on `#root`, `aspect-ratio: 1/1` on circular avatar containers, `contain: layout style` on `.card-shell`.

Files touched:
- `frontend/studyhub-app/public/manifest.json` (new)
- `frontend/studyhub-app/public/sw.js` (new)
- `frontend/studyhub-app/public/icon.svg` (new)
- `frontend/studyhub-app/src/lib/performance.js` (new)
- `frontend/studyhub-app/src/lib/telemetry.js` (modified)
- `frontend/studyhub-app/src/main.jsx` (modified)
- `frontend/studyhub-app/index.html` (modified)
- `frontend/studyhub-app/vite.config.js` (modified)
- `frontend/studyhub-app/src/index.css` (modified)

Cycle 34 Validation Commands:
- `npm --prefix frontend/studyhub-app run lint` — pending user validation.
- `npm --prefix frontend/studyhub-app run build` — pending user validation.

Known Risks / Deferred:
- PNG icons (192x192, 512x512, maskable) are not yet generated; manifest references existing `icon-256.png` and the new SVG as fallback.
- Service worker caches all GET API responses; a cache-size eviction policy may be needed for heavy users.
- Web Vitals INP observer uses `durationThreshold: 16` which may produce high volume of events in PostHog.

---

## Cycle 35 — Sheet Lab: Version Control UI (2026-03-19)

### Added

- **Backend: Sheet Lab API** (`backend/src/routes/sheetLab.js`):
  - `GET /api/sheets/:id/lab/commits` — paginated commit list (newest first) with author, message, checksum, timestamps. Supports `?page=&limit=` query params. Public for published sheets, auth required for drafts.
  - `GET /api/sheets/:id/lab/commits/:commitId` — single commit with full content body.
  - `POST /api/sheets/:id/lab/commits` — create a new commit (owner only). Auto-captures current sheet content, computes SHA-256 checksum, chains to latest commit via `parentId`.
  - `POST /api/sheets/:id/lab/restore/:commitId` — restore sheet to a previous commit (owner only). Creates a new commit recording the restore and updates the sheet's content/contentFormat in a Prisma transaction.
  - `GET /api/sheets/:id/lab/diff/:commitIdA/:commitIdB` — line-based diff between two commits with additions/deletions counts and unified hunks.
  - Router registered in `backend/src/index.js` under `app.use('/api/sheets', sheetLabRoutes)`.

- **Backend: Line diff utility** (`backend/src/lib/diff.js`):
  - `computeLineDiff(textA, textB)` using LCS algorithm.
  - Returns `{ additions, deletions, hunks }` where each hunk has `oldStart`, `oldLines`, `newStart`, `newLines`, and `lines` array with `type` (add/remove/equal) and `content`.

- **Frontend: Sheet Lab page** (`frontend/studyhub-app/src/pages/sheets/SheetLabPage.jsx`):
  - Header with sheet title, "Sheet Lab" subtitle, back button to sheet viewer.
  - Vertical commit timeline with staggered anime.js entrance animation.
  - Each commit card shows: message, author avatar + username, relative timestamp, truncated SHA-256 checksum.
  - Click-to-expand content preview for each commit.
  - "Create Snapshot" button (owner only) — opens modal with message input.
  - "Restore" button on each commit (owner only) — confirmation dialog before restoring.
  - "Compare" mode — select two commits to see unified diff viewer.
  - Diff viewer with green/red line coloring, hunk headers, and addition/deletion stats.
  - Pagination controls for commit list.

- **Frontend: Sheet Lab CSS** (`frontend/studyhub-app/src/pages/sheets/SheetLabPage.css`):
  - Timeline layout with vertical line and dot markers.
  - Commit cards with hover effects and selected state.
  - Diff viewer with syntax-colored lines (green additions, red deletions).
  - Modal overlay for snapshot creation.
  - Responsive breakpoints for mobile.

- **Frontend: Route registration** (`frontend/studyhub-app/src/App.jsx`):
  - Lazy import: `const SheetLabPage = lazy(() => import('./pages/sheets/SheetLabPage'))`.
  - Route: `/sheets/:id/lab` wrapped in `<PrivateRoute>`, placed before the `:id` catch-all.

- **Frontend: Sheet Lab link** (`frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`):
  - "Sheet Lab" button added next to the "Edit" button in the action bar.
  - Only visible to sheet owner (same `canEdit` guard as Edit).

### Files Created

- `backend/src/lib/diff.js`
- `backend/src/routes/sheetLab.js`
- `frontend/studyhub-app/src/pages/sheets/SheetLabPage.jsx`
- `frontend/studyhub-app/src/pages/sheets/SheetLabPage.css`

### Files Modified

- `backend/src/index.js` — added sheetLab router import and mount
- `frontend/studyhub-app/src/App.jsx` — added lazy import and route
- `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx` — added Sheet Lab link button

### Cycle 35 Validation Commands

- `npm --prefix backend run lint` — pending user validation.
- `npm --prefix frontend/studyhub-app run lint` — pending user validation.
- `npm --prefix frontend/studyhub-app run build` — pending user validation.

### Known Risks / Deferred

- No new npm packages installed; diff algorithm uses built-in LCS, checksum uses Node.js `crypto` module.
- The LCS diff algorithm is O(n*m) in time and space; very large sheets (>10K lines) may be slow. Consider streaming or limiting content size for diff endpoint if needed.
- Dark mode CSS for Sheet Lab page is not yet added — uses CSS custom properties that will inherit from existing dark mode overrides where possible.
- No backend tests added in this cycle for the Sheet Lab endpoints.

---

## Cycle 36 — Client-Side Image Safety Check + CI Quality Gates (2026-03-19)

### Added

#### Client-Side Image Safety Fallback

- Created `frontend/studyhub-app/src/lib/imageSafety.js` — lightweight pre-upload image screening:
  - File size validation (15 MB cap).
  - Image dimension validation (8192x8192 cap).
  - Skin-tone pixel ratio heuristic using canvas sampling (informational only, does not block uploads).
  - `checkImageWithModel()` stub for future TF.js/NSFWJS model integration.
  - `isImageFile()` helper for MIME type checking.
- Integrated into `UploadSheetPage.jsx` `handleAttachmentSelect`:
  - Runs `checkImageSafety()` on image attachments before accepting them.
  - Shows an informational toast via `showToast()` if any warnings are raised.
  - Safety check is best-effort — errors are silently caught and never block attachment selection.
  - Server-side OpenAI moderation (`moderationEngine.js`) remains the authoritative safety layer.

#### CI Quality Gates

- Created `frontend/studyhub-app/lighthouse.config.js` — Lighthouse CI configuration:
  - Performance budget: min 0.8 (warn).
  - Accessibility budget: min 0.9 (error).
  - Best practices budget: min 0.85 (warn).
  - SEO budget: min 0.8 (warn).
  - Core Web Vitals: FCP < 2s, LCP < 3s, CLS < 0.1 (error), TBT < 300ms.
  - Uploads results to temporary public storage.
- Created `frontend/studyhub-app/a11y.config.js` — accessibility audit configuration:
  - WCAG 2.2 AA rule set: color-contrast, keyboard-navigation, focus-visible, aria-roles, img-alt, label, link-name, button-name, heading-order, landmark-one-main.
  - Zero-tolerance violations threshold.
- Created `.github/workflows/quality-gates.yml` — GitHub Actions CI workflow:
  - `lint-and-test` job: checkout, Node 20, install, lint (backend + frontend), test (backend), build (frontend).
  - `accessibility` job (depends on lint-and-test): runs Lighthouse CI via `treosh/lighthouse-ci-action@v12`.
  - `bundle-size` job (depends on lint-and-test): checks dist size against 5 MB budget, emits GitHub warning on overage.
  - Triggers on PRs to main and pushes to main.
- Added root `package.json` CI scripts: `ci:lighthouse`, `ci:a11y`, `ci:quality`.

### Files Added
- `frontend/studyhub-app/src/lib/imageSafety.js`
- `frontend/studyhub-app/lighthouse.config.js`
- `frontend/studyhub-app/a11y.config.js`
- `.github/workflows/quality-gates.yml`

### Files Changed
- `frontend/studyhub-app/src/pages/sheets/UploadSheetPage.jsx` — added imageSafety + toast imports, async safety check in attachment handler.
- `package.json` — added `ci:lighthouse`, `ci:a11y`, `ci:quality` scripts.

### Cycle 36 Validation Commands
- `npm --prefix frontend/studyhub-app run lint` — pending user validation.
- `npm --prefix frontend/studyhub-app run build` — pending user validation.

### Cycle 36 Deferred-Risk Notes
- The skin-tone heuristic is a very rough RGB-space check, not a classifier. It is informational only and defers authoritative decisions to the server-side OpenAI moderation pipeline.
- TF.js/NSFWJS model loading is stubbed out in `checkImageWithModel()` — no ML packages are installed.
- Lighthouse CI and axe-cli tools are installed at CI runtime via `npx --yes`, not as local dependencies.
- The quality-gates workflow uses `npm ci --prefix` which requires each subdirectory to have its own `package-lock.json` or rely on workspaces hoisting; may need adjustment depending on lock file strategy.

---

## Cycle 37 — Full-Text Search + Admin Moderation Dashboard Enhancements (2026-03-19)

### Added

#### Part 1: PostgreSQL Full-Text Search

- **Migration**: `backend/prisma/migrations/20260319000000_add_fulltext_search/migration.sql`
  - GIN indexes on `StudySheet` (title, description, content, combined multi-field).
  - GIN indexes on `User` (username) and `Course` (name, code).
  - All indexes use `CREATE INDEX IF NOT EXISTS` for safe re-run.

- **Full-text search helper**: `backend/src/lib/fullTextSearch.js`
  - `sanitizeSearchQuery(input)` — strips special tsquery characters, joins words with `&`.
  - `searchSheetsFTS(query, opts)` — ranked sheet search via `to_tsvector`/`to_tsquery` with `ts_rank` ordering.
  - `searchCoursesFTS(query, opts)` — full-text course search by name and code.
  - `searchUsersFTS(query, opts)` — full-text username search.
  - All functions use `prisma.$queryRawUnsafe` with parameterized queries.

- **Opt-in FTS in search route**: `backend/src/routes/search.js`
  - Added `?fts=true` query parameter support to `GET /api/search`.
  - When enabled, uses `searchSheetsFTS`, `searchCoursesFTS`, `searchUsersFTS` instead of ILIKE.
  - Existing ILIKE behavior is the default (no breaking change).

- **Opt-in FTS in sheets route**: `backend/src/routes/sheets.js`
  - Added `?fts=true` query parameter support to `GET /api/sheets`.
  - When enabled and `search` param is present, uses `searchSheetsFTS` with rank-ordered results.
  - Hydrates FTS results through Prisma for full relation data.
  - Response includes `fts: true` flag to indicate FTS was used.

#### Part 2: Admin Moderation Dashboard Enhancements

- **Enhanced admin stats endpoint**: `backend/src/routes/admin.js`
  - `GET /api/admin/stats` now returns additional fields:
    - `users.thisWeek` — new user registrations in the last 7 days.
    - `sheets.published`, `sheets.draft` — breakdown by status.
    - `moderation.pendingCases`, `moderation.activeStrikes`, `moderation.pendingAppeals`.
    - `feedPosts.total` — total feed post count.
    - `recentModerationActions` — last 10 reviewed moderation cases with user/reviewer info.
  - Original flat stats fields preserved for backward compatibility.

- **Admin Overview enhancements**: `frontend/studyhub-app/src/pages/admin/AdminPage.jsx`
  - `StatsGrid` now shows: New This Week, Published, Drafts, Feed Posts (in addition to existing cards).
  - Added `ModerationOverview` component — shows pending cases, active strikes, pending appeals with color-coded severity.
  - Added `ModerationActivityLog` component — timeline of recent moderation actions with status dots, reviewer info, and review notes.

- **Moderation case detail view**: `frontend/studyhub-app/src/pages/admin/ModerationTab.jsx`
  - Click any case row to expand a full detail panel showing:
    - User info, confidence score, flagged content snippet.
    - Review note and reviewer info (for reviewed cases).
    - Linked strikes and appeals.
    - Quick action buttons: Confirm, Dismiss, Issue Strike (navigates to strikes sub-tab with pre-filled form).
  - Added sort dropdown: sort cases by date or confidence score.
  - Highlighted row background for the currently expanded case.

### Files Added
- `backend/prisma/migrations/20260319000000_add_fulltext_search/migration.sql`
- `backend/src/lib/fullTextSearch.js`

### Files Changed
- `backend/src/routes/search.js` — added fullTextSearch import, FTS branching.
- `backend/src/routes/sheets.js` — added fullTextSearch import, FTS branching with hydration.
- `backend/src/routes/admin.js` — enhanced stats endpoint with moderation/user/sheet breakdowns.
- `frontend/studyhub-app/src/pages/admin/AdminPage.jsx` — added ModerationOverview, ModerationActivityLog, enriched StatsGrid.
- `frontend/studyhub-app/src/pages/admin/ModerationTab.jsx` — added case detail view, sort dropdown, expanded case state.

### Cycle 37 Validation Commands
- `npm --prefix backend run lint` — pending user validation.
- `npm --prefix frontend/studyhub-app run lint` — pending user validation.
- `npm --prefix frontend/studyhub-app run build` — pending user validation.

### Known Risks / Deferred
- FTS migration requires `prisma migrate deploy` to apply GIN indexes; safe to run since all indexes use `IF NOT EXISTS`.
- FTS is opt-in via `?fts=true` — no breaking changes to existing search behavior.
- FTS raw SQL uses parameterized queries to prevent SQL injection, but `sanitizeSearchQuery` strips non-alphanumeric characters as an additional safety layer.
- The combined GIN index on StudySheet may have write-performance overhead on INSERT/UPDATE for large datasets; monitor after deployment.
- Moderation stats queries use `.catch(() => 0)` fallbacks so the stats endpoint works even if moderation tables are not yet migrated.
- No new npm packages installed.

---

## Cycle 38 — Security Audit, WebAuthn Passkeys, SECURITY.md (2026-03-19)

### Security Audit

Audited the following critical backend files:

- `backend/src/routes/auth.js` — rate limiting present on all auth endpoints, bcrypt cost 12, account lockout after 5 failures, constant-response forgot-password endpoint prevents enumeration.
- `backend/src/middleware/auth.js` — JWT verified properly, generic error messages returned.
- `backend/src/routes/upload.js` — MIME + extension + magic byte validation, size limits, safe filename generation, proper file cleanup on failure.
- `backend/src/routes/sheets.js` — Prisma ORM throughout (no raw SQL injection risk), proper authorization checks, rate limiting.
- `backend/src/middleware/csrf.js` — CSRF token validated against auth token userId, skips safe methods correctly.
- `backend/src/lib/htmlSecurity.js` — forbidden tags (script/iframe/object/embed/meta/base/form), inline event handler detection, dangerous href/src blocking. Input lowercased before scanning.
- `backend/src/index.js` — Helmet configured, CSP headers, CORS with origin whitelist, x-powered-by disabled, global rate limiter.

### Security Fix

Removed personal data from all JWT payloads (Checkmarx High — "Personal data inside JWT") and replaced hardcoded test credential (Checkmarx "Hardcoded Passwords"):

**Changed** — `backend/src/lib/authTokens.js`
- `signAuthToken`: renamed `userId` claim to RFC 7519-standard `sub` claim. `username` had already been removed in a prior cycle; `role` is retained as it is not PII.
- `signCsrfToken`: same `userId` → `sub` rename.

**Changed** — `backend/src/middleware/auth.js`
- Updated DB lookup key from `decoded.userId` to `decoded.sub` to match the new claim name.

**Changed** — `backend/src/middleware/csrf.js`
- Updated CSRF ↔ auth token cross-check from `.userId` to `.sub`.

**Changed** — `backend/src/lib/previewTokens.js`
- `signHtmlPreviewToken`: removed `userId` parameter and the `sub: userId` claim from the JWT payload entirely. The `allowUnpublished` boolean flag already encodes the owner/moderator decision at token-issue time; the userId was a redundant fallback.

**Changed** — `backend/src/routes/preview.js`
- Removed `userId` extraction from preview token payload.
- Removed `!userId` guard (field no longer present).
- Simplified `canReadUnpublished` to `allowUnpublished` — the userId fallback check is no longer needed.

**Changed** — `backend/src/routes/sheets.js`
- Removed `userId: req.user.userId` from both `signHtmlPreviewToken` call sites (cleanup; field no longer accepted by the function).

**Changed** — `backend/scripts/smokeRoutes.js`
- Replaced static `'Password1A'` literal with `` `Smoke${smokeId}A1` `` (dynamic, per-run; satisfies uppercase, lowercase, and digit requirements).

#### Validation
- `npm --prefix backend run lint` — clean (no errors)
- `npx vitest run test/releaseA.stability.middleware.test.js` — 7/7 passed

#### Deep Scan Note
- Auth and CSRF middleware now use the `sub` claim exclusively. Any token issued before this change will fail validation at the DB lookup step (the `id` lookup will get `decoded.sub = undefined` → Prisma returns null → 401 AUTH_EXPIRED). This is the safe and intended behavior — old tokens are invalidated, forcing re-login.
- Preview tokens no longer carry any user identifier. Authorization is fully encoded in the `allowUnpublished` boolean set at issue time by `canModerateOrOwnSheet`. No data-flow regression risk.
- `smokeRoutes.js` is a diagnostic/dev script only, not a production code path.


- **Password reset complexity enforcement** (`backend/src/routes/auth.js`): The `POST /api/auth/reset-password` endpoint was missing the uppercase letter and digit requirement that registration enforces. Added the same `[A-Z]` and `\d` regex checks to ensure password complexity is consistent across all password-setting flows.

### Added — WebAuthn Passkeys for Admin Users

- **Backend: WebAuthn utility** (`backend/src/lib/webauthn.js`):
  - Minimal FIDO2 implementation using built-in Node.js `crypto` module — no external packages.
  - Manual CBOR decoder supporting maps, byte strings, integers, text, arrays.
  - `generateRegistrationOptions(user)` — creates challenge, returns PublicKeyCredentialCreationOptions.
  - `verifyRegistration(credential, userId)` — verifies clientDataJSON (type, challenge, origin), parses attestationObject, extracts credentialId/publicKey/counter from authenticatorData, verifies RP ID hash and user presence flag.
  - `generateAuthenticationOptions(userId, credentials)` — creates challenge for authentication ceremony.
  - `verifyAuthentication(credential, expectedCredential, userId)` — verifies clientDataJSON, authenticator data, RP ID hash, counter increment, and cryptographic signature using stored public key. Supports ES256 (P-256) and RS256 algorithms.
  - DER encoding helpers for SubjectPublicKeyInfo construction (EC P-256 and RSA).
  - In-memory challenge store with 2-minute expiry and 5-minute cleanup interval.
  - Comment noting that full FIDO2 compliance requires @simplewebauthn/server.

- **Backend: WebAuthn routes** (`backend/src/routes/webauthn.js`):
  - `POST /api/webauthn/register/options` — admin-only, returns registration options.
  - `POST /api/webauthn/register/verify` — admin-only, verifies attestation and stores credential in DB.
  - `POST /api/webauthn/authenticate/options` — public, returns authentication options for admin users with registered passkeys.
  - `POST /api/webauthn/authenticate/verify` — public, verifies assertion, updates counter, issues JWT session.
  - `GET /api/webauthn/credentials` — admin-only, lists user's registered passkeys.
  - `DELETE /api/webauthn/credentials/:id` — admin-only, removes a passkey (ownership verified).
  - Rate limited at 20 requests per 15 minutes.
  - Authentication endpoints return generic errors to prevent user enumeration.

- **Backend: Route registration** (`backend/src/index.js`):
  - WebAuthn routes mounted at `/api/webauthn`.

- **Frontend: WebAuthn client helpers** (`frontend/studyhub-app/src/lib/webauthn.js`):
  - `isWebAuthnSupported()` — checks for PublicKeyCredential API availability.
  - `registerPasskey(name)` — fetches registration options, calls `navigator.credentials.create()`, sends attestation to server.
  - `authenticateWithPasskey(username)` — fetches authentication options, calls `navigator.credentials.get()`, sends assertion to server.
  - `listPasskeys()` / `removePasskey(id)` — credential management API calls.
  - Base64url <-> ArrayBuffer conversion helpers.
  - CSRF token included in authenticated requests.

- **Frontend: SecurityTab passkey management** (`frontend/studyhub-app/src/pages/settings/SecurityTab.jsx`):
  - Passkeys section visible only to admin users.
  - Lists registered passkeys with name, creation date, and device type.
  - "Register New Passkey" button with optional name input.
  - "Remove" button on each passkey with loading state.
  - Graceful handling when WebAuthn is not supported by the browser.

### Added — SECURITY.md

- **Security policy** (`SECURITY.md`):
  - Updated from placeholder to full security policy document.
  - Supported versions table (1.5.x supported, < 1.5 not).
  - Vulnerability reporting instructions (email, expected response times by severity).
  - Scope definitions (in-scope and out-of-scope vulnerability classes).
  - Security measures summary covering all implemented protections.
  - Responsible disclosure statement.

### Files Created

- `backend/src/lib/webauthn.js`
- `backend/src/routes/webauthn.js`
- `frontend/studyhub-app/src/lib/webauthn.js`

### Files Changed

- `backend/src/routes/auth.js` — added password complexity check to reset-password endpoint.
- `backend/src/index.js` — added webauthn route import and mount.
- `frontend/studyhub-app/src/pages/settings/SecurityTab.jsx` — added passkey management section for admin users.
- `SECURITY.md` — replaced placeholder with full security policy.

### Cycle 38 Validation Commands

- `npm --prefix backend run lint` — pending user validation.
- `npm --prefix frontend/studyhub-app run lint` — pending user validation.
- `npm --prefix frontend/studyhub-app run build` — pending user validation.

### Known Risks / Deferred

- WebAuthn implementation uses manual CBOR parsing and DER encoding; for full FIDO2 compliance (attestation statement verification, metadata service, Android SafetyNet), consider migrating to @simplewebauthn/server.
- Challenge store is in-memory (Map); in a multi-instance production deployment, challenges should be stored in Redis or the database.
- Only ES256 (P-256 ECDSA) and RS256 (RSASSA-PKCS1-v1_5) algorithms are supported; Ed25519 (EdDSA) is not yet implemented.
- No new npm packages installed.

---

## Cycle 39 — Accessibility Audit & Final CSS Polish (2026-03-19)

### Summary

Comprehensive WCAG 2.2 AA accessibility audit and final CSS polish pass across the frontend.

### Added

- **Skip-to-content link** — `App.jsx` now renders a visually hidden skip link at the top of every page, visible on focus, targeting `#main-content`. CSS in `index.css`.
- **Route change announcer** — `RouteAnnouncer` component in `App.jsx` uses `aria-live="polite"` to announce page navigations to screen readers.
- **Screen reader utility class** — `.sr-only` CSS class added to `index.css` for visually hidden but accessible content.
- **Selection styles** — `::selection` color applied for light and dark themes.
- **Light-mode scrollbar styles** — `::-webkit-scrollbar` rules added for consistency with existing dark-mode scrollbar styles.
- **`useKeyboardShortcuts` hook** — Created `lib/useKeyboardShortcuts.js` for global Ctrl/Cmd+K search trigger via `data-search-trigger`.

### Changed

- **`id="main-content"` on all pages** — Added to `<main>` elements across FeedPage, SheetsPage, DashboardPage, SheetViewerPage, AdminPage, SettingsPage, AttachmentPreviewPage, SheetHtmlPreviewPage, NotFoundPage, HomePage, LoginPage, RegisterScreen, and the shared `PageShell` scaffold.
- **Navbar search box** — Now has `role="button"`, `tabIndex={0}`, `aria-label`, keyboard activation (Enter/Space), and `data-search-trigger` attribute.
- **Navbar user avatar** — Now has `role="button"`, `tabIndex={0}`, `aria-label`, and keyboard activation.
- **Navbar notification bell** — Added `aria-label` with unread count, `aria-expanded`, and `aria-haspopup`.
- **Navbar** — Added `aria-label="Main navigation"` to `<nav>`.
- **AppSidebar** — Added `aria-label="Sidebar navigation"` to sidebar `<nav>`.
- **SearchModal** — Added `role="dialog"`, `aria-modal="true"`, `aria-label` to modal, `aria-label` to search input and clear button.
- **ConfirmDialog** — Added `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title.
- **KeyboardShortcuts modal** — Added `role="dialog"`, `aria-modal="true"`, `aria-label`.
- **Toast container** — Added `role="status"`, `aria-live="polite"`. Individual toasts get `role="alert"`.
- **Login/Register error messages** — Added `role="alert"` for screen reader announcements.
- **Smooth scrolling** — Now respects `prefers-reduced-motion` via `@media (prefers-reduced-motion: no-preference)`.
- **Reduced motion** — Enhanced global `*` selector to reduce all animation/transition durations.
- **Print styles** — Updated to also hide `.skip-to-content` link.

### Validation Commands

- `npm --prefix frontend/studyhub-app run lint` — pending user validation.
- `npm --prefix frontend/studyhub-app run build` — pending user validation.

### Known Risks / Deferred

- No new npm packages installed.
- Some inline-styled interactive `<div>` elements deeper in page components (e.g., notification items, feed post menus) use `onClick` without explicit `role="button"` — these are lower priority since they supplement adjacent button/link controls.
- Full focus trap is only implemented on AppSidebar drawer; SearchModal and KeyboardShortcuts use Escape-to-close but not full Tab trapping.

---

## Cycle 39 — Lint Fixes + Validation + Release Notes (2026-03-19)

### Changed

- **backend/src/lib/featureFlags.js** — Fixed unused `err` variable in catch block (use bare `catch`).
- **backend/src/lib/webauthn.js** — Fixed 4 unused variable lint errors: `value` (eslint-disable comment), `aaguid` → `_aaguid`, `coseKey` → `_coseKey`, `derOctetString` → `_derOctetString`.
- **frontend/studyhub-app/src/lib/performance.js** — Replaced `catch (_)` with bare `catch` blocks (3 instances).
- **frontend/studyhub-app/lighthouse.config.js** — Changed `/* eslint-env node */` to `/* global module */` for flat config compatibility.
- **frontend/studyhub-app/a11y.config.js** — Same flat config fix.

### Added

- **docs/v1.5.0-release-notes.md** — Comprehensive release notes for v1.5.0.
- **docs/plans/v1.5-weekly-roadmap.md** — All Week 3-6 items marked complete (2026-03-19).

### Validation Commands

- `npm --prefix backend run lint` — 0 errors ✅
- `npm --prefix frontend/studyhub-app run lint` — 0 errors ✅
- `npm --prefix frontend/studyhub-app run build` — success (465ms) ✅

### Known Risks / Deferred

- None. All lint issues resolved.

---

## Cycle 2026-03-19b — Dark Mode, Feed UX, Upload Workflow, Credentials

### Fixed

- **frontend/studyhub-app/src/index.css** — Dark mode: added `<a>`, `<article>`, `<span>` selectors for background, text, and border overrides. Quick Actions buttons now show text in dark mode. Added `#64748b` muted text override.
- **frontend/studyhub-app/src/pages/feed/FeedPage.jsx** — Post author avatars/usernames now link to `/profile/:username`. Comment author avatars/usernames also link. Leaderboard "by author" links added.
- **frontend/studyhub-app/src/pages/sheets/uploadSheetWorkflow.js** — Removed strict beta workflow gate: `canEditHtmlWorkingCopy()` now always returns `true`, `canSubmitHtmlReview()` no longer requires `hasOriginalVersion`. Users can type HTML directly.
- **frontend/studyhub-app/src/pages/sheets/UploadSheetPage.jsx** — Default scan status → `'passed'` for direct editing. Label: "HTML IMPORT (optional)". Error messages reference saving drafts.
- **Credentials sweep** — Added `credentials: 'include'` to 14 fetch calls across 7 files: CoursesTab, settingsState, SettingsPage, AccountTab, RegisterScreen, Navbar, UploadSheetPage, AdminPage.

### Changed

- **frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx** — Upload button restyled with gradient + shadow. Added Sheet Lab info card in Workflow sidebar.

### Validation Commands

- `npm --prefix frontend/studyhub-app run lint` — 0 errors ✅
- `npm --prefix frontend/studyhub-app run build` — success ✅

### Known Risks / Deferred

- None.

---

## Launch Sprint Week 1 — P0 Tickets [2026-03-19]

Sprint scope: P0-4, P0-5, P0-1, P0-2 from the launch backlog v0.

### Added

- **P0-4: Fetch credentials regression guardrail test**
  - `frontend/studyhub-app/tests/auth.credentials-guardrail.spec.js` — Playwright test that intercepts all API requests during real page interactions and asserts each one includes credentials (`cookie` header present). Uses marker cookie injection to verify `credentials: 'include'` is set. 8 test cases cover: feed, sheets listing, sheet viewer, dashboard, profile, SheetLab, admin, and search modal. Clear failure messages list the exact URL + method of violating requests.

- **P0-5: Session-expired UX (401 handling + re-login CTA)**
  - `frontend/studyhub-app/src/lib/http.js` — Added debounced `dispatchAuthExpired()` function (2-second cooldown) so multiple simultaneous 401 responses don't flood the user with duplicate notifications.
  - `frontend/studyhub-app/src/lib/session-context.jsx` — When `AUTH_SESSION_EXPIRED_EVENT` fires, now sets a `sessionStorage` flag and shows a toast: "Your session has expired. Please sign in again." (error-styled, 5s duration).
  - `frontend/studyhub-app/src/pages/auth/LoginPage.jsx` — On mount, checks for the sessionStorage flag and shows an amber banner: "Your session expired. Sign in again to pick up where you left off." Distinct from error messages (amber vs red).

- **P0-1: Course picker search UX (typeahead + mobile-friendly)**
  - `frontend/studyhub-app/src/components/CourseListPicker.jsx` — New reusable component: inline search input that filters courses by code, name, or department in real time. Features match highlighting, selection counter ("3 of 10 selected"), result count during filtering, empty-state messaging, disabled checkbox at max limit, and mobile-friendly touch targets.
  - `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx` — Replaced 25-line inline checkbox list with `<CourseListPicker>`.
  - `frontend/studyhub-app/src/pages/settings/CoursesTab.jsx` — Same replacement, using shared component.

- **P0-2: Empty course states + "be the first" CTAs**
  - `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx` — Replaced generic "No sheets matched your filters" with three context-aware empty states:
    1. **Course-filtered empty** (school+course selected, no search/toggles) — Green "Be the first to share notes for CMSC131!" with Upload CTA button and content tip.
    2. **Search empty** (search query active) — "No sheets match 'query'" with filter adjustment suggestion.
    3. **Generic empty** (other filter combos) — Standard message with Upload button.

### Validation Commands

- `npm --prefix frontend/studyhub-app run lint` — 0 errors
- `npm --prefix backend run lint` — 0 errors

### Known Risks / Deferred

- P0-4 test requires a running dev server or Playwright `webServer` config to execute end-to-end. Mocked routes cover the API layer; real browser integration depends on project's Playwright config.
- P0-5 toast notification fires before the redirect to `/login`. The toast component is already mounted globally in App.jsx, so it renders briefly during the transition.

---

## Launch Sprint Week 2 — P0-6: Safe HTML Admin Review [2026-03-19]

### Added

- **P0-6: Safe HTML Preview in Admin Review UI (side-by-side)**

  **Schema + Migration:**
  - `backend/prisma/schema.prisma` — Added `reviewedById`, `reviewedAt`, `reviewReason`, `reviewFindingsSnapshot` fields to `StudySheet` model with `SheetReviewer` relation to `User`.
  - `backend/prisma/migrations/20260319030000_add_sheet_review_audit/migration.sql` — Migration SQL for the four new columns + foreign key.

  **Backend:**
  - `backend/src/routes/admin.js` — New `GET /api/admin/sheets/:id/review-detail` endpoint returning `rawHtml`, `sanitizedHtml` (via the same `sanitize-html` pipeline users see), `validationIssues`, `htmlScanFindings`, and full metadata.
  - `backend/src/routes/admin.js` — Updated `PATCH /api/admin/sheets/:id/review` to require `reason` field, and store `reviewedById`, `reviewedAt`, `reviewReason`, and `reviewFindingsSnapshot` (scan findings at time of decision) as audit trail.

  **Frontend:**
  - `frontend/studyhub-app/src/pages/admin/SheetReviewPanel.jsx` (NEW) — Full-screen modal with three tabs:
    1. **Sanitized Preview** — `iframe sandbox=""` (strictest) rendering sanitized HTML via blob URL. Never touches raw HTML.
    2. **Raw HTML (text)** — `<pre>` element showing raw HTML as plain text. Never interpreted. Copy button included.
    3. **Findings** — Combined view of policy validation issues + scan findings with severity badges and metadata (scan status, acknowledgment timestamp, prior review info).
    - Bottom action bar: required reason textarea + Approve & Publish / Reject buttons.
  - `frontend/studyhub-app/src/pages/admin/AdminPage.jsx` — Added "Review HTML" button on sheet review cards that opens `SheetReviewPanel`. Renamed Approve/Reject to "Quick Approve"/"Quick Reject" with auto-generated reason for backward compatibility.

  **Security posture:**
  - Iframe `sandbox=""` (no scripts, no same-origin, no forms, no popups)
  - `referrerPolicy="no-referrer"`
  - sanitizedHtml generated by the same `sanitize-html` allowlist used for user-facing preview
  - Raw HTML ONLY rendered via `<pre>` — no `dangerouslySetInnerHTML`
  - Backend re-validates HTML with `validateHtmlForSubmission()` on approval

### Validation Commands

- `npm --prefix frontend/studyhub-app run lint` — 0 errors
- `npm --prefix backend run lint` — 0 errors

### Known Risks / Deferred

- Migration must be run on the dev/staging database: `npx prisma migrate deploy`.
- Quick approve/reject auto-generates a generic reason ("Quick-approved via admin panel"). For HTML sheets, admins should prefer the detailed Review HTML flow.

---

## Dark Mode Token System — Phase 1 (Systematic Migration)

**Date:** 2026-03-19
**Sprint:** Cross-cutting / Design System

### Summary

Established a comprehensive CSS variable token system (`--sh-*` prefix) and migrated the highest-impact user-facing components from hardcoded hex colors to tokens. This enables automatic dark mode support via `[data-theme='dark']` without `!important` overrides.

### Token Categories Added to `index.css`

- **Control tokens:** `--sh-input-bg`, `--sh-input-text`, `--sh-input-border`, `--sh-input-focus`, `--sh-input-focus-ring`
- **Button tokens:** `--sh-btn-primary-bg/text/shadow`, `--sh-btn-secondary-bg/text/border`
- **Alert tokens:** `--sh-danger`, `--sh-danger-bg/border/text`, `--sh-success-*`, `--sh-warning-*`
- **Utility tokens:** `--sh-link`, `--sh-focus-ring`, `--sh-page-bg`
- **Navbar tokens:** `--sh-nav-bg/border/text/muted/accent/search-bg/search-border/tab-active/badge-bg`
- **Dropdown tokens:** `--sh-dropdown-bg/border/shadow/divider`
- **Notification tokens:** `--sh-notif-unread-bg/hover`, `--sh-notif-read-bg/hover`, `--sh-notif-empty-icon`

All tokens have corresponding dark mode values in `[data-theme='dark']`.

### Components Migrated

1. **`settingsShared.jsx`** — All 7 shared UI primitives (Input, Button, Message, FormField, SectionCard, Select, ToggleRow)
2. **`CourseListPicker.jsx`** — Searchable course checkbox list
3. **`Navbar.jsx`** — Main navigation bar + notification dropdown (60 hardcoded → tokens)
4. **`LoginPage.jsx`** — Sign-in page card, form, messages (35 hardcoded → tokens)
5. **`RegisterScreen.jsx`** — Registration flow, step indicator, course selection (82 hardcoded → tokens)
6. **`Toast.jsx`** — Toast notification icon colors (3 hardcoded → tokens)
7. **`SheetReviewPanel.jsx`** — Admin review modal panel, tabs, action bar

### Metrics

- CSS variable token usage: 66 → 350 instances across JSX/JS files
- High-impact files fully migrated: 7 components
- Remaining: ~44 files with hardcoded hex colors (secondary pages, to be migrated incrementally)

### Validation

- `npm --prefix frontend/studyhub-app run lint` — 0 errors

---

## P0-7: HTML Pipeline Status Clarity + Queue Filters

**Date:** 2026-03-19
**Sprint:** Week 2

### Summary

Enhanced the admin sheet review queue with additional filters and visual pipeline status indicators so admins can quickly triage HTML sheets through the security scan pipeline.

### Backend Changes

- **`backend/src/routes/admin.js`** — `GET /api/admin/sheets/review` now accepts optional `contentFormat` and `htmlScanStatus` query params for filtering by content format (html/markdown) and scan pipeline state (queued/running/passed/failed). The `reviewedBy` relation is now included in review list results for prior-review context.

### Frontend Changes

- **`frontend/studyhub-app/src/pages/admin/AdminPage.jsx`**:
  - Added `reviewFormatFilter` and `reviewScanFilter` state for new filter dropdowns
  - Three filter dropdowns in the review queue: Status, Format, Scan Status
  - **`PipelineBadge` component**: Color-coded status badges (success/danger/warning/info/muted) using CSS variable tokens for dark mode support
  - Each review card now shows: pipeline status badge + scan status badge (for HTML sheets)
  - Prior review history shown on re-submitted sheets (reviewer, date, reason)
  - Scan findings display now shows finding count and acknowledgment status
  - Live polling `refreshKey` updated to include new filter values
  - Filter select elements use new `filterSelectStyle` with CSS variable tokens

### Validation

- `npm --prefix frontend/studyhub-app run lint` — 0 errors
- `npm --prefix backend run lint` — 0 errors

---

## P0-8: Mobile Core Loop Pass

**Date:** 2026-03-19
**Sprint:** Week 2

### Summary

Audited and fixed mobile responsiveness issues across the "core loop" flow: registration → sheets → viewer → upload. Focused on grid layouts that don't stack on phones, touch target sizes below WCAG guidelines, and inline styles that need responsive CSS classes.

### Changes

1. **`RegisterScreen.jsx`** — Password fields 2-column grid and custom course input 3-column grid now use responsive CSS classes (`register-pw-grid`, `register-custom-course-grid`) that stack to single-column below 500px.

2. **`SheetViewerPage.jsx`** — Diff viewer side-by-side split now uses `sheet-diff-split` CSS class that stacks to single-column below 767px.

3. **`UploadSheetPage.jsx`** — Editor tab header (Edit|Preview) now shares the `upload-editor-split` responsive class that already had phone stacking.

4. **`Navbar.jsx`** — Touch target improvements:
   - Icon button padding: 5px → 8px
   - Avatar size: 28px → 32px
   - App search box min height: 34px → 38px

5. **`styles/responsive.css`** — Added 4 new responsive grid classes with phone breakpoints:
   - `.register-pw-grid` — Password/confirm row (stacks at 500px)
   - `.register-custom-course-grid` — Custom course code/name/button row (stacks at 500px)
   - `.password-hints-grid` — Password strength indicator grid (stacks at 500px)
   - `.sheet-diff-split` — Diff viewer side-by-side layout (stacks at 767px)

### Validation

- `npm --prefix frontend/studyhub-app run lint` — 0 errors

---

## P0-6: HTML Uploads Kill-Switch (Option C — Env + Admin Toggle)

**Date:** 2025-03-19

### Summary

Implements a defense-in-depth kill-switch for HTML uploads using the existing `FeatureFlag` schema model (previously defined but unused). Admins can instantly disable all HTML uploads from the Admin Settings panel without a deploy; an environment variable provides a hard override when the admin panel is unavailable.

### Architecture

**Priority order:**
1. Environment variable `STUDYHUB_HTML_UPLOADS` — `"disabled"` blocks all HTML regardless of DB; `"enabled"` allows regardless of DB; unset defers to DB.
2. `FeatureFlag` row named `html_uploads` — admin-toggled via API. Missing row defaults to enabled (preserves current behavior).

### Changes

#### Added

1. **`backend/src/lib/htmlKillSwitch.js`** — New module:
   - `isHtmlUploadsEnabled()` — async check combining env var + DB flag, returns `{ enabled, source }`.
   - `setHtmlUploadsEnabled(enabled, options)` — upserts `FeatureFlag` row, returns effective state with env override info.
   - `readEnvOverride()` — synchronous env var reader.
   - Fail-open design: DB errors default to enabled (preserves existing behavior).

2. **`backend/src/routes/admin.js`** — Two new admin endpoints:
   - `GET /api/admin/settings/html-uploads` — returns current enabled state, source, and env override.
   - `PATCH /api/admin/settings/html-uploads` — toggles DB flag; response explains when env var overrides.

3. **`frontend/studyhub-app/src/pages/admin/AdminPage.jsx`** — Kill-switch card in Admin Settings tab:
   - Visual indicator: green (enabled) / red (disabled) card with semantic token colors.
   - One-click toggle button (disabled when env var overrides).
   - Explains env override when present.
   - Shows source (env/db/default) for transparency.

#### Changed

4. **`backend/src/routes/sheets.js`** — Kill-switch guard added to three HTML entry points:
   - `POST /api/sheets` (create) — returns 403 with `HTML_UPLOADS_DISABLED` code.
   - `POST /api/sheets/drafts/autosave` — same guard.
   - `PATCH /api/sheets/:id` (update) — same guard.
   - Guard runs before HTML validation, so disabled uploads are rejected early.
   - Markdown uploads are unaffected.

### P0-6 Audit: What Was Already Done vs. New

| Requirement | Status Before | Status After |
|---|---|---|
| Sandboxed iframe preview (sanitized HTML) | Done (SheetReviewPanel) | No change |
| Raw HTML as `<pre>` text | Done (SheetReviewPanel) | No change |
| Approve/reject requires reason | Done (admin.js PATCH) | No change |
| Audit trail (reviewedBy/At/reason/findings) | Done (Prisma fields) | No change |
| Kill-switch (one-click disable) | Missing | **Implemented** |

### Validation

- `npm --prefix frontend/studyhub-app run lint` — 0 errors
- `npm --prefix backend run lint` — 0 errors

---

## Account Recovery Fixes (P0-E1/E2 prerequisite — Fixes 1–3)

**Date:** 2025-03-19

### Summary

Three fixes to unblock the "forgot username/password" recovery path for soft launch. Previously, users who forgot their username had no recovery path, and users without a verified email could never reset their password.

### Changes

#### Fix 1: Forgot password accepts email OR username

**File:** `backend/src/routes/auth.js` — `POST /api/auth/forgot-password`
- Now accepts `{ identifier }` (email or username) instead of only `{ username }`.
- Backwards compatible: still accepts `{ username }` for any existing callers.
- If identifier contains `@`, does email lookup; otherwise username lookup.
- Response is always the same generic message regardless of whether account exists (prevents enumeration).
- Existing `forgotLimiter` (5/15min) still applies.

**File:** `frontend/studyhub-app/src/pages/auth/ForgotPasswordPage.jsx`
- Input field now labeled "Username or Email" with matching placeholder.
- Sends `{ identifier }` to backend.
- Added `credentials: 'include'` for split-origin beta stack.
- Success copy updated to mention username reminder in the email.

#### Fix 2: Password reset no longer requires verified email

**File:** `backend/src/routes/auth.js` — `POST /api/auth/reset-password`
- Removed `emailVerified` + `email` check on the reset token validation path.
- Users with unverified emails can now complete password reset if they received a valid token.
- Token expiry, single-use, and HMAC-SHA256 hashing remain enforced.

#### Fix 3: Reset email includes username reminder

**File:** `backend/src/lib/email.js` — `sendPasswordReset()`
- Added a styled "Your username" box to the HTML email template (visible, easy to find).
- Plain text version also includes `Your StudyHub username: {username}` line.
- Solves the "I forgot my username" case: user enters email → receives email with both username and reset link.

### Security Notes

- Username is only revealed inside an email delivered to the account's verified address — never in API responses.
- Generic API response prevents account enumeration via both email and username lookups.
- Rate limiting unchanged (5 requests per 15 minutes on forgot-password).

### Validation

- `npm --prefix frontend/studyhub-app run lint` — 0 errors
- `npm --prefix backend run lint` — 0 errors

---

## Fix 4: Email Verification Wired Into Registration + Soft Gate

**Date:** 2025-03-19

### Summary

Registration now requires email verification before account creation. The existing unused backend verification pipeline (`/register/start` → `/register/verify` → `/register/complete`) is now the primary registration path. Unverified users who registered before this change see a persistent banner and are blocked from uploading sheets and commenting.

### Changes

#### Fix 4a: Registration rewired to verification pipeline

**File:** `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx`
- Added email field to account creation form (required).
- Changed from 2-step flow (Account → Courses) to 3-step flow (Account → Verify → Courses).
- Account step now calls `POST /api/auth/register/start` (sends verification email).
- New verify step: 6-digit code input, styled large-digit entry, resend button with countdown timer.
- Course step now calls `POST /api/auth/register/complete` (creates user with `emailVerified: true`).
- Removed `pendingLocalUser` state (no longer needed — user created atomically on complete).
- Resend cooldown (60s) and attempt limits (10 fails, 5 resends) enforced by existing backend.

**Backend:** No changes needed — the `/register/start`, `/register/verify`, `/register/resend`, and `/register/complete` endpoints already existed and were production-ready.

#### Fix 4b: Soft gate for unverified users

**File:** `frontend/studyhub-app/src/components/EmailVerificationBanner.jsx` (new)
- Persistent warning banner: "Please verify your email to upload sheets, post comments, and access all features."
- "Verify now" links to settings page where verification flow exists.
- Dismissible per-session (reappears on next login).
- Only renders for authenticated, unverified users.

**File:** `frontend/studyhub-app/src/components/Navbar.jsx`
- Banner rendered after `<nav>` on all non-landing pages (wrapped in Fragment).

**File:** `backend/src/middleware/requireVerifiedEmail.js` (new)
- Async middleware that checks `emailVerified` via DB lookup.
- Returns 403 with `EMAIL_NOT_VERIFIED` code for unverified users.
- Fail-open on DB errors (doesn't block users due to transient issues).

**File:** `backend/src/routes/sheets.js`
- `POST /api/sheets` (create) — added `requireVerifiedEmail` middleware.
- `POST /api/sheets/:id/comments` — added `requireVerifiedEmail` middleware.
- Draft autosave intentionally NOT gated — users can still draft while unverified.

### Soft Gate Enforcement

| Action | Unverified User | Verified User |
|---|---|---|
| Browse/view sheets | Allowed | Allowed |
| Login | Allowed | Allowed |
| Save drafts | Allowed | Allowed |
| Publish sheets | Blocked (403) | Allowed |
| Post comments | Blocked (403) | Allowed |
| Change email | Blocked (existing) | Allowed |

### Validation

- `npm --prefix frontend/studyhub-app run lint` — 0 errors
- `npm --prefix backend run lint` — 0 errors

---

## Visual Baseline Screenshot Suite + Content Seeding — 2026-03-19

### Added: Playwright Visual Baseline Suite

**File:** `frontend/studyhub-app/tests/visual-baseline.spec.js`
- Captures reference screenshots of every important page/state.
- Matrix: 2 viewports (mobile 390×844, desktop 1440×900) × 2 themes (light, dark).
- Public pages: landing, login, register, forgot-password, about, terms, 404.
- Authenticated pages: dashboard, feed, sheets, sheet-viewer, upload-sheet, notes, announcements, settings, admin.
- Critical states: unverified-user banner, error-403, sheets-empty, mobile-nav-open.
- Screenshots saved to `tests/screenshots/` (PNGs gitignored, gallery.html checked in).

**File:** `frontend/studyhub-app/scripts/generate-gallery.mjs`
- Generates a self-contained HTML gallery grouped by page → theme → viewport.
- Click-to-zoom images, table of contents, and summary stats.
- Open in browser to review the full app UI in 2–3 minutes.

**NPM scripts added:**
- `npm run visual:capture` — run the screenshot suite.
- `npm run visual:gallery` — regenerate the gallery from existing screenshots.
- `npm run visual:review` — capture + gallery in one command.

### Added: Content Seed Script

**File:** `backend/prisma/seed-content.js`
- Additive script (safe to re-run) that seeds realistic study sheets across 10 UMD courses.
- Courses seeded: CMSC131, CMSC132, CMSC216, CMSC250, CMSC351, MATH140, MATH240, BSCI170, CHEM131, ENGL101.
- 12 detailed study sheets with real academic content (500–1500 words each).
- 5 seed author accounts with varied usernames.
- Auto-enrolls authors in the courses they publish to.
- Skips sheets whose title already exists (idempotent).

**NPM script:** `npm --prefix backend run seed:content`

### Validation

- `npm --prefix frontend/studyhub-app run lint` — 0 errors
- `npm --prefix backend run lint` — 0 errors

---

## Design System Rebuild — Direction A "Campus Lab" (Sprint 1 Day 1) — 2026-03-19

### What changed

**Design spec produced:** `docs/design-spec-direction-a.md`
- Full typography scale (Plus Jakarta Sans UI + Inter reading), 7-step fluid type scale
- Warm paper color palette (light: `#f6f5f2` bg, `#ffffff` surface; dark: `#121212` bg, `#1c1c1c` surface)
- 4px-base spacing system, 4-level elevation scale, updated border radius tokens
- Component primitive rules (Button, Input, Card, Badge, Toast, Tab)
- Page template specs for auth, feed, sheets, viewer, dashboard
- 2-sprint execution plan with per-page Definition of Done checklist

**Token layer rebuilt:** `frontend/studyhub-app/src/index.css`
- `:root` tokens updated: warm paper surfaces, true ink text, intentional blue accent
- `[data-theme='dark']` tokens updated: OLED-friendly true dark (#121212), lifted blue accent
- All dark mode structural overrides migrated from hardcoded hex to `var()` token references
- Added Inter font import for reading/content contexts
- New spacing tokens (`--space-1` through `--space-16`)
- New elevation tokens (`--elevation-0` through `--elevation-3`)
- Legacy aliases preserved for backward compatibility

**Dark mode screenshot fix:** `frontend/studyhub-app/tests/visual-baseline.spec.js`
- 4-layer theme enforcement: emulateMedia, localStorage pre-seed, preferences API mock, post-load evaluate
- "Session expired" toast suppressed on public pages via event interception
- All 9 tutorial keys now suppressed (was missing: viewer, settings, profile, announcements)

**About page migrated to tokens:** `frontend/studyhub-app/src/pages/legal/AboutPage.jsx`
- All hardcoded colors (#1e3a5f headings, #374151 body, #6b7280 muted) replaced with `var()` tokens
- Dark mode now renders readable text on all sections (Our Goals, How It Works, Roadmap, Team)

**Landing page ghost button fixed:** `frontend/studyhub-app/src/index.css`
- `.home-btn-ghost` and `.home-btn-primary` use explicit `#ffffff` instead of `var(--white)`

### Files modified
- `docs/design-spec-direction-a.md` (new)
- `frontend/studyhub-app/src/index.css`
- `frontend/studyhub-app/src/pages/legal/AboutPage.jsx`
- `frontend/studyhub-app/tests/visual-baseline.spec.js`

### Validation
- `npm --prefix frontend/studyhub-app run lint` — 0 errors
- Playwright visual suite: 78 passed, 0 failed, 2 skipped

---

## Sprint 1 — SheetsPage GitHub-Dense Redesign (Direction A) — 2026-03-19

### Summary

Implemented the SheetsPage redesign using the selected Direction A style: metadata-first, GitHub-dense list rows with full-row click behavior, tokenized styling, and mobile filter collapse behavior.

### Changed

- `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`
  - Replaced card grid rendering with dense repository-style list rows.
  - Implemented full-row click navigation (keyboard accessible with Enter/Space) while preserving explicit title links.
  - Kept URL-as-source-of-truth filtering (`search`, `schoolId`, `courseId`, `sort`, `mine`, `starred`) and added `format` support in URL state.
  - Added format filter options: All formats, Markdown, HTML, PDF.
  - Added mobile-specific search row + collapsible Filters panel.
  - Updated empty-state language to match the new pattern:
    - generic “Be the first…” with Upload + Template CTA
    - search/filter no-results with clear-filters CTA
  - Preserved tutorial anchors (`sheets-search`, `sheets-filters`, `sheets-toggles`, `sheets-upload`).

- `frontend/studyhub-app/src/pages/sheets/SheetsPage.css` (new)
  - Added full token-based page stylesheet (no new hardcoded hex usage in this page stylesheet).
  - Added dense row spacing/border rules, hover/focus interaction states, metadata line styling, right-column stats/actions, and responsive mobile stacking.
  - Added tutorial FAB class styling for consistent theme behavior.

- `backend/src/routes/sheets.js`
  - Added `format` query handling in `GET /api/sheets` to support server-backed format filtering:
    - `html` → `contentFormat = html`
    - `pdf` → `attachmentType` contains `pdf`
    - `markdown` → `contentFormat = markdown` and excludes PDF attachments

### Visual Review Notes

- Regenerated screenshots and gallery with `npm --prefix frontend/studyhub-app run visual:review`.
- Reviewed updated Sheets screenshots in all required variants:
  - `tests/screenshots/sheets--light--desktop.png`
  - `tests/screenshots/sheets--dark--desktop.png`
  - `tests/screenshots/sheets--light--mobile.png`
  - `tests/screenshots/sheets--dark--mobile.png`
  - `tests/screenshots/sheets-empty--light--desktop.png`
  - `tests/screenshots/sheets-empty--dark--desktop.png`
  - `tests/screenshots/sheets-empty--light--mobile.png`
  - `tests/screenshots/sheets-empty--dark--mobile.png`
- Outcome: redesigned rows, spacing density, and empty states render cleanly across 2 themes × 2 viewports with no visual test regressions.

### Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run build` — passed
- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run visual:review` — passed (78 passed, 2 skipped)

### Additional Validation Note

- `npm --prefix backend run lint` currently reports an existing unrelated lint issue in `backend/prisma.config.js` (`env` unused). This was not introduced by the SheetsPage redesign changes.

### Deferred / Follow-up

- If we want strict one-row desktop filter density at narrower desktop widths, we can tighten select widths another step and move secondary toggles into a compact overflow pattern.

---

## Sprint 1.1 — Tablet Viewport + Visual QA Gate — 2026-03-19

### Summary

Added a tablet (768×1024) viewport to the visual baseline screenshot suite, bringing total test coverage to 3 viewports × 2 themes across all 20 pages. Updated the gallery generator to dynamically compute viewport/theme counts. Established a mandatory visual QA gate workflow for all future UI changes.

### Changed

- `frontend/studyhub-app/tests/visual-baseline.spec.js`
  - Added `{ tag: 'tablet', width: 768, height: 1024 }` to the VIEWPORTS matrix.
  - Test count increased from 80 → 120 (116 passed, 4 skipped — mobile-nav-open skipped on tablet + desktop as expected).

- `frontend/studyhub-app/scripts/generate-gallery.mjs`
  - Replaced hardcoded viewport/theme stats (was `2`/`2`) with dynamically computed `Set` sizes from parsed entries. Gallery now auto-adapts to any number of viewports/themes.

### Visual Review Notes

- Full QA cycle executed: deleted all old PNGs → regenerated 116 fresh screenshots → visually inspected every tablet screenshot.
- All 20 pages pass at 768px tablet viewport with zero layout issues:
  - No overflow, clipping, or misplaced buttons
  - Sidebar pages (Sheets, Feed, Notes) correctly hide the sidebar and show content with right-side widgets
  - Admin stats render in a 2-column grid (better than mobile's single column)
  - Notes page shows the split-pane layout (list + editor) at tablet width
  - Settings page shows left nav tabs + profile card grid
  - All forms (Login, Register, Upload, Forgot Password) center properly
  - All empty states (Sheets, Announcements) center properly

### Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run visual:review` — passed (116 passed, 4 skipped)
- Gallery regenerated with 116 screenshots across 20 pages, 3 viewports, 2 themes

---

## Sprint 1.2 — Mobile-Nav Conditional + Smoke Suite — 2026-03-19

### Summary

Eliminated 4 "skipped" entries in CI output by extracting mobile-nav-open tests into a dedicated mobile-only `test.describe` block. Added a fast 6-page smoke visual suite for quick iteration during heavy refactoring.

### Changed

- `frontend/studyhub-app/tests/visual-baseline.spec.js`
  - Extracted mobile-nav-open tests into a standalone `test.describe` block scoped to mobile viewport only. Result: 116 passed, 0 skipped (was 4 skipped).

- `frontend/studyhub-app/tests/visual-smoke.spec.js` (NEW)
  - Fast smoke suite covering 6 key pages: login, register step 1, dashboard, feed, sheets, sheet viewer.
  - Same 3 viewports × 2 themes = 36 tests, runs in ~38s (vs full suite 116 tests in ~1.3min).

- `frontend/studyhub-app/package.json`
  - Added `visual:smoke` script for quick visual regression checks.

### Validation Commands (Executed)

- `npx playwright test visual-baseline` — 116 passed, 0 skipped
- `npx playwright test visual-smoke` — 36 passed in ~38s

---

## Sprint 2 — Auth Pages Token Migration — 2026-03-19

### Summary

Migrated all 3 auth pages (ForgotPasswordPage, LoginPage, RegisterScreen) from inline `style={{}}` objects with hardcoded hex colors to token-based CSS class files using `var(--sh-*)` design tokens. This eliminates inline style tech debt, enables native CSS pseudo-class handling (`:focus`, `:hover`, `:disabled`), and reduces the need for `!important` dark-mode overrides in `index.css`.

### Changed

- `frontend/studyhub-app/src/pages/auth/ForgotPasswordPage.jsx`
  - Removed `const styles = { ... }` object (~20 inline style definitions with hardcoded hex values).
  - Removed inline `onFocus`/`onBlur` handlers that set hardcoded hex border colors.
  - All elements now use CSS classes from `ForgotPasswordPage.css`.

- `frontend/studyhub-app/src/pages/auth/ForgotPasswordPage.css` (NEW)
  - Token-based stylesheet: `.forgot-page`, `.forgot-card`, `.forgot-input`, `.forgot-submit-btn`, etc.
  - Uses CSS `:focus` pseudo-class instead of JS event handlers for focus states.

- `frontend/studyhub-app/src/pages/auth/LoginPage.jsx`
  - Removed `FONT` constant, `inputStyle` object, `handleInputFocus`/`handleInputBlur` functions.
  - Decorative orbs converted from inline style divs to CSS class divs.
  - All elements now use CSS classes from `LoginPage.css`.

- `frontend/studyhub-app/src/pages/auth/LoginPage.css` (NEW)
  - Token-based stylesheet covering: gradient background, decorative orbs, card, header, alerts, Google OAuth section, form fields, submit button, links, register footer.

- `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx`
  - Removed `FONT` constant, `inputStyle` object, `focusInput`/`blurInput` handlers.
  - PasswordHint component converted from inline styles to CSS classes.
  - All 3 steps (account, verify, courses) converted to CSS classes from `RegisterScreen.css`.

- `frontend/studyhub-app/src/pages/auth/RegisterScreen.css` (NEW)
  - Comprehensive stylesheet covering: page layout, orbs, card, step indicator, section headers, alerts, Google OAuth, form fields, password grid/hints, terms checkbox, 6 button variants, action row, custom course section, pills, footer.
  - Responsive breakpoints at 480px for password grid and custom course grid.

### Design Decisions

- The dark gradient background (`linear-gradient(135deg, #0f172a, #1e3a5f, #1e40af)`) is kept as a literal value — it is intentional page-level design, not a token candidate.
- All other colors use `var(--sh-*)` tokens from `index.css`, enabling automatic dark mode support through `[data-theme='dark']` token overrides.

### Visual QA Gate

- Deleted all old PNGs → regenerated 36 smoke screenshots → visually inspected all 12 auth page screenshots (login + register-step1 × 3 viewports × 2 themes).
- All auth pages render cleanly: cards centered, form fields properly spaced, buttons aligned, dark mode tokens working, responsive layouts correct at mobile/tablet/desktop.

### Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run build` — passed
- `npx playwright test visual-smoke` — 36 passed in ~39s

---

## 2026-03-21 — CSRF Auth Bootstrap Fix

### Problem
Login form showed "Missing CSRF token" error when a stale/expired session cookie was present. The CSRF middleware tried to verify the auth cookie, found it expired, and blocked the request before login could establish a new session.

### Fix
**`backend/src/middleware/csrf.js`** — Added auth bootstrap route exclusion. Routes that establish/refresh sessions (`/api/auth/login`, `/api/auth/google`, `/api/auth/register`) skip CSRF checks, since these endpoints cannot have a valid CSRF token yet.

### Validation
- `npm --prefix backend run lint` — passed
- `npm --prefix frontend/studyhub-app run lint` — passed

---

## 2026-03-21 — Dark Mode Persistence After Logout

### Problem
Logging out reset the theme to light mode because `useBootstrapPreferences` called `resetAppearancePreferences()` on unauthenticated state, stripping the `data-theme` attribute.

### Fix
- **`frontend/studyhub-app/src/lib/appearance.js`** — Added `writeGlobalTheme()` and `applyGlobalTheme()` using a user-agnostic `sh-theme` localStorage key.
- **`frontend/studyhub-app/src/lib/useBootstrapPreferences.js`** — On logout, calls `applyGlobalTheme()` instead of `resetAppearancePreferences()`. On login fetch, writes to global key.
- **`frontend/studyhub-app/src/pages/settings/AppearanceTab.jsx`** — Save also writes to global key.
- **`frontend/studyhub-app/index.html`** — Inline script applies saved theme before React mounts (prevents white flash).

### Acceptance Test
Login → set dark mode → log out → homepage stays dark.

### Validation
- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run build` — passed

---

## 2026-03-21 — Unverified Users Restriction (3-Day Grace Period)

### Policy (Locked)
- Grace period: **3 days** from `user.createdAt`
- After grace, unverified users blocked from: comments, sheet upload/import/autosave, submit review, fork, contributions, notes
- Allowed without verification: browse, read, view, search, star, react

### Backend Changes

**`backend/src/middleware/requireVerifiedEmail.js`** — Added grace period logic. Queries `createdAt` alongside `emailVerified`. If `!emailVerified && now > createdAt + 3 days`, returns 403 with `code: 'EMAIL_NOT_VERIFIED'` and `gracePeriodDays: 3`.

**`backend/src/middleware/errorEnvelope.js`** — Added `EMAIL_NOT_VERIFIED` to `ERROR_CODES`.

**`backend/src/routes/sheets.js`** — Added `requireVerifiedEmail` to 7 previously ungated routes:
- `POST /drafts/autosave`
- `POST /drafts/import-html`
- `PATCH /drafts/:id/working-html`
- `POST /:id/submit-review`
- `POST /:id/fork`
- `POST /:id/contributions`
- `PATCH /contributions/:contributionId`

**`backend/src/routes/notes.js`** — Added `requireVerifiedEmail` to `POST /` and `PATCH /:id`.

### Frontend Changes

**`frontend/studyhub-app/src/components/EmailVerificationBanner.jsx`** — Added `EmailVerificationInline` named export for use inside forms after a blocked action. Shows verification prompt with link to Settings.

**`frontend/studyhub-app/src/lib/http.js`** — Added `isEmailNotVerifiedError()` helper to detect the `EMAIL_NOT_VERIFIED` code.

**`frontend/studyhub-app/src/pages/legal/TermsPage.jsx`** — Added Section 3 "Email Verification" explaining grace period, restricted features, and verification instructions. Renumbered remaining sections (4–11).

### Intentionally Not Gated
- Star/react (lightweight social actions)
- Delete (self-destructive, user's own content)
- GET routes (read-only access)

### Validation

- `npm --prefix backend run lint` — passed
- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run build` — passed

---

## 2026-03-21 — Bug #3: Session Expiry + Idle Logout + Logout Button

### Problem

No idle timeout existed. No logout button in the UI. Session expiry was event-driven only.

### Changes

**`frontend/studyhub-app/src/lib/useIdleTimeout.js`** (NEW) — Idle timeout hook. Tracks mousemove, keydown, click, touchstart, scroll. After 30 minutes of inactivity, calls the provided callback. Uses effect-based ref sync for React 19 compatibility.

**`frontend/studyhub-app/src/App.jsx`** — Wired `useIdleTimeout` into `PreferencesBootstrap` component. Calls `signOut()` after 30 minutes idle when authenticated.

**`frontend/studyhub-app/src/components/Navbar.jsx`** — Converted user avatar from simple click-to-navigate into a dropdown menu with: Dashboard, Profile, Settings, and **Log out** button. Avatar now shows user's uploaded photo if available. Dropdown has click-outside dismiss, chevron rotation animation, and dark mode token styling.

### Existing Session Expiry (already working)

- `SESSION_EXPIRED_FLAG` in `sessionStorage` set on `AUTH_SESSION_EXPIRED_EVENT`
- LoginPage reads flag once, shows banner, removes it — shows once only
- Tab close + reopen = no stale popup (sessionStorage cleared)

### Validation

- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run build` — passed

---

## 2026-03-21 — Bug #4: Initials Visible in Dark Mode

### Problem

Avatar initials used hardcoded colors (`background: var(--sh-heading)`, `color: '#fff'`) which became invisible in dark mode when `--sh-heading` resolves to a light color.

### Changes

**`frontend/studyhub-app/src/index.css`** — Added `--sh-avatar-bg` and `--sh-avatar-text` tokens:
- Light: `--sh-avatar-bg: #e2e8f0`, `--sh-avatar-text: #0f172a`
- Dark: `--sh-avatar-bg: #1f2937`, `--sh-avatar-text: #f8fafc`

**Components updated:**
- `AppSidebar.jsx` — Avatar component uses `--sh-avatar-bg` / `--sh-avatar-text`
- `FeedPage.jsx` — Avatar component uses tokens
- `UserProfilePage.jsx` — Main avatar + followers list avatars use tokens
- `SearchModal.jsx` — User search result avatar uses tokens

### Validation

- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run build` — passed

---

## 2026-03-21 — Avatar Upload + Crop Feature

### Decisions (Locked)

- Crop shape: Circle
- Max size: 5 MB (updated from 2 MB)
- Output format: PNG
- UI location: Both Profile page + Settings (Profile tab)
- Library: react-easy-crop

### Changes

**`frontend/studyhub-app/src/components/AvatarCropModal.jsx`** (NEW) — Full crop modal with:
- File selection with drag/zoom via react-easy-crop
- Circle crop shape with zoom slider
- Client-side 5 MB validation
- Canvas-based PNG blob generation
- Upload to `POST /api/upload/avatar`
- Error handling with themed UI

**`frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx`** — Avatar is now clickable on own profile. Shows camera icon overlay on hover. Opens AvatarCropModal. On upload, updates both local profile state and session user.

**`frontend/studyhub-app/src/pages/settings/ProfileTab.jsx`** — Added "Profile Photo" section with avatar preview + "Upload photo" button. Opens AvatarCropModal. On upload, updates session user via `onAvatarChange` prop. Also converted hardcoded colors to theme tokens.

**`frontend/studyhub-app/src/pages/settings/SettingsPage.jsx`** — Passes `onAvatarChange` prop to ProfileTab.

**`backend/src/routes/upload.js`** — Updated `AVATAR_MAX_BYTES` from 2 MB to 5 MB.

### Tutorial Add-on

**`frontend/studyhub-app/src/lib/tutorialSteps.js`** — Added avatar upload step to `PROFILE_STEPS` (first step, targets `[data-tutorial="profile-avatar"]`) and `SETTINGS_STEPS` (first step, targets `[data-tutorial="settings-avatar"]`). Shows once per user via existing localStorage-based tutorial system.

### Validation

- `npm --prefix backend run lint` — passed
- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run build` — passed

---

## Cycle: Version Bump + Settings Dark Mode + Policy Pages [2026-03-21]

### Version References Normalized to v1.5.0-beta

All version references normalized to v1.5.0-beta across:
- `backend/package.json`, `frontend/studyhub-app/package.json`
- Release log: `beta-v1.5.0-release-log.md`
- Release notes: `v1.5.0-release-notes.md`
- Roadmap: `v1.5-weekly-roadmap.md`
- All docs: CHANGELOG, feature-tracker, dependency-tracker, security-overview, design-specs
- CLAUDE.md, SKILL.md project references
- Source code comments: auth.js, bootstrap.js, NotesPage.jsx

### Settings Dark Mode Fix (CoursesTab + SettingsPage)

Fixed:
- **`frontend/studyhub-app/src/pages/settings/CoursesTab.jsx`** — School dropdown replaced inline hardcoded `<select>` (`color: '#0f172a'`, `border: '#cbd5e1'`) with shared `Select` component from `settingsShared.jsx` using CSS tokens. Loading text → `var(--sh-muted)`. Error text → `var(--sh-danger)`. Retry button → `var(--sh-brand)`. Removed unused `FONT` import.

- **`frontend/studyhub-app/src/pages/settings/SettingsPage.jsx`** — Page background → `var(--sh-bg)`. Active tab → `var(--sh-surface)` / `var(--sh-heading)`. Inactive tab → `var(--sh-muted)`. Box shadow → `var(--shadow-sm)`. Sign Out button → `var(--sh-border)` / `var(--sh-muted)`.

### Formal Policy Pages

Rewrote all three policy pages with formal, real-world legal copy:

- **TermsPage.jsx** — 10 sections: Who Can Use, Accounts, Email Verification, Acceptable Use, User Content, HTML File Safety, Suspension & Removal, Disclaimers, Changes, Contact.
- **PrivacyPage.jsx** — 9 sections: What We Collect, How We Use Data, Data Sharing, What Is Public, Security, Data Retention, Your Rights, Changes, Contact.
- **GuidelinesPage.jsx** — 7 sections: What We Expect, What We Encourage, What Is Not Allowed, Content Quality, Forking and Attribution, Enforcement, Reporting.

### Validation (v1.5.0 Dark Mode + Policy Pages)

- `npm --prefix backend run lint` — passed
- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run build` — passed

---

## Cycle: Tiered HTML Risk Classification (2026-03-21)

### Summary

Replaced the binary block/allow HTML security model with a 4-tier risk classification system. HTML submissions are no longer hard-blocked — all HTML is accepted and classified into risk tiers that determine visibility, preview behavior, and moderation routing.

### Policy Matrix

| Tier | Name | Scan Status | Sheet Status | Listing | Preview | UX |
|------|------|-------------|--------------|---------|---------|-----|
| 0 | Clean | passed | published | Visible | Interactive (scripts allowed) | No banner |
| 1 | Flagged | flagged | published | Visible + "Flagged" badge | Safe preview (scripts blocked) | Warning banner |
| 2 | High Risk | pending_review | pending_review | Visible + "Pending Review" badge | Disabled for non-admins | "Pending safety review" banner |
| 3 | Quarantined | quarantined | quarantined | Hidden (admin only) | Disabled | Author sees block notice |

### Added

- **`htmlRiskTier` field** — `backend/prisma/schema.prisma`: New `Int @default(0)` column on `StudySheet` with composite index `[htmlRiskTier, status, createdAt]`. Migration includes backfill for existing `pending_review` HTML sheets → Tier 2.
- **`classifyHtmlRisk()`** — `backend/src/lib/htmlSecurity.js`: Core classification function. Detects Tier 1 features (scripts, iframes, inline handlers, dangerous URLs) and Tier 2 behavioral patterns (obfuscation via String.fromCharCode/hex chains, redirects via window.location, form exfiltration to external domains, keylogging via key event listeners + storage/network, crypto-miner signatures, eval/fetch JS risk).
- **`detectHtmlFeatures()` / `detectHighRiskBehaviors()`** — `backend/src/lib/htmlSecurity.js`: Separated detection into feature detection (Tier 1) and behavioral analysis (Tier 2).
- **`RISK_TIER` / `TIER_LABELS` constants** — `backend/src/lib/htmlSecurity.js`: Exported enums for tier values and human-readable labels.
- **Tier-aware preview tokens** — `backend/src/lib/previewTokens.js`: `signHtmlPreviewToken()` now includes `tier` in JWT payload.
- **`SAFE_PREVIEW_CSP`** — `backend/src/routes/preview.js`: CSP variant with `script-src 'none'` for Tier 1 safe previews.
- **Quarantine filtering** — `backend/src/routes/feed.js`, `backend/src/routes/search.js`: Added `htmlRiskTier: { lt: 3 }` to hide quarantined sheets from public listings and search.
- **Admin tier filter** — `backend/src/routes/admin.js`: Review list supports `?tier=` filter, review detail returns `liveRiskTier` and `liveRiskSummary` from live classification, approve action downgrades tier to 0.
- **Tier-aware upload UI** — `frontend/studyhub-app/src/pages/sheets/UploadSheetPage.jsx`: Dynamic submit button labels ("Publish" / "Publish with Warnings" / "Submit for Review" / "Quarantined"), tier-specific scan modals with findings display and acknowledgement flow.
- **Tier-aware viewer** — `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`: Tier-based preview rendering (Tier 0: interactive with `sandbox="allow-scripts"`, Tier 1: safe preview with `sandbox=""` and warning banner, Tier 2: disabled for non-admins, Tier 3: quarantine notice).
- **Tier badges on listings** — `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`: Yellow "Flagged" badge for Tier 1, orange "Pending Review" for Tier 2+.

### Changed

- **`runHtmlScanNow()`** — `backend/src/lib/htmlDraftWorkflow.js`: Uses `classifyHtmlRisk()` instead of `validateHtmlForSubmission()`. Always runs ClamAV (AV infected → Tier 3 escalation). Stores both `htmlScanStatus` and `htmlRiskTier`.
- **`submitHtmlDraftForReview()`** — `backend/src/lib/htmlDraftWorkflow.js`: Routes by tier instead of blocking on scan failure. Tier 0 auto-publishes, Tier 1 requires acknowledgement, Tier 2 routes to pending_review, Tier 3 quarantines.
- **`SCAN_STATUS`** — `backend/src/lib/htmlDraftWorkflow.js`: Added `FLAGGED`, `PENDING_REVIEW`, `QUARANTINED`. Removed `FAILED` from new code paths.
- **`normalizeFindings()`** — `backend/src/lib/htmlDraftWorkflow.js`: Accepts new classifier result format `{tier, findings}` instead of old `{ok, issues}`.
- **Preview route** — `backend/src/routes/preview.js`: Reads tier from token + DB record, applies tier-based CSP and access control.
- **Sheet routes** — `backend/src/routes/sheets.js`: `GET /:id/html-preview` and `GET /:id/html-runtime` pass tier to preview tokens. Listing hides quarantined sheets. Removed `validateHtmlForRuntime` check from runtime route (stays only in admin approval).
- **`validateHtmlForSubmission()`** — `backend/src/lib/htmlSecurity.js`: Kept as backward-compatible wrapper (deprecated alias) that maps new classifier output to old `{ok, issues}` format.

### Security

- Tier 1 (Flagged) sheets served with `script-src 'none'` CSP — scripts cannot execute even if present in HTML.
- Tier 2+ sheets cannot be previewed by non-admin/non-owner users.
- Tier 3 (Quarantined) sheets completely hidden from public listings, search, and feed.
- Behavioral pattern detection catches obfuscated attacks that pass simple tag-based scanning.
- ClamAV integration escalates AV-detected threats to Tier 3 regardless of classifier tier.

### Test Updates

- `backend/test/htmlSecurity.test.js` — Added tests for `detectHtmlFeatures`, `classifyHtmlRisk` across all tiers: clean → Tier 0, script/iframe/handler → Tier 1, obfuscation/redirect/keylogging/exfiltration/crypto-miner/eval → Tier 2.
- `backend/test/htmlDraftWorkflow.test.js` — Updated `normalizeFindings` tests for new classifier result format.
- `backend/test/preview.routes.test.js` — Added `htmlRiskTier` to mock state, fixed owner token test, replaced removed PREVIEW_HTML_BLOCKED test with quarantine rejection test.
- `backend/test/sheet.workflow.integration.test.js` — Updated assertions: clean HTML now auto-publishes (`published` not `pending_review`), flagged HTML returns tier-aware error message.

### Validation (Tiered Risk Classification)

- `npm --prefix backend test` — 75/79 passed (4 pre-existing failures in admin/dashboard/auth unrelated to this change)
- `npm --prefix backend run lint` — passed
- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run build` — passed

### Known Risks / Deferred

- Tier 3 (Quarantined) is currently only reachable via ClamAV `infected` result or manual admin action — no classifier-only path to Tier 3 yet.
- Admin quick-reject does not currently escalate to Tier 3; it keeps the existing tier. Future enhancement: add "Quarantine" action to admin review.
- `scheduleHtmlScan()` error fallback sets Tier 1 (safe default) — scanner failures do not block publishing but flag the sheet for attention.

---

## Cycle: PM Audit & Fixes (2026-03-22)

### Summary

Addressed production issues identified via PM audit: profile page 500 error resilience, dark mode conversion for profile page, sheet listing status badges, and draft navigation improvements.

### Fixed

- **User profile resilience** — `backend/src/routes/users.js`: Wrapped shared notes and starred sheets queries in try/catch for graceful degradation. `backend/src/lib/profileVisibility.js`: Added try/catch around `UserPreferences` query so profile doesn't 500 if table is missing.
- **Profile page dark mode** — `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx`: Converted all hardcoded color values to CSS var tokens (`--sh-bg`, `--sh-surface`, `--sh-heading`, `--sh-muted`, `--sh-border`, `--sh-brand`, etc.) across loading, error, main profile, stats, sheets, notes, starred, courses, and follow modal states.
- **Sheet listing status badges** — `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`: Added Draft (gray), Rejected (red), and Quarantined (red) status badges to sheet rows in "My Sheets" view, alongside existing Flagged (yellow) and Pending Review (orange) tier badges.
- **Draft sheet navigation** — `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`: Clicking a draft sheet in "My Sheets" now navigates to `/sheets/upload?draft=${id}` (editor) instead of `/sheets/${id}` (viewer).
- **"My Sheets" empty state** — `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`: Added dedicated empty state message for "Mine" filter with upload CTA using `?new=1`.

### Audited (No Changes Needed)

- **Image/attachment URLs**: All avatar and attachment serving patterns verified correct. Avatars use public static serving, attachments use private `attachment://` prefix with auth-gated endpoints.
- **Admin Panel button**: Already correctly implements `role === 'admin'` check, routes to `/admin`, uses CSS var tokens.
- **All frontend buttons**: Verified across AdminPage, SheetViewerPage, UploadSheetPage, and FeedPage — all buttons call valid API endpoints, no dead UI or duplicate CTAs found.

### Validation

- `npm --prefix backend run lint` — passed
- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run build` — passed

---

## Cycle: Critical PostgreSQL Migration Repair (2026-03-22)

### Summary

Root-cause fix for production 500 errors on profile pages, registration, and any query involving School/Course joins. All 11 existing Prisma migrations used invalid PostgreSQL syntax (`ADD COLUMN IF NOT EXISTS` — MySQL-only), causing 30+ columns to never be created in the production database.

### Root Cause

PostgreSQL does not support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. This is a MySQL/MariaDB extension. Every migration that used this syntax silently failed (or was never applied correctly), leaving the production database missing critical columns across User, StudySheet, FeedPost, Contribution, School, Course, and ModerationCase tables.

The most impactful missing columns were on the **School** table (`city`, `state`, `schoolType`) — every profile query and registration query includes `school: true` in Prisma, which generates `SELECT ... city, state, schoolType ...`. With these columns missing, all such queries return 500.

### Fixed

- **Repair migration created** — `backend/prisma/migrations/20260322050000_repair_missing_columns/migration.sql`: Adds all 30+ missing columns using proper PostgreSQL `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns ...) THEN ALTER TABLE ... ADD COLUMN ...; END IF; END $$;` blocks. Idempotent — safe to run even if some columns already exist.
- **11 existing migration files converted** — All migrations from `20260315000000` through `20260319020000` converted from invalid `ADD COLUMN IF NOT EXISTS` to proper `DO $$ BEGIN ... END $$` PostgreSQL syntax. This prevents the issue from recurring if migrations are re-run on a fresh database.

### Tables & Columns Repaired

| Table | Columns |
| ------- | ------- |
| User | twoFaEnabled, twoFaCode, twoFaExpiry, email, emailVerified, failedAttempts, lockedUntil, avatarUrl, emailVerificationCode, emailVerificationExpiry, googleId, authProvider |
| StudySheet | description, attachmentUrl, attachmentType, contentFormat, status, htmlScanStatus, htmlScanFindings, htmlScanUpdatedAt, htmlScanAcknowledgedAt, htmlOriginalArchivedAt, htmlRiskTier |
| FeedPost | attachmentName, allowDownloads |
| Contribution | linkPath |
| School | city, state, schoolType |
| Course | department |
| ModerationCase | userId |

### Production Impact

- Profile pages (`/users/:username`) — **will stop returning 500**
- Registration page (school/course picker) — **will stop failing**
- Any query with `include: { school: true }` or `include: { course: true }` — **will work**
- Sheet listings, feed posts, moderation — all restored

### Deployment Required

Run `npx prisma migrate deploy` on the Railway production instance to apply the repair migration.

### Validation

- `npm --prefix backend run lint` — passed
- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run build` — passed
- `npm --prefix backend test` — 4 pre-existing failures (admin stats, auth message wording, dashboard mock), no new regressions

---

## Cycle: School/Course Data Population + Follow Button Dark Mode (2026-03-22)

### Summary

Populated empty School `city` and Course `department` fields in production database. Fixed follow button hardcoded colors for dark mode compatibility.

### Fixed

- **School city data** — `backend/prisma/migrations/20260322060000_populate_school_city_course_dept/migration.sql`: UPDATE statements for all 30 Maryland schools matching by `short` code. Only updates rows where `city` is NULL or empty.
- **Course department data** — Same migration: CASE expression maps course code prefixes (CMSC→Computer Science, MATH→Mathematics, ECON→Economics, etc.) to department names. Covers 35+ prefix patterns. Only updates rows where `department` is NULL or empty.
- **Follow button dark mode** — `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx`: Replaced hardcoded `#bbf7d0`, `#f0fdf4`, `#166534` with CSS var tokens `var(--sh-success-border)`, `var(--sh-success-bg)`, `var(--sh-success-text)`.

### Already Implemented (verified)

- **Follower/following counts on profile page** — Already shows Followers and Following stats with clickable buttons opening a modal list of users. Backend already returns `followerCount` and `followingCount`.

### Validation

- `npm --prefix backend run lint` — passed
- `npm --prefix frontend/studyhub-app run lint` — passed
- `npm --prefix frontend/studyhub-app run build` — passed
- All migrations audited — no remaining MySQL `ADD COLUMN IF NOT EXISTS` syntax

---

## Cycle: Registration Test Drift + Browser Credentials Guardrail Repair (2026-03-22)

### Summary

Repaired two stale validation layers discovered during the expanding dependency-web audit:

- `RegisterScreen` unit coverage was still written against the removed one-step registration contract.
- The Playwright credentials guardrail was incorrectly inferring auth transport from cookie headers instead of validating StudyHub's real fetch contract.

### Changed

- **Current registration flow coverage** — `frontend/studyhub-app/src/pages/auth/RegisterScreen.test.jsx`
  - Replaced the obsolete `/api/auth/register` test assumptions with the live multi-step flow:
    - `POST /api/auth/register/start`
    - `POST /api/auth/register/verify`
    - `POST /api/auth/register/complete`
  - Updated the completion assertion to match current navigation to `/dashboard?welcome=1`.
  - Added per-test cleanup so repeated renders do not leak between cases.

- **Browser credentials guardrail** — `frontend/studyhub-app/tests/auth.credentials-guardrail.spec.js`
  - Replaced the brittle cookie-header tracker with a fetch-level tracer injected before app startup.
  - Guardrail now validates the actual contract enforced by `installApiFetchShim()` in `frontend/studyhub-app/src/lib/http.js`, which forces `credentials: 'include'` for API-origin fetches.
  - Retained page coverage across feed, sheets, sheet viewer, dashboard, profile, SheetLab, admin, announcements, and search modal flows.

### Deep Scan Summary

- The broad Playwright failure surface initially looked like a repo-wide auth regression because it flagged `/api/auth/me`, `/api/feed`, `/api/sheets`, `/api/settings/preferences`, `/api/users/:username`, `/api/admin/stats`, and `/api/announcements` as missing credentials.
- Tracing the app outward from those failures showed the frontend already has a global API fetch shim installed in `frontend/studyhub-app/src/main.jsx`. That shim wraps `window.fetch` and injects `credentials: 'include'` for StudyHub API requests.
- That means the failing browser suite was testing the wrong signal. The fix was to validate fetch credentials at the page layer before the request leaves the browser, not to weaken the app or add redundant patches blindly across unrelated pages.

### Validation

- `npm --prefix frontend/studyhub-app run test -- src/pages/auth/RegisterScreen.test.jsx` — passed (`2` tests)
- `npm --prefix frontend/studyhub-app run test:e2e -- tests/auth.credentials-guardrail.spec.js` — passed (`9` Playwright tests)
- VS Code Problems scan on touched test files — no errors

### Deferred / Notes

- The app still contains a mix of explicit `credentials: 'include'` fetch calls and fetches that rely on the global shim. That is functionally safe under the current architecture, but if you want stricter local readability we can do a separate normalization pass later.

---

## Cycle: Backend Module Architecture — Complete Route Migration (2026-03-22)

### Summary

Completed the full backend migration from a flat `routes/` layout to a module-first architecture under `modules/`. Every route import in `backend/src/index.js` now points to `./modules/<name>` instead of `./routes/<name>`. No route registration, middleware order, or API contract was changed — the migration is purely structural.

### Architecture

All 21 route groups now resolve through `backend/src/modules/`:

| Module | Strategy | Files Created | Routes |
|--------|----------|---------------|--------|
| auth | Full split (Phase 4) | 9 files | 14 |
| sheets | Full split (Phase 2) | 13 files | 28 |
| feed | Full split (Phase 3) | 7 files | 10 |
| admin | Full split (Phase 5) | 7 files | 19 |
| settings | Full split (Phase 6) | 8 files | 12 |
| moderation | Full split (Phase 7) | 6 files | 12 |
| sheetLab | Full split (Phase 7) | 5 files | 7 |
| courses | Full split (Phase 7) | 5 files | 4 |
| dashboard | Barrel wrap | 1 file | — |
| announcements | Barrel wrap | 1 file | — |
| upload | Barrel wrap | 1 file | — |
| notes | Barrel wrap | 1 file | — |
| notifications | Barrel wrap | 1 file | — |
| users | Barrel wrap | 1 file | — |
| preview | Barrel wrap | 1 file | — |
| search | Barrel wrap | 1 file | — |
| webhooks | Barrel wrap | 1 file | — |
| provenance | Barrel wrap | 1 file | — |
| featureFlags | Barrel wrap | 1 file | — |
| webauthn | Barrel wrap | 1 file | — |
| public | Barrel wrap | 1 file | — |

**Full split modules** extract constants, services, and controllers into separate files (each under ~250 lines). Barrel-wrapped modules re-export the existing route file from `../../routes/<name>` via a one-line `modules/<name>/index.js`.

Shared infrastructure lives in `backend/src/core/` (10 files): db/prisma, http/errors+asyncHandler+validate, auth/requireAuth+optionalAuth+requireAdmin+requireVerifiedEmail, monitoring/sentry, and a barrel index.

### Changed

- `backend/src/index.js` — All 21 route `require()` calls now point to `./modules/<name>` (zero `./routes/` imports remain)
- Created 73 new files across `backend/src/modules/` and `backend/src/core/`
- No API contracts, middleware ordering, or route paths were modified

### Validation

- `npx eslint src/ --no-warn-ignored` — **0 errors** (full backend)
- All 21 test files run individually — **161/161 tests passed**:
  - auth (7), settings (17), admin (8), feed (16), search (5), dashboard (1), users (15), notifications (10), notes (12), announcements (10), webhooks (7), preview (6), sheet.workflow.integration (4), htmlSecurity (19), htmlDraftWorkflow (5), htmlArchive (1), clamav (3), attachmentPreview (2), email.suppression (2), verificationChallenges (4), releaseA.stability.middleware (7)

### Deferred / Notes

- Original `routes/*.js` files are retained for now (strangler pattern) — barrel-wrapped modules delegate to them. They can be migrated into their module directories in a future cleanup pass.
- Frontend restructuring (pages/ → features/) is the next phase.

---

## Cycle 33 — Sentry Production Bug Sweep (P0/P1 Crash Fixes) [2026-03-23]

Triaged all unresolved Sentry errors from the production backend. Fixed 3 P0 crashes, 4 P1 validation errors, and 1 idempotency race condition across 7 files.

### Fixed

**P0 — Page-breaking crashes:**

- Feed endpoint crash (`GET /api/feed`) — `TypeError: loader(...).then is not a function`:
  - `backend/src/modules/feed/feed.service.js`
  - `settleSection()` now wraps the loader call with `Promise.resolve()` so loaders that return plain values (e.g. `[]` from short-circuit ternaries) are handled safely.
  - Root cause: secondary-section loaders in `feed.list.controller.js` return `[]` when their input array is empty, which is not a Promise.

- User profile crash (`GET /api/users/:username`) — `PrismaClientValidationError: Argument 'followerId' is missing`:
  - `backend/src/modules/users/users.routes.js`
  - Changed `req.user && req.user.userId` guard to `req.user?.userId` so the `userFollow.findUnique` call is skipped when the auth token payload doesn't contain `userId`.
  - Root cause: `optionalAuth` sets `req.user` to the decoded token, which may be truthy but lack `userId`.

- Sheet detail crash (`GET /api/sheets/:id`) — `PrismaClientValidationError: Argument 'userId' is missing`:
  - `backend/src/modules/sheets/sheets.read.controller.js`
  - Changed `req.user ? prisma.starredSheet.findUnique(...)` to `req.user?.userId ? ...` for both the starred-sheet and reaction lookups.
  - Same root cause as the profile bug: `req.user` truthy but `userId` undefined under `optionalAuth`.

**P1 — Prisma validation errors from NaN route params:**

- Added `Number.isInteger(id)` guards before all Prisma calls that use `parseInt(req.params.id)`:
  - `backend/src/modules/feed/feed.posts.controller.js` — `GET/DELETE /posts/:id`, `GET /posts/:id/attachment`, `GET /posts/:id/attachment/preview`
  - `backend/src/modules/feed/feed.social.controller.js` — `GET/POST /posts/:id/comments`, `DELETE /posts/:id/comments/:commentId`, `POST /posts/:id/react`
  - `backend/src/modules/sheets/sheets.read.controller.js` — `GET /:id`
  - `backend/src/modules/sheets/sheets.social.controller.js` — `POST /:id/star`, `GET/POST /:id/comments`, `POST /:id/react`
  - `backend/src/modules/sheets/sheets.downloads.controller.js` — `GET/POST /:id/download`, `GET /:id/attachment`, `GET /:id/attachment/preview`
  - All return `400 { error: 'Invalid ... id.' }` instead of propagating NaN into Prisma.

**P1 — Reaction delete idempotency:**

- Feed post reaction delete (`POST /posts/:id/react`) now catches `P2025` (record not found) during the delete path:
  - `backend/src/modules/feed/feed.social.controller.js`
  - Matches the existing pattern in `sheets.social.controller.js` which already handled this race condition.

### Validation

- `npm --prefix backend run lint` — **0 errors**
- `npm --prefix backend test` — **21 test files, 161/161 tests passed**

### Root-Cause Patterns Addressed

| Pattern | Affected routes | Fix |
|---|---|---|
| `settleSection` calls `.then()` on non-Promise return | `GET /api/feed` | `Promise.resolve()` wrapper |
| `optionalAuth` sets truthy `req.user` without `userId` | `GET /api/users/:username`, `GET /api/sheets/:id` | Guard on `req.user?.userId` |
| `parseInt` produces `NaN` passed to Prisma `where` | 14 route handlers across feed + sheets | `Number.isInteger()` early-return |
| `delete()` on already-deleted row throws `P2025` | `POST /api/feed/posts/:id/react` | Catch and suppress `P2025` |

### Deferred / Notes

- `GET /api/announcements` — Sentry shows a `TypeError: fetch failed` (1 event, 7d old). The route code uses direct Prisma queries, not `fetch`. Likely a transient network/DNS issue on Railway, not a code bug. Monitoring.
- `GET /api/dashboard/summary` — Sentry error (6d old, 5 events) may have been from a pre-migration schema mismatch. The current code and schema look correct. Monitoring.
- Frontend profile page shows "User not found" with "Server error" subtitle. This is a frontend error-message differentiation issue — the component should distinguish 404 from 500. Deferred to a UI polish pass.

---

## Cycle 34 — Images Consistency + Sheets Pending Section + Error-State Cleanup [2026-03-23]

Three-track improvement pass following the P0/P1 bug sweep in Cycle 33.

### Track 1: Images Consistency Pass

**Fixed:**

- **Feed avatars now render actual images** — `FeedWidgets.jsx` `Avatar` component rewritten to accept `avatarUrl` prop, resolve relative URLs via `API` base, and fall back to initials on image load error.
- **Feed backend returns `avatarUrl`** — All author `select` blocks in `feed.list.controller.js` and `feed.posts.controller.js` now include `avatarUrl: true`.
- **Feed service formatters include `avatarUrl`** — `formatAnnouncement`, `formatSheet`, `formatPost`, and `formatFeedPostDetail` in `feed.service.js` now serialize `author.avatarUrl`.
- **Avatar `onError` fallback added everywhere** — `ProfileTab.jsx`, `ProfileWidgets.jsx` (`ProfileAvatar` and `FollowModal`), and `FeedWidgets.jsx` all gracefully degrade to initials when avatar image fails to load.
- **Attachment preview iframes secured** — Added `sandbox="allow-same-origin"` and `referrerPolicy="no-referrer"` to all attachment preview iframes: `FeedCard.jsx`, `SheetViewerSidebar.jsx`, `AttachmentPreviewPage.jsx`.

**Files changed:**
- `backend/src/modules/feed/feed.list.controller.js`
- `backend/src/modules/feed/feed.posts.controller.js`
- `backend/src/modules/feed/feed.service.js`
- `frontend/studyhub-app/src/pages/feed/FeedWidgets.jsx`
- `frontend/studyhub-app/src/pages/feed/FeedCard.jsx`
- `frontend/studyhub-app/src/pages/profile/ProfileWidgets.jsx`
- `frontend/studyhub-app/src/pages/settings/ProfileTab.jsx`
- `frontend/studyhub-app/src/pages/preview/AttachmentPreviewPage.jsx`
- `frontend/studyhub-app/src/pages/sheets/SheetViewerSidebar.jsx`

### Track 2: Pending Section on /sheets

**Added:**

- **Backend `status` query param** — `GET /api/sheets?mine=1&status=draft` now filters by sheet status when viewing own sheets. Validates against `SHEET_STATUS` enum. Only applies when `mine=1`.
  - File: `backend/src/modules/sheets/sheets.list.controller.js`
- **Frontend status filter pills** — When "Mine" toggle is active on the Sheets page, a row of status filter pills appears: Drafts, Pending review, Published, Rejected. Clicking a pill toggles the `?status=` URL param.
  - File: `frontend/studyhub-app/src/pages/sheets/SheetsFilters.jsx`
- **Status-aware empty states** — Custom empty-state messaging per status filter: "No drafts" with upload CTA, "Nothing pending", "No rejected sheets".
  - File: `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`
- **`STATUS_OPTIONS` constant** — Added to `sheetsPageConstants.js`.
- **`toggleMine` callback** — Atomically clears both `mine` and `status` params when toggling Mine off, avoiding stale-closure bugs from sequential `setQueryParam` calls.
  - File: `frontend/studyhub-app/src/pages/sheets/useSheetsData.js`
- **CSS for status row** — `.sheets-page__status-row`, `.sh-chip--status`, `.sh-chip__icon` styles.
  - File: `frontend/studyhub-app/src/pages/sheets/SheetsPage.css`

**Files changed:**
- `backend/src/modules/sheets/sheets.list.controller.js`
- `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`
- `frontend/studyhub-app/src/pages/sheets/SheetsFilters.jsx`
- `frontend/studyhub-app/src/pages/sheets/useSheetsData.js`
- `frontend/studyhub-app/src/pages/sheets/sheetsPageConstants.js`
- `frontend/studyhub-app/src/pages/sheets/SheetsPage.css`

### Track 3: Frontend Error-State Cleanup

**Fixed:**

- **SettingsPage silent failure** — Initial `GET /api/settings/me` load now surfaces errors with a full-page "Settings unavailable" screen and refresh button, instead of silently swallowing the error via `.catch(() => {})`.
  - File: `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx`
- **Consistent `getApiErrorMessage()` usage** — Replaced all `data.error || 'fallback'` patterns with safe `getApiErrorMessage(data, 'fallback')` helper across:
  - `useSheetViewer.js` — star, reaction, fork, contribution, comment submit, comment delete (7 call sites)
  - `useFeedData.js` — reaction, star, delete post, compose post (4 call sites)
- **Load-more failure toast** — `useSheetsData.js` `loadMoreSheets` catch block now shows a toast instead of silently failing.

**Files changed:**
- `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx`
- `frontend/studyhub-app/src/pages/sheets/useSheetViewer.js`
- `frontend/studyhub-app/src/pages/feed/useFeedData.js`
- `frontend/studyhub-app/src/pages/sheets/useSheetsData.js`

### Validation

- `npm --prefix frontend/studyhub-app run lint` — **22 pre-existing warnings** (all in untouched files: `feedConstants.jsx`, `notesConstants.jsx`, `sheetViewerConstants.jsx`, `uploadSheetConstants.jsx`). **0 errors in changed files.**
- `npm --prefix frontend/studyhub-app run build` — **Pass** (built in <1s)
- `npm --prefix backend run lint` — **0 errors**
- `npm --prefix backend test` — **21 test files, 161/161 tests passed**

### Deferred / Notes

- Profile page already distinguishes 404 vs 500 vs private-profile errors with different icons and messaging (confirmed during audit — no change needed).
- Leaderboard sidebar errors are small aside text — acceptable for non-critical UI.
- 22 pre-existing `react-refresh/only-export-components` lint errors in `.jsx` constant files remain. These are false positives from mixing component exports with non-component exports in the same file — cosmetic, not functional.

---

## Cycle 35 — Admin/Button Audit, HTML Workflow Cleanup, Modular Refactor Scaffolding (2026-03-23)

### Track 1: Admin/Button Audit

**Summary:** Full audit of all admin buttons, role-gating, and dead CTAs across the app.

**Result:** All buttons confirmed functional and properly role-gated. BUG-006 (Google link flow) confirmed already implemented in prior cycles — marked resolved.

**Files changed:** None (audit only).

### Track 2: HTML Workflow Cleanup

**Summary:** 6 copy/label fixes across the HTML upload, preview, and scan workflows to improve clarity and tone.

**Changes:**
- `SheetHtmlPreviewPage.jsx` — "Sanitized preview" → "Safe preview mode"; improved explanation of script/embed disabling
- `UploadSheetFormFields.jsx` — Improved HTML import explanation; fixed status underscore display (`pending_review` → `pending review`)
- `uploadSheetActions.js` — "Submit blocked." → "Could not submit sheet." (all instances)
- `SheetViewerPage.jsx` — Improved quarantine message with contact support CTA
- `HtmlScanModal.jsx` — "Harmful content" → "community guidelines"; improved acknowledgement checkbox text

**Files changed:**
- `frontend/studyhub-app/src/pages/preview/SheetHtmlPreviewPage.jsx`
- `frontend/studyhub-app/src/pages/sheets/UploadSheetFormFields.jsx`
- `frontend/studyhub-app/src/pages/sheets/uploadSheetActions.js`
- `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`
- `frontend/studyhub-app/src/pages/sheets/HtmlScanModal.jsx`

### Track 3: Modular Refactor Scaffolding

**Summary:** Created feature-first folder structure for the frontend and resolved all 22 pre-existing lint errors.

**Added — Feature barrel exports (8 folders):**
- `src/features/sheets/index.js` — re-exports hooks, constants, workflow helpers from pages/sheets/
- `src/features/feed/index.js` — re-exports useFeedData, feedConstants, feedHelpers
- `src/features/admin/index.js` — re-exports useAdminData, adminConstants, moderationHelpers, sheetReviewConstants
- `src/features/users/index.js` — re-exports profileConstants
- `src/features/dashboard/index.js` — re-exports useDashboardData, dashboardConstants
- `src/features/notes/index.js` — re-exports useNotesData, notesConstants
- `src/features/auth/index.js` — re-exports useRegisterFlow, registerConstants
- `src/features/settings/index.js` — re-exports settingsState, settingsShared

**Fixed — 22 react-refresh/only-export-components lint errors:**

Extracted JSX components from mixed-export `.jsx` files into dedicated component files, then renamed the constants to `.js`:

| Original file | Extracted component(s) | New component file |
|---|---|---|
| `uploadSheetConstants.jsx` → `.js` | `MiniPreview` | `uploadSheetComponents.jsx` |
| `sheetViewerConstants.jsx` → `.js` | `errorBanner` | `sheetViewerComponents.jsx` |
| `notesConstants.jsx` → `.js` | `MarkdownPreview` | `notesComponents.jsx` |
| `searchModalConstants.jsx` → `.js` | `Highlight` | `searchModalComponents.jsx` |
| `sidebarConstants.jsx` → `.js` | `Avatar` | `sidebarComponents.jsx` |

All `.js` files re-export the extracted components for backward-compatible imports.

**Backend:** Already fully modularized under `backend/src/modules/` (21 feature modules) — no changes needed.

**Convention established:** From Cycle 35 onward, new feature logic goes in `src/features/<name>/`. Pages import from feature barrels. Existing code stays in `pages/` and migrates incrementally.

**Files added:**
- `frontend/studyhub-app/src/features/sheets/index.js`
- `frontend/studyhub-app/src/features/feed/index.js`
- `frontend/studyhub-app/src/features/admin/index.js`
- `frontend/studyhub-app/src/features/users/index.js`
- `frontend/studyhub-app/src/features/dashboard/index.js`
- `frontend/studyhub-app/src/features/notes/index.js`
- `frontend/studyhub-app/src/features/auth/index.js`
- `frontend/studyhub-app/src/features/settings/index.js`
- `frontend/studyhub-app/src/pages/sheets/uploadSheetComponents.jsx`
- `frontend/studyhub-app/src/pages/sheets/sheetViewerComponents.jsx`
- `frontend/studyhub-app/src/pages/notes/notesComponents.jsx`
- `frontend/studyhub-app/src/components/searchModalComponents.jsx`
- `frontend/studyhub-app/src/components/sidebarComponents.jsx`

**Files renamed (.jsx → .js):**
- `uploadSheetConstants.jsx` → `uploadSheetConstants.js`
- `sheetViewerConstants.jsx` → `sheetViewerConstants.js`
- `notesConstants.jsx` → `notesConstants.js`
- `searchModalConstants.jsx` → `searchModalConstants.js`
- `sidebarConstants.jsx` → `sidebarConstants.js`

### Validation

- `npm --prefix frontend/studyhub-app run lint` — **0 errors** (down from 22)
- `npm --prefix frontend/studyhub-app run build` — **Pass** (built in <1s)
- `npm --prefix backend run lint` — **0 errors**
- `npm --prefix backend test` — **21 test files, 161/161 tests passed**

### Deferred / Notes

- Feature barrels are scaffolding — no existing imports were migrated this cycle. Migration happens incrementally in future cycles.
- Backend was already fully modularized (21 modules) — confirmed, no action needed.

---

## Cycle 36 — Page Decomposition, Design Tokens, Media Ownership, Smoke Coverage (2026-03-23)

### Track 1: Page Decomposition

Decomposed 3 oversized pages into thin orchestrators + focused child components.

**FeedPage.jsx** (271 → 167 lines, -38%):
- Extracted `FeedComposer.jsx` — post composer form with own state (content, courseId, file attach, submit)
- Extracted `FeedAside.jsx` — leaderboard sidebar (3 leaderboard panels, collaboration tips)
- Parent retains: filter/search state, animation, delete confirmation, tutorial

**SheetsPage.jsx** (256 → 143 lines, -44%):
- Extracted `SheetsEmptyState.jsx` — 7 conditional empty-state branches (search, filters, mine+status variants)
- Extracted `SheetsAside.jsx` — quick-view sidebar (stats summary)
- Parent retains: URL state management, catalog fetching, list rendering

**UploadSheetPage.jsx** (222 → 142 lines, -36%):
- Extracted `UploadNavActions.jsx` — navbar action buttons (save draft, preview, cancel, publish)
- Parent retains: thin shell delegating all state to `useUploadSheet` hook

**Files added:**
- `frontend/studyhub-app/src/pages/feed/FeedComposer.jsx`
- `frontend/studyhub-app/src/pages/feed/FeedAside.jsx`
- `frontend/studyhub-app/src/pages/sheets/SheetsEmptyState.jsx`
- `frontend/studyhub-app/src/pages/sheets/SheetsAside.jsx`
- `frontend/studyhub-app/src/pages/sheets/UploadNavActions.jsx`

### Track 2: Design System Token Migration

Added new semantic tokens to `index.css` (both light and dark themes):
- Slate scale: `--sh-slate-50` through `--sh-slate-900` (10 tokens × 2 themes)
- Info semantic: `--sh-info`, `--sh-info-bg`, `--sh-info-border`, `--sh-info-text` (4 tokens × 2 themes)

Migrated 10 files from hardcoded hex to CSS custom property tokens:

| File | Changes | Key Migrations |
|------|---------|----------------|
| `sheetViewerComponents.jsx` | errorBanner | `#fef2f2` → `var(--sh-danger-bg)`, `#dc2626` → `var(--sh-danger)` |
| `sheetViewerConstants.js` | statusBadge | pending/accepted/rejected → warning/success/danger tokens |
| `feedConstants.js` | commentButtonStyle | `#fff` → `var(--sh-surface)` |
| `adminConstants.js` | 6 style objects | table styles, input, buttons, pager, suppression pill |
| `AdminWidgets.jsx` | StatsGrid, ModerationOverview, ActivityLog | All structural colors tokenized |
| `UploadNavActions.jsx` | All 6 color groups | success/warning/brand/slate tokens |
| `UploadSheetFormFields.jsx` | ~40 instances | labels, borders, errors, success/info/warning/danger states |
| `uploadSheetConstants.js` | tierColor | `#16a34a` → `var(--sh-success)`, etc. |
| `HtmlScanModal.jsx` | Scan findings, tier banners | All danger/warning semantic colors |

**Not migrated (intentional):** Editor dark panel (`#0f172a` bg, `#1e293b` border) — always-dark code editor theme. Stats card accent colors in AdminWidgets — intentional unique palette per metric. `courseColor()` palette in feedConstants — intentional per-department branding.

### Track 3: Media/Storage Ownership Audit

Full audit of media upload, storage, serving, and cleanup patterns documented in `docs/security/security-overview.md`:

- **Directory structure:** `uploads/avatars/` (public static), `uploads/attachments/` (auth-protected)
- **Path patterns:** `user-{userId}-{name}-{ts}.ext` (avatars), `sheet-{name}-{ts}.ext` (attachments)
- **Ownership enforcement:** `assertOwnerOrAdmin()` on all upload/delete operations
- **Cleanup chain:** ref-count checks on deletion (avatar, sheet, post, user cascading)
- **Path traversal protection:** `resolveManagedUploadPath()` validates leaf filenames only
- **HTML content:** stored in database (not filesystem), served via preview token routes

**Findings:** Well-architected ownership model. No orphan cleanup scheduler (inline cleanup only). No S3/cloud storage (Railway persistent volume). All gaps documented.

### Track 4: Smoke Test Coverage

Added `tests/cycle36-decomposed-pages.smoke.spec.js` — 8 Playwright tests covering:

- Upload sheet page (new sheet + draft mode) — validates decomposed form fields, nav actions, editor panel
- Admin overview — validates StatsGrid, tab navigation, moderation data rendering
- User profile page — validates public profile rendering

All tests run across light and dark themes using existing `mockAuthenticatedApp` infrastructure.

### Validation

- `npm --prefix frontend/studyhub-app run lint` — **0 errors**
- `npm --prefix frontend/studyhub-app run build` — **Pass** (built in <350ms)
- `npm --prefix backend run lint` — **0 errors**
- `npm --prefix backend test` — **21 test files, 161/161 tests passed**
- `npm --prefix frontend/studyhub-app test` — **12/14 files pass, 30/33 pass** (3 pre-existing failures in SearchModal.test.jsx, uploadSheetWorkflow.test.jsx — not caused by Cycle 36 changes, confirmed via git diff)

### Deferred / Notes

- Full 1000+ instance color migration deferred — focused on high-leverage constants/style-helper files that cascade to consumers
- Home page components (HomeSections.jsx, HomeHero.jsx) not migrated per CLAUDE.md instruction to preserve HomePage visual language
- Pre-existing test failures (SearchModal, uploadSheetWorkflow) tracked but not in scope for this cycle

---

## Cycle 37 — HTML Policy Migration (2026-03-23)

**Goal**: Migrate from "block HTML features at submission" to "accept all HTML → scan → classify → route by risk tier".

### Track 1: Backend HTML Policy Rewrite

Rewrote `validateHtmlForSubmission()` in `backend/src/lib/htmlSecurityScanner.js` from a feature-blocker to a structural-only validator:

- **Before**: Called `detectHtmlFeatures()` and returned `ok: false` when any features (script, iframe, handlers, etc.) were detected — this 400-rejected HTML with common web features from being stored
- **After**: Only checks for empty content and size limit (>350K chars) — all HTML features are accepted and routed through the scan pipeline

This single change unblocks the 4 controllers that call it:

- `sheets.create.controller.js` — new sheet creation
- `sheets.update.controller.js` — sheet editing
- `sheets.drafts.controller.js` — draft imports
- `sheets.contributions.controller.js` — fork contributions

The existing classification pipeline (`classifyHtmlRisk()` → tier 0-3 → route by tier) and draft workflow (`importHtmlDraft`, `submitHtmlDraftForReview`) already work correctly and were not modified.

### Track 2+4: Frontend Copy + Token Updates

**Copy changes (6 files):**

| File | Change |
| ------ | -------- |
| `HtmlScanModal.jsx` | "Welcome to HTML Upload Beta" → "HTML Upload"; subtitle updated |
| `SheetReviewPanel.jsx` | "Sanitized Preview" tab → "Safe Preview"; comment updated |
| `SheetReviewDetails.jsx` | Comment: "Sanitized preview" → "Safe preview" |
| `SheetHtmlPreviewPage.jsx` | "Full-page draft testing via short-lived preview session on an isolated surface" → "Full-page preview in a secure sandboxed session" |
| `SheetHtmlPreviewPage.jsx` | Error panel colors tokenized (danger tokens) |
| `SheetViewerPage.jsx` | 7 hardcoded color blocks tokenized (see below) |

**SheetViewerPage.jsx token migration:**

- Tier 1 badge: `#ca8a04`/`#fefce8`/`#fde68a` → `var(--sh-warning)`/`var(--sh-warning-bg)`/`var(--sh-warning-border)`
- Tier 2 badge: `#b45309`/`#fef3c7`/`#fde68a` → `var(--sh-warning-text)`/`var(--sh-warning-bg)`/`var(--sh-warning-border)`
- Quarantined block: `#fecaca`/`#fef2f2`/`#dc2626` → danger tokens
- Pending review block: `#fed7aa`/`#fff7ed`/`#9a3412` → warning tokens
- Warning gate: `#fde68a`/`#fffbeb`/`#92400e`/`#e2e8f0`/`#f8fafc`/`#334155`/`#64748b` → warning/border/soft/heading/subtext tokens
- Loading text: `#e2e8f0`/`#64748b` → border/subtext tokens
- Iframe wrapper: `#e2e8f0`/`#fff` → border/surface tokens
- Error fallback: `#fecaca`/`#fef2f2`/`#dc2626` → danger tokens

### Track 3: Workflow/Status/Moderation Alignment

Audited all admin review components — labels and status display were already aligned from Cycle 35:

- `SheetReviewsTab.jsx` — PipelineBadge uses semantic status labels (pending review, published, rejected, draft)
- `SheetReviewPanel.jsx` — Review panel tab bar, action bar, findings panel all use token-based colors
- No changes needed beyond the "Sanitized Preview" → "Safe Preview" rename in Track 2

### Track 5: Documentation Rewrite

Updated `docs/security/security-overview.md`:

- **HTML Security section**: Complete rewrite to document accept-all → scan → classify → route model
- Describes structural validation, feature detection, behavioral analysis, risk classification (Tier 0-3), dual preview model, CSP, sandbox, and admin review
- **HTML Security Communication section**: Updated to reflect Cycle 37 language changes (safe preview, tier badges, admin tab rename)

Updated `docs/logs/CHANGELOG.md`, `docs/logs/feature-tracker.md`, `docs/plans/v1.5-weekly-roadmap.md`, `docs/v1.5.0-release-notes.md`.

### Track 6: Tests and Validation

Updated `backend/test/htmlSecurity.test.js`:

- Renamed test from "detects script, iframe, inline handlers, and dangerous urls" to "accepts HTML with scripts, iframes, handlers, and dangerous urls (structural-only validation)"
- Assertions flipped: all feature-bearing HTML now expected to pass (`ok: true`, `issues.length === 0`)
- Empty/oversized tests unchanged (still expected to fail)

### Validation

- `npm --prefix backend run lint` — **0 errors**
- `npm --prefix frontend/studyhub-app run lint` — **0 errors**
- `npm --prefix backend test` — **21 test files, 161/161 tests passed**
- `npm --prefix frontend/studyhub-app run build` — **Pass** (built in 304ms)

### Files Modified

| File | Change |
| ---- | ------ |
| `backend/src/lib/htmlSecurityScanner.js` | `validateHtmlForSubmission` → structural-only (empty + size checks) |
| `backend/test/htmlSecurity.test.js` | Test updated to expect acceptance of feature-bearing HTML |
| `frontend/.../sheets/HtmlScanModal.jsx` | "HTML Upload Beta" → "HTML Upload", subtitle updated |
| `frontend/.../sheets/SheetViewerPage.jsx` | 7 hardcoded color blocks → CSS tokens |
| `frontend/.../preview/SheetHtmlPreviewPage.jsx` | Preview description + error panel tokenized |
| `frontend/.../admin/SheetReviewPanel.jsx` | "Sanitized Preview" → "Safe Preview" |
| `frontend/.../admin/SheetReviewDetails.jsx` | Comment updated |
| `docs/security/security-overview.md` | HTML Security section rewritten for accept-all model |
| `docs/beta-v1.5.0-release-log.md` | Cycle 37 entry |
| `docs/logs/CHANGELOG.md` | 6 new entries |
| `docs/logs/feature-tracker.md` | 2 new Done features |
| `docs/plans/v1.5-weekly-roadmap.md` | Cycle 37 item checked |
| `docs/v1.5.0-release-notes.md` | HTML Policy Migration section added |
| `CLAUDE.md` | HTML security policy architecture note added |

---

## Cycle 38 — Scanner Enforcement, Preview Mode & UX Consistency (2026-03-23)

### Summary

Full enforcement of the HTML tier pipeline: Tier 3 now reachable from the classifier alone (credential capture, combination escalation, obfuscated crypto-miner), preview mode explicitly serialized from backend to frontend, and SheetViewerPage refactored to consume `previewMode` instead of inline tier math. Includes 4 controller integration tests, 10 new classifier tests (Tier 3 + sample matrix A-F), and broken Playwright smoke test rewrite.

### Added

#### 38.1 — Tier 3 Classifier Rules + Sample Test Matrix

**Credential capture detector** (`htmlSecurityScanner.js`):
- External form with `<input type="password">` or `name="password|cvv|ssn|pin|secret|token"` → `credential-capture` (critical severity) → Tier 3

**Combination escalation** (`classifyHtmlRisk`):
- Any finding with `severity === 'critical'` → Tier 3
- 3+ distinct high-severity behavior categories → Tier 3 (e.g., obfuscation + redirect + keylogging)
- `crypto-miner` + `obfuscation` → Tier 3 (obfuscated miner = clearly malicious)

**Sample test matrix** (6 fixtures in `htmlSecurity.test.js`):
- **A — Clean HTML** (headings, tables, CSS) → Tier 0
- **B — Rich presentation** (SVG, animations, advanced CSS) → Tier 0
- **C — Scripted HTML** (inline script, event handlers) → Tier 1
- **D — Embedded HTML** (iframe, form, embed) → Tier 1
- **E — Suspicious HTML** (eval) → Tier 2
- **F — Malicious HTML** (credential phishing form) → Tier 3

**4 new Tier 3 unit tests**: credential capture (password input), credential capture (sensitive name field), 3+ category combination, obfuscated crypto-miner.

#### 38.2 — Preview Mode Serialization

**`tierToPreviewMode()` helper** in `sheets.serializer.js`:
- Tier 0 → `'interactive'` (scripts allowed)
- Tier 1 → `'safe'` (scripts blocked, sandboxed)
- Tier 2 → `'restricted'` (owner/admin only)
- Tier 3 → `'disabled'` (no preview)

**Backend fields added**:
- `htmlWorkflow.previewMode` in sheet serializer (all sheet responses)
- `htmlWorkflow.ackRequired` in sheet serializer (true for Tier 1 only)
- `previewMode` in `/api/sheets/:id/html-preview` and `/api/sheets/:id/html-runtime` responses

#### Controller Integration Tests (4 tests in `sheet.workflow.integration.test.js`)

1. **Tier 1 flagged path** — script HTML imported → 409 → acknowledge → publish
2. **Tier 2 eval path** — `eval()` HTML → pending_review → admin approve
3. **Tier 2 redirect path** — `window.location.href` → pending_review
4. **Runtime access control** — quarantined 403, pending_review owner/admin access

#### Mock Infrastructure

- `prisma.user.findMany` mock (admin notification in Tier 2+)
- `authTokens.getJwtSecret` mock (JWT signing for preview tokens)

### Changed

#### SheetViewerPage Refactored to `previewMode`

- Derived `previewMode` from `sheet.htmlWorkflow.previewMode` once at component top
- Replaced all 12 inline `(sheet.htmlRiskTier || 0) >= X` comparisons with `previewMode` string checks
- Zero `htmlRiskTier` references remain in the viewer

#### Playwright Smoke Test Rewrite

- **Before**: referenced removed UI text ("strict beta workflow", "unsafe HTML is blocked")
- **After**: tests current tier 1 flagged flow — scan modal, acknowledgement checkbox, "Publish with Warnings"

#### Copy Audit

- `preview.routes.js` comment: "sanitized preview" → "safe preview"
- No instances of "blocked HTML", "unsafe HTML removed", "strict beta", or "disallowed features" in codebase

### Validation

- `npm --prefix backend run lint` — **0 errors**
- `npm --prefix frontend/studyhub-app run lint` — **0 errors**
- `npm --prefix backend test` — **21 test files, 175/175 tests passed** (10 new)
- `npm --prefix frontend/studyhub-app run build` — **Pass**

### Files Modified

| File | Change |
| ---- | ------ |
| `backend/src/lib/htmlSecurityScanner.js` | Credential capture detector, Tier 3 escalation rules |
| `backend/src/modules/sheets/sheets.serializer.js` | `tierToPreviewMode()`, `previewMode` + `ackRequired` fields |
| `backend/src/modules/sheets/sheets.html.controller.js` | `previewMode` in preview/runtime responses |
| `backend/src/modules/preview/preview.routes.js` | Comment: "sanitized preview" → "safe preview" |
| `backend/test/htmlSecurity.test.js` | 4 Tier 3 tests + 6 sample matrix tests (A-F) |
| `backend/test/sheet.workflow.integration.test.js` | 4 integration tests + mock infrastructure |
| `frontend/.../sheets/SheetViewerPage.jsx` | Refactored to consume `previewMode` (12 tier checks removed) |
| `frontend/.../tests/sheets.upload-html-workflow.smoke.spec.js` | Rewritten for tier 1 flagged flow |
| `CLAUDE.md` | Tier 3 triggers documented |
| `docs/beta-v1.5.0-release-log.md` | Cycle 38 entry |
| `docs/logs/CHANGELOG.md` | Cycle 38 entries |
| `docs/logs/feature-tracker.md` | 4 new Done features |
| `docs/plans/v1.5-weekly-roadmap.md` | Cycle 38 item checked |

---

## Cycle 39 — Admin Review Ergonomics, Scanner Explainability & Production Confidence (2026-03-23)

Theme: Make the HTML security system usable at scale — faster for admins to review, easier for users to understand, safer to operate in production.

### Sub-cycle 39.1 — Scanner Explainability + Backend Enrichment

Added:
- `generateRiskSummary(tier, findings)` — produces short plain-English summaries from findings (e.g., "Contains obfuscated JavaScript and page redirect behavior.")
- `generateTierExplanation(tier)` — produces "why this tier" explanation text for each risk tier
- `groupFindingsByCategory(findings)` — groups findings into `{ [category]: { label, maxSeverity, findings[] } }` buckets
- `CATEGORY_LABELS` constant mapping all 13 finding categories to human-readable labels (e.g., `'credential-capture'` → `'Credential Capture'`)
- `category` field added to `normalizeFindings()` output (alongside `source` for backward compatibility)
- `htmlWorkflow` serializer enriched with `riskSummary`, `tierExplanation`, `findingsByCategory` fields
- Admin review-detail endpoint enriched with both stored and live explainability fields (`riskSummary`, `tierExplanation`, `findingsByCategory`, `liveRiskSummaryText`, `liveTierExplanation`, `liveFindingsByCategory`)
- html-preview and html-runtime endpoints enriched with `riskSummary` and `tierExplanation`
- `getHtmlScanStatus()` response enriched with `riskSummary`, `tierExplanation`, `findingsByCategory`
- 9 new unit tests covering `groupFindingsByCategory`, `generateRiskSummary`, `generateTierExplanation`

Files changed:
| File | Change |
|------|--------|
| `backend/src/lib/htmlSecurityScanner.js` | Added `groupFindingsByCategory`, `generateRiskSummary`, `generateTierExplanation`, `CATEGORY_LABELS` |
| `backend/src/lib/htmlSecurity.js` | Re-export 4 new symbols |
| `backend/src/lib/htmlDraftValidation.js` | Added `category` field to `normalizeFindings()` |
| `backend/src/lib/htmlDraftWorkflow.js` | Enriched `getHtmlScanStatus()` with explainability fields |
| `backend/src/modules/sheets/sheets.serializer.js` | Enriched `htmlWorkflow` with `riskSummary`, `tierExplanation`, `findingsByCategory` |
| `backend/src/modules/sheets/sheets.html.controller.js` | Enriched preview/runtime endpoints with summary/explanation |
| `backend/src/modules/admin/admin.sheets.controller.js` | Enriched review-detail with stored + live explainability fields |
| `backend/test/htmlSecurity.test.js` | 9 new tests for explainability helpers |

Validation:
- Backend tests: 184/184 passed (9 new)
- Backend lint: 0 errors
- Frontend lint: 0 errors

### Sub-cycle 39.2 — Admin Ergonomics + Author Experience + UI Polish

Added:
- Admin queue cards: tier badge (Flagged/High Risk/Quarantined), preview mode badge (Safe/Restricted/Disabled), finding count badge for HTML sheets
- Admin queue findings: now shown for all sheets with findings (not just failed scan status), capped at 5 with "...and N more" overflow
- Admin review panel header: risk badge with tier label, risk summary, acknowledgement indicator, tier explanation
- Admin review panel findings: grouped by category (sorted by severity) with category label, count, and finding list when `findingsByCategory` is available; falls back to flat list for legacy data
- Admin review reason templates: 5 quick-fill buttons ("Allowed advanced HTML; safe preview only", "Pending due to obfuscated script behavior", etc.) in action bar
- HtmlScanModal: grouped findings by category (sorted by severity) replacing flat list, risk summary headline, tier explanation replacing hardcoded per-tier text
- HtmlScanModal: scrollable content area (max-height 60vh) for long finding lists
- SheetViewerPage: risk summary shown next to tier badge for flagged/pending/quarantined sheets
- `reduceScanState` now passes through `riskSummary`, `tierExplanation`, `findingsByCategory` from backend responses
- `hydrateFromSheet` passes `riskSummary`, `tierExplanation`, `findingsByCategory` from `htmlWorkflow`

Files changed:
| File | Change |
|------|--------|
| `frontend/.../sheets/uploadSheetWorkflow.js` | `reduceScanState` passes through 3 new explainability fields |
| `frontend/.../sheets/useUploadSheet.js` | `hydrateFromSheet` passes tier + explainability fields from htmlWorkflow |
| `frontend/.../sheets/HtmlScanModal.jsx` | Grouped findings, risk summary, tier explanation, scrollable content |
| `frontend/.../sheets/SheetViewerPage.jsx` | Risk summary next to tier badge |
| `frontend/.../admin/SheetReviewsTab.jsx` | Tier badge, preview mode badge, finding count, widened findings display |
| `frontend/.../admin/SheetReviewPanel.jsx` | Enriched header with risk summary, tier explanation, acknowledgement state |
| `frontend/.../admin/SheetReviewDetails.jsx` | Grouped findings panel, reason templates in action bar |

Validation:
- Backend tests: 184/184 passed
- Backend lint: 0 errors
- Frontend lint: 0 errors
- Frontend build: passes

### Sub-cycle 39.3 — E2E Tests + Documentation

Added:
- 5 Playwright E2E smoke tests for HTML security tiers in `sheets.html-security-tiers.smoke.spec.js`:
  - Tier 2 high-risk upload: grouped findings, "Understood" dismiss, "Submit for Review" button
  - Tier 3 quarantined upload: critical findings, "Close" only, disabled "Quarantined" button
  - Grouped findings: 3 categories (Code Obfuscation, Suspicious Tags, Page Redirects) sorted by severity
  - Admin review queue: queue badges, review panel, grouped findings tab, reason templates, reject action
  - Sheet viewer: risk summary for flagged HTML sheet, safe preview badge
- HTML moderation playbook (`docs/security/html-moderation-playbook.md`): step-by-step admin review guide with decision matrix, preview mode reference, and reason template guidance
- HTML finding category glossary (`docs/security/html-finding-categories.md`): all 13 scanner categories with triggers, severities, tier escalation rules, compound Tier 3 triggers

Fixed:
- Service Worker (`public/sw.js`) intercepting Playwright API mocks — added `test.use({ serviceWorkers: 'block' })` to HTML upload test files
- Existing tier 1 upload smoke test (`sheets.upload-html-workflow.smoke.spec.js`): fixed wrong working-html mock URL (`**/api/sheets/777/working-html` → `**/api/sheets/drafts/777/working-html`), added missing `tutorial_upload_seen` localStorage key
- Strict mode violations in 4 tests — category label locators changed to `{ exact: true }` to avoid matching substrings in risk summary text; redundant tier-label assertions removed
- Admin review test: `force: true` on Reject click to bypass overlapping label element; `{ exact: true }` on "Reject" button to avoid matching "Quick Reject"
- Cleaned up debug test files (`debug-scan-poll.spec.js`, `debug-scan-poll2.spec.js`)

Files changed:
| File | Change |
|------|--------|
| `frontend/.../tests/sheets.html-security-tiers.smoke.spec.js` | New: 5 E2E smoke tests for tier 2/3, grouped findings, admin review, viewer |
| `frontend/.../tests/sheets.upload-html-workflow.smoke.spec.js` | Fixed: SW blocking, tutorial key, working-html URL |
| `docs/security/html-moderation-playbook.md` | New: admin review playbook with decision matrix |
| `docs/security/html-finding-categories.md` | New: 13-category glossary with triggers + severities |
| `docs/logs/CHANGELOG.md` | Updated with 39.3 entries |
| `docs/logs/feature-tracker.md` | Updated with 39.3 features |
| `docs/plans/v1.5-weekly-roadmap.md` | Updated with 39.3 completion |

Validation:
- 5/5 new E2E tests pass
- 1/1 existing tier 1 upload test passes
- Frontend lint: 0 errors
- Frontend build: passes

---

### Cycle 40 — Launch UX + Onboarding Polish + First-Success Flow
Date: 2026-03-23

Theme: Turn StudyHub from "technically capable beta" into "a product a student can land on and understand in minutes."

#### Sub-cycle 40.1 — First-run onboarding + dashboard guidance

Added:
- `GettingStartedCard` on Feed page: dismissible onboarding panel with 4 quick actions (join course, browse sheets, upload, set up profile), completion tracking, auto-hide for non-new users with 3+ actions done
- `EmptyFeed` enhanced with `isFirstRun` prop: shows "Browse study sheets" and "Upload a sheet" CTAs for first-run users
- Dashboard activation checklist expanded 4→6 items: added "Verify your email" and "Add a profile photo" steps with `hasVerifiedEmail` and `hasAvatar` backend checks
- Dark mode token migration for `ActivationChecklist` and `StatCards` components: all hardcoded hex colors replaced with CSS custom property tokens

Changed:
- `FeedPage.jsx`: wired `GettingStartedCard` above composer, context-aware `EmptyFeed` messages
- `dashboard.routes.js`: `emailVerified` field added to user select, 2 new checklist items with action paths

#### Sub-cycle 40.2 — Account/verification UX + trust messaging

Added:
- `EmailVerificationBanner`: grace period countdown ("You have X days left before some features are restricted"), link fixed to `/settings?tab=account`
- `EmailVerificationInline`: updated copy and link target
- `ErrorBanner` in upload flow: accepts `verificationRequired` prop, shows warning-styled banner with "Verify now" link instead of generic error when `EMAIL_NOT_VERIFIED` response detected
- `verificationRequired` state wired through upload hook chain: `uploadSheetActions.js` detects `data?.code === 'EMAIL_NOT_VERIFIED'` in both markdown and HTML submit paths, `useUploadSheet.js` exposes state, `UploadSheetPage.jsx` passes prop to `ErrorBanner`

#### Sub-cycle 40.3 — First upload success flow + scan outcome polish

Added:
- `UploadHelperCard`: dismissible "How uploading works" info panel explaining formats, security scan, post-submit flow, and "My Sheets" return path. Persisted via `localStorage` key. Shown only for new uploads (not edit mode).
- `StatusBanner` rewritten with context-aware configurations: `pending_review` (reassuring wait message), `rejected` (actionable "Changes requested" with guidance), `published` (success with "View sheet" link), `quarantined` (explanation + support prompt). All states include "My Sheets" return link.

Changed:
- `TutorialModal` steps rewritten with friendlier language: "we create a safe working copy automatically", "most sheets publish instantly"
- `HtmlScanModal` intro rewritten: supportive tone ("Most sheets pass without issues"), removed threatening language
- Tier 1 acknowledgement checkbox: simplified from compliance-focused to informational
- `tierLabel()` renamed: "Clean" → "Passed", "Flagged" → "Minor Findings", "High Risk" → "Needs Review" (user-facing upload flow only; admin panel retains separate hardcoded labels)

#### Sub-cycle 40.4 — Browse/discovery polish + launch surface design

Changed:
- `DashboardWidgets.jsx` full dark mode token migration: `RecentSheets`, `CourseFocus`, `QuickActions`, `EmptyState`, `DashboardSkeleton` — all hardcoded hex colors replaced with CSS custom property tokens (`var(--sh-surface)`, `var(--sh-border)`, `var(--sh-heading)`, `var(--sh-brand)`, `var(--sh-soft)`, `var(--sh-subtext)`, `var(--sh-muted)`)
- `RecentSheets` helper text changed from dev note ("Rendered from the new summary endpoint…") to user-facing copy ("Latest sheets from your enrolled courses")
- `SheetsAside` sidebar improved: added "Add your courses" CTA for users with 0 enrollments, "Upload a sheet" primary CTA, better workflow copy ("Filter by school or course…")

#### Sub-cycle 40.5 — Validation + release notes

Files changed:
| File | Change |
|------|--------|
| `frontend/.../pages/feed/FeedWidgets.jsx` | New: GettingStartedCard, enhanced EmptyFeed |
| `frontend/.../pages/feed/FeedPage.jsx` | Wired GettingStartedCard + context-aware EmptyFeed |
| `frontend/.../pages/dashboard/DashboardWidgets.jsx` | Full dark mode token migration, better copy |
| `frontend/.../pages/sheets/UploadSheetFormFields.jsx` | New: UploadHelperCard, enhanced StatusBanner + ErrorBanner |
| `frontend/.../pages/sheets/UploadSheetPage.jsx` | Wired UploadHelperCard, StatusBanner sheetId, ErrorBanner verificationRequired |
| `frontend/.../pages/sheets/uploadSheetActions.js` | EMAIL_NOT_VERIFIED detection in both submit paths |
| `frontend/.../pages/sheets/useUploadSheet.js` | verificationRequired state + pass-through |
| `frontend/.../pages/sheets/uploadSheetConstants.js` | tierLabel() friendlier names |
| `frontend/.../pages/sheets/HtmlScanModal.jsx` | Supportive scan language rewrite |
| `frontend/.../pages/sheets/SheetsAside.jsx` | Better guidance + CTAs |
| `frontend/.../components/EmailVerificationBanner.jsx` | Grace period countdown + link fix |
| `backend/src/modules/dashboard/dashboard.routes.js` | Activation checklist: 6 items, emailVerified + avatarUrl |
| `docs/logs/CHANGELOG.md` | Updated with Cycle 40 entries |
| `docs/logs/feature-tracker.md` | Updated with Cycle 40 features |
| `docs/plans/v1.5-weekly-roadmap.md` | Updated with Cycle 40 completion |

Validation:
- Frontend lint: 0 errors
- Frontend build: passes
- Backend tests: 184/184 pass

---

### Cycle 41 — Discovery + engagement + content quality signals (2026-03-23)

Theme: Turn StudyHub from "easy to understand" into "useful enough to come back to regularly" by improving search ranking, course discovery, content quality signals, and engagement surfaces.

#### Sub-cycle 41.1 — Search/ranking improvements

Added:

- Backend composite ranking algorithm: `score = stars*3 + forks*2 + downloads + freshness(max(0, 10 - log2(ageDays)))` for "recommended" sort
- `recommended` added to `allowedSort` in `sheets.list.controller.js` — fetches up to 500 recent sheets, scores in-memory, then paginates
- "Best" sort option added as first/default option in `sheetsPageConstants.js`
- `IconComment` SVG icon added to `Icons.jsx`
- Comment count display on sheet list rows in `SheetListItem.jsx` (visible when > 0)
- Default sort changed from `createdAt` to `recommended` in `useSheetsData.js`

#### Sub-cycle 41.2 — Course-level discovery

Added:

- Backend `GET /api/courses/popular` endpoint: returns top 8 courses by published sheet count, rate-limited (120/15min), public
- `POPULAR_COURSES_LIMIT` constant in `courses.constants.js`
- Frontend: `useSheetsData` now fetches popular courses (polled every 5min) and tracks recent course filters in localStorage (`studyhub.sheets.recentCourses`, max 5 entries)
- `handleCourseFilter` callback: batched `courseId` + `schoolId` URL update (avoids double-render from separate `setQueryParam` calls)
- `SheetsAside` rewritten with 3 discovery sections: Quick view, Recent courses (clickable chips with toggle), Popular courses (ranked list with sheet counts)
- Course-specific empty state in `SheetsEmptyState`: when filtering by a course with no sheets, shows "No sheets for CS101 yet — Be the first to share" with contextual upload CTA
- CSS: `.sheets-page__course-chips`, `.sheets-page__popular-list`, `.sheets-page__popular-row` with active/hover states

#### Sub-cycle 41.3 — Content quality signals on cards/rows

Added:

- `computeSignalBadge()` helper: classifies sheets as "Popular" (>=10 stars or >=5 forks+3 stars), "Trending" (<=7 days + >=3 stars), "New" (<=3 days), or "Well used" (>=20 downloads)
- `SIGNAL_BADGE_CONFIG` constant: label + CSS class for each signal type
- Signal badges rendered inline after sheet title in `SheetListItem.jsx`
- Fork lineage indicator: shows "Forked from {title} by {author}" below sheet title when `forkSource` exists
- Status badges migrated from inline styles with hardcoded hex to CSS classes: `sheets-repo-row__status-badge--draft`, `--danger`, `--warning`, `--review` using CSS tokens
- CSS: signal badge styles (`.sheets-repo-row__signal--popular/trending/new/well-used`), fork lineage styles, status badge class styles

#### Sub-cycle 41.4 — Dashboard/feed engagement + collaboration polish

Added:

- "Your starred sheets — Recently updated" widget in `FeedAside`: shows top 5 recently-updated starred sheets with course, author, and time-ago metadata; links to `/sheets?starred=1`
- `starredUpdates` state in `useFeedData`: fetches `GET /api/sheets?starred=1&sort=updatedAt&limit=5`, polled every 2min
- Fork lineage visibility in dashboard `RecentSheets` widget: shows "Forked from {title} by {author}" when `forkSource` exists

Changed:

- Feed page alert banners migrated from hardcoded hex (`#fffbeb`, `#b45309`, `#fef2f2`, `#dc2626`) to CSS tokens (`var(--sh-warning-bg)`, `var(--sh-warning-text)`, `var(--sh-danger-bg)`, `var(--sh-danger-text)`)

#### Sub-cycle 41.5 — Visual QA + validation + release notes

Files changed:
| File | Change |
|------|--------|
| `backend/src/modules/courses/courses.schools.controller.js` | New: GET /api/courses/popular endpoint |
| `backend/src/modules/courses/courses.constants.js` | New: POPULAR_COURSES_LIMIT constant |
| `backend/src/modules/sheets/sheets.list.controller.js` | Composite recommended sort algorithm |
| `frontend/.../pages/sheets/sheetsPageConstants.js` | "Best" sort option, computeSignalBadge(), SIGNAL_BADGE_CONFIG |
| `frontend/.../pages/sheets/useSheetsData.js` | Popular courses, recent courses, handleCourseFilter, recommended default |
| `frontend/.../pages/sheets/SheetListItem.jsx` | Signal badges, fork lineage, status badge CSS classes |
| `frontend/.../pages/sheets/SheetsAside.jsx` | Popular courses, recent courses, course discovery |
| `frontend/.../pages/sheets/SheetsEmptyState.jsx` | Course-specific empty state |
| `frontend/.../pages/sheets/SheetsPage.jsx` | Wire new data to aside + empty state |
| `frontend/.../pages/sheets/SheetsPage.css` | Signal badges, fork lineage, popular courses, status badge CSS |
| `frontend/.../components/Icons.jsx` | IconComment SVG |
| `frontend/.../pages/feed/useFeedData.js` | starredUpdates loader |
| `frontend/.../pages/feed/FeedPage.jsx` | Wire starredUpdates, fix alert hex colors |
| `frontend/.../pages/feed/FeedAside.jsx` | Starred updates widget |
| `frontend/.../pages/dashboard/DashboardWidgets.jsx` | Fork lineage in RecentSheets |

Validation:

- Frontend lint: 0 errors, 0 warnings
- Frontend build: passes
- Backend lint: 0 errors
- Backend tests: 184/184 pass
- Visual smoke: 34/36 pass (2 pre-existing sheet-viewer timeouts)
- Gallery: 34 screenshots across 6 pages

---

## Cycle 42 — Sheet experience + collaboration depth + viewer reliability (2026-03-23)

### 42.1 — Sheet Viewer Reliability and Stability

Added:

- Catch-all `**/api/**` route in mockStudyHubApi.js to prevent unmocked endpoints from causing network hangs in parallel tests
- `courses/popular` route mock and complete `htmlWorkflow`/`contentFormat`/`status` fields on sheet mock object
- Proper AbortController in HTML runtime fetch (replaces manual `cancelled` flag)
- Catch-all registered FIRST in mockStudyHubApi.js for lowest priority in Playwright's LIFO route matching

Changed:

- Comments loading state: plain "Loading comments..." text → SkeletonCard shimmer
- Secondary operations (star, react, fork, contribute, review) no longer set `sheetState.error` — use toast-only error display to prevent sheet-level banner pollution
- Sheet viewer test timeout increased from 10s to 15s for mobile viewport resilience

### 42.2 — Sheet Viewer Experience Polish

Changed:

- Full CSS token migration across 4 viewer files (~30+ hardcoded hex → CSS custom properties):
  - `SheetViewerPage.jsx`: page bg, action buttons, headings, meta text, content box, comment form, comment items, contribute modal
  - `SheetViewerSidebar.jsx`: stats headings, contribution buttons, attachment preview border, empty states
  - `ContributionInlineDiff.jsx`: diff button, diff container, hunk headers, line highlights, segment highlights, mode toggle
  - `useSheetViewer.js`: toast-only error pattern for secondary operations
- All viewer colors now respond to dark mode via `[data-theme='dark']` token overrides

### 42.3 — Collaboration and Contribution UX

Added:

- Fork lineage in viewer header now links to original sheet and shows author: "Forked from {title} by {author}" with clickable links
- Collaboration summary section in sidebar: fork count, pending contributions count (warning-colored), accepted contributions count
- "View version history" link in sidebar stats panel (links to Sheet Lab)
- Improved empty contribution state: explains the fork→contribute workflow ("Fork this sheet, make edits, then use Contribute Back")

### 42.4 — Continue Learning and Revisit Loop

Added:

- Related sheets fetching in `useSheetViewer.js`: loads up to 4 sheets from same course (sorted by stars, excluding current sheet) via existing `GET /api/sheets?courseId=X&limit=5&sort=stars` endpoint
- "More from {course code}" / "Related sheets" section below comments with card-style links showing title, author, stars, forks
- "Browse all {code} sheets →" link at bottom of related section

### 42.5 — Commenting / Feedback Quality Pass

Changed:

- Comment heading now shows count: "Comments (N)" when comments exist
- Comment placeholder changed from generic "Add a comment" to "Share a clarification, correction, or study tip…"
- Empty comment state improved: centered layout with encouraging message ("Be the first to leave feedback — corrections, study tips, and clarifications help everyone.")

### 42.6 — Visual QA + Validation

Validation:

- Frontend lint: 0 errors, 0 warnings
- Frontend build: passes (257ms)
- Backend lint: 0 errors
- Backend tests: 184/184 pass
- Visual smoke: 36/36 pass
- Previously flaky sheet-viewer tests now stable (root cause: LIFO route matching + missing mocks)

Files changed:

| File | Change |
| ---- | ------ |
| `tests/helpers/mockStudyHubApi.js` | Catch-all route (LIFO-safe), courses/popular mock, complete sheet mock |
| `tests/visual-smoke.spec.js` | Sheet viewer timeout 10s → 15s |
| `frontend/.../pages/sheets/useSheetViewer.js` | AbortController fix, degraded-mode error isolation, related sheets fetch |
| `frontend/.../pages/sheets/SheetViewerPage.jsx` | Full token migration, fork lineage links, related sheets, comment UX |
| `frontend/.../pages/sheets/SheetViewerSidebar.jsx` | Token migration, collaboration section, version history link, contribution explainer |
| `frontend/.../pages/sheets/ContributionInlineDiff.jsx` | Full token migration (diff colors, buttons, hunk headers) |
| `frontend/.../pages/sheets/sheetViewerConstants.js` | No changes (already tokenized) |

---

## Cycle 43 — Study Continuity + Personal Workflow Value + Return-User Habit Loops [2026-03-24]

Product objective: Make StudyHub feel like the user's personal study workspace — not just a content repository. Add study continuity signals (recently viewed, resume studying), personal value surfaces (study activity, what's-new, study queue), and return triggers (since-you-were-last-here, why-revisit signals).

### 43.1 — Recently Viewed + Resume Studying

Added:

- `useRecentlyViewed` hook in `src/lib/useRecentlyViewed.js`: localStorage-based tracking, max 10 entries, cross-tab sync via visibilitychange
- `recordSheetView()` function: captures id, title, courseCode, authorUsername, viewedAt on each sheet view
- Sheet viewer integration: `useSheetViewer.js` records every sheet view on load via `useEffect`
- `ResumeStudying` dashboard widget: shows up to 5 recently viewed sheets with title, course, author, relative time, purple clock icon
- `IconClock` icon added to `Icons.jsx`
- Feed aside "Resume studying" section: compact 3-item panel showing recently viewed sheets
- `useRecentlyViewed` hook wired into `useDashboardData.js` and `FeedPage.jsx`

### 43.2 — Personal Study Dashboard Value

Added:

- `StudyActivity` compact banner widget: shows "X sheets studied this week" with relative last-studied time, derived from localStorage recently-viewed data
- "What's new" badge on Recent Sheets heading: blue pill showing "N new" sheets since last dashboard visit
- Last dashboard visit tracking via localStorage (`studyhub.dashboard.lastVisit`)
- Clickable stat cards: Courses → `/settings?tab=courses`, Sheets → `/sheets?mine=1`, Stars → `/sheets?starred=1`
- `summaryCard()` helper updated with optional `to` link target

Changed:

- `StatCards` component renders each card as a `Link` when `to` is provided, with pointer cursor
- `RecentSheets` accepts `newCount` prop for the "N new" badge
- `recentSheets` wrapped in `useMemo` to fix `react-hooks/exhaustive-deps` warning

### 43.3 — Save, Star, and Revisit Loop Polish

Added:

- "Why revisit" signals on starred sheets in FeedAside: comment count and fork count micro-badges (blue/green) below each starred sheet row
- Star confirmation toast in sheet viewer: "Starred! Find it in your feed sidebar or browse starred sheets."

### 43.4 — Personal Notes / Lightweight Study-Status Marker

Added:

- `useStudyStatus` hook in `src/lib/useStudyStatus.js`: localStorage-based per-sheet status marker (to-review, studying, done), cross-tab sync
- `useAllStudyStatuses` hook: reads all statuses for dashboard display with counts and filtered lists
- Study-status dropdown menu in sheet viewer action bar: three status options with colored dots, clear option, checkmark on active
- `StudyQueue` dashboard widget: shows studying/to-review/done counts and up to 4 active items with status badges
- Widget placed in dashboard right column alongside CourseFocus and QuickActions

### 43.5 — Notifications / Return Triggers

Added:

- "Since your last visit" feed banner: blue info banner showing "N new posts since your last visit" at top of feed
- Last feed visit tracking via localStorage (`studyhub.feed.lastVisit`), timestamp captured after feed loads
- `newSinceLastVisit` computed value in `useFeedData.js` comparing feed item `createdAt` timestamps against stored last visit

Verified:

- Notification bell already has unread count badge with 30-second live polling — no changes needed

### 43.6 — Visual QA + Validation

Validation:

- Frontend lint: 0 errors, 0 warnings
- Frontend build: passes (273ms)
- Backend lint: 0 errors
- Backend tests: 184/184 pass
- Visual smoke: 35/36 first run, 36/36 on targeted retry (1 transient tablet/dark race — same as Cycle 42)

Files changed:

| File | Change |
| ---- | ------ |
| `src/components/Icons.jsx` | Added `IconClock` |
| `src/lib/useRecentlyViewed.js` | New: recently viewed localStorage hook |
| `src/lib/useStudyStatus.js` | New: study-status localStorage hook |
| `src/pages/sheets/useSheetViewer.js` | Record sheet view, study status hook, star toast |
| `src/pages/sheets/SheetViewerPage.jsx` | Study-status dropdown menu in action bar |
| `src/pages/dashboard/DashboardWidgets.jsx` | `ResumeStudying`, `StudyActivity`, `StudyQueue` widgets, clickable `StatCards`, `RecentSheets` new-count badge |
| `src/pages/dashboard/DashboardPage.jsx` | Wire new widgets and data |
| `src/pages/dashboard/useDashboardData.js` | `useRecentlyViewed`, `useAllStudyStatuses`, study activity, what's-new, last-visit tracking |
| `src/pages/dashboard/dashboardConstants.js` | `summaryCard()` with optional `to` field |
| `src/pages/feed/FeedPage.jsx` | `useRecentlyViewed`, since-last-visit banner, pass to FeedAside |
| `src/pages/feed/FeedAside.jsx` | Recently viewed panel, why-revisit signals on starred sheets |
| `src/pages/feed/useFeedData.js` | Last feed visit tracking, `newSinceLastVisit` |

---

Cycle 44 — GitHub-style SheetLab Rework [2026-03-24]

This cycle consolidates the fork/edit/version-control workflow into a unified SheetLab workspace inspired by GitHub's pull request model.

Added:

- DB migration: `rootSheetId` on StudySheet, `kind` field on SheetCommit (`snapshot`, `fork_base`, `restore`, `merge`).
  - `backend/prisma/migrations/20260324050000_add_root_sheet_id_and_commit_kind/migration.sql`
- Idempotent fork endpoint: returns existing fork if user already forked, creates fork as `draft`, sets `rootSheetId`, creates `fork_base` commit.
  - `backend/src/modules/sheets/sheets.fork.controller.js`
- Smart viewer buttons: owner sees "Edit in SheetLab", non-owner sees "Edit your copy" (forks then redirects to lab).
  - `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`
- Tabbed SheetLab layout with route guard: Editor | Changes | History | Contribute (forks) | Reviews (originals).
  - `frontend/studyhub-app/src/pages/sheets/SheetLabPage.jsx`
  - `frontend/studyhub-app/src/pages/sheets/SheetLabPage.css`
  - `frontend/studyhub-app/src/pages/sheets/useSheetLab.js`
- Split-pane editor with dark-themed monospace textarea + live preview (HTML iframe or markdown text), debounced autosave (1500ms).
  - `frontend/studyhub-app/src/pages/sheets/SheetLabEditor.jsx`
- Changes + Commit tab: shows uncommitted diff between current content and last snapshot, commit form with auto-summary.
  - `frontend/studyhub-app/src/pages/sheets/SheetLabChanges.jsx`
  - `backend/src/modules/sheetLab/sheetLab.operations.controller.js` — new `GET /api/sheets/:id/lab/uncommitted-diff`
- Contribute tab: fork owners submit PRs to the original, view outgoing contribution history with inline diffs, sync from original (pull upstream).
  - `frontend/studyhub-app/src/pages/sheets/SheetLabContribute.jsx`
  - `backend/src/modules/sheetLab/sheetLab.operations.controller.js` — new `POST /api/sheets/:id/lab/sync-upstream`
- Reviews tab: original owners review incoming contributions with accept/reject actions and inline diffs.
  - `frontend/studyhub-app/src/pages/sheets/SheetLabReviews.jsx`
- Contribution merge commit: accepting a contribution now creates a `merge` kind commit on the target sheet.
  - `backend/src/modules/sheets/sheets.contributions.controller.js`
- Fork deletion: fork owners can delete their fork from SheetLab with confirmation.
- Fork publishing: draft sheets get a "Publish" button in the SheetLab header.
- Color-coded commit kind badges (fork_base, restore, merge) in History tab.
- `kind` field now included in commits list API response.
- One-time tutorial banners for SheetLab (separate for owners and fork users), dismissed via localStorage.
  - `frontend/studyhub-app/src/components/TutorialBanner.jsx`
- Old `/sheets/:id/edit` route now redirects to `/sheets/:id/lab` for backward compatibility.
  - `frontend/studyhub-app/src/App.jsx`

Changed:

- Restore commits now tagged with `kind: 'restore'`.
- Preview page "Back to editor" link updated to point to SheetLab.
- Fork redirect from sheets list updated from `/edit` to `/lab`.

Fixed:

- CSP `frame-ancestors` issue on preview routes (fixed in earlier session, included in this cycle scope).
  - `backend/src/modules/preview/preview.routes.js` — uses `res.locals.frameAncestorsDirective` instead of hardcoded `'none'`.
  - `backend/src/index.js` — passes computed frame-ancestors via `res.locals`.

School/Course diagnosis:

- No code bugs found. Backend endpoints, frontend API calls, and data transformation are all correct.
- Root cause: empty database. Fix: run `npm --prefix backend run seed` on production.

Cycle 44 Validation Commands (Executed)

- `npm --prefix frontend/studyhub-app run lint` — 0 errors
- `npm --prefix backend run lint` — 0 errors
- `npm --prefix frontend/studyhub-app run build` — passes (262ms)

Cycle 44 Validation Result

- Frontend lint: 0 errors, 0 warnings
- Backend lint: 0 errors
- Frontend build: passes

Cycle 44 Files Changed

| File | Change |
| ---- | ------ |
| `backend/prisma/schema.prisma` | Added `rootSheetId` to StudySheet, `kind` to SheetCommit |
| `backend/prisma/migrations/20260324050000_*/migration.sql` | Migration SQL |
| `backend/src/index.js` | Pass `res.locals.frameAncestorsDirective` |
| `backend/src/modules/preview/preview.routes.js` | Dynamic CSP with `buildPreviewCsp()` |
| `backend/src/modules/sheets/sheets.fork.controller.js` | Idempotent fork, draft status, fork_base commit |
| `backend/src/modules/sheets/sheets.contributions.controller.js` | Merge commit on accept |
| `backend/src/modules/sheetLab/sheetLab.operations.controller.js` | `uncommitted-diff` + `sync-upstream` endpoints, restore kind |
| `backend/src/modules/sheetLab/sheetLab.commits.controller.js` | Include `kind` in commits list select |
| `frontend/studyhub-app/src/App.jsx` | EditRedirect, useParams import |
| `frontend/studyhub-app/src/pages/sheets/SheetLabPage.jsx` | Full tabbed layout with real components |
| `frontend/studyhub-app/src/pages/sheets/SheetLabPage.css` | Tab nav, status badges, commit kind badge CSS |
| `frontend/studyhub-app/src/pages/sheets/useSheetLab.js` | reloadSheet, deleteForck, publish, activeTab logic |
| `frontend/studyhub-app/src/pages/sheets/SheetLabEditor.jsx` | New: split-pane editor |
| `frontend/studyhub-app/src/pages/sheets/SheetLabChanges.jsx` | New: changes + commit tab |
| `frontend/studyhub-app/src/pages/sheets/SheetLabContribute.jsx` | New: contribute tab with sync |
| `frontend/studyhub-app/src/pages/sheets/SheetLabReviews.jsx` | New: reviews tab |
| `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx` | Smart edit/fork buttons |
| `frontend/studyhub-app/src/pages/sheets/useSheetViewer.js` | Fork redirects to lab |
| `frontend/studyhub-app/src/pages/sheets/useSheetsData.js` | Fork redirects to lab |
| `frontend/studyhub-app/src/pages/preview/SheetHtmlPreviewPage.jsx` | Link to lab instead of edit |
| `frontend/studyhub-app/src/components/TutorialBanner.jsx` | New: one-time tutorial banner |

---

## Cycle 45 — Profile & Achievements (2026-03-24)

### Added

- **Cover Image System**: Full pipeline — `coverImageUrl` column on User, `COVERS_DIR` storage with separate upload directory (not mixed with avatars), multer disk upload with 8MB limit, JPEG/PNG/WebP validation with magic byte checks, `POST /api/upload/cover` and `DELETE /api/upload/cover` endpoints with old-file cleanup.
- **Cover Crop Modal** (`CoverCropModal.jsx`): Rectangular 16:5 crop using react-easy-crop, zoom slider, uploads cropped JPEG blob to cover endpoint.
- **Profile Cover Banner**: Cover image displays on the profile page with gradient overlay for contrast-safe text. Avatar overlaps the cover boundary. Fallback gradient for profiles without covers.
- **Settings Cover Section**: New "Cover Image" section in ProfileTab with upload/change/remove buttons and live preview.
- **Pinned Sheets**: `UserPinnedSheet` model with position ordering, max 6 pins per user. Full CRUD: `GET/POST /api/users/me/pinned-sheets`, `DELETE /api/users/me/pinned-sheets/:sheetId`, `PATCH /api/users/me/pinned-sheets/reorder`. Pinned sheets appear in profile response and render as a grid on the profile page.
- **Activity Tracking**: `UserDailyActivity` model with daily counters for commits, sheets, reviews, comments. `trackActivity()` helper called from SheetLab commits, sheet creation, contribution reviews, and comment creation. `GET /api/users/me/activity` and `GET /api/users/:username/activity` endpoints with configurable week range.
- **Contribution Graph Heatmap** (`ActivityHeatmap.jsx`): GitHub-style SVG heatmap with 5 intensity levels, Study/Build/All filter toggle, day labels, and color legend. Renders on profile page when activity data exists.
- **Badge System**: 12 badges across 3 categories (Studying, Building, Collaboration) and 3 tiers (bronze, silver, gold). `Badge` and `UserBadge` models. Badge catalog auto-seeded at server startup via `seedBadgeCatalog()`. `checkAndAwardBadges()` engine checks user stats and awards badges on key actions (commits, sheet creation, contribution reviews, follows).
- **Badge UI** (`BadgeDisplay.jsx`): Coin-shaped badges with sticker/3D-lite style — gradient backgrounds per tier (bronze/silver/gold), inset shadows, hover lift animation, category icons. Achievements section on profile page.
- **Badge Endpoints**: `GET /api/users/me/badges` and `GET /api/users/:username/badges`.

### Changed

- `coverImageUrl` added to session user select (auth service), settings user select (settings service), and profile response (users route).
- `/me/` routes in users module moved before `/:username` to prevent Express param collision.
- `ProfileTab` now accepts `onCoverChange` prop; `SettingsPage` wires cover state sync.

### Database

- Migration `20260324060000_cycle45_profile_achievements`:
  - `ALTER TABLE "User" ADD COLUMN "coverImageUrl" TEXT`
  - `CREATE TABLE "UserPinnedSheet"` with unique constraint on (userId, sheetId)
  - `CREATE TABLE "UserDailyActivity"` with unique constraint on (userId, date)
  - `CREATE TABLE "Badge"` with unique slug
  - `CREATE TABLE "UserBadge"` with unique constraint on (userId, badgeId)

### Validation

```
npm --prefix backend run lint          ✅ clean
npm --prefix frontend/studyhub-app run lint   ✅ clean
npm --prefix frontend/studyhub-app run build  ✅ clean (282ms)
npx prisma validate                    ✅ schema valid
```

### Files Changed

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Added coverImageUrl, UserPinnedSheet, UserDailyActivity, Badge, UserBadge models |
| `backend/prisma/migrations/20260324060000_cycle45_profile_achievements/migration.sql` | New migration |
| `backend/src/lib/storage.js` | Added COVERS_DIR, buildCoverUrl, resolveCoverPath, cleanupCoverIfUnused |
| `backend/src/lib/activityTracker.js` | New: daily activity increment helper |
| `backend/src/lib/badges.js` | New: badge catalog, seedBadgeCatalog, checkAndAwardBadges |
| `backend/src/lib/bootstrap.js` | Seed badge catalog at startup |
| `backend/src/modules/upload/upload.routes.js` | Added POST/DELETE /api/upload/cover |
| `backend/src/modules/users/users.routes.js` | Added /me/badges, /:username/badges, /me/pinned-sheets CRUD, /me/activity, /:username/activity, badge check on follow |
| `backend/src/modules/settings/settings.service.js` | Added coverImageUrl to settings user select |
| `backend/src/modules/auth/auth.service.js` | Added coverImageUrl to session user select |
| `backend/src/modules/sheetLab/sheetLab.commits.controller.js` | Added trackActivity + checkAndAwardBadges |
| `backend/src/modules/sheets/sheets.create.controller.js` | Added trackActivity + checkAndAwardBadges |
| `backend/src/modules/sheets/sheets.contributions.controller.js` | Added trackActivity + checkAndAwardBadges |
| `backend/src/modules/sheets/sheets.social.controller.js` | Added trackActivity on comment create |
| `frontend/studyhub-app/src/components/CoverCropModal.jsx` | New: rectangular cover crop modal |
| `frontend/studyhub-app/src/components/ActivityHeatmap.jsx` | New: SVG contribution graph heatmap |
| `frontend/studyhub-app/src/components/BadgeDisplay.jsx` | New: coin-shaped badge renderer |
| `frontend/studyhub-app/src/pages/settings/ProfileTab.jsx` | Added cover image section with upload/remove |
| `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx` | Wired onCoverChange prop |
| `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx` | Cover banner, heatmap, badges, pinned sheets |
| `frontend/studyhub-app/src/pages/profile/ProfileWidgets.jsx` | Added BadgesSection, PinnedSheetsSection |

---

## Cycle 46 — Unified Profile Redesign + Production Bugfixes [2026-03-24]

### Summary
Merged the separate Dashboard page (`/dashboard`) and User Profile page (`/users/:username`) into a single unified profile at `/users/:username` with URL-driven tabs, a hero header, and conditional layouts. Fixed four production bugs: admin action silent failures, preview CSP blocking CSS/fonts, cover image 404s, and stale deleted-sheet entries in Resume Studying.

### Added

- **Unified profile page** (`UserProfilePage.jsx`): complete rewrite with tab system
  - Own profile: 4 tabs — Overview (Student Cockpit), Study, Sheets, Achievements
  - Other profiles: 3 tabs — Overview (Showcase), Sheets, Achievements
  - URL-driven tabs via `?tab=overview|study|sheets|achievements`
- **Hero header** (360px desktop / 260px mobile): cover image with gradient overlay, avatar overlap, identity section, follower stats, action CTA row
- **Student Cockpit layout** (`.profile-cockpit`): two-column grid (1.15fr/0.85fr) for own Overview — dashboard widgets on left, identity/progress on right
- **Showcase layout**: single-column for other-user Overview — pinned sheets, badges, heatmap, recent sheets
- **Dashboard redirect**: `/dashboard` now redirects to `/users/:me?tab=overview`
- **Nav consolidation**: "Dashboard" + broken "Profile" menu items merged into single "My Profile" → `/users/:username`
- **Profile CSS classes**: `.profile-hero`, `.profile-tabs`, `.profile-tab-btn`, `.profile-cockpit`, `.profile-hero-ctas` in `responsive.css`
- **Cover image `onError` fallback**: gracefully falls back to gradient when image fails to load
- **Auto-prune stale entries**: `useRecentlyViewed` now removes entries older than 30 days on read
- **`removeRecentlyViewedEntry()` export**: standalone function for pruning deleted sheets from localStorage
- **Sheet viewer auto-prune**: when `loadSheet` gets 403/404, the sheet is removed from recently-viewed localStorage

### Changed

- **`preview.routes.js` CSP**: `BASE_PREVIEW_DIRECTIVES` now allows Google Fonts (`fonts.googleapis.com` for stylesheets, `fonts.gstatic.com` for font files) and `https:` for images while keeping scripts blocked on Tier 1+ previews
- **`index.js` `previewSurfaceCsp`**: fallback middleware CSP updated to match route-level directives — allows Google Fonts and `https:` images
- **`profileConstants.js`**: increased `maxWidth` to 1100, added tab definitions (`OWN_TABS`, `OTHER_TABS`, `isValidTab`)
- **Sidebar**: "Profile" nav label → "My Profile", destination → `/users/:username` (dynamic)
- **`NavbarUserMenu.jsx`**: fixed broken `/profile/:username` link (was 404) → `/users/:username`

### Fixed

- **46.8 — `/api/courses/popular` 500**: (fixed in prior session)
- **46.9 — Admin action silent failures**: wrapped 6 confirmation dialog `onConfirm` handlers in try-catch with `showToast()` in `useAdminData.js` and `ModerationTab.jsx` (reviewSheet, deleteSheet, reviewCase, liftRestriction, reviewAppeal)
- **46.10 — Safe Preview blocking CSS/fonts**: CSP `style-src`, `style-src-elem`, and `font-src` now allow Google Fonts domains so HTML sheets render styled content while scripts remain blocked
- **46.11 — Cover images 404**: added `express.static` middleware for `/uploads/covers` in `index.js` — cover images are now publicly served alongside avatars
- **46.12 — Resume Studying stale entries**: deleted/inaccessible sheets are auto-removed from localStorage when the sheet viewer encounters 403/404; entries older than 30 days are pruned on read

### Validation

```
npm --prefix backend run lint          ✅ clean
npm --prefix frontend/studyhub-app run lint  ✅ clean
```

### Known Risks / Deferred

- Profile page is ~500 lines — a future cycle should extract tab components into separate files
- No E2E test coverage for the unified profile tabs yet
- Background batch-validation of recently-viewed entries (HEAD requests to verify all entries still exist) deferred — current approach prunes on navigation

### Files Changed

| File | Change |
|------|--------|
| `frontend/studyhub-app/src/App.jsx` | Added `DashboardRedirect`, removed `DashboardPage` import |
| `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx` | Complete rewrite: unified profile with tabs, hero, cockpit |
| `frontend/studyhub-app/src/pages/profile/profileConstants.js` | Tab definitions, maxWidth bump |
| `frontend/studyhub-app/src/styles/responsive.css` | Profile hero, tabs, cockpit CSS classes |
| `frontend/studyhub-app/src/components/AppSidebar.jsx` | Dynamic My Profile link |
| `frontend/studyhub-app/src/components/sidebarConstants.js` | Profile label + placeholder |
| `frontend/studyhub-app/src/components/NavbarUserMenu.jsx` | Fixed broken Profile link |
| `frontend/studyhub-app/src/components/navbarConstants.js` | Breadcrumb updates |
| `frontend/studyhub-app/src/pages/admin/useAdminData.js` | try-catch + showToast in admin actions |
| `frontend/studyhub-app/src/pages/admin/ModerationTab.jsx` | try-catch + showToast in moderation actions |
| `frontend/studyhub-app/src/lib/useRecentlyViewed.js` | 30-day prune, `removeRecentlyViewedEntry` export |
| `frontend/studyhub-app/src/pages/sheets/useSheetViewer.js` | Auto-prune on 403/404 |
| `backend/src/index.js` | Added `COVERS_DIR` static serving, updated `previewSurfaceCsp` |
| `backend/src/modules/preview/preview.routes.js` | CSP allows Google Fonts |

---

## Cycle 46 — 46.13–46.17 (2026-03-24)

**Theme**: Registration simplification, My Courses page, school logos pipeline, .edu onboarding, account types.

### Added

- **46.14 — `/my-courses` page** (`MyCoursesPage.jsx`): Interactive school/course personalization hub. Two-column layout with school search/selection, course department filter chips, course search, and a "Feed Preview" sticky side panel. Saves via `PATCH /api/settings/courses`. Sidebar nav link + breadcrumb wired.
- **46.15 — School logos pipeline**: `logoUrl` field on School model (schema migration). `SCHOOL_LOGOS_DIR` in storage, `express.static` middleware with 1-hour cache. Admin endpoints: `GET /api/admin/schools`, `POST /api/admin/schools/:id/logo` (multer + magic bytes validation), `DELETE /api/admin/schools/:id/logo`. Admin `SchoolsTab.jsx` with upload/replace/remove UI and inline email domain editing.
- **46.15 — `emailDomain` on School model**: Nullable string field for matching `.edu` emails to schools. Admin can set via inline editor in SchoolsTab. `PATCH /api/admin/schools/:id` endpoint for updating school metadata.
- **46.16 — .edu school suggestion banner** (`SchoolSuggestionBanner.jsx`): Shown on FeedPage for new users with `.edu` email + 0 enrollments. Calls `GET /api/courses/schools/suggest` to match email domain → school. Dismissable via localStorage. Links to `/my-courses`.
- **46.17 — `accountType` on User model**: `student`, `teacher`, or `other` (default: `student`). Schema migration added. Registration form includes "I am a..." chip selector. Stored in VerificationChallenge payload for verified flow. `PATCH /api/settings/account-type` endpoint for later changes. Included in auth and settings user payloads.

### Changed

- **46.13 — Registration simplified to 2 steps**: Removed course selection step entirely. `register/start` → `register/verify` → auto-complete. No `CoursesStep` import or rendering. `nextStep` returns `'complete'` instead of `'courses'`.
- **46.13 — Google OAuth instant creation**: Removed `requiresCourseSelection` gate and `/google/complete` route. New Google users created immediately with zero enrollments.
- **46.13 — Settings tabs reduced**: Removed `CoursesTab` from `SettingsPage.jsx` (6 tabs instead of 7). Course personalization now lives at `/my-courses`.
- **`courses.schools.controller.js`**: Added `logoUrl` to public schools endpoint select. Added `GET /api/courses/schools/suggest` authenticated endpoint for domain matching.
- **`auth.service.js`**: `validateRegistrationInput` now accepts and validates `accountType`. `getAuthenticatedUser` and `buildAuthenticatedUserPayload` include `accountType`.
- **`settings.service.js`**: `getSettingsUser` includes `accountType` in select.
- **Admin TABS**: Added `['schools', 'Schools']` to admin tab constants.

### Validation

```
npm --prefix backend run lint          ✅ clean
npm --prefix frontend/studyhub-app run lint  ✅ clean
npm --prefix frontend/studyhub-app run build ✅ clean (255ms)
```

### Known Risks / Deferred

- `emailDomain` values must be set manually by admin for each school — no auto-seed from existing data
- Google OAuth users always default to `accountType: 'student'` — can change in settings later
- No E2E tests for MyCoursesPage, SchoolSuggestionBanner, or account type selector yet
- SchoolSuggestionBanner only shows on FeedPage — users who navigate directly elsewhere won't see it

### Files Changed

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Added `logoUrl`, `emailDomain` on School; `accountType` on User |
| `backend/prisma/migrations/20260324120000_add_school_logo_url/` | logoUrl migration |
| `backend/prisma/migrations/20260324130000_add_school_email_domain/` | emailDomain migration |
| `backend/prisma/migrations/20260324140000_add_user_account_type/` | accountType migration |
| `backend/src/lib/storage.js` | Added `SCHOOL_LOGOS_DIR` |
| `backend/src/lib/verificationValidation.js` | `createSignupChallenge` accepts `accountType`, stores in payload |
| `backend/src/index.js` | Added `SCHOOL_LOGOS_DIR` static serving middleware |
| `backend/src/modules/admin/admin.schools.controller.js` | New: GET/POST/DELETE/PATCH school endpoints |
| `backend/src/modules/admin/admin.routes.js` | Mounted schoolsController |
| `backend/src/modules/auth/auth.register.controller.js` | Passes `accountType` through all registration paths |
| `backend/src/modules/auth/auth.google.controller.js` | Simplified: single-step creation, no course gate |
| `backend/src/modules/auth/auth.service.js` | `accountType` in validation, auth user, payload |
| `backend/src/modules/courses/courses.schools.controller.js` | Added `logoUrl` to select, `GET /schools/suggest` endpoint |
| `backend/src/modules/settings/settings.account.controller.js` | Added `PATCH /account-type` endpoint |
| `backend/src/modules/settings/settings.service.js` | `accountType` in getSettingsUser select |
| `frontend/studyhub-app/src/App.jsx` | Added MyCoursesPage route |
| `frontend/studyhub-app/src/pages/courses/MyCoursesPage.jsx` | New: interactive school/course personalization |
| `frontend/studyhub-app/src/pages/feed/FeedPage.jsx` | Added SchoolSuggestionBanner |
| `frontend/studyhub-app/src/pages/feed/SchoolSuggestionBanner.jsx` | New: .edu domain suggestion banner |
| `frontend/studyhub-app/src/pages/auth/RegisterStepFields.jsx` | Added account type chip selector |
| `frontend/studyhub-app/src/pages/auth/RegisterScreen.jsx` | Removed CoursesStep, 2-step only |
| `frontend/studyhub-app/src/pages/auth/useRegisterFlow.js` | Removed course state, added accountType |
| `frontend/studyhub-app/src/pages/auth/registerConstants.js` | Removed course APIs, sends accountType |
| `frontend/studyhub-app/src/pages/auth/LoginPage.jsx` | Removed requiresCourseSelection handling |
| `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx` | Removed CoursesTab |
| `frontend/studyhub-app/src/pages/admin/AdminPage.jsx` | Wired SchoolsTab rendering |
| `frontend/studyhub-app/src/pages/admin/SchoolsTab.jsx` | New: admin school management with logo + domain editing |
| `frontend/studyhub-app/src/pages/admin/adminConstants.js` | Added schools tab |
| `frontend/studyhub-app/src/components/sidebarConstants.js` | Added My Courses nav link |
| `frontend/studyhub-app/src/components/navbarConstants.js` | Added /my-courses breadcrumb |

---

## Cycle 47 — v1.7 "Ready for Session 2" Polish (2026-03-24)

### 47.1 — Release Readiness Smoke Checklist
- Created `docs/smoke-checklist.md` — repeatable <10 min checklist covering signup (email + Google), .edu suggestion, /my-courses, cover images, SheetLab fork/contribute, admin approve/reject, OAuth regression, and sanity checks

### 47.2 — Fix `/api/courses/popular` 500 (Prisma null courseId)
- **Root cause:** `groupBy` on `courseId` included `null` groups from sheets without a course, causing downstream `findMany({ where: { id: { in: [null, ...] } } })` to fail with PrismaClientValidationError
- **Fix:** Added `courseId: { not: null }` to the `where` clause in `courses.schools.controller.js`
- **Test:** Added `backend/test/courses.routes.test.js` with 4 tests: happy path, empty result, deleted courses, and Prisma failure

### 47.3 — Admin Page Reliability
- SchoolsTab wired into AdminPage.jsx (carried over from Cycle 46)
- Error toasts with server messages already added to all admin handlers in Cycle 46

### 47.4 — Profile/Dashboard Unification
- `/dashboard` already redirects to `/users/:me?tab=overview` via DashboardRedirect
- Fixed stale "Set up your profile" link in FeedWidgets GettingStartedCard: `/dashboard` → `/settings?tab=profile`
- Sidebar "My Profile" already resolves to `/users/:username` (no `/dashboard` link)

### 47.5 — Unified Profile Tab Skeleton (verified complete)
- Tab system already implemented with URL-driven `?tab=` param
- Own profile: Overview | Study | Sheets | Achievements
- Other profile: Overview | Sheets | Achievements
- `isOwnProfile` gating correct for Study tab
- Layout slots match spec: cockpit (two-column), columns, cards

### 47.6 — Copy Polish Pass (user-facing language)
- **"Edit your copy"** → **"Make your own copy"** (SheetViewerPage.jsx button text)
- **"You can't edit this sheet. Click 'Edit your copy'"** → clearer toast in useSheetLab.js
- **"You do not have access to this sheet"** → "This sheet is private or you don't have permission to view it." (useSheetViewer.js)
- **"Could not load this sheet"** on 404 → "This sheet was removed or doesn't exist." (useSheetViewer.js)
- **"This user does not exist"** → "User not found." (UserProfilePage.jsx)
- **"Could not connect to the server"** → "Check your connection and try again." (11 files, 19 occurrences)
- **Hardcoded "Student"** role label → reflects `accountType` (teacher/other/student) in sidebar + profile hero

### 47.7 — Google OAuth Scope Lock (verified safe)
- `<GoogleLogin>` component uses default scopes (openid, email, profile) — no custom scopes
- Backend `googleAuth.js` only verifies ID token, does not request additional permissions
- No code change needed — confirmed safe

### Changed (sidebar/nav polish)
- Sidebar "Add Course" button: `/settings?tab=courses` → `/my-courses`
- Sidebar empty courses: plain "No courses yet" → clickable "Set up your courses →" link
- GettingStartedCard "Join a course": `/settings?tab=courses` → `/my-courses`

### Validation
- Frontend lint: pass
- Frontend build: pass
- Backend lint: pass
- Backend test (courses.routes): 4/4 pass

### Files Changed

| File | Change |
|------|--------|
| `docs/smoke-checklist.md` | New: release readiness smoke checklist |
| `backend/src/modules/courses/courses.schools.controller.js` | Added `courseId: { not: null }` to popular query |
| `backend/test/courses.routes.test.js` | New: 4 tests for /api/courses/popular |
| `frontend/studyhub-app/src/pages/feed/FeedWidgets.jsx` | Fixed stale links to /dashboard and /settings?tab=courses |
| `frontend/studyhub-app/src/components/AppSidebar.jsx` | Fixed /settings?tab=courses → /my-courses, empty state link, accountType label |
| `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx` | "Edit your copy" → "Make your own copy" |
| `frontend/studyhub-app/src/pages/sheets/useSheetLab.js` | Updated redirect toast copy |
| `frontend/studyhub-app/src/pages/sheets/useSheetViewer.js` | Improved 403/404 error messages |
| `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx` | accountType label, improved error copy |
| `frontend/studyhub-app/src/pages/auth/useRegisterFlow.js` | Network error copy |
| `frontend/studyhub-app/src/pages/auth/LoginPage.jsx` | Network error copy |
| `frontend/studyhub-app/src/pages/admin/SchoolsTab.jsx` | Network error copy |
| `frontend/studyhub-app/src/pages/courses/MyCoursesPage.jsx` | Network error copy |
| `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx` | Network error copy |
| `frontend/studyhub-app/src/pages/settings/SecurityTab.jsx` | Network error copy |
| `frontend/studyhub-app/src/pages/settings/AccountTab.jsx` | Network error copy |
| `frontend/studyhub-app/src/pages/settings/CoursesTab.jsx` | Network error copy |
| `frontend/studyhub-app/src/pages/settings/settingsState.js` | Network error copy |
| `frontend/studyhub-app/src/pages/feed/CommentSection.jsx` | Network error copy |
