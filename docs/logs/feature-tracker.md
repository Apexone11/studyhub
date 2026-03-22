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
| Feature Flags System | Planned | OpenFeature-compatible |
| PWA Offline Support | Planned | Downloaded study sheets |
| WebAuthn Passkeys | Planned | Admin/power users optional |

## Removed Features (Do NOT re-implement)

| Feature | Removed Date | Reason |
|---------|-------------|--------|
| Two-Step Verification (2FA) | 2026-03-18 | Replaced by Google OAuth MFA. Not needed for student platform. |
| Email Verification Gate (login-blocking) | 2026-03-18 | Removed login-time gate. Re-introduced as post-login soft-gate with 3-day grace period (2026-03-21). |
| AdminMfaRequiredCard | 2026-03-18 | Depended on 2FA system which was removed. |
