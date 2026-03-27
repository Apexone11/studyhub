# StudyHub System Audit — 2026-03-26

## Platform Overview

StudyHub is a GitHub-style collaborative study platform for college students.
Core features: share study sheets, fork and contribute changes, discover materials, collaborate through comments/stars/follows/announcements/notes/notifications.

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router 7, Vite 8 |
| Backend | Node.js 20+, Express 5, Prisma ORM |
| Database | PostgreSQL (via Railway) |
| Testing | Vitest + Supertest (backend), Playwright (frontend E2E) |
| Telemetry | Sentry, PostHog, Microsoft Clarity, Google Ads |
| Email | Resend (transactional) |
| File Scanning | ClamAV (optional) |
| CI/CD | GitHub Actions (5 workflows) |
| Hosting | Railway (backend + DB), Separate frontend deploy |

---

## 2. Database Schema — 42 Models

### Core Content

| Model | Fields | Purpose |
|-------|--------|---------|
| StudySheet | 26 | Study sheets with fork lineage, attachments, HTML versions |
| SheetHtmlVersion | 9 | HTML versions with compression |
| SheetCommit | 9 | Git-like version control (Sheet Lab) |
| SheetContribution | 8 | PR-style contributions between forks |
| Note | 9 | Private/shared markdown notes |
| NoteComment | 8 | Note annotations with anchor context |
| Comment | 5 | Sheet comments |
| FeedPost | 8 | Social feed posts with attachments |
| FeedPostComment | 5 | Feed post comments |
| Announcement | 5 | Admin broadcast messages |

### Users & Social

| Model | Fields | Purpose |
|-------|--------|---------|
| User | 29 | Central user model (35+ relations) |
| UserPreferences | 9 | Theme, notifications, privacy settings |
| UserSensitive | 6 | PII vault with envelope encryption |
| UserFollow | 3 | Social graph (follow/unfollow) |
| UserPinnedSheet | 5 | Profile pinned sheets |
| UserDailyActivity | 6 | Contribution heatmap data |
| Badge | 6 | Achievement catalog |
| UserBadge | 4 | Unlocked achievements |
| StarredSheet | 3 | Favorited sheets |
| Reaction | 3 | Sheet reactions (like/dislike) |
| FeedPostReaction | 3 | Feed post reactions |
| Notification | 8 | In-app notifications with priority |

### Auth & Security

| Model | Fields | Purpose |
|-------|--------|---------|
| VerificationChallenge | 11 | Email/auth verification codes |
| PasswordResetToken | 4 | Password reset flow |
| WebAuthnCredential | 10 | Passkey/biometric auth |
| AuditLog | 8 | Sensitive operation audit trail |

### Moderation

| Model | Fields | Purpose |
|-------|--------|---------|
| ModerationCase | 16 | Content moderation workflow |
| Strike | 6 | User violation records with expiry |
| Appeal | 8 | Appeal workflow against moderation |
| ModerationSnapshot | 8 | Content backup before takedown |
| ModerationLog | 9 | Moderation action audit trail |
| UserRestriction | 5 | Temporary write restrictions |

### Email & Infrastructure

| Model | Fields | Purpose |
|-------|--------|---------|
| EmailDeliveryEvent | 8 | Webhook delivery tracking |
| EmailSuppression | 9 | Suppressed email addresses |
| EmailSuppressionAudit | 5 | Suppression action log |
| FeatureFlag | 6 | Feature rollout control |
| ProvenanceManifest | 7 | Encrypted origin tracking |
| DeletionReason | 4 | Account deletion audit |

### Academic

| Model | Fields | Purpose |
|-------|--------|---------|
| School | 5 | Institution metadata |
| Course | 6 | Academic courses |
| Enrollment | 3 | User course registrations |
| RequestedCourse | 5 | Community course requests |

---

## 3. Backend — 21 Modules, 80+ Endpoints

### Module Inventory

| Module | Endpoints | Auth | Rate Limited |
|--------|-----------|------|-------------|
| **Admin** | 15 | requireAuth + requireAdmin | No |
| **Auth** | 10+ | Public | Yes (5-25/15min) |
| **Announcements** | 3 | Mixed (GET public, POST admin) | No |
| **Courses** | 3+ | requireAuth | No |
| **Dashboard** | 1 | requireAuth | No |
| **Feature Flags** | 5 | requireAuth + admin | No |
| **Feed** | 8+ | requireAuth | Yes (global) |
| **Moderation** | 10+ | requireAuth (admin for enforcement) | Yes (report: 10/hr) |
| **Notes** | 9 | Mixed (optionalAuth for reads) | Yes (120/min read, 30/min write) |
| **Notifications** | 5 | requireAuth | No |
| **Preview** | 1 | Token-based | No |
| **Provenance** | 4 | requireAuth | No |
| **Public** | 1 | None | No |
| **Search** | 1 | optionalAuth | Yes (120/min) |
| **Settings** | 8+ | requireAuth | No |
| **Sheets** | 20+ | Mixed | Yes (per-action) |
| **SheetLab** | 4+ | requireAuth | No |
| **Upload** | 5 | requireAuth | Yes (10-40/15min) |
| **Users** | 13 | Mixed | Yes (follow: 30/min) |
| **WebAuthn** | 6 | Mixed (admin for registration) | Yes (20/15min) |
| **Webhooks** | 1 | Svix-signed | No |

### Key Endpoints

**Feed**: `GET /api/feed` (13 parallel Prisma queries, has timing instrumentation)
**Search**: `GET /api/search?q=...&type=all` (4-5 parallel queries + visibility filter, has timing instrumentation)
**Sheet Detail**: `GET /api/sheets/:id` (7 queries: main + counts + contributions, has timing instrumentation)
**Note Detail**: `GET /api/notes/:id` (1 query, has timing instrumentation)

---

## 4. Frontend — 26 Pages, 30+ Components

### Pages

| Page | Route | Purpose |
|------|-------|---------|
| HomePage | `/` | Landing with hero, features, stats |
| LoginPage | `/login` | Username/password + Google OAuth |
| RegisterScreen | `/register` | 2-step registration + email verify |
| ForgotPasswordPage | `/forgot-password` | Password reset request |
| ResetPasswordPage | `/reset-password` | Token-based password reset |
| FeedPage | `/feed` | Social feed with posts, reactions, leaderboards |
| SheetsPage | `/sheets` | Sheet listing with filters, search, sort |
| SheetViewerPage | `/sheets/:id` | Sheet viewer with comments, reactions |
| SheetLabPage | `/sheets/:id/lab` | HTML sheet editor with live preview |
| UploadSheetPage | `/sheets/upload` | Sheet upload workflow |
| NotesPage | `/notes` | Markdown notes editor |
| NoteViewerPage | `/notes/:id` | Note viewer with comments |
| TestsPage | `/tests` | Practice tests (placeholder) |
| AnnouncementsPage | `/announcements` | Official announcements |
| MyCoursesPage | `/my-courses` | School + course selection |
| SettingsPage | `/settings` | 7-tab settings hub |
| UserProfilePage | `/users/:username` | Profile with activity, sheets, badges |
| AdminPage | `/admin` | 8-tab admin panel |
| Terms/Privacy/Guidelines/About | `/terms`, etc. | Legal pages |

### Key Components

Navbar, SearchModal (Ctrl+K), AppSidebar, NavbarNotifications, ConfirmDialog, ReportModal, EmailVerificationBanner, ModerationBanner, ActivityHeatmap, BadgeDisplay, Toast system, Skeleton loaders, RouteErrorBoundary, MentionText renderer

### State Management

- **Global**: React Context (`SessionProvider`) for auth/user state
- **Page-level**: Custom hooks per feature (`useFeedData`, `useSheetViewer`, `useNotesData`, etc.)
- **Polling**: `useLivePolling` with visibility/online pause (30s feed, 45s sheets, 60s comments)
- **Persistence**: localStorage for user cache, preferences, recently viewed, tutorial state

---

## 5. Security Measures

### Authentication

| Feature | Implementation |
|---------|---------------|
| Token type | JWT (24h expiry) |
| Cookie settings | httpOnly, secure (prod), sameSite:none (prod), path:/api |
| Fresh identity | DB lookup on every auth middleware call |
| Google OAuth | Full flow with account linking |
| WebAuthn/Passkeys | Admin-only registration, FIDO2 compliant |
| Email verification | Required with 3-day grace period |
| Idle timeout | 30min auto-logout (frontend) |

### CORS & Headers

| Header | Value |
|--------|-------|
| CORS origins | Restricted to FRONTEND_URL env vars only |
| CSP (app) | `default-src 'none'; script-src 'none'; frame-ancestors 'none'` |
| CSP (preview) | Isolated with no script-src, allow inline styles only |
| X-Frame-Options | DENY (app), removed for preview iframe |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=(), payment=() |
| HSTS | Enabled in production |

### CSRF Protection

- JWT-based CSRF tokens (not cookie-based)
- Auto-injected via frontend fetch shim
- Skips safe methods (GET, HEAD, OPTIONS)
- Bearer token clients exempt
- Origin/Referer pre-check as fallback

### Rate Limiting

| Scope | Limit |
|-------|-------|
| Global | 1000/15min |
| Login | 10/15min |
| Register | 8/60min |
| Upload (avatar) | 20/15min |
| Upload (attachment) | 40/15min |
| Notes read | 120/min |
| Notes write | 30/min |
| Search | 120/min |
| Follow | 30/min |
| Report | 10/60min |

### File Upload Security

| Check | Details |
|-------|---------|
| Size limits | Avatar 5MB, Cover 8MB, Attachment 10MB |
| MIME validation | Extension + Content-Type check |
| Magic bytes | `signatureMatchesExpected()` validates file signatures |
| Virus scan | ClamAV integration (optional, fail-closed) |
| Path traversal | `isPathWithinRoot()` bounds check |
| Filename sanitization | Alphanumeric + timestamp only |

### HTML Content Security (4-Tier System)

| Tier | Name | Trigger | Action |
|------|------|---------|--------|
| 0 | Clean | No suspicious patterns | Published |
| 1 | Flagged | Script/iframe/form tags, inline handlers | Published with warning |
| 2 | High Risk | Obfuscation, redirects, exfiltration, keyloggers | Admin review required |
| 3 | Quarantined | Credential capture, 3+ high-risk categories, crypto-miner, AV detection | Blocked |

Behavioral detection includes: `String.fromCharCode` obfuscation, hex/unicode escaping, `window.location` redirects, external form exfiltration, keylogger patterns, crypto-miner signatures, eval/Function constructor, fetch/XHR/WebSocket, document.cookie access.

### Access Control Patterns

| Content | Published | Draft/Private/Moderated |
|---------|-----------|------------------------|
| Sheet | All users | Owner/admin only |
| Note (public) | All users | Owner/admin only |
| Note (private) | Owner/admin | Owner/admin only |
| Feed post (clean) | All users | Owner/admin only |
| Attachments | Follow sheet/post visibility | Return 404 (not 403) |
| Profile | Per visibility setting | Owner/admin only |

Profile visibility: 3 levels (public, enrolled-only, private)

### Moderation System

- **Auto-scan**: On note/sheet/post creation
- **Manual review**: Admin queue with claim/assign
- **Strikes**: Per-case, with expiry and decay
- **Restrictions**: Auto-triggered at 3+ active strikes
- **Appeals**: User-initiated, admin-reviewed, content restoration on approval
- **Content snapshots**: Stored before takedown for restore
- **Audit trail**: ModerationLog for all actions
- **Notification priority**: Smart classification based on severity, repeat offenders, public surfaces

### SQL Injection Prevention

- Prisma ORM exclusively (no raw SQL concatenation)
- FTS uses parameterized `$queryRawUnsafe` with `$1`, `$2` bindings
- Bootstrap schema uses hardcoded SQL only

---

## 6. Performance Instrumentation (S-10.1)

### Backend Timing (`[perf]` logs)

| Endpoint | Sections Timed |
|----------|---------------|
| `GET /api/feed` | 12 sections (existing `settleSection` pattern) |
| `GET /api/search` | 4-5 sections (sheets, courses, users, notes, visibility) |
| `GET /api/sheets/:id` | 7 sections (main, likes, dislikes, comments, starred, reaction, contributions) |
| `GET /api/notes/:id` | 1 section |
| Comments endpoints (3) | 2-3 sections each |

Slow query warning threshold: 500ms

### Frontend Timing (PostHog `page_timing` events)

| Page | Marks |
|------|-------|
| Feed | fetchStart -> fetchEnd -> contentVisible |
| Sheet Detail | fetchStart -> fetchEnd -> contentVisible |
| Note Detail | fetchStart -> fetchEnd -> contentVisible |
| Search Modal | Per-query apiLatencyMs + totalResults |

---

## 7. Testing Coverage

### Backend: 42 test files, 531 tests

**Security-focused tests**: IDOR (3 files), auth cookies, rate limiting, security headers, upload security, HTML security (2 files), attachment access control, PII vault, KMS envelope encryption, remote allowlist, redaction

**Feature tests**: Auth, feed, notes, sheets (workflow integration), search, settings, courses, dashboard, admin, announcements, notifications (priority + policy), moderation (reporting + visibility), webhooks, preview, HTML draft workflow

### Frontend: 14 Playwright specs

Smoke tests for auth, feed, admin email, responsive layout, navigation, search privacy/regression, HTML preview/security/upload, visual baselines (49 screenshots across themes/viewports)

### CI/CD: 5 GitHub Actions workflows

CI (lint + build + test + Playwright), CodeQL (SAST), JScrambler (code integrity), nightly regression, quality gates

---

## 8. Documentation — 31 Files

- **Release logs**: v1.0.0, v1.5.0, v1.7.0 + formal release notes
- **Security runbooks**: Incident response, outage, DB restore, secrets rotation
- **Deployment**: Railway checklist, Google OAuth setup
- **Planning**: Design specs, weekly roadmap, cycle plans (40-42)
- **QA**: Smoke checklist, visual QA policy

---

## 9. Infrastructure

### Docker Compose (6 services)

PostgreSQL 16, ClamAV, Backend (Node 24), pgAdmin 4, Frontend (Vite dev), persistent volumes

### Railway Production

Backend + PostgreSQL deployed on Railway. Frontend deployed separately. Bootstrap schema runs on every startup for self-healing column creation.

---

## 10. Known Gaps & Recommendations

### Recently Fixed (This Session)

| Issue | Status |
|-------|--------|
| `ModerationSnapshot.permanentlyDeletedAt` missing migration | Fixed (migration + bootstrap) |
| `ModerationCase.contentPurged` missing migration | Fixed (migration + bootstrap) |
| `ModerationLog` table never created | Fixed (migration + bootstrap) |
| `StudySheet.rootSheetId` no bootstrap safety net | Fixed (bootstrap added) |
| `SheetCommit.kind` no bootstrap safety net | Fixed (bootstrap added) |

### Observations

| Area | Status | Notes |
|------|--------|-------|
| Auth | Strong | 24h JWT, secure cookies, fresh DB lookups, WebAuthn |
| CORS | Excellent | Restricted to env vars only |
| Rate Limiting | Comprehensive | Global + per-route; some admin/settings endpoints unprotected |
| Input Validation | Good | Manual checks throughout; no schema validation library (Zod/Joi) |
| File Upload | Strong | MIME + magic bytes + optional ClamAV |
| HTML Security | Excellent | 4-tier behavioral analysis |
| CSP/Headers | Excellent | Strict CSP, helmet, HSTS |
| CSRF | Strong | JWT-based with origin fallback |
| Moderation | Strong | Auto-scan, strikes, appeals, snapshots, audit trail |
| Testing | Good | 531 backend + 14 E2E specs; no frontend unit tests |
| Performance | In Progress | S-10.1 instrumentation complete, fixes pending S-10.2 |
| Documentation | Good | Security runbooks, deployment guides, release logs |

S-10.1 (Measurement) is complete. Here's what was added:

Backend — [perf] structured timing logs
New requestTiming.js utility (timedSection + logTiming) applied to 6 endpoints:

Endpoint	Sections Timed
GET /api/search	sheets, courses, users, notes, visibility (4–5 parallel)
GET /api/sheets/:id	sheet-main, likes, dislikes, commentCount, starred, userReaction, contributions (7)
GET /api/notes/:id	note-main (1)
GET /api/notes/:id/comments	note-lookup, comments, count (3)
GET /api/sheets/:id/comments	sheet-lookup, comments, count (3)
GET /api/feed/posts/:id/comments	comments, count (2)
Each log entry includes durationMs, queryCount, per-section timings, and slowSections (any section ≥500ms).

Frontend — page_timing PostHog events
New usePageTiming.js hook reports apiLatencyMs + timeToContentMs for:

Feed — items arrive
Sheet detail — sheet data arrives
Note detail — note data arrives
Search modal — per-query latency + result count
Validation
Backend tests: 531/531 pass
Backend lint: 6 pre-existing only
Frontend lint: Clean
Frontend build: Clean (310ms)
Once deployed, check Railway logs for [perf] entries and PostHog for page_timing events to identify the top bottlenecks for S-10.2.

Hotfix ready. The moderation cleanup scheduler was crashing because ModerationSnapshot.permanentlyDeletedAt existed in the Prisma schema but had no migration — the column was never created in the production database.

What was added:
Migration — 20260326000001_add_snapshot_permanently_deleted_at/migration.sql adds the missing column
Bootstrap safety net — bootstrapSchema.js ADD COLUMN IF NOT EXISTS entry so it self-heals on startup even if the migration hasn't run yet
Once deployed, Railway will run the migration automatically (prisma migrate deploy) and the cleanup scheduler will stop crashing. The [perf] timing logs from S-10.1 will also start flowing.

The cleanup scheduler queries these columns:

ModerationSnapshot.restoredAt — in original migration ✅
ModerationSnapshot.permanentlyDeletedAt — fixed in migration 20260326000001 + bootstrap ✅
ModerationSnapshot.createdAt — in original migration ✅
ModerationCase.status — in original migration ✅
ModerationCase.contentPurged — fixed in migration 20260326000002 + bootstrap ✅
ModerationCase.appeals (relation) — Appeal table exists ✅
ModerationLog (via logModerationEvent) — fixed in migration 20260326000002 + bootstrap ✅
All covered. Let me also quickly verify the moderationLogger to make sure it doesn't reference any other missing columns.

Hotfix 2 complete. Here's the full picture of what was missing and what's now fixed:

Migration 20260326000002 adds:
ModerationCase.contentPurged — Boolean column the cleanup scheduler needs to mark cases as purged
ModerationLog table — Entire audit trail table that was never created (all logModerationEvent() calls were silently failing)
Bootstrap safety net now covers all 4 gaps:
Item	Type
ModerationCase.contentPurged	Column
ModerationLog (full table + indexes + FK)	Table
StudySheet.rootSheetId	Column (safety net for existing migration)
SheetCommit.kind	Column (safety net for existing migration)
Validation
531/531 backend tests pass
Lint clean (6 pre-existing only)
After deploy, Railway will run migration 44 (20260326000002), and the cleanup scheduler + moderation logger will both start working correctly.