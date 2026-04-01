# StudyHub v1.7.1 Improvement Roadmap

Status: All cycles (A-E) complete.

---

## Cycle A: Perceived Performance (DONE - 2026-04-01)

Skeleton loaders on all pages, SWR caching in useFetch, prefetch-on-hover on sidebar links, HTTP Cache-Control headers on stable endpoints, cache cleanup on logout. 21 files changed. Details in `docs/beta-v1.7.0-release-log.md`.

---

## Cycle B: Code Splitting and Bundle Size (DONE - 2026-04-01)

Goal: Reduce initial JS payload so first paint is faster on slow connections.

### B-1: Route-level code splitting
- Wrap every top-level page import in `React.lazy()` + `<Suspense>` with skeleton fallbacks.
- Pages: SheetsPage, FeedPage, MessagesPage, NotesPage, StudyGroupsPage, AiPage, ProfilePage, SettingsPage, AdminPage, SheetDetailPage.
- Expected impact: initial bundle drops by ~40-60% since most users only visit 2-3 pages per session.

### B-2: Lazy-load heavy components
- AiBubble (portal, only needed after first interaction).
- SearchModal (only needed on Cmd+K).
- NoteEditor (CodeMirror or similar weight).
- SheetLab editor.

### B-3: Analyze bundle with vite-bundle-visualizer
- Identify largest chunks.
- Tree-shake unused exports from utility libraries (lodash, date-fns if present).

### B-4: Optimize anime.js usage
- Currently imported globally. Consider dynamic import only on pages that animate (HomePage, onboarding).

Estimated effort: 1-2 sessions. No backend changes.

---

## Cycle C: Large File Decomposition (DONE - 2026-04-01)

Goal: Improve maintainability and reduce cognitive load on the largest files.

### C-1: StudyGroupsPage.jsx (~1583 lines)
- Extract: GroupCreateModal, GroupSearchBar, GroupCard, GroupDetailHeader, GroupSettingsPanel.
- Page becomes thin orchestrator (~200 lines) that owns layout and routing state.

### C-2: studyGroups.routes.js (~2456 lines)
- Split into sub-routers: `studyGroups.members.routes.js`, `studyGroups.resources.routes.js`, `studyGroups.sessions.routes.js`, `studyGroups.discussions.routes.js`.
- Main file re-exports and mounts sub-routers.

### C-3: messaging.routes.js (~1297 lines)
- Split into: `messaging.conversations.routes.js`, `messaging.messages.routes.js`, `messaging.reactions.routes.js`.

### C-4: useStudyGroupsData.js (~1033 lines)
- Split into focused hooks: `useGroupList`, `useGroupDetail`, `useGroupMembers`, `useGroupSessions`.
- Main hook re-exports for backward compatibility.

Estimated effort: 2-3 sessions. Requires careful re-export strategy to avoid breaking imports.

---

## Cycle D: Test Coverage (DONE - 2026-04-01)

Goal: Close the gap between E2E-only coverage and proper unit/integration tests.

### D-1: Frontend unit tests (currently ~209 lines vs 6792 lines E2E)
- Priority targets: useFetch (SWR logic, cache behavior, error states), prefetch module, session helpers, aiService, messagesHelpers.
- Use Vitest with React Testing Library for hook tests.

### D-2: Backend integration tests for messaging
- Test all CRUD endpoints: create conversation, send message, edit, delete, reactions.
- Test rate limiting on message writes.
- Test Socket.io event emission (mock socket).

### D-3: E2E tests for DM auto-start flow
- Profile page -> click DM button -> `/messages?dm=userId` -> conversation created.
- Verify message send/receive in new conversation.

### D-4: Auth flow regression tests
- Session sync on app startup (protectedSession).
- Logout clears cookies + SWR cache.
- Preferences load on bootstrap.

Estimated effort: 2 sessions.

---

## Cycle E: Infrastructure and Dependencies (DONE - 2026-04-01)

Goal: Reduce risk from outdated dependencies and improve deploy pipeline.

### E-1: Upgrade Vite from 8.0.0-beta.13 to stable
- Currently on a beta prerelease. Upgrade to stable 8.5.x (or latest stable).
- Run full build + E2E suite after upgrade.

### E-2: Frontend Dockerfile multi-stage build
- Current Dockerfile likely copies node_modules into final image.
- Switch to: stage 1 (install + build), stage 2 (nginx/static serve with only dist/).
- Reduces image size and attack surface.

### E-3: Health check endpoint hardening
- Backend `/api/health` should verify database connectivity (Prisma `$queryRaw`).
- Add Redis/Socket.io health if applicable.
- Railway health checks should use this endpoint.

### E-4: Monitoring and alerting
- Verify Sentry error grouping is clean (no noise from expected 4xx).
- Add Sentry performance tracing on slowest endpoints (sheet upload, AI streaming).
- PostHog: verify page-view and feature-flag tracking is wired.

Estimated effort: 1-2 sessions.

---

## Priority Order

| Cycle | Impact | Risk | Effort | Priority Score |
|-------|--------|------|--------|---------------|
| A (Perceived Performance) | 5 | 1 | 2 | DONE |
| B (Code Splitting) | 4 | 1 | 2 | DONE |
| D (Test Coverage) | 3 | 4 | 3 | DONE |
| C (File Decomposition) | 3 | 2 | 3 | DONE |
| E (Infrastructure) | 3 | 3 | 2 | DONE |

Recommended order: B -> D -> E -> C. Code splitting gives the most user-visible improvement next. Test coverage reduces regression risk before the larger refactors in C. Infrastructure upgrades (E) reduce dependency risk. File decomposition (C) is important for maintainability but lower urgency since the current code works.

---

## Tech Debt Backlog (from audit 2026-04-01)

These items were identified during the tech debt audit and are tracked here for future sessions:

| Item | Category | Severity | Notes |
|------|----------|----------|-------|
| Vite 8.0.0-beta.13 | Dependency | Medium | Covered in Cycle E-1 |
| StudyGroupsPage 1583 lines | Code | Medium | Covered in Cycle C-1 |
| studyGroups.routes.js 2456 lines | Code | Medium | Covered in Cycle C-2 |
| messaging.routes.js 1297 lines | Code | Low-Medium | Covered in Cycle C-3 |
| useStudyGroupsData.js 1033 lines | Code | Low-Medium | Covered in Cycle C-4 |
| Frontend unit test gap | Test | Medium | Covered in Cycle D-1 |
| Missing messaging integration tests | Test | Medium | Covered in Cycle D-2 |
| No DM auto-start E2E test | Test | Low | Covered in Cycle D-3 |
