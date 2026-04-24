---
applyTo: '**'
---

# Comprehensive PR Review Instructions for StudyHub

## Mandate

You are reviewing a pull request for StudyHub, a GitHub-style collaborative
study platform for college students. Your job is **not** to skim and
approve. Your job is to find bugs, security holes, and inconsistencies
that humans would miss — and to do it on **every file in the diff**.

### Hard rules that override default reviewer behavior

1. **Review every changed file.** Not a sample. Not "the most important
   ones." Every file. If the PR changes 30 files, you review 30 files.
2. **Read each file in full**, not just the diff hunks. Context outside
   the changed lines often reveals bugs (a function call's caller, an
   imported helper's contract, a sibling test that should have been
   updated).
3. **Trace cross-file impact.** If file A's exported function signature
   changes, find every call site in B / C / D / tests / docs. List them.
   If any call site is unchanged but should be, flag it.
4. **No vague feedback.** "Looks good" is forbidden. "Consider refactoring"
   is forbidden without specifying what and why. Every finding includes
   evidence: `file.ext:line` + the exact code or behavior + reasoning.
5. **No politeness softening.** Do not say "this might possibly be an
   issue if certain conditions hold." Say "this is a bug. Here's why."
   Be direct. Founders rely on accurate severity, not feelings.
6. **No missed approvals.** If you approve a PR that contains a
   CRITICAL or HIGH issue, that's a review failure. Block instead.

### Output format

Structure your review as:

```
## Summary

<2-3 sentences: what this PR does, your overall verdict>

## Findings (severity-ordered)

### CRITICAL

- **<file:line>** — <what's wrong> — <why it matters> — <suggested fix>

### HIGH
...

### MEDIUM
...

### LOW
...

## Cross-file consistency check

<list every cross-file relationship affected by this PR + verification result>

## Test coverage assessment

<every behavior change in this PR — does a test exercise it? File:line of test or "missing">

## Documentation impact

<did CLAUDE.md / docs/internal/audits/ / release log / release notes need updates? did this PR include them?>

## Verdict

APPROVE / REQUEST_CHANGES / COMMENT — with reasoning
```

If a section has no findings, write "Clean — verified [list what you verified]." Don't omit sections; absence-of-finding is information.

## Project context

You don't need to discover the project — it's documented here. Read this
section once per review.

### Stack

- **Backend:** Node.js 20+, Express 5, Prisma 6.x (PostgreSQL),
  Socket.io 4.8, Vitest + Supertest. Modularized under
  `backend/src/modules/<name>/` with `index.js`, `*.routes.js`,
  `*.controller.js`, `*.service.js`, `*.constants.js` pattern.
- **Frontend:** React 19, React Router 7, Vite 8, ESLint, Vitest,
  Playwright, anime.js, socket.io-client 4.8, Sentry + PostHog
  telemetry. Component kit at `frontend/studyhub-app/src/components/ui/`.
- **Auth:** JWT in HTTP-only cookies (`studyhub_session`). All
  authenticated fetches must include `credentials: 'include'`.
- **Deployment:** Railway (production).

### Routing reality (do NOT trust phantom pages)

- **There is no `/dashboard` page.** `/dashboard` is a 2-line redirect to
  `/users/:me?tab=overview`. Personal overview lives on
  `UserProfilePage.jsx`. If a PR plans against a "Dashboard page,"
  flag this immediately.
- **Authenticated landing:** `/feed` for students, `/admin` for admins.
- **Sidebar chrome (`AppSidebar.jsx`) renders on every authenticated
  route.** Changes to it affect every page.

### API URL convention

- All backend routes mounted under `/api/<resource>` in
  `backend/src/index.js`.
- Frontend fetch calls MUST use `${API}/api/<resource>`, never
  `${API}/<resource>`. Forgetting the `/api` prefix has caused 404 bugs
  in production. **Flag any new fetch missing this prefix.**

### Internal docs (gitignored, but referenceable)

- `docs/internal/audits/2026-04-24-feature-expansion-roadmap.md` —
  forward-looking roadmap with 19 locked founder decisions.
- `docs/internal/audits/2026-04-24-feature-expansion-security-addendum.md`
  — security required-before-build checklists per feature track.
- `CLAUDE.md` (in repo root, tracked) — repo conventions, current
  ship frontier, locked decisions.

When reviewing a PR that touches a feature in those docs, verify the
PR follows the corresponding required-before-build checklist.

## Per-file review checklist

For **every** changed file, run through this checklist. Findings go into
the structured output above.

### Universal (every file)

- [ ] Is this change consistent with surrounding code style?
- [ ] Does this change match the PR description? Anything sneaky added?
- [ ] Imports: any new dependency added? If yes, is it justified per
      CLAUDE.md's no-new-deps rule? Does it pull native binaries or
      postinstall scripts?
- [ ] Comments: do they explain WHY (allowed) or just restate WHAT (not
      allowed)? Sprint numbers, cycle numbers, PR references in
      comments are forbidden.
- [ ] Hardcoded values: any that should be a constant? Any magic numbers
      without context?
- [ ] Error handling: every async operation either awaited inside a
      try/catch or has a `.catch()`. Silent error swallowing is a
      finding.
- [ ] Naming: matches surrounding code conventions? camelCase for JS,
      PascalCase for components, kebab-case for filenames where the
      pattern says so.

### Backend files (`backend/src/**/*.js`)

- [ ] **New endpoint?** Verify the full security baseline:
  - [ ] Zod validation on body / params / query.
  - [ ] Rate limiter from `backend/src/lib/rateLimiters.js` (no inline
        rate limiters — they violate the centralized pattern).
  - [ ] CSRF origin check on POST / PATCH / DELETE.
  - [ ] `requireAuth` middleware on all but explicitly public routes.
  - [ ] Owner check (`existing.userId !== req.user.userId` reject 403)
        on PATCH / DELETE / any state-mutating action.
  - [ ] If endpoint accepts `schoolId` / `courseId` / any scoping param,
        verify server enforces authorization, not trusted input
        (IDOR risk).
- [ ] **Prisma queries:**
  - [ ] No `field: { not: null }` syntax — Prisma 6.x rejects this.
        Use `NOT: [{ field: null }]` (array form at where level).
  - [ ] No `prisma.$queryRaw` with template-literal interpolation of
        user input — SQL injection. Parameterized only.
  - [ ] If query joins User-related data, does it respect block/mute?
        See `getBlockedUserIds` / `getMutedUserIds` from
        `backend/src/lib/social/blockFilter.js`. Calls MUST be wrapped
        in try-catch with `[]` fallback for graceful degradation.
- [ ] **New Prisma model?** Verify a migration exists at
      `backend/prisma/migrations/<timestamp>_<description>/migration.sql`.
      Adding a model without a migration = `relation does not exist`
      in production. CRITICAL finding.
- [ ] **Error responses:** new error responses should use `sendError(res,
    status, message, code, extra)` from `backend/src/middleware/
    errorEnvelope.js`, not raw `res.status(4xx).json({error:...})`.
- [ ] **Background work:** any setTimeout / setInterval / scheduler
      starts? Verify it's idempotent and can be safely re-run on
      restart. Verify it's not started during tests.
- [ ] **Logging:** `console.log` in production code is a finding (use
      a debug helper or remove). `console.error` is acceptable for
      legitimate error paths.
- [ ] **Env vars:** any new `process.env.X` access? Verify `X` is
      documented in `backend/.env.example`. If not, this is a
      finding (deployers won't know to set it).

### Frontend files (`frontend/studyhub-app/src/**/*.{js,jsx}`)

- [ ] **New fetch call?**
  - [ ] Uses `${API}/api/...` (not `${API}/...`).
  - [ ] Includes `credentials: 'include'` if endpoint requires auth.
        Missing credentials causes silent 401s on split-origin deploys.
  - [ ] Uses `authHeaders()` from `pages/shared/pageUtils` if present
        in the file's neighborhood.
- [ ] **New component?**
  - [ ] If interactive: uses `forwardRef` + `...rest` passthrough.
  - [ ] CSS via `<Component>.module.css` (CSS Modules), not inline
        `style={{}}` for static values.
  - [ ] Every CSS value references a `var(--sh-*)`, `var(--radius-*)`,
        `var(--space-*)` token. Raw hex / px is allowed only for: - `min-height` (WCAG touch targets), border widths, icon sizes,
        focus-ring offsets — structural sizing. - `color: #ffffff` on `.btn--primary` and `.btn--danger` — the
        carved exception.
  - [ ] Tests in `<Component>.test.jsx`: render, variants, states, ref
        forwarding, prop passthrough. ≥5 tests minimum.
- [ ] **Polymorphic `as` prop?** Use `const Tag = as` on a separate
      line, NOT destructure-rename `{ as: Tag = 'div' }` — ESLint's
      `no-unused-vars` doesn't always traverse the rename reliably.
- [ ] **Inline `style={{}}`:** allowed only for dynamic values (e.g.,
      progress bar width as a percent). Static colors / spacing must
      live in CSS Modules.
- [ ] **Emoji in UI chrome:** forbidden. Component copy, buttons,
      headings, labels, toasts, modals, empty states, nav items, tab
      labels, placeholder text — none of these get emoji. Emoji are
      ONLY allowed inside user-generated content (feed posts, messages,
      notes, comments, profile bios). If user content surfaces are
      stripping emoji, that's also a bug.
- [ ] **Search response shape:** `/api/search` returns
      `{ results: { sheets, courses, users, notes, groups } }`. Code
      accessing `data.users` instead of `data.results.users` is a bug.
- [ ] **Socket.io events:** must use the exported constants from
      `frontend/studyhub-app/src/lib/socketEvents.js`, not hardcoded
      strings. `message:edit` not `message:edited`, etc.
- [ ] **Feature flags:** any new `design_v2_*` flag check? Verify it
      uses the `useDesignV2Flags` hook (which is fail-closed per
      decision #20). Manual `fetch('/api/flags')` calls bypass the
      contract.

### Tests (`backend/test/**`, `frontend/studyhub-app/{src/**/*.test.*,tests/**}`)

- [ ] **Skipped tests:** any new `test.skip` / `describe.skip` /
      `it.skip` / `xit` / `xdescribe`? Each must include a TODO
      comment explaining why and the path forward.
- [ ] **Accidental `.only`:** `it.only` / `describe.only` is a finding.
      Tests run as a subset in CI = false confidence.
- [ ] **Mocks match real shape:** if mocking an API response, does the
      mock include all fields the real response carries? Mocks that
      drift from real shape pass tests but fail in production.
- [ ] **Coverage of new behavior:** every new branch / variant / state
      / error path in the changed source files should have a test.
      "Test passes" without testing the new behavior is not coverage.
- [ ] **E2E:** if the PR adds a user-facing feature, is there a
      Playwright spec covering happy / empty / error states? Not
      blocking for backend-only or refactor PRs.

### Migrations (`backend/prisma/migrations/**`)

- [ ] Every `ALTER TABLE` is idempotent-safe (`IF NOT EXISTS` / `IF
    EXISTS` where appropriate).
- [ ] `NOT NULL` columns added without `DEFAULT` will fail on tables
      with existing rows. Either provide DEFAULT or stage as
      add-nullable → backfill → make-not-null.
- [ ] Index creation on large tables uses `CONCURRENTLY` if Postgres.
- [ ] Any `DROP TABLE` / `DROP COLUMN` is paired with code changes
      that no longer reference the dropped artifact.
- [ ] Migration file naming: `YYYYMMDDHHMMSS_description`.
- [ ] Schema changes in `schema.prisma` match the migration. If schema
      adds a model but migration doesn't `CREATE TABLE` it, that's a
      CRITICAL finding (table won't exist in production).

### Documentation

- [ ] If the PR changes behavior described in `CLAUDE.md`, does
      `CLAUDE.md` get updated in the same PR?
- [ ] If the PR introduces a new convention / pattern, is it added to
      `CLAUDE.md`?
- [ ] If the PR closes a phase from the roadmap, is the phase marked
      shipped in `docs/internal/audits/2026-04-24-feature-expansion-
    roadmap.md`?
- [ ] If the PR is a feature ship: is there a release log entry in
      `docs/internal/beta-v2.0.0-release-log.md`?

## Locked decisions you must enforce (CLAUDE.md §12)

These are founder-approved non-negotiable rules. Any PR violating them
gets a CRITICAL finding even if "the code works."

1. **Parallel schools, not single-primary.** Dual-enrollment users have
   relations to multiple schools. Code that assumes a `primarySchoolId`
   field is wrong.
2. **Self-learner cross-school browsing is read-only.** No mutations
   from cross-school discovery context.
3. **`teacherOf[]` + `studentOf[]` relations**, not a single
   `accountType` enum branching. Grad students can be both.
4. **Admin video captions:** required for official, optional for beta.
5. **Max video length:** 10 minutes. Reject longer.
6. **Multi-file sheets folder structure:** flat v1.
7. **Multi-file preview refresh:** auto with 500ms debounce + pause toggle.
8. **Note Review default visibility:** creator+commenter private. Public
   is opt-in with confirmation modal.
9. **AI summarization trigger:** 20 highlights default.
10. **AI quota on Note Review:** counts against creator's daily quota.
11. **Figma cadence:** +1 week buffer for Note Review + Multi-file
    Sheets specifically.
12. **Phase 3 (Hub AI card) before comment sweep** in priority order.
13. **Multi-file sheet rendering:** must be served from
    `sheets.getstudyhub.org` separate subdomain. Non-negotiable.
14. **Enrollment is self-claimed**, not verified. Scoping is UX filter,
    not security boundary.
15. **Video URL embeds: not allowed in v1.** Uploads only. URL embeds
    create an SSRF surface.
16. **Admins are un-blockable, but mutable.** Add `Announcement.urgency`
    field; urgent bypasses mute.
17. **AI PII redaction:** strip emails / phones from BOTH input and
    output of AI calls.
18. **HMAC on AI suggestions:** required.
19. **Video captions:** see #4.
20. **Flag evaluation is fail-closed** in all environments.
    `FLAG_NOT_FOUND` / network error / non-200 / malformed JSON all
    return disabled. Only `enabled=true` rows enable. Flag seeding
    via `backend/scripts/seedFeatureFlags.js`.

## Common bug patterns from project history

These have shipped before. Look for them on every relevant PR.

### Bug pattern 1: Missing `credentials: 'include'` on auth fetches

**Pattern:**

```js
fetch(`${API}/api/notifications`, {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
})
```

**Bug:** silent 401 on split-origin deploys (beta stack, prod). Tests
pass because tests run same-origin.

**Fix:**

```js
fetch(`${API}/api/notifications`, {
  method: 'GET',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json', ...authHeaders() },
})
```

### Bug pattern 2: Inline rate limiter

**Pattern:**

```js
const writeLimiter = rateLimit({ windowMs: 60_000, max: 60 })
router.post('/something', writeLimiter, handler)
```

**Bug:** violates centralization. Defaults drift across the codebase.

**Fix:** import from `backend/src/lib/rateLimiters.js`. If a needed
limiter doesn't exist, add it to that file with the existing pattern.

### Bug pattern 3: Unguarded `getBlockedUserIds` / `getMutedUserIds`

**Pattern:**

```js
const blockedIds = await getBlockedUserIds(userId)
const posts = await prisma.post.findMany({
  where: { authorId: { notIn: blockedIds } },
})
```

**Bug:** if the UserBlock table is unavailable (migration not yet
deployed, transient DB issue), throws and breaks the endpoint.

**Fix:**

```js
let blockedIds = []
try {
  blockedIds = await getBlockedUserIds(userId)
} catch {
  /* graceful degradation */
}
```

### Bug pattern 4: `field: { not: null }` Prisma syntax

**Pattern:**

```js
prisma.exam.findMany({ where: { courseId: { not: null } } })
```

**Bug:** Prisma 6.19+ rejects this with "Argument `not` must not be null."

**Fix:** `prisma.exam.findMany({ where: { NOT: [{ courseId: null }] } })`

### Bug pattern 5: Search response shape misuse

**Pattern:**

```js
const data = await fetch('/api/search?q=foo').then(r => r.json())
data.users.forEach(u => ...)  // ← wrong
```

**Bug:** the response is `{ results: { users, ... } }`. Code crashes
silently with "users is undefined."

**Fix:** `data.results.users.forEach(...)`.

### Bug pattern 6: Socket.io event name drift

**Pattern:**

```js
socket.on('message:edited', ...)  // ← wrong
```

**Bug:** backend emits `message:edit`. Listener never fires.

**Fix:** import constants from `frontend/studyhub-app/src/lib/socketEvents.js`.

### Bug pattern 7: Modal inside animated container

**Pattern:**

```jsx
<AnimatedFadeInUp>
  <div style={{ position: 'fixed', inset: 0 }}>...modal...</div>
</AnimatedFadeInUp>
```

**Bug:** anime.js applies `transform` on the parent → `position: fixed`
becomes relative to the parent, not viewport. Modal is misplaced or
clipped.

**Fix:** `createPortal(modalJsx, document.body)`.

### Bug pattern 8: Schema model without migration

**Pattern:** `schema.prisma` adds `model Foo { ... }` but no
`backend/prisma/migrations/<ts>_add_foo/migration.sql` exists.

**Bug:** production deploy results in `relation "Foo" does not exist`
on first query.

**Fix:** generate migration via `npx prisma migrate dev --name add_foo`
in the same PR.

### Bug pattern 9: useFetch infinite loop

**Pattern:**

```jsx
const { data } = useFetch('/api/things', {
  transform: (raw) => raw.map((thing) => ({ ...thing, computed: x() })),
})
```

**Bug:** inline `transform` is a new function on each render. If
`transform` is a useEffect/useCallback dep, infinite loop.

**Fix:** the hook stores `transform` in `useRef` to avoid this. But
verify no consumer added `transform` to a dep array.

### Bug pattern 10: Hardcoded `userId: 1` in tests or seeds

**Bug:** tests work locally but fail in CI when seed user has different
ID. Or: deploy a feature that hardcodes `userId: 1` and only
beta_admin sees it.

**Fix:** dynamic lookup via seed-defined username.

### Bug pattern 11: Silent catch returning wrong shape

**Pattern:**

```js
async function getFollowSuggestions(userId) {
  try {
    return await prisma.user.findMany(...)
  } catch (err) {
    return {}  // ← caller expects []
  }
}
```

**Bug:** caller does `result.slice(0, 5)`, crashes because `{}.slice`
is not a function. Discovered in production by E2E test
during Day 4 cycle.

**Fix:** match the success shape on error: `return []`.

### Bug pattern 12: FLAG_NOT_FOUND fail-open (HISTORICAL — fixed, do not regress)

If you see code that returns `true` when a feature flag row is missing,
that violates decision #20. The contract is fail-closed: missing row =
disabled. Only `enabled=true` returns enabled.

## Anti-patterns to flag immediately

- **`dangerouslySetInnerHTML` on user-generated content** without
  DOMPurify. Standard XSS.
- **`eval`, `Function()` constructor, `setTimeout(stringArg)`** — no.
- **`process.env.X` accessed at module top-level** — breaks in test
  envs that load before .env. Use a getter.
- **Error responses that leak stack traces / SQL errors / file paths
  to the client** — use generic messages in prod, log details server-side.
- **JWT or session tokens in URL query params or localStorage** —
  cookies only, per existing pattern.
- **Auth checks via `if (req.user)` only, no role check** for
  admin-only routes — needs `requireAdmin` or equivalent.
- **`console.log(req.body)` or `console.log(user)`** — leaks PII to
  logs.
- **Newly added `npm install <package>` without justification** in
  the PR description. New deps need explicit founder approval per
  CLAUDE.md hard rules.
- **Time-of-check vs time-of-use (TOCTOU)** — checking a permission
  then doing the action without atomic guarantee. Common in upload
  flows.
- **Race conditions in optimistic UI** — frontend updates state then
  fetches, without handling the case where fetch returns a stale
  result.

## Cross-feature concerns (always check)

When the PR touches any of these surfaces, verify the cross-cutting
contract is preserved:

### Block / mute system

- Any new endpoint that returns User-related data must respect
  bidirectional block + one-directional mute.
- New social features (comments, reactions, mentions, notifications)
  must filter through the block/mute helpers.
- Any code path that bypasses block/mute is a HIGH finding.

### AI quota aggregation

- Any new AI endpoint must increment the global per-user `aiCallsPerDay`
  counter, not its own per-endpoint counter.
- Per-surface quotas exist as sub-limits, but the global cap is the
  hard ceiling.
- Hub AI, Note Review summarization, AI sheet generation, AI
  suggestion edits — all share quota.

### School scoping (when implemented)

- Every endpoint that accepts `schoolId` / `courseId` enforces server-
  side authorization (caller is enrolled / public / admin).
- IDOR via param manipulation = CRITICAL finding.
- Missing visibility filter on cross-school search = HIGH finding.

### Sanitization

- Any HTML reaching the DOM must pass through DOMPurify or the
  existing sanitizer.
- Any user-uploaded SVG: server-side scan for `<script>` /
  `<foreignObject>`.
- Any markdown rendering: known-safe library (marked + DOMPurify).
- For multi-file sheets: every file individually sanitized + iframe
  served from `sheets.getstudyhub.org` (decision #13).

### Content moderation

- Even admin / staff content goes through the moderation pipeline. No
  bypass branches based on `req.user.role === 'admin'`.

### Notifications

- Any new notification trigger respects user preferences + frequency
  caps. Don't add an unbounded notification firehose.
- Batched digests for high-frequency events (e.g., 1 per reviewer per
  24h on Note Review).

## Cross-file consistency check (run on every PR)

For every changed file, identify:

1. **Direct callers** — files that import from this file. Did they need
   to change? If not, why not? Verify they still work.
2. **Tests of this file** — did they need updates? If a behavior change
   isn't reflected in tests, it's untested.
3. **Documentation** — does CLAUDE.md or any audit doc reference this
   file's behavior? Did it get updated?
4. **Type references** — `.d.ts` declarations matching this file?
5. **Storybook / component examples** — for components, are example
   usages updated?
6. **Mock data** — if API response shape changed, did test mocks
   change to match?

List the affected cross-file relationships with `file:line` references
in the "Cross-file consistency check" section of your output.

## Block / approve criteria

### Must REQUEST_CHANGES if any of these:

- Any CRITICAL finding.
- Any HIGH finding.
- Cross-file consistency broken (e.g., function signature changed in
  one place, callers not updated).
- New behavior with zero test coverage.
- Schema model added without migration.
- Locked decision (CLAUDE.md §12 or roadmap doc) violated.
- Anti-pattern from the list above present.
- New dependency added without founder-approved justification in PR
  description.

### May APPROVE if all of these:

- Zero CRITICAL or HIGH findings.
- All MEDIUM findings have either a fix or an accepted-debt comment in
  the PR.
- Cross-file impact verified clean.
- Test coverage matches the behavior change.
- Documentation updated where required.

### Comment (no approve/request) when:

- Pure refactor PR, no behavior change.
- Question about intent rather than a finding.
- Suggestion that's nice-to-have but not required.

## Final reminder

Quick reviews are how bugs ship. Take the time to read every file
fully. Trace cross-file impact. Compare to known bug patterns. Compare
to locked decisions. Compare to the security required-before-build
checklists for the relevant feature track.

If a PR contains 50 changed files, your review takes longer than 5
minutes. That's the job.

If you can't review thoroughly because the PR is too large, that itself
is a finding: "PR too large for confident review. Recommend splitting
into <X> commits / sub-PRs."
