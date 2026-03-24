# StudyHub Feature Tracker

Tracks feature implementation status across versions.
Status: Planned | In Progress | Done | Deferred | Removed

---

## v1.5.0-beta Features

| Feature | Status | Notes |
|---------|--------|-------|
| Google OAuth (Login/Register) | Done | Backend + Frontend complete (Cycle 2) |
| Anime.js Animations | Done | fadeInUp, staggerEntrance, popScale, countUp (Cycle 2) |
| Unified Search | Done | SearchModal with debounced API (Cycle 1) |
| ConfirmDialog | Done | Replaces window.confirm() (Cycle 1) |
| Settings Page Rework (7 tabs) | Done | Profile, Security, Notifications, Privacy, Courses, Appearance, Account (Cycle 4) |
| UserPreferences Model | Done | Theme, notifications, privacy settings (Cycle 4) |
| Moderation DB Schema | Done | ModerationCase, Strike, Appeal, UserRestriction (Cycle 5) |
| Email Delivery Tracking | Done | Resend webhooks, suppression management (Cycles 9-17) |
| 2FA Removal | Done | Removed system-wide (Cycle 8) |
| Auth Pages Redesign | Done | Login + Register glass-morphism redesign (Cycle 8) |
| HomePage Enhancement | Done | Testimonials, social proof, CTA (Cycle 8) |
| Page-wide Responsive Redesign | In Progress | All pages need better space usage |
| Tutorial Popup System | Done | react-joyride per-page tutorials with localStorage flags (2026-03-21) |
| Upload Sheet Unsaved Warning | In Progress | beforeunload + confirmation dialog |
| Moderation Runtime Engine | Done | Content scanning, moderation engine, admin review queue (Cycles 5+) |
| Sheet Lab (Version Control) | Done | Route: /sheets/:id/lab, dark mode tokens (2026-03-21) |
| Provenance + Creator Protection | Done | AES-256-GCM encrypted tokens |
| HTML Preview Security Overhaul | Done | CSP headers, iframe sandbox, srcDoc→src migration, warning gate, dual document model (2026-03-21) |
| Admin Sheet Review Pipeline | Done | Review queue, detail panel, approve/reject/quick-reject, scan findings, js-risk alerts (2026-03-21) |
| Email Verification Enforcement | Done | 3-day grace period, 9 route guards, inline banner, Terms section (2026-03-21) |
| CSRF Auth Bootstrap Fix | Done | Excluded login/google/register from CSRF checks (2026-03-21) |
| Dark Mode Persistence | Done | Global sh-theme localStorage key, pre-React inline script (2026-03-21) |
| Navbar User Dropdown + Logout | Done | Dropdown menu with Dashboard, Profile, Settings, Log out (2026-03-21) |
| Idle Session Timeout | Done | 30-min useIdleTimeout hook, auto-logout on inactivity (2026-03-21) |
| Avatar Upload + Circle Crop | Done | react-easy-crop, 5 MB max, PNG output, Profile + Settings UI (2026-03-21) |
| Avatar Dark Mode Tokens | Done | --sh-avatar-bg/--sh-avatar-text tokens for all avatar components (2026-03-21) |
| Settings Dark Mode Token Fix | Done | SettingsPage bg/nav + CoursesTab select use CSS tokens (2026-03-21) |
| Formal Policy Pages | Done | Terms, Privacy, Community Guidelines rewritten with real-world legal copy (2026-03-21) |
| Feed Avatar Images | Done | Backend returns avatarUrl, Avatar component renders images with onError fallback (2026-03-23) |
| Avatar Error Fallback (all pages) | Done | Graceful degradation to initials on broken image URLs across Feed, Profile, Settings, FollowModal (2026-03-23) |
| Attachment Preview Iframe Sandbox | Done | sandbox="allow-same-origin" + referrerPolicy on all preview iframes (2026-03-23) |
| Sheets Status Filter | Done | Status pills (Drafts, Pending review, Published, Rejected) on Sheets page when Mine active, backend ?status= param (2026-03-23) |
| Sheets Status-Aware Empty States | Done | Custom empty-state messaging per status filter on Sheets page (2026-03-23) |
| Settings Load Error UI | Done | SettingsPage shows error screen with refresh button instead of silent failure (2026-03-23) |
| Error Message Sanitization | Done | All frontend error display uses getApiErrorMessage() helper — 15 call sites fixed (2026-03-23) |
| HTML Workflow Copy Cleanup | Done | 6 copy fixes across preview, upload, scan modal, viewer, actions — constructive framing (2026-03-23) |
| Frontend Feature Folder Scaffolding | Done | 8 barrel exports under `src/features/` for incremental migration from pages/ (2026-03-23) |
| Lint Error Cleanup (22 errors → 0) | Done | JSX component extraction from 5 mixed-export files, .jsx → .js rename with re-exports (2026-03-23) |
| Page Decomposition (Feed, Sheets, Upload) | Done | 3 pages rewritten as thin orchestrators, 5 child components extracted (2026-03-23) |
| Design Token Migration (Slate + Info) | Done | 14 new tokens, 10 files migrated from hardcoded hex to CSS custom properties (2026-03-23) |
| Media/Storage Ownership Audit | Done | Canonical path rules, cleanup chain, ownership enforcement documented in security-overview.md (2026-03-23) |
| Decomposed Pages Smoke Tests | Done | 8 Playwright tests for upload, admin, profile across light + dark themes (2026-03-23) |
| HTML Policy Migration (Accept-All → Scan → Classify) | Done | `validateHtmlForSubmission` structural-only, all HTML accepted and routed by risk tier (2026-03-23) |
| Frontend HTML Copy + Token Alignment | Done | "HTML Upload Beta" → "HTML Upload", "Sanitized Preview" → "Safe Preview", SheetViewerPage tokenized (2026-03-23) |
| Tier Behavior Verification (Integration Tests) | Done | 4 controller-level tests: tier 1 flagged→ack→publish, tier 2 eval→pending_review, tier 2 redirect detection, runtime access control (2026-03-23) |
| Upload HTML Smoke Test Fix | Done | Playwright test rewritten for tier 1 flagged workflow — removed references to deleted UI text (2026-03-23) |
| Tier 3 Classifier Rules | Done | Credential capture detector, 3+ category escalation, obfuscated miner escalation — Tier 3 reachable without ClamAV (2026-03-23) |
| Preview Mode Serialization | Done | `tierToPreviewMode()` helper, `previewMode`/`ackRequired` in htmlWorkflow response, SheetViewerPage refactored to use string checks (2026-03-23) |
| Sample Test Matrix (A–F) | Done | 6 representative HTML samples covering clean → malicious spectrum through full classifier pipeline (2026-03-23) |
| Scanner Explainability Helpers | Done | `generateRiskSummary`, `generateTierExplanation`, `groupFindingsByCategory`, `CATEGORY_LABELS` — plain-English scan result summaries (2026-03-23) |
| htmlWorkflow Explainability Fields | Done | `riskSummary`, `tierExplanation`, `findingsByCategory` added to sheet detail, preview, runtime, scan status, and admin review-detail APIs (2026-03-23) |
| Admin Queue Badges (Tier + Preview + Findings) | Done | TierBadge, PreviewModeBadge, finding count badge on review queue cards (2026-03-23) |
| Admin Review Panel Risk Summary | Done | Risk summary bar, tier explanation, acknowledgement indicator in SheetReviewPanel header (2026-03-23) |
| Grouped Findings Display | Done | FindingsPanel + HtmlScanModal show category-grouped, severity-sorted findings with labels (2026-03-23) |
| Review Reason Quick-Fill Templates | Done | 5 reason templates in ReviewActionBar for faster admin review decisions (2026-03-23) |
| HtmlScanModal Category Rewrite | Done | Flat findings list replaced with grouped display, risk summary headline, tier explanation (2026-03-23) |
| SheetViewerPage Risk Summary | Done | Risk summary text shown next to tier badge for non-interactive preview modes (2026-03-23) |
| HTML Security Tier E2E Tests (5 tests) | Done | Tier 2 upload, tier 3 quarantine, grouped findings modal, admin review panel, viewer risk summary (2026-03-23) |
| HTML Moderation Playbook | Done | Step-by-step admin review guide with decision matrix, preview modes, reason templates (2026-03-23) |
| HTML Finding Category Glossary | Done | All 13 scanner categories documented with triggers, severities, tier escalation rules (2026-03-23) |
| Feed GettingStartedCard (Onboarding) | Done | Dismissible 4-action panel, completion tracking, localStorage persistence (Cycle 40.1, 2026-03-23) |
| Dashboard Activation Checklist (6 items) | Done | Added verify email + add photo steps with backend checks (Cycle 40.1, 2026-03-23) |
| Email Verification Grace Period Banner | Done | Countdown days remaining, link to settings (Cycle 40.2, 2026-03-23) |
| Upload EMAIL_NOT_VERIFIED Detection | Done | verificationRequired state wired through hook chain, warning banner in ErrorBanner (Cycle 40.2, 2026-03-23) |
| Upload Helper Card | Done | Dismissible "How uploading works" info panel with formats, scan, post-submit flow (Cycle 40.3, 2026-03-23) |
| Upload StatusBanner Rewrite | Done | Context-aware messages for pending_review, rejected, published, quarantined with return paths (Cycle 40.3, 2026-03-23) |
| Upload Scan Language Polish | Done | Supportive tierLabel names, HtmlScanModal/TutorialModal language rewrite (Cycle 40.3, 2026-03-23) |
| Dashboard Full Dark Mode Tokens | Done | RecentSheets, CourseFocus, QuickActions, EmptyState, DashboardSkeleton migrated (Cycle 40.4, 2026-03-23) |
| SheetsAside Browse Guidance | Done | Zero-enrollment CTA, upload CTA, better workflow copy (Cycle 40.4, 2026-03-23) |
| Composite "Best" Ranking Sort | Done | `stars*3 + forks*2 + downloads + freshnessBonus` as default, in-memory scoring (Cycle 41.1, 2026-03-23) |
| Comment Count on Sheet Rows | Done | IconComment + count display when > 0 (Cycle 41.1, 2026-03-23) |
| Popular Courses Endpoint | Done | `GET /api/courses/popular` — top 8 by published sheet count (Cycle 41.2, 2026-03-23) |
| Course Discovery Sidebar | Done | Popular courses ranked list + recent courses chips in SheetsAside (Cycle 41.2, 2026-03-23) |
| Course-Specific Empty State | Done | Contextual "No sheets for {code}" with upload CTA (Cycle 41.2, 2026-03-23) |
| Content Quality Signal Badges | Done | Popular, Trending, New, Well used badges on sheet rows (Cycle 41.3, 2026-03-23) |
| Fork Lineage Indicators | Done | "Forked from {title} by {author}" on sheet rows + dashboard (Cycle 41.3-41.4, 2026-03-23) |
| Starred Updates Feed Widget | Done | "Your starred sheets — Recently updated" in feed aside (Cycle 41.4, 2026-03-23) |
| Feed Alert Token Migration | Done | Partial/error banners migrated from hardcoded hex to CSS tokens (Cycle 41.4, 2026-03-23) |
| Sheet Viewer Reliability (Mock + AbortController) | Done | Catch-all LIFO-safe mock route, AbortController in HTML runtime fetch, complete mock fields (Cycle 42.1, 2026-03-23) |
| Sheet Viewer Degraded-Mode Isolation | Done | Secondary ops (star/react/fork/contribute) use toast-only errors, SkeletonCard for comments loading (Cycle 42.1, 2026-03-23) |
| Sheet Viewer CSS Token Migration | Done | ~30+ hardcoded hex → CSS tokens across SheetViewerPage, Sidebar, ContributionInlineDiff (Cycle 42.2, 2026-03-23) |
| Viewer Fork Lineage Links | Done | Clickable links to original sheet + author in viewer header and sidebar (Cycle 42.3, 2026-03-23) |
| Viewer Collaboration Summary | Done | Sidebar section with fork count, pending/accepted contributions, version history link (Cycle 42.3, 2026-03-23) |
| Related Sheets Section | Done | "More from {course}" block below comments, up to 4 same-course sheets sorted by stars (Cycle 42.4, 2026-03-23) |
| Comment UX Improvements | Done | Count in heading, encouraging empty state, study-tip-oriented placeholder (Cycle 42.5, 2026-03-23) |
| Recently Viewed Tracking (localStorage) | Done | `useRecentlyViewed` hook, `recordSheetView()`, max 10 entries, cross-tab sync (Cycle 43.1, 2026-03-24) |
| Resume Studying Dashboard Widget | Done | Up to 5 recently viewed sheets in dashboard + 3 in feed aside (Cycle 43.1, 2026-03-24) |
| Study Activity Banner | Done | "X sheets studied this week" + "Last studied" derived from localStorage (Cycle 43.2, 2026-03-24) |
| Dashboard "What's New" Badge | Done | "N new" pill on Recent Sheets heading, tracks via localStorage lastVisit (Cycle 43.2, 2026-03-24) |
| Clickable Stat Cards | Done | Courses/Sheets/Stars link to relevant filtered pages (Cycle 43.2, 2026-03-24) |
| Starred Sheet "Why Revisit" Signals | Done | Comment count + fork count badges on starred updates in feed aside (Cycle 43.3, 2026-03-24) |
| Star Confirmation Toast | Done | "Starred! Find it in your feed sidebar…" message on star action (Cycle 43.3, 2026-03-24) |
| Study-Status Marker (localStorage) | Done | `useStudyStatus` hook, to-review/studying/done states, cross-tab sync (Cycle 43.4, 2026-03-24) |
| Study-Status Viewer Dropdown | Done | Dropdown menu in sheet viewer action bar with colored indicators (Cycle 43.4, 2026-03-24) |
| Study Queue Dashboard Widget | Done | Studying/to-review/done counts + active item list (Cycle 43.4, 2026-03-24) |
| "Since Your Last Visit" Feed Banner | Done | "N new posts since your last visit" with localStorage tracking (Cycle 43.5, 2026-03-24) |
| Feature Flags System | Planned | OpenFeature-compatible |
| PWA Offline Support | Planned | Downloaded study sheets |
| WebAuthn Passkeys | Planned | Admin/power users optional |

## Removed Features (Do NOT re-implement)

| Feature | Removed Date | Reason |
|---------|-------------|--------|
| Two-Step Verification (2FA) | 2026-03-18 | Replaced by Google OAuth MFA. Not needed for student platform. |
| Email Verification Gate (login-blocking) | 2026-03-18 | Removed login-time gate. Re-introduced as post-login soft-gate with 3-day grace period (2026-03-21). |
| AdminMfaRequiredCard | 2026-03-18 | Depended on 2FA system which was removed. |
