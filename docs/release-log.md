<!-- markdownlint-disable MD024 MD032 -->

# StudyHub Release Log

This is the public-facing changelog for the StudyHub platform. Every PR
that touches `backend/`, `frontend/`, `scripts/`, `.github/workflows/`,
`docker-compose.yml`, or `package.json` MUST add a one-line entry under
the most recent cycle heading. CI enforces this via the
`Enforce release log update` step in `.github/workflows/ci.yml`.

Detailed internal cycle notes (decisions, security checklists, agent
hand-offs, day-by-day breakdowns) live in `docs/internal/` and are
intentionally not tracked in git. Promote individual entries from the
internal log into this file when they describe user-visible behavior.

## How to add an entry

1. Find the most recent cycle heading below.
2. Add a single bullet under it summarizing the change in <120 chars.
3. Include the PR number if you have it (`(#267)`).
4. If your change is the first entry for a new beta cycle, add a new
   `## v<MAJOR>.<MINOR>.<PATCH>-beta — <date>` heading above the previous
   one and add your bullet there.
5. Keep entries factual and user-visible. Skip purely internal
   refactors and metadata churn — those belong in the private log.

---

## v2.0.0-beta — in progress

### CI / infrastructure

- **CI branch coverage hotfix.** StudyHub CI and CodeQL now run for
  `approved-branch` pull requests and pushes in addition to `main`.
- **CI hotfix (Day 2.5).** Pin `github/codeql-action` init + analyze to
  `@v3` to restore CodeQL Advanced runs, and switch the release-log gate
  to track this public file at `docs/release-log.md` instead of the
  gitignored internal log so PRs can satisfy it.
- **Railway preDeploy now provisions SHIPPED design_v2 flags.** Chained
  `npm run seed:flags` between `prisma migrate deploy` and the geoip
  refresh in `backend/railway.toml`. Closes the activation gap where
  fail-closed flag evaluation rendered Phase 1/2/3 features invisible
  in production whenever a deploy preceded the manual seed step. Seed
  failure aborts the deploy by design (no `||` fallback).
- **CORS hardening — drop `public: true` from CDN-cached endpoints.**
  `/api/courses/schools`, `/api/courses/popular`, `/api/feed/trending`,
  and `/api/platform-stats` no longer mark themselves `public` for
  shared-CDN caching. Cloudflare ignores `Vary: Origin` on non-
  Enterprise plans, so a shared cache could replay one origin's CORS
  headers to every other origin. Browser cache (per-user, honors Vary)
  keeps the same user-perceived speedup. Also drops `/tests` from the
  sidebar hover-prefetch map since that page has no backend route yet.

### Sheets

- **`StudySheet.previewText` column + extractor + backfill (#267).**
  Sheet create/update now persists a server-extracted plain-text preview
  (≤240 chars, emoji-safe truncation). Existing rows are populated by
  `npm --prefix backend run backfill:previewText`. Powers the Sheets
  Grid card preview without re-rendering sanitized HTML on the client.
- **`SheetContribution.reviewComment` migration (#267).** Idempotent
  `ADD COLUMN IF NOT EXISTS` migration to heal production schema drift
  that was causing reviewer-comment writes to fail.
- **Sheet Lab history deep-linking (#267).** History tab now reads
  `?tab=history&commit=<id>` and expands the matching commit on load,
  and the commit toggle keeps the URL in sync so links can be shared.

### Phase 4 — Sheets browse refresh (2026-04-27)

- Sheets page now offers a Grid/List view toggle (List default; choice
  persists in localStorage; URL `?view=grid` or `?view=list` overrides).
- New "Search across StudyHub" toggle on Sheets bypasses the school filter
  for cross-school discovery.
- Filter pills now show an active selected state when applied.
- Sheet cards in Grid view show a 3-line preview extracted from the sheet
  body (new `previewText` column, backfilled for existing sheets).
- Behind `design_v2_sheets_grid` feature flag (now SHIPPED in production).

### Phase 3 — Inline Hub AI suggestion card (2026-04-28)

- New `AiSuggestion` model with daily quota shared with Hub AI's
  `AiUsageLog`. Three endpoints under `/api/ai/suggestions`
  (`GET /`, `POST /refresh`, `POST /:id/dismiss`).
- Frontend `AiSuggestionCard` mounted on the own-profile Overview tab
  below the Phase 2 Upcoming Exams card. 5-state matrix (loading /
  happy / empty / quota_exhausted / error). Refresh disables itself
  after a 429; dismiss is optimistic with reconciliation on 5xx.
- Email + phone PII redacted from both the AI input and the AI output
  before persistence.
- Gated behind the `design_v2_ai_card` feature flag.

### Phase 2 Day 4 — Upcoming Exams write-path UI (2026-04-24)

- Author-side create / edit / delete UI for `UpcomingExam` rows on the
  own-profile Overview, fed by the existing `/api/exams` CRUD endpoints
  and the `preparednessPercent` column added in Phase 2.
- Gated behind the `design_v2_upcoming_exams` flag.

### Phase 2 — Upcoming Exams (2026-04-24)

- New `UpcomingExam` schema + migration with `preparednessPercent`
  column. New `/api/exams` CRUD module with full security baseline
  (`requireAuth`, `originAllowlist` on writes, per-endpoint rate
  limiters, owner check on update/delete).
- Component-kit foundation (`Card`, `Button`, `Chip`, `Skeleton`)
  introduced for use across v2 phases.

### Phase 1 — UserProfilePage widgets + AppSidebar refresh (2026-04-23)

- Personal overview widgets on `UserProfilePage` (Overview / Study /
  Sheets / Posts / Achievements tabs) replace the legacy `/dashboard`
  page; `/dashboard` now redirects to `/users/:me`.
- `AppSidebar` v2 chrome refresh: token-driven colors, refined nav
  spacing, and role-label helper for self-learner / student / teacher.

### Phase 0 — Design refresh foundation (2026-04-19 → 2026-04-23)

- Plus Jakarta Sans + warm-paper (`#f6f5f2`) "Campus Lab" identity.
  CSS custom-property tokens (`--sh-*`) become the source of truth for
  colors, spacing, and surfaces.
- Emoji policy locked: emoji are permitted only inside user-generated
  content (feed posts, messages, notes, comments, group discussions,
  profile bios) and never in UI chrome.
- Feature-flag evaluation switched to fail-closed in all environments
  with centralized seeding via `scripts/seedFeatureFlags.js`.

---

## v1.x — pre-v2 highlights

Selected user-visible changes from the v1 line are summarized here for
historical context. Full v1 detail lives in the internal log.

### Messaging & social

- Real-time DM and group chat (`/messages`) with Socket.io, soft delete
  on messages, 15-minute edit window, per-conversation unread counts,
  and a `/messages?dm=<userId>` profile auto-start flow.
- Bidirectional block / one-directional mute system across feed,
  search, and messaging.

### Study Groups

- `/study-groups` with member roles, group resources, scheduled study
  sessions (`GroupSession` + RSVPs), and a Q&A discussion board.

### Hub AI assistant

- Streaming Claude integration at `/ai` with full-page chat plus a
  floating bubble on every authenticated route. Per-plan daily message
  quotas (regular / verified / pro / admin) tracked in `AiUsageLog`.
- Sheet generation produces full HTML documents that flow through the
  same security scan tier-system as user-uploaded HTML.

### Payments

- Stripe Checkout for monthly / yearly Pro subscriptions plus variable
  donations. Customer Portal for self-service plan management. Public
  `/supporters` leaderboard. Admin Revenue tab.

### Notes

- `MyNotes` system with pinning, tags, stars, and `NoteVersion` history
  for revert / compare flows.

### Trust & safety

- Plagiarism detection on study sheet uploads, admin moderation
  dashboard, approval queue UI, weekly AI usage caps, and waitlist
  onboarding for new schools.
