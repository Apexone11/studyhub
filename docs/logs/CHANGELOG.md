# StudyHub Changelog

All notable changes to StudyHub are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).
Version naming: v1.5.x-beta (weekly), v1.5.x.y-beta (hotfixes).

---

## [v1.5.0-beta] - 2026-03-23 (ongoing)

### Added (2026-03-23)

- Tier 3 classifier rules: credential capture detector (external form + password/sensitive inputs → critical severity), 3+ distinct high-risk category escalation, obfuscated crypto-miner escalation — Tier 3 now reachable from scanner alone without ClamAV
- Preview mode serialization: `tierToPreviewMode()` in `sheets.serializer.js`, `previewMode` and `ackRequired` fields in `htmlWorkflow` response object, preview/runtime endpoints return `previewMode`
- SheetViewerPage refactored: all 12 inline `htmlRiskTier >= X` comparisons replaced with `previewMode` string checks (`interactive`, `safe`, `restricted`, `disabled`)
- Sample test matrix: 6 representative HTML samples (A–F) testing clean → malicious spectrum through full classifier pipeline
- Tier behavior integration tests: 4 new tests in `sheet.workflow.integration.test.js` covering tier 1 (flagged → acknowledge → publish), tier 2 (eval → pending_review → admin approve), tier 2 (redirect behavioral detection), and runtime access control (quarantine block, pending_review owner/admin access)
- Playwright smoke test rewritten for current tier 1 flagged workflow (scan modal, acknowledgement checkbox, publish with warnings)
- HTML policy migration: `validateHtmlForSubmission()` rewritten from feature-blocker to structural-only validator — all HTML accepted, scanned, classified by risk tier
- Frontend copy alignment: "HTML Upload Beta" → "HTML Upload", "Sanitized Preview" → "Safe Preview", preview description updated
- SheetViewerPage HTML section: 7 hardcoded color blocks migrated to CSS custom property tokens (tier badges, banners, warning gate, error fallback)
- SheetHtmlPreviewPage: error panel tokenized, preview description updated
- Security overview documentation rewritten: accept-all → scan → classify → route model with tier descriptions
- Page decomposition: FeedPage (-38%), SheetsPage (-44%), UploadSheetPage (-36%) rewritten as thin orchestrators with extracted child components
- New components: FeedComposer, FeedAside, SheetsEmptyState, SheetsAside, UploadNavActions
- Design token expansion: 10 slate-scale tokens + 4 info-semantic tokens added to index.css (light + dark themes)
- Design token migration: 10 files converted from hardcoded hex colors to CSS custom properties (~100+ instances)
- Media/storage ownership documentation: canonical path rules, cleanup chain, ownership enforcement audit
- Smoke tests for decomposed pages: 8 Playwright tests covering upload, admin, and profile flows (light + dark)
- Frontend feature-folder scaffolding: 8 barrel exports under `src/features/` (sheets, feed, admin, users, dashboard, notes, auth, settings)
- Convention: new feature logic goes in `src/features/<name>/`, pages import from barrels
- HTML workflow copy improvements: safe preview mode, security scan explanations, community guidelines language
- Sheet status filter pills on Sheets page (Drafts, Pending review, Published, Rejected) visible when "Mine" is active
- Backend `status` query param for `GET /api/sheets?mine=1&status=draft` filtering own sheets by status
- Status-aware empty states on Sheets page (custom messaging per filter: "No drafts", "Nothing pending", "No rejected sheets")
- `STATUS_OPTIONS` constant and `toggleMine` callback for atomic URL param handling
- SettingsPage error state UI — "Settings unavailable" screen with refresh button (was silently swallowed)
- Feed avatars now render actual user images (backend returns `avatarUrl`, frontend `Avatar` component resolves URLs)
- Avatar `onError` fallback to initials across all avatar components (Feed, Profile, Settings, FollowModal)
- `sandbox="allow-same-origin"` and `referrerPolicy="no-referrer"` on all attachment preview iframes
- Load-more failure toast notification on Sheets page (was silent)

### Fixed (2026-03-23)
- 22 `react-refresh/only-export-components` lint errors — extracted JSX components from mixed-export `.jsx` files into dedicated component files (5 files split)
- HTML workflow copy: replaced negative/vague framing with clear, helpful language across 5 files (preview, upload, scan modal, viewer, actions)
- Feed `settleSection` crash — `.then()` called on non-Promise return from loader short-circuits (wrapped in `Promise.resolve()`)
- User profile crash — `optionalAuth` sets truthy `req.user` but `userId` can be undefined (added `req.user?.userId` guard)
- Sheet detail crash — same `optionalAuth`/`userId` issue on starred + reaction lookups
- 14 Prisma validation errors from `parseInt` producing `NaN` on invalid route params (added `Number.isInteger()` guards)
- Feed post reaction delete race condition — `P2025` not caught on already-deleted row
- 11 raw `data.error` patterns in `useSheetViewer.js` and `useFeedData.js` replaced with safe `getApiErrorMessage()` helper

### Security (2026-03-23)
- Attachment preview iframes now sandboxed (`allow-same-origin` only) across Feed, Sheet Viewer, and Preview pages
- Error messages sanitized through `getApiErrorMessage()` to prevent API implementation detail leakage

### Added (2026-03-21)
- Unverified user restriction with 3-day grace period (backend middleware + 9 route guards)
- Email verification inline component for blocked-action UX
- `isEmailNotVerifiedError()` frontend helper
- Terms of Use Section 3: "Email Verification" policy
- Dark mode persistence across logout (global `sh-theme` localStorage key)
- Pre-React inline theme script in index.html (prevents white flash)
- Admin quick reject with default reason ("Rejected by admin (quick reject).")
- `EmailVerificationInline` component for forms
- Logout button via Navbar user dropdown menu (Dashboard, Profile, Settings, Log out)
- `useIdleTimeout` hook — 30-minute idle auto-logout (mousemove, keydown, click, touchstart, scroll)
- Avatar upload with circle crop (`react-easy-crop`), zoom slider, 5 MB max, PNG output
- `AvatarCropModal` component — reusable crop modal for Profile page and Settings ProfileTab
- Avatar CSS tokens `--sh-avatar-bg` / `--sh-avatar-text` for dark mode readability
- Tutorial steps for avatar upload in PROFILE_STEPS and SETTINGS_STEPS
- Formal policy page copy: Terms of Use, Privacy Policy, Community Guidelines (real-world legal language)
- Version bumped to v1.5.0-beta across all package.json and docs

### Changed (2026-03-21)
- Settings page background and nav buttons now use CSS tokens for dark mode
- CoursesTab school dropdown replaced with shared `Select` component (dark mode fix)
- CoursesTab loading/error text uses CSS tokens instead of hardcoded hex

### Fixed (2026-03-21)
- CSRF middleware blocking login when stale session cookie present (auth bootstrap route exclusion)
- Dark mode resetting to light on logout (applyGlobalTheme instead of resetAppearancePreferences)
- Admin approve blocking HTML sheets with inline scripts (switched to validateHtmlForRuntime)
- SheetReviewPanel severityColor missing 'high' handler for js-risk findings
- No logout button in UI — users had no way to sign out
- Sessions stayed active indefinitely — added 30-minute idle timeout
- Avatar initials invisible in dark mode (white text on light background) — dedicated avatar tokens

### Security (2026-03-21)
- CSRF middleware now excludes auth bootstrap routes (login, google, register) — prevents stale cookie deadlock
- Email verification enforcement on all content-write endpoints after 3-day grace
- 30-minute idle session timeout prevents unattended session hijacking

---

## [v1.5.0-beta] - 2026-03-18 (initial release)

### Added
- Google OAuth login/register (backend + frontend)
- Anime.js animation library with fadeInUp, staggerEntrance, popScale, countUp, fadeInOnScroll
- Unified search endpoint with debounced SearchModal
- ConfirmDialog component replacing window.confirm()
- Settings page rework: 7 tabs (Profile, Security, Notifications, Privacy, Courses, Appearance, Account)
- UserPreferences model (theme, notifications, privacy settings)
- Moderation database schema (ModerationCase, Strike, Appeal, UserRestriction)
- Email delivery tracking with Resend webhooks
- Email suppression management in Admin panel
- Responsive CSS baseline for settings/admin

### Changed
- Login page redesigned: dark gradient, glass-morphism, prominent Google button
- Register page redesigned: 2-column layout, gradient indicators, Google button
- HomePage enhanced: testimonials, social proof banner, improved CTA
- Feed composer renamed: "Upload sheet" -> "Attach file", "General post" -> "All courses"
- Settings page rewritten from 854 lines to ~170 line shell with 7 tabs

### Removed
- Two-step verification (2FA) removed system-wide
- AdminMfaRequiredCard component removed

### Fixed
- CORS auto-expansion for www/non-www origins
- Production crash from missing Prisma migration
- Account takeover vulnerability in Google OAuth email auto-linking
- SearchModal stale state on close
- Bootstrap crash amplifier (missing emailVerified in select)
- req.user.id -> req.user.userId in preferences endpoints
- Username generation infinite loop guard

### Security
- Form tag added to HTML scanner forbidden list
- Google token verification error handling improved
- Prototype pollution prevention in preferences endpoint
- Username generation TOCTOU guard (suffix > 100)
