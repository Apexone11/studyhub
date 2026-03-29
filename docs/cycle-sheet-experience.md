# Sheet Experience Cycle — GitHub-Inspired Improvements

**Version**: v1.8.0-beta
**PM**: Claude (AI Project Manager)
**Owner**: Abdul Fornah
**Date**: 2026-03-29

---

## Cycle Vision

Transform StudyHub's sheet experience from a basic document viewer into a polished, GitHub-quality collaboration platform. Every improvement reinforces the mental model: *sheets are repos, commits are saves, forks are copies, contributions are pull requests.*

---

## Track Overview

| # | Track | Priority | Effort | Files Touched |
|---|-------|----------|--------|---------------|
| 1 | Sheet Viewer Polish | 🔴 Critical | Medium | 8 frontend |
| 2 | README-Style Sheet Landing Pages | 🔴 Critical | Large | 4 frontend, 2 backend |
| 3 | Improved Diff Viewing | 🟡 High | Medium | 4 frontend, 1 backend |
| 4 | Better Fork & Contribution UX | 🟡 High | Medium | 6 frontend, 2 backend |
| 5 | Sheet Version History | 🟢 Medium | Medium | 3 frontend, 2 backend |
| 6 | Branch-Like Workflow Enhancements | 🟢 Medium | Large | 5 frontend, 3 backend |

---

## Track 1 — Sheet Viewer Polish (Priority: Critical)

**Goal**: Make the sheet viewer feel as clean and readable as a GitHub repo page.

### 1.1 — Responsive Two-Panel Layout

**Problem**: Current viewer uses a fixed sidebar that crowds content on smaller screens.
**Solution**: Responsive layout — sidebar collapses to a top summary bar on screens < 1024px.

| File | Change |
|------|--------|
| `frontend/.../viewer/SheetViewerPage.jsx` (236 lines) | Replace inline `display: grid` with CSS class; add responsive breakpoint logic |
| `frontend/.../viewer/SheetViewerSidebar.jsx` (223 lines) | Add collapsed "summary strip" mode; extract key stats (stars, forks, downloads) into a horizontal bar |
| `frontend/.../sheets/SheetsPage.css` | Add `.sh-viewer-layout` responsive grid rules |

### 1.2 — Content Readability Upgrade

**Problem**: `SheetContentPanel` renders raw table data without typographic polish.
**Solution**: Add proper typography, line numbers, soft zebra striping, and a sticky header row.

| File | Change |
|------|--------|
| `frontend/.../viewer/SheetContentPanel.jsx` (204 lines) | Add line numbers column, sticky `<thead>`, zebra stripe rows using `--sh-soft` token |
| `frontend/.../viewer/sheetViewerConstants.js` (173 lines) | Add content display config (font size, line height, max width) |

### 1.3 — Header & Navigation Bar

**Problem**: `SheetHeader` shows title and author but lacks quick-action buttons like GitHub's "Code / Issues / PR" tab bar.
**Solution**: Add a tab-style navigation strip under the header: **Content | Comments (n) | History | Forks (n)**.

| File | Change |
|------|--------|
| `frontend/.../viewer/SheetHeader.jsx` (121 lines) | Add navigation tab strip below title; highlight active section; show counts from sheet data |
| `frontend/.../viewer/SheetViewerPage.jsx` | Wire tab state to scroll-to-section or conditional panel rendering |

### 1.4 — Actions Menu Cleanup

**Problem**: `SheetActionsMenu` is a dropdown with many options but no visual grouping.
**Solution**: Group actions into sections (Social, Edit, Admin) with dividers. Add keyboard shortcut hints.

| File | Change |
|------|--------|
| `frontend/.../viewer/SheetActionsMenu.jsx` (198 lines) | Group items with `<hr>` dividers; add `aria-label` groups; show shortcut hints (⌘F for fork, etc.) |

**Validation**: `npm --prefix frontend/studyhub-app run lint && npm --prefix frontend/studyhub-app run build`

---

## Track 2 — README-Style Sheet Landing Pages (Priority: Critical)

**Goal**: Every sheet gets a rich landing page like a GitHub README — rendered description, metadata badges, and a preview of the content.

### 2.1 — Backend: Sheet README Endpoint

**Problem**: No dedicated endpoint serves a "landing page" view of a sheet with rendered description.
**Solution**: Add a lightweight endpoint that returns rendered metadata + content preview.

| File | Change |
|------|--------|
| `backend/src/modules/sheets/sheets.read.controller.js` (82 lines) | Add `GET /api/sheets/:id/readme` — returns sheet with rendered description (Markdown→HTML via `marked`), latest commit summary, contributor list, and fork tree summary |
| `backend/src/modules/sheets/sheets.serializer.js` (166 lines) | Add `serializeReadme()` formatter that includes rendered description, badge data (stars, forks, downloads, last updated), and content preview (first 20 rows) |

### 2.2 — Frontend: README Landing Component

**Problem**: Sheet viewer jumps straight into the data table. No "about this sheet" context.
**Solution**: New `SheetReadme` component rendered above the content panel, showing rendered description, metadata badges, and contributor avatars.

| File | Change |
|------|--------|
| `frontend/.../viewer/SheetReadme.jsx` **(new)** | Render Markdown description as HTML; show metadata badges (stars, forks, course, last commit date); display contributor avatars (from fork/contribution history); "Edit description" button for owner |
| `frontend/.../viewer/SheetViewerPage.jsx` | Insert `<SheetReadme>` above `<SheetContentPanel>`; fetch readme data from new endpoint |
| `frontend/.../viewer/useSheetViewer.js` (484 lines) | Add `readme` state + fetch call to `/api/sheets/:id/readme` |

### 2.3 — Metadata Badges

**Problem**: Stats are buried in the sidebar.
**Solution**: GitHub-style inline badges (⭐ 12 · 🍴 3 · 📥 45 · Updated 2 days ago) rendered in the README header.

| File | Change |
|------|--------|
| `frontend/.../viewer/SheetReadme.jsx` | Badge row using CSS token colors; click-through to respective sections |

**Validation**: Backend — `npm --prefix backend test`; Frontend — lint + build.

---

## Track 3 — Improved Diff Viewing (Priority: High)

**Goal**: Make diffs as readable as GitHub's split/unified diff view with syntax-aware highlighting.

### 3.1 — Unified & Split Diff Modes

**Problem**: `ContributionInlineDiff.jsx` only shows inline (unified) diffs with basic red/green highlighting.
**Solution**: Add toggle between unified and side-by-side (split) view modes.

| File | Change |
|------|--------|
| `frontend/.../lab/ContributionInlineDiff.jsx` (128 lines) | Refactor into `DiffView` component with `mode` prop (`unified` / `split`); split mode renders two columns with aligned line numbers |
| `frontend/.../lab/SheetLabPanels.jsx` (179 lines) | Update `DiffViewer` panel to include mode toggle button |
| `frontend/.../lab/SheetLabPage.css` | Add `.sh-diff-split` grid layout; `.sh-diff-line-add`, `.sh-diff-line-remove`, `.sh-diff-line-context` classes using semantic tokens |

### 3.2 — Line Numbers & Expandable Context

**Problem**: Diffs show changed lines but no line numbers and no way to see surrounding context.
**Solution**: Add line number gutters and "expand context" buttons between hunks (like GitHub's "Show 20 more lines").

| File | Change |
|------|--------|
| `frontend/.../lab/ContributionInlineDiff.jsx` | Add line number gutter column; render hunk separators with expand buttons |
| `backend/src/lib/diff.js` (275 lines) | Add `contextLines` parameter to `computeDiff()` — include N surrounding unchanged lines around each hunk (default 3) |

### 3.3 — Word-Level Highlight Polish

**Problem**: Word-level diff segments exist in `diff.js` but the frontend rendering doesn't highlight individual changed words within a line.
**Solution**: Render word-level `segments` from the diff engine with `<mark>` spans.

| File | Change |
|------|--------|
| `frontend/.../lab/ContributionInlineDiff.jsx` | Parse `segments` array from diff output; render changed words with `<mark class="sh-diff-word-add">` / `sh-diff-word-remove` |
| `frontend/.../lab/SheetLabPage.css` | Add word-level highlight styles |

**Validation**: `npm --prefix backend test` (diff engine tests); frontend lint + build.

---

## Track 4 — Better Fork & Contribution UX (Priority: High)

**Goal**: Make forking and contributing feel as smooth as GitHub's fork→edit→PR flow.

### 4.1 — One-Click Fork with Redirect

**Problem**: Fork button triggers a modal, then user must navigate to SheetLab manually.
**Solution**: Fork action creates the fork and immediately redirects to the fork's SheetLab editor tab.

| File | Change |
|------|--------|
| `frontend/.../viewer/SheetActionsMenu.jsx` | Change fork action: after POST succeeds, `navigate(`/sheets/${forkId}/lab?tab=editor`)` |
| `frontend/.../viewer/useSheetViewer.js` | Update `handleFork` to return the new fork ID for navigation |

### 4.2 — Contribution Submission Polish

**Problem**: `SheetLabContribute.jsx` (360 lines) has a long form. No preview of what will be submitted.
**Solution**: Add a "Review Changes" step before submission showing the diff summary, affected rows count, and commit message preview.

| File | Change |
|------|--------|
| `frontend/.../lab/SheetLabContribute.jsx` (360 lines) | Add two-step flow: Step 1 = write message + see diff summary; Step 2 = confirm and submit. Add "changes summary" card showing additions/deletions count |
| `frontend/.../lab/useSheetLab.js` (426 lines) | Add `contributionPreview` state computed from current diff |

### 4.3 — Contribution Review Improvements

**Problem**: `SheetLabReviews.jsx` shows contributions but the reviewer can't leave inline comments on specific changes.
**Solution (Phase 1)**: Add a review comment textarea on each contribution card. Full inline review comments deferred to Track 6.

| File | Change |
|------|--------|
| `frontend/.../lab/SheetLabReviews.jsx` (309 lines) | Add "Review Comment" textarea + submit button on each contribution card; show review comments thread |
| `backend/src/modules/sheets/sheets.contributions.controller.js` (278 lines) | Add `reviewComment` field to accept/reject endpoint; store as part of contribution record |

### 4.4 — Fork Relationship Indicator

**Problem**: When viewing a fork, there's no clear "forked from X" banner like GitHub shows.
**Solution**: Add a "Forked from [Original Sheet]" banner at the top of forked sheets.

| File | Change |
|------|--------|
| `frontend/.../viewer/SheetHeader.jsx` | If `sheet.forkSource` exists, render a "Forked from {title} by {author}" link banner above the title |

**Validation**: Frontend lint + build; backend tests for contribution endpoints.

---

## Track 5 — Sheet Version History (Priority: Medium)

**Goal**: Make commit history browsable and meaningful, like `git log`.

### 5.1 — Visual Commit Timeline

**Problem**: SheetLab shows commits in a flat list. No visual timeline or graph.
**Solution**: Render commits as a vertical timeline with author avatars, commit messages, timestamps, and a "view at this version" link.

| File | Change |
|------|--------|
| `frontend/.../lab/SheetLabHistory.jsx` **(new, extracted from SheetLabPage)** | Vertical timeline component; each node shows: avatar, message, relative time, checksum badge, "Browse files" button |
| `frontend/.../lab/SheetLabPage.jsx` (437 lines) | Extract history tab content into `SheetLabHistory`; reduce page size |
| `frontend/.../lab/SheetLabPage.css` | Timeline CSS with vertical line, node circles, responsive layout |

### 5.2 — Compare Any Two Versions

**Problem**: Can only see diff between latest and parent. No way to compare arbitrary commits.
**Solution**: Add version selectors (dropdowns) on the Changes tab to pick base and compare commits.

| File | Change |
|------|--------|
| `frontend/.../lab/SheetLabChanges.jsx` (194 lines) | Add two `<select>` dropdowns for base/compare commit; fetch diff between selected pair |
| `frontend/.../lab/useSheetLab.js` | Add `compareBase` / `compareHead` state; new fetch to `/api/sheets/:id/commits/:a/diff/:b` |
| `backend/src/modules/sheets/sheets.commits.controller.js` | Add `GET /api/sheets/:id/commits/:a/diff/:b` endpoint using existing `computeDiff` |

**Validation**: Backend tests for new endpoint; frontend lint + build.

---

## Track 6 — Branch-Like Workflow Enhancements (Priority: Medium)

**Goal**: Lay groundwork for branch-like collaboration patterns without full git complexity.

### 6.1 — Draft / Published Toggle

**Problem**: Sheets are either published or not. No "draft branch" concept for work-in-progress.
**Solution**: Expose the existing `drafts` system more prominently. Add a "Save as Draft" vs "Publish" toggle in SheetLab editor.

| File | Change |
|------|--------|
| `frontend/.../lab/SheetLabEditor.jsx` (270 lines) | Add "Save Draft" / "Publish Changes" split button; show draft status indicator |
| `backend/src/modules/sheets/sheets.drafts.controller.js` (277 lines) | Ensure draft→publish transition creates a commit automatically |

### 6.2 — Activity Feed on Sheet Page

**Problem**: No way to see recent activity (commits, contributions, comments) on a sheet.
**Solution**: Add an "Activity" tab to the sheet viewer showing a chronological feed of events.

| File | Change |
|------|--------|
| `frontend/.../viewer/SheetActivityFeed.jsx` **(new)** | Render chronological list of events: commits, contributions opened/merged/rejected, comments |
| `frontend/.../viewer/SheetViewerPage.jsx` | Add "Activity" to the navigation tabs from Track 1.3; lazy-load activity data |
| `backend/src/modules/sheets/sheets.activity.controller.js` **(new)** | `GET /api/sheets/:id/activity` — union query across commits, contributions, comments; sorted by date; paginated |
| `backend/src/modules/sheets/sheets.routes.js` (24 lines) | Mount new activity controller |

### 6.3 — Merge Conflict Detection

**Problem**: If the original sheet changes after a fork, the contribution may conflict silently.
**Solution**: Before accepting a contribution, compute whether the target sheet has diverged. Show a warning if so.

| File | Change |
|------|--------|
| `backend/src/modules/sheets/sheets.contributions.controller.js` | Before merge: compare target sheet's latest checksum against the fork's `parentChecksum`. If diverged, return `{ conflictDetected: true, divergedAt: ... }` |
| `backend/src/lib/diff.js` | Add `detectConflicts(base, ours, theirs)` — three-way diff that flags overlapping changes |
| `frontend/.../lab/SheetLabReviews.jsx` | Show conflict warning banner when `conflictDetected` is true; suggest "Update fork" action |

**Validation**: Full test suite; lint; build.

---

## Implementation Order

```
Week 1:  Track 1 (Viewer Polish) — immediate visual impact
Week 2:  Track 2 (README Landing Pages) — biggest UX leap
Week 3:  Track 3 (Diff Viewing) + Track 4 (Fork/Contribution UX)
Week 4:  Track 5 (Version History) + Track 6 (Branch Workflows)
```

Each track ends with: lint ✅ → build ✅ → tests ✅ → beta release log entry.

---

## New Files Summary

| File | Track |
|------|-------|
| `frontend/.../viewer/SheetReadme.jsx` | Track 2 |
| `frontend/.../lab/SheetLabHistory.jsx` | Track 5 |
| `frontend/.../viewer/SheetActivityFeed.jsx` | Track 6 |
| `backend/.../sheets/sheets.activity.controller.js` | Track 6 |

## Risk Notes

1. **Markdown rendering in README**: Use `marked` (already common in Node ecosystems) with DOMPurify on frontend to prevent XSS. Aligns with existing HTML security pipeline.
2. **Three-way merge conflicts**: Track 6.3 is the most complex feature. If time-constrained, ship detection-only (warning) without auto-resolution.
3. **Performance**: README endpoint adds one extra API call per sheet view. Mitigate with HTTP caching headers (`Cache-Control: max-age=60`).
