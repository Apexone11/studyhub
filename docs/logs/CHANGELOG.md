# StudyHub Changelog

All notable changes to StudyHub are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).
Version naming: v1.5.x-beta (weekly), v1.5.x.y-beta (hotfixes).

---

## [v1.5.0-beta] - 2026-03-21 (ongoing)

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
