# StudyHub Changelog

All notable changes to StudyHub are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).
Version naming: v1.5.x-beta (weekly), v1.5.x.y-beta (hotfixes).

---

## [v1.5.0-beta] - 2026-03-23 (ongoing)

### Added (2026-03-24)

- Recently viewed tracking: `useRecentlyViewed` localStorage hook, `recordSheetView()`, max 10 entries, cross-tab sync (Cycle 43.1)
- Resume Studying dashboard widget: up to 5 recently viewed sheets with course, author, and relative time (Cycle 43.1)
- Resume Studying compact section in feed aside: 3 most recent sheets (Cycle 43.1)
- `IconClock` icon component (Cycle 43.1)
- Study Activity compact banner: "X sheets studied this week" + "Last studied" derived from localStorage (Cycle 43.2)
- "N new" badge on dashboard Recent Sheets heading: tracks new sheets since last dashboard visit (Cycle 43.2)
- Clickable stat cards: Courses → settings, Sheets → my sheets, Stars → starred sheets (Cycle 43.2)
- Last dashboard visit localStorage tracking for what's-new detection (Cycle 43.2)
- "Why revisit" signals on starred sheets in feed aside: comment count and fork count badges (Cycle 43.3)
- Star confirmation toast: "Starred! Find it in your feed sidebar or browse starred sheets." (Cycle 43.3)
- Study-status marker: `useStudyStatus` localStorage hook with to-review/studying/done states (Cycle 43.4)
- Study-status dropdown menu in sheet viewer action bar with colored dot indicators (Cycle 43.4)
- Study Queue dashboard widget: studying/to-review/done counts, up to 4 active items with status badges (Cycle 43.4)
- "Since your last visit" feed banner: "N new posts since your last visit" with localStorage tracking (Cycle 43.5)

### Added (2026-03-23)

- Sheet viewer reliability: catch-all API mock route (LIFO-safe), AbortController in HTML runtime fetch, complete sheet mock fields (Cycle 42.1)
- Sheet viewer degraded-mode: secondary operations (star, react, fork, contribute) use toast-only errors instead of polluting sheet-level banner (Cycle 42.1)
- Sheet viewer comments loading: SkeletonCard shimmer replaces plain "Loading comments..." text (Cycle 42.1)
- Full CSS token migration across sheet viewer: ~30+ hardcoded hex → CSS custom properties in SheetViewerPage, SheetViewerSidebar, ContributionInlineDiff (Cycle 42.2)
- Fork lineage in viewer header: clickable links to original sheet and author ("Forked from {title} by {author}") (Cycle 42.3)
- Collaboration summary section in viewer sidebar: fork count, pending/accepted contributions, version history link (Cycle 42.3)
- Contribution explainer in empty state: explains fork→contribute workflow (Cycle 42.3)
- Related sheets section: "More from {course}" block below comments with up to 4 same-course sheets sorted by stars (Cycle 42.4)
- "Browse all {code} sheets" link in related sheets section (Cycle 42.4)
- Comment heading shows count: "Comments (N)" (Cycle 42.5)
- Comment placeholder: "Share a clarification, correction, or study tip…" (Cycle 42.5)
- Empty comment state: centered encouraging message about corrections, study tips, and clarifications (Cycle 42.5)
- Composite "Best" ranking: `score = stars*3 + forks*2 + downloads + freshnessBonus` as default sort for sheets (Cycle 41.1)
- `GET /api/courses/popular` endpoint: top courses by published sheet count (Cycle 41.2)
- Popular courses discovery block in SheetsAside with clickable course rows (Cycle 41.2)
- Recent courses quick-filter: localStorage-tracked course chips for fast re-filtering (Cycle 41.2)
- Course-specific empty state: contextual "No sheets for CS101 yet" with upload CTA (Cycle 41.2)
- Content quality signal badges on sheet rows: Popular, Trending, New, Well used (Cycle 41.3)
- Fork lineage indicator on sheet rows: "Forked from {title} by {author}" (Cycle 41.3)
- Comment count display on sheet list rows (Cycle 41.1)
- "Your starred sheets — Recently updated" widget in feed aside (Cycle 41.4)
- Fork lineage visibility in dashboard RecentSheets widget (Cycle 41.4)
- Feed `GettingStartedCard`: dismissible onboarding panel with 4 quick actions, completion tracking, localStorage persistence (Cycle 40.1)
- Feed `EmptyFeed` enhanced with first-run CTAs ("Browse study sheets", "Upload a sheet") (Cycle 40.1)
- Dashboard activation checklist expanded to 6 items: "Verify your email" and "Add a profile photo" steps with backend checks (Cycle 40.1)
- Upload `UploadHelperCard`: dismissible "How uploading works" info panel explaining formats, scan, post-submit flow (Cycle 40.3)
- Upload `StatusBanner` rewritten: context-aware messages for pending_review, rejected, published, quarantined states with return-path links (Cycle 40.3)
- Upload `ErrorBanner`: `verificationRequired` prop with `EMAIL_NOT_VERIFIED` detection in both markdown and HTML submit paths (Cycle 40.2)
- `EmailVerificationBanner`: grace period countdown with days remaining (Cycle 40.2)
- `SheetsAside`: "Add your courses" CTA for zero-enrollment users, "Upload a sheet" primary CTA (Cycle 40.4)
- Dark mode token migration: `RecentSheets`, `CourseFocus`, `QuickActions`, `EmptyState`, `DashboardSkeleton`, `ActivationChecklist`, `StatCards` — all hardcoded hex replaced with CSS custom properties (Cycles 40.1, 40.4)
- Scanner explainability helpers: `generateRiskSummary()`, `generateTierExplanation()`, `groupFindingsByCategory()`, `CATEGORY_LABELS` — all scan results now include plain-English summaries, "why this tier" explanations, and grouped findings
- `htmlWorkflow` serializer enriched with `riskSummary`, `tierExplanation`, `findingsByCategory` fields across sheet detail, preview, runtime, scan status, and admin review-detail endpoints
- `category` field added to `normalizeFindings()` output (backward-compatible with existing `source` field)
- 9 new unit tests for explainability helpers (grouping, summaries, tier explanations)
- Admin review queue badges: tier badge, preview mode badge, finding count badge on each queue card (Cycle 39.2)
- Admin review panel: risk summary bar with tier badge, acknowledgement indicator, tier explanation in header (Cycle 39.2)
- Grouped findings display in `FindingsPanel` — category-grouped, severity-sorted with labels from `CATEGORY_LABELS` (Cycle 39.2)
- Review reason quick-fill templates (5 templates) in `ReviewActionBar` for faster admin decisions (Cycle 39.2)
- `HtmlScanModal` rewritten: category-grouped findings with severity badges, risk summary headline, tier explanation (replaces flat list + hardcoded text) (Cycle 39.2)
- SheetViewerPage risk summary shown next to tier badge for non-interactive preview modes (Cycle 39.2)
- 5 Playwright E2E smoke tests for HTML security tiers: tier 2 upload, tier 3 quarantine, grouped findings modal, admin review queue with badges/panel/templates, sheet viewer risk summary (Cycle 39.3)
- HTML moderation playbook: step-by-step admin review guide with decision matrix, preview mode reference, and reason templates (`docs/security/html-moderation-playbook.md`) (Cycle 39.3)
- HTML finding category glossary: all 13 scanner categories with triggers, severities, tier escalation rules (`docs/security/html-finding-categories.md`) (Cycle 39.3)
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
- Service Worker intercepting Playwright API mocks — added `test.use({ serviceWorkers: 'block' })` to HTML upload test files (Cycle 39.3)
- Existing tier 1 upload smoke test: fixed wrong working-html mock URL, added missing tutorial localStorage key (Cycle 39.3)

### Security (2026-03-23)
- Attachment preview iframes now sandboxed (`allow-same-origin` only) across Feed, Sheet Viewer, and Preview pages
- Error messages sanitized through `getApiErrorMessage()` to prevent API implementation detail leakage

### Changed (2026-03-23)

- Sheet status badges migrated from inline hex styles to CSS token classes (Cycle 41.3)
- Feed alert banners migrated from hardcoded hex to CSS tokens (Cycle 41.4)
- Default sheets sort changed from "Recent" to "Best" (recommended composite ranking) (Cycle 41.1)
- Upload scan language: `TutorialModal` steps rewritten with supportive tone, `HtmlScanModal` intro reframed, tier 1 acknowledgement simplified (Cycle 40.3)
- `tierLabel()` renamed: "Clean" → "Passed", "Flagged" → "Minor Findings", "High Risk" → "Needs Review" in upload flow (Cycle 40.3)
- `RecentSheets` helper text changed from developer note to user-facing copy (Cycle 40.4)
- `SheetsAside` workflow section: better guidance copy + "Upload a sheet" CTA (Cycle 40.4)

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
