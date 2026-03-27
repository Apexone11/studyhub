# CLAUDE.md

Read this file before starting any task in StudyHub.

## Project Overview

StudyHub is a GitHub-style collaborative study platform for college students. Core product ideas:

- Share study sheets by course.
- Fork, improve, and contribute changes back.
- Discover materials through course directories, the public feed, and global search.
- Support student collaboration through comments, stars, follows, announcements, notes, and notifications.

Primary repo layout:

- `backend/`: Express API, Prisma data layer, Vitest tests.
- `frontend/studyhub-app/`: React 19 + Vite SPA, ESLint, Vitest, Playwright.
- `docs/`: release and beta-cycle documentation.

## Current Tech Stack

Frontend:

- React 19
- React Router 7
- Vite 8
- ESLint
- Vitest
- Playwright
- anime.js
- Sentry + PostHog telemetry

Backend:

- Node.js 20+
- Express 5
- Prisma
- PostgreSQL-compatible schema via Prisma
- Vitest + Supertest
- Sentry

## Architecture Notes

- URL parameters are the source of truth for list/search/filter pages such as `SheetsPage` and `FeedPage`.
- Global search is handled by `frontend/studyhub-app/src/components/SearchModal.jsx` and `backend/src/routes/search.js`.
- The sheets page uses `GET /api/sheets` with query params like `search`, `schoolId`, `courseId`, `mine`, `starred`, and `sort`.
- The global search modal uses `GET /api/search?q=...&type=all&limit=...`.
- User profile visibility is enforced through `backend/src/lib/profileVisibility.js` and reused by both `backend/src/routes/users.js` and `backend/src/routes/search.js`.
- As of the current v1.5.0-beta behavior, login issues a session directly. Login is no longer gated on email verification or 2FA during the login flow.
- Backend is fully modularized under `backend/src/modules/<name>/` with `index.js`, `*.routes.js`, `*.controller.js`, `*.service.js`, `*.constants.js` pattern (21 modules).
- Frontend uses feature barrels under `frontend/studyhub-app/src/features/<name>/index.js` that re-export from `pages/`. New feature logic goes in `features/`, pages import from barrels. Migration is incremental.
- Files that mix React components with non-component exports must be split: constants/helpers in `.js`, components in `.jsx`. The `.js` file re-exports from `.jsx` for backward compatibility (satisfies `react-refresh/only-export-components`).
- Large pages (>200 lines) should be decomposed into thin orchestrator shells. Extract composable child components (composers, asides, empty states, nav action bars) that own their rendering. Pages own layout, routing state, and hook wiring only.
- Inline style colors must use CSS custom property tokens from `index.css`. Semantic tokens (`--sh-danger`, `--sh-success`, `--sh-warning`, `--sh-info` with `-bg`, `-border`, `-text` variants), slate scale (`--sh-slate-50` through `--sh-slate-900`), and surface tokens (`--sh-surface`, `--sh-soft`, `--sh-border`). Exceptions: dark-mode-always editor panels, unique per-metric palette colors, white text on colored buttons.
- Modals inside animated containers must use `createPortal(jsx, document.body)`. Any ancestor with `transform` (e.g., anime.js `fadeInUp`) creates a new containing block that breaks `position: fixed` viewport centering.
- HTML security policy: All HTML is accepted at submission. `validateHtmlForSubmission()` only checks empty/size. The scan pipeline (`detectHtmlFeatures` → `classifyHtmlRisk` → tier 0-3) classifies risk and routes content. Tier 0 publishes, Tier 1 publishes with warning, Tier 2 goes to admin review, Tier 3 is quarantined. Nothing is auto-blocked by tag name. Tier 3 triggers: critical-severity findings (credential capture), 3+ distinct high-risk behavior categories, obfuscated crypto-miner, or ClamAV detection.

## Repo Workflow Conventions

- Scan existing implementation patterns before editing. Follow the established style unless correctness requires a change.
- Keep changes incremental and pattern-aligned.
- Prefer fixing root causes over local patches.
- After each beta implementation cycle, document changes and validation results in `docs/beta-v1.5.0-release-log.md`.
- For frontend validation in this repo, `npm --prefix frontend/studyhub-app run lint` is the reliable full-lint command.
- Use quoted paths in PowerShell because the workspace path contains spaces.

## UI / Design Conventions

- Design baseline: Plus Jakarta Sans, token-based styles in `frontend/studyhub-app/src/index.css`, modern clean cards/gradients, and consistent icon treatment.
- Preserve the current HomePage visual language unless a task explicitly calls for a redesign.

## Validation Commands

Root workspace:

- `npm --prefix backend test`
- `npm --prefix backend run lint`
- `npm --prefix frontend/studyhub-app run lint`
- `npm --prefix frontend/studyhub-app run build`
- `npm --prefix frontend/studyhub-app run test:e2e:beta`
- `npm run beta:validate`

Full workspace shortcuts:

- `npm run lint`
- `npm run build`
- `npm run test`

## Current Search Logic Map

Search entry points:

- Landing-page hero search in `frontend/studyhub-app/src/pages/home/HomePage.jsx`
- Global modal search in `frontend/studyhub-app/src/components/SearchModal.jsx`
- Sheets page search/filter state in `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`
- Unified backend search endpoint in `backend/src/routes/search.js`
- Sheet listing search in `backend/src/routes/sheets.js`

## Recently Fixed Search Bugs

These bugs were fixed in the latest search-contract repair cycle and should stay covered by regression tests.

1. Landing-page search now writes the canonical `search` parameter.
   - File: `frontend/studyhub-app/src/pages/home/HomePage.jsx`
   - Current behavior: hero search navigates to `/sheets?search=...`.

2. Global course search links now write the canonical `courseId` filter.
   - File: `frontend/studyhub-app/src/components/SearchModal.jsx`
   - Current behavior: clicking a course result navigates to `/sheets?courseId=...`.

3. Global user search now respects profile visibility rules.
   - Files: `backend/src/routes/search.js`, `backend/src/routes/users.js`, `backend/src/lib/profileVisibility.js`
   - Current behavior: `/api/search` filters matching users through the same visibility policy used by `/api/users/:username`.

4. Global sheet search now matches sheet content consistently with SheetsPage.
   - Files: `backend/src/routes/search.js`, `backend/src/routes/sheets.js`, `backend/src/lib/sheetSearch.js`
   - Current behavior: both `/api/search` and `/api/sheets` search sheet title, description, and content through the same shared helper.

## Current Search Consistency Status

- SheetsPage and global search now share the same sheet text-search clauses through `backend/src/lib/sheetSearch.js`.
- Browser coverage now includes legacy SheetsPage URL normalization in `frontend/studyhub-app/tests/search.regression.spec.js`.
- Live beta-stack privacy coverage now exists in `frontend/studyhub-app/tests/search.privacy.beta-live.spec.js` for unauthenticated and non-classmate viewers.
- SearchModal search requests must keep `credentials: 'include'` so authenticated global search works on the split-origin beta stack.

## Testing Gaps To Close

- Extend browser coverage for the auth-gated HomePage search flow to assert the post-login return behavior if StudyHub later preserves destination after redirecting public users to `/login`.

## Working Agreement For AI Agents

When handling a new task:

1. Read this file first.
2. Explain how the relevant feature currently works before proposing edits.
3. Produce a file-by-file plan before coding for non-trivial changes.
4. Validate changes with the smallest relevant lint/test/build commands, then broader checks if the surface area is wider.
5. Update the beta release log when a beta-cycle code change is completed.