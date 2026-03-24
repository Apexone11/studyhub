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
| Feature Flags System | Planned | OpenFeature-compatible |
| PWA Offline Support | Planned | Downloaded study sheets |
| WebAuthn Passkeys | Planned | Admin/power users optional |

## Removed Features (Do NOT re-implement)

| Feature | Removed Date | Reason |
|---------|-------------|--------|
| Two-Step Verification (2FA) | 2026-03-18 | Replaced by Google OAuth MFA. Not needed for student platform. |
| Email Verification Gate (login-blocking) | 2026-03-18 | Removed login-time gate. Re-introduced as post-login soft-gate with 3-day grace period (2026-03-21). |
| AdminMfaRequiredCard | 2026-03-18 | Depended on 2FA system which was removed. |
