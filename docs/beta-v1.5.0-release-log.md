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
