# S-9: Trust Levels + Pending Review until Trusted — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New users' public-facing content starts as `pending_review` until they earn `trusted` status, reducing moderation load while keeping the community safe.

**Architecture:** Add a `trustLevel` field to the User model (`new` | `trusted` | `restricted`). Create a centralized `trustGate` helper that content-creation endpoints call to decide initial moderation status. On-login check auto-promotes users with clean history after 7 days. Admin panel gets manual trust level control and a "pending from new users" filter.

**Tech Stack:** Prisma (PostgreSQL), Express 5, React 19, Vitest + Supertest

---

## File Structure

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `backend/src/lib/trustGate.js` | Centralized trust-level helpers: `getInitialModerationStatus(user)`, `shouldAutoPublish(user)`, `checkAndPromoteTrust(userId)` |
| `backend/test/trustGate.test.js` | Unit tests for trust gate logic |
| `backend/test/trustLevel.integration.test.js` | Integration tests: new user → pending, trusted user → clean, auto-promotion |
| `backend/prisma/migrations/<timestamp>_add_trust_level/migration.sql` | Prisma migration for trustLevel + trustedAt fields |

### Backend — Modified Files
| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` (User model, ~line 14) | Add `trustLevel` and `trustedAt` fields |
| `backend/src/middleware/auth.js` (~line 18) | Add `trustLevel` to user select; attach to `req.user` |
| `backend/src/modules/feed/feed.posts.controller.js` (~line 28) | Call `getInitialModerationStatus()` on post create |
| `backend/src/modules/feed/feed.social.controller.js` (~line 50) | Call `getInitialModerationStatus()` on comment create |
| `backend/src/modules/sheets/sheets.service.js` (~line 25) | Incorporate trust gate into `resolveNextSheetStatus()` |
| `backend/src/modules/sheets/sheets.social.controller.js` (~line 130) | Call `getInitialModerationStatus()` on sheet comment create |
| `backend/src/modules/notes/notes.routes.js` (~line 146) | Call `getInitialModerationStatus()` on note create + share toggle |
| `backend/src/modules/notes/notes.routes.js` (~line 307) | Call `getInitialModerationStatus()` on note comment create |
| `backend/src/modules/admin/admin.users.controller.js` (~line 125) | Add `PATCH /users/:id/trust-level` endpoint |
| `backend/src/modules/auth/index.js` or login handler | Call `checkAndPromoteTrust()` on login |
| `backend/src/modules/moderation/moderation.admin.cases.controller.js` | Add `trustLevel` filter for cases; show trustLevel in case list |
| `backend/src/lib/moderationEngine.js` (~line 449) | Export `countConfirmedViolations(userId)` helper |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `frontend/studyhub-app/src/components/PendingReviewBanner.jsx` | Reusable "Pending review" banner component |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `frontend/studyhub-app/src/pages/feed/FeedCard.jsx` | Show PendingReviewBanner when `moderationStatus === 'pending_review'` and user is author |
| `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx` | Show PendingReviewBanner for pending sheets |
| `frontend/studyhub-app/src/pages/notes/NoteViewerPage.jsx` or equivalent | Show PendingReviewBanner for pending notes |
| `frontend/studyhub-app/src/pages/admin/UsersTab.jsx` | Add trust level column + edit control |
| `frontend/studyhub-app/src/pages/admin/CasesSubTab.jsx` | Add "from new users" filter; show trust level in case rows |
| `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx` or profile | Show trust status + "how to become trusted" info |

---

## Task 1: Schema — Add trustLevel + trustedAt to User model

**Files:**
- Modify: `backend/prisma/schema.prisma` (User model, lines 10-69)

- [ ] **Step 1: Add trustLevel and trustedAt fields to the User model**

In `backend/prisma/schema.prisma`, inside the `model User { ... }` block, after line 14 (`role`), add:

```prisma
  trustLevel              String    @default("new")
  trustedAt               DateTime?
```

The full User model top will look like:

```prisma
model User {
  id                      Int       @id @default(autoincrement())
  username                String    @unique
  passwordHash            String
  role                    String    @default("student")
  trustLevel              String    @default("new")
  trustedAt               DateTime?
  email                   String?   @unique
  emailVerified           Boolean   @default(false)
  ...
```

- [ ] **Step 2: Generate and apply the Prisma migration**

```bash
cd backend && npx prisma migrate dev --name add_trust_level
```

Expected: Migration created and applied. All existing users get `trustLevel = 'new'` as default.

- [ ] **Step 3: Verify the migration**

```bash
cd backend && npx prisma migrate status
```

Expected: All migrations applied, no pending migrations.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "schema: add trustLevel and trustedAt fields to User model"
```

---

## Task 2: Trust Gate Library — Centralized trust-level helpers

**Files:**
- Create: `backend/src/lib/trustGate.js`
- Create: `backend/test/trustGate.test.js`
- Modify: `backend/src/lib/moderationEngine.js` (~line 164, ~line 449)

- [ ] **Step 1: Write the failing tests for trustGate**

Create `backend/test/trustGate.test.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  shouldAutoPublish,
  getInitialModerationStatus,
  meetsPromotionCriteria,
  TRUST_LEVELS,
  PROMOTION_MIN_AGE_DAYS,
} from '../src/lib/trustGate.js'

describe('trustGate', () => {
  describe('TRUST_LEVELS', () => {
    it('exports the three trust levels', () => {
      expect(TRUST_LEVELS).toEqual({ NEW: 'new', TRUSTED: 'trusted', RESTRICTED: 'restricted' })
    })
  })

  describe('shouldAutoPublish', () => {
    it('returns true for trusted users', () => {
      expect(shouldAutoPublish({ trustLevel: 'trusted' })).toBe(true)
    })

    it('returns true for admin users regardless of trust level', () => {
      expect(shouldAutoPublish({ trustLevel: 'new', role: 'admin' })).toBe(true)
    })

    it('returns false for new users', () => {
      expect(shouldAutoPublish({ trustLevel: 'new' })).toBe(false)
    })

    it('returns false for restricted users', () => {
      expect(shouldAutoPublish({ trustLevel: 'restricted' })).toBe(false)
    })
  })

  describe('getInitialModerationStatus', () => {
    it('returns clean for trusted users', () => {
      expect(getInitialModerationStatus({ trustLevel: 'trusted' })).toBe('clean')
    })

    it('returns clean for admins', () => {
      expect(getInitialModerationStatus({ trustLevel: 'new', role: 'admin' })).toBe('clean')
    })

    it('returns pending_review for new users', () => {
      expect(getInitialModerationStatus({ trustLevel: 'new' })).toBe('pending_review')
    })

    it('returns pending_review for restricted users', () => {
      expect(getInitialModerationStatus({ trustLevel: 'restricted' })).toBe('pending_review')
    })
  })

  describe('meetsPromotionCriteria', () => {
    const now = new Date()

    it('promotes a user with old account and clean record', () => {
      const oldDate = new Date(now)
      oldDate.setDate(oldDate.getDate() - (PROMOTION_MIN_AGE_DAYS + 1))
      expect(meetsPromotionCriteria({
        createdAt: oldDate,
        confirmedViolations: 0,
        activeStrikes: 0,
        hasActiveRestriction: false,
      })).toBe(true)
    })

    it('rejects a user with a too-new account', () => {
      expect(meetsPromotionCriteria({
        createdAt: new Date(),
        confirmedViolations: 0,
        activeStrikes: 0,
        hasActiveRestriction: false,
      })).toBe(false)
    })

    it('rejects a user with confirmed violations', () => {
      const oldDate = new Date(now)
      oldDate.setDate(oldDate.getDate() - (PROMOTION_MIN_AGE_DAYS + 1))
      expect(meetsPromotionCriteria({
        createdAt: oldDate,
        confirmedViolations: 1,
        activeStrikes: 0,
        hasActiveRestriction: false,
      })).toBe(false)
    })

    it('rejects a user with active strikes', () => {
      const oldDate = new Date(now)
      oldDate.setDate(oldDate.getDate() - (PROMOTION_MIN_AGE_DAYS + 1))
      expect(meetsPromotionCriteria({
        createdAt: oldDate,
        confirmedViolations: 0,
        activeStrikes: 1,
        hasActiveRestriction: false,
      })).toBe(false)
    })

    it('rejects a user with active restriction', () => {
      const oldDate = new Date(now)
      oldDate.setDate(oldDate.getDate() - (PROMOTION_MIN_AGE_DAYS + 1))
      expect(meetsPromotionCriteria({
        createdAt: oldDate,
        confirmedViolations: 0,
        activeStrikes: 0,
        hasActiveRestriction: true,
      })).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && npx vitest run test/trustGate.test.js
```

Expected: FAIL — module `../src/lib/trustGate.js` not found.

- [ ] **Step 3: Implement the trustGate library**

Create `backend/src/lib/trustGate.js`:

```js
/* ═══════════════════════════════════════════════════════════════════════════
 * trustGate.js — Centralized trust-level helpers for StudyHub
 *
 * Determines whether content from a user should auto-publish or start
 * as pending_review based on the user's trust level.
 *
 * Also provides the promotion criteria check (pure function) and the
 * full promotion workflow (DB-aware, used by login handler and admin).
 * ═══════════════════════════════════════════════════════════════════════════ */
const prisma = require('./prisma')
const { countActiveStrikes, hasActiveRestriction } = require('./moderationEngine')

const TRUST_LEVELS = {
  NEW: 'new',
  TRUSTED: 'trusted',
  RESTRICTED: 'restricted',
}

const PROMOTION_MIN_AGE_DAYS = 7

/**
 * Can this user's content go straight to public without moderation hold?
 * @param {{ trustLevel: string, role?: string }} user
 * @returns {boolean}
 */
function shouldAutoPublish(user) {
  if (user.role === 'admin') return true
  return user.trustLevel === TRUST_LEVELS.TRUSTED
}

/**
 * What moderationStatus should new content from this user start with?
 * @param {{ trustLevel: string, role?: string }} user
 * @returns {'clean' | 'pending_review'}
 */
function getInitialModerationStatus(user) {
  return shouldAutoPublish(user) ? 'clean' : 'pending_review'
}

/**
 * Pure criteria check — no DB calls. Used in tests and by checkAndPromoteTrust.
 * @param {{ createdAt: Date, confirmedViolations: number, activeStrikes: number, hasActiveRestriction: boolean }} params
 * @returns {boolean}
 */
function meetsPromotionCriteria({ createdAt, confirmedViolations, activeStrikes, hasActiveRestriction: restricted }) {
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  if (ageDays < PROMOTION_MIN_AGE_DAYS) return false
  if (confirmedViolations > 0) return false
  if (activeStrikes > 0) return false
  if (restricted) return false
  return true
}

/**
 * Full promotion check + DB update. Called on login and by admin "run promotion".
 * Only promotes users whose current trustLevel is 'new'.
 * @param {number} userId
 * @returns {Promise<{ promoted: boolean }>}
 */
async function checkAndPromoteTrust(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustLevel: true, createdAt: true },
  })
  if (!user || user.trustLevel !== TRUST_LEVELS.NEW) return { promoted: false }

  const [strikes, restricted, confirmedCases] = await Promise.all([
    countActiveStrikes(userId),
    hasActiveRestriction(userId),
    prisma.moderationCase.count({
      where: { userId, status: 'confirmed' },
    }),
  ])

  const eligible = meetsPromotionCriteria({
    createdAt: user.createdAt,
    confirmedViolations: confirmedCases,
    activeStrikes: strikes,
    hasActiveRestriction: restricted,
  })

  if (!eligible) return { promoted: false }

  await prisma.user.update({
    where: { id: userId },
    data: { trustLevel: TRUST_LEVELS.TRUSTED, trustedAt: new Date() },
  })

  return { promoted: true }
}

module.exports = {
  TRUST_LEVELS,
  PROMOTION_MIN_AGE_DAYS,
  shouldAutoPublish,
  getInitialModerationStatus,
  meetsPromotionCriteria,
  checkAndPromoteTrust,
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd backend && npx vitest run test/trustGate.test.js
```

Expected: All 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/trustGate.js backend/test/trustGate.test.js
git commit -m "feat(trust): add centralized trust gate library with promotion criteria"
```

---

## Task 3: Auth Middleware — Attach trustLevel to req.user

**Files:**
- Modify: `backend/src/middleware/auth.js` (lines 16-23)

- [ ] **Step 1: Update the auth middleware to select and attach trustLevel**

In `backend/src/middleware/auth.js`, change the `findUnique` select (line 18) and the `req.user` assignment (line 23):

Replace:
```js
      select: { id: true, username: true, role: true },
```

With:
```js
      select: { id: true, username: true, role: true, trustLevel: true },
```

Replace:
```js
    req.user = { userId: user.id, username: user.username, role: user.role }
```

With:
```js
    req.user = { userId: user.id, username: user.username, role: user.role, trustLevel: user.trustLevel }
```

- [ ] **Step 2: Run existing auth tests to verify nothing breaks**

```bash
cd backend && npx vitest run test/auth.routes.test.js test/auth.cookies.test.js
```

Expected: All existing tests PASS (trustLevel defaults to 'new' for all test users).

- [ ] **Step 3: Commit**

```bash
git add backend/src/middleware/auth.js
git commit -m "feat(auth): attach trustLevel to req.user in auth middleware"
```

---

## Task 4: Feed Posts — New users get pending_review on create

**Files:**
- Modify: `backend/src/modules/feed/feed.posts.controller.js` (lines 1-59)
- Modify: `backend/src/modules/feed/feed.service.js` (if needed for response format)

- [ ] **Step 1: Add trust gate import and apply to post creation**

In `backend/src/modules/feed/feed.posts.controller.js`, add after the existing imports (around line 12):

```js
const { getInitialModerationStatus } = require('../../lib/trustGate')
```

In the `router.post('/posts', ...)` handler, modify the `prisma.feedPost.create` call (around line 28-34). Change:

```js
    const post = await prisma.feedPost.create({
      data: {
        content,
        userId: req.user.userId,
        courseId: courseId || null,
        allowDownloads,
      },
```

To:

```js
    const moderationStatus = getInitialModerationStatus(req.user)
    const post = await prisma.feedPost.create({
      data: {
        content,
        userId: req.user.userId,
        courseId: courseId || null,
        allowDownloads,
        moderationStatus,
      },
```

- [ ] **Step 2: Run existing feed tests to verify nothing breaks**

```bash
cd backend && npx vitest run test/feed.routes.test.js
```

Expected: All existing tests PASS. Existing test users default to `trustLevel: 'new'`, so their posts will now start as `pending_review` — but existing tests shouldn't assert on `moderationStatus` for creation (the moderation visibility tests are separate).

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/feed/feed.posts.controller.js
git commit -m "feat(trust): new user feed posts start as pending_review"
```

---

## Task 5: Feed Comments — New users get pending_review on create

**Files:**
- Modify: `backend/src/modules/feed/feed.social.controller.js` (~line 50)

- [ ] **Step 1: Add trust gate import and apply to comment creation**

In `backend/src/modules/feed/feed.social.controller.js`, add the import near the top:

```js
const { getInitialModerationStatus } = require('../../lib/trustGate')
```

In the `router.post('/posts/:id/comments', ...)` handler, find the `prisma.feedPostComment.create` call. Add `moderationStatus` to the data:

```js
    const moderationStatus = getInitialModerationStatus(req.user)
    const comment = await prisma.feedPostComment.create({
      data: {
        content,
        postId,
        userId: req.user.userId,
        moderationStatus,
      },
```

- [ ] **Step 2: Run feed tests**

```bash
cd backend && npx vitest run test/feed.routes.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/feed/feed.social.controller.js
git commit -m "feat(trust): new user feed comments start as pending_review"
```

---

## Task 6: Sheet Publishing — New users get pending_review

**Files:**
- Modify: `backend/src/modules/sheets/sheets.service.js` (lines 25-34)
- Modify: `backend/src/modules/sheets/sheets.create.controller.js` (import + usage)
- Modify: `backend/src/modules/sheets/sheets.update.controller.js` (import + usage)

- [ ] **Step 1: Modify resolveNextSheetStatus to accept user trust info**

In `backend/src/modules/sheets/sheets.service.js`, add the import at the top:

```js
const { shouldAutoPublish } = require('../../lib/trustGate')
```

Modify `resolveNextSheetStatus` (lines 25-34) to accept and use a `user` parameter:

Replace:
```js
function resolveNextSheetStatus({ requestedStatus, contentFormat, isDraftAutosave = false }) {
  const normalizedRequested = normalizeSheetStatus(requestedStatus, '')
  if (normalizedRequested === SHEET_STATUS.DRAFT || isDraftAutosave) {
    return SHEET_STATUS.DRAFT
  }
  if (contentFormat === 'html') {
    return SHEET_STATUS.PENDING_REVIEW
  }
  return SHEET_STATUS.PUBLISHED
}
```

With:
```js
function resolveNextSheetStatus({ requestedStatus, contentFormat, isDraftAutosave = false, user = null }) {
  const normalizedRequested = normalizeSheetStatus(requestedStatus, '')
  if (normalizedRequested === SHEET_STATUS.DRAFT || isDraftAutosave) {
    return SHEET_STATUS.DRAFT
  }
  if (contentFormat === 'html') {
    return SHEET_STATUS.PENDING_REVIEW
  }
  // New/restricted users: sheets go to pending_review instead of published
  if (user && !shouldAutoPublish(user)) {
    return SHEET_STATUS.PENDING_REVIEW
  }
  return SHEET_STATUS.PUBLISHED
}
```

- [ ] **Step 2: Pass req.user to resolveNextSheetStatus in the create controller**

In `backend/src/modules/sheets/sheets.create.controller.js`, find all calls to `resolveNextSheetStatus` and add `user: req.user`. For example:

```js
const status = resolveNextSheetStatus({
  requestedStatus: req.body.status,
  contentFormat,
  isDraftAutosave: false,
  user: req.user,
})
```

- [ ] **Step 3: Pass req.user to resolveNextSheetStatus in the update controller**

In `backend/src/modules/sheets/sheets.update.controller.js`, find all calls to `resolveNextSheetStatus` and add `user: req.user`. Same pattern as step 2.

- [ ] **Step 4: Run sheet tests**

```bash
cd backend && npx vitest run test/sheet.workflow.integration.test.js test/idor.sheets.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sheets/sheets.service.js backend/src/modules/sheets/sheets.create.controller.js backend/src/modules/sheets/sheets.update.controller.js
git commit -m "feat(trust): new user sheets go to pending_review instead of published"
```

---

## Task 7: Sheet Comments — New users get pending_review

**Files:**
- Modify: `backend/src/modules/sheets/sheets.social.controller.js` (~line 130)

- [ ] **Step 1: Add trust gate to sheet comment creation**

In `backend/src/modules/sheets/sheets.social.controller.js`, add the import:

```js
const { getInitialModerationStatus } = require('../../lib/trustGate')
```

In the `router.post('/:id/comments', ...)` handler, find the `prisma.comment.create` call and add `moderationStatus`:

```js
    const moderationStatus = getInitialModerationStatus(req.user)
    const comment = await prisma.comment.create({
      data: {
        content,
        sheetId,
        userId: req.user.userId,
        moderationStatus,
      },
```

- [ ] **Step 2: Run tests**

```bash
cd backend && npx vitest run test/idor.sheets.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/sheets/sheets.social.controller.js
git commit -m "feat(trust): new user sheet comments start as pending_review"
```

---

## Task 8: Notes — New users get pending_review on create and share

**Files:**
- Modify: `backend/src/modules/notes/notes.routes.js` (~lines 146, 174, 307)

- [ ] **Step 1: Add trust gate import**

In `backend/src/modules/notes/notes.routes.js`, add near the other imports:

```js
const { getInitialModerationStatus } = require('../../lib/trustGate')
```

- [ ] **Step 2: Apply to note creation (POST /api/notes)**

In the `router.post('/', ...)` handler (~line 146), modify the `prisma.note.create` call to set `moderationStatus` only when the note is public:

```js
    const moderationStatus = priv === false
      ? getInitialModerationStatus(req.user)
      : 'clean'  // Private notes don't need moderation hold
    const note = await prisma.note.create({
      data: {
        title: trimmedTitle,
        content: contentStr,
        userId: req.user.userId,
        courseId: courseId ? parseInt(courseId, 10) || null : null,
        private: priv !== false,
        moderationStatus,
      },
```

- [ ] **Step 3: Apply to note update — privacy toggle (PATCH /api/notes/:id)**

In the `router.patch('/:id', ...)` handler (~line 174), when the `private` field changes from `true` to `false` (sharing a note publicly), set `moderationStatus`:

Find where the update data is built. Add logic: if the note is being made public AND the user is not auto-publish, set `moderationStatus: 'pending_review'`. For example, in the update data object:

```js
    const updateData = {}
    // ... existing field assignments ...

    // If toggling private → public, apply trust gate
    if (req.body.private === false && note.private === true) {
      updateData.moderationStatus = getInitialModerationStatus(req.user)
    }
```

Read the PATCH handler carefully to find exactly where to insert this. The key: only when `private` goes from `true` → `false`.

- [ ] **Step 4: Apply to note comment creation (POST /api/notes/:id/comments)**

In the `router.post('/:id/comments', ...)` handler (~line 307), find the `prisma.noteComment.create` call and add `moderationStatus`:

```js
    const moderationStatus = getInitialModerationStatus(req.user)
    const comment = await prisma.noteComment.create({
      data: {
        content: trimmedContent,
        noteId,
        userId: req.user.userId,
        anchorText: anchorText || null,
        anchorOffset: typeof anchorOffset === 'number' ? anchorOffset : null,
        anchorContext: anchorContext || null,
        moderationStatus,
      },
```

- [ ] **Step 5: Run notes tests**

```bash
cd backend && npx vitest run test/notes.routes.test.js test/idor.notes.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/notes/notes.routes.js
git commit -m "feat(trust): new user notes and note comments start as pending_review"
```

---

## Task 9: On-Login Auto-Promotion

**Files:**
- Modify: `backend/src/modules/auth/index.js` or the login route handler

- [ ] **Step 1: Find the login success handler**

Look in `backend/src/modules/auth/` for the login endpoint. Find where login succeeds and the user object is returned. This is where we add the promotion check.

- [ ] **Step 2: Add auto-promotion call after successful login**

Add the import:

```js
const { checkAndPromoteTrust } = require('../../lib/trustGate')
```

After the user is authenticated and before sending the response, add a fire-and-forget promotion check:

```js
    // Fire-and-forget trust promotion check on login
    void checkAndPromoteTrust(user.id)
```

This is non-blocking — the login response doesn't wait for promotion. The user will see their updated trust level on their next request (after the auth middleware re-fetches from DB).

- [ ] **Step 3: Run auth tests**

```bash
cd backend && npx vitest run test/auth.routes.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/auth/
git commit -m "feat(trust): auto-promote eligible users on login"
```

---

## Task 10: Admin Endpoint — Set Trust Level Manually

**Files:**
- Modify: `backend/src/modules/admin/admin.users.controller.js` (after ~line 152)

- [ ] **Step 1: Add the PATCH /users/:id/trust-level endpoint**

In `backend/src/modules/admin/admin.users.controller.js`, after the existing `PATCH /users/:id/role` route (around line 152), add:

```js
// ── PATCH /api/admin/users/:id/trust-level ──────────────────
router.patch('/users/:id/trust-level', async (req, res) => {
  const { trustLevel } = req.body || {}
  if (!['new', 'trusted', 'restricted'].includes(trustLevel)) {
    return res.status(400).json({ error: 'Trust level must be "new", "trusted", or "restricted".' })
  }
  const targetId = parseInt(req.params.id)
  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ error: 'User id must be an integer.' })
  }

  try {
    // Protect super admin
    if (trustLevel === 'restricted' && await isSuperAdmin(targetId)) {
      return res.status(403).json({ error: 'The super admin account cannot be restricted.', code: 'SUPER_ADMIN_PROTECTED' })
    }

    const data = { trustLevel }
    if (trustLevel === 'trusted') data.trustedAt = new Date()
    if (trustLevel === 'new') data.trustedAt = null

    const user = await prisma.user.update({
      where: { id: targetId },
      data,
      select: { id: true, username: true, trustLevel: true, trustedAt: true },
    })

    // Audit trail
    await logModerationEvent({
      userId: targetId,
      action: 'trust_level_changed',
      reason: `Trust level set to ${trustLevel} by admin`,
      performedBy: req.user.userId,
      metadata: { newTrustLevel: trustLevel },
    })

    res.json(user)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found.' })
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Server error.' })
  }
})
```

Add the import at the top of the file:

```js
const { logModerationEvent } = require('../../lib/moderationLogger')
```

- [ ] **Step 2: Run admin tests**

```bash
cd backend && npx vitest run test/admin.routes.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/admin/admin.users.controller.js
git commit -m "feat(admin): add endpoint to set user trust level manually"
```

---

## Task 11: Admin Cases — Filter by new users + show trust level

**Files:**
- Modify: `backend/src/modules/moderation/moderation.admin.cases.controller.js`

- [ ] **Step 1: Add trust level filter to GET /cases**

In the `GET /cases` handler, find where the Prisma `where` clause is built. Add support for a `trustLevel` query parameter:

```js
  const trustLevelFilter = req.query.trustLevel
  // ...in the where clause:
  if (trustLevelFilter) {
    where.user = { ...where.user, trustLevel: trustLevelFilter }
  }
```

- [ ] **Step 2: Add trustLevel to the case list include**

In the `include` section of the cases query, ensure the user relation includes `trustLevel`:

```js
  include: {
    user: { select: { id: true, username: true, avatarUrl: true, trustLevel: true } },
    // ...other includes
  }
```

- [ ] **Step 3: Run moderation tests**

```bash
cd backend && npx vitest run test/moderationVisibility.test.js test/moderationReporting.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/moderation/moderation.admin.cases.controller.js
git commit -m "feat(admin): add trust level filter and display to moderation cases"
```

---

## Task 12: Integration Tests — End-to-end trust level behavior

**Files:**
- Create: `backend/test/trustLevel.integration.test.js`

- [ ] **Step 1: Write integration tests**

Create `backend/test/trustLevel.integration.test.js` using the same supertest pattern as `backend/test/feed.routes.test.js`:

```js
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import supertest from 'supertest'
import { createApp } from '../src/app.js'
import prisma from '../src/lib/prisma.js'
import { signAuthToken } from '../src/lib/authTokens.js'

let app, request

beforeAll(async () => {
  app = await createApp()
  request = supertest(app)
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function createTestUser(overrides = {}) {
  const username = `trust_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: 'not-a-real-hash',
      email: `${username}@test.studyhub`,
      emailVerified: true,
      trustLevel: 'new',
      ...overrides,
    },
  })
  const token = signAuthToken(user.id)
  return { user, token }
}

describe('Trust Level Integration', () => {
  it('new user feed post starts as pending_review', async () => {
    const { token } = await createTestUser({ trustLevel: 'new' })
    const res = await request
      .post('/api/feed/posts')
      .set('Cookie', `token=${token}`)
      .send({ content: 'Hello from a new user!' })
      .expect(201)

    expect(res.body.moderationStatus).toBe('pending_review')
  })

  it('trusted user feed post starts as clean', async () => {
    const { token } = await createTestUser({ trustLevel: 'trusted', trustedAt: new Date() })
    const res = await request
      .post('/api/feed/posts')
      .set('Cookie', `token=${token}`)
      .send({ content: 'Hello from a trusted user!' })
      .expect(201)

    expect(res.body.moderationStatus).toBe('clean')
  })

  it('new user post is NOT visible in public feed', async () => {
    const { user, token } = await createTestUser({ trustLevel: 'new' })
    await request
      .post('/api/feed/posts')
      .set('Cookie', `token=${token}`)
      .send({ content: 'This should be hidden' })
      .expect(201)

    // Fetch feed as a different trusted user
    const { token: otherToken } = await createTestUser({ trustLevel: 'trusted' })
    const feedRes = await request
      .get('/api/feed/posts')
      .set('Cookie', `token=${otherToken}`)
      .expect(200)

    const visiblePosts = feedRes.body.posts || feedRes.body
    const found = Array.isArray(visiblePosts)
      ? visiblePosts.some(p => p.author?.id === user.id && p.content === 'This should be hidden')
      : false
    expect(found).toBe(false)
  })
})
```

**Note:** The exact test setup (how `createApp` works, how tokens are set) should match the existing test patterns in `backend/test/feed.routes.test.js`. Read that file first and adapt accordingly.

- [ ] **Step 2: Run the integration tests**

```bash
cd backend && npx vitest run test/trustLevel.integration.test.js
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/test/trustLevel.integration.test.js
git commit -m "test(trust): add integration tests for trust level gating"
```

---

## Task 13: Frontend — PendingReviewBanner component

**Files:**
- Create: `frontend/studyhub-app/src/components/PendingReviewBanner.jsx`

- [ ] **Step 1: Create the PendingReviewBanner component**

Create `frontend/studyhub-app/src/components/PendingReviewBanner.jsx`:

```jsx
/**
 * PendingReviewBanner — shown on content the current user authored
 * that is currently in pending_review moderation status.
 */
export default function PendingReviewBanner({ updated = false }) {
  return (
    <div
      style={{
        background: 'var(--sh-warning-bg, #fef3c7)',
        border: '1px solid var(--sh-warning-border, #fcd34d)',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 13,
        color: 'var(--sh-warning-text, #92400e)',
        lineHeight: 1.5,
        marginBottom: 12,
      }}
    >
      <strong style={{ fontWeight: 600 }}>
        {updated ? 'Updated, still pending review' : 'Pending review'}
      </strong>
      {' \u2014 '}
      not visible to others yet. Your account is new; public content may require a brief review to keep StudyHub safe.
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/studyhub-app/src/components/PendingReviewBanner.jsx
git commit -m "feat(ui): add PendingReviewBanner component for new user content"
```

---

## Task 14: Frontend — Show PendingReviewBanner on feed posts

**Files:**
- Modify: `frontend/studyhub-app/src/pages/feed/FeedCard.jsx`

- [ ] **Step 1: Read FeedCard.jsx to understand the current structure**

Read the full file. Find where the card body is rendered. The banner should appear at the top of the card, visible only when:
- `item.moderationStatus === 'pending_review'`
- The current user is the author (`item.author.id === currentUser.id`)

- [ ] **Step 2: Add the banner**

Import PendingReviewBanner at the top:

```jsx
import PendingReviewBanner from '../../components/PendingReviewBanner'
```

Inside the card, before the content, add:

```jsx
{item.moderationStatus === 'pending_review' && currentUser?.id === item.author?.id && (
  <PendingReviewBanner />
)}
```

The `currentUser` prop is already passed to FeedCard (check the existing props). If not, it's available via `useSession()` from the parent.

- [ ] **Step 3: Run frontend lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/src/pages/feed/FeedCard.jsx
git commit -m "feat(ui): show pending review banner on new user feed posts"
```

---

## Task 15: Frontend — Show PendingReviewBanner on sheets and notes

**Files:**
- Modify: `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`
- Modify: Note viewer page (find exact file)

- [ ] **Step 1: Read SheetViewerPage.jsx and find where sheet metadata is rendered**

Look for where `sheet.status` or similar is displayed. Add the banner when `sheet.status === 'pending_review'` and the user is the owner.

- [ ] **Step 2: Add PendingReviewBanner to SheetViewerPage**

```jsx
import PendingReviewBanner from '../../components/PendingReviewBanner'
```

Near the top of the sheet content area:

```jsx
{sheet.status === 'pending_review' && session?.user?.id === sheet.userId && (
  <PendingReviewBanner />
)}
```

- [ ] **Step 3: Add PendingReviewBanner to the note viewer**

Follow the same pattern for notes: show when `note.moderationStatus === 'pending_review'` and user is owner.

- [ ] **Step 4: Run frontend lint and build**

```bash
npm --prefix frontend/studyhub-app run lint && npm --prefix frontend/studyhub-app run build
```

Expected: 0 errors, clean build.

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx frontend/studyhub-app/src/pages/notes/
git commit -m "feat(ui): show pending review banner on sheets and notes for new users"
```

---

## Task 16: Admin UI — Trust level column in Users tab

**Files:**
- Modify: `frontend/studyhub-app/src/pages/admin/UsersTab.jsx`

- [ ] **Step 1: Read UsersTab.jsx to understand the table structure**

Read the file. Find the table columns and the user row rendering.

- [ ] **Step 2: Add trust level column and edit control**

Add a "Trust" column to the table header. In each row, show the user's `trustLevel` with a dropdown to change it:

```jsx
<select
  value={user.trustLevel}
  onChange={(e) => handleTrustLevelChange(user.id, e.target.value)}
  style={{ fontSize: 12, padding: '2px 4px' }}
>
  <option value="new">New</option>
  <option value="trusted">Trusted</option>
  <option value="restricted">Restricted</option>
</select>
```

Add the handler function:

```jsx
async function handleTrustLevelChange(userId, trustLevel) {
  try {
    await fetch(`${API}/api/admin/users/${userId}/trust-level`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ trustLevel }),
    })
    // Refresh user list
    fetchUsers()
  } catch {
    // Handle error
  }
}
```

- [ ] **Step 3: Ensure the GET /api/admin/users endpoint includes trustLevel**

Check the backend `admin.users.controller.js` GET /users endpoint. If `trustLevel` is not in the select/include, add it.

- [ ] **Step 4: Run frontend lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/UsersTab.jsx backend/src/modules/admin/admin.users.controller.js
git commit -m "feat(admin): add trust level column and edit to Users tab"
```

---

## Task 17: Admin UI — "From new users" filter in Cases sub-tab

**Files:**
- Modify: `frontend/studyhub-app/src/pages/admin/CasesSubTab.jsx`

- [ ] **Step 1: Read CasesSubTab.jsx and find the filter section**

Read the file. Find where the status/source/claimed filters are rendered.

- [ ] **Step 2: Add trust level filter**

Add a dropdown after the existing filters:

```jsx
<label style={{ fontSize: 12 }}>
  Trust:
  <select value={trustFilter} onChange={e => setTrustFilter(e.target.value)}>
    <option value="">All</option>
    <option value="new">New Users</option>
    <option value="trusted">Trusted</option>
    <option value="restricted">Restricted</option>
  </select>
</label>
```

Pass `trustLevel=${trustFilter}` as a query parameter when fetching cases.

- [ ] **Step 3: Show trust level badge in case rows**

In the case row, show the user's trust level next to their username:

```jsx
{c.user?.trustLevel === 'new' && (
  <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 4, marginLeft: 4 }}>
    new
  </span>
)}
```

- [ ] **Step 4: Run frontend lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/CasesSubTab.jsx
git commit -m "feat(admin): add 'from new users' filter and trust badge in moderation cases"
```

---

## Task 18: Frontend — Trust status in user settings

**Files:**
- Modify: `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx` (or profile page)

- [ ] **Step 1: Read the settings or profile page to find where user info is shown**

Find the right file. Look for where the user's account info is displayed.

- [ ] **Step 2: Add trust status section**

Add a section showing the user's trust status:

```jsx
{session?.user?.trustLevel === 'new' && (
  <div style={{
    background: 'var(--sh-info-bg, #dbeafe)',
    border: '1px solid var(--sh-info-border, #93c5fd)',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 13,
    color: 'var(--sh-info-text, #1e40af)',
    marginBottom: 16,
  }}>
    <strong>Account Status: New</strong>
    <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
      Your account is new. To keep StudyHub safe, public posts and shared content may require review for a short time.
      After a few days of activity with no issues, your account will be automatically trusted.
    </p>
  </div>
)}
{session?.user?.trustLevel === 'trusted' && (
  <div style={{
    background: 'var(--sh-success-bg, #d1fae5)',
    border: '1px solid var(--sh-success-border, #6ee7b7)',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 13,
    color: 'var(--sh-success-text, #065f46)',
    marginBottom: 16,
  }}>
    <strong>Account Status: Trusted</strong>
    <p style={{ margin: '6px 0 0' }}>Your content publishes immediately.</p>
  </div>
)}
```

- [ ] **Step 3: Ensure the session/auth response includes trustLevel**

Check the `/api/auth/me` endpoint and the login response. If `trustLevel` is not included in the user object returned, add it to the select clause.

- [ ] **Step 4: Run frontend lint and build**

```bash
npm --prefix frontend/studyhub-app run lint && npm --prefix frontend/studyhub-app run build
```

Expected: 0 errors, clean build.

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/pages/settings/ backend/src/modules/auth/
git commit -m "feat(ui): show trust status in user settings with guidance copy"
```

---

## Task 19: Full Validation + Release Log

**Files:**
- Modify: `docs/beta-v1.7.0-release-log.md`

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && npm test
```

Expected: All tests PASS.

- [ ] **Step 2: Run full frontend validation**

```bash
npm --prefix frontend/studyhub-app run lint && npm --prefix frontend/studyhub-app run test -- --run && npm --prefix frontend/studyhub-app run build
```

Expected: Lint clean, all tests pass, build succeeds.

- [ ] **Step 3: Update release log**

Append the S-9 cycle documentation to `docs/beta-v1.7.0-release-log.md` with:
- Summary of all changes
- Files modified table
- Validation results

- [ ] **Step 4: Commit release log**

```bash
git add docs/beta-v1.7.0-release-log.md
git commit -m "docs: add S-9 trust levels cycle to release log"
```
