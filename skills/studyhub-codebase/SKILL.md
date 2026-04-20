---
name: studyhub-codebase
description: Understand, review, debug, and extend the StudyHub full-stack application. Use when working in the StudyHub repository to trace features across the React frontend, Express and Prisma backend, Railway and Docker deployment config, authentication, email verification, feed posts, study sheet forks and contributions, uploads, notifications, or admin flows.
---

# StudyHub Codebase

## Overview

Use this skill to work inside the StudyHub repository without rediscovering the product model each time.
StudyHub Version 1 is a full-stack student collaboration platform with course-based study sheets, feed posts, file uploads, notifications, and account-security flows.

## Quick Start

1. Read `references/architecture.md` to understand the core product model, cross-cutting security rules, and runtime behavior.
2. Read `references/repo-map.md` to find the right frontend page, backend route, helper, or deployment file quickly.
3. Follow feature paths end to end. Do not patch only the frontend or only the backend when a feature crosses both layers.

## Working Rules

- Treat these models as the main product backbone: `User`, `School`, `Course`, `StudySheet`, `FeedPost`, `SheetContribution`, and `Notification`.
- Respect the current security model:
  - Cookie-authenticated browser sessions
  - CSRF protection for mutating cookie-based requests
  - Route-level rate limiting on write and download paths
  - Managed upload path resolution in `backend/src/lib/storage.js`
  - Sanitized HTML rendering on the frontend
- When changing auth or account settings, inspect both backend routes and frontend session or HTTP helpers before editing.
- When changing uploads, downloads, or attachment cleanup, update the storage helpers and every consuming route together.
- When changing database-backed behavior, check whether the change also requires Prisma schema, migration, seed, smoke, or load-test updates.
- Prefer small, behavior-preserving edits in shared frontend modules such as `frontend/studyhub-app/src/pages/shared/pageScaffold.jsx` and `frontend/studyhub-app/src/components/AppSidebar.jsx`; style-only churn there can create noisy diffs.

## Task Map

### Authentication, verified email, and 2-step verification

- Backend:
  - `backend/src/routes/auth.js`
  - `backend/src/routes/settings.js`
  - `backend/src/lib/email.js`
  - `backend/src/lib/verificationCodes.js`
  - `backend/src/lib/authTokens.js`
- Frontend:
  - `frontend/studyhub-app/src/pages/auth/LoginPage.jsx`
  - `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx`
  - `frontend/studyhub-app/src/lib/http.js`
  - `frontend/studyhub-app/src/lib/session-context.jsx`
  - `frontend/studyhub-app/src/lib/useProtectedPage.js`

### Feed posts, comments, reactions, mentions, and notifications

- Backend:
  - `backend/src/routes/feed.js`
  - `backend/src/routes/notifications.js`
  - `backend/src/lib/mentions.js`
  - `backend/src/lib/notify.js`
- Frontend:
  - `frontend/studyhub-app/src/pages/feed/FeedPage.jsx`
  - `frontend/studyhub-app/src/components/Navbar.jsx`
  - `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx`

### Study sheets, forks, contributions, downloads, and attachments

- Backend:
  - `backend/src/routes/sheets.js`
  - `backend/src/routes/upload.js`
  - `backend/src/lib/storage.js`
  - `backend/src/lib/deleteUserAccount.js`
- Frontend:
  - `frontend/studyhub-app/src/pages/sheets/SheetsPage.jsx`
  - `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`
  - `frontend/studyhub-app/src/pages/sheets/UploadSheetPage.jsx`

### Admin and live-refresh behavior

- Backend:
  - `backend/src/routes/admin.js`
  - `backend/src/routes/announcements.js`
- Frontend:
  - `frontend/studyhub-app/src/pages/admin/AdminPage.jsx`
  - `frontend/studyhub-app/src/pages/profile/UserProfilePage.jsx` (personal overview at `/users/:username`; `/dashboard` redirects here via `DashboardRedirect` in `App.jsx`)
  - `frontend/studyhub-app/src/pages/dashboard/DashboardWidgets.jsx` (widget library consumed by `UserProfilePage.jsx`)
  - `frontend/studyhub-app/src/lib/useLivePolling.js`

### Deployment, runtime, and testing

- Runtime:
  - `backend/src/index.js`
  - `backend/src/lib/prisma.js`
  - `backend/src/lib/bootstrap.js`
  - `backend/src/lib/runtimePaths.js`
- Deployment:
  - `docker-compose.yml`
  - `backend/Dockerfile`
  - `frontend/studyhub-app/Dockerfile`
  - `backend/railway.toml`
  - `frontend/studyhub-app/railway.toml`
  - `docs/internal/railway-deployment-checklist.md`
- Tests and traffic:
  - `backend/scripts/smokeRoutes.js`
  - `backend/scripts/loadTraffic.js`
  - `backend/scripts/seedAdmin.js`

## References

- `references/architecture.md` for domain model, app flows, and security boundaries
- `references/repo-map.md` for file-level navigation and where to make changes
