# Reference 02 — Authorization & RBAC

## Files to Read

- `backend/src/middleware/requireAdmin.js`
- `backend/src/middleware/auth.js`
- Every `*.routes.js` file that has PATCH / DELETE / POST endpoints
- `backend/src/modules/users/users.routes.js`
- `backend/src/modules/sheets/sheets.routes.js`
- `backend/src/modules/notes/notes.routes.js`
- `backend/src/modules/studyGroups/studyGroups.routes.js`

---

## Check 2.1 — requireAuth on All Protected Endpoints

**Rule:** Every non-public endpoint must use `requireAuth` before the handler.

**Grep for unprotected routes:**

```
router\.(post|put|patch|delete)\(.*(?<!requireAuth)(?<!requireAdmin)\)
```

**What to verify manually:**

1. Open each `*.routes.js` file.
2. For every `router.post/patch/put/delete`, confirm `requireAuth` appears in the middleware chain.
3. If a route is intentionally public (e.g., `POST /api/auth/register`), verify it is documented and makes semantic sense.

**CRITICAL violations:**

- Any write endpoint without `requireAuth` → unauthenticated mutation → CRITICAL

---

## Check 2.2 — Owner Check on Mutations (IDOR Prevention)

**Rule:** Any endpoint that modifies or deletes a resource owned by a user MUST check that `req.user.userId === resource.userId` (or equivalent ownership field).

**Pattern to look for:**

```js
// CORRECT
const sheet = await prisma.studySheet.findUnique({ where: { id } })
if (!sheet) return sendError(res, 404, 'Not found', ERROR_CODES.NOT_FOUND)
if (sheet.userId !== req.user.userId && req.user.role !== 'admin') {
  return sendError(res, 403, 'Forbidden', ERROR_CODES.FORBIDDEN)
}
```

**CRITICAL violation pattern:**

```js
// WRONG — IDOR: any authenticated user can delete anyone's resource
router.delete('/:id', requireAuth, async (req, res) => {
  await prisma.studySheet.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})
```

**Grep for potential IDOR:**

```
prisma\.(studySheet|note|feedPost|message|groupSession|studyGroup)\.(update|delete)\(
```

For each match, verify the corresponding `findUnique` above it includes an ownership check.

**IDOR-prone endpoints to manually verify:**

- `PATCH /api/sheets/:id` — must check `sheet.userId === req.user.userId`
- `DELETE /api/sheets/:id` — same
- `PATCH /api/notes/:id` — must check `note.userId === req.user.userId`
- `DELETE /api/notes/:id` — same
- `PATCH /api/messages/:id` — must check `message.authorId === req.user.userId` + 15-min edit window
- `DELETE /api/study-groups/:id` — must check group `creatorId === req.user.userId`
- `PATCH /api/users/:username` — must check caller owns that account OR is admin
- `DELETE /api/ai/conversations/:id` — must check conversation `userId === req.user.userId`

---

## Check 2.3 — Admin Route Hardening

**Rule:** Every admin route uses `requireAdmin` (not just `requireAuth`).

**Files to check:**

- `backend/src/modules/admin/` all route files
- Any route that reads/modifies user lists, moderation queues, revenue dashboards

**Pattern to look for:**

```js
router.get('/users', requireAuth, requireAdmin, adminController.listUsers)
```

**Violations to flag:**

- Admin route with only `requireAuth` → authenticated non-admins can access → CRITICAL
- Admin route missing auth entirely → CRITICAL
- `if (req.user.role === 'admin')` without DB re-check → stale token bypass → HIGH

---

## Check 2.4 — School / Course Scoping (IDOR Variant)

**Rule per CLAUDE.md §12 Decision #14:** Enrollment is self-claimed, not verified. School/course scoping is a UX filter, not a security boundary. However, endpoints that accept `schoolId` / `courseId` as params MUST still enforce that the caller has access to that scope.

**When this matters:**

- If an endpoint filters content by `schoolId`, an attacker should not be able to change `schoolId` to see another school's private content.
- Self-learner cross-school browsing is READ-ONLY (Decision #2). Any endpoint that allows writes scoped to a school must reject cross-school callers.

**Grep:**

```
req\.(params|query|body)\.(schoolId|courseId)
```

For each match, check that the value is validated against the user's enrolled schools (or that the resource is confirmed public).

---

## Check 2.5 — Role Model Correctness (Locked Decision #3)

**Rule:** No `accountType` enum for differentiating teachers from students. Use `teacherOf[]` + `studentOf[]` relation arrays. Grad students can be both simultaneously.

**Violation grep:**

```
accountType.*teacher
accountType.*student
role.*teacher
role.*student
```

If any code branches on `user.accountType === 'teacher'` instead of checking `teacherOf[]`, flag as MEDIUM (logic bug that also affects authorization semantics).

---

## Check 2.6 — Admin Cannot Be Blocked (Locked Decision #16)

**Rule:** Admins are un-blockable. A regular user cannot add an admin to their block list. However, admins CAN be muted (unless announcement has `urgency` flag).

**Grep for block creation endpoint:**

```
UserBlock.*create
```

Verify the block creation handler rejects `targetId` that resolves to an admin user.

**Violations:**

- Admin block created successfully → MEDIUM (breaks admin visibility invariant)

---

## Check 2.7 — Content Moderation No Bypass

**Rule per CLAUDE.md:** Even admin / staff content goes through the moderation pipeline. No bypass branches.

**Grep:**

```
req\.user\.role.*===.*admin.*skip
role.*admin.*moderation.*bypass
```

**Violations to flag:**

- Moderation check short-circuited for admins → HIGH (admins could post malicious content unreviewed)

---

## Check 2.8 — Self-Learner Cross-School Read-Only (Decision #2)

**Rule:** Self-learner users browsing cross-school content must NOT be able to mutate resources. If the feature exists, verify:

1. Cross-school browsing routes are GET-only.
2. Any route accepting `schoolId` for mutations verifies the user is enrolled at that school.

---

## Severity Reference for AuthZ Issues

| Issue                                 | OWASP | Severity |
| ------------------------------------- | ----- | -------- |
| Write endpoint without requireAuth    | A01   | CRITICAL |
| Admin route with only requireAuth     | A01   | CRITICAL |
| IDOR — no ownership check on mutation | A01   | CRITICAL |
| Role check using only JWT payload     | A01   | HIGH     |
| Cross-school write by self-learner    | A01   | HIGH     |
| Admin moderation bypass               | A01   | HIGH     |
| Missing schoolId authorization        | A01   | HIGH     |
| `accountType` enum for role branching | A01   | MEDIUM   |
| Admin cannot be blocked not enforced  | A01   | MEDIUM   |
