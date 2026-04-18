# StudyHub Audit Routines

One document, eight routines. Each section below is a self-contained prompt you copy and paste into Claude Code.

## How to use

1. Open Claude Code in the StudyHub repo root.
2. Scroll to the routine you want (table below).
3. Copy everything from `=== BEGIN ROUTINE ===` to `=== END ROUTINE ===` for that section.
4. Paste it into Claude Code and send.
5. Claude writes a report to `docs/audits/YYYY-MM-DD-<routine>-<mode>.md` and replies in chat with headline counts and the top findings.

## The 8 routines

| #   | Routine                                                 | When to run          |
| --- | ------------------------------------------------------- | -------------------- |
| 01  | [Security](#01--security)                               | Weekly               |
| 02  | [Gap analysis](#02--gap-analysis)                       | Weekly               |
| 03  | [Performance](#03--performance)                         | Biweekly             |
| 04  | [Code quality](#04--code-quality)                       | Biweekly             |
| 05  | [Dependencies](#05--dependencies)                       | Monthly              |
| 06  | [Database and migrations](#06--database-and-migrations) | Monthly              |
| 07  | [Frontend](#07--frontend)                               | Weekly               |
| 08  | [Pre-deploy](#08--pre-deploy)                           | Before every release |

## Severity legend (used by all routines)

- **CRITICAL** — exploitable now, data loss risk, or production-breaking
- **HIGH** — security gap, likely bug, or missing defense-in-depth
- **MEDIUM** — code quality with downstream impact
- **LOW** — style/convention drift
- **INFO** — observation, not a finding

## Common constraints (applied by all routines)

- No auto-fix. Routines report; fixes are a separate session.
- Every finding MUST cite `file:line`.
- Respect `CLAUDE.md` conventions. Do not flag established patterns (`studyhub_session` cookie, `${API}/api/` prefix, `var(--sh-*)` tokens).
- No emojis in reports.
- Skip `node_modules`, `dist`, `build`, `coverage`, `.git`, `frontend/studyhub-app/android`, `frontend/studyhub-app/ios`.
- Graceful degradation — if a tool is missing (`depcheck`, `prisma migrate status` fails, etc.), note it under "What was NOT checked" and continue.

## Reading a report

Every report has four sections:

1. **Executive summary** — counts by severity
2. **Findings table** — Severity, Category, `file:line`, Description, Recommended fix
3. **Commands run** — output collapsed in `<details>` (DEEP mode)
4. **What was NOT checked** — explicit coverage gaps

## Requesting fixes after an audit

Open a new Claude Code session and paste:

> Review `docs/audits/2026-04-16-security-deep.md`. Propose fixes for every CRITICAL and HIGH finding. Do not fix anything yet — list the fixes first.

---

## 01 — Security

=== BEGIN ROUTINE ===

You are running the **Security** audit routine for StudyHub.

**Mode:** Reply with `QUICK` or `DEEP` at the top of your response. If I did not specify, default to `QUICK`.

- QUICK: grep-only pattern scan, 5-10 min
- DEEP: grep + file reads + commands + cross-references, 20-40 min

**Task:** Audit StudyHub for security gaps across authentication, authorization, CSRF, rate limiting, HTML tier enforcement, secrets hygiene, JWT/cookie configuration, Stripe webhooks, and Socket.io hardening.

**Scope — focus:** `backend/src/**`, `frontend/studyhub-app/src/**`, `backend/prisma/schema.prisma`.
**Scope — skip:** `node_modules`, `dist`, `build`, `coverage`, `.git`, mobile build artifacts (`android`, `ios`).

**Checks (QUICK mode):**

- Grep `router\.(post|patch|put|delete)\(` in `backend/src/modules/**/*.routes.js`. Flag any state-changing route without `authRequired` or `adminRequired` middleware on the same or preceding line.
- Flag any POST/PATCH/DELETE route without a CSRF origin check (reference pattern: `backend/src/modules/payments/payments.routes.js`).
- Flag any state-changing route without an associated rate limiter from `backend/src/lib/rateLimiters.js`.
- Grep for inline `rateLimit(` or `rateLimit.default(` definitions outside `rateLimiters.js`. These must be centralized.
- Grep `getBlockedUserIds|getMutedUserIds` across `backend/src/**`. Every call must be inside a try-catch block. Flag unguarded calls.
- Grep HTML-accepting endpoints (sheets, notes, ai, feed). Each must call `validateHtmlForSubmission`, then `detectHtmlFeatures` and `classifyHtmlRisk`. Flag any bypass.
- Grep for plaintext secrets: `sk_live_`, `sk_test_`, `AKIA[0-9A-Z]{16}`, `BEGIN RSA PRIVATE KEY`, `BEGIN PRIVATE KEY`, `password\s*=\s*"`, `api_key\s*=\s*"`, `secret\s*=\s*"`.
- Verify `.env` and `.env.local` are in `.gitignore`.
- Grep `res.cookie(` — every set must have `httpOnly: true`, `secure: true` in prod, and `sameSite`. Confirm session cookie name is `studyhub_session`.
- Grep `jwt.sign(` — confirm expiry is always set.
- Grep `stripe.webhooks.constructEvent` — must be present in the payments module.
- Grep `$queryRawUnsafe|$executeRawUnsafe` and `$queryRaw` with interpolated user input. Flag all for review.
- Frontend: grep `fetch\(` in `frontend/studyhub-app/src/**`. Flag authenticated-endpoint calls missing `credentials: 'include'`.
- Frontend: grep `localStorage.setItem|sessionStorage.setItem` with keys `token`, `session`, `jwt`, `auth`. Any hit is a finding — auth state belongs in the HTTP-only cookie.
- Frontend: grep `dangerouslySetInnerHTML`. Flag calls that render unsanitized user content.

**Checks (DEEP mode — everything in QUICK, plus):**

- Read `backend/src/index.js` end to end. Verify helmet applied, CORS origin whitelist correct, body size limits, trust proxy set, `POST /api/payments/webhook` mounted with `express.raw()` BEFORE global `express.json()`.
- Read `backend/src/lib/rateLimiters.js`. Count exports, grep each across route files, flag dead limiters and import-name mismatches.
- Read the auth token module. Confirm rotation, expiry, refresh flow. Flag indefinite tokens.
- Run `npm --prefix backend run lint` and extract warnings tagged `security/`, `no-eval`, `no-implied-eval`, `no-new-func`.
- Read `backend/src/modules/payments/payments.routes.js`. Confirm every POST has CSRF origin check, rate limiter, and `authRequired` where applicable.
- Read `backend/src/modules/ai/ai.routes.js`. Confirm usage limits, plan gating, and that `<script>` tags are forbidden in AI-generated sheet HTML.
- Spot-check 10 route handlers for `req.body.*` usage. Each must pass through a validator middleware before hitting business logic.
- Read the HTML scan pipeline. Confirm tiers 0-3 are enforced, ClamAV integration has graceful fallback, tier 3 is persisted to an admin queue.
- Read `backend/src/lib/socketio.js`. Confirm rate limits on `typing:*` (20/min) and `conversation:join` (30/min), max message length enforced, auth middleware attached to socket connections.

**Output:**

1. Write report to `docs/audits/YYYY-MM-DD-security-[quick|deep].md` with: executive summary (counts by severity), findings table (Severity | Category | `file:line` | Description | Recommended fix), commands-run in `<details>` blocks (DEEP only), "What was NOT checked" section.
2. Chat reply: `<C> CRITICAL, <H> HIGH, <M> MEDIUM, <L> LOW, <I> INFO`, top 3 CRITICAL/HIGH findings with `file:line`, path to the report file.

**Constraints:** No auto-fix. Every finding cites `file:line`. Respect CLAUDE.md. No emojis. Skip mobile build artifacts.

=== END ROUTINE ===

---

## 02 — Gap Analysis

=== BEGIN ROUTINE ===

You are running the **Gap Analysis** audit routine for StudyHub.

**Mode:** Reply with `QUICK` or `DEEP` at the top of your response. Default to `QUICK` if unspecified.

**Task:** Find gaps where the codebase is incomplete or inconsistent: Prisma models without migrations, frontend fetches missing `/api` prefix, hardcoded Socket.io event strings, untested modules, and schema drift.

**Scope — focus:** `backend/src/**`, `backend/prisma/**`, `frontend/studyhub-app/src/**`, `frontend/studyhub-app/tests/**`.
**Scope — skip:** `node_modules`, `dist`, `build`, `coverage`, `.git`, mobile build artifacts.

**Checks (QUICK mode):**

- Parse `backend/prisma/schema.prisma`. Extract every `model <Name> {` block. For each model, grep `CREATE TABLE "<Name>"` (case-insensitive, quoted and unquoted) across `backend/prisma/migrations/**/migration.sql`. Flag any model without a matching `CREATE TABLE`.
- Grep `\$\{API\}/[^a]` in `frontend/studyhub-app/src/**`. Flag any fetch URL that doesn't start with `${API}/api/`.
- Grep Socket.io event-string literals on the frontend: `socket.emit\(['"]`, `socket.on\(['"]`. Each should import from `lib/socketEvents.js` instead of hardcoding. Flag hardcoded strings.
- Same check on backend: grep `io.emit\(['"]`, `socket.emit\(['"]`, `socket.on\(['"]` — should use `backend/src/lib/socketEvents.js`.
- For every `*.routes.js` under `backend/src/modules/`, check for a matching test file in `backend/tests/` (or wherever tests live). List modules with zero tests.
- For every page under `frontend/studyhub-app/src/pages/<name>/<Name>Page.jsx`, check for a matching Playwright or Vitest spec. List pages with zero tests.
- Grep migration SQL for `CREATE TABLE` and `ALTER TABLE ADD COLUMN`. Cross-check each against `schema.prisma`. Flag SQL-only tables/columns (migrations exist but schema wasn't updated).
- Grep for `TODO:`, `FIXME:`, `XXX:`, `HACK:`, `@deprecated` across backend and frontend src. List all occurrences grouped by file.
- Grep for frontend fetches to authenticated endpoints missing `credentials: 'include'` (also caught in security routine — list here with MEDIUM severity as a gap finding).

**Checks (DEEP mode — everything in QUICK, plus):**

- Run `npx prisma validate` in `backend/`. Report the output.
- Read `CLAUDE.md`, find the "Still untested" list, and confirm each item is still untested (grep for any matching `*.test.js` or `*.spec.js`). Remove items that are now covered (positive progress) and add items that are newly untested.
- For each route in `backend/src/modules/**/*.routes.js`, verify the corresponding frontend code path calls it. Flag orphan backend routes (exposed but never called).
- For each `useFetch`/`fetch` call on the frontend, verify the target endpoint exists on the backend. Flag dead frontend fetches (frontend calls `/api/foo/bar` but no backend route matches).
- Read `docs/beta-v2.0.0-release-log.md`. Identify features mentioned as "in progress" that are not yet released. Flag stale items older than 30 days.
- Read every `*.controller.js` and flag any exported function not wired into a route file.

**Output:**

1. Write report to `docs/audits/YYYY-MM-DD-gap-analysis-[quick|deep].md` with the standard four sections.
2. Chat reply: severity counts, top 3 findings with `file:line`, path to report.

**Constraints:** Same as common constraints. Gaps are usually MEDIUM or HIGH, not CRITICAL, unless missing migrations for tables in active use.

=== END ROUTINE ===

---

## 03 — Performance

=== BEGIN ROUTINE ===

You are running the **Performance** audit routine for StudyHub.

**Mode:** `QUICK` or `DEEP`. Default QUICK.

**Task:** Find performance bottlenecks: N+1 queries, missing `select` on Prisma reads, missing indexes, cache misuse, useFetch misuse, and oversized frontend imports.

**Scope — focus:** `backend/src/modules/**`, `backend/prisma/schema.prisma`, `frontend/studyhub-app/src/**`.
**Scope — skip:** standard skip list.

**Checks (QUICK mode):**

- Grep `prisma\.[a-zA-Z]+\.(findMany|findFirst|findUnique)` in `backend/src/**`. For each hit, check the call options include `select:` or `include:` with a bounded shape. Flag full-row reads in list endpoints.
- Grep `prisma\.[a-zA-Z]+\.findMany` inside a `for (`, `.map(`, `.forEach(`, `await Promise.all(` block. Each is a likely N+1 — flag with file:line.
- Grep `useFetch\(` in `frontend/studyhub-app/src/**`. Flag calls with an inline arrow function `transform:` that isn't wrapped via `useRef` or similar (CLAUDE.md pitfall #9).
- Grep `useEffect\(` with an empty or missing dependency array where the body references props/state. Manual review required.
- Grep `import .* from ['"]lodash['"]|['"]date-fns['"]|['"]@heroicons/react['"]` — flag full-library imports; should be `lodash/debounce`, `date-fns/format`, specific icon paths.
- Grep `clampLimit|clampPage` in backend list endpoints. Flag list/search endpoints that don't use them.
- Grep `cacheControl` middleware usage. Confirm it's applied to the stable public endpoints listed in CLAUDE.md (platform-stats, schools, courses-popular, preferences). Flag missing applications.
- Grep `findMany` where no `take:` limit is set and the endpoint is public-facing. Flag unbounded reads.

**Checks (DEEP mode — everything in QUICK, plus):**

- Run `npm --prefix frontend/studyhub-app run build` and capture the bundle analysis output. Flag chunks larger than 500 KB gzipped; flag any single chunk larger than 1 MB.
- Read `frontend/studyhub-app/vite.config.js` — confirm code splitting is configured for heavy routes (admin, AI, pricing).
- Pick 5 hot Prisma queries from the top-traffic modules (sheets, notes, feed, search, messages). For each, identify the columns used in `where`, `orderBy`, and `select`. Cross-reference `schema.prisma` for `@@index` directives that cover those columns. Flag missing indexes.
- Read `frontend/studyhub-app/src/lib/useFetch.js` and `prefetch.js`. Confirm SWR cache sweep logic, cap enforcement, prefetch debounce. Flag any divergence from CLAUDE.md description.
- Run `npm --prefix backend test -- --reporter=verbose` and flag any test taking more than 3 seconds individually.
- Read the search module (`backend/src/modules/search/`) and sheet search (`backend/src/lib/sheetSearch.js`). Confirm full-text or trigram indexes exist on text-search columns, or note absence as HIGH finding.
- Grep `React.memo|useMemo|useCallback` density in large pages (>500 lines). Flag large pages with zero memoization as LOW (suggestion only — may not be needed).

**Output:** Report to `docs/audits/YYYY-MM-DD-performance-[quick|deep].md` + chat summary.

**Constraints:** Common constraints. Performance findings are typically MEDIUM or HIGH; production-crashing patterns (unbounded reads on a public endpoint) are CRITICAL.

=== END ROUTINE ===

---

## 04 — Code Quality

=== BEGIN ROUTINE ===

You are running the **Code Quality** audit routine for StudyHub.

**Mode:** `QUICK` or `DEEP`. Default QUICK.

**Task:** Enforce StudyHub code conventions: file size caps, centralized error envelope, rate-limiter centralization, tokenized colors, mixed-export separation, emoji ban, Prisma 6 null syntax, TODO density.

**Scope — focus:** `backend/src/**`, `frontend/studyhub-app/src/**`. **Skip:** standard skip list, plus `*.test.js`, `*.spec.js` when flagging file-size caps.

**Checks (QUICK mode):**

- Find files larger than 500 lines under `backend/src/` and `frontend/studyhub-app/src/`. List with line counts descending.
- Grep `res\.status\([0-9]+\)\.json\(\{\s*error` or `res\.status\([0-9]+\)\.json\(\{\s*message` in backend route handlers. These should use `sendError(res, ...)` from `backend/src/middleware/errorEnvelope.js`. Flag all.
- Grep for inline rate limiter definitions outside `backend/src/lib/rateLimiters.js`: `rateLimit\(` or `rateLimit.default\(`.
- Grep inline color values in JSX: `style=\{\{[^}]*(#[0-9a-fA-F]{3,8}|rgb\(|rgba\()`. Each must use `var(--sh-*)` tokens unless it's a dark-mode-always editor surface or a per-metric palette (documented exceptions in CLAUDE.md).
- Find `.jsx` files under `frontend/studyhub-app/src/` that export non-component values (violates `react-refresh/only-export-components`). Grep each `.jsx` file for `export const [a-z]` (non-capitalized exports) — flag as candidates.
- Grep for emoji characters across `backend/src/**` and `frontend/studyhub-app/src/**`. Use a Unicode range regex for common emoji ranges (U+1F300-U+1FAFF, U+2600-U+27BF). Flag every occurrence.
- Grep Prisma 6 antipattern: `\{\s*not:\s*null\s*\}`. Should be `NOT: [{ field: null }]` (array form at where level). Flag all hits.
- Grep `TODO:|FIXME:|XXX:|HACK:`. Report delta vs `main` branch: `git diff main -- backend/ frontend/studyhub-app/src/` and count new markers.
- Flag any file importing from a barrel but the barrel doesn't re-export that name (broken imports).

**Checks (DEEP mode — everything in QUICK, plus):**

- Run `npm --prefix backend run lint`. Parse output; report warning/error counts by rule name.
- Run `npm --prefix frontend/studyhub-app run lint`. Same.
- Dead-export scan: for each exported function/component in `backend/src/**` and `frontend/studyhub-app/src/**`, grep for an import of that name. Report exports with zero importers.
- Duplication scan: pick 3 utility areas (date formatting, string helpers, error handling) and grep for near-duplicate functions. Report candidates for consolidation.
- Read the 5 largest files. For each, identify if it mixes concerns (e.g., controller + service + validation) and recommend a split.
- Verify that every `pages/shared/pageUtils.js` function is still used; flag stale helpers.
- Check `frontend/studyhub-app/src/features/` barrel compliance: every feature directory should have `index.js` that re-exports from `pages/` per CLAUDE.md. Flag features missing the barrel.

**Output:** Report to `docs/audits/YYYY-MM-DD-code-quality-[quick|deep].md` + chat summary.

**Constraints:** Common constraints. Code quality findings are usually LOW or MEDIUM; violations of CLAUDE.md documented bugs (Prisma 6 syntax, `/api` prefix, emoji) are HIGH.

=== END ROUTINE ===

---

## 05 — Dependencies

=== BEGIN ROUTINE ===

You are running the **Dependencies** audit routine for StudyHub.

**Mode:** `QUICK` or `DEEP`. Default QUICK.

**Task:** Audit npm dependencies for vulnerabilities, outdated majors, unused packages, duplicates, and typosquat risk.

**Scope — focus:** `backend/package.json`, `backend/package-lock.json`, `frontend/studyhub-app/package.json`, `frontend/studyhub-app/package-lock.json`, root `package.json`.

**Checks (QUICK mode):**

- Run `npm --prefix backend audit --json`. Parse output. Report by severity (critical, high, moderate, low).
- Run `npm --prefix frontend/studyhub-app audit --json`. Same.
- Run `npm --prefix backend outdated --json`. Report packages more than one major version behind.
- Run `npm --prefix frontend/studyhub-app outdated --json`. Same.
- Read each `package.json`. Flag any package with name patterns that look like typosquats of popular libraries (e.g., `rea ct`, `reactt`, `expres`, `loadash`). Require manual confirmation.
- Read `package-lock.json` in both projects. Identify duplicated transitive dependencies (same package at multiple versions). Report the top 5 worst cases.

**Checks (DEEP mode — everything in QUICK, plus):**

- Run `npx depcheck` in `backend/` and `frontend/studyhub-app/`. Report unused dependencies and missing dependencies (imported but not declared). If `depcheck` is not installed, note under "What was NOT checked" and continue.
- Run `npm --prefix backend ls --all --json` and `npm --prefix frontend/studyhub-app ls --all --json`. Identify peer-dependency warnings and version conflicts.
- Cross-reference `npm audit` findings with the actual import locations. For each high/critical vulnerability, grep the affected package name in source files to determine whether the vulnerable code path is actually reached.
- For each major-version-behind package, check the release notes URL (if easily available in the package.json repository field) to classify: low-risk update, has breaking changes, requires migration.
- Check for packages that exist in both `dependencies` and `devDependencies` (unusual; usually a mistake).

**Output:** Report to `docs/audits/YYYY-MM-DD-dependencies-[quick|deep].md` + chat summary.

**Constraints:** Common constraints. Critical/high CVEs with a reachable code path are CRITICAL findings. Outdated-but-secure majors are LOW.

=== END ROUTINE ===

---

## 06 — Database and Migrations

=== BEGIN ROUTINE ===

You are running the **Database and Migrations** audit routine for StudyHub.

**Mode:** `QUICK` or `DEEP`. Default QUICK.

**Task:** Verify schema-migration consistency, foreign-key safety, destructive-SQL safety, index coverage, and Prisma 6 null syntax compliance.

**Scope — focus:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/**/migration.sql`, any Prisma usage across `backend/src/**`.

**Checks (QUICK mode):**

- Parse `schema.prisma`. Extract every `model` block. For each model, confirm a matching `CREATE TABLE` exists in `backend/prisma/migrations/`. Flag missing migrations (CRITICAL — pitfall #5 in CLAUDE.md).
- Grep migration SQL for destructive statements: `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN .* NOT NULL` without a preceding `SET DEFAULT` or data-fill migration. Flag each.
- Grep migration SQL for `REFERENCES` clauses missing `ON DELETE` or `ON UPDATE`. Flag missing cascade behavior.
- For each `@@index` and `@@unique` directive in `schema.prisma`, verify a matching `CREATE INDEX` or `CREATE UNIQUE INDEX` exists in migrations. Flag declared-but-not-migrated indexes.
- Conversely, flag `CREATE INDEX` in migrations that don't have a corresponding `@@index` in schema (drift).
- Grep `{ not: null }` across `backend/src/**`. Should be `NOT: [{ field: null }]`. Flag all (pitfall #3).
- List migrations in chronological order (by folder name timestamp). Flag any folder whose timestamp is more than 30 days earlier than adjacent migrations (possible rename or rebase artifact).

**Checks (DEEP mode — everything in QUICK, plus):**

- Run `npx prisma migrate status` in `backend/`. Report pending migrations, drift warnings, and failed migrations.
- Run `npx prisma validate` in `backend/`. Report errors or warnings.
- For each Prisma model, identify the columns used in `where`, `orderBy`, and `@@unique` clauses across `backend/src/**`. Cross-reference against declared indexes. Flag columns that are queried but unindexed.
- Read the 5 most recent migrations. Confirm they are idempotent-safe (use `IF NOT EXISTS`, `IF EXISTS` where possible, have no `DROP TABLE ... CASCADE` without backup).
- Verify every `_count` relation and aggregate query in `backend/src/**` has a reasonable `where` scope (no unbounded aggregates on large tables).
- Read `docs/beta-v2.0.0-release-log.md` and confirm every migration mentioned as deployed has a corresponding file in `backend/prisma/migrations/`.
- Confirm rollback strategy: do any migrations have a down-migration or rollback SQL nearby? Note absence for CRITICAL destructive migrations.

**Output:** Report to `docs/audits/YYYY-MM-DD-database-migrations-[quick|deep].md` + chat summary.

**Constraints:** Common constraints. Missing migrations for active tables, destructive SQL without default, and unindexed hot queries are CRITICAL or HIGH.

=== END ROUTINE ===

---

## 07 — Frontend

=== BEGIN ROUTINE ===

You are running the **Frontend** audit routine for StudyHub.

**Mode:** `QUICK` or `DEEP`. Default QUICK.

**Task:** Audit the React SPA for StudyHub-specific conventions (`credentials: 'include'`, `UserAvatar`, `createPortal` in animated containers, Skeleton loaders), accessibility, token usage, and routing lazy-load.

**Scope — focus:** `frontend/studyhub-app/src/**`.
**Scope — skip:** standard skip list, mobile build artifacts.

**Checks (QUICK mode):**

- Grep `fetch\(` in `frontend/studyhub-app/src/**`. Flag authenticated-endpoint calls missing `credentials: 'include'`.
- Grep `localStorage.setItem|sessionStorage.setItem` with auth-sensitive keys (`token`, `session`, `jwt`, `auth`, `access`). Flag all — auth belongs in HTTP-only cookies.
- Grep `<img[^>]*src=\{[^}]*\.(profilePicture|avatar|profileImage)` in JSX. These should use the `UserAvatar` component (per CLAUDE.md). Flag all.
- Grep for modals (`role="dialog"`, `Modal`, `dialog`) rendered inside components that use anime.js `fadeInUp` or CSS `transform`. Any modal not using `createPortal(jsx, document.body)` is broken per CLAUDE.md pitfall #8.
- Grep `"Loading\.\.\."` or `>Loading</` string literals. Replace with `<Skeleton>` component per CLAUDE.md UI convention.
- Grep `<img[^>]*>` without `alt=`. Flag for accessibility.
- Grep `<button[^>]*>\s*<[A-Z]` (button containing only an icon component) without `aria-label=`. Flag for accessibility.
- Grep hardcoded URLs: `https?://[^`"'$]`in source files. Production URLs should come from the`API` config constant. Flag all (exclude image assets, external OAuth redirects, documentation links).
- Grep `React.lazy|lazy(` in `src/App.jsx` and route files. Confirm admin routes, AI route, pricing route use lazy-load. Flag heavy routes not lazy-loaded.
- Grep `emoji` characters in JSX text content. Flag all (per CLAUDE.md rule 8).

**Checks (DEEP mode — everything in QUICK, plus):**

- Run `npm --prefix frontend/studyhub-app run lint`. Extract `jsx-a11y/*` warnings.
- Run `npm --prefix frontend/studyhub-app run build`. Confirm it succeeds. Note any warnings about unused imports, dead code, or circular dependencies.
- Read the 10 largest pages (`frontend/studyhub-app/src/pages/**/*.jsx`, >300 lines). Identify pages that should be decomposed per CLAUDE.md UI convention (thin orchestrator shell + child components).
- Confirm every page at `src/pages/<feature>/` has a corresponding barrel at `src/features/<feature>/index.js` per CLAUDE.md. Flag missing barrels.
- Grep `useSocket|socket.emit|socket.on` in pages. Confirm event names match `frontend/studyhub-app/src/lib/socketEvents.js` constants (not hardcoded strings).
- Read `App.jsx` and confirm route definitions match CLAUDE.md documented routes (pricing at `/pricing`, supporters at `/supporters`, ai at `/ai`, etc.).
- Keyboard navigation: spot-check 3 interactive components (dropdowns, modals, multi-step forms) for `tabindex`, `onKeyDown` Esc/Enter handling, focus trap on open.
- Heading order: grep every page for `<h1>`, `<h2>`, `<h3>` usage. Flag pages with skipped heading levels or missing `h1`.

**Output:** Report to `docs/audits/YYYY-MM-DD-frontend-[quick|deep].md` + chat summary.

**Constraints:** Common constraints. Missing `credentials: 'include'` on authenticated calls is HIGH (breaks auth). Missing `createPortal` for modals is MEDIUM (visual bug). A11y issues are MEDIUM.

=== END ROUTINE ===

---

## 08 — Pre-Deploy

=== BEGIN ROUTINE ===

You are running the **Pre-Deploy** audit routine for StudyHub.

**Mode:** `QUICK` or `DEEP`. Default DEEP for this routine (the point is thoroughness before release).

**Task:** Verify the branch is ready to ship: lint clean, tests pass, build succeeds, env vars documented, release log updated, migrations ready to deploy, no stray TODO markers introduced.

**Scope — focus:** entire workspace.
**Scope — skip:** standard skip list.

**Checks (QUICK mode):**

- Run `npm --prefix backend run lint`. Must be clean. Report count of errors and warnings.
- Run `npm --prefix frontend/studyhub-app run lint`. Same.
- Run `git status`. Flag uncommitted changes.
- Run `git log main..HEAD --oneline`. List commits going out.
- Grep new `TODO:|FIXME:|XXX:|HACK:` markers in the branch diff: `git diff main -- backend/src/ frontend/studyhub-app/src/`. Report count of new markers.
- Read `docs/beta-v2.0.0-release-log.md`. Confirm the most recent entry is dated within 1 day of the HEAD commit date.
- List Prisma migration files added in this branch: `git diff main --name-only -- backend/prisma/migrations/`. Flag if new models were added to schema but no migration was added.

**Checks (DEEP mode — everything in QUICK, plus):**

- Run `npm --prefix backend test`. Must pass. Report count of tests, duration, and any skipped tests.
- Run `npm --prefix frontend/studyhub-app run build`. Must succeed. Report bundle sizes.
- Run `npm --prefix frontend/studyhub-app run test:e2e:beta` if Playwright is set up. Report pass/fail.
- Run `npm run beta:validate` at the workspace root if it exists.
- Grep `process\.env\.[A-Z_]+` across `backend/src/**`. Build the set of required env vars. Read `.env.example` (or equivalent) and CLAUDE.md. Flag env vars used in code but not documented.
- Do the same for frontend: grep `import\.meta\.env\.[A-Z_]+`. Flag undocumented.
- Read `backend/prisma/schema.prisma` and compare to `git diff main -- backend/prisma/`. If schema.prisma was modified but no new migration file was added, this is CRITICAL — ship-blocker.
- Confirm the branch is up to date with `main`: `git log HEAD..main --oneline` should be empty (or report commits on main not in branch).
- Read the release log entry for this cycle. Confirm it mentions every module touched (cross-reference with `git diff main --stat`).
- Verify Sentry/PostHog integrations still initialize (grep for `Sentry.init` and `posthog.init`; confirm DSN env vars are handled).

**Output:** Report to `docs/audits/YYYY-MM-DD-pre-deploy-[quick|deep].md` + chat summary.

**Constraints:** Common constraints. Any failing lint, test, or build is CRITICAL (ship-blocker). Missing migration for a new model is CRITICAL. Stale release log is HIGH.

=== END ROUTINE ===

---

## After an audit — running fixes

Once a report is written, open a new Claude Code session and paste:

> Review `docs/audits/YYYY-MM-DD-<routine>-<mode>.md`. For every CRITICAL and HIGH finding, propose a fix with the exact file and line changes. Do not edit any files yet — list the fixes first. Group fixes by module so I can approve them in batches.

This separates audit from fix, keeping the loop tight and reviewable.
