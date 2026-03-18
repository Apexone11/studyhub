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
| BUG-006 | P4 | SecurityTab | Google link flow is placeholder text only, not functional | 2026-03-18 | Open |
| BUG-007 | P3 | LoginPage | Email verification gate still shows for non-Google users | 2026-03-18 | In Progress |

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
