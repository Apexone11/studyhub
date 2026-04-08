# Moderation System Overhaul — Design Spec

**Date:** 2026-03-26
**Approach:** Feature-grouped (B) — four independent groups, each self-contained and testable.

---

## Decisions

| Topic | Choice |
|-------|--------|
| Soft-delete grace period | 30 days |
| Admin user search fields | Username + Email + Display Name |
| Content preview style | Rich preview + side-by-side case context |
| Navigation to reported content | Deep link for posts, viewer pages for sheets/notes |
| Tutorial behavior | Once per page, versioned keys for major updates |
| Admin UI styling approach | Component-level refactor with shared primitives |
| User log system | Admin audit log + user-visible history + CSV export |

---

## Group 1: Tutorial Fix

### Problem
`useTutorial()` auto-triggers on every page mount. The `seen` flag in localStorage does not persist correctly across sessions, causing the tutorial to show on every login.

### Design

**Versioned localStorage keys:**
- Change from `tutorial_${pageKey}_seen` to `tutorial_${pageKey}_v${version}_seen`.
- Each page's steps definition gets a `version` field. Bumping the version re-shows the tutorial once for all users.

**Fix persistence bug:**
- Move the `seen` check to a synchronous `localStorage.getItem()` call before setting `run: true`, not in a delayed effect.
- Only set `run: true` if the versioned key is absent from localStorage.
- The delay stays for animation smoothness but is gated behind the "not seen" check.

**Keep restart button:**
- The existing `restart()` function on each page remains unchanged.

### Files touched
- `frontend/studyhub-app/src/lib/useTutorial.js` — fix persistence logic, add version support
- `frontend/studyhub-app/src/lib/tutorialSteps.js` — add version constants to each step set

---

## Group 2: Admin Moderation UI Overhaul

### 2A: Shared Admin UI Primitives

**Problem:** Admin components use inline styles with hardcoded colors, inconsistent spacing, and duplicated patterns.

**New files under `frontend/studyhub-app/src/pages/admin/components/`:**

| Primitive | Purpose |
|-----------|---------|
| `AdminCard.jsx` | Card container: 20-24px padding, 14px border radius, `--sh-surface` bg, `--sh-border` border |
| `AdminTable.jsx` | Table: proper column spacing, `--sh-slate-*` header tokens, 12px 16px cell padding, hover highlight |
| `AdminModal.jsx` | Centered overlay modal: backdrop blur, configurable width (sm/md/lg/xl), z-index, scroll handling, escape key close |
| `AdminInput.jsx` | Text input with label: 40px height, 12px label-input gap, `--sh-border` colors |
| `AdminSelect.jsx` | Dropdown, same styling as AdminInput |
| `AdminPill.jsx` | Status badges: `--sh-danger-*`, `--sh-success-*`, `--sh-warning-*`, `--sh-info-*` semantic tokens |
| `AdminSplitPanel.jsx` | Side-by-side layout for content preview + case context |
| `admin-primitives.css` | Shared CSS for all primitives, zero hardcoded colors |

**Migration from `adminConstants.js`:**
- Helper functions (`formatDateTime`, `formatLabel`) stay in `adminConstants.js`.
- Style objects (`tableHeadStyle`, `tableCell`, `pillButton`, etc.) migrate into CSS file and primitives.
- Old exports stay temporarily for backward compat, then get removed.

---

### 2B: Admin Strike Form — User Search + Auto Case ID

**Problem:** Admins must type a raw `userId` integer. Case ID is manual input.

**New component: `UserSearchInput.jsx`**
- Typeahead/autocomplete input, debounced 300ms.
- Minimum 2 characters before search fires.
- Dropdown shows results: avatar + username + display name + email (truncated).
- Selecting a user populates `userId` internally, shows username/display name visually.
- Clear button to reset selection.
- Uses inline SVG magnifying glass icon (stroke-based, 1.5-2px stroke width, rounded joins, `currentColor`).
- All icons across the moderation system are inline SVGs matching this style. No emojis anywhere, including ModerationBanner which currently uses emoji characters.

**New backend endpoint: `GET /api/admin/users/search?q=<term>&limit=10`**
- Admin-only middleware (`requireAdmin`).
- Prisma `OR` query across `username`, `email`, `displayName` with `contains` + `mode: 'insensitive'`.
- Returns: `[{ id, username, displayName, email, avatarUrl }]`.
- Rate limited: 30 requests per minute.

**Case ID changes:**
- Remove the Case ID text input from the strike form.
- When a strike is issued without a linked case, the backend auto-creates a lightweight `ModerationCase` with source `admin_manual`, status `confirmed`, and links the strike.
- Every strike has a traceable case ID for audit trail.
- When issuing a strike from a case detail view, case ID auto-populates.

**Redesigned strike form layout:**
- Vertical layout (not cramped horizontal).
- Fields: User (search input), Reason (text input), Linked Case (read-only auto-assigned).
- Proper 12px label-to-input spacing.
- Uses `AdminCard`, `AdminInput` primitives.

---

### 2C: Content Preview — Rich Split Panel

**Problem:** "View content" opens a new tab hitting attachment preview endpoint which 404s.

**New component: `ContentPreviewModal` (uses AdminModal + AdminSplitPanel)**

**Left panel — Content preview:**
- Renders content type-appropriately:
  - Posts: body text, attached images inline (max-height 400px, scaled), embedded media.
  - Sheets: title, description, content preview, attachment thumbnail (images inline, PDFs in embedded viewer, other files show icon + download link).
  - Notes: title, rendered body text.
  - Comments: comment text with parent context (which post/sheet/note it belongs to).
- Fetches from existing `GET /api/admin/moderation/cases/:id/preview` — no new tab.
- Attachment images rendered as `<img>` inside the modal.
- Fix attachment preview 404: ensure route handles missing attachments gracefully.
- "View on site" link at top of left panel.

**Right panel — Case context:**
- All case metadata: reported user, reporter, category, source, status, confidence, dates.
- Reporter note.
- Linked strikes and appeals.
- Action buttons (Confirm / Dismiss / Issue Strike).
- Scrolls independently from left panel.

**Modal behavior:**
- Opens on case row click (replaces current inline expansion).
- Max-width 960px, 90vw on smaller screens.
- Backdrop click, X button, or Escape key to close.
- Body scroll locked while open.

**Responsive rules:**
- 960px+: side-by-side, 55% content / 45% context.
- 768-960px: 50/50 split, smaller font/padding.
- Below 768px: stacks vertically, content on top, context below. Each section scrolls independently with max-height.
- All breakpoints: images scale `max-width: 100%`, text wraps, buttons wrap, padding scales with `clamp()`.

---

### 2D: Navigation — Deep Links to Exact Content

**Problem:** "View content" links go to generic top-level pages, not the exact item.

**Link generation (backend fix in preview endpoint):**
- `post` / `feed_post` -> `/feed?post={id}`
- `sheet` -> `/sheets/{id}`
- `note` -> `/notes/{id}`
- `post_comment` -> `/feed?post={postId}&comment={commentId}`
- `sheet_comment` -> `/sheets/{sheetId}?comment={commentId}`
- `note_comment` -> `/notes/{noteId}?comment={commentId}`

**Feed deep link (frontend):**
- `FeedPage` reads `post` query param on mount.
- Scrolls to post using `scrollIntoView({ behavior: 'smooth', block: 'center' })`.
- Briefly highlights target post with subtle pulse animation (2s fade using `--sh-info-bg`).
- If post not in current feed, fetch individually and prepend with "This post was linked directly" context bar.

**Comment deep links:**
- Sheet/Note viewer pages read `comment` query param, scroll to comment, apply same highlight pulse.

**Admin panel integration:**
- "View on site" link in ContentPreviewModal left panel header.
- Small icon-button on each case row in cases table.

---

## Group 3: User-Facing Moderation Tab Redesign

### Problem
AppealModal is rendered inline, not centered. My Cases and My Appeals tabs have basic spacing. Layout doesn't match other settings tabs.

### Design

**AppealModal fix:**
- Extract from inline rendering into proper centered overlay modal.
- Fixed position, centered vertically and horizontally.
- Backdrop with blur overlay.
- Max-width 520px, 92vw on mobile.
- Scroll inside modal if content overflows viewport.
- Escape key and backdrop click to close.

**ModerationTab layout improvements:**
- My Status: stats cards with consistent card containers, 16px gap, restriction banner with 16px padding.
- My Cases: case cards with 20px padding, clear visual separation between fields. "Appeal Decision" button as primary styled button.
- My Appeals: appeal cards with category, date, status, review note. Empty state with proper icon (SVG, not emoji) instead of plain text.
- My History (new): simplified log entries from `GET /api/moderation/my-log` (see Group 4C).

**Responsive:**
- Stats cards stack vertically below 600px.
- Modal shrinks to 92vw with reduced padding on mobile.
- Cards full-width at all breakpoints.

**No hardcoded colors** — all inline hex values replaced with `--sh-*` tokens.

---

## Group 4: Deletion Lifecycle

### 4A: Soft Delete Verification & Restoration

**What already works (no changes needed):**
- Appeal approval restores content to `clean`/`published` status.
- Strikes decayed on approval, restrictions lifted if < 4 active.
- Snapshots created on case confirmation, marked `restoredAt` on approval.
- Snapshots persist even after restoration — backup copy preserved permanently.
- Feed posts and notes filter by `moderationStatus: 'clean'`.
- Sheets filter by `status: 'published'`.
- User notifications sent on approval.

**Gaps to fix:**

| Gap | Fix |
|-----|-----|
| Feed post comments not filtered by `moderationStatus` | Add `moderationStatus: 'clean'` to comment queries in feed endpoint |
| Sheet comments not filtered by `moderationStatus` | Add `moderationStatus: 'clean'` to sheet comment queries |
| Sheets don't use `moderationStatus` consistently | Add `moderationStatus` filter as belt-and-suspenders to sheet listing queries |
| `restoreContent` silently swallows errors | Add structured error logging, return success/failure to admin, rollback on partial failure via transaction |
| No admin endpoint for snapshot history | Add `GET /api/admin/moderation/snapshots/:caseId` |
| ModerationBanner uses emoji icons | Replace with SVG icons (warning triangle, shield-x) matching StudyHub icon style |
| Notification links to wrong tab | Fix link from `/settings?tab=account` to `/settings?tab=moderation` |

---

### 4B: Permanent Deletion Scheduler

**New file: `backend/src/lib/moderationCleanupScheduler.js`**
- Runs every 6 hours (configurable via `MODERATION_CLEANUP_INTERVAL_MS`).
- Same pattern as existing `htmlArchiveScheduler.js`.

**Each run:**

1. **Find expired unrestored content:** `ModerationSnapshot` where `restoredAt` is null, `createdAt` older than 30 days, linked case status is `confirmed`, AND no pending appeal exists for the case.
2. **Hard delete content:** delete post/sheet/note/comment record, clean up attachments via `cleanupAttachmentIfUnused()`, cascading deletes handle children.
3. **Preserve snapshot:** `ModerationSnapshot` stays as permanent audit record. Mark with `permanentlyDeletedAt` timestamp.
4. **Update case:** set `contentPurged: true` on `ModerationCase`.
5. **Write to user log** (see 4C).

**Schema additions:**
```
ModerationSnapshot:
  + permanentlyDeletedAt  DateTime?

ModerationCase:
  + contentPurged  Boolean  @default(false)
```

**Safety guards:**
- Only processes `confirmed` cases — never `pending`, `reversed`, `dismissed`.
- Skips content with pending appeal regardless of age.
- Transaction per item — one failure doesn't block others.
- Logs each deletion with case ID, content type, content ID, owner ID.
- Dry-run mode via `MODERATION_CLEANUP_DRY_RUN=true`.
- Idempotent — safe to re-run if interrupted.

---

### 4C: User Moderation Log + Admin Audit Trail + Export

**New Prisma model: `ModerationLog`**
```
model ModerationLog {
  id            Int       @id @default(autoincrement())
  userId        Int
  action        String    // see action list below
  caseId        Int?
  strikeId      Int?
  appealId      Int?
  contentType   String?
  contentId     Int?
  reason        String?
  performedBy   Int?      // admin ID or null for system
  metadata      Json?
  createdAt     DateTime  @default(now())

  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([caseId])
}
```

**Actions logged:**
- `case_opened` — auto-scan or user report
- `case_confirmed` — admin confirms violation
- `case_dismissed` — admin dismisses case
- `strike_issued` — admin issues strike
- `strike_decayed` — strike removed via appeal
- `strike_expired` — 90-day auto-expiry
- `appeal_submitted` — user submits appeal
- `appeal_approved` — admin approves appeal
- `appeal_rejected` — admin rejects appeal
- `restriction_applied` — auto-restriction at 4+ strikes
- `restriction_lifted` — admin lifts restriction
- `content_purged` — 30-day permanent deletion

**Integration points (add logging calls to):**
- `moderationEngine.js` — case creation, content hide, restore, strike threshold
- `moderation.admin.enforcement.controller.js` — strike issue, appeal review, restriction lift
- `moderation.admin.cases.controller.js` — case confirm, case dismiss
- `moderation.user.controller.js` — appeal submission
- `moderationCleanupScheduler.js` — content purge

**User-visible history:**
- New "My History" section in user Moderation tab.
- Endpoint: `GET /api/moderation/my-log?page=1&limit=20`.
- Shows simplified entries: date, action description, status.
- Does NOT show admin names or internal metadata.

**Admin-visible history:**
- Endpoint: `GET /api/admin/moderation/users/:userId/log?page=1&limit=50`.
- Full entries: admin names, metadata, linked case/strike/appeal IDs (clickable).

**Export:**
- Endpoint: `GET /api/admin/moderation/users/:userId/log/export?format=csv`.
- CSV format. Filename: `moderation-log-{username}-{date}.csv`.
- All fields: date, action, case ID, content type, reason, admin, metadata.
- Rate limited: 10 exports per hour per admin.
- Streams CSV (does not build in memory) to prevent OOM on large histories.

**Security:**
- User log requires authentication, returns only own records.
- Admin log and export require `requireAdmin` middleware.
- No user can see another user's log.
- Admin names never exposed to non-admin users.

---

## Group 5: Security Audit & Bug Fixes

| Issue | Risk | Fix |
|-------|------|-----|
| `restoreContent` silently catches all errors — partial restoration leaves broken state | High | Structured error logging, success/failure status to admin, rollback via transaction |
| Feed post comments not filtered by `moderationStatus` | Medium | Add `moderationStatus: 'clean'` to comment queries |
| Sheet comments not filtered by `moderationStatus` | Medium | Add `moderationStatus: 'clean'` to sheet comment queries |
| Appeal endpoint race condition on duplicate check | Low | Wrap duplicate check + create in transaction |
| Attachment preview 404 for missing files | Medium | Return structured error with "Content unavailable" message |
| No rate limit on admin case preview | Low | Add 30/min rate limit |
| Cleanup scheduler could delete content with pending appeal at edge of 30-day window | High | Explicitly skip content with pending appeal regardless of age |
| CSRF on appeal submission | Medium | Verify `sameSite` cookie settings are correct |
| Notification links to wrong settings tab | Low | Fix to `/settings?tab=moderation` |
| All hardcoded hex colors in admin components | Medium | Replace with `--sh-*` CSS custom property tokens |
| All emoji icons in ModerationBanner and empty states | Low | Replace with inline SVG icons matching StudyHub style |
| User search endpoint security | Medium | Min 2 chars, max 10 results, no empty/wildcard queries, admin-only |
| Export endpoint memory | Medium | Stream CSV, don't build in memory |
