# Moderation System Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix tutorial persistence, overhaul admin moderation UI with shared primitives, add content preview modal with deep linking, redesign user-facing moderation tab, implement 30-day permanent deletion scheduler with full audit logging, and fix security gaps in comment filtering.

**Architecture:** Feature-grouped into 5 independent groups. Group 1 (tutorial) is standalone. Group 2 (admin UI) builds shared primitives first, then uses them for strike search, preview modal, and deep links. Group 3 (user moderation tab) reuses modal patterns. Group 4 (deletion lifecycle) adds schema, scheduler, and audit log. Group 5 (security) fixes filtering gaps throughout.

**Tech Stack:** React 19, Express 5, Prisma, PostgreSQL, CSS custom properties (`--sh-*` tokens), inline SVG icons.

**Spec:** `docs/superpowers/specs/2026-03-26-moderation-overhaul-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `frontend/studyhub-app/src/pages/admin/components/AdminCard.jsx` | Reusable card container with `--sh-*` tokens |
| `frontend/studyhub-app/src/pages/admin/components/AdminTable.jsx` | Table with consistent headers, cells, hover, pagination |
| `frontend/studyhub-app/src/pages/admin/components/AdminModal.jsx` | Centered overlay modal with size variants, escape/backdrop close |
| `frontend/studyhub-app/src/pages/admin/components/AdminInput.jsx` | Labeled text input with consistent styling |
| `frontend/studyhub-app/src/pages/admin/components/AdminSelect.jsx` | Labeled dropdown with consistent styling |
| `frontend/studyhub-app/src/pages/admin/components/AdminPill.jsx` | Status badge with semantic color mapping |
| `frontend/studyhub-app/src/pages/admin/components/AdminSplitPanel.jsx` | Side-by-side responsive layout |
| `frontend/studyhub-app/src/pages/admin/components/admin-primitives.css` | Shared CSS for all admin primitives |
| `frontend/studyhub-app/src/pages/admin/components/index.js` | Barrel export for all primitives |
| `frontend/studyhub-app/src/pages/admin/components/UserSearchInput.jsx` | Typeahead user search with debounce |
| `frontend/studyhub-app/src/pages/admin/components/ContentPreviewModal.jsx` | Rich split-panel content preview + case context |
| `frontend/studyhub-app/src/pages/admin/components/icons.jsx` | Inline SVG icon components (search, warning, shield, export, etc.) |
| `backend/src/lib/moderationCleanupScheduler.js` | 30-day permanent deletion scheduler |
| `backend/src/lib/moderationLogger.js` | Audit log write helper |
| `backend/test/moderation-cleanup.test.js` | Scheduler tests |
| `backend/test/moderation-log.test.js` | Audit log tests |
| `backend/test/admin-user-search.test.js` | User search endpoint tests |
| `backend/test/moderation-comment-filter.test.js` | Comment filtering tests |

### Modified Files

| File | Changes |
|------|---------|
| `frontend/studyhub-app/src/lib/useTutorial.js` | Add version support, fix persistence |
| `frontend/studyhub-app/src/lib/tutorialSteps.js` | Add version constants |
| `frontend/studyhub-app/src/pages/admin/StrikesSubTab.jsx` | Use UserSearchInput, auto case ID, AdminCard/AdminInput, remove hardcoded colors |
| `frontend/studyhub-app/src/pages/admin/CasesSubTab.jsx` | Replace inline expansion with ContentPreviewModal, add deep link buttons |
| `frontend/studyhub-app/src/pages/admin/AppealsSubTab.jsx` | Use AdminTable/AdminPill, consistent styling |
| `frontend/studyhub-app/src/pages/admin/RestrictionsSubTab.jsx` | Use AdminTable/AdminPill, remove hardcoded colors |
| `frontend/studyhub-app/src/pages/admin/ModerationTab.jsx` | Wire new sub-tab components |
| `frontend/studyhub-app/src/pages/settings/ModerationTab.jsx` | Fix AppealModal centering, add My History tab, remove hardcoded colors |
| `frontend/studyhub-app/src/components/ModerationBanner.jsx` | Replace emojis with SVG icons |
| `frontend/studyhub-app/src/pages/feed/FeedPage.jsx` | Add `?post=` deep link scroll + highlight |
| `backend/src/modules/moderation/moderation.admin.cases.controller.js` | Fix preview linkPath, auto-create case on manual strike, add snapshot endpoint |
| `backend/src/modules/moderation/moderation.admin.enforcement.controller.js` | Add audit logging, fix notification link |
| `backend/src/modules/moderation/moderation.user.controller.js` | Add my-log endpoint, add audit logging |
| `backend/src/modules/moderation/moderation.routes.js` | Register new routes |
| `backend/src/modules/admin/admin.users.controller.js` | Add user search endpoint, add log/export endpoints |
| `backend/src/lib/moderationEngine.js` | Add audit logging to issueStrike/reviewCase/restoreContent, improve error handling |
| `backend/src/modules/feed/feed.list.controller.js` | Add moderationStatus filter to comment count queries |
| `backend/src/modules/sheets/sheets.list.controller.js` | Add moderationStatus filter to comment count queries |
| `backend/prisma/schema.prisma` | Add ModerationLog model, add fields to ModerationSnapshot/ModerationCase |
| `backend/src/server.js` | Start moderationCleanupScheduler |

---

## Group 1: Tutorial Fix

### Task 1: Fix tutorial persistence and add versioning

**Files:**
- Modify: `frontend/studyhub-app/src/lib/tutorialSteps.js`
- Modify: `frontend/studyhub-app/src/lib/useTutorial.js`

- [ ] **Step 1: Add version constants to tutorialSteps.js**

Open `frontend/studyhub-app/src/lib/tutorialSteps.js`. Add a version export for each step set. Insert at the top of the file before the step arrays:

```js
export const TUTORIAL_VERSIONS = {
  feed: 1,
  sheets: 1,
  dashboard: 1,
  notes: 1,
  settings: 1,
  profile: 1,
  viewer: 1,
  announcements: 1,
  upload: 1,
}
```

No other changes to this file.

- [ ] **Step 2: Fix useTutorial.js persistence logic**

Open `frontend/studyhub-app/src/lib/useTutorial.js` (125 lines). Replace the hook implementation to:

1. Accept a `version` option (default `1`).
2. Build the localStorage key as `tutorial_${pageKey}_v${version}_seen`.
3. Read localStorage synchronously on first render (not in an effect).
4. Only set `run: true` if the key is absent.
5. On callback `FINISHED` or `SKIPPED`, write the key immediately.

Replace the full hook body. The new implementation:

```js
import { useState, useCallback, useMemo } from 'react'

export default function useTutorial(pageKey, steps, options = {}) {
  const { delayMs = 800, version = 1 } = options
  const storageKey = `tutorial_${pageKey}_v${version}_seen`

  // Synchronous read — runs once on mount, never re-reads
  const alreadySeen = useMemo(() => {
    try {
      return localStorage.getItem(storageKey) === '1'
    } catch {
      return true // if localStorage fails, don't show tutorial
    }
  }, [storageKey])

  const [run, setRun] = useState(false)
  const [hasTriggered, setHasTriggered] = useState(false)

  // Auto-trigger once after delay, only if not seen
  useState(() => {
    if (alreadySeen || hasTriggered) return
    const timer = setTimeout(() => {
      setRun(true)
      setHasTriggered(true)
    }, delayMs)
    return () => clearTimeout(timer)
  })

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      // localStorage unavailable
    }
  }, [storageKey])

  const handleCallback = useCallback(
    (data) => {
      const { status } = data
      if (status === 'finished' || status === 'skipped') {
        setRun(false)
        markSeen()
      }
    },
    [markSeen]
  )

  const restart = useCallback(() => {
    setRun(true)
  }, [])

  const joyrideProps = useMemo(
    () => ({
      steps,
      run,
      continuous: true,
      showSkipButton: true,
      showProgress: true,
      disableOverlayClose: false,
      callback: handleCallback,
      locale: {
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip',
      },
      styles: {
        options: {
          zIndex: 10000,
          primaryColor: 'var(--sh-brand, #3b82f6)',
          textColor: 'var(--sh-text, #0f172a)',
          backgroundColor: 'var(--sh-surface, #fff)',
          arrowColor: 'var(--sh-surface, #fff)',
          overlayColor: 'rgba(15, 23, 42, 0.4)',
        },
        tooltip: {
          borderRadius: 14,
          padding: '20px 22px',
          boxShadow: '0 12px 40px rgba(15, 23, 42, 0.15)',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        },
        spotlight: { borderRadius: 12 },
        buttonNext: {
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 600,
          borderRadius: 8,
          fontSize: 14,
        },
        buttonBack: {
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 500,
          fontSize: 14,
          color: 'var(--sh-subtext, #475569)',
        },
        buttonSkip: {
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 500,
          fontSize: 13,
          color: 'var(--sh-muted, #94a3b8)',
        },
      },
    }),
    [steps, run, handleCallback]
  )

  return { joyrideProps, restart, seen: alreadySeen }
}
```

- [ ] **Step 3: Update all useTutorial call sites to pass version**

Search for all files importing `useTutorial`. Each call site should import the version from `tutorialSteps.js` and pass it:

```js
import { TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
// ...
const tutorial = useTutorial('feed', FEED_STEPS, { version: TUTORIAL_VERSIONS.feed })
```

Find all call sites with: `grep -r "useTutorial(" frontend/studyhub-app/src/`

Update each one. The `pageKey` strings are: `feed`, `sheets`, `dashboard`, `notes`, `settings`, `profile`, `viewer`, `announcements`, `upload`.

- [ ] **Step 4: Test manually**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS with no errors.

Run: `npm --prefix frontend/studyhub-app run build`
Expected: Build succeeds.

Manual test: Open the app, navigate to Feed. Tutorial should show once. Refresh — should NOT show again. Clear `tutorial_feed_v1_seen` from localStorage — should show again.

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/lib/useTutorial.js frontend/studyhub-app/src/lib/tutorialSteps.js
git add -u frontend/studyhub-app/src/  # catch updated call sites
git commit -m "fix: tutorial shows once per page with versioned localStorage keys"
```

---

## Group 2: Admin Moderation UI Overhaul

### Task 2: Create SVG icon components

**Files:**
- Create: `frontend/studyhub-app/src/pages/admin/components/icons.jsx`

- [ ] **Step 1: Create the icons file**

Create `frontend/studyhub-app/src/pages/admin/components/icons.jsx` with reusable SVG icon components. All icons use `currentColor`, 1.5px stroke, rounded line joins, 20x20 viewBox by default:

```jsx
const defaults = { width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function SearchIcon({ size = 20, ...props }) {
  return (
    <svg {...defaults} width={size} height={size} viewBox="0 0 24 24" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

export function WarningTriangleIcon({ size = 20, ...props }) {
  return (
    <svg {...defaults} width={size} height={size} viewBox="0 0 24 24" {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export function ShieldXIcon({ size = 20, ...props }) {
  return (
    <svg {...defaults} width={size} height={size} viewBox="0 0 24 24" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  )
}

export function ExportIcon({ size = 20, ...props }) {
  return (
    <svg {...defaults} width={size} height={size} viewBox="0 0 24 24" {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export function ExternalLinkIcon({ size = 20, ...props }) {
  return (
    <svg {...defaults} width={size} height={size} viewBox="0 0 24 24" {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

export function CloseIcon({ size = 20, ...props }) {
  return (
    <svg {...defaults} width={size} height={size} viewBox="0 0 24 24" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function UserIcon({ size = 20, ...props }) {
  return (
    <svg {...defaults} width={size} height={size} viewBox="0 0 24 24" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export function HistoryIcon({ size = 20, ...props }) {
  return (
    <svg {...defaults} width={size} height={size} viewBox="0 0 24 24" {...props}>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}

export function FileIcon({ size = 20, ...props }) {
  return (
    <svg {...defaults} width={size} height={size} viewBox="0 0 24 24" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

export function CheckCircleIcon({ size = 20, ...props }) {
  return (
    <svg {...defaults} width={size} height={size} viewBox="0 0 24 24" {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/components/icons.jsx
git commit -m "feat: add SVG icon components for admin moderation UI"
```

---

### Task 3: Create shared admin UI primitives

**Files:**
- Create: `frontend/studyhub-app/src/pages/admin/components/admin-primitives.css`
- Create: `frontend/studyhub-app/src/pages/admin/components/AdminCard.jsx`
- Create: `frontend/studyhub-app/src/pages/admin/components/AdminTable.jsx`
- Create: `frontend/studyhub-app/src/pages/admin/components/AdminModal.jsx`
- Create: `frontend/studyhub-app/src/pages/admin/components/AdminInput.jsx`
- Create: `frontend/studyhub-app/src/pages/admin/components/AdminSelect.jsx`
- Create: `frontend/studyhub-app/src/pages/admin/components/AdminPill.jsx`
- Create: `frontend/studyhub-app/src/pages/admin/components/AdminSplitPanel.jsx`
- Create: `frontend/studyhub-app/src/pages/admin/components/index.js`

- [ ] **Step 1: Create admin-primitives.css**

This CSS file uses only `--sh-*` tokens. Create `frontend/studyhub-app/src/pages/admin/components/admin-primitives.css`:

```css
/* Admin UI Primitives — uses only --sh-* CSS custom property tokens */

.admin-card {
  background: var(--sh-surface);
  border: 1px solid var(--sh-border);
  border-radius: 14px;
  padding: 20px;
}

.admin-card--compact {
  padding: 16px;
}

.admin-card--flush {
  padding: 0;
}

.admin-card__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--sh-heading);
  margin: 0 0 16px 0;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

/* Table */
.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 13px;
}

.admin-table th {
  text-align: left;
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sh-muted);
  background: var(--sh-soft);
  border-bottom: 1px solid var(--sh-border);
}

.admin-table td {
  padding: 12px 16px;
  color: var(--sh-text);
  border-bottom: 1px solid var(--sh-border);
  vertical-align: middle;
}

.admin-table tr:hover td {
  background: var(--sh-soft);
}

.admin-table td.strong {
  font-weight: 600;
  color: var(--sh-heading);
}

.admin-table td.muted {
  color: var(--sh-muted);
  font-size: 12px;
}

/* Modal */
.admin-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.admin-modal {
  background: var(--sh-surface);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.25);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  width: 100%;
  position: relative;
}

.admin-modal--sm { max-width: 420px; }
.admin-modal--md { max-width: 560px; }
.admin-modal--lg { max-width: 720px; }
.admin-modal--xl { max-width: 960px; }

.admin-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--sh-border);
  position: sticky;
  top: 0;
  background: var(--sh-surface);
  z-index: 1;
  border-radius: 16px 16px 0 0;
}

.admin-modal__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--sh-heading);
  margin: 0;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.admin-modal__close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--sh-muted);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.admin-modal__close:hover {
  background: var(--sh-soft);
  color: var(--sh-heading);
}

.admin-modal__body {
  padding: 24px;
}

.admin-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--sh-border);
}

/* Input */
.admin-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.admin-field__label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--sh-muted);
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.admin-field__input {
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--sh-input-border);
  border-radius: 10px;
  font-size: 14px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  color: var(--sh-input-text);
  background: var(--sh-input-bg);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.admin-field__input:focus {
  border-color: var(--sh-input-focus);
  box-shadow: 0 0 0 3px var(--sh-input-focus-ring);
}

.admin-field__input::placeholder {
  color: var(--sh-input-placeholder);
}

.admin-field__textarea {
  padding: 10px 12px;
  min-height: 80px;
  resize: vertical;
}

.admin-field__select {
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--sh-input-border);
  border-radius: 10px;
  font-size: 14px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  color: var(--sh-input-text);
  background: var(--sh-input-bg);
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.admin-field__select:focus {
  border-color: var(--sh-input-focus);
  box-shadow: 0 0 0 3px var(--sh-input-focus-ring);
}

/* Pill */
.admin-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'Plus Jakarta Sans', sans-serif;
  white-space: nowrap;
  border: 1px solid transparent;
}

.admin-pill--pending {
  background: var(--sh-warning-bg);
  color: var(--sh-warning-text);
  border-color: var(--sh-warning-border);
}

.admin-pill--confirmed {
  background: var(--sh-danger-bg);
  color: var(--sh-danger-text);
  border-color: var(--sh-danger-border);
}

.admin-pill--dismissed,
.admin-pill--decayed,
.admin-pill--expired,
.admin-pill--lifted {
  background: var(--sh-soft);
  color: var(--sh-muted);
  border-color: var(--sh-border);
}

.admin-pill--reversed,
.admin-pill--approved,
.admin-pill--active-success {
  background: var(--sh-success-bg);
  color: var(--sh-success-text);
  border-color: var(--sh-success-border);
}

.admin-pill--rejected {
  background: var(--sh-danger-bg);
  color: var(--sh-danger-text);
  border-color: var(--sh-danger-border);
}

.admin-pill--info {
  background: var(--sh-info-bg);
  color: var(--sh-info-text);
  border-color: var(--sh-info-border);
}

.admin-pill--active {
  background: var(--sh-danger-bg);
  color: var(--sh-danger-text);
  border-color: var(--sh-danger-border);
}

/* Split Panel */
.admin-split {
  display: flex;
  gap: 0;
  min-height: 400px;
}

.admin-split__left {
  flex: 0 0 55%;
  overflow-y: auto;
  padding: 24px;
  border-right: 1px solid var(--sh-border);
}

.admin-split__right {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

@media (max-width: 960px) {
  .admin-split__left,
  .admin-split__right {
    flex: 0 0 50%;
  }
}

@media (max-width: 768px) {
  .admin-split {
    flex-direction: column;
  }

  .admin-split__left {
    flex: none;
    border-right: none;
    border-bottom: 1px solid var(--sh-border);
    max-height: 50vh;
  }

  .admin-split__right {
    flex: none;
    max-height: 50vh;
  }
}

/* Buttons */
.admin-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  font-family: 'Plus Jakarta Sans', sans-serif;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
  white-space: nowrap;
}

.admin-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.admin-btn--primary {
  background: var(--sh-brand);
  color: #fff;
  border-color: var(--sh-brand);
}

.admin-btn--primary:hover:not(:disabled) {
  background: var(--sh-brand-hover);
}

.admin-btn--danger {
  background: var(--sh-danger-bg);
  color: var(--sh-danger-text);
  border-color: var(--sh-danger-border);
}

.admin-btn--danger:hover:not(:disabled) {
  background: var(--sh-danger-border);
}

.admin-btn--success {
  background: var(--sh-success-bg);
  color: var(--sh-success-text);
  border-color: var(--sh-success-border);
}

.admin-btn--success:hover:not(:disabled) {
  background: var(--sh-success-border);
}

.admin-btn--ghost {
  background: transparent;
  color: var(--sh-subtext);
  border-color: var(--sh-border);
}

.admin-btn--ghost:hover:not(:disabled) {
  background: var(--sh-soft);
}

.admin-btn--sm {
  padding: 5px 10px;
  font-size: 12px;
  border-radius: 8px;
}

/* Empty state */
.admin-empty {
  text-align: center;
  padding: 48px 24px;
  color: var(--sh-muted);
  font-size: 14px;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.admin-empty__icon {
  margin-bottom: 12px;
  color: var(--sh-border);
}

/* Pagination */
.admin-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 0;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 13px;
  color: var(--sh-subtext);
}

/* Filter bar */
.admin-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
}

.admin-filter-btn {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  font-family: 'Plus Jakarta Sans', sans-serif;
  border: 1px solid var(--sh-border);
  background: var(--sh-surface);
  color: var(--sh-subtext);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.admin-filter-btn:hover {
  background: var(--sh-soft);
}

.admin-filter-btn--active {
  background: var(--sh-brand);
  color: #fff;
  border-color: var(--sh-brand);
}

/* Detail row */
.admin-detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 0;
  border-bottom: 1px solid var(--sh-border);
}

.admin-detail-row:last-child {
  border-bottom: none;
}

.admin-detail-row__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--sh-muted);
}

.admin-detail-row__value {
  font-size: 14px;
  color: var(--sh-heading);
  font-weight: 500;
}

/* Error/Loading */
.admin-error {
  background: var(--sh-danger-bg);
  border: 1px solid var(--sh-danger-border);
  color: var(--sh-danger-text);
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.admin-loading {
  text-align: center;
  padding: 32px;
  color: var(--sh-muted);
  font-size: 13px;
  font-family: 'Plus Jakarta Sans', sans-serif;
}
```

- [ ] **Step 2: Create AdminCard.jsx**

```jsx
import './admin-primitives.css'

export default function AdminCard({ title, compact, flush, children, className = '', style }) {
  const cls = [
    'admin-card',
    compact && 'admin-card--compact',
    flush && 'admin-card--flush',
    className,
  ].filter(Boolean).join(' ')
  return (
    <div className={cls} style={style}>
      {title && <h3 className="admin-card__title">{title}</h3>}
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create AdminModal.jsx**

```jsx
import { useEffect, useCallback } from 'react'
import { CloseIcon } from './icons'
import './admin-primitives.css'

export default function AdminModal({ open, onClose, title, size = 'md', children, footer }) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div className="admin-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={`admin-modal admin-modal--${size}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal__header">
          <h2 className="admin-modal__title">{title}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="admin-modal__body">{children}</div>
        {footer && <div className="admin-modal__footer">{footer}</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create AdminTable.jsx**

```jsx
import './admin-primitives.css'

export default function AdminTable({ columns, rows, onRowClick, emptyText = 'No data.' }) {
  if (!rows || rows.length === 0) {
    return <div className="admin-empty">{emptyText}</div>
  }

  return (
    <table className="admin-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} style={col.style}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.id ?? i}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={onRowClick ? { cursor: 'pointer' } : undefined}
          >
            {columns.map((col) => (
              <td key={col.key} className={col.cellClass}>
                {col.render ? col.render(row) : row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 5: Create AdminInput.jsx, AdminSelect.jsx, AdminPill.jsx**

`AdminInput.jsx`:
```jsx
import './admin-primitives.css'

export default function AdminInput({ label, textarea, className = '', ...props }) {
  const inputCls = textarea
    ? 'admin-field__input admin-field__textarea'
    : 'admin-field__input'
  const El = textarea ? 'textarea' : 'input'
  return (
    <label className={`admin-field ${className}`}>
      {label && <span className="admin-field__label">{label}</span>}
      <El className={inputCls} {...props} />
    </label>
  )
}
```

`AdminSelect.jsx`:
```jsx
import './admin-primitives.css'

export default function AdminSelect({ label, options, className = '', ...props }) {
  return (
    <label className={`admin-field ${className}`}>
      {label && <span className="admin-field__label">{label}</span>}
      <select className="admin-field__select" {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  )
}
```

`AdminPill.jsx`:
```jsx
import './admin-primitives.css'

const STATUS_MAP = {
  pending: 'pending',
  confirmed: 'confirmed',
  dismissed: 'dismissed',
  reversed: 'reversed',
  approved: 'approved',
  rejected: 'rejected',
  active: 'active',
  decayed: 'decayed',
  expired: 'expired',
  lifted: 'lifted',
  clean: 'active-success',
  info: 'info',
}

export default function AdminPill({ status, children }) {
  const variant = STATUS_MAP[status] || 'info'
  return (
    <span className={`admin-pill admin-pill--${variant}`}>
      {children || status}
    </span>
  )
}
```

- [ ] **Step 6: Create AdminSplitPanel.jsx**

```jsx
import './admin-primitives.css'

export default function AdminSplitPanel({ left, right }) {
  return (
    <div className="admin-split">
      <div className="admin-split__left">{left}</div>
      <div className="admin-split__right">{right}</div>
    </div>
  )
}
```

- [ ] **Step 7: Create barrel export index.js**

```js
export { default as AdminCard } from './AdminCard'
export { default as AdminTable } from './AdminTable'
export { default as AdminModal } from './AdminModal'
export { default as AdminInput } from './AdminInput'
export { default as AdminSelect } from './AdminSelect'
export { default as AdminPill } from './AdminPill'
export { default as AdminSplitPanel } from './AdminSplitPanel'
```

- [ ] **Step 8: Verify build**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS.

Run: `npm --prefix frontend/studyhub-app run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/components/
git commit -m "feat: add shared admin UI primitives (AdminCard, AdminTable, AdminModal, AdminInput, AdminSelect, AdminPill, AdminSplitPanel)"
```

---

### Task 4: Add user search backend endpoint

**Files:**
- Modify: `backend/src/modules/admin/admin.users.controller.js`
- Create: `backend/test/admin-user-search.test.js`

- [ ] **Step 1: Write failing test for user search**

Create `backend/test/admin-user-search.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
const mockFindMany = vi.fn()
vi.mock('../src/lib/prisma.js', () => ({
  default: {
    user: { findMany: (...args) => mockFindMany(...args) },
  },
}))

// Mock auth middleware
vi.mock('../src/middleware/auth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { userId: 1, role: 'admin' }; next() },
  requireAdmin: (req, res, next) => next(),
}))

const { default: app } = await import('../src/app.js')
const request = (await import('supertest')).default

describe('GET /api/admin/users/search', () => {
  beforeEach(() => { mockFindMany.mockReset() })

  it('returns matching users by username', async () => {
    mockFindMany.mockResolvedValue([
      { id: 5, username: 'testuser', displayName: 'Test User', email: 'test@example.com', avatarUrl: null },
    ])
    const res = await request(app).get('/api/admin/users/search?q=test')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].username).toBe('testuser')
  })

  it('rejects queries shorter than 2 characters', async () => {
    const res = await request(app).get('/api/admin/users/search?q=a')
    expect(res.status).toBe(400)
  })

  it('rejects empty query', async () => {
    const res = await request(app).get('/api/admin/users/search')
    expect(res.status).toBe(400)
  })

  it('limits results to 10', async () => {
    mockFindMany.mockResolvedValue([])
    await request(app).get('/api/admin/users/search?q=test')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix backend test -- admin-user-search`
Expected: FAIL — route does not exist yet.

- [ ] **Step 3: Add user search endpoint**

Open `backend/src/modules/admin/admin.users.controller.js`. Add after the existing `GET /users` route (around line 96):

```js
// GET /users/search — search users by username, email, or displayName
router.get('/users/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters.' })
    }
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 10, 10)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, displayName: true, email: true, avatarUrl: true },
      take: limit,
      orderBy: { username: 'asc' },
    })
    res.json(users)
  } catch (err) {
    captureError(err)
    res.status(500).json({ error: 'Search failed.' })
  }
})
```

**Important:** This route MUST be registered before the `GET /users/:id` route (if one exists) to avoid the `search` string being parsed as a `:id` parameter. Check the route order and move if needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix backend test -- admin-user-search`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/admin/admin.users.controller.js backend/test/admin-user-search.test.js
git commit -m "feat: add admin user search endpoint (username, email, displayName)"
```

---

### Task 5: Create UserSearchInput frontend component

**Files:**
- Create: `frontend/studyhub-app/src/pages/admin/components/UserSearchInput.jsx`

- [ ] **Step 1: Create UserSearchInput.jsx**

```jsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { API } from '../../../config'
import { SearchIcon, CloseIcon } from './icons'
import './admin-primitives.css'

export default function UserSearchInput({ value, onChange, label = 'User' }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)
  const wrapperRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = useCallback(
    (q) => {
      if (q.length < 2) {
        setResults([])
        setOpen(false)
        return
      }
      setLoading(true)
      fetch(`${API}/api/admin/users/search?q=${encodeURIComponent(q)}&limit=10`, {
        credentials: 'include',
      })
        .then((r) => r.json())
        .then((data) => {
          setResults(Array.isArray(data) ? data : [])
          setOpen(true)
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    },
    []
  )

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 300)
  }

  const handleSelect = (user) => {
    onChange(user)
    setQuery('')
    setOpen(false)
    setResults([])
  }

  const handleClear = () => {
    onChange(null)
    setQuery('')
    setResults([])
  }

  // If a user is selected, show their info
  if (value) {
    return (
      <div className="admin-field">
        {label && <span className="admin-field__label">{label}</span>}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 10,
          border: '1px solid var(--sh-border)', background: 'var(--sh-soft)',
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14,
        }}>
          {value.avatarUrl ? (
            <img src={value.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--sh-brand-soft)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'var(--sh-brand)',
            }}>
              {(value.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--sh-heading)' }}>{value.displayName || value.username}</div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>@{value.username} · {value.email}</div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--sh-muted)', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}
            aria-label="Clear selection"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-field" ref={wrapperRef} style={{ position: 'relative' }}>
      {label && <span className="admin-field__label">{label}</span>}
      <div style={{ position: 'relative' }}>
        <SearchIcon
          size={16}
          style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--sh-muted)', pointerEvents: 'none',
          }}
        />
        <input
          className="admin-field__input"
          style={{ paddingLeft: 36 }}
          placeholder="Search by name or email..."
          value={query}
          onChange={handleInput}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
      </div>
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          marginTop: 4, background: 'var(--sh-surface)',
          border: '1px solid var(--sh-border)', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
          maxHeight: 280, overflowY: 'auto',
        }}>
          {results.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => handleSelect(user)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px', border: 'none',
                background: 'transparent', cursor: 'pointer', textAlign: 'left',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sh-soft)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'var(--sh-brand-soft)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: 'var(--sh-brand)',
                }}>
                  {(user.username || '?')[0].toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--sh-heading)' }}>
                  {user.displayName || user.username}
                </div>
                <div style={{ fontSize: 12, color: 'var(--sh-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  @{user.username} · {user.email}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && query.length >= 2 && !loading && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          marginTop: 4, padding: '16px', textAlign: 'center',
          background: 'var(--sh-surface)', border: '1px solid var(--sh-border)',
          borderRadius: 12, color: 'var(--sh-muted)', fontSize: 13,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          No users found.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/components/UserSearchInput.jsx
git commit -m "feat: add UserSearchInput typeahead component for admin strike form"
```

---

### Task 6: Rewrite StrikesSubTab with primitives, user search, and auto case ID

**Files:**
- Modify: `frontend/studyhub-app/src/pages/admin/StrikesSubTab.jsx`
- Modify: `backend/src/modules/moderation/moderation.admin.cases.controller.js` (auto-create case on manual strike)

- [ ] **Step 1: Update backend to auto-create case on manual strike**

Open `backend/src/modules/moderation/moderation.admin.cases.controller.js`. Find the `POST /strikes` handler (around line 425). Replace the strike creation logic to auto-create a case when no `caseId` is provided:

```js
// POST /strikes — issue manual strike with auto case creation
router.post('/strikes', async (req, res) => {
  try {
    const userId = Number.parseInt(req.body?.userId, 10)
    const reason = (req.body?.reason || '').trim()
    let caseId = req.body?.caseId ? Number.parseInt(req.body.caseId, 10) : null

    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Valid userId required.' })
    if (reason.length < 10 || reason.length > 1000) return res.status(400).json({ error: 'Reason must be 10-1000 characters.' })

    const targetUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!targetUser) return res.status(404).json({ error: 'User not found.' })
    if (isSuperAdmin(targetUser)) return res.status(403).json({ error: 'Cannot strike super admin.' })

    // Auto-create a lightweight case if none linked
    if (!caseId) {
      const autoCase = await prisma.moderationCase.create({
        data: {
          contentType: 'user',
          contentId: userId,
          userId,
          status: 'confirmed',
          source: 'admin_manual',
          reasonCategory: 'other',
          reviewedBy: req.user.userId,
          reviewNote: reason,
        },
      })
      caseId = autoCase.id
    }

    const result = await issueStrike({ userId, reason, caseId, issuedBy: req.user.userId })
    res.status(201).json(result)
  } catch (err) {
    captureError(err)
    res.status(500).json({ error: 'Failed to issue strike.' })
  }
})
```

- [ ] **Step 2: Rewrite StrikesSubTab.jsx**

Replace the entire `frontend/studyhub-app/src/pages/admin/StrikesSubTab.jsx` with:

```jsx
import { AdminCard, AdminTable, AdminPill } from './components'
import UserSearchInput from './components/UserSearchInput'
import AdminInput from './components/AdminInput'
import { formatDateTime } from './adminConstants'

export default function StrikesSubTab({
  state, strikeForm, strikeSaving, strikeError,
  onStrikeFormChange, onSubmitStrike, onPageChange,
}) {
  const columns = [
    { key: 'id', label: 'ID', cellClass: 'strong' },
    { key: 'user', label: 'User', render: (r) => r.user?.username || `#${r.userId}` },
    { key: 'reason', label: 'Reason', render: (r) => (
      <span style={{ maxWidth: 300, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.reason}
      </span>
    )},
    { key: 'status', label: 'Status', render: (r) => (
      <AdminPill status={r.decayedAt ? 'decayed' : 'active'}>
        {r.decayedAt ? 'Decayed' : 'Active'}
      </AdminPill>
    )},
    { key: 'caseId', label: 'Case', render: (r) => r.caseId ? `#${r.caseId}` : '\u2014' },
    { key: 'issuedAt', label: 'Issued', render: (r) => formatDateTime(r.issuedAt) },
    { key: 'expiresAt', label: 'Expires', render: (r) => formatDateTime(r.expiresAt) },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <AdminCard title="Issue New Strike">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <UserSearchInput
            value={strikeForm._selectedUser || null}
            onChange={(user) => onStrikeFormChange({
              ...strikeForm,
              userId: user ? user.id : '',
              _selectedUser: user,
            })}
          />
          <AdminInput
            label="Reason"
            placeholder="Describe the violation (10-1000 characters)"
            value={strikeForm.reason}
            onChange={(e) => onStrikeFormChange({ ...strikeForm, reason: e.target.value })}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{
              fontSize: 12, color: 'var(--sh-muted)',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Case ID will be auto-assigned
            </span>
            <button
              className="admin-btn admin-btn--primary"
              disabled={strikeSaving || !strikeForm.userId || strikeForm.reason.length < 10}
              onClick={onSubmitStrike}
            >
              {strikeSaving ? 'Issuing...' : 'Issue Strike'}
            </button>
          </div>
          {strikeError && <div className="admin-error">{strikeError}</div>}
        </div>
      </AdminCard>

      <AdminCard title="Strike History" flush>
        {state.loading ? (
          <div className="admin-loading">Loading strikes...</div>
        ) : state.error ? (
          <div className="admin-error" style={{ margin: 16 }}>{state.error}</div>
        ) : (
          <>
            <AdminTable columns={columns} rows={state.items} emptyText="No strikes issued yet." />
            {state.total > 1 && (
              <div className="admin-pager">
                <button
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={state.page <= 1}
                  onClick={() => onPageChange(state.page - 1)}
                >
                  Prev
                </button>
                <span>Page {state.page} of {state.total}</span>
                <button
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={state.page >= state.total}
                  onClick={() => onPageChange(state.page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </AdminCard>
    </div>
  )
}
```

- [ ] **Step 3: Update parent ModerationTab.jsx to pass new props**

Open `frontend/studyhub-app/src/pages/admin/ModerationTab.jsx`. Find where `StrikesSubTab` is rendered and update the `strikeForm` initial state to include `_selectedUser: null`. Find the `submitStrike` function and remove the `caseId` from the request body (it's auto-assigned now):

In the `strikeForm` state initialization, change:
```js
const [strikeForm, setStrikeForm] = useState({ userId: '', reason: '', caseId: '' })
```
to:
```js
const [strikeForm, setStrikeForm] = useState({ userId: '', reason: '', _selectedUser: null })
```

In the `submitStrike` function, update the body to not send `caseId`:
```js
body: JSON.stringify({ userId: Number(strikeForm.userId), reason: strikeForm.reason }),
```

After success, reset form:
```js
setStrikeForm({ userId: '', reason: '', _selectedUser: null })
```

Pass `onStrikeFormChange` prop: `onStrikeFormChange={setStrikeForm}`.

- [ ] **Step 4: Verify build**

Run: `npm --prefix frontend/studyhub-app run lint`
Run: `npm --prefix frontend/studyhub-app run build`
Expected: Both PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/StrikesSubTab.jsx
git add frontend/studyhub-app/src/pages/admin/ModerationTab.jsx
git add backend/src/modules/moderation/moderation.admin.cases.controller.js
git commit -m "feat: rewrite strike form with user search and auto case ID"
```

---

### Task 7: Rewrite AppealsSubTab and RestrictionsSubTab with primitives

**Files:**
- Modify: `frontend/studyhub-app/src/pages/admin/AppealsSubTab.jsx`
- Modify: `frontend/studyhub-app/src/pages/admin/RestrictionsSubTab.jsx`

- [ ] **Step 1: Rewrite AppealsSubTab.jsx**

Replace entire file with:

```jsx
import { AdminCard, AdminTable, AdminPill } from './components'
import { formatDateTime, formatLabel } from './adminConstants'

export default function AppealsSubTab({
  state, appealStatus, onAppealStatusChange,
  onReviewAppeal, onPageChange,
}) {
  const columns = [
    { key: 'id', label: 'ID', cellClass: 'strong' },
    { key: 'user', label: 'User', render: (r) => r.user?.username || `#${r.userId}` },
    { key: 'case', label: 'Case', render: (r) => `#${r.caseId}` },
    { key: 'category', label: 'Category', render: (r) => formatLabel(r.reasonCategory, '\u2014') },
    { key: 'reason', label: 'Reason', render: (r) => (
      <span style={{ maxWidth: 220, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.reason}
      </span>
    )},
    { key: 'status', label: 'Status', render: (r) => <AdminPill status={r.status}>{formatLabel(r.status)}</AdminPill> },
    { key: 'createdAt', label: 'Submitted', render: (r) => formatDateTime(r.createdAt) },
    { key: 'actions', label: 'Actions', render: (r) => {
      if (r.status !== 'pending') return <span style={{ color: 'var(--sh-muted)', fontSize: 12 }}>Reviewed</span>
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="admin-btn admin-btn--success admin-btn--sm" onClick={() => onReviewAppeal(r.id, 'approve')}>
            Approve
          </button>
          <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => onReviewAppeal(r.id, 'reject')}>
            Reject
          </button>
        </div>
      )
    }},
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="admin-filters">
        {['pending', 'approved', 'rejected'].map((s) => (
          <button
            key={s}
            className={`admin-filter-btn ${appealStatus === s ? 'admin-filter-btn--active' : ''}`}
            onClick={() => onAppealStatusChange(s)}
          >
            {formatLabel(s)}
          </button>
        ))}
      </div>

      <AdminCard flush>
        {state.loading ? (
          <div className="admin-loading">Loading appeals...</div>
        ) : state.error ? (
          <div className="admin-error" style={{ margin: 16 }}>{state.error}</div>
        ) : (
          <>
            <AdminTable columns={columns} rows={state.items} emptyText="No appeals found." />
            {state.total > 1 && (
              <div className="admin-pager">
                <button className="admin-btn admin-btn--ghost admin-btn--sm" disabled={state.page <= 1} onClick={() => onPageChange(state.page - 1)}>Prev</button>
                <span>Page {state.page} of {state.total}</span>
                <button className="admin-btn admin-btn--ghost admin-btn--sm" disabled={state.page >= state.total} onClick={() => onPageChange(state.page + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </AdminCard>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite RestrictionsSubTab.jsx**

Replace entire file with:

```jsx
import { AdminCard, AdminTable, AdminPill } from './components'
import { formatDateTime } from './adminConstants'

export default function RestrictionsSubTab({ state, onLift, onPageChange }) {
  const columns = [
    { key: 'id', label: 'ID', cellClass: 'strong' },
    { key: 'user', label: 'User', render: (r) => r.user?.username || `#${r.userId}` },
    { key: 'type', label: 'Type', render: (r) => r.type },
    { key: 'reason', label: 'Reason', render: (r) => r.reason || '\u2014' },
    { key: 'status', label: 'Status', render: (r) => {
      const isActive = !r.endsAt || new Date(r.endsAt) > new Date()
      if (!isActive) return <AdminPill status="lifted">Lifted</AdminPill>
      return <AdminPill status="active">Active</AdminPill>
    }},
    { key: 'endsAt', label: 'Until', render: (r) => r.endsAt ? formatDateTime(r.endsAt) : 'Permanent' },
    { key: 'actions', label: 'Actions', render: (r) => {
      const isActive = !r.endsAt || new Date(r.endsAt) > new Date()
      if (!isActive) return <span style={{ color: 'var(--sh-muted)', fontSize: 12 }}>Lifted</span>
      return (
        <button className="admin-btn admin-btn--success admin-btn--sm" onClick={() => onLift(r.id)}>
          Lift
        </button>
      )
    }},
  ]

  return (
    <AdminCard flush>
      {state.loading ? (
        <div className="admin-loading">Loading restrictions...</div>
      ) : state.error ? (
        <div className="admin-error" style={{ margin: 16 }}>{state.error}</div>
      ) : (
        <>
          <AdminTable columns={columns} rows={state.items} emptyText="No restrictions found." />
          {state.total > 1 && (
            <div className="admin-pager">
              <button className="admin-btn admin-btn--ghost admin-btn--sm" disabled={state.page <= 1} onClick={() => onPageChange(state.page - 1)}>Prev</button>
              <span>Page {state.page} of {state.total}</span>
              <button className="admin-btn admin-btn--ghost admin-btn--sm" disabled={state.page >= state.total} onClick={() => onPageChange(state.page + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </AdminCard>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm --prefix frontend/studyhub-app run lint`
Run: `npm --prefix frontend/studyhub-app run build`
Expected: Both PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/AppealsSubTab.jsx frontend/studyhub-app/src/pages/admin/RestrictionsSubTab.jsx
git commit -m "feat: rewrite AppealsSubTab and RestrictionsSubTab with admin primitives"
```

---

### Task 8: Create ContentPreviewModal and fix preview linkPaths

**Files:**
- Create: `frontend/studyhub-app/src/pages/admin/components/ContentPreviewModal.jsx`
- Modify: `backend/src/modules/moderation/moderation.admin.cases.controller.js` (fix linkPath generation)

- [ ] **Step 1: Fix backend linkPath generation**

Open `backend/src/modules/moderation/moderation.admin.cases.controller.js`. Find the `GET /cases/:id/preview` handler (around line 266). Find where `linkPath` is built for each content type and fix the paths:

For `post` / `feed_post`: change to `/feed?post=${contentId}`
For `sheet`: change to `/sheets/${contentId}`
For `note`: change to `/notes/${contentId}`
For `post_comment`: set to `/feed?post=${parentPostId}&comment=${contentId}` (find the parent post ID from the comment record)
For `sheet_comment`: set to `/sheets/${parentSheetId}?comment=${contentId}`
For `note_comment`: set to `/notes/${parentNoteId}?comment=${contentId}`

Ensure attachment preview URLs are returned as full URLs (not browser-navigable links) so the frontend can fetch them as images.

- [ ] **Step 2: Create ContentPreviewModal.jsx**

Create `frontend/studyhub-app/src/pages/admin/components/ContentPreviewModal.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { API } from '../../../config'
import AdminModal from './AdminModal'
import AdminSplitPanel from './AdminSplitPanel'
import { AdminPill } from './index'
import { ExternalLinkIcon } from './icons'
import { formatDateTime, formatLabel } from '../adminConstants'
import './admin-primitives.css'

function ContentPane({ preview, caseData }) {
  if (!preview) return <div className="admin-loading">Loading preview...</div>

  return (
    <div>
      {preview.linkPath && (
        <a
          href={preview.linkPath}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 600, color: 'var(--sh-brand)',
            textDecoration: 'none', marginBottom: 16,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <ExternalLinkIcon size={14} /> View on site
        </a>
      )}

      {preview.title && (
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sh-heading)', margin: '0 0 8px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {preview.title}
        </h3>
      )}

      {preview.text && (
        <div style={{
          fontSize: 14, color: 'var(--sh-text)', lineHeight: 1.6,
          marginBottom: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          {preview.text}
        </div>
      )}

      {preview.attachments && preview.attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {preview.attachments.map((att, i) => {
            if (att.kind === 'image') {
              return (
                <img
                  key={i}
                  src={`${API}${att.previewUrl || att.url}`}
                  alt="Attachment"
                  style={{
                    maxWidth: '100%', maxHeight: 400, borderRadius: 10,
                    border: '1px solid var(--sh-border)', objectFit: 'contain',
                  }}
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              )
            }
            if (att.kind === 'pdf') {
              return (
                <iframe
                  key={i}
                  src={`${API}${att.url}`}
                  title="PDF Preview"
                  style={{ width: '100%', height: 400, borderRadius: 10, border: '1px solid var(--sh-border)' }}
                />
              )
            }
            return (
              <div key={i} style={{
                padding: 12, borderRadius: 10, border: '1px solid var(--sh-border)',
                background: 'var(--sh-soft)', fontSize: 13, color: 'var(--sh-subtext)',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                Attachment: {att.filename || 'file'} ({att.kind})
              </div>
            )
          })}
        </div>
      )}

      {preview.owner && (
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--sh-muted)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          By @{preview.owner.username} · {formatDateTime(preview.createdAt)}
        </div>
      )}
    </div>
  )
}

function ContextPane({ caseData, onConfirm, onDismiss, onIssueStrike }) {
  if (!caseData) return <div className="admin-loading">Loading case...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Reported User</span>
        <span className="admin-detail-row__value">{caseData.user?.username || '\u2014'}</span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Reported By</span>
        <span className="admin-detail-row__value">{caseData.reporter?.username || 'System'}</span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Category</span>
        <span className="admin-detail-row__value">{formatLabel(caseData.reasonCategory, '\u2014')}</span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Source</span>
        <span className="admin-detail-row__value">
          <AdminPill status={caseData.source === 'auto' ? 'info' : 'pending'}>
            {formatLabel(caseData.source)}
          </AdminPill>
        </span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Status</span>
        <span className="admin-detail-row__value"><AdminPill status={caseData.status}>{formatLabel(caseData.status)}</AdminPill></span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Confidence</span>
        <span className="admin-detail-row__value">{caseData.confidence != null ? `${(caseData.confidence * 100).toFixed(0)}%` : '\u2014'}</span>
      </div>
      <div className="admin-detail-row">
        <span className="admin-detail-row__label">Created</span>
        <span className="admin-detail-row__value">{formatDateTime(caseData.createdAt)}</span>
      </div>

      {caseData.excerpt && (
        <div className="admin-detail-row">
          <span className="admin-detail-row__label">Reporter Note</span>
          <span className="admin-detail-row__value" style={{ fontSize: 13, fontStyle: 'italic' }}>
            {caseData.excerpt}
          </span>
        </div>
      )}

      {caseData.strikes && caseData.strikes.length > 0 && (
        <div className="admin-detail-row">
          <span className="admin-detail-row__label">Linked Strikes</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {caseData.strikes.map((s) => (
              <AdminPill key={s.id} status={s.decayedAt ? 'decayed' : 'active'}>
                Strike #{s.id} {s.decayedAt ? '(Decayed)' : '(Active)'}
              </AdminPill>
            ))}
          </div>
        </div>
      )}

      {caseData.appeals && caseData.appeals.length > 0 && (
        <div className="admin-detail-row">
          <span className="admin-detail-row__label">Linked Appeals</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {caseData.appeals.map((a) => (
              <AdminPill key={a.id} status={a.status}>
                Appeal #{a.id} ({formatLabel(a.status)})
              </AdminPill>
            ))}
          </div>
        </div>
      )}

      {caseData.status === 'pending' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
          <button className="admin-btn admin-btn--danger" onClick={onConfirm}>Confirm Violation</button>
          <button className="admin-btn admin-btn--ghost" onClick={onDismiss}>Dismiss</button>
          <button className="admin-btn admin-btn--primary" onClick={onIssueStrike}>Issue Strike</button>
        </div>
      )}

      {caseData.status === 'confirmed' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
          <button className="admin-btn admin-btn--primary" onClick={onIssueStrike}>Issue Strike</button>
        </div>
      )}
    </div>
  )
}

export default function ContentPreviewModal({
  open, onClose, caseId,
  onConfirm, onDismiss, onIssueStrike,
}) {
  const [caseData, setCaseData] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !caseId) return
    setLoading(true)
    setCaseData(null)
    setPreview(null)

    const opts = { credentials: 'include' }

    Promise.all([
      fetch(`${API}/api/admin/moderation/cases/${caseId}`, opts).then((r) => r.json()),
      fetch(`${API}/api/admin/moderation/cases/${caseId}/preview`, opts).then((r) => r.json()),
    ])
      .then(([c, p]) => {
        setCaseData(c)
        setPreview(p)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, caseId])

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={`Case #${caseId || ''} \u2014 Reported Content`}
      size="xl"
    >
      {loading ? (
        <div className="admin-loading" style={{ minHeight: 300 }}>Loading case details...</div>
      ) : (
        <AdminSplitPanel
          left={<ContentPane preview={preview} caseData={caseData} />}
          right={
            <ContextPane
              caseData={caseData}
              onConfirm={onConfirm}
              onDismiss={onDismiss}
              onIssueStrike={onIssueStrike}
            />
          }
        />
      )}
    </AdminModal>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm --prefix frontend/studyhub-app run lint`
Run: `npm --prefix frontend/studyhub-app run build`
Expected: Both PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/components/ContentPreviewModal.jsx
git add backend/src/modules/moderation/moderation.admin.cases.controller.js
git commit -m "feat: add ContentPreviewModal with rich split-panel preview and fix linkPaths"
```

---

### Task 9: Wire ContentPreviewModal into CasesSubTab

**Files:**
- Modify: `frontend/studyhub-app/src/pages/admin/CasesSubTab.jsx`

- [ ] **Step 1: Add modal state and integrate**

Open `frontend/studyhub-app/src/pages/admin/CasesSubTab.jsx` (483 lines). The existing component renders an inline expanded case detail when a row is clicked. Replace this with opening the `ContentPreviewModal`.

At the top, add imports:
```jsx
import ContentPreviewModal from './components/ContentPreviewModal'
```

In the main `CasesSubTab` component, add state:
```jsx
const [modalCaseId, setModalCaseId] = useState(null)
```

Replace the row click handler to set `modalCaseId` instead of expanding inline:
```jsx
onClick={() => setModalCaseId(row.id)}
```

Add the modal at the bottom of the component's return:
```jsx
<ContentPreviewModal
  open={!!modalCaseId}
  onClose={() => setModalCaseId(null)}
  caseId={modalCaseId}
  onConfirm={() => { reviewCase(modalCaseId, 'confirm'); setModalCaseId(null) }}
  onDismiss={() => { reviewCase(modalCaseId, 'dismiss'); setModalCaseId(null) }}
  onIssueStrike={() => { /* navigate to strikes tab with case pre-filled */ setModalCaseId(null) }}
/>
```

Remove or keep the inline `CaseDetail` component for reference — the modal replaces its usage. Remove the `expandedCase` state and the inline expansion rendering block.

Also add the `ExternalLinkIcon` import and a small "View on site" link button in the cases table actions column.

- [ ] **Step 2: Verify build**

Run: `npm --prefix frontend/studyhub-app run lint`
Run: `npm --prefix frontend/studyhub-app run build`
Expected: Both PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/CasesSubTab.jsx
git commit -m "feat: wire ContentPreviewModal into cases table, replace inline expansion"
```

---

### Task 10: Add feed deep link scroll + highlight

**Files:**
- Modify: `frontend/studyhub-app/src/pages/feed/FeedPage.jsx`

- [ ] **Step 1: Add deep link scroll logic**

Open `frontend/studyhub-app/src/pages/feed/FeedPage.jsx`. Add logic to read the `post` query parameter and scroll to the targeted post.

After the existing `useSearchParams` usage, add:

```jsx
const targetPostId = searchParams.get('post')
```

Add a `useEffect` that scrolls to the target post after feed data loads:

```jsx
useEffect(() => {
  if (!targetPostId || loading) return
  const el = document.querySelector(`[data-post-id="${targetPostId}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.transition = 'box-shadow 0.3s'
    el.style.boxShadow = '0 0 0 3px var(--sh-info-border)'
    setTimeout(() => { el.style.boxShadow = '' }, 2000)
  }
}, [targetPostId, loading])
```

Where feed posts are rendered, add a `data-post-id` attribute to each post container:

```jsx
<div data-post-id={post.id} ...>
```

For comment deep links (`comment` param), add similar scroll-to logic targeting `[data-comment-id="${commentId}"]`.

- [ ] **Step 2: Verify build**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/feed/FeedPage.jsx
git commit -m "feat: add deep link scroll-to-post with highlight for /feed?post=N"
```

---

## Group 3: User-Facing Moderation Tab Redesign

### Task 11: Fix AppealModal centering and redesign ModerationTab

**Files:**
- Modify: `frontend/studyhub-app/src/pages/settings/ModerationTab.jsx`
- Modify: `frontend/studyhub-app/src/components/ModerationBanner.jsx`

- [ ] **Step 1: Replace emoji icons in ModerationBanner**

Open `frontend/studyhub-app/src/components/ModerationBanner.jsx` (46 lines). Replace the emoji characters on line 41 with SVG icons.

Add import at top:
```jsx
import { WarningTriangleIcon, ShieldXIcon } from '../pages/admin/components/icons'
```

Replace the emoji `⚠` with `<WarningTriangleIcon size={16} />` and `⛔` with `<ShieldXIcon size={16} />`.

- [ ] **Step 2: Fix AppealModal in user ModerationTab**

Open `frontend/studyhub-app/src/pages/settings/ModerationTab.jsx` (651 lines). The `AppealModal` component (lines 63-229) is rendered inline. Refactor it to use a proper centered overlay.

Find the `AppealModal` function component. Replace its outer wrapper with a fixed-position centered overlay:

Replace the outer container from inline positioning to:
```jsx
if (!open) return null
return (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 9000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)',
    padding: 24,
  }} onClick={onClose}>
    <div style={{
      background: 'var(--sh-surface)', borderRadius: 16,
      maxWidth: 520, width: '92vw', maxHeight: 'calc(100vh - 48px)',
      overflowY: 'auto', boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
    }} onClick={(e) => e.stopPropagation()}>
      {/* existing modal content */}
    </div>
  </div>
)
```

Add Escape key handling:
```jsx
useEffect(() => {
  if (!open) return
  const handler = (e) => { if (e.key === 'Escape') onClose() }
  document.addEventListener('keydown', handler)
  document.body.style.overflow = 'hidden'
  return () => {
    document.removeEventListener('keydown', handler)
    document.body.style.overflow = ''
  }
}, [open, onClose])
```

- [ ] **Step 3: Replace hardcoded colors**

Search the file for any remaining hardcoded hex values (like `'#fff'`). Replace with `--sh-*` tokens:
- `'#fff'` on brand buttons → keep as `#fff` (white text on colored buttons is an allowed exception per CLAUDE.md)
- Any other hex colors → replace with appropriate `var(--sh-*)` tokens.

- [ ] **Step 4: Improve layout spacing**

In `StatusSection`: ensure stats cards have `gap: 16px` between them.
In `CasesSection`: ensure case cards have `padding: 20px`.
In `AppealsSection`: improve empty state with an SVG icon instead of plain text.
In `Card` component: ensure consistent `borderRadius: 14px`, `padding: 20px`.

- [ ] **Step 5: Verify build**

Run: `npm --prefix frontend/studyhub-app run lint`
Run: `npm --prefix frontend/studyhub-app run build`
Expected: Both PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/studyhub-app/src/pages/settings/ModerationTab.jsx frontend/studyhub-app/src/components/ModerationBanner.jsx
git commit -m "feat: fix AppealModal centering, replace emojis with SVG icons, improve spacing"
```

---

## Group 4: Deletion Lifecycle

### Task 12: Add Prisma schema changes

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add ModerationLog model and new fields**

Open `backend/prisma/schema.prisma`. Add after the `ModerationSnapshot` model:

```prisma
model ModerationLog {
  id          Int      @id @default(autoincrement())
  userId      Int
  action      String
  caseId      Int?
  strikeId    Int?
  appealId    Int?
  contentType String?
  contentId   Int?
  reason      String?
  performedBy Int?
  metadata    Json?
  createdAt   DateTime @default(now())

  user User @relation("ModerationLogUser", fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@index([caseId])
}
```

Add fields to `ModerationSnapshot`:
```prisma
permanentlyDeletedAt DateTime?
```

Add field to `ModerationCase`:
```prisma
contentPurged Boolean @default(false)
```

Add the relation to the `User` model:
```prisma
moderationLogs ModerationLog[] @relation("ModerationLogUser")
```

- [ ] **Step 2: Generate migration**

Run: `npx --prefix backend prisma migrate dev --name add-moderation-log-and-purge-fields`
Expected: Migration creates successfully.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/
git commit -m "feat: add ModerationLog model, permanentlyDeletedAt, contentPurged fields"
```

---

### Task 13: Create moderation logger helper

**Files:**
- Create: `backend/src/lib/moderationLogger.js`

- [ ] **Step 1: Create the logger module**

```js
import prisma from './prisma.js'

/**
 * Write a moderation audit log entry.
 * Fire-and-forget — never throws, never blocks callers.
 */
export async function logModerationEvent({
  userId,
  action,
  caseId = null,
  strikeId = null,
  appealId = null,
  contentType = null,
  contentId = null,
  reason = null,
  performedBy = null,
  metadata = null,
}) {
  try {
    await prisma.moderationLog.create({
      data: {
        userId,
        action,
        caseId,
        strikeId,
        appealId,
        contentType,
        contentId,
        reason,
        performedBy,
        metadata,
      },
    })
  } catch (err) {
    // Best-effort — never throw from logger
    console.error('[moderation-log] Failed to write log entry:', err.message)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/moderationLogger.js
git commit -m "feat: add moderation audit logger helper"
```

---

### Task 14: Integrate audit logging into existing moderation flows

**Files:**
- Modify: `backend/src/lib/moderationEngine.js`
- Modify: `backend/src/modules/moderation/moderation.admin.cases.controller.js`
- Modify: `backend/src/modules/moderation/moderation.admin.enforcement.controller.js`
- Modify: `backend/src/modules/moderation/moderation.user.controller.js`

- [ ] **Step 1: Add logging to moderationEngine.js**

Open `backend/src/lib/moderationEngine.js` (427 lines). Add import at top:
```js
import { logModerationEvent } from './moderationLogger.js'
```

In `scanContent` (around line 130, after case creation): add:
```js
logModerationEvent({ userId: modCase.userId, action: 'case_opened', caseId: modCase.id, contentType, contentId, reason: `Auto-detected: ${topCategory}` })
```

In `issueStrike` (around line 230, after strike creation): add:
```js
logModerationEvent({ userId, action: 'strike_issued', caseId, strikeId: strike.id, reason, performedBy: issuedBy })
```

In `issueStrike` (after auto-restriction, around line 245): add:
```js
logModerationEvent({ userId, action: 'restriction_applied', reason: `Auto-restricted: ${activeCount} active strikes`, performedBy: null })
```

In `reviewCase` (around line 320, after confirm): add:
```js
logModerationEvent({ userId: modCase.userId, action: 'case_confirmed', caseId, contentType: modCase.contentType, contentId: modCase.contentId, performedBy: reviewedBy })
```

In `reviewCase` (after dismiss): add:
```js
logModerationEvent({ userId: modCase.userId, action: 'case_dismissed', caseId, performedBy: reviewedBy })
```

In `restoreContent` (around line 410, after successful restoration): add:
```js
logModerationEvent({ userId: modCase.userId, action: 'appeal_approved', caseId })
```

- [ ] **Step 2: Add logging to admin enforcement controller**

Open `backend/src/modules/moderation/moderation.admin.enforcement.controller.js`. Add import:
```js
import { logModerationEvent } from '../../lib/moderationLogger.js'
```

In the appeal review handler (PATCH /appeals/:id/review):
- After approval (around line 170): add:
```js
logModerationEvent({ userId: appeal.userId, action: 'appeal_approved', caseId: appeal.caseId, appealId: appeal.id, performedBy: req.user.userId })
logModerationEvent({ userId: appeal.userId, action: 'strike_decayed', caseId: appeal.caseId, appealId: appeal.id, performedBy: req.user.userId })
```

- After rejection (around line 190): add:
```js
logModerationEvent({ userId: appeal.userId, action: 'appeal_rejected', caseId: appeal.caseId, appealId: appeal.id, performedBy: req.user.userId })
```

In the restriction lift handler (PATCH /restrictions/:id/lift):
- After successful lift: add:
```js
logModerationEvent({ userId: restriction.userId, action: 'restriction_lifted', performedBy: req.user.userId })
```

- [ ] **Step 3: Add logging to user controller**

Open `backend/src/modules/moderation/moderation.user.controller.js`. Add import:
```js
import { logModerationEvent } from '../../lib/moderationLogger.js'
```

In POST /reports (around line 240, after case creation): add:
```js
logModerationEvent({ userId: targetOwnerId, action: 'case_opened', caseId: modCase.id, contentType: targetType, contentId: targetId, reason: reasonCategory, performedBy: req.user.userId })
```

In POST /appeals (around line 340, after appeal creation): add:
```js
logModerationEvent({ userId: req.user.userId, action: 'appeal_submitted', caseId, appealId: appeal.id })
```

Also fix the notification link (search for `/settings?tab=account` and change to `/settings?tab=moderation`).

- [ ] **Step 4: Verify tests**

Run: `npm --prefix backend test`
Expected: All existing tests PASS. Logging is fire-and-forget so it won't break existing flows.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/moderationEngine.js
git add backend/src/modules/moderation/moderation.admin.cases.controller.js
git add backend/src/modules/moderation/moderation.admin.enforcement.controller.js
git add backend/src/modules/moderation/moderation.user.controller.js
git commit -m "feat: integrate audit logging into all moderation flows"
```

---

### Task 15: Create permanent deletion scheduler

**Files:**
- Create: `backend/src/lib/moderationCleanupScheduler.js`
- Modify: `backend/src/server.js`

- [ ] **Step 1: Create moderationCleanupScheduler.js**

Follow the same pattern as `htmlArchiveScheduler.js`:

```js
import prisma from './prisma.js'
import { logModerationEvent } from './moderationLogger.js'

let cleanupInterval = null

export function startModerationCleanupScheduler() {
  if (process.env.NODE_ENV === 'test') return
  if (cleanupInterval) return

  const intervalMs = Number(process.env.MODERATION_CLEANUP_INTERVAL_MS) || 6 * 60 * 60 * 1000
  const graceDays = Number(process.env.MODERATION_GRACE_DAYS) || 30
  const dryRun = process.env.MODERATION_CLEANUP_DRY_RUN === 'true'
  const batchSize = 50

  async function runCleanup() {
    try {
      const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000)

      // Find snapshots eligible for permanent deletion
      const snapshots = await prisma.moderationSnapshot.findMany({
        where: {
          restoredAt: null,
          permanentlyDeletedAt: null,
          createdAt: { lt: cutoff },
          case: {
            status: 'confirmed',
            contentPurged: false,
            // Skip if there's a pending appeal
            appeals: { none: { status: 'pending' } },
          },
        },
        include: { case: true },
        take: batchSize,
      })

      if (snapshots.length === 0) return

      console.log(`[moderation-cleanup] Processing ${snapshots.length} expired snapshots${dryRun ? ' (dry run)' : ''}`)

      const CONTENT_MODEL_MAP = {
        post: 'feedPost',
        feed_post: 'feedPost',
        sheet: 'studySheet',
        note: 'note',
        post_comment: 'feedPostComment',
        sheet_comment: 'comment',
        note_comment: 'noteComment',
      }

      for (const snap of snapshots) {
        try {
          const modelName = CONTENT_MODEL_MAP[snap.targetType]
          if (!modelName) continue

          if (dryRun) {
            console.log(`[moderation-cleanup] DRY RUN: would delete ${snap.targetType} #${snap.targetId} (case #${snap.caseId})`)
            continue
          }

          // Delete the content record (cascade handles children)
          const model = prisma[modelName]
          if (model) {
            await model.delete({ where: { id: snap.targetId } }).catch(() => {
              // Content may already be deleted — that's fine
            })
          }

          // Mark snapshot and case
          await prisma.$transaction([
            prisma.moderationSnapshot.update({
              where: { id: snap.id },
              data: { permanentlyDeletedAt: new Date() },
            }),
            prisma.moderationCase.update({
              where: { id: snap.caseId },
              data: { contentPurged: true },
            }),
          ])

          // Audit log
          if (snap.ownerId) {
            logModerationEvent({
              userId: snap.ownerId,
              action: 'content_purged',
              caseId: snap.caseId,
              contentType: snap.targetType,
              contentId: snap.targetId,
              reason: `Permanently deleted after ${graceDays}-day grace period`,
            })
          }

          console.log(`[moderation-cleanup] Purged ${snap.targetType} #${snap.targetId} (case #${snap.caseId})`)
        } catch (err) {
          console.error(`[moderation-cleanup] Failed to purge snapshot #${snap.id}:`, err.message)
          // Continue with next item
        }
      }
    } catch (err) {
      console.error('[moderation-cleanup] Scheduler error:', err.message)
    }
  }

  // Run once on startup after a short delay, then on interval
  setTimeout(runCleanup, 30_000)
  cleanupInterval = setInterval(runCleanup, intervalMs)
  cleanupInterval.unref()
}
```

- [ ] **Step 2: Register in server.js**

Open `backend/src/server.js`. Find where `startHtmlArchiveScheduler` is called. Add alongside it:

```js
import { startModerationCleanupScheduler } from './lib/moderationCleanupScheduler.js'
// ... after server.listen:
startModerationCleanupScheduler()
```

- [ ] **Step 3: Verify tests**

Run: `npm --prefix backend test`
Expected: PASS (scheduler no-ops in test env).

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/moderationCleanupScheduler.js backend/src/server.js
git commit -m "feat: add 30-day moderation content cleanup scheduler"
```

---

### Task 16: Add user-facing moderation log endpoint and My History tab

**Files:**
- Modify: `backend/src/modules/moderation/moderation.user.controller.js`
- Modify: `backend/src/modules/moderation/moderation.routes.js`
- Modify: `frontend/studyhub-app/src/pages/settings/ModerationTab.jsx`

- [ ] **Step 1: Add my-log endpoint**

Open `backend/src/modules/moderation/moderation.user.controller.js`. Add a new route after the existing routes:

```js
// GET /my-log — user's own moderation history
router.get('/my-log', async (req, res) => {
  try {
    const page = parsePage(req.query.page)
    const limit = 20
    const [items, total] = await Promise.all([
      prisma.moderationLog.findMany({
        where: { userId: req.user.userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          contentType: true,
          reason: true,
          createdAt: true,
          // Do NOT expose performedBy, metadata, or admin details
        },
      }),
      prisma.moderationLog.count({ where: { userId: req.user.userId } }),
    ])
    res.json({ items, page, totalPages: Math.ceil(total / limit) || 1 })
  } catch (err) {
    captureError(err)
    res.status(500).json({ error: 'Failed to load history.' })
  }
})
```

Import `parsePage` from `moderation.constants.js` if not already imported.

- [ ] **Step 2: Add My History tab to user ModerationTab**

Open `frontend/studyhub-app/src/pages/settings/ModerationTab.jsx`. Add a new `HistorySection` component and a "My History" tab option:

Add to the tab list (alongside My Status, My Cases, My Appeals):
```jsx
{ key: 'history', label: 'My History' }
```

Create a `HistorySection` component:
```jsx
function HistorySection() {
  const [log, setLog] = useState({ items: [], page: 1, totalPages: 1 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/api/moderation/my-log?page=${log.page}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setLog(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [log.page])

  const ACTION_LABELS = {
    case_opened: 'Content flagged for review',
    case_confirmed: 'Violation confirmed',
    case_dismissed: 'Case dismissed',
    strike_issued: 'Strike issued',
    strike_decayed: 'Strike removed',
    strike_expired: 'Strike expired',
    appeal_submitted: 'Appeal submitted',
    appeal_approved: 'Appeal approved',
    appeal_rejected: 'Appeal rejected',
    restriction_applied: 'Account restricted',
    restriction_lifted: 'Restriction lifted',
    content_purged: 'Content permanently removed',
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--sh-muted)' }}>Loading history...</div>

  if (log.items.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--sh-muted)' }}>
          No moderation history.
        </div>
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {log.items.map((entry) => (
        <Card key={entry.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sh-heading)' }}>
                {ACTION_LABELS[entry.action] || entry.action}
              </div>
              {entry.reason && (
                <div style={{ fontSize: 13, color: 'var(--sh-subtext)', marginTop: 4 }}>
                  {entry.reason}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', whiteSpace: 'nowrap' }}>
              {formatDate(entry.createdAt)}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm --prefix frontend/studyhub-app run lint`
Run: `npm --prefix frontend/studyhub-app run build`
Expected: Both PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/moderation/moderation.user.controller.js
git add frontend/studyhub-app/src/pages/settings/ModerationTab.jsx
git commit -m "feat: add user-facing moderation history log"
```

---

### Task 17: Add admin moderation log + export endpoints

**Files:**
- Modify: `backend/src/modules/admin/admin.users.controller.js`

- [ ] **Step 1: Add admin log viewing endpoint**

Open `backend/src/modules/admin/admin.users.controller.js`. Add:

```js
// GET /moderation/users/:userId/log — admin view of user's moderation history
router.get('/moderation/users/:userId/log', async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10)
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId.' })
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const limit = 50

    const [items, total] = await Promise.all([
      prisma.moderationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.moderationLog.count({ where: { userId } }),
    ])
    res.json({ items, page, totalPages: Math.ceil(total / limit) || 1 })
  } catch (err) {
    captureError(err)
    res.status(500).json({ error: 'Failed to load log.' })
  }
})
```

- [ ] **Step 2: Add CSV export endpoint**

```js
// GET /moderation/users/:userId/log/export — CSV export of moderation history
router.get('/moderation/users/:userId/log/export', async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10)
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId.' })

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
    if (!user) return res.status(404).json({ error: 'User not found.' })

    const dateStr = new Date().toISOString().slice(0, 10)
    const filename = `moderation-log-${user.username}-${dateStr}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    // Write CSV header
    res.write('Date,Action,Case ID,Content Type,Content ID,Reason,Performed By,Metadata\n')

    // Stream in batches
    const batchSize = 100
    let skip = 0
    let hasMore = true

    while (hasMore) {
      const batch = await prisma.moderationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: batchSize,
      })

      for (const row of batch) {
        const fields = [
          row.createdAt.toISOString(),
          row.action,
          row.caseId ?? '',
          row.contentType ?? '',
          row.contentId ?? '',
          `"${(row.reason || '').replace(/"/g, '""')}"`,
          row.performedBy ?? 'system',
          row.metadata ? `"${JSON.stringify(row.metadata).replace(/"/g, '""')}"` : '',
        ]
        res.write(fields.join(',') + '\n')
      }

      skip += batchSize
      hasMore = batch.length === batchSize
    }

    res.end()
  } catch (err) {
    captureError(err)
    res.status(500).json({ error: 'Export failed.' })
  }
})
```

- [ ] **Step 3: Verify tests**

Run: `npm --prefix backend test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/admin/admin.users.controller.js
git commit -m "feat: add admin moderation log viewing and CSV export endpoints"
```

---

## Group 5: Security Audit & Bug Fixes

### Task 18: Fix comment moderation filtering gaps + sheet moderationStatus belt-and-suspenders

**Files:**
- Modify: `backend/src/modules/feed/feed.list.controller.js`
- Modify: `backend/src/modules/sheets/sheets.list.controller.js`

- [ ] **Step 1: Write failing test for comment filtering**

Create `backend/test/moderation-comment-filter.test.js`:

```js
import { describe, it, expect } from 'vitest'

describe('Comment moderation filtering', () => {
  it('feed comment count query should include moderationStatus filter', async () => {
    // This is a structural test — we verify the query shape
    // by reading the source code pattern. The actual fix is
    // adding { moderationStatus: 'clean' } to groupBy where clauses.
    const fs = await import('fs')
    const feedList = fs.readFileSync('src/modules/feed/feed.list.controller.js', 'utf8')

    // Post comment count should filter by clean status
    const postCommentSection = feedList.slice(
      feedList.indexOf('feedPostComment'),
      feedList.indexOf('feedPostComment') + 200
    )
    expect(postCommentSection).toContain('moderationStatus')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix backend test -- moderation-comment-filter`
Expected: FAIL — `moderationStatus` not found in the comment count query section.

- [ ] **Step 3: Fix feed comment count queries**

Open `backend/src/modules/feed/feed.list.controller.js`. Find the comment count `groupBy` queries:

For post comments (around line 156-161), add `moderationStatus: 'clean'` to the `where` clause:
```js
where: { postId: { in: postIds }, moderationStatus: 'clean' },
```

For sheet comments (around line 147-151), add:
```js
where: { sheetId: { in: sheetIds }, moderationStatus: 'clean' },
```

For note comments (around line 199-205), add:
```js
where: { noteId: { in: noteIds }, moderationStatus: 'clean' },
```

- [ ] **Step 4: Fix sheet list comment count queries**

Open `backend/src/modules/sheets/sheets.list.controller.js`. Find all comment count `groupBy` queries (lines 148-152, 212-217, 298-303) and add `moderationStatus: 'clean'` to each `where` clause.

- [ ] **Step 5: Run tests**

Run: `npm --prefix backend test`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/feed/feed.list.controller.js backend/src/modules/sheets/sheets.list.controller.js
git add backend/test/moderation-comment-filter.test.js
git commit -m "fix: filter moderated comments from feed and sheet listing counts"
```

---

### Task 19: Fix attachment preview 404 and restoreContent error handling

**Files:**
- Modify: `backend/src/modules/feed/feed.posts.controller.js`
- Modify: `backend/src/lib/moderationEngine.js`

- [ ] **Step 1: Fix attachment preview 404**

Open `backend/src/modules/feed/feed.posts.controller.js`. Find the `GET /posts/:id/attachment/preview` handler (around line 141). Ensure it returns a structured JSON error instead of the 404 page when the attachment is missing:

```js
if (!post.attachmentUrl) {
  return res.status(404).json({ error: 'No attachment found.', kind: 'none' })
}
```

Also check that the file existence check returns a JSON error:
```js
if (!existsSync(filePath)) {
  return res.status(404).json({ error: 'Attachment file not found.', kind: 'missing' })
}
```

- [ ] **Step 2: Improve restoreContent error handling**

Open `backend/src/lib/moderationEngine.js`. Find `restoreContent` (around line 373). Replace the silent catch with structured logging:

```js
export async function restoreContent(caseId) {
  const modCase = await prisma.moderationCase.findUnique({ where: { id: caseId } })
  if (!modCase) {
    console.error(`[restoreContent] Case #${caseId} not found`)
    return { success: false, error: 'Case not found' }
  }

  try {
    const { contentType, contentId } = modCase
    const modelName = CONTENT_MODEL_MAP[contentType]
    if (!modelName) {
      return { success: false, error: `Unknown content type: ${contentType}` }
    }

    const model = prisma[modelName]

    // Restore in transaction
    await prisma.$transaction(async (tx) => {
      if (HAS_MODERATION_STATUS.has(contentType)) {
        await tx[modelName].update({
          where: { id: contentId },
          data: { moderationStatus: 'clean' },
        })
      }
      if (contentType === 'sheet') {
        await tx.studySheet.update({
          where: { id: contentId },
          data: { status: 'published', moderationStatus: 'clean' },
        })
      }
      await tx.moderationSnapshot.updateMany({
        where: { caseId },
        data: { restoredAt: new Date() },
      })
      await tx.moderationCase.update({
        where: { id: caseId },
        data: { status: 'reversed' },
      })
    })

    return { success: true }
  } catch (err) {
    console.error(`[restoreContent] Failed to restore case #${caseId}:`, err.message)
    return { success: false, error: err.message }
  }
}
```

- [ ] **Step 3: Verify tests**

Run: `npm --prefix backend test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/feed/feed.posts.controller.js backend/src/lib/moderationEngine.js
git commit -m "fix: return JSON on preview 404, add transaction to restoreContent"
```

---

### Task 20: Final validation

**Files:** None (validation only)

- [ ] **Step 1: Run full lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS.

- [ ] **Step 2: Run full build**

Run: `npm --prefix frontend/studyhub-app run build`
Expected: PASS.

- [ ] **Step 3: Run backend tests**

Run: `npm --prefix backend test`
Expected: PASS.

- [ ] **Step 4: Run backend lint**

Run: `npm --prefix backend run lint`
Expected: PASS.

- [ ] **Step 5: Update beta release log**

Open `docs/beta-v1.5.0-release-log.md` (or the current release log). Add an entry documenting all changes made in this implementation cycle.

- [ ] **Step 6: Final commit**

```bash
git add docs/
git commit -m "docs: update release log with moderation system overhaul changes"
```
