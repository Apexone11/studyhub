# StudyHub Changelog

All notable changes to StudyHub are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).
Version naming: v1.5.x (weekly), v1.5.x.y (hotfixes), v2.0 when ALL v2 roadmap items started.

---

## [v1.5.0] - 2026-03-18

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
