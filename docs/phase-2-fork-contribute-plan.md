# Phase 2 — Fork & Contribute, End to End

**Target repo:** `studyhub`
**Author:** Planning handoff from Cowork Claude to VS Code Claude
**Goal:** Make StudyHub's fork-and-contribute flow feel like GitHub, fully wired end to end.
**Prereq done in Phase 1:** Fork creates a draft copy on the server, the "Sheet not found" race has been softened with a retry, and the Publish button already reads "Contribute" when the sheet is a fork (`sheet.forkOf` truthy). All work below builds on that.

Read `CLAUDE.md` at the project root before starting. It describes the module layout, the `/api` URL convention, Prisma 6 `NOT: [{ field: null }]` rule, the error envelope helper, and the rate limiter convention. Follow it exactly.

---

## Scope of this phase

1. A GitHub-style "Open a contribution" modal that replaces the current bare-bones flow.
2. A reusable diff viewer component (unified and split views) used in three places: the Contribute tab, the owner Review tab, and the contribution detail modal.
3. A sandboxed preview of the fork's proposed HTML content for the owner, reusing the HTML preview origin pipeline.
4. The Top Contributors widget in `SheetLabAnalytics.jsx` wired to a real endpoint (currently renders empty).
5. The Fork Tree widget in `SheetLabLineage.jsx` wired to the existing `/api/sheets/:id/lab/lineage` endpoint and rendered on the public viewer, not only in the lab.
6. Owner Review tab upgrade: accept / reject / request-changes, with hunk-level inline comments.
7. Notifications and activity events for the whole flow.

Out of scope for this phase (deferred): Sheet Lab Rich Text/HTML toggle, Study Groups redesign, group backgrounds, media paywall. Do not touch those files.

---

## Existing pieces you can build on

Backend (already exists, do not rewrite):

- `backend/src/modules/sheets/sheets.fork.controller.js` — `POST /api/sheets/:id/fork`. Idempotent, creates `fork_base` commit, traces `rootSheetId`.
- `backend/src/modules/sheets/sheets.contributions.controller.js` — `POST /api/sheets/:id/contributions`, `PATCH /api/sheets/contributions/:contributionId`, `GET /api/sheets/contributions/:contributionId/diff`. Uses `sheetContribution` Prisma model, enforces pending-only, base checksum conflict detection, notifications.
- `backend/src/modules/sheetLab/sheetLab.lineage.controller.js` — `GET /api/sheets/:id/lab/lineage` already returns the full fork tree keyed off `rootSheetId`. Currently only called from the lab's Lineage tab.
- `backend/src/lib/diff.js` — `computeLineDiff(oldText, newText)` and `addWordSegments(lines)` already return hunks.
- `backend/src/modules/sheetLab/sheetLab.constants.js` — `computeChecksum(content)` helper.
- Prisma models: `StudySheet` (with `forkOf`, `rootSheetId`, `forks`), `SheetContribution` (status, baseChecksum, proposer, reviewer, reviewComment), `SheetCommit` (kind, parentId, content, checksum).

Frontend (already exists, extend in place):

- `frontend/studyhub-app/src/pages/sheets/lab/SheetLabContribute.jsx` — the current "submit contribution" tab. Minimal UI, needs the full redesign below.
- `frontend/studyhub-app/src/pages/sheets/lab/SheetLabReviews.jsx` — owner review tab. Needs diff viewer + inline actions.
- `frontend/studyhub-app/src/pages/sheets/lab/SheetLabAnalytics.jsx` (line 304+) — `Top Contributors` section. Currently renders empty; needs data from a new endpoint.
- `frontend/studyhub-app/src/pages/sheets/lab/SheetLabLineage.jsx` — `TreeNode` recursive renderer already built. Needs a small wrapper to be reusable from the public viewer.
- `frontend/studyhub-app/src/pages/sheets/viewer/SheetReadme.jsx` — renders `readmeData.contributors`; that field already comes from `GET /api/sheets/:id/readme`. Verify it is actually populated and wire the Fork Tree alongside it.

---

## Step 1 — Backend: Top Contributors endpoint

Create a new file. There is nothing like this in the repo yet.

**File:** `backend/src/modules/sheets/sheets.contributors.controller.js` (new)

```js
const express = require('express')
const prisma = require('../../core/db/prisma')
const { captureError } = require('../../core/monitoring/sentry')
const optionalAuth = require('../../core/auth/optionalAuth')
const { sendError, ERROR_CODES } = require('../../middleware/errorEnvelope')
const { AUTHOR_SELECT } = require('./sheets.constants')
const { canReadSheet } = require('./sheets.service')
const { sheetReadLimiter } = require('../../lib/rateLimiters')

const router = express.Router()

/**
 * GET /api/sheets/:id/contributors
 * Returns the top contributors for a sheet's entire lineage (root + all forks).
 * A "contribution" here is any SheetCommit authored by a user on any sheet
 * that shares the same rootSheetId as the requested sheet.
 */
router.get('/:id/contributors', sheetReadLimiter, optionalAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) {
    return sendError(res, 400, 'Invalid sheet id.', ERROR_CODES.BAD_REQUEST)
  }

  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, status: true, rootSheetId: true, forkOf: true },
    })
    if (!sheet) return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    if (!canReadSheet(sheet, req.user || null)) {
      return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    }

    const rootId = sheet.rootSheetId || sheet.forkOf || sheet.id

    // Collect all sheets in the lineage
    const lineageSheets = await prisma.studySheet.findMany({
      where: { OR: [{ id: rootId }, { rootSheetId: rootId }, { forkOf: rootId }] },
      select: { id: true },
    })
    const sheetIds = lineageSheets.map((s) => s.id)

    // Count commits per author
    const grouped = await prisma.sheetCommit.groupBy({
      by: ['userId'],
      where: { sheetId: { in: sheetIds }, NOT: [{ kind: 'fork_base' }] },
      _count: { _all: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 12,
    })

    const userIds = grouped.map((row) => row.userId)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: AUTHOR_SELECT,
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    const contributors = grouped
      .map((row) => ({
        user: userMap.get(row.userId) || null,
        commits: row._count._all,
      }))
      .filter((c) => c.user)

    res.json({ contributors, rootSheetId: rootId, lineageSize: sheetIds.length })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})

module.exports = router
```

**Register it.** In `backend/src/modules/sheets/index.js` (or `sheets.routes.js`, match existing pattern), add the controller alongside the other sub-routers so it mounts under `/api/sheets`.

**Prisma 6 gotcha.** The `NOT: [{ kind: 'fork_base' }]` array form is required by CLAUDE.md. Do not use `kind: { not: 'fork_base' }`.

**Rate limiter.** `sheetReadLimiter` already exists in `rateLimiters.js`. If not, use whatever the other read endpoints in this module use — do not define a new inline limiter.

**Acceptance:** `curl http://localhost:4000/api/sheets/<id>/contributors` on a published sheet returns a `contributors` array with at least the original author after any commit. Returns 404 for private/unpublished sheets the caller cannot read.

---

## Step 2 — Backend: expose lineage to unauthenticated viewers

The existing `GET /api/sheets/:id/lab/lineage` in `sheetLab.lineage.controller.js` uses `optionalAuth` already, but read its filter: it probably hides draft forks from non-owners. That is correct and must stay. No schema change.

Add a companion endpoint under `/api/sheets/:id/fork-tree` that returns exactly the same payload but from the sheets module so the public viewer does not have to call a `/lab/...` URL (minor cosmetics and separation of concerns):

**File:** `backend/src/modules/sheets/sheets.contributors.controller.js` (append to the same file from Step 1):

```js
router.get('/:id/fork-tree', sheetReadLimiter, optionalAuth, async (req, res) => {
  const sheetId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(sheetId)) {
    return sendError(res, 400, 'Invalid sheet id.', ERROR_CODES.BAD_REQUEST)
  }
  try {
    const sheet = await prisma.studySheet.findUnique({
      where: { id: sheetId },
      select: { id: true, userId: true, status: true, rootSheetId: true, forkOf: true },
    })
    if (!sheet) return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    if (!canReadSheet(sheet, req.user || null)) {
      return sendError(res, 404, 'Sheet not found.', ERROR_CODES.NOT_FOUND)
    }
    const rootId = sheet.rootSheetId || sheet.forkOf || sheet.id

    const nodes = await prisma.studySheet.findMany({
      where: {
        OR: [{ id: rootId }, { rootSheetId: rootId }, { forkOf: rootId }],
        status: 'published',
      },
      select: {
        id: true,
        title: true,
        status: true,
        forkOf: true,
        rootSheetId: true,
        forks: true,
        stars: true,
        createdAt: true,
        author: { select: AUTHOR_SELECT },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Build tree: root first, then recursively group by forkOf.
    const byParent = new Map()
    for (const node of nodes) {
      const key = node.forkOf || 'root'
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key).push({ ...node, isCurrent: node.id === sheetId, children: [] })
    }
    function attach(parentNode) {
      const key = parentNode.id
      const kids = byParent.get(key) || []
      parentNode.children = kids
      for (const k of kids) attach(k)
    }
    const root = (byParent.get('root') || [])[0] || null
    if (root) attach(root)

    res.json({ root, count: nodes.length })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    return sendError(res, 500, 'Server error.', ERROR_CODES.INTERNAL)
  }
})
```

**Acceptance:** `/api/sheets/<id>/fork-tree` returns a nested tree where the requested sheet has `isCurrent: true`. Private/unreadable sheets return 404.

---

## Step 3 — Backend: hunk-level review comments (migration + endpoints)

The `SheetContribution` model has a single `reviewComment` string. For GitHub-style inline comments you need a new table. This is a new feature so a migration is required (per CLAUDE.md migration rules).

**Prisma schema addition** (`backend/prisma/schema.prisma`, near the `SheetContribution` model):

```prisma
model ContributionComment {
  id             Int               @id @default(autoincrement())
  contributionId Int
  userId         Int
  hunkIndex      Int               // which diff hunk (0-based)
  lineOffset     Int               // line within the hunk (0-based)
  side           String            @default("new") // "old" | "new"
  body           String
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  contribution   SheetContribution @relation(fields: [contributionId], references: [id], onDelete: Cascade)
  author         User              @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([contributionId, hunkIndex])
  @@index([userId, createdAt])
}
```

Also add the reverse relation on `SheetContribution` (`comments ContributionComment[]`) and on `User` (`contributionComments ContributionComment[]`). The User model already has many relations — follow the pattern.

**Migration file:** `backend/prisma/migrations/20260408000001_add_contribution_comments/migration.sql`

```sql
CREATE TABLE "ContributionComment" (
    "id" SERIAL PRIMARY KEY,
    "contributionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "hunkIndex" INTEGER NOT NULL,
    "lineOffset" INTEGER NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'new',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContributionComment_contributionId_fkey"
        FOREIGN KEY ("contributionId") REFERENCES "SheetContribution"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContributionComment_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ContributionComment_contributionId_hunkIndex_idx"
    ON "ContributionComment"("contributionId", "hunkIndex");

CREATE INDEX "ContributionComment_userId_createdAt_idx"
    ON "ContributionComment"("userId", "createdAt");
```

**New endpoints** — append to `backend/src/modules/sheets/sheets.contributions.controller.js`:

- `GET /api/sheets/contributions/:contributionId/comments` — requireAuth, returns all comments for the contribution ordered by `hunkIndex, lineOffset, createdAt`. Only visible to proposer, target owner, and admin.
- `POST /api/sheets/contributions/:contributionId/comments` — requireAuth + `contributionReviewLimiter`, body `{ hunkIndex, lineOffset, side, body }`. Validate `body` non-empty and <= 1000 chars, `hunkIndex >= 0`, `lineOffset >= 0`, `side in ['old','new']`. Create notification to the *other* party.
- `DELETE /api/sheets/contributions/:contributionId/comments/:commentId` — author or admin only.

Use `sendError` from `errorEnvelope` for all error responses. Do not invent new rate limiters; reuse `contributionReviewLimiter`.

**Acceptance:** `npx prisma migrate deploy` succeeds in local Postgres. POST creates a row, GET returns it, DELETE removes it. Unauthorized users get 404, not 403 (matches the pattern in sheets.read.controller.js).

---

## Step 4 — Frontend: reusable Diff Viewer component

A single component used in the Contribute preview, the Reviews tab, and the contribution detail view.

**File:** `frontend/studyhub-app/src/components/diff/DiffViewer.jsx` (new)

Props:
```
{
  hunks: Array<{ type: 'add' | 'remove' | 'context', lines: Array<{ number?: number, text: string, segments?: Array<{ type: 'add'|'remove'|'eq', text: string }> }> }>,
  mode: 'unified' | 'split',     // default 'unified'
  onAddComment?: (hunkIndex, lineOffset, side) => void,
  comments?: Record<string, Array<Comment>>,  // keyed by `${hunkIndex}:${lineOffset}:${side}`
  renderComment?: (comment) => ReactNode,
}
```

Implementation notes:

- Data source is the response of `GET /api/sheets/contributions/:id/diff`, which already calls `computeLineDiff` + `addWordSegments`. Do not re-implement the diff algorithm.
- Styling: use CSS custom property tokens only — `var(--sh-success-bg)` / `var(--sh-success-text)` for adds, `var(--sh-danger-bg)` / `var(--sh-danger-text)` for removes, `var(--sh-soft)` for context, `var(--sh-border)` for borders. No raw hex. No emojis. (CLAUDE.md rules.)
- Split mode: two `<div>` columns, `grid-template-columns: 1fr 1fr`. For each hunk, align old side and new side row-by-row; empty rows on the side that has no change.
- Add-comment affordance: hovering a line shows a small `+` button in the gutter. Clicking calls `onAddComment(hunkIndex, lineOffset, side)`. Parent handles the modal.
- Render existing comments inline below the line they target. Use `comments[`${hunkIndex}:${lineOffset}:${side}`]`.
- Keyboard: `j` / `k` jump next / previous hunk (reuse the pattern in `SheetLabHistory.jsx` if it has one — otherwise use a `useEffect` that binds and cleans up `keydown`).

**File:** `frontend/studyhub-app/src/components/diff/DiffViewer.css` (new) — scoped styles using tokens. Import from the jsx.

**File:** `frontend/studyhub-app/src/lib/diffService.js` (new) — tiny fetch wrapper:

```js
import { API } from '../config'
import { authHeaders } from '../pages/shared/pageUtils'
import { readJsonSafely, getApiErrorMessage } from './http'

export async function fetchContributionDiff(contributionId) {
  const response = await fetch(`${API}/api/sheets/contributions/${contributionId}/diff`, {
    headers: authHeaders(), credentials: 'include',
  })
  const data = await readJsonSafely(response, {})
  if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load diff.'))
  return data
}

export async function fetchContributionComments(contributionId) { /* ... */ }
export async function postContributionComment(contributionId, payload) { /* ... */ }
export async function deleteContributionComment(contributionId, commentId) { /* ... */ }
```

**Acceptance:** Drop `<DiffViewer hunks={sampleHunks} mode="unified" />` in a Playground story or directly in `SheetLabReviews.jsx` and verify rendering against a real contribution.

---

## Step 5 — Frontend: "Open a contribution" modal (GitHub-style)

Replace the minimal flow in `SheetLabContribute.jsx`. This is the biggest frontend piece.

**File:** `frontend/studyhub-app/src/pages/sheets/lab/SheetLabContribute.jsx` (rewrite)

Layout sections, top to bottom:

1. Banner: "You are contributing changes from your fork back to `<original title>` by `@<original author>`." Link both. Show the current base checksum status — if the base has diverged, show an amber "This fork is behind the original. Contributing now will overwrite upstream changes." warning. Detect by comparing `sheet.forkSource.contentHash` to `sheet.baseChecksum` if present, otherwise skip.
2. Title input, max 160 chars, default to the fork's current title.
3. Description textarea (500 chars, mirror the backend cap). Placeholder: "Summary of what changed and why."
4. Diff preview — mount `<DiffViewer hunks={...} mode={mode} />` with a unified/split toggle, using the `/diff` endpoint. Wrap in a collapsible `<details>` closed by default if the diff has more than 200 lines, with a "Show full diff" button.
5. Pre-submit checklist (client-side, all must be checked): "I reviewed the diff", "I followed the Community Guidelines", "My changes do not include copyrighted textbook content". Disable submit until checked.
6. Submit button `Open contribution`. On success, `showToast('Contribution opened. The original author has been notified.', 'success')`, `trackEvent('contribution_opened', {...})`, navigate to `/sheets/<targetSheetId>?tab=reviews` so the user can see it appear.

Loading and error states follow existing Lab patterns — skeletons, not bare text. Reuse `Skeleton.jsx`.

Use the existing `POST /api/sheets/:id/contributions` endpoint (where `:id` is the *fork* id). Do not change the backend contract.

**File:** `frontend/studyhub-app/src/pages/sheets/lab/useContribution.js` (new) — hook that owns the contribute-modal state and calls `diffService` + the POST endpoint. Keeps the jsx file thin per CLAUDE.md's "pages own layout, hooks own state" rule.

---

## Step 6 — Frontend: owner Review tab upgrade

**File:** `frontend/studyhub-app/src/pages/sheets/lab/SheetLabReviews.jsx` (rewrite)

Layout:

- Left rail: list of contributions for the target sheet. Each item shows proposer avatar, fork title, time, status badge (pending / accepted / rejected). Clicking selects it.
- Right panel for the selected contribution: header with proposer, message, review comment, status; body is the `<DiffViewer />` in split mode by default with the add-comment affordance enabled; footer has three buttons: `Request changes` (opens a small textarea, posts a top-level review comment with `action: 'reject'` or a new status `'changes_requested'` if you prefer, but keep it to the two actions the backend accepts today: `accept` and `reject`).
- Sandbox preview toggle: for HTML sheets only, add a "Preview proposed content" link that opens the existing HTML preview page in a new tab with the fork's content, using the preview origin pipeline from `sheets.html.controller.js`. Read that file to find the exact URL pattern — do not invent one.
- Inline comments: `useContributionComments(contributionId)` hook (new, in same folder) loads, adds, and deletes comments. Pass them to DiffViewer via the `comments` prop.
- Conflict banner: if the accept response returns `conflictWarning`, show it in an amber banner at the top of the right panel after merge.

Backend endpoints already exist: `PATCH /api/sheets/contributions/:id` with `action: 'accept' | 'reject'`, `GET /:id/diff`, and the new comment endpoints from Step 3. Reload the list after any action.

**Acceptance:** Sign in as the owner of a sheet that has a pending contribution, open SheetLab → Reviews, see the list, select it, see the diff, leave an inline comment, accept it, and watch the fork's content merge into the target sheet. The activity feed should show the accept (it already does via `trackActivity` — verify).

---

## Step 7 — Frontend: Top Contributors widget

**File:** `frontend/studyhub-app/src/pages/sheets/lab/SheetLabAnalytics.jsx`

Around line 304 the heading "Top Contributors" already exists with an empty body. Add a `useFetch` call (with SWR) to the new endpoint:

```js
const { data: contribData } = useFetch(`${API}/api/sheets/${sheetId}/contributors`, {
  credentials: 'include',
  swr: 60_000,
})
```

Render a horizontal list of up to 8 contributors: `<UserAvatar>` + username + commit count badge. Use `Link to={`/users/${c.user.username}`}`. If the list is empty, show a soft empty state: "Contributions will appear here once forks are merged back."

Also add the same widget to the public viewer: create `frontend/studyhub-app/src/pages/sheets/viewer/TopContributorsPanel.jsx` and render it in `SheetViewerPage.jsx` next to the existing `RelatedSheetsPanel`. It should use the same endpoint so it benefits from the SWR cache.

---

## Step 8 — Frontend: Fork Tree on the viewer

Extract the recursive `TreeNode` from `SheetLabLineage.jsx` into `frontend/studyhub-app/src/components/forkTree/ForkTree.jsx` so both the lab and the viewer can use it. Keep the existing SheetLabLineage rendering the new component with its current data source.

On the viewer, add `frontend/studyhub-app/src/pages/sheets/viewer/ForkTreePanel.jsx` that fetches `${API}/api/sheets/${sheetId}/fork-tree` with `credentials: 'include'` and SWR cache, then renders `<ForkTree root={data.root} currentSheetId={sheetId} />`. Empty states: if `root` is null or `count === 1`, show "No forks yet — be the first to fork this sheet."

Mount it in `SheetViewerSidebar.jsx` inside the existing sidebar card that already shows `{sheet.forks} forks`. Replace that plain count with the collapsible Fork Tree.

Acceptance: From a sheet with multiple forks, the sidebar shows a collapsible tree, the current sheet is highlighted, and clicking any node navigates to that sheet.

---

## Step 9 — Activity, notifications, telemetry

- `trackEvent` calls: `contribution_opened`, `contribution_accepted`, `contribution_rejected`, `contribution_comment_added`, `fork_tree_viewed`, `top_contributors_viewed`. Follow the exact style of the existing `sheet_forked` event in `useSheetViewer.js`.
- Notifications: the backend already notifies on contribute/accept/reject. Add one more in Step 3's POST comment handler — notify the other party (proposer -> target owner, or owner -> proposer) with `type: 'contribution_comment'`, `linkPath: '/sheets/${targetSheetId}?tab=reviews'`. Reuse `createNotification`.
- Activity feed: `trackActivity` is already called in accept/reject paths. Add it to contribution-comment creation using kind `'contribution_comment'`.

---

## Step 10 — Tests

Backend (Vitest + Supertest). Add `backend/src/modules/sheets/__tests__/contributors.test.js` covering:

- Returns 404 for draft/private sheets to non-owners.
- Returns the author when the sheet has any non-`fork_base` commit.
- Aggregates across the whole lineage (seed root + 2 forks + commits on each).

Add `backend/src/modules/sheets/__tests__/contributionComments.test.js` covering:

- POST requires auth.
- Only proposer / target owner / admin can read and write.
- DELETE only by comment author or admin.
- 404 for unrelated users.

Frontend (Vitest + RTL). Add `frontend/studyhub-app/src/components/diff/DiffViewer.test.jsx`:

- Renders adds, removes, context with correct token classes.
- `onAddComment` fires with correct `(hunkIndex, lineOffset, side)` on button click.
- Split mode aligns old/new columns.

E2E (Playwright). Extend `frontend/studyhub-app/tests/` with `sheets.fork-contribute.spec.js`:

1. User A logs in, publishes a sheet.
2. User B logs in, forks it, edits content, opens a contribution.
3. User A logs back in, sees the review in SheetLab → Reviews, leaves an inline comment, accepts.
4. Assert the original sheet's content now contains User B's edit.

---

## Validation before handoff back to me

Run exactly these, in order:

```
npm --prefix backend run lint
npm --prefix backend test
npm --prefix frontend/studyhub-app run lint
npm --prefix frontend/studyhub-app run build
```

Then run the new Playwright spec alone:

```
npm --prefix frontend/studyhub-app run test:e2e -- sheets.fork-contribute.spec.js
```

Fix any failures. The pre-existing lint errors in `sheets.serializer.js` (`canModerateOrOwnSheet is not defined`) are not from this phase and should remain untouched unless you are specifically asked to fix them.

Finally, append a Phase 2 entry to `docs/beta-v2.0.0-release-log.md` summarizing the endpoints added, the migration name, the new components, and any follow-ups.

---

## File inventory (quick reference)

New files:
- `backend/src/modules/sheets/sheets.contributors.controller.js`
- `backend/prisma/migrations/20260408000001_add_contribution_comments/migration.sql`
- `backend/src/modules/sheets/__tests__/contributors.test.js`
- `backend/src/modules/sheets/__tests__/contributionComments.test.js`
- `frontend/studyhub-app/src/components/diff/DiffViewer.jsx`
- `frontend/studyhub-app/src/components/diff/DiffViewer.css`
- `frontend/studyhub-app/src/components/diff/DiffViewer.test.jsx`
- `frontend/studyhub-app/src/components/forkTree/ForkTree.jsx`
- `frontend/studyhub-app/src/lib/diffService.js`
- `frontend/studyhub-app/src/pages/sheets/lab/useContribution.js`
- `frontend/studyhub-app/src/pages/sheets/lab/useContributionComments.js`
- `frontend/studyhub-app/src/pages/sheets/viewer/TopContributorsPanel.jsx`
- `frontend/studyhub-app/src/pages/sheets/viewer/ForkTreePanel.jsx`
- `frontend/studyhub-app/tests/sheets.fork-contribute.spec.js`

Edited files:
- `backend/prisma/schema.prisma` (add ContributionComment model + relations)
- `backend/src/modules/sheets/sheets.contributions.controller.js` (append comment endpoints)
- `backend/src/modules/sheets/index.js` or `sheets.routes.js` (register new controller)
- `frontend/studyhub-app/src/pages/sheets/lab/SheetLabContribute.jsx` (rewrite)
- `frontend/studyhub-app/src/pages/sheets/lab/SheetLabReviews.jsx` (rewrite)
- `frontend/studyhub-app/src/pages/sheets/lab/SheetLabAnalytics.jsx` (wire Top Contributors)
- `frontend/studyhub-app/src/pages/sheets/lab/SheetLabLineage.jsx` (use shared ForkTree)
- `frontend/studyhub-app/src/pages/sheets/viewer/SheetViewerPage.jsx` (mount TopContributorsPanel)
- `frontend/studyhub-app/src/pages/sheets/viewer/SheetViewerSidebar.jsx` (mount ForkTreePanel)
- `docs/beta-v2.0.0-release-log.md` (append Phase 2 entry)

Do not edit: anything under `backend/src/modules/legal/content/*-2026-04-08.txt` (these are already finalized this week), payments module, messaging module, studyGroups module, AI module.

---

## Design principles to enforce as you go

1. Pages are thin; hooks own fetching and state; components render. Decompose anything over 200 lines.
2. Every fetch URL uses `${API}/api/...`. Every authenticated fetch uses `credentials: 'include'` and `authHeaders()`.
3. Inline colors must use CSS custom property tokens. No raw hex. No emojis. No bullet lists in prose copy.
4. Modals that live inside animated containers use `createPortal(jsx, document.body)`.
5. Every new Prisma model gets a migration in the same PR.
6. `NOT: [{ field: value }]` array form for Prisma 6.
7. Wrap any call to `getBlockedUserIds` / `getMutedUserIds` in try-catch — this phase does not call them directly, but if you add a "recommended reviewers" list later, remember.
8. Use `sendError` + `ERROR_CODES` for new error responses; do not inline `res.status(...).json({ error })` in new code.
9. Rate limiters live in `backend/src/lib/rateLimiters.js` — do not define new ones inline.
10. Follow the existing `sheet_forked` telemetry style for every new `trackEvent`.

Done. Ship Phase 2.
