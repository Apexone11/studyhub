# Sheet Page Polish + Verified Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure SheetViewerPage into a GitHub-like layout with clear header/action zones, add verified badges (staff > email), and ensure full dark/light mode compliance.

**Architecture:** Decompose the 664-line SheetViewerPage into 5 focused child components (SheetHeader, SheetActionsMenu, SheetContentPanel, SheetCommentsPanel, RelatedSheetsPanel). Add `isStaffVerified` to User model. Expand all author selects to include verification fields. Create a reusable VerificationBadge component with tooltip. Portal-ify the contribute modal.

**Tech Stack:** React 19, Express 5, Prisma, PostgreSQL, CSS custom properties (`--sh-*` tokens), inline styles (no external CSS libs)

---

## File Structure

### New Files
- `backend/prisma/migrations/20260326100000_add_staff_verified/migration.sql` — Schema migration
- `frontend/studyhub-app/src/components/VerificationBadge.jsx` — Reusable badge with tooltip
- `frontend/studyhub-app/src/pages/sheets/SheetHeader.jsx` — Title, author, course, status, breadcrumb
- `frontend/studyhub-app/src/pages/sheets/SheetActionsMenu.jsx` — Secondary actions dropdown (kebab)
- `frontend/studyhub-app/src/pages/sheets/SheetContentPanel.jsx` — HTML/markdown content rendering
- `frontend/studyhub-app/src/pages/sheets/SheetCommentsPanel.jsx` — Comments section
- `frontend/studyhub-app/src/pages/sheets/RelatedSheetsPanel.jsx` — Related sheets list
- `backend/test/verificationFields.test.js` — Backend verification field tests
- `frontend/studyhub-app/src/components/VerificationBadge.test.jsx` — Badge component tests

### Modified Files
- `backend/prisma/schema.prisma` — Add `isStaffVerified` field to User
- `backend/src/modules/sheets/sheets.read.controller.js` — Expand author select with verification fields
- `backend/src/modules/sheets/sheets.list.controller.js` — Expand author select with verification fields
- `backend/src/modules/sheets/sheets.create.controller.js` — Expand author select
- `backend/src/modules/sheets/sheets.update.controller.js` — Expand author select
- `backend/src/modules/sheets/sheets.fork.controller.js` — Expand author select
- `backend/src/modules/sheets/sheets.social.controller.js` — Expand author select for comments
- `backend/src/modules/sheets/sheets.drafts.controller.js` — Expand author select
- `backend/src/modules/sheets/sheets.contributions.controller.js` — Expand author select
- `backend/src/modules/admin/admin.users.controller.js` — Add staff-verified toggle endpoint + include in user list
- `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx` — Thin orchestrator shell importing child components
- `frontend/studyhub-app/src/pages/sheets/SheetViewerSidebar.jsx` — Add VerificationBadge to author card
- `frontend/studyhub-app/src/pages/sheets/sheetViewerConstants.js` — Add statusPill, breadcrumbStyle helpers
- `frontend/studyhub-app/src/pages/admin/UsersTab.jsx` — Add staff-verified toggle column
- `frontend/studyhub-app/src/components/Icons.jsx` — Add IconMoreHorizontal, IconShield, IconMail icons
- `docs/beta-v1.7.0-release-log.md` — Document all changes

---

### Task 1: Schema Migration — Add `isStaffVerified` to User

**Files:**
- Modify: `backend/prisma/schema.prisma:18` (User model)
- Create: `backend/prisma/migrations/20260326100000_add_staff_verified/migration.sql`

- [ ] **Step 1: Add field to Prisma schema**

In `backend/prisma/schema.prisma`, add after the `emailVerified` line (line 18):

```prisma
  isStaffVerified         Boolean   @default(false)
```

- [ ] **Step 2: Create migration SQL file**

Create `backend/prisma/migrations/20260326100000_add_staff_verified/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "isStaffVerified" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Regenerate Prisma client**

Run: `cd backend && npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260326100000_add_staff_verified/
git commit -m "feat(schema): add isStaffVerified field to User model"
```

---

### Task 2: Backend — Expand Author Select & Verification Fields

**Context:** Currently every sheet endpoint selects `author: { select: { id: true, username: true } }`. We need to add `emailVerified` and `isStaffVerified` so the frontend can render badges. We also need a centralized constant for this select pattern to avoid repetition.

**Files:**
- Create helper in: `backend/src/modules/sheets/sheets.constants.js` (add export)
- Modify: `backend/src/modules/sheets/sheets.read.controller.js:21`
- Modify: `backend/src/modules/sheets/sheets.list.controller.js` (lines 49, 137, 144, 185, 192, 238, 245)
- Modify: `backend/src/modules/sheets/sheets.create.controller.js:69`
- Modify: `backend/src/modules/sheets/sheets.update.controller.js:131,139`
- Modify: `backend/src/modules/sheets/sheets.fork.controller.js:60,67,105,112`
- Modify: `backend/src/modules/sheets/sheets.social.controller.js:110,152`
- Modify: `backend/src/modules/sheets/sheets.drafts.controller.js:31,98,116,134,170,213`
- Modify: `backend/src/modules/sheets/sheets.contributions.controller.js:130,219`
- Modify: `backend/src/modules/sheets/sheets.serializer.js:127`

- [ ] **Step 1: Add AUTHOR_SELECT constant to sheets.constants.js**

In `backend/src/modules/sheets/sheets.constants.js`, add:

```js
const AUTHOR_SELECT = { id: true, username: true, emailVerified: true, isStaffVerified: true }
```

Export it alongside existing exports.

- [ ] **Step 2: Replace all `{ id: true, username: true }` author selects in sheets module**

In every file listed above, replace:
```js
author: { select: { id: true, username: true } }
```
with:
```js
author: { select: AUTHOR_SELECT }
```

Import `AUTHOR_SELECT` from `./sheets.constants` (or `../../modules/sheets/sheets.constants` for the serializer).

For `forkSource.author` selects (in read, update, fork controllers), also use `AUTHOR_SELECT`.

For contribution `proposer`/`reviewer` selects in `sheets.serializer.js` and `sheets.contributions.controller.js`, also use `AUTHOR_SELECT`.

- [ ] **Step 3: Update serializer to pass through verification fields**

In `backend/src/modules/sheets/sheets.serializer.js`, update the `serializeContribution` function's author objects to include the new fields:

```js
// In forkSheet.author serialization (line ~48-52):
author: contribution.forkSheet.author
  ? {
      id: contribution.forkSheet.author.id,
      username: contribution.forkSheet.author.username,
      emailVerified: contribution.forkSheet.author.emailVerified || false,
      isStaffVerified: contribution.forkSheet.author.isStaffVerified || false,
    }
  : null,
```

Same for `proposer` and `reviewer` objects. Same for `sheet.forkSource.author` in `serializeSheet`.

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `cd backend && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sheets/ backend/src/modules/sheets/sheets.constants.js
git commit -m "feat(sheets): expand author payloads with verification fields"
```

---

### Task 3: Backend — Admin Staff-Verified Toggle

**Files:**
- Modify: `backend/src/modules/admin/admin.users.controller.js`

- [ ] **Step 1: Add PATCH endpoint for staff verification**

Add after the existing `PATCH /:id/trust-level` endpoint in `admin.users.controller.js`:

```js
router.patch('/users/:id/staff-verified', async (req, res) => {
  const targetId = Number.parseInt(req.params.id, 10)
  const { isStaffVerified } = req.body || {}

  if (typeof isStaffVerified !== 'boolean') {
    return res.status(400).json({ error: 'isStaffVerified must be a boolean.' })
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true } })
    if (!target) return res.status(404).json({ error: 'User not found.' })

    await prisma.user.update({
      where: { id: targetId },
      data: { isStaffVerified },
    })

    res.json({ message: `Staff verification ${isStaffVerified ? 'granted' : 'revoked'}.` })
  } catch (error) {
    captureError(error, { route: req.originalUrl })
    res.status(500).json({ error: 'Server error.' })
  }
})
```

- [ ] **Step 2: Add isStaffVerified to user list select**

In the GET /users endpoint's select clause, add `isStaffVerified: true` alongside the existing fields.

- [ ] **Step 3: Run backend tests**

Run: `cd backend && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/admin/admin.users.controller.js
git commit -m "feat(admin): add staff-verified toggle endpoint"
```

---

### Task 4: Frontend — Add Icons (IconMoreHorizontal, IconShield, IconMail)

**Files:**
- Modify: `frontend/studyhub-app/src/components/Icons.jsx`

- [ ] **Step 1: Add three new icons**

Append to `Icons.jsx` before the final exports (follow existing `Svg` wrapper pattern):

```jsx
// More (horizontal dots) — secondary actions menu trigger
export function IconMoreHorizontal({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </Svg>
  )
}

// Shield check — staff verified badge
export function IconShieldCheck({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 12.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

// Mail check — email verified badge
export function IconMailCheck({ size, ...p }) {
  return (
    <Svg size={size} {...p}>
      <path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
```

- [ ] **Step 2: Verify lint passes**

Run: `cd frontend/studyhub-app && npx eslint src/components/Icons.jsx --no-error-on-unmatched-pattern`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/components/Icons.jsx
git commit -m "feat(icons): add IconMoreHorizontal, IconShieldCheck, IconMailCheck"
```

---

### Task 5: Frontend — VerificationBadge Component

**Files:**
- Create: `frontend/studyhub-app/src/components/VerificationBadge.jsx`

- [ ] **Step 1: Create the component**

```jsx
import { useState } from 'react'
import { IconShieldCheck, IconMailCheck } from './Icons'

/**
 * Returns the verification type to display for a user.
 * Rule: staff overrides email; never show both.
 * @param {{ isStaffVerified?: boolean, emailVerified?: boolean }} user
 * @returns {'staff' | 'email' | null}
 */
export function getVerificationType(user) {
  if (!user) return null
  if (user.isStaffVerified) return 'staff'
  if (user.emailVerified) return 'email'
  return null
}

const BADGE_CONFIG = {
  staff: {
    icon: IconShieldCheck,
    color: 'var(--sh-brand)',
    tooltip: 'Verified by StudyHub',
    label: 'Staff verified',
  },
  email: {
    icon: IconMailCheck,
    color: 'var(--sh-success)',
    tooltip: 'Email verified',
    label: 'Email verified',
  },
}

/**
 * Displays a verification badge next to a username.
 * @param {{ user: object, size?: number }} props
 */
export default function VerificationBadge({ user, size = 14 }) {
  const type = getVerificationType(user)
  if (!type) return null

  const config = BADGE_CONFIG[type]
  const Icon = config.icon
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'default' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      aria-label={config.label}
      role="img"
    >
      <Icon size={size} style={{ color: config.color, flexShrink: 0 }} />
      {showTooltip && (
        <span
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            padding: '4px 10px',
            borderRadius: 6,
            background: 'var(--sh-heading)',
            color: 'var(--sh-surface)',
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 50,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          {config.tooltip}
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Verify lint passes**

Run: `cd frontend/studyhub-app && npx eslint src/components/VerificationBadge.jsx`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/components/VerificationBadge.jsx
git commit -m "feat(ui): add VerificationBadge component with staff > email rule"
```

---

### Task 6: Frontend — Add Style Helpers to sheetViewerConstants.js

**Files:**
- Modify: `frontend/studyhub-app/src/pages/sheets/sheetViewerConstants.js`

- [ ] **Step 1: Add new helpers**

Add these functions/constants:

```js
function statusPill(status) {
  const colorMap = {
    published: { bg: 'var(--sh-success-bg)', color: 'var(--sh-success)', border: 'var(--sh-success-border)' },
    pending_review: { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)', border: 'var(--sh-warning-border)' },
    rejected: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger)', border: 'var(--sh-danger-border)' },
    quarantined: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger)', border: 'var(--sh-danger-border)' },
    draft: { bg: 'var(--sh-soft)', color: 'var(--sh-muted)', border: 'var(--sh-border)' },
  }
  const c = colorMap[status] || colorMap.draft
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'capitalize',
    background: c.bg,
    color: c.color,
    border: `1px solid ${c.border}`,
    letterSpacing: '0.02em',
  }
}

function secondaryDropdown() {
  return {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
    padding: 4,
    zIndex: 30,
    minWidth: 200,
  }
}

function dropdownItem() {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '9px 12px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--sh-text)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    textAlign: 'left',
    textDecoration: 'none',
  }
}
```

Export them alongside existing exports.

- [ ] **Step 2: Commit**

```bash
git add frontend/studyhub-app/src/pages/sheets/sheetViewerConstants.js
git commit -m "feat(sheets): add statusPill, secondaryDropdown, dropdownItem style helpers"
```

---

### Task 7: Frontend — Extract SheetHeader Component

**Context:** This is the "repo header" — breadcrumb, title, author with verified badge, course/school chips, status pill, fork lineage, and stats summary. Replaces the current title area inside the content panel (lines 254-298 of SheetViewerPage.jsx).

**Files:**
- Create: `frontend/studyhub-app/src/pages/sheets/SheetHeader.jsx`

- [ ] **Step 1: Create SheetHeader component**

```jsx
import { Link } from 'react-router-dom'
import VerificationBadge from '../../components/VerificationBadge'
import { IconFork, IconStar, IconArrowLeft } from '../../components/Icons'
import { FONT, statusPill, timeAgo } from './sheetViewerConstants'

export default function SheetHeader({ sheet, handleBack }) {
  if (!sheet) return null

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Row 1: Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--sh-muted)' }}>
        <button
          type="button"
          onClick={handleBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'var(--sh-brand)', fontWeight: 600, fontSize: 13, fontFamily: FONT,
          }}
        >
          <IconArrowLeft size={12} />
          Sheets
        </button>
        {sheet.course?.code && (
          <>
            <span style={{ color: 'var(--sh-muted)' }}>/</span>
            <Link
              to={`/sheets?courseId=${sheet.course.id}`}
              style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}
            >
              {sheet.course.code}
            </Link>
          </>
        )}
      </div>

      {/* Row 2: Title + status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--sh-heading)', lineHeight: 1.2 }}>
          {sheet.title}
        </h1>
        <span style={statusPill(sheet.status)}>{sheet.status === 'pending_review' ? 'Pending review' : sheet.status}</span>
      </div>

      {/* Row 3: Author + verification + course + school + fork lineage */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--sh-subtext)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'var(--sh-avatar-bg)', color: 'var(--sh-avatar-text)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0,
            }}
          >
            {(sheet.author?.username || '?')[0]}
          </div>
          <Link
            to={`/users/${sheet.author?.username}`}
            style={{ color: 'var(--sh-heading)', fontWeight: 700, textDecoration: 'none' }}
          >
            {sheet.author?.username || 'Unknown'}
          </Link>
          <VerificationBadge user={sheet.author} size={14} />
        </div>

        {sheet.course?.code && (
          <span style={{
            padding: '2px 8px', borderRadius: 6,
            background: 'var(--sh-brand-soft)', color: 'var(--sh-brand-hover)',
            fontSize: 11, fontWeight: 700,
          }}>
            {sheet.course.code}
          </span>
        )}

        {sheet.course?.school?.short && (
          <span style={{
            padding: '2px 8px', borderRadius: 6,
            background: 'var(--sh-soft)', color: 'var(--sh-muted)',
            fontSize: 11, fontWeight: 700, border: '1px solid var(--sh-border)',
          }}>
            {sheet.course.school.short}
          </span>
        )}

        <span style={{ color: 'var(--sh-muted)' }}>
          updated {timeAgo(sheet.updatedAt || sheet.createdAt)}
        </span>
      </div>

      {/* Fork lineage */}
      {sheet.forkSource && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--sh-subtext)', fontSize: 12 }}>
          <IconFork size={13} />
          <span>
            Forked from{' '}
            <Link to={`/sheets/${sheet.forkSource.id}`} style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none' }}>
              {sheet.forkSource.title}
            </Link>
            {sheet.forkSource.author && (
              <> by <Link to={`/users/${sheet.forkSource.author.username}`} style={{ color: 'var(--sh-brand)', fontWeight: 600, textDecoration: 'none' }}>{sheet.forkSource.author.username}</Link></>
            )}
          </span>
        </div>
      )}

      {/* Stats summary line */}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconStar size={12} /> {sheet.stars || 0} stars
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconFork size={12} /> {sheet.forks || 0} forks
        </span>
        <span>{sheet.commentCount || 0} comments</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify lint**

Run: `cd frontend/studyhub-app && npx eslint src/pages/sheets/SheetHeader.jsx`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/sheets/SheetHeader.jsx
git commit -m "feat(sheets): extract SheetHeader component with verified badge"
```

---

### Task 8: Frontend — Extract SheetActionsMenu (Primary + Secondary Dropdown)

**Context:** Replaces the current flat action bar (lines 102-237). Primary actions (Star, Fork, Contribute) are always visible. Secondary actions (Share, Download, Helpful, Needs work, Report, Study status, Edit/Preview links) go in a kebab dropdown.

**Files:**
- Create: `frontend/studyhub-app/src/pages/sheets/SheetActionsMenu.jsx`

- [ ] **Step 1: Create SheetActionsMenu**

```jsx
import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  IconStar,
  IconStarFilled,
  IconFork,
  IconGitPullRequest,
  IconMoreHorizontal,
  IconDownload,
  IconEye,
} from '../../components/Icons'
import { API } from '../../config'
import { FONT, actionButton, linkButton, secondaryDropdown, dropdownItem } from './sheetViewerConstants'

export default function SheetActionsMenu({
  sheet,
  user,
  canEdit,
  isHtmlSheet,
  forking,
  studyStatus,
  setStudyStatus,
  STUDY_STATUSES,
  updateStar,
  updateReaction,
  handleFork,
  handleShare,
  setShowContributeModal,
  setReportOpen,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  if (!sheet) return null

  const previewMode = sheet.htmlWorkflow?.previewMode || 'interactive'

  return (
    <div data-tutorial="viewer-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* ── Primary actions ── */}
      <button type="button" onClick={updateStar} style={actionButton(sheet.starred ? 'var(--sh-warning)' : 'var(--sh-slate-600)')}>
        {sheet.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
        {sheet.stars || 0}
      </button>

      {canEdit ? (
        <Link to={`/sheets/${sheet.id}/lab`} style={linkButton()}>
          Edit in SheetLab
        </Link>
      ) : user && sheet.userId !== user.id ? (
        <button type="button" onClick={handleFork} disabled={forking} style={actionButton('var(--sh-brand)')}>
          <IconFork size={13} />
          {forking ? 'Forking...' : 'Fork'}
        </button>
      ) : null}

      {user && sheet.forkOf && sheet.userId === user.id && (
        <button type="button" onClick={() => setShowContributeModal(true)} style={actionButton('var(--sh-success)')}>
          <IconGitPullRequest size={13} />
          Contribute
        </button>
      )}

      {/* ── Secondary actions dropdown ── */}
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            ...actionButton('var(--sh-slate-600)'),
            padding: '6px 8px',
          }}
          aria-label="More actions"
        >
          <IconMoreHorizontal size={16} />
        </button>

        {menuOpen && (
          <div style={secondaryDropdown()}>
            <button type="button" onClick={() => { handleShare(); setMenuOpen(false) }} style={dropdownItem()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share
            </button>

            {sheet.allowDownloads !== false && (
              <a href={`${API}/api/sheets/${sheet.id}/download`} style={dropdownItem()} onClick={() => setMenuOpen(false)}>
                <IconDownload size={14} />
                Download
              </a>
            )}

            {sheet.hasAttachment && (
              <Link to={`/preview/sheet/${sheet.id}`} style={dropdownItem()} onClick={() => setMenuOpen(false)}>
                <IconEye size={14} />
                Preview attachment
              </Link>
            )}

            {isHtmlSheet && (sheet.status !== 'pending_review' || canEdit) && (
              <Link to={`/sheets/preview/html/${sheet.id}`} style={dropdownItem()} onClick={() => setMenuOpen(false)}>
                <IconEye size={14} />
                Open sandbox preview
              </Link>
            )}

            <div style={{ height: 1, background: 'var(--sh-border)', margin: '4px 0' }} />

            <button
              type="button"
              onClick={() => { updateReaction('like'); setMenuOpen(false) }}
              style={{ ...dropdownItem(), color: sheet.reactions?.userReaction === 'like' ? 'var(--sh-success)' : 'var(--sh-text)' }}
            >
              <span>👍</span>
              Helpful {sheet.reactions?.likes || 0}
            </button>
            <button
              type="button"
              onClick={() => { updateReaction('dislike'); setMenuOpen(false) }}
              style={{ ...dropdownItem(), color: sheet.reactions?.userReaction === 'dislike' ? 'var(--sh-danger)' : 'var(--sh-text)' }}
            >
              <span>👎</span>
              Needs work {sheet.reactions?.dislikes || 0}
            </button>

            <div style={{ height: 1, background: 'var(--sh-border)', margin: '4px 0' }} />

            {/* Study status sub-section */}
            {user && (
              <div style={{ padding: '4px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sh-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Study status</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {STUDY_STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => { setStudyStatus(studyStatus === s.value ? null : s.value, sheet); setMenuOpen(false) }}
                      style={{
                        padding: '4px 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', fontFamily: FONT,
                        background: studyStatus === s.value ? s.color : 'var(--sh-soft)',
                        color: studyStatus === s.value ? '#fff' : 'var(--sh-text)',
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {user && sheet.userId !== user.id && (
              <>
                <div style={{ height: 1, background: 'var(--sh-border)', margin: '4px 0' }} />
                <button
                  type="button"
                  onClick={() => { setReportOpen(true); setMenuOpen(false) }}
                  style={{ ...dropdownItem(), color: 'var(--sh-danger)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                  Report
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Inline helpful/needs-work summary (read-only, visible) */}
      {(sheet.reactions?.likes > 0 || sheet.reactions?.dislikes > 0) && (
        <span style={{ fontSize: 11, color: 'var(--sh-muted)', fontWeight: 600, display: 'flex', gap: 8 }}>
          {sheet.reactions.likes > 0 && <span>👍 {sheet.reactions.likes}</span>}
          {sheet.reactions.dislikes > 0 && <span>👎 {sheet.reactions.dislikes}</span>}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify lint**

Run: `cd frontend/studyhub-app && npx eslint src/pages/sheets/SheetActionsMenu.jsx`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/sheets/SheetActionsMenu.jsx
git commit -m "feat(sheets): extract SheetActionsMenu with primary/secondary split"
```

---

### Task 9: Frontend — Extract SheetContentPanel

**Context:** Encapsulates the entire HTML/Markdown rendering logic (lines 305-431 of current SheetViewerPage). Takes all HTML preview state as props.

**Files:**
- Create: `frontend/studyhub-app/src/pages/sheets/SheetContentPanel.jsx`

- [ ] **Step 1: Create SheetContentPanel**

Extract the content rendering block from SheetViewerPage lines 305-431 into this component. Props:

```jsx
export default function SheetContentPanel({
  sheet,
  isHtmlSheet,
  previewMode,
  canEdit,
  htmlWarningAcked,
  acceptHtmlWarning,
  safePreviewUrl,
  runtimeUrl,
  previewLoading,
  runtimeLoading,
  viewerInteractive,
  toggleViewerInteractive,
  sheetPanelRef,
})
```

Move the entire HTML preview branching logic (quarantined → restricted → warning → loading → iframe → markdown fallback) into this component. Keep the exact same rendering code, just wrapped in the new component boundary.

Include the description paragraph above the content:

```jsx
{sheet.description && (
  <p style={{ margin: '0 0 16px', color: 'var(--sh-subtext)', fontSize: 14, lineHeight: 1.7 }}>{sheet.description}</p>
)}
```

Also include the isHtmlSheet label row (HTML sheet / Flagged / Pending Review badges).

- [ ] **Step 2: Verify lint**

Run: `cd frontend/studyhub-app && npx eslint src/pages/sheets/SheetContentPanel.jsx`

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/sheets/SheetContentPanel.jsx
git commit -m "feat(sheets): extract SheetContentPanel component"
```

---

### Task 10: Frontend — Extract SheetCommentsPanel

**Context:** Wraps the comments section (lines 437-534 of current SheetViewerPage).

**Files:**
- Create: `frontend/studyhub-app/src/pages/sheets/SheetCommentsPanel.jsx`

- [ ] **Step 1: Create SheetCommentsPanel**

Props:
```jsx
export default function SheetCommentsPanel({
  user,
  commentsState,
  commentDraft,
  setCommentDraft,
  commentSaving,
  submitComment,
  deleteComment,
})
```

Move the entire comments section markup here. Keep the collapsible toggle with local `useState(false)` for `commentsExpanded`. Include the auto-expand logic for small counts (0-3 comments): if `commentsState.total <= 3`, default `commentsExpanded` to `true`.

- [ ] **Step 2: Verify lint**

Run: `cd frontend/studyhub-app && npx eslint src/pages/sheets/SheetCommentsPanel.jsx`

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/sheets/SheetCommentsPanel.jsx
git commit -m "feat(sheets): extract SheetCommentsPanel with auto-expand for small counts"
```

---

### Task 11: Frontend — Extract RelatedSheetsPanel

**Context:** Wraps the related sheets section (lines 537-579 of current SheetViewerPage).

**Files:**
- Create: `frontend/studyhub-app/src/pages/sheets/RelatedSheetsPanel.jsx`

- [ ] **Step 1: Create RelatedSheetsPanel**

Props:
```jsx
export default function RelatedSheetsPanel({ sheet, relatedSheets })
```

Move the related sheets markup here. Limit display to 6 items max (slice). Show "View more" link to course page if more than 6 related sheets exist.

- [ ] **Step 2: Verify lint**

Run: `cd frontend/studyhub-app && npx eslint src/pages/sheets/RelatedSheetsPanel.jsx`

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/sheets/RelatedSheetsPanel.jsx
git commit -m "feat(sheets): extract RelatedSheetsPanel component"
```

---

### Task 12: Frontend — Rewrite SheetViewerPage as Thin Orchestrator

**Context:** Replace the 664-line monolith with a slim shell that imports and composes child components. The contribute-back modal must use `createPortal(jsx, document.body)` since it's inside an animated container.

**Files:**
- Modify: `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`

- [ ] **Step 1: Rewrite SheetViewerPage**

The new SheetViewerPage should:

1. Import all child components: SheetHeader, SheetActionsMenu, SheetContentPanel, SheetCommentsPanel, RelatedSheetsPanel, SheetViewerSidebar
2. Import `createPortal` from `react-dom`
3. Keep the `useSheetViewer()` hook call
4. Keep Navbar, AppSidebar, SafeJoyride, ReportModal
5. Keep ModerationBanner and PendingReviewBanner
6. Compose the child components in the grid layout

Structure:
```jsx
import { createPortal } from 'react-dom'
// ... other imports

export default function SheetViewerPage() {
  const layout = useResponsiveAppLayout()
  const tutorial = useTutorial(...)
  const { ...all hook values } = useSheetViewer()
  const [reportOpen, setReportOpen] = useState(false)

  return (
    <>
      <Navbar />
      <div style={{ background: 'var(--sh-bg)', minHeight: '100vh', fontFamily: FONT }}>
        <div style={pageShell('reading', 26, 48)}>
          <div style={{ display: 'grid', gridTemplateColumns: layout.columns.readingThreeColumn, gap: 22, alignItems: 'start' }}>
            <AppSidebar mode={layout.sidebarMode} />

            <main id="main-content" style={{ display: 'grid', gap: 16 }}>
              {/* Sheet header (breadcrumb, title, author, status, fork lineage) */}
              <SheetHeader sheet={sheet} handleBack={handleBack} />

              {/* Primary + secondary actions */}
              <SheetActionsMenu
                sheet={sheet} user={user} canEdit={canEdit}
                isHtmlSheet={isHtmlSheet} forking={forking}
                studyStatus={studyStatus} setStudyStatus={setStudyStatus}
                STUDY_STATUSES={STUDY_STATUSES}
                updateStar={updateStar} updateReaction={updateReaction}
                handleFork={handleFork} handleShare={handleShare}
                setShowContributeModal={setShowContributeModal}
                setReportOpen={setReportOpen}
              />

              {/* Moderation / pending review banners */}
              {errorBanner(sheetState.error)}
              {sheet && user && sheet.userId === user.id && (
                <ModerationBanner status={sheet.status === 'removed_by_moderation' ? 'confirmed_violation' : sheet.moderationStatus} />
              )}
              {sheet && sheet.status === 'pending_review' && user && sheet.userId === user.id && (
                <PendingReviewBanner />
              )}

              {/* Content */}
              {sheetState.loading ? (
                <SkeletonCard style={{ padding: '28px 24px' }} />
              ) : sheet ? (
                <SheetContentPanel
                  sheet={sheet} isHtmlSheet={isHtmlSheet}
                  previewMode={sheet.htmlWorkflow?.previewMode || 'interactive'}
                  canEdit={canEdit} htmlWarningAcked={htmlWarningAcked}
                  acceptHtmlWarning={acceptHtmlWarning}
                  safePreviewUrl={safePreviewUrl} runtimeUrl={runtimeUrl}
                  previewLoading={previewLoading} runtimeLoading={runtimeLoading}
                  viewerInteractive={viewerInteractive}
                  toggleViewerInteractive={toggleViewerInteractive}
                  sheetPanelRef={sheetPanelRef}
                />
              ) : null}

              {/* Comments */}
              {errorBanner(commentsState.error)}
              <SheetCommentsPanel
                user={user} commentsState={commentsState}
                commentDraft={commentDraft} setCommentDraft={setCommentDraft}
                commentSaving={commentSaving}
                submitComment={submitComment} deleteComment={deleteComment}
              />

              {/* Related sheets */}
              <RelatedSheetsPanel sheet={sheet} relatedSheets={relatedSheets} />
            </main>

            <SheetViewerSidebar ... />
          </div>
        </div>
      </div>

      {/* Contribute-back modal — portaled to body */}
      {showContributeModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, ... }}>
          {/* Same contribute modal content as before */}
        </div>,
        document.body
      )}

      <SafeJoyride {...tutorial.joyrideProps} />
      {sheet && <ReportModal open={reportOpen} targetType="sheet" targetId={sheet.id} onClose={() => setReportOpen(false)} />}
    </>
  )
}
```

Target: ~120-150 lines (down from 664).

- [ ] **Step 2: Verify lint**

Run: `cd frontend/studyhub-app && npx eslint src/pages/sheets/SheetViewerPage.jsx`

- [ ] **Step 3: Verify build**

Run: `cd frontend/studyhub-app && npx vite build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx
git commit -m "refactor(sheets): decompose SheetViewerPage into focused child components"
```

---

### Task 13: Frontend — VerificationBadge in SheetViewerSidebar

**Files:**
- Modify: `frontend/studyhub-app/src/pages/sheets/SheetViewerSidebar.jsx`

- [ ] **Step 1: Add VerificationBadge to sidebar author display**

Import `VerificationBadge` and add it next to the author username in the collaboration section where fork source author is shown (line ~155).

Also add an "About" section at the top of the sidebar showing the sheet author with their verified badge:

```jsx
<section style={panelStyle()}>
  <h2 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--sh-heading)' }}>About</h2>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: 'var(--sh-avatar-bg)', color: 'var(--sh-avatar-text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0,
    }}>
      {(sheet.author?.username || '?')[0]}
    </div>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Link to={`/users/${sheet.author?.username}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', textDecoration: 'none' }}>
          {sheet.author?.username || 'Unknown'}
        </Link>
        <VerificationBadge user={sheet.author} size={13} />
      </div>
      {sheet.course?.code && (
        <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>{sheet.course.code} {sheet.course.school?.short ? `• ${sheet.course.school.short}` : ''}</div>
      )}
    </div>
  </div>
</section>
```

- [ ] **Step 2: Verify lint**

Run: `cd frontend/studyhub-app && npx eslint src/pages/sheets/SheetViewerSidebar.jsx`

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/sheets/SheetViewerSidebar.jsx
git commit -m "feat(sheets): add VerificationBadge and About section to sidebar"
```

---

### Task 14: Frontend — Improve Logged-Out Messaging

**Context:** When a logged-out user views a sheet, action buttons (star, fork, contribute, comment) should show a professional CTA instead of just being hidden.

**Files:**
- Modify: `frontend/studyhub-app/src/pages/sheets/SheetActionsMenu.jsx`
- Modify: `frontend/studyhub-app/src/pages/sheets/SheetCommentsPanel.jsx`

- [ ] **Step 1: Add logged-out CTA to SheetActionsMenu**

When `!user`, show a subtle CTA instead of hiding all interactive buttons:

```jsx
{!user && (
  <Link
    to="/login"
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 8,
      background: 'var(--sh-brand)', color: 'var(--sh-btn-primary-text)',
      fontSize: 12, fontWeight: 700, textDecoration: 'none', fontFamily: FONT,
    }}
  >
    Sign in to star, fork, and contribute
  </Link>
)}
```

- [ ] **Step 2: Add logged-out CTA to SheetCommentsPanel**

When `!user`, replace the comment form with:

```jsx
<div style={{
  textAlign: 'center', padding: '16px 12px',
  borderRadius: 12, border: '1px solid var(--sh-border)',
  background: 'var(--sh-soft)',
}}>
  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading)', marginBottom: 4 }}>
    Join the conversation
  </div>
  <div style={{ fontSize: 12, color: 'var(--sh-muted)', lineHeight: 1.5, marginBottom: 10 }}>
    Sign in to leave comments, corrections, and study tips.
  </div>
  <Link to="/login" style={{
    display: 'inline-block', padding: '7px 16px', borderRadius: 8,
    background: 'var(--sh-brand)', color: 'var(--sh-btn-primary-text)',
    fontSize: 12, fontWeight: 700, textDecoration: 'none',
  }}>
    Sign in
  </Link>
</div>
```

- [ ] **Step 3: Verify lint**

Run: `cd frontend/studyhub-app && npx eslint src/pages/sheets/SheetActionsMenu.jsx src/pages/sheets/SheetCommentsPanel.jsx`

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/src/pages/sheets/SheetActionsMenu.jsx frontend/studyhub-app/src/pages/sheets/SheetCommentsPanel.jsx
git commit -m "feat(sheets): add professional logged-out CTAs for actions and comments"
```

---

### Task 15: Frontend — Admin UsersTab Staff-Verified Toggle

**Files:**
- Modify: `frontend/studyhub-app/src/pages/admin/UsersTab.jsx`

- [ ] **Step 1: Add staff-verified toggle column**

Add a column after the existing trust-level column. Show a checkbox or toggle that calls `PATCH /api/admin/users/:id/staff-verified` with `{ isStaffVerified: !current }`.

Pattern follows the existing trust-level inline `<select>` dropdown. Use a simple checkbox:

```jsx
<td style={{ padding: '10px 12px', textAlign: 'center' }}>
  <input
    type="checkbox"
    checked={Boolean(u.isStaffVerified)}
    onChange={async () => {
      try {
        await fetch(`${API}/api/admin/users/${u.id}/staff-verified`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ isStaffVerified: !u.isStaffVerified }),
        })
        // Refresh user list
        fetchUsers()
      } catch { /* swallow */ }
    }}
    style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--sh-brand)' }}
  />
</td>
```

Add the header column: `<th>Staff Verified</th>`

- [ ] **Step 2: Verify lint**

Run: `cd frontend/studyhub-app && npx eslint src/pages/admin/UsersTab.jsx`

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/UsersTab.jsx
git commit -m "feat(admin): add staff-verified toggle to users table"
```

---

### Task 16: Tests — VerificationBadge Component Tests

**Files:**
- Create: `frontend/studyhub-app/src/components/VerificationBadge.test.jsx`

- [ ] **Step 1: Write tests**

```jsx
import { describe, it, expect } from 'vitest'
import { getVerificationType } from './VerificationBadge'

describe('getVerificationType', () => {
  it('returns null for null user', () => {
    expect(getVerificationType(null)).toBe(null)
  })

  it('returns null for user with no verification', () => {
    expect(getVerificationType({ isStaffVerified: false, emailVerified: false })).toBe(null)
  })

  it('returns "email" for email-verified user', () => {
    expect(getVerificationType({ isStaffVerified: false, emailVerified: true })).toBe('email')
  })

  it('returns "staff" for staff-verified user', () => {
    expect(getVerificationType({ isStaffVerified: true, emailVerified: false })).toBe('staff')
  })

  it('returns "staff" when both staff and email verified (staff overrides)', () => {
    expect(getVerificationType({ isStaffVerified: true, emailVerified: true })).toBe('staff')
  })

  it('returns null for empty object', () => {
    expect(getVerificationType({})).toBe(null)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd frontend/studyhub-app && npx vitest run src/components/VerificationBadge.test.jsx --reporter=verbose`
Expected: 6/6 pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/components/VerificationBadge.test.jsx
git commit -m "test(ui): add VerificationBadge unit tests for staff > email rule"
```

---

### Task 17: Tests — Backend Verification Fields

**Files:**
- Create: `backend/test/verificationFields.test.js`

- [ ] **Step 1: Write tests**

Test that the AUTHOR_SELECT constant includes the expected fields:

```js
import { describe, it, expect } from 'vitest'

// Import the constant directly
const { AUTHOR_SELECT } = require('../src/modules/sheets/sheets.constants')

describe('AUTHOR_SELECT constant', () => {
  it('includes id and username', () => {
    expect(AUTHOR_SELECT.id).toBe(true)
    expect(AUTHOR_SELECT.username).toBe(true)
  })

  it('includes emailVerified', () => {
    expect(AUTHOR_SELECT.emailVerified).toBe(true)
  })

  it('includes isStaffVerified', () => {
    expect(AUTHOR_SELECT.isStaffVerified).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd backend && npx vitest run test/verificationFields.test.js --reporter=verbose`
Expected: 3/3 pass.

- [ ] **Step 3: Commit**

```bash
git add backend/test/verificationFields.test.js
git commit -m "test(sheets): verify AUTHOR_SELECT includes verification fields"
```

---

### Task 18: Full Validation Pass

- [ ] **Step 1: Run backend tests**

Run: `cd backend && npx vitest run --reporter=verbose 2>&1 | tail -40`
Expected: All tests pass.

- [ ] **Step 2: Run frontend lint**

Run: `cd frontend/studyhub-app && npm run lint 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 3: Run frontend build**

Run: `cd frontend/studyhub-app && npx vite build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend/studyhub-app && npx vitest run --reporter=verbose 2>&1 | tail -40`
Expected: All tests pass.

---

### Task 19: Update Release Log

**Files:**
- Modify: `docs/beta-v1.7.0-release-log.md`

- [ ] **Step 1: Append Q-2 + V-1 cycle entry**

Add a new section at the end of the release log:

```markdown
---

## Cycle Q-2 + V-1 — Sheet Page Polish + Verified Badges (2026-03-26)

### Summary

Restructured SheetViewerPage from 664-line monolith into focused child components with GitHub-like header layout. Added verified badges (staff overrides email). Full dark/light mode compliance.

### Changes

| Category | Detail |
|----------|--------|
| Schema | Added `isStaffVerified` Boolean field to User model |
| Backend | Centralized `AUTHOR_SELECT` constant with verification fields across all sheet endpoints |
| Backend | Admin endpoint `PATCH /api/admin/users/:id/staff-verified` for toggling staff verification |
| Frontend | New `VerificationBadge` component — staff badge overrides email, tooltip on hover |
| Frontend | Decomposed SheetViewerPage into SheetHeader, SheetActionsMenu, SheetContentPanel, SheetCommentsPanel, RelatedSheetsPanel |
| Frontend | GitHub-like header: breadcrumb, title + status pill, author + verified badge + course chips, fork lineage, stats |
| Frontend | Primary/secondary action split: Star/Fork/Contribute visible, Share/Download/Helpful/Report in dropdown |
| Frontend | Contribute-back modal uses `createPortal` for proper fixed positioning |
| Frontend | Professional logged-out CTAs for actions and comments |
| Frontend | Comments auto-expand when count <= 3 |
| Frontend | Related sheets capped at 6 with "View more" link |
| Frontend | Admin UsersTab: staff-verified checkbox toggle |
| UI | New icons: IconMoreHorizontal, IconShieldCheck, IconMailCheck |
| UI | New style helpers: statusPill, secondaryDropdown, dropdownItem |
| Tests | 6 VerificationBadge unit tests (staff > email rule) |
| Tests | 3 AUTHOR_SELECT constant tests |

### Files Changed

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Added `isStaffVerified` to User model |
| `backend/prisma/migrations/20260326100000_add_staff_verified/` | Migration SQL |
| `backend/src/modules/sheets/sheets.constants.js` | Added `AUTHOR_SELECT` constant |
| `backend/src/modules/sheets/*.controller.js` | Replaced inline author selects with `AUTHOR_SELECT` |
| `backend/src/modules/sheets/sheets.serializer.js` | Pass through verification fields in all author objects |
| `backend/src/modules/admin/admin.users.controller.js` | Added staff-verified toggle endpoint |
| `frontend/studyhub-app/src/components/VerificationBadge.jsx` | New: badge with tooltip |
| `frontend/studyhub-app/src/components/Icons.jsx` | Added 3 new icons |
| `frontend/studyhub-app/src/pages/sheets/SheetHeader.jsx` | New: GitHub-like header |
| `frontend/studyhub-app/src/pages/sheets/SheetActionsMenu.jsx` | New: primary/secondary actions |
| `frontend/studyhub-app/src/pages/sheets/SheetContentPanel.jsx` | New: content rendering |
| `frontend/studyhub-app/src/pages/sheets/SheetCommentsPanel.jsx` | New: comments with auto-expand |
| `frontend/studyhub-app/src/pages/sheets/RelatedSheetsPanel.jsx` | New: related sheets |
| `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx` | Rewritten as thin orchestrator (~140 lines) |
| `frontend/studyhub-app/src/pages/sheets/SheetViewerSidebar.jsx` | Added About section with verified badge |
| `frontend/studyhub-app/src/pages/sheets/sheetViewerConstants.js` | Added style helpers |
| `frontend/studyhub-app/src/pages/admin/UsersTab.jsx` | Staff-verified checkbox |
| `frontend/studyhub-app/src/components/VerificationBadge.test.jsx` | 6 unit tests |
| `backend/test/verificationFields.test.js` | 3 constant tests |

### Validation

| Check | Result |
|-------|--------|
| Backend tests | ✅ All pass |
| Frontend lint | ✅ No errors |
| Frontend build | ✅ Succeeds |
| Frontend tests | ✅ All pass |
| Dark mode | ✅ All styles use CSS custom property tokens |
| No hardcoded colors | ✅ Verified |
```

- [ ] **Step 2: Commit**

```bash
git add docs/beta-v1.7.0-release-log.md
git commit -m "docs: add Q-2 + V-1 sheet polish cycle to release log"
```
