# SheetLab Improvement Plan

## Current State

SheetLab provides basic version control for study sheets: linear commit history, snapshot creation, restore to previous versions, and a line-based diff viewer. Collaboration happens through a fork-and-contribute model similar to GitHub.

## Proposed Improvements

### 1. Version Control UX

**Better Commit Messages & Metadata**
- Auto-generate descriptive commit messages based on what changed (e.g., "Added 3 paragraphs to Section 2", "Reformatted equations"). Currently messages default to "Snapshot" which is unhelpful.
- Show word count deltas on each commit card (+45 words / -12 words) for quick scan of change magnitude.
- Add commit tags/labels: "major revision", "typo fix", "formatting", "new section", "restructure".

**Visual Diff Improvements**
- Side-by-side diff view in addition to the current unified view. Let users toggle between modes.
- Syntax-highlighted diffs for HTML sheets — show HTML tag changes with color-coded markup.
- Word-level diff highlighting within changed lines (currently only line-level). This would show exactly which words within a line were modified.
- Diff statistics summary panel: "12 lines added, 3 removed, 2 modified across 4 sections."
- Collapsible unchanged regions with "Show 15 unchanged lines" expander.

**Timeline & Navigation**
- Visual branch graph showing fork relationships on the timeline (not just linear commits).
- Quick-jump to first/last commit. Currently users page through 20 at a time.
- Filter commits by author (relevant for contributed/merged changes).
- Search commit messages.
- Keyboard shortcuts: J/K to navigate commits, D to diff, R to restore.

**Restore Flow**
- Preview-before-restore: show a full diff of what will change before confirming a restore.
- Partial restore: let users cherry-pick specific sections from a previous commit rather than full content replacement.
- Undo restore: one-click revert of the most recent restore action.

### 2. Collaboration Features

**Real-Time Presence**
- Show who's currently viewing a sheet ("2 classmates viewing") with avatar indicators.
- "Last edited by X, 5 minutes ago" on the sheet viewer page.

**Contribution Workflow Improvements**
- Inline diff viewer for incoming contributions — show exactly what the contributor changed, right in the review UI rather than requiring navigation to a separate page.
- Partial accept: let sheet owners accept specific hunks/sections from a contribution rather than all-or-nothing.
- Contribution comments: reviewers can leave inline comments on specific changes (like GitHub PR reviews).
- Contribution templates: "What did you change and why?" prompt when submitting a contribution.
- Auto-close stale contributions after 30 days with notification.

**Merge Conflict Handling**
- When accepting a contribution, if the base sheet has changed since the fork was created, show a 3-way merge view.
- Highlight conflicts and let the owner choose which version to keep for each conflicting section.
- Currently, accepting a contribution blindly overwrites — this is destructive.

**Collaborative Editing Mode**
- Optional real-time collaborative editing for sheets shared within a course (using CRDT or OT).
- Per-section locking: users claim a section to edit, preventing conflicts.
- Edit suggestions: propose changes inline (like Google Docs suggest mode) that the owner can accept/reject.

### 3. Editor Experience

**Rich Editor Improvements**
- Split-pane editor: live preview on the right while editing markdown/HTML on the left.
- Toolbar with formatting buttons (bold, italic, headers, lists, code blocks, tables, math equations).
- Image paste support: paste screenshots directly into the editor with auto-upload.
- LaTeX/KaTeX math equation support with live preview.
- Table editor with visual grid (not just markdown table syntax).
- Code block syntax highlighting with language auto-detection.
- Spell-check and grammar suggestions.

**Templates & Scaffolding**
- Sheet templates: "Exam Study Guide", "Lecture Notes", "Formula Sheet", "Lab Report", "Reading Summary".
- Auto-generate table of contents from headings.
- Section templates within a sheet: "Definition", "Example", "Practice Problem", "Key Concept".

**Auto-Save & Draft Management**
- Auto-save indicator with "Saved 2 seconds ago" status.
- Auto-create snapshots on significant edits (every 50+ word changes or 5-minute intervals).
- Draft branches: work on a major revision without affecting the published version until ready.
- Offline editing support with sync-on-reconnect.

**HTML Editor Enhancements**
- Visual HTML editor (WYSIWYG) alongside the raw code view.
- Component library: drag-and-drop pre-built elements (info boxes, warning callouts, expandable sections, tabbed content).
- CSS editor with live preview and theme presets (dark mode, paper, minimal, colorful).
- Accessibility checker for HTML sheets (alt text, heading hierarchy, color contrast).

### 4. Analytics & Insights

**Sheet Analytics Dashboard**
- View counts over time chart.
- Download/star trends.
- "Most viewed sections" heatmap (which parts of the sheet get the most attention).
- Fork tree visualization: see all forks and their contributions in a graph.

**Version Analytics**
- "Most restored version" indicator — which snapshot do people keep reverting to?
- Change frequency graph: when are edits typically made (before exams, after lectures).

### 5. Export & Interoperability

- Export sheet as PDF with styling preserved.
- Export version history as a changelog document.
- Export diff as shareable link (for study group discussions).
- Import from Google Docs, Notion, or other note-taking apps.

## Priority Ranking

**Phase 1 (High Impact, Lower Effort)**
1. Word-level diff highlighting
2. Side-by-side diff view
3. Auto-generated commit messages
4. Preview-before-restore
5. Contribution inline diff viewer

**Phase 2 (High Impact, Medium Effort)**
6. Split-pane editor with live preview
7. Sheet templates
8. Partial contribution accept
9. Merge conflict detection
10. LaTeX math support

**Phase 3 (High Impact, Higher Effort)**
11. Real-time collaborative editing
12. Visual HTML editor (WYSIWYG)
13. Sheet analytics dashboard
14. Offline editing support
15. Import from external apps
