# StudyHub Bug Tracker

Tracks known bugs, their status, and resolution.
Priority: P0 (production down), P1 (critical), P2 (significant), P3 (minor), P4 (cosmetic).

---

## Open Bugs

| ID | Priority | Page/Component | Description | Found | Status |
|----|----------|---------------|-------------|-------|--------|
| BUG-001 | P2 | UploadSheetPage | No unsaved changes warning when navigating away with pending sheet | 2026-03-18 | In Progress |
| BUG-002 | P3 | NotesPage | Editor split fixed 2-column on mobile, should stack vertically | 2026-03-18 | Open |
| BUG-003 | P3 | SheetsPage | Filter row wraps awkwardly without min-width constraints on narrow screens | 2026-03-18 | Open |
| BUG-004 | P3 | DashboardPage | Hero buttons fixed gap, don't reflow well on small screens | 2026-03-18 | Open |
| BUG-005 | P3 | UserProfilePage | Stats row can overflow on mobile, avatar size fixed at 80px | 2026-03-18 | Open |
| BUG-006 | P4 | SecurityTab | Google link flow is placeholder text only, not functional | 2026-03-18 | Resolved (2026-03-23) — Full Google link/unlink flow implemented with real API calls |
| BUG-007 | P3 | LoginPage | Email verification gate still shows for non-Google users | 2026-03-18 | Resolved (2026-03-21) — CSRF fix + grace period system |

## Resolved Bugs

| ID | Priority | Page/Component | Description | Found | Resolved | Fix |
|----|----------|---------------|-------------|-------|----------|-----|
| BUG-R001 | P0 | Backend | Production crash from missing Prisma migration | 2026-03-18 | 2026-03-18 | Created formal migration file (Cycle 7) |
| BUG-R002 | P0 | Backend | Bootstrap crash amplifier (missing emailVerified in select) | 2026-03-18 | 2026-03-18 | Added emailVerified to select clause (Cycle 7) |
| BUG-R003 | P1 | Backend | Account takeover via Google OAuth email auto-linking | 2026-03-18 | 2026-03-18 | Removed auto-link, returns 409 (Cycle 7) |
| BUG-R004 | P1 | Backend | req.user.id vs req.user.userId in preferences | 2026-03-18 | 2026-03-18 | Fixed to userId (Cycle 6) |
| BUG-R005 | P2 | SearchModal | Stale state on close (pending timers/fetches) | 2026-03-18 | 2026-03-18 | Clear timer + abort fetch on close (Cycle 7) |
| BUG-R006 | P2 | LoginPage | Smart quote typo (Unicode U+2019) | 2026-03-18 | 2026-03-18 | Replaced with ASCII apostrophe (Cycle 3) |
| BUG-R007 | P1 | Backend | CORS blocking www subdomain requests | 2026-03-18 | 2026-03-18 | Auto www/non-www expansion (Cycle 3) |
| BUG-R008 | P1 | Backend/CSRF | Login blocked by "Missing CSRF token" when stale session cookie present | 2026-03-21 | 2026-03-21 | Excluded auth bootstrap routes (/api/auth/login, /google, /register) from CSRF middleware |
| BUG-R009 | P2 | Frontend/Theme | Dark mode reverts to light on logout (homepage flash) | 2026-03-21 | 2026-03-21 | Added global `sh-theme` localStorage key, inline pre-React script in index.html |
| BUG-R010 | P2 | Backend/Admin | Admin approve blocked for HTML sheets with inline scripts | 2026-03-21 | 2026-03-21 | Switched approve validation from validateHtmlForSubmission to validateHtmlForRuntime |
| BUG-R011 | P3 | SheetReviewPanel | severityColor() missing 'high' severity handler (js-risk findings) | 2026-03-21 | 2026-03-21 | Added high severity color (#ea580c) |
| BUG-R012 | P2 | Navbar | No logout button in UI — users had no way to sign out | 2026-03-21 | 2026-03-21 | Added user dropdown menu with Dashboard, Profile, Settings, Log out |
| BUG-R013 | P2 | Global | No idle timeout — sessions stayed active indefinitely | 2026-03-21 | 2026-03-21 | Added useIdleTimeout hook (30 min), wired into App.jsx |
| BUG-R014 | P2 | AppSidebar/FeedPage/SearchModal | Avatar initials invisible in dark mode (white text on light bg) | 2026-03-21 | 2026-03-21 | Added --sh-avatar-bg/--sh-avatar-text tokens, applied to all avatar components |
| BUG-R015 | P0 | Backend/Feed | `settleSection` crash — `.then()` called on non-Promise return from loader ternary short-circuits | 2026-03-23 | 2026-03-23 | Wrapped loader call in `Promise.resolve()` (Cycle 33) |
| BUG-R016 | P1 | Backend/Users | User profile crash — `optionalAuth` sets truthy `req.user` but `userId` undefined, causing Prisma validation error on follow lookup | 2026-03-23 | 2026-03-23 | Guard on `req.user?.userId` (Cycle 33) |
| BUG-R017 | P1 | Backend/Sheets | Sheet detail crash — same `optionalAuth`/`userId` issue on starred + reaction lookups | 2026-03-23 | 2026-03-23 | Extract `userId`, skip queries when falsy (Cycle 33) |
| BUG-R018 | P1 | Backend (14 routes) | Prisma validation errors from `parseInt` producing `NaN` on invalid route params | 2026-03-23 | 2026-03-23 | `Number.isInteger()` guard on all parsed IDs (Cycle 33) |
| BUG-R019 | P2 | Backend/Feed | Feed post reaction delete race — `P2025` not caught when row already deleted | 2026-03-23 | 2026-03-23 | Wrapped delete in `P2025` catch (Cycle 33) |
| BUG-R020 | P2 | Frontend/Feed | Feed avatars only showed initials — backend missing `avatarUrl` in author selects, component had no image support | 2026-03-23 | 2026-03-23 | Backend returns `avatarUrl`, Avatar component resolves URLs + onError fallback (Cycle 34) |
| BUG-R021 | P2 | Frontend (all avatars) | Broken avatar URLs showed broken image icon instead of initials fallback | 2026-03-23 | 2026-03-23 | Added `onError` handler with `imgError` state across Feed, Profile, Settings, FollowModal (Cycle 34) |
| BUG-R022 | P2 | Frontend/Preview | Attachment preview iframes had no `sandbox` attribute — security gap allowing script execution | 2026-03-23 | 2026-03-23 | Added `sandbox="allow-same-origin"` + `referrerPolicy="no-referrer"` (Cycle 34) |
| BUG-R023 | P2 | Frontend/Settings | SettingsPage silently swallowed initial load failure (`.catch(() => {})`) | 2026-03-23 | 2026-03-23 | Added `loadError` state with full error UI + refresh button (Cycle 34) |
| BUG-R024 | P3 | Frontend (11 call sites) | Raw `data.error` strings from API displayed to users without sanitization | 2026-03-23 | 2026-03-23 | Replaced with `getApiErrorMessage()` helper (Cycle 34) |
| BUG-R025 | P3 | Frontend/Sheets | Load-more failure silently swallowed — no user feedback | 2026-03-23 | 2026-03-23 | Added toast notification on failure (Cycle 34) |
| BUG-R026 | P3 | Frontend (22 errors) | `react-refresh/only-export-components` lint errors from mixed component + constant exports in `.jsx` files | 2026-03-23 | 2026-03-23 | Extracted JSX components into dedicated `.jsx` files, renamed constants to `.js` with re-exports (Cycle 35) |
| BUG-R027 | P4 | HTML Workflow | Negative/vague copy in scan modal, preview, upload fields ("Harmful content", "Sanitized preview", "Submit blocked") | 2026-03-23 | 2026-03-23 | Reframed to constructive language across 5 files (Cycle 35) |
