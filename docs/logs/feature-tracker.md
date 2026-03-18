# StudyHub Feature Tracker

Tracks feature implementation status across versions.
Status: Planned | In Progress | Done | Deferred | Removed

---

## v1.5.0 Features

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
| Tutorial Popup System | Planned | react-joyride for first-time user onboarding |
| Upload Sheet Unsaved Warning | In Progress | beforeunload + confirmation dialog |
| Moderation Runtime Engine | Planned | Content scanning, strike issuance, appeal workflow |
| Sheet Lab (Version Control) | Planned | Route: /sheets/:id/lab |
| Provenance + Creator Protection | Planned | AES-256-GCM encrypted tokens |
| Feature Flags System | Planned | OpenFeature-compatible |
| PWA Offline Support | Planned | Downloaded study sheets |
| WebAuthn Passkeys | Planned | Admin/power users optional |

## Removed Features (Do NOT re-implement)

| Feature | Removed Date | Reason |
|---------|-------------|--------|
| Two-Step Verification (2FA) | 2026-03-18 | Replaced by Google OAuth MFA. Not needed for student platform. |
| Email Verification Gate | 2026-03-18 | Google handles email verification. Simplified registration flow. |
| AdminMfaRequiredCard | 2026-03-18 | Depended on 2FA system which was removed. |
