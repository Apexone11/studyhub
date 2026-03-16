# StudyHub Repo Map

## Root

- `README.md` - public project overview
- `docker-compose.yml` - local dev stack
- `docs/railway-deployment-checklist.md` - hosted deployment notes

## Backend

### App entry and middleware

- `backend/src/index.js` - Express app assembly, CORS, origin checks, CSRF, routes, health
- `backend/src/middleware/auth.js` - auth guards and current-user extraction
- `backend/src/middleware/csrf.js` - CSRF enforcement for cookie-authenticated mutations

### Core helpers

- `backend/src/lib/prisma.js` - Prisma singleton and optional extensions
- `backend/src/lib/storage.js` - upload path resolution, cleanup, and safety checks
- `backend/src/lib/email.js` - mail sending and templates
- `backend/src/lib/verificationCodes.js` - secure code generation and hashing
- `backend/src/lib/notify.js` - notification helpers
- `backend/src/lib/mentions.js` - `@mention` parsing and notification creation
- `backend/src/lib/deleteUserAccount.js` - account cleanup across related content
- `backend/src/lib/bootstrap.js` - startup bootstrap tasks

### Route groups

- `backend/src/routes/auth.js` - register, login, logout, password reset, 2FA
- `backend/src/routes/settings.js` - account settings, email verification, 2FA toggles, delete account
- `backend/src/routes/feed.js` - feed listing, posts, comments, reactions, attachments
- `backend/src/routes/sheets.js` - sheet listing, create, edit, fork, contributions, comments, downloads
- `backend/src/routes/upload.js` - avatar, sheet attachment, and feed attachment upload endpoints
- `backend/src/routes/notifications.js` - notification read and delete flows
- `backend/src/routes/admin.js` - admin stats, announcements, moderation, deletion reasons
- `backend/src/routes/announcements.js` - public and admin announcement actions
- `backend/src/routes/courses.js` - schools, course recommendations, course requests
- `backend/src/routes/users.js` - public profile and follow actions
- `backend/src/routes/notes.js` - user notes

### Data and scripts

- `backend/prisma/schema.prisma` - source of truth for models
- `backend/prisma/migrations/` - migration history
- `backend/prisma/seed.js` - local seed data
- `backend/scripts/smokeRoutes.js` - smoke suite
- `backend/scripts/loadTraffic.js` - mixed traffic and burst test runner
- `backend/scripts/seedAdmin.js` - admin bootstrap

## Frontend

### App shell and routing

- `frontend/studyhub-app/src/App.jsx` - route tree and auth guards
- `frontend/studyhub-app/src/components/Navbar.jsx` - top nav and notifications
- `frontend/studyhub-app/src/components/AppSidebar.jsx` - app navigation shell

### Session and network helpers

- `frontend/studyhub-app/src/lib/http.js` - fetch wrapper, CSRF header, runtime API URL handling
- `frontend/studyhub-app/src/lib/session.js` - user and session storage helpers
- `frontend/studyhub-app/src/lib/protectedSession.js` - protected session helpers
- `frontend/studyhub-app/src/lib/useProtectedPage.js` - guard hook for authenticated pages
- `frontend/studyhub-app/src/lib/useLivePolling.js` - live refresh polling helper

### Main pages

- `frontend/studyhub-app/src/pages/HomePage.jsx` - marketing and landing page
- `frontend/studyhub-app/src/pages/LoginPage.jsx` - login and 2FA entry
- `frontend/studyhub-app/src/pages/RegisterScreen.jsx` - registration flow
- `frontend/studyhub-app/src/pages/DashboardPage.jsx` - student dashboard
- `frontend/studyhub-app/src/pages/FeedPage.jsx` - feed posts and reactions
- `frontend/studyhub-app/src/pages/SheetsPage.jsx` - sheet directory and browse
- `frontend/studyhub-app/src/pages/SheetViewerPage.jsx` - sheet detail, downloads, fork and contribution review
- `frontend/studyhub-app/src/pages/SettingsPage.jsx` - account settings and verified-email flows
- `frontend/studyhub-app/src/pages/UserProfilePage.jsx` - public profile
- `frontend/studyhub-app/src/pages/PlaceholderPages.jsx` - admin, uploads, tests, notes, announcements, and submit placeholders

### Build and deploy

- `frontend/studyhub-app/vite.config.js` - Vite config and bundle analysis mode
- `frontend/studyhub-app/Dockerfile` - production container build
- `frontend/studyhub-app/scripts/start.js` - runtime frontend server
- `frontend/studyhub-app/public/runtime-config.js` - runtime frontend config injection

## Safe edit checklist

- If a feature spans browser behavior and API enforcement, inspect both sides before editing.
- If uploads or downloads are involved, inspect `storage.js`, the route, and the consuming page together.
- If a schema field changes, check `schema.prisma`, migrations, backend reads and writes, and frontend UI assumptions.
- If a polling issue appears, inspect `useLivePolling.js` and the page-specific `refreshKey`, `enabled`, and `intervalMs` usage.
